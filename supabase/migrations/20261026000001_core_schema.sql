-- Core tables. Every row belongs to one coach (coach_id = the signed-in user).

create table public.coaches (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  business_name text not null default '',
  email text,
  timezone text not null default 'Australia/Brisbane',
  currency text not null default 'AUD',
  booking_slug text unique,
  booking_enabled boolean not null default true,
  booking_min_notice_hours int not null default 24,
  booking_window_days int not null default 60,
  session_buffer_minutes int not null default 15,
  max_sessions_per_day int not null default 6,
  default_meeting_url text,
  gst_registered boolean not null default false,
  gst_rate numeric(5,2) not null default 10,
  tax_set_aside_pct numeric(5,2) not null default 30,
  invoice_prefix text not null default 'INV-',
  invoice_seq int not null default 0,
  payment_terms_days int not null default 7,
  created_at timestamptz not null default now()
);

create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);
create index on public.availability_rules(coach_id);

create table public.calendars (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches(id) on delete cascade,
  name text not null,
  kind text not null default 'work' check (kind in ('work','personal','other')),
  source text not null default 'internal' check (source in ('internal','google','outlook','icloud')),
  external_id text,
  colour text not null default '#5B6B5A',
  blocks_availability boolean not null default true,
  visible boolean not null default true,
  is_booking_destination boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.calendars(coach_id);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches(id) on delete cascade,
  calendar_id uuid not null references public.calendars(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  external_id text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on public.calendar_events(coach_id, starts_at);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches(id) on delete cascade,
  name text not null,
  description text,
  kind text not null default 'single' check (kind in ('single','package','recurring','discovery')),
  session_count int,
  session_minutes int not null default 60,
  price_cents int not null default 0,
  billing text not null default 'upfront' check (billing in ('upfront','per_session','monthly','free')),
  is_public boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.offers(coach_id);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches(id) on delete cascade,
  first_name text not null,
  last_name text not null default '',
  email text,
  phone text,
  status text not null default 'lead' check (status in ('lead','active','paused','alumni')),
  source text,
  timezone text,
  tags text[] not null default '{}',
  background text,
  created_at timestamptz not null default now()
);
create index on public.clients(coach_id);
create unique index clients_coach_email_uniq on public.clients(coach_id, lower(email)) where email is not null;

create table public.arrangements (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  offer_id uuid references public.offers(id) on delete set null,
  cadence text not null check (cadence in ('weekly','fortnightly','monthly','package','ad_hoc')),
  preferred_weekday smallint check (preferred_weekday between 0 and 6),
  preferred_time time,
  session_minutes int not null default 60,
  sessions_total int,
  price_cents int not null default 0,
  start_date date not null default current_date,
  end_date date,
  auto_book boolean not null default true,
  status text not null default 'active' check (status in ('active','paused','ended')),
  paused_until date,
  created_at timestamptz not null default now()
);
create index on public.arrangements(coach_id);
create index on public.arrangements(client_id);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  arrangement_id uuid references public.arrangements(id) on delete set null,
  offer_id uuid references public.offers(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled','late_cancel','no_show')),
  location_type text not null default 'video' check (location_type in ('video','in_person','phone')),
  location_detail text,
  meeting_url text,
  booked_by text not null default 'coach' check (booked_by in ('coach','client','auto')),
  is_paid_coaching boolean not null default true,
  counts_toward_icf boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on public.sessions(coach_id, starts_at);
create index on public.sessions(client_id, starts_at);
create unique index sessions_arrangement_slot_uniq on public.sessions(arrangement_id, starts_at) where arrangement_id is not null;

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  body text not null default '',
  action_items jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.notes(client_id, created_at desc);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  status text not null default 'open' check (status in ('open','achieved','dropped')),
  target_date date,
  created_at timestamptz not null default now(),
  achieved_at timestamptz
);
create index on public.goals(client_id);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  number text,
  issue_date date not null default current_date,
  due_date date,
  status text not null default 'draft' check (status in ('draft','sent','paid','void')),
  currency text not null default 'AUD',
  subtotal_cents int not null default 0,
  tax_cents int not null default 0,
  total_cents int not null default 0,
  paid_at timestamptz,
  payment_method text,
  notes text,
  created_at timestamptz not null default now()
);
create index on public.invoices(coach_id, issue_date desc);
create index on public.invoices(client_id);
create unique index invoices_coach_number_uniq on public.invoices(coach_id, number);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity numeric(10,2) not null default 1,
  unit_cents int not null default 0,
  session_id uuid references public.sessions(id) on delete set null,
  position int not null default 0
);
create index on public.invoice_items(invoice_id);

-- Client timeline, written by triggers
create table public.activity (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.coaches(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  kind text not null,
  summary text not null,
  ref_table text,
  ref_id uuid,
  created_at timestamptz not null default now()
);
create index on public.activity(client_id, created_at desc);
create index on public.activity(coach_id, created_at desc);

-- Row level security: a coach only ever sees their own rows
alter table public.coaches enable row level security;
create policy coach_self_select on public.coaches for select to authenticated using (id = (select auth.uid()));
create policy coach_self_update on public.coaches for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['availability_rules','calendars','calendar_events','offers','clients','arrangements','sessions','notes','goals','invoices','invoice_items','activity']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()))', t || '_own', t);
  end loop;
end $$;
