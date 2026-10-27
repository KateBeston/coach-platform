-- Support access: internal-portal staff open a coach's account and see and change
-- everything the coach can, in the coach app itself, so nothing ever needs mirroring.
--
-- How: a staff member starts a support session for one business (with a reason).
-- While it's active, the identity functions every RLS policy relies on
-- (my_business, my_member, my_role, is_manager) answer as that business's owner.
-- Sessions expire after two hours, can be ended any time, and are all recorded.

create table public.support_sessions (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references auth.users(id) on delete cascade,
  coach_id uuid not null references public.coaches(id) on delete cascade,
  reason text not null check (length(trim(reason)) >= 3),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 hours',
  ended_at timestamptz
);
create index support_sessions_staff on public.support_sessions (staff_user_id, started_at desc);
create index support_sessions_coach on public.support_sessions (coach_id, started_at desc);
alter table public.support_sessions enable row level security;
create policy support_sessions_read on public.support_sessions for select to authenticated
  using (staff_user_id = (select auth.uid()) or (select public.has_area('access')));

-- Who can open a coach's account.
create or replace function public.staff_areas()
returns text[] language sql stable security definer set search_path = '' as $$
  select case public.staff_role()
    when 'owner'   then array['overview','coaches','accounts','notes','people','access','coach_access']
    when 'admin'   then array['overview','coaches','accounts','notes','people','access','coach_access']
    when 'support' then array['overview','coaches','notes','coach_access']
    when 'finance' then array['overview','coaches','accounts']
    else array[]::text[] end;
$$;

-- The business this login is currently supporting, if any.
create or replace function public.support_business()
returns uuid language sql stable security definer set search_path = '' as $$
  select s.coach_id from public.support_sessions s
   where s.staff_user_id = auth.uid() and s.ended_at is null and s.expires_at > now()
     and exists (select 1 from public.staff st where st.user_id = auth.uid() and st.status = 'active')
   order by s.started_at desc limit 1;
$$;

create or replace function public.my_business()
returns uuid language sql stable security definer set search_path = '' as $$
  select coalesce(public.support_business(),
    (select coach_id from public.team_members where user_id = auth.uid() and active limit 1));
$$;

-- During support, act as the business's owner so every page and policy behaves as it does for them.
create or replace function public.my_member()
returns uuid language sql stable security definer set search_path = '' as $$
  select case when public.support_business() is not null
    then (select id from public.team_members where coach_id = public.support_business() and role = 'owner' order by created_at limit 1)
    else (select id from public.team_members where user_id = auth.uid() and active limit 1) end;
$$;

create or replace function public.my_role()
returns text language sql stable security definer set search_path = '' as $$
  select case when public.support_business() is not null then 'owner'
    else (select role from public.team_members where user_id = auth.uid() and active limit 1) end;
$$;

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = '' as $$
  select case when public.support_business() is not null then true
    else coalesce((select role in ('owner','manager') from public.team_members where user_id = auth.uid() and active limit 1), false) end;
$$;

-- The coach app reads this to show the support banner and load the right business.
create or replace function public.my_support_session()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', s.id, 'coach_id', s.coach_id, 'reason', s.reason, 'started_at', s.started_at, 'expires_at', s.expires_at)
    from public.support_sessions s
   where s.staff_user_id = auth.uid() and s.ended_at is null and s.expires_at > now()
     and exists (select 1 from public.staff st where st.user_id = auth.uid() and st.status = 'active')
   order by s.started_at desc limit 1;
$$;

create or replace function public.start_support_session(p_coach uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  if not public.has_area('coach_access') then raise exception 'Your role can''t open coach accounts.'; end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'Say briefly why you''re opening this account.'; end if;
  if not exists (select 1 from public.coaches where id = p_coach) then raise exception 'Coach not found.'; end if;
  -- One business at a time.
  update public.support_sessions set ended_at = now() where staff_user_id = auth.uid() and ended_at is null;
  insert into public.support_sessions (staff_user_id, coach_id, reason) values (auth.uid(), p_coach, trim(p_reason)) returning id into sid;
  return sid;
end $$;

create or replace function public.end_support_session()
returns void language sql security definer set search_path = '' as $$
  update public.support_sessions set ended_at = now() where staff_user_id = auth.uid() and ended_at is null;
$$;

revoke execute on function public.support_business(), public.my_support_session(), public.start_support_session(uuid, text), public.end_support_session() from public, anon;
grant execute on function public.support_business(), public.my_support_session(), public.start_support_session(uuid, text), public.end_support_session() to authenticated;

-- Session history for the portal, with who opened it.
create or replace function public.admin_support_sessions(p_coach uuid default null)
returns table (id uuid, coach_id uuid, coach_name text, staff_name text, reason text, started_at timestamptz, expires_at timestamptz, ended_at timestamptz, active boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Not authorised'; end if;
  return query
  select s.id, s.coach_id, coalesce(nullif(c.business_name,''), nullif(c.display_name,''), c.email),
         coalesce(st.name, st.email), s.reason, s.started_at, s.expires_at, s.ended_at,
         s.ended_at is null and s.expires_at > now()
    from public.support_sessions s
    join public.coaches c on c.id = s.coach_id
    left join public.staff st on st.user_id = s.staff_user_id
   where (p_coach is null or s.coach_id = p_coach)
     and (public.has_area('access') or s.staff_user_id = auth.uid())
   order by s.started_at desc limit 200;
end $$;
revoke execute on function public.admin_support_sessions(uuid) from public, anon;
grant execute on function public.admin_support_sessions(uuid) to authenticated;

-- Usage counts for the coach record: team, money and receipts.
create or replace function public.admin_coach_usage(p_coach uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Not authorised'; end if;
  return jsonb_build_object(
    'team_active', (select count(*) from public.team_members where coach_id = p_coach and active),
    'team_practitioners', (select count(*) from public.team_members where coach_id = p_coach and active and role <> 'owner'),
    'expenses', (select count(*) from public.expenses where coach_id = p_coach),
    'expenses_30d', (select count(*) from public.expenses where coach_id = p_coach and created_at > now() - interval '30 days'),
    'receipts', (select count(*) from public.expenses where coach_id = p_coach and receipt_path is not null),
    'invoices_paid', (select count(*) from public.invoices where coach_id = p_coach and status = 'paid'),
    'notes', (select count(*) from public.notes where coach_id = p_coach),
    'goals', (select count(*) from public.goals where coach_id = p_coach),
    'calendar_events', (select count(*) from public.calendar_events where coach_id = p_coach),
    'booked_by_clients', (select count(*) from public.sessions where coach_id = p_coach and booked_by = 'client'));
end $$;
revoke execute on function public.admin_coach_usage(uuid) from public, anon;
grant execute on function public.admin_coach_usage(uuid) to authenticated;
