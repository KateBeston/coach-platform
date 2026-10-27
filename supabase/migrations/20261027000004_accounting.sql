-- Accounting: expenses with receipts, for profit and loss, GST (BAS) and the accountant export.
-- Income comes from paid invoices (cash basis: counted when paid).

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default public.my_business() references public.coaches(id) on delete cascade,
  spent_on date not null default current_date,
  supplier text not null,
  description text,
  category text not null default 'other' check (category in (
    'supervision','training','software','marketing','venue','travel','insurance',
    'professional_fees','equipment','phone_internet','subcontractors','bank_fees','other')),
  amount_cents int not null check (amount_cents >= 0),   -- total paid, including any GST
  gst_cents int not null default 0 check (gst_cents >= 0 and gst_cents <= amount_cents),
  payment_method text,
  receipt_path text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index expenses_coach_date on public.expenses (coach_id, spent_on desc);
alter table public.expenses enable row level security;
create policy expenses_managers on public.expenses for all to authenticated
  using (coach_id = (select public.my_business()) and (select public.is_manager()))
  with check (coach_id = (select public.my_business()) and (select public.is_manager()));

-- Receipts: private bucket, one folder per business, managers only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do nothing;

create policy receipts_managers_read on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select public.my_business())::text and (select public.is_manager()));
create policy receipts_managers_write on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select public.my_business())::text and (select public.is_manager()));
create policy receipts_managers_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select public.my_business())::text and (select public.is_manager()));
