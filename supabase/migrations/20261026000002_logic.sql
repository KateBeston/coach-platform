-- Automation: sign-up defaults, invoice numbering and totals, client timeline,
-- standing bookings, "needs booking" detection, and the public booking page.
-- Function bodies match the live database (coach-platform, ap-southeast-2).

-- ---------- Sign-up -> coach profile + sensible defaults ----------
create or replace function public.handle_new_coach()
returns trigger language plpgsql security definer set search_path = '' as $$
declare base text; slug text;
begin
  base := regexp_replace(lower(split_part(coalesce(new.email,'coach'), '@', 1)), '[^a-z0-9]+', '-', 'g');
  slug := base || '-' || substr(md5(new.id::text), 1, 4);
  insert into public.coaches (id, email, display_name, booking_slug)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', ''), slug);
  insert into public.calendars (coach_id, name, kind, colour, blocks_availability, is_booking_destination)
  values (new.id, 'Coaching', 'work', '#4F6D5C', true, true),
         (new.id, 'Personal', 'personal', '#B07A5A', true, false);
  insert into public.availability_rules (coach_id, weekday, start_time, end_time)
  select new.id, d, '09:00', '17:00' from generate_series(1,5) d;
  insert into public.offers (coach_id, name, kind, session_count, session_minutes, price_cents, billing, is_public)
  values (new.id, 'Discovery call', 'discovery', 1, 30, 0, 'free', true),
         (new.id, 'Single session', 'single', 1, 60, 20000, 'upfront', true);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_coach();

-- ---------- Invoices ----------
create or replace function public.assign_invoice_number()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n int; p text;
begin
  if new.number is null or new.number = '' then
    update public.coaches set invoice_seq = invoice_seq + 1 where id = new.coach_id
      returning invoice_seq, invoice_prefix into n, p;
    new.number := p || lpad(n::text, 4, '0');
  end if;
  return new;
end $$;
create trigger invoices_number before insert on public.invoices for each row execute function public.assign_invoice_number();

