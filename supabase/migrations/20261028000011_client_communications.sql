-- A record of every communication with a client. Automatic emails come from email_outbox;
-- anything else (an SMS from the coach's phone, a call, an email sent from their own inbox,
-- a message the client sent) is logged here. Future SMS sending will write here too.

create table public.client_communications (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default public.my_business() references public.coaches(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  member_id uuid default public.my_member() references public.team_members(id) on delete set null,
  channel text not null check (channel in ('email','sms','call','message','in_person','other')),
  direction text not null default 'outbound' check (direction in ('outbound','inbound')),
  subject text,
  body text,
  occurred_at timestamptz not null default now(),
  source text not null default 'logged' check (source in ('logged','sent')),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index client_communications_client on public.client_communications (client_id, occurred_at desc);
alter table public.client_communications enable row level security;
create policy client_communications_access on public.client_communications for all to authenticated
  using (coach_id = (select public.my_business()) and public.can_see_client(client_id))
  with check (coach_id = (select public.my_business()) and public.can_see_client(client_id));
create policy client_communications_staff_read on public.client_communications for select to authenticated
  using ((select public.is_staff()));

-- Practitioners can see the automatic emails sent to their own clients.
create policy email_outbox_client_access on public.email_outbox for select to authenticated
  using (client_id is not null and coach_id = (select public.my_business()) and public.can_see_client(client_id));

-- Portal usage counts include emails sent and communications logged.
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
    'booked_by_clients', (select count(*) from public.sessions where coach_id = p_coach and booked_by = 'client'),
    'emails_sent', (select count(*) from public.email_outbox where coach_id = p_coach and status = 'sent'),
    'comms_logged', (select count(*) from public.client_communications where coach_id = p_coach));
end $$;
