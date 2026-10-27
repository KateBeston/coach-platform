-- Teams: owners, managers and practitioners (in-house or subcontracted) in one business.
-- Runs after the internal portal migration (coach-platform-portal/supabase/migrations/20261027000001_internal_portal.sql).
-- Already applied to the live database.

-- ================= TEAM MEMBERS =================
create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text,
  role text not null default 'practitioner' check (role in ('owner','manager','practitioner')),
  employment text not null default 'in_house' check (employment in ('owner','in_house','subcontractor')),
  pay_type text not null default 'none' check (pay_type in ('none','percent','per_session','hourly')),
  pay_rate numeric(10,2) not null default 0,
  colour text not null default '#4F6D5C',
  bookable boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.team_members(coach_id);
create unique index team_members_user_uniq on public.team_members(user_id) where user_id is not null and active;
create unique index team_members_email_uniq on public.team_members(coach_id, lower(email)) where email is not null;

create or replace function public.my_member() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.team_members where user_id = auth.uid() and active limit 1;
$$;
create or replace function public.my_business() returns uuid
language sql stable security definer set search_path = '' as $$
  select coach_id from public.team_members where user_id = auth.uid() and active limit 1;
$$;
create or replace function public.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.team_members where user_id = auth.uid() and active limit 1;
$$;
create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role in ('owner','manager') from public.team_members where user_id = auth.uid() and active limit 1), false);
$$;

-- ================= ASSIGNMENT =================
alter table public.clients add column practitioner_id uuid references public.team_members(id) on delete set null;
alter table public.arrangements add column practitioner_id uuid references public.team_members(id) on delete set null;
alter table public.sessions add column practitioner_id uuid references public.team_members(id) on delete set null;
alter table public.availability_rules add column member_id uuid references public.team_members(id) on delete cascade;
alter table public.calendars add column member_id uuid references public.team_members(id) on delete cascade;
create index on public.clients(practitioner_id);
create index on public.sessions(practitioner_id, starts_at);
create index on public.availability_rules(member_id);

create or replace function public.can_see_client(p_client uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.clients c
    where c.id = p_client and c.coach_id = public.my_business()
      and (public.is_manager() or c.practitioner_id = public.my_member()));
$$;

-- Existing businesses: the owner becomes the first team member and owns everything
insert into public.team_members (coach_id, user_id, name, email, role, employment)
select c.id, c.id, coalesce(nullif(c.display_name,''), split_part(c.email,'@',1), 'Owner'), c.email, 'owner', 'owner'
from public.coaches c;
update public.clients x set practitioner_id = m.id from public.team_members m where m.coach_id = x.coach_id and m.role = 'owner' and x.practitioner_id is null;
update public.arrangements x set practitioner_id = m.id from public.team_members m where m.coach_id = x.coach_id and m.role = 'owner' and x.practitioner_id is null;
update public.sessions x set practitioner_id = m.id from public.team_members m where m.coach_id = x.coach_id and m.role = 'owner' and x.practitioner_id is null;
update public.availability_rules x set member_id = m.id from public.team_members m where m.coach_id = x.coach_id and m.role = 'owner' and x.member_id is null;
update public.calendars x set member_id = m.id from public.team_members m where m.coach_id = x.coach_id and m.role = 'owner' and x.member_id is null;

do $$
declare t text;
begin
  foreach t in array array['availability_rules','calendars','calendar_events','offers','clients','arrangements','sessions','notes','goals','invoices','invoice_items','activity']
  loop
    execute format('alter table public.%I alter column coach_id set default public.my_business()', t);
  end loop;
end $$;
alter table public.team_members alter column coach_id set default public.my_business();
alter table public.clients alter column practitioner_id set default public.my_member();
alter table public.availability_rules alter column member_id set default public.my_member();

create or replace function public.fill_practitioner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.practitioner_id is null then
    if tg_table_name = 'sessions' and new.arrangement_id is not null then
      select practitioner_id into new.practitioner_id from public.arrangements where id = new.arrangement_id;
    end if;
    if new.practitioner_id is null then
      select practitioner_id into new.practitioner_id from public.clients where id = new.client_id;
    end if;
  end if;
  return new;
end $$;
create trigger sessions_fill_practitioner before insert on public.sessions for each row execute function public.fill_practitioner();
create trigger arrangements_fill_practitioner before insert on public.arrangements for each row execute function public.fill_practitioner();
revoke execute on function public.fill_practitioner() from public, anon, authenticated;

