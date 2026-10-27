-- Automatic reminders and emails.
--
-- Emails are queued in email_outbox by triggers (booking confirmed, moved, cancelled) and by a
-- job that runs every 10 minutes (session reminders, a daily "not booked yet" nudge to coaches).
-- The same job writes each email and sends it through Resend from inside the database, using an
-- API key kept in Supabase Vault (name: resend_api_key). Nothing sends until that key exists;
-- emails wait in the queue and show as "waiting for email set-up".

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── settings ──────────────────────────────────────────────────────────────
alter table public.coaches
  add column if not exists email_confirmations boolean not null default true,
  add column if not exists email_reminders boolean not null default true,
  add column if not exists reminder_hours int not null default 24 check (reminder_hours between 1 and 168),
  add column if not exists email_nudges boolean not null default true,
  add column if not exists email_reply_to text,
  add column if not exists email_signoff text;

alter table public.clients add column if not exists email_reminders boolean not null default true;

-- ── outbox ────────────────────────────────────────────────────────────────
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete cascade,
  kind text not null check (kind in ('booking_confirmed','session_moved','session_cancelled','session_reminder','coach_nudge','test')),
  to_email text not null,
  to_name text,
  session_id uuid references public.sessions(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  member_id uuid references public.team_members(id) on delete set null,
  payload jsonb not null default '{}',
  dedupe_key text unique,
  status text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
  status_note text,
  attempts int not null default 0,
  subject text,
  body_text text,
  request_id bigint,
  send_after timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index email_outbox_due on public.email_outbox (status, send_after);
create index email_outbox_coach on public.email_outbox (coach_id, created_at desc);
alter table public.email_outbox enable row level security;
create policy email_outbox_managers on public.email_outbox for select to authenticated
  using (coach_id = (select public.my_business()) and (select public.is_manager()));

-- ── helpers ───────────────────────────────────────────────────────────────
create or replace function public.html_escape(t text)
returns text language sql immutable set search_path = '' as $$
  select replace(replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
$$;

create or replace function public.session_when(p_at timestamptz, p_tz text)
returns text language sql stable set search_path = '' as $$
  select trim(to_char(p_at at time zone p_tz, 'FMDay FMDD FMMonth')) || ' at ' ||
         lower(trim(to_char(p_at at time zone p_tz, 'FMHH12:MI am'))) ||
         ' (' || replace(p_tz, '_', ' ') || ' time)';
$$;

-- ── queueing from session changes ─────────────────────────────────────────
create or replace function public.queue_session_emails()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.coaches; cl public.clients; k text;
begin
  select * into c from public.coaches where id = new.coach_id;
  select * into cl from public.clients where id = new.client_id;
  if cl.email is null or not cl.email_reminders or not c.email_confirmations then return new; end if;

  if tg_op = 'INSERT' then
    if new.status <> 'scheduled' or new.starts_at <= now() or new.booked_by = 'auto' then return new; end if;
    k := 'booking_confirmed';
  elsif new.status = 'cancelled' and old.status = 'scheduled' and new.starts_at > now() then
    k := 'session_cancelled';
  elsif new.status = 'scheduled' and new.starts_at is distinct from old.starts_at and new.starts_at > now() then
    k := 'session_moved';
  else
    return new;
  end if;

  insert into public.email_outbox (coach_id, kind, to_email, to_name, session_id, client_id, dedupe_key, payload)
  values (new.coach_id, k, cl.email, cl.first_name, new.id, new.client_id,
          k || ':' || new.id || ':' || extract(epoch from new.starts_at)::bigint || ':' || new.status,
          jsonb_build_object('old_starts_at', case when tg_op = 'UPDATE' then old.starts_at end))
  on conflict (dedupe_key) do nothing;
  return new;
end $$;
revoke execute on function public.queue_session_emails() from public, anon, authenticated;
create trigger sessions_queue_emails after insert or update of status, starts_at on public.sessions
  for each row execute function public.queue_session_emails();

-- ── reminders and nudges (run by the job) ─────────────────────────────────
create or replace function public.queue_reminders()
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.email_outbox (coach_id, kind, to_email, to_name, session_id, client_id, dedupe_key)
  select s.coach_id, 'session_reminder', cl.email, cl.first_name, s.id, s.client_id,
         'session_reminder:' || s.id || ':' || extract(epoch from s.starts_at)::bigint
    from public.sessions s
    join public.coaches c on c.id = s.coach_id
    join public.clients cl on cl.id = s.client_id
   where s.status = 'scheduled'
     and c.email_reminders and cl.email_reminders and cl.email is not null
     and s.starts_at > now() + interval '30 minutes'
     and s.starts_at <= now() + make_interval(hours => c.reminder_hours)
     -- Booked moments ago? The confirmation already covers it.
     and s.created_at < now() - interval '2 hours'
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Once a day, at or after 8am in the coach's time zone, each practitioner hears about
-- ongoing clients who have nothing booked.
create or replace function public.queue_nudges()
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.email_outbox (coach_id, kind, to_email, to_name, member_id, dedupe_key, payload)
  select c.id, 'coach_nudge', m.email, m.name, m.id,
         'coach_nudge:' || m.id || ':' || (now() at time zone c.timezone)::date,
         jsonb_build_object('clients', jsonb_agg(jsonb_build_object(
           'name', trim(a.first_name || ' ' || coalesce(a.last_name, '')),
           'cadence', a.cadence,
           'client_id', a.client_id,
           'last', a.last_session_at) order by a.first_name))
    from public.arrangement_overview a
    join public.coaches c on c.id = a.coach_id
    join public.team_members m on m.id = coalesce(a.practitioner_id,
           (select o.id from public.team_members o where o.coach_id = c.id and o.role = 'owner' order by o.created_at limit 1))
   where a.needs_booking and c.email_nudges and m.active and m.email is not null
     and extract(hour from now() at time zone c.timezone) >= 8
   group by c.id, c.timezone, m.id, m.email, m.name
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- ── writing an email ──────────────────────────────────────────────────────
create or replace function public.render_email(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  e public.email_outbox; c public.coaches; s public.sessions; o public.offers; p public.team_members;
  biz text; who text; when_txt text; old_when text; what text; place text; book_url text; app_url text;
  subject text; lines text[]; html_lines text[]; signoff text; item jsonb;
begin
  select * into e from public.email_outbox where id = p_id;
  select * into c from public.coaches where id = e.coach_id;
  biz := coalesce(nullif(c.business_name, ''), nullif(c.display_name, ''), 'Your coach');
  signoff := coalesce(nullif(c.email_signoff, ''), biz);
  app_url := coalesce((select setting_value from public.platform_settings where setting_group = 'Email' and setting_key = 'app_url'),
                      'https://coach-platform-flax.vercel.app');
  book_url := case when c.booking_slug is not null and c.booking_enabled then app_url || '/book/' || c.booking_slug end;
  who := coalesce(nullif(e.to_name, ''), 'there');

  if e.session_id is not null then
    select * into s from public.sessions where id = e.session_id;
    select * into o from public.offers where id = s.offer_id;
    select * into p from public.team_members where id = s.practitioner_id;
    when_txt := public.session_when(s.starts_at, c.timezone);
    what := coalesce(o.name, 'Your session') || case when p.name is not null and (select count(*) from public.team_members t where t.coach_id = c.id and t.active) > 1 then ' with ' || p.name else '' end;
    place := case s.location_type
               when 'video' then coalesce('Join here: ' || coalesce(s.meeting_url, c.default_meeting_url), 'Online — the link will follow')
               when 'phone' then 'By phone'
               else 'In person' || coalesce(' — ' || s.location_detail, '') end;
  end if;

  if e.kind = 'booking_confirmed' then
    subject := 'You''re booked in: ' || when_txt;
    lines := array['Hi ' || who || ',', '', 'You''re booked in. Here are the details:', '',
                   what, when_txt, place, '',
                   'Need to change it? Just reply to this email.', '', signoff];
  elsif e.kind = 'session_moved' then
    old_when := public.session_when((e.payload->>'old_starts_at')::timestamptz, c.timezone);
    subject := 'Your session has moved to ' || when_txt;
    lines := array['Hi ' || who || ',', '', 'Your session has moved.', '',
                   what, 'New time: ' || when_txt, 'Was: ' || old_when, place, '',
                   'If the new time doesn''t suit, just reply to this email.', '', signoff];
  elsif e.kind = 'session_cancelled' then
    subject := 'Your session on ' || when_txt || ' is cancelled';
    lines := array['Hi ' || who || ',', '', 'Your session on ' || when_txt || ' has been cancelled.', ''] ||
             case when book_url is not null then array['You can book a new time here: ' || book_url, ''] else array[]::text[] end ||
             array['Any questions, just reply to this email.', '', signoff];
  elsif e.kind = 'session_reminder' then
    subject := 'Reminder: ' || when_txt;
    lines := array['Hi ' || who || ',', '', 'Just a reminder about your upcoming session:', '',
                   what, when_txt, place, '',
                   'Need to change it? Just reply to this email.', '', signoff];
  elsif e.kind = 'coach_nudge' then
    subject := jsonb_array_length(e.payload->'clients') || ' ongoing ' ||
               case when jsonb_array_length(e.payload->'clients') = 1 then 'client has' else 'clients have' end || ' nothing booked';
    lines := array['Hi ' || who || ',', '', 'These ongoing clients don''t have their next session booked yet:', ''];
    for item in select * from jsonb_array_elements(e.payload->'clients') loop
      lines := lines || ('• ' || (item->>'name') || ' (' || replace(item->>'cadence', '_', ' ') || ')' ||
                         coalesce(', last seen ' || to_char((item->>'last')::timestamptz at time zone c.timezone, 'FMDD FMMon'), ''));
    end loop;
    lines := lines || array['', 'Book them in: ' || app_url || '/clients', '', '— Your coaching platform'];
  else
    subject := 'Test email from ' || biz;
    lines := array['Hi ' || who || ',', '', 'This is a test. Reminders and booking emails from ' || biz || ' will look like this.', '', signoff];
  end if;

  select array_agg(case when l = '' then '<br>' when l ~ '^https?://' or l ~ ': https?://'
                        then regexp_replace(public.html_escape(l), '(https?://[^ <]+)', '<a href="\1" style="color:#2f6f68">\1</a>', 'g')
                        else public.html_escape(l) end)
    into html_lines from unnest(lines) l;

  return jsonb_build_object(
    'subject', subject,
    'text', array_to_string(lines, E'\n'),
    'html', '<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f3a3d;max-width:560px">'
            || array_to_string(array(select case when h = '<br>' then '<div style="height:12px"></div>' else '<div>' || h || '</div>' end from unnest(html_lines) h), '')
            || '</div>',
    'from_name', case when e.kind = 'coach_nudge' then 'Coaching platform' else biz end,
    'reply_to', case when e.kind = 'coach_nudge' then null else coalesce(nullif(c.email_reply_to, ''), c.email) end);
end $$;

-- ── sending ───────────────────────────────────────────────────────────────
create or replace function public.send_due_emails(p_limit int default 50)
returns int language plpgsql security definer set search_path = '' as $$
declare
  key text; sender text; e public.email_outbox; r jsonb; s public.sessions; sent int := 0; rid bigint;
begin
  select decrypted_secret into key from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  sender := coalesce((select setting_value from public.platform_settings where setting_group = 'Email' and setting_key = 'from_address'),
                     'onboarding@resend.dev');

  for e in select * from public.email_outbox where status = 'queued' and send_after <= now() order by created_at limit p_limit for update skip locked loop
    -- Don't remind or confirm about a session that has already started or been cancelled.
    if e.session_id is not null and e.kind in ('booking_confirmed','session_reminder','session_moved') then
      select * into s from public.sessions where id = e.session_id;
      if s.id is null or s.status <> 'scheduled' or s.starts_at <= now() then
        update public.email_outbox set status = 'skipped', status_note = 'Session changed or already started' where id = e.id;
        continue;
      end if;
    end if;

    r := public.render_email(e.id);
    update public.email_outbox set subject = r->>'subject', body_text = r->>'text' where id = e.id;

    if key is null then
      update public.email_outbox set status_note = 'Waiting for email set-up' where id = e.id;
      continue;
    end if;

    select net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || key, 'Content-Type', 'application/json'),
      body := jsonb_strip_nulls(jsonb_build_object(
        'from', (r->>'from_name') || ' <' || sender || '>',
        'to', jsonb_build_array(e.to_email),
        'reply_to', r->>'reply_to',
        'subject', r->>'subject',
        'text', r->>'text',
        'html', r->>'html'))
    ) into rid;

    update public.email_outbox set status = 'sent', sent_at = now(), request_id = rid, attempts = attempts + 1, status_note = null where id = e.id;
    sent := sent + 1;
  end loop;
  return sent;
end $$;

-- Check what Resend said about recent sends and mark any that were refused.
create or replace function public.check_email_results()
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.email_outbox o
     set status = 'failed',
         status_note = left(coalesce(r.content::text, r.error_msg, 'Refused'), 300)
    from net._http_response r
   where o.request_id = r.id and o.status = 'sent' and o.sent_at > now() - interval '1 day'
     and (r.status_code is null or r.status_code >= 300) and r.created is not null;
end $$;

revoke execute on function public.queue_reminders(), public.queue_nudges(), public.render_email(uuid), public.send_due_emails(int),
  public.check_email_results() from public, anon, authenticated;

-- A coach can preview what an email in their own outbox says, and send themselves a test.
create or replace function public.preview_email(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.email_outbox where id = p_id and coach_id = public.my_business()) or not public.is_manager() then
    return null;
  end if;
  return public.render_email(p_id);
end $$;

-- A test always goes to the person asking, so this can't be used to email anyone else.
create or replace function public.queue_test_email()
returns uuid language plpgsql security definer set search_path = '' as $$
declare eid uuid; m public.team_members;
begin
  if not public.is_manager() then raise exception 'Only owners and managers can send a test.'; end if;
  select * into m from public.team_members where id = public.my_member();
  insert into public.email_outbox (coach_id, kind, to_email, to_name)
  values (public.my_business(), 'test',
          coalesce((select email from auth.users where id = auth.uid()), m.email), m.name)
  returning id into eid;
  return eid;
end $$;
revoke execute on function public.preview_email(uuid), public.queue_test_email() from public, anon;
grant execute on function public.preview_email(uuid), public.queue_test_email() to authenticated;

-- The job: top up standing bookings for every business, queue, check results, send.
-- (Standing bookings are wrapped so a failure there never stops emails.)
create or replace function public.messaging_tick()
returns void language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform public.extend_standing_bookings(a.id, 8) from public.arrangements a where a.status = 'active' and a.auto_book;
  exception when others then null;
  end;
  perform public.queue_reminders();
  perform public.queue_nudges();
  perform public.check_email_results();
  perform public.send_due_emails(50);
end $$;
revoke execute on function public.messaging_tick() from public, anon, authenticated;

select cron.schedule('messaging-tick', '*/10 * * * *', $$select public.messaging_tick()$$);

-- A client only hears what they need to. Anything still waiting about a session is dropped when it
-- changes; if a one-off booking's confirmation hadn't gone yet, a move becomes one confirmation with
-- the new time and a cancellation sends nothing. Standing bookings are known to the client, so a
-- move or cancellation is always sent for those.
create or replace function public.queue_session_emails()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.coaches; cl public.clients; k text; told boolean;
begin
  select * into c from public.coaches where id = new.coach_id;
  select * into cl from public.clients where id = new.client_id;

  if tg_op = 'INSERT' then
    if new.status <> 'scheduled' or new.starts_at <= now() or new.booked_by = 'auto' then return new; end if;
    k := 'booking_confirmed';
  elsif new.status = 'cancelled' and old.status = 'scheduled' and new.starts_at > now() then
    k := 'session_cancelled';
  elsif new.status = 'scheduled' and new.starts_at is distinct from old.starts_at and new.starts_at > now() then
    k := 'session_moved';
  else
    return new;
  end if;

  if tg_op = 'UPDATE' then
    told := old.booked_by = 'auto'
         or exists (select 1 from public.email_outbox where session_id = new.id and status = 'sent' and kind <> 'coach_nudge');
    update public.email_outbox set status = 'skipped', status_note = 'Superseded by a later change'
     where session_id = new.id and status = 'queued' and kind in ('booking_confirmed','session_moved','session_reminder');
    if not told then
      if k = 'session_cancelled' then return new; end if;
      k := 'booking_confirmed';
    end if;
  end if;

  if cl.email is null or not cl.email_reminders or not c.email_confirmations then return new; end if;

  insert into public.email_outbox (coach_id, kind, to_email, to_name, session_id, client_id, dedupe_key, payload)
  values (new.coach_id, k, cl.email, cl.first_name, new.id, new.client_id,
          k || ':' || new.id || ':' || extract(epoch from new.starts_at)::bigint || ':' || new.status,
          jsonb_build_object('old_starts_at', case when tg_op = 'UPDATE' then old.starts_at end))
  on conflict (dedupe_key) do nothing;
  return new;
end $$;
