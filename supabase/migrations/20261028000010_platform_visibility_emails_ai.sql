-- Everything the coach app does with emails and AI is visible to internal staff.

create table public.ai_usage (
  id bigint generated always as identity primary key,
  coach_id uuid not null default public.my_business() references public.coaches(id) on delete cascade,
  member_id uuid default public.my_member() references public.team_members(id) on delete set null,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  feature text not null,
  detail text,
  model text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(10,6) not null default 0,
  ok boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);
create index ai_usage_coach on public.ai_usage (coach_id, created_at desc);
alter table public.ai_usage enable row level security;
create policy ai_usage_insert on public.ai_usage for insert to authenticated
  with check (coach_id = (select public.my_business()));
create policy ai_usage_staff_read on public.ai_usage for select to authenticated
  using ((select public.is_staff()) or (coach_id = (select public.my_business()) and (select public.is_manager())));

create policy email_outbox_staff_read on public.email_outbox for select to authenticated using ((select public.is_staff()));
create policy email_templates_staff_read on public.email_templates for select to authenticated using ((select public.is_staff()));

-- Health of the background job and the email queue, for the portal.
create or replace function public.admin_messaging_health()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Not authorised'; end if;
  return jsonb_build_object(
    'last_run', (select max(end_time) from cron.job_run_details d join cron.job j on j.jobid = d.jobid where j.jobname = 'messaging-tick'),
    'last_status', (select d.status from cron.job_run_details d join cron.job j on j.jobid = d.jobid where j.jobname = 'messaging-tick' order by d.end_time desc nulls last limit 1),
    'failed_runs_24h', (select count(*) from cron.job_run_details d join cron.job j on j.jobid = d.jobid where j.jobname = 'messaging-tick' and d.status = 'failed' and d.end_time > now() - interval '1 day'),
    'email_key_set', exists (select 1 from vault.secrets where name = 'resend_api_key'),
    'from_address', coalesce((select setting_value from public.platform_settings where setting_group = 'Email' and setting_key = 'from_address'), 'onboarding@resend.dev (test only)'),
    'waiting', (select count(*) from public.email_outbox where status = 'queued'),
    'waiting_setup', (select count(*) from public.email_outbox where status = 'queued' and status_note = 'Waiting for email set-up'),
    'sent_7d', (select count(*) from public.email_outbox where status = 'sent' and sent_at > now() - interval '7 days'),
    'failed_7d', (select count(*) from public.email_outbox where status = 'failed' and created_at > now() - interval '7 days'));
end $$;
revoke execute on function public.admin_messaging_health() from public, anon;
grant execute on function public.admin_messaging_health() to authenticated;