-- ================= ACCESS RULES =================
-- Owners and managers see the whole business. Practitioners see only their own clients and sessions.
-- Invoices and money are owners and managers only.
drop policy coach_self_select on public.coaches;
drop policy coach_self_update on public.coaches;
create policy coaches_member_select on public.coaches for select to authenticated using (id = (select public.my_business()));
create policy coaches_manager_update on public.coaches for update to authenticated
  using (id = (select public.my_business()) and (select public.is_manager()))
  with check (id = (select public.my_business()) and (select public.is_manager()));

alter table public.team_members enable row level security;
create policy team_select on public.team_members for select to authenticated using (coach_id = (select public.my_business()));
create policy team_manage on public.team_members for all to authenticated
  using (coach_id = (select public.my_business()) and (select public.is_manager()))
  with check (coach_id = (select public.my_business()) and (select public.is_manager()));

drop policy offers_own on public.offers;
create policy offers_select on public.offers for select to authenticated using (coach_id = (select public.my_business()));
create policy offers_manage on public.offers for all to authenticated
  using (coach_id = (select public.my_business()) and (select public.is_manager()))
  with check (coach_id = (select public.my_business()) and (select public.is_manager()));

drop policy availability_rules_own on public.availability_rules;
create policy availability_select on public.availability_rules for select to authenticated using (coach_id = (select public.my_business()));
create policy availability_manage on public.availability_rules for all to authenticated
  using (coach_id = (select public.my_business()) and ((select public.is_manager()) or member_id = (select public.my_member())))
  with check (coach_id = (select public.my_business()) and ((select public.is_manager()) or member_id = (select public.my_member())));

drop policy calendars_own on public.calendars;
create policy calendars_access on public.calendars for all to authenticated
  using (coach_id = (select public.my_business()) and ((select public.is_manager()) or member_id = (select public.my_member()) or member_id is null))
  with check (coach_id = (select public.my_business()) and ((select public.is_manager()) or member_id = (select public.my_member())));

drop policy calendar_events_own on public.calendar_events;
create policy calendar_events_access on public.calendar_events for all to authenticated
  using (coach_id = (select public.my_business()) and exists (
    select 1 from public.calendars k where k.id = calendar_id
      and ((select public.is_manager()) or k.member_id = (select public.my_member()) or k.member_id is null)))
  with check (coach_id = (select public.my_business()) and exists (
    select 1 from public.calendars k where k.id = calendar_id
      and ((select public.is_manager()) or k.member_id = (select public.my_member()))));

drop policy clients_own on public.clients;
create policy clients_access on public.clients for all to authenticated
  using (coach_id = (select public.my_business()) and ((select public.is_manager()) or practitioner_id = (select public.my_member())))
  with check (coach_id = (select public.my_business()) and ((select public.is_manager()) or practitioner_id = (select public.my_member())));

drop policy arrangements_own on public.arrangements;
create policy arrangements_access on public.arrangements for all to authenticated
  using (coach_id = (select public.my_business()) and public.can_see_client(client_id))
  with check (coach_id = (select public.my_business()) and public.can_see_client(client_id));

drop policy sessions_own on public.sessions;
create policy sessions_access on public.sessions for all to authenticated
  using (coach_id = (select public.my_business()) and (public.can_see_client(client_id) or practitioner_id = (select public.my_member())))
  with check (coach_id = (select public.my_business()) and (public.can_see_client(client_id) or practitioner_id = (select public.my_member())));

drop policy notes_own on public.notes;
create policy notes_access on public.notes for all to authenticated
  using (coach_id = (select public.my_business()) and public.can_see_client(client_id))
  with check (coach_id = (select public.my_business()) and public.can_see_client(client_id));

drop policy goals_own on public.goals;
create policy goals_access on public.goals for all to authenticated
  using (coach_id = (select public.my_business()) and public.can_see_client(client_id))
  with check (coach_id = (select public.my_business()) and public.can_see_client(client_id));

drop policy invoices_own on public.invoices;
create policy invoices_managers on public.invoices for all to authenticated
  using (coach_id = (select public.my_business()) and (select public.is_manager()))
  with check (coach_id = (select public.my_business()) and (select public.is_manager()));

drop policy invoice_items_own on public.invoice_items;
create policy invoice_items_managers on public.invoice_items for all to authenticated
  using (coach_id = (select public.my_business()) and (select public.is_manager()))
  with check (coach_id = (select public.my_business()) and (select public.is_manager()));

drop policy activity_own on public.activity;
create policy activity_access on public.activity for all to authenticated
  using (coach_id = (select public.my_business()) and ((select public.is_manager()) or (client_id is not null and public.can_see_client(client_id))))
  with check (coach_id = (select public.my_business()));

