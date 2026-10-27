-- Coaches (owners and managers) can see every time platform staff opened their account, and why.
create or replace function public.my_support_history()
returns table (id uuid, staff_name text, reason text, started_at timestamptz, ended_at timestamptz, expires_at timestamptz, active boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_manager() then return; end if;
  return query
  select s.id, coalesce(nullif(st.name, ''), 'Support team'), s.reason, s.started_at, s.ended_at, s.expires_at,
         s.ended_at is null and s.expires_at > now()
    from public.support_sessions s
    left join public.staff st on st.user_id = s.staff_user_id
   where s.coach_id = public.my_business()
   order by s.started_at desc limit 100;
end $$;
revoke execute on function public.my_support_history() from public, anon;
grant execute on function public.my_support_history() to authenticated;
