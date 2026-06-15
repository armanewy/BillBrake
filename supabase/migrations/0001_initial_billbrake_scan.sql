create extension if not exists pgcrypto;

create type pay_frequency as enum (
  'weekly',
  'biweekly',
  'semimonthly',
  'monthly'
);

create type obligation_type as enum (
  'bnpl',
  'subscription',
  'bill',
  'debt_minimum',
  'rent',
  'other'
);

create type recurrence_type as enum (
  'none',
  'weekly',
  'biweekly',
  'monthly',
  'yearly',
  'custom_installments'
);

create type instance_status as enum (
  'upcoming',
  'paid',
  'skipped',
  'missed',
  'deleted'
);

create type import_source_type as enum (
  'screenshot',
  'pdf',
  'csv',
  'pasted_text',
  'email_forward'
);

create type import_status as enum (
  'uploaded',
  'processing',
  'needs_review',
  'confirmed',
  'failed'
);

create table app_user (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  timezone text not null default 'America/New_York',
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  onboarding_completed_at timestamptz,
  deleted_at timestamptz
);

create table income_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  name text not null default 'Paycheck',
  frequency pay_frequency not null,
  next_payday date not null,
  paycheck_amount_cents integer,
  buffer_amount_cents integer default 0,
  semimonthly_day_1 integer check (semimonthly_day_1 between 1 and 31),
  semimonthly_day_2 integer check (semimonthly_day_2 between 1 and 31),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table obligation (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  type obligation_type not null,
  merchant_name text not null,
  nickname text,
  amount_cents integer not null check (amount_cents >= 0),
  first_due_date date not null,
  recurrence recurrence_type not null,
  recurrence_interval integer not null default 1,
  installment_count integer,
  installment_number_start integer default 1,
  end_date date,
  payment_method_note text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table obligation_instance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  obligation_id uuid references obligation(id) on delete cascade,
  due_date date not null,
  amount_cents integer not null check (amount_cents >= 0),
  status instance_status not null default 'upcoming',
  generated boolean not null default true,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (obligation_id, due_date)
);

create table import_batch (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  source_type import_source_type not null,
  original_filename text,
  file_url text,
  raw_text text,
  status import_status not null default 'uploaded',
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table detected_payment (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  import_batch_id uuid not null references import_batch(id) on delete cascade,
  merchant_name text not null,
  amount_cents integer,
  currency text not null default 'USD',
  first_due_date date,
  recurrence recurrence_type,
  type obligation_type,
  installment_count integer,
  confidence numeric(4,3),
  source_snippet text,
  raw_json jsonb,
  review_status text not null default 'pending'
    check (review_status in ('pending', 'accepted', 'edited', 'ignored')),
  created_obligation_id uuid references obligation(id) on delete set null,
  created_at timestamptz not null default now()
);

create table reminder (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  obligation_instance_id uuid not null references obligation_instance(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  remind_at timestamptz not null,
  sent_at timestamptz,
  clicked_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now()
);

create table billing_customer (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan text,
  status text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table product_event (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_user(id) on delete set null,
  event_name text not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table app_user enable row level security;
alter table income_schedule enable row level security;
alter table obligation enable row level security;
alter table obligation_instance enable row level security;
alter table import_batch enable row level security;
alter table detected_payment enable row level security;
alter table reminder enable row level security;
alter table billing_customer enable row level security;
alter table product_event enable row level security;

create policy "Users can read own profile" on app_user
  for select using (auth.uid() = id);

create policy "Users can insert own profile" on app_user
  for insert with check (auth.uid() = id);

create policy "Users can update own profile" on app_user
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "Users manage own income schedules" on income_schedule
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own obligations" on obligation
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own obligation instances" on obligation_instance
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own import batches" on import_batch
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own detected payments" on detected_payment
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage own reminders" on reminder
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users read own billing customer" on billing_customer
  for select using (auth.uid() = user_id);

create policy "Users write own product events" on product_event
  for insert with check (auth.uid() = user_id or user_id is null);

create index income_schedule_user_id_idx on income_schedule(user_id);
create index obligation_user_id_idx on obligation(user_id);
create index obligation_instance_user_due_idx on obligation_instance(user_id, due_date);
create index import_batch_user_created_idx on import_batch(user_id, created_at desc);
create index detected_payment_batch_idx on detected_payment(import_batch_id);
create index reminder_due_idx on reminder(remind_at) where sent_at is null;
create index product_event_name_created_idx on product_event(event_name, created_at);