create or replace function public.recalc_invoice(p_invoice uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare sub int; rate numeric; gst boolean;
begin
  select coalesce(round(sum(quantity * unit_cents)),0)::int into sub from public.invoice_items where invoice_id = p_invoice;
  select c.gst_registered, c.gst_rate into gst, rate
    from public.invoices i join public.coaches c on c.id = i.coach_id where i.id = p_invoice;
  update public.invoices
    set subtotal_cents = sub,
        tax_cents = case when gst then round(sub * rate / 100)::int else 0 end,
        total_cents = sub + case when gst then round(sub * rate / 100)::int else 0 end
    where id = p_invoice;
end $$;

create or replace function public.invoice_items_changed()
returns trigger language plpgsql set search_path = '' as $$
begin perform public.recalc_invoice(coalesce(new.invoice_id, old.invoice_id)); return null; end $$;
create trigger invoice_items_recalc after insert or update or delete on public.invoice_items
for each row execute function public.invoice_items_changed();

-- ---------- Client timeline ----------
create or replace function public.log_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare msg text; k text; cid uuid; tz text; j jsonb; o jsonb;
begin
  select timezone into tz from public.coaches where id = new.coach_id;
  tz := coalesce(tz, 'Australia/Brisbane');
  j := to_jsonb(new);
  o := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;

  if tg_table_name = 'clients' then
    k := 'client'; cid := new.id;
    if tg_op = 'INSERT' then msg := 'Added as ' || (j->>'status');
    elsif j->>'status' is distinct from o->>'status' then msg := 'Status changed to ' || (j->>'status'); end if;
  elsif tg_table_name = 'sessions' then
    k := 'session'; cid := (j->>'client_id')::uuid;
    if tg_op = 'INSERT' then
      msg := 'Session booked for ' || to_char((j->>'starts_at')::timestamptz at time zone tz, 'Dy DD Mon, HH12:MI am')
             || case j->>'booked_by' when 'client' then ' (booked by client)' when 'auto' then ' (standing booking)' else '' end;
    elsif j->>'status' is distinct from o->>'status' then
      msg := 'Session on ' || to_char((j->>'starts_at')::timestamptz at time zone tz, 'DD Mon') || ' marked ' || replace(j->>'status', '_', ' ');
    elsif j->>'starts_at' is distinct from o->>'starts_at' then
      msg := 'Session moved to ' || to_char((j->>'starts_at')::timestamptz at time zone tz, 'Dy DD Mon, HH12:MI am');
    end if;
  elsif tg_table_name = 'notes' then
    k := 'note'; cid := (j->>'client_id')::uuid;
    if tg_op = 'INSERT' then msg := 'Note added'; end if;
  elsif tg_table_name = 'arrangements' then
    k := 'arrangement'; cid := (j->>'client_id')::uuid;
    if tg_op = 'INSERT' then msg := 'Arrangement started: ' || replace(j->>'cadence', '_', ' ');
    elsif j->>'status' is distinct from o->>'status' then msg := 'Arrangement ' || (j->>'status'); end if;
  elsif tg_table_name = 'invoices' then
    k := 'invoice'; cid := (j->>'client_id')::uuid;
    if tg_op = 'INSERT' then msg := 'Invoice ' || coalesce(j->>'number', '') || ' created';
    elsif j->>'status' is distinct from o->>'status' then msg := 'Invoice ' || coalesce(j->>'number', '') || ' ' || (j->>'status'); end if;
  elsif tg_table_name = 'goals' then
    k := 'goal'; cid := (j->>'client_id')::uuid;
    if tg_op = 'INSERT' then msg := 'Goal set: ' || (j->>'title');
    elsif j->>'status' is distinct from o->>'status' then msg := 'Goal ' || (j->>'status') || ': ' || (j->>'title'); end if;
  end if;

  if msg is not null then
    insert into public.activity (coach_id, client_id, kind, summary, ref_table, ref_id)
    values (new.coach_id, cid, k, msg, tg_table_name, new.id);
  end if;
  return new;
end $$;

create trigger clients_activity after insert or update on public.clients for each row execute function public.log_activity();
create trigger sessions_activity after insert or update on public.sessions for each row execute function public.log_activity();
create trigger notes_activity after insert on public.notes for each row execute function public.log_activity();
create trigger arrangements_activity after insert or update on public.arrangements for each row execute function public.log_activity();
create trigger invoices_activity after insert or update on public.invoices for each row execute function public.log_activity();
create trigger goals_activity after insert or update on public.goals for each row execute function public.log_activity();

-- A paid booking turns a lead into an active client
create or replace function public.activate_client_on_session()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.clients set status = 'active'
    where id = new.client_id and status in ('lead','alumni')
      and exists (select 1 from public.offers o where o.id = new.offer_id and o.kind <> 'discovery');
  return new;
end $$;
create trigger sessions_activate_client after insert on public.sessions for each row execute function public.activate_client_on_session();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at := now(); return new; end $$;
create trigger notes_touch before update on public.notes for each row execute function public.touch_updated_at();

-- ---------- Arrangement overview: who needs booking ----------
create or replace view public.arrangement_overview with (security_invoker = on) as
select
  a.*, c.first_name, c.last_name, c.email as client_email,
  coalesce(s.used, 0) as sessions_used,
  coalesce(s.upcoming, 0) as sessions_upcoming,
  s.next_session_at, s.last_session_at,
  case when a.sessions_total is null then null
       else greatest(a.sessions_total - coalesce(s.used,0) - coalesce(s.upcoming,0), 0) end as sessions_unbooked,
  case when a.sessions_total is null then null
       else greatest(a.sessions_total - coalesce(s.used,0), 0) end as sessions_remaining,
  (a.status = 'active'
    and (a.paused_until is null or a.paused_until < current_date)
    and (a.end_date is null or a.end_date >= current_date)
    and case a.cadence
      when 'weekly'      then s.next_session_at is null or s.next_session_at > now() + interval '7 days'
      when 'fortnightly' then s.next_session_at is null or s.next_session_at > now() + interval '14 days'
      when 'monthly'     then s.next_session_at is null or s.next_session_at > now() + interval '31 days'
      when 'package'     then s.next_session_at is null and (a.sessions_total is null or a.sessions_total - coalesce(s.used,0) > 0)
      else false end) as needs_booking,
  (a.status = 'active' and a.sessions_total is not null and a.sessions_total - coalesce(s.used,0) <= 2) as ending_soon
from public.arrangements a
join public.clients c on c.id = a.client_id
left join lateral (
  select
    count(*) filter (where x.status in ('completed','late_cancel','no_show')) as used,
    count(*) filter (where x.status = 'scheduled' and x.starts_at >= now()) as upcoming,
    min(x.starts_at) filter (where x.status = 'scheduled' and x.starts_at >= now()) as next_session_at,
    max(x.starts_at) filter (where x.status = 'completed') as last_session_at
  from public.sessions x where x.arrangement_id = a.id
) s on true;
