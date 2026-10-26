-- Standing bookings and the public booking page.

-- Books an arrangement's regular slot ahead, skipping clashes, blocked time and pauses.
create or replace function public.extend_standing_bookings(p_arrangement uuid, p_weeks int default 8)
returns int language plpgsql security invoker set search_path = '' as $$
declare
  a record; tz text; meeting text; buffer int;
  step int; d date; first_d date; slot_start timestamptz; slot_end timestamptz;
  created int := 0; existing int; horizon date;
begin
  select * into a from public.arrangements where id = p_arrangement;
  if a is null or a.status <> 'active' or not a.auto_book
     or a.cadence not in ('weekly','fortnightly','monthly')
     or a.preferred_weekday is null or a.preferred_time is null then
    return 0;
  end if;
  select timezone, default_meeting_url, session_buffer_minutes into tz, meeting, buffer from public.coaches where id = a.coach_id;

  step := case a.cadence when 'weekly' then 7 when 'fortnightly' then 14 else 28 end;
  horizon := (now() at time zone tz)::date + p_weeks * 7;
  if a.end_date is not null and a.end_date < horizon then horizon := a.end_date; end if;

  first_d := a.start_date + ((a.preferred_weekday - extract(dow from a.start_date)::int + 7) % 7);
  d := first_d;
  while d < (now() at time zone tz)::date loop d := d + step; end loop;

  while d <= horizon loop
    if a.paused_until is null or d > a.paused_until then
      slot_start := (d + a.preferred_time) at time zone tz;
      slot_end := slot_start + make_interval(mins => a.session_minutes);
      if a.sessions_total is not null then
        select count(*) into existing from public.sessions
          where arrangement_id = a.id and status in ('scheduled','completed','late_cancel','no_show');
        exit when existing >= a.sessions_total;
      end if;
      if slot_start > now()
        and not exists (select 1 from public.sessions s
          where s.coach_id = a.coach_id and s.status in ('scheduled','completed')
            and s.starts_at < slot_end + make_interval(mins => buffer)
            and s.ends_at > slot_start - make_interval(mins => buffer))
        and not exists (select 1 from public.calendar_events e join public.calendars k on k.id = e.calendar_id
          where e.coach_id = a.coach_id and k.blocks_availability and e.starts_at < slot_end and e.ends_at > slot_start)
      then
        insert into public.sessions (coach_id, client_id, arrangement_id, offer_id, starts_at, ends_at, booked_by, meeting_url)
        values (a.coach_id, a.client_id, a.id, a.offer_id, slot_start, slot_end, 'auto', meeting)
        on conflict do nothing;
        if found then created := created + 1; end if;
      end if;
    end if;
    d := d + step;
  end loop;
  return created;
end $$;

create or replace function public.extend_all_standing_bookings(p_weeks int default 8)
returns int language plpgsql security invoker set search_path = '' as $$
declare r record; total int := 0;
begin
  for r in select id from public.arrangements
           where coach_id = auth.uid() and status = 'active' and auto_book and cadence in ('weekly','fortnightly','monthly')
  loop total := total + public.extend_standing_bookings(r.id, p_weeks); end loop;
  return total;
end $$;

