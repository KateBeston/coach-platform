-- Coaches choose the wording of their client emails: a preset template, an AI-drafted one they
-- edit, or their own. Wording supports fill-in tags such as {client_first_name} and {session_time}.

create table public.email_templates (
  coach_id uuid not null default public.my_business() references public.coaches(id) on delete cascade,
  kind text not null check (kind in ('booking_confirmed','session_moved','session_cancelled','session_reminder')),
  mode text not null default 'preset' check (mode in ('preset','ai','custom')),
  preset_key text,
  subject text,
  body text not null,
  updated_at timestamptz not null default now(),
  primary key (coach_id, kind)
);
alter table public.email_templates enable row level security;
create policy email_templates_managers on public.email_templates for all to authenticated
  using (coach_id = (select public.my_business()) and (select public.is_manager()))
  with check (coach_id = (select public.my_business()) and (select public.is_manager()));

create or replace function public.render_email(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  e public.email_outbox; c public.coaches; s public.sessions; o public.offers; p public.team_members;
  biz text; who text; when_txt text; old_when text; what text; place text; book_url text; app_url text;
  subject text; lines text[]; html_lines text[]; signoff text; item jsonb; tpl public.email_templates; body text;
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

  if e.payload ? 'old_starts_at' and e.payload->>'old_starts_at' is not null then
    old_when := public.session_when((e.payload->>'old_starts_at')::timestamptz, c.timezone);
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

  -- The coach's own wording, if they've set one for this kind of email.
  if e.kind in ('booking_confirmed','session_moved','session_cancelled','session_reminder') then
    select * into tpl from public.email_templates where coach_id = c.id and kind = e.kind;
    if tpl.coach_id is not null and coalesce(trim(tpl.body), '') <> '' then
      body := tpl.body;
      subject := coalesce(nullif(trim(tpl.subject), ''), subject);
      body := replace(replace(replace(replace(replace(replace(replace(replace(replace(body,
                '{client_first_name}', who), '{session_name}', coalesce(what, '')), '{session_time}', coalesce(when_txt, '')),
                '{old_session_time}', coalesce(old_when, '')), '{location}', coalesce(place, '')), '{booking_link}', coalesce(book_url, '')),
                '{business_name}', biz), '{coach_name}', coalesce(nullif(c.display_name, ''), biz)), '{signoff}', signoff);
      subject := replace(replace(replace(replace(replace(subject,
                '{client_first_name}', who), '{session_name}', coalesce(what, '')), '{session_time}', coalesce(when_txt, '')),
                '{business_name}', biz), '{coach_name}', coalesce(nullif(c.display_name, ''), biz));
      lines := string_to_array(replace(body, E'\r', ''), E'\n');
    end if;
  end if;

  select array_agg(case when trim(coalesce(l, '')) = '' then '<br>' when l ~ 'https?://'
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

revoke execute on function public.render_email(uuid) from public, anon, authenticated;