drop policy coach_accounts_own_read on public.coach_accounts;
create policy coach_accounts_own_read on public.coach_accounts for select to authenticated using (coach_id = (select public.my_business()));

revoke execute on function public.my_member() from public, anon;
revoke execute on function public.my_business() from public, anon;
revoke execute on function public.my_role() from public, anon;
revoke execute on function public.is_manager() from public, anon;
revoke execute on function public.can_see_client(uuid) from public, anon;
grant execute on function public.my_member(), public.my_business(), public.my_role(), public.is_manager(), public.can_see_client(uuid) to authenticated;

-- ================= SIGN-UP AND NEW MEMBERS =================
-- If the email was added to a team, the new login joins that team; otherwise it starts a new business.
create or replace function public.handle_new_coach()
returns trigger language plpgsql security definer set search_path = '' as $$
declare base text; slug text; invited uuid; owner_member uuid;
begin
  select id into invited from public.team_members
   where lower(email) = lower(new.email) and user_id is null and active
   order by created_at limit 1;
  if invited is not null then
    update public.team_members set user_id = new.id where id = invited;
    return new;
  end if;

  base := regexp_replace(lower(split_part(coalesce(new.email,'coach'), '@', 1)), '[^a-z0-9]+', '-', 'g');
  slug := base || '-' || substr(md5(new.id::text), 1, 4);
  insert into public.coaches (id, email, display_name, booking_slug)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', ''), slug);

  insert into public.team_members (coach_id, user_id, name, email, role, employment)
  values (new.id, new.id, coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(new.email,'@',1)), new.email, 'owner', 'owner')
  returning id into owner_member;

  insert into public.calendars (coach_id, member_id, name, kind, colour, blocks_availability, is_booking_destination)
  values (new.id, owner_member, 'Coaching', 'work', '#4F6D5C', true, true),
         (new.id, owner_member, 'Personal', 'personal', '#B07A5A', true, false);
  insert into public.availability_rules (coach_id, member_id, weekday, start_time, end_time)
  select new.id, owner_member, d, '09:00', '17:00' from generate_series(1,5) d;
  insert into public.offers (coach_id, name, kind, session_count, session_minutes, price_cents, billing, is_public)
  values (new.id, 'Discovery call', 'discovery', 1, 30, 0, 'free', true),
         (new.id, 'Single session', 'single', 1, 60, 20000, 'upfront', true);
  return new;
end $$;

create or replace function public.setup_team_member()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'owner' then return new; end if;
  if not exists (select 1 from public.calendars where member_id = new.id) then
    insert into public.calendars (coach_id, member_id, name, kind, colour, blocks_availability, is_booking_destination)
    values (new.coach_id, new.id, 'Sessions', 'work', new.colour, true, true),
           (new.coach_id, new.id, 'Personal', 'personal', '#B07A5A', true, false);
  end if;
  if not exists (select 1 from public.availability_rules where member_id = new.id) then
    insert into public.availability_rules (coach_id, member_id, weekday, start_time, end_time)
    select new.coach_id, new.id, d, '09:00', '17:00' from generate_series(1,5) d;
  end if;
  return new;
end $$;
create trigger team_members_setup after insert on public.team_members for each row execute function public.setup_team_member();
revoke execute on function public.setup_team_member() from public, anon, authenticated;

-- ================= ARRANGEMENT OVERVIEW (now with practitioner) =================
drop view public.arrangement_overview;
create view public.arrangement_overview with (security_invoker = on) as
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

-- ================= TEAM REPORT AND PAY =================
create or replace function public.session_value_cents(p_session uuid) returns int
language sql stable security invoker set search_path = '' as $$
  select coalesce(
    (select case when a.sessions_total > 0 then round(a.price_cents::numeric / a.sessions_total)::int else a.price_cents end
       from public.sessions s join public.arrangements a on a.id = s.arrangement_id where s.id = p_session),
    (select o.price_cents from public.sessions s join public.offers o on o.id = s.offer_id where s.id = p_session),
    0);
$$;