-- Free slots for the public booking page (working hours minus sessions, buffers and blocked time).
create or replace function public.public_booking_slots(p_slug text, p_offer uuid, p_from date default null, p_days int default 14)
returns table (slot_start timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare co record; o record; d date; r record; t time; s timestamptz; e timestamptz; start_d date;
begin
  select * into co from public.coaches where booking_slug = p_slug and booking_enabled;
  if co is null then return; end if;
  select * into o from public.offers where id = p_offer and coach_id = co.id and active and is_public;
  if o is null then return; end if;
  start_d := coalesce(p_from, (now() at time zone co.timezone)::date);
  p_days := least(greatest(p_days, 1), 31);

  for d in select generate_series(start_d, start_d + p_days - 1, interval '1 day')::date loop
    if (select count(*) from public.sessions x
        where x.coach_id = co.id and x.status in ('scheduled','completed')
          and (x.starts_at at time zone co.timezone)::date = d) >= co.max_sessions_per_day then
      continue;
    end if;
    for r in select * from public.availability_rules where coach_id = co.id and weekday = extract(dow from d) order by start_time loop
      t := r.start_time;
      while t + make_interval(mins => o.session_minutes) <= r.end_time loop
        s := (d + t) at time zone co.timezone;
        e := s + make_interval(mins => o.session_minutes);
        if s >= now() + make_interval(hours => co.booking_min_notice_hours)
           and s <= now() + make_interval(days => co.booking_window_days)
           and not exists (select 1 from public.sessions x
             where x.coach_id = co.id and x.status in ('scheduled','completed')
               and x.starts_at < e + make_interval(mins => co.session_buffer_minutes)
               and x.ends_at > s - make_interval(mins => co.session_buffer_minutes))
           and not exists (select 1 from public.calendar_events ev join public.calendars k on k.id = ev.calendar_id
             where ev.coach_id = co.id and k.blocks_availability and ev.starts_at < e and ev.ends_at > s)
        then
          slot_start := s;
          return next;
        end if;
        t := t + interval '30 minutes';
      end loop;
    end loop;
  end loop;
end $$;

create or replace function public.public_coach_profile(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'display_name', c.display_name, 'business_name', c.business_name, 'timezone', c.timezone, 'currency', c.currency,
    'offers', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'description', o.description, 'kind', o.kind,
        'session_minutes', o.session_minutes, 'price_cents', o.price_cents) order by o.price_cents)
      from public.offers o where o.coach_id = c.id and o.active and o.is_public), '[]'::jsonb))
  from public.coaches c where c.booking_slug = p_slug and c.booking_enabled;
$$;

create or replace function public.public_book_session(
  p_slug text, p_offer uuid, p_starts_at timestamptz,
  p_first_name text, p_last_name text, p_email text, p_phone text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare co record; o record; cid uuid; sid uuid; d date;
begin
  if coalesce(trim(p_first_name),'') = '' or coalesce(trim(p_email),'') = '' or position('@' in p_email) = 0 then
    raise exception 'Please enter your name and a valid email.';
  end if;
  select * into co from public.coaches where booking_slug = p_slug and booking_enabled;
  if co is null then raise exception 'Booking page not found.'; end if;
  select * into o from public.offers where id = p_offer and coach_id = co.id and active and is_public;
  if o is null then raise exception 'That session type is not available.'; end if;

  d := (p_starts_at at time zone co.timezone)::date;
  if not exists (select 1 from public.public_booking_slots(p_slug, p_offer, d, 1) x where x.slot_start = p_starts_at) then
    raise exception 'Sorry, that time is no longer available. Please choose another.';
  end if;

  select id into cid from public.clients where coach_id = co.id and lower(email) = lower(trim(p_email));
  if cid is null then
    insert into public.clients (coach_id, first_name, last_name, email, phone, status, source)
    values (co.id, trim(p_first_name), coalesce(trim(p_last_name),''), lower(trim(p_email)), p_phone, 'lead', 'Booking page')
    returning id into cid;
  end if;

  insert into public.sessions (coach_id, client_id, offer_id, starts_at, ends_at, booked_by, meeting_url)
  values (co.id, cid, o.id, p_starts_at, p_starts_at + make_interval(mins => o.session_minutes), 'client', co.default_meeting_url)
  returning id into sid;

  return jsonb_build_object('session_id', sid, 'starts_at', p_starts_at, 'offer', o.name, 'meeting_url', co.default_meeting_url);
end $$;

-- Who can call what
revoke all on function public.public_booking_slots(text, uuid, date, int) from public;
revoke all on function public.public_coach_profile(text) from public;
revoke all on function public.public_book_session(text, uuid, timestamptz, text, text, text, text) from public;
grant execute on function public.public_booking_slots(text, uuid, date, int) to anon, authenticated;
grant execute on function public.public_coach_profile(text) to anon, authenticated;
grant execute on function public.public_book_session(text, uuid, timestamptz, text, text, text, text) to anon, authenticated;

revoke execute on function public.handle_new_coach() from public, anon, authenticated;
revoke execute on function public.log_activity() from public, anon, authenticated;
revoke execute on function public.assign_invoice_number() from public, anon, authenticated;
revoke execute on function public.activate_client_on_session() from public, anon, authenticated;
revoke execute on function public.extend_standing_bookings(uuid, int) from public, anon;
revoke execute on function public.extend_all_standing_bookings(int) from public, anon;
revoke execute on function public.recalc_invoice(uuid) from public, anon;