create or replace function public.team_report(p_from date, p_to date)
returns table (
  member_id uuid, name text, role text, employment text, pay_type text, pay_rate numeric,
  sessions_completed bigint, late_cancels bigint, no_shows bigint, hours numeric,
  value_cents bigint, pay_cents bigint, active_clients bigint
)
language plpgsql stable security invoker set search_path = '' as $$
declare tz text;
begin
  if not public.is_manager() then raise exception 'Only owners and managers can see the team report.'; end if;
  select timezone into tz from public.coaches where id = public.my_business();
  return query
  with s as (
    select x.id, x.practitioner_id, x.status, x.starts_at, x.ends_at,
           extract(epoch from (x.ends_at - x.starts_at)) / 3600.0 as hrs,
           public.session_value_cents(x.id) as val
    from public.sessions x
    where x.coach_id = public.my_business()
      and (x.starts_at at time zone tz)::date between p_from and p_to
      and x.status in ('completed','late_cancel','no_show')
  )
  select m.id, m.name, m.role, m.employment, m.pay_type, m.pay_rate,
    count(s.id) filter (where s.status = 'completed'),
    count(s.id) filter (where s.status = 'late_cancel'),
    count(s.id) filter (where s.status = 'no_show'),
    round(coalesce(sum(s.hrs) filter (where s.status = 'completed'), 0)::numeric, 2),
    coalesce(sum(s.val) filter (where s.status in ('completed','late_cancel')), 0)::bigint,
    (case m.pay_type
      when 'percent' then round(coalesce(sum(s.val) filter (where s.status in ('completed','late_cancel')), 0) * m.pay_rate / 100)
      when 'per_session' then round(count(s.id) filter (where s.status = 'completed') * m.pay_rate * 100)
      when 'hourly' then round(coalesce(sum(s.hrs) filter (where s.status = 'completed'), 0) * m.pay_rate * 100)
      else 0 end)::bigint,
    (select count(*) from public.clients c where c.practitioner_id = m.id and c.status = 'active')
  from public.team_members m
  left join s on s.practitioner_id = m.id
  where m.coach_id = public.my_business() and m.active
  group by m.id
  order by (m.role = 'owner') desc, m.name;
end $$;
revoke execute on function public.team_report(date, date) from public, anon;
grant execute on function public.team_report(date, date) to authenticated;
revoke execute on function public.session_value_cents(uuid) from public, anon;

-- ================= BOOKING BY PRACTITIONER =================
create or replace function public.member_free_slots(p_member uuid, p_minutes int, p_from date, p_days int)
returns setof timestamptz
language plpgsql stable security definer set search_path = '' as $$
declare co record; m record; d date; r record; t time; s timestamptz; e timestamptz;
begin
  select * into m from public.team_members where id = p_member and active and bookable;
  if m is null then return; end if;
  select * into co from public.coaches where id = m.coach_id;

  for d in select generate_series(p_from, p_from + p_days - 1, interval '1 day')::date loop
    if (select count(*) from public.sessions x
        where x.practitioner_id = m.id and x.status in ('scheduled','completed')
          and (x.starts_at at time zone co.timezone)::date = d) >= co.max_sessions_per_day then
      continue;
    end if;
    for r in select * from public.availability_rules where member_id = m.id and weekday = extract(dow from d) order by start_time loop
      t := r.start_time;
      while t + make_interval(mins => p_minutes) <= r.end_time loop
        s := (d + t) at time zone co.timezone;
        e := s + make_interval(mins => p_minutes);
        if s >= now() + make_interval(hours => co.booking_min_notice_hours)
           and s <= now() + make_interval(days => co.booking_window_days)
           and not exists (select 1 from public.sessions x
             where x.practitioner_id = m.id and x.status in ('scheduled','completed')
               and x.starts_at < e + make_interval(mins => co.session_buffer_minutes)
               and x.ends_at > s - make_interval(mins => co.session_buffer_minutes))
           and not exists (select 1 from public.calendar_events ev join public.calendars k on k.id = ev.calendar_id
             where ev.coach_id = co.id and k.blocks_availability
               and (k.member_id = m.id or k.member_id is null)
               and ev.starts_at < e and ev.ends_at > s)
        then
          return next s;
        end if;
        t := t + interval '30 minutes';
      end loop;
    end loop;
  end loop;
end $$;
revoke execute on function public.member_free_slots(uuid, int, date, int) from public, anon, authenticated;

drop function public.public_booking_slots(text, uuid, date, int);
create function public.public_booking_slots(p_slug text, p_offer uuid, p_from date default null, p_days int default 14, p_member uuid default null)
returns table (slot_start timestamptz, member_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare co record; o record; start_d date;
begin
  select * into co from public.coaches where booking_slug = p_slug and booking_enabled;
  if co is null then return; end if;
  select * into o from public.offers where id = p_offer and coach_id = co.id and active and is_public;
  if o is null then return; end if;
  start_d := coalesce(p_from, (now() at time zone co.timezone)::date);
  p_days := least(greatest(p_days, 1), 31);

  return query
  select distinct on (x.s) x.s, x.mid
  from (
    select fs as s, m.id as mid, m.created_at
    from public.team_members m
    cross join lateral public.member_free_slots(m.id, o.session_minutes, start_d, p_days) fs
    where m.coach_id = co.id and m.active and m.bookable
      and (p_member is null or m.id = p_member)
  ) x
  order by x.s, x.created_at;
end $$;

create or replace function public.public_coach_profile(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'display_name', c.display_name, 'business_name', c.business_name, 'timezone', c.timezone, 'currency', c.currency,
    'offers', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'description', o.description, 'kind', o.kind,
        'session_minutes', o.session_minutes, 'price_cents', o.price_cents) order by o.price_cents)
      from public.offers o where o.coach_id = c.id and o.active and o.is_public), '[]'::jsonb),
    'team', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name) order by m.created_at)
      from public.team_members m where m.coach_id = c.id and m.active and m.bookable), '[]'::jsonb))
  from public.coaches c where c.booking_slug = p_slug and c.booking_enabled;
$$;

drop function public.public_book_session(text, uuid, timestamptz, text, text, text, text);
create function public.public_book_session(
  p_slug text, p_offer uuid, p_starts_at timestamptz,
  p_first_name text, p_last_name text, p_email text, p_phone text default null, p_member uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare co record; o record; cid uuid; sid uuid; d date; mid uuid; mname text;
begin
  if coalesce(trim(p_first_name),'') = '' or coalesce(trim(p_email),'') = '' or position('@' in p_email) = 0 then
    raise exception 'Please enter your name and a valid email.';
  end if;
  select * into co from public.coaches where booking_slug = p_slug and booking_enabled;
  if co is null then raise exception 'Booking page not found.'; end if;
  select * into o from public.offers where id = p_offer and coach_id = co.id and active and is_public;
  if o is null then raise exception 'That session type is not available.'; end if;

  d := (p_starts_at at time zone co.timezone)::date;
  select x.member_id into mid from public.public_booking_slots(p_slug, p_offer, d, 1, p_member) x where x.slot_start = p_starts_at;
  if mid is null then
    raise exception 'Sorry, that time is no longer available. Please choose another.';
  end if;

  select id into cid from public.clients where coach_id = co.id and lower(email) = lower(trim(p_email));
  if cid is null then
    insert into public.clients (coach_id, first_name, last_name, email, phone, status, source, practitioner_id)
    values (co.id, trim(p_first_name), coalesce(trim(p_last_name),''), lower(trim(p_email)), p_phone, 'lead', 'Booking page', mid)
    returning id into cid;
  else
    update public.clients set practitioner_id = mid where id = cid and practitioner_id is null;
  end if;

  insert into public.sessions (coach_id, client_id, offer_id, practitioner_id, starts_at, ends_at, booked_by, meeting_url)
  values (co.id, cid, o.id, mid, p_starts_at, p_starts_at + make_interval(mins => o.session_minutes), 'client', co.default_meeting_url)
  returning id into sid;

  select name into mname from public.team_members where id = mid;
  return jsonb_build_object('session_id', sid, 'starts_at', p_starts_at, 'offer', o.name, 'meeting_url', co.default_meeting_url, 'with', mname);
end $$;

revoke all on function public.public_booking_slots(text, uuid, date, int, uuid) from public;
revoke all on function public.public_book_session(text, uuid, timestamptz, text, text, text, text, uuid) from public;
grant execute on function public.public_booking_slots(text, uuid, date, int, uuid) to anon, authenticated;
grant execute on function public.public_book_session(text, uuid, timestamptz, text, text, text, text, uuid) to anon, authenticated;

-- Standing bookings check the practitioner's own diary
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
            and (a.practitioner_id is null or s.practitioner_id = a.practitioner_id)
            and s.starts_at < slot_end + make_interval(mins => buffer)
            and s.ends_at > slot_start - make_interval(mins => buffer))
        and not exists (select 1 from public.calendar_events e join public.calendars k on k.id = e.calendar_id
          where e.coach_id = a.coach_id and k.blocks_availability
            and (a.practitioner_id is null or k.member_id = a.practitioner_id or k.member_id is null)
            and e.starts_at < slot_end and e.ends_at > slot_start)
      then
        insert into public.sessions (coach_id, client_id, arrangement_id, offer_id, practitioner_id, starts_at, ends_at, booked_by, meeting_url)
        values (a.coach_id, a.client_id, a.id, a.offer_id, a.practitioner_id, slot_start, slot_end, 'auto', meeting)
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
           where coach_id = public.my_business() and status = 'active' and auto_book and cadence in ('weekly','fortnightly','monthly')
  loop total := total + public.extend_standing_bookings(r.id, p_weeks); end loop;
  return total;
end $$;
