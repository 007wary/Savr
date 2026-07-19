-- Base schema reconstructed from the live "Savr" project (fsrbsqhlgfdqugixqtxc) as of 2026-07-19.
-- This reproduces table DDL that predates migration history so a fresh environment
-- can be rebuilt from supabase/migrations/ alone. RLS policies are handled separately
-- in 20260630202251_document_existing_rls_policies.sql and later migrations.

create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- accounts
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  type text not null,
  balance numeric default 0,
  color text default '#6C63FF',
  icon text default '🏦',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_accounts_user_id on public.accounts(user_id);

-- budgets
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  category text not null constraint non_empty_budget_category check (category <> '' and category is not null),
  limit_amount numeric not null constraint positive_budget check (limit_amount > 0),
  month text not null
);
create index if not exists idx_budgets_user_id on public.budgets(user_id);
create index if not exists idx_budgets_user_month on public.budgets(user_id, month);

-- expenses
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  amount numeric not null constraint positive_amount check (amount > 0),
  category text not null constraint non_empty_category check (category <> '' and category is not null),
  note text constraint valid_note check (note is null or length(trim(note)) >= 0),
  date date not null constraint reasonable_date check (date >= '2000-01-01' and date <= current_date + interval '1 year'),
  created_at timestamptz default now(),
  account_id uuid references public.accounts(id) on delete set null
);
create index if not exists idx_expenses_user_id on public.expenses(user_id);
create index if not exists idx_expenses_user_date on public.expenses(user_id, date);
create index if not exists idx_expenses_user_category on public.expenses(user_id, category);
create index if not exists idx_expenses_date on public.expenses(date);
create index if not exists idx_expenses_account on public.expenses(account_id);

-- income
create table if not exists public.income (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  amount numeric not null,
  category text not null,
  account_id uuid references public.accounts(id) on delete set null,
  note text,
  date date not null,
  created_at timestamptz default now()
);
create index if not exists idx_income_user_id on public.income(user_id);
create index if not exists idx_income_date on public.income(user_id, date);

-- recurring_expenses
create table if not exists public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  amount numeric not null constraint positive_recurring_amount check (amount > 0),
  category text not null,
  note text,
  frequency text not null constraint valid_frequency check (frequency in ('daily', 'weekly', 'monthly')),
  next_due date not null,
  last_logged date,
  is_active boolean default true,
  created_at timestamptz default now()
);
create index if not exists idx_recurring_user on public.recurring_expenses(user_id);
create index if not exists idx_recurring_next_due on public.recurring_expenses(next_due);

-- user_profiles
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone_number text,
  avatar_url text,
  provider text default 'google',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  app_version text,
  device_model text,
  android_version text,
  last_active timestamptz default now(),
  fcm_token text,
  is_online boolean default false,
  online_at timestamptz,
  country text,
  timezone text
);
create index if not exists idx_user_profiles_id on public.user_profiles(id);

-- posts (service-managed blog content)
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  excerpt text,
  content text,
  cover_image text,
  published boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  category text default 'General',
  author text default 'Wary Dev',
  author_image text default ''
);

-- subscribers (service-managed, no client access)
create table if not exists public.subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  subscribed_at timestamptz default now()
);

-- ─── FUNCTIONS & TRIGGERS ───────────────────────────────────────
create or replace function public.update_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists posts_updated_at on public.posts;
create trigger posts_updated_at
  before update on public.posts
  for each row execute function public.update_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────
alter table public.accounts enable row level security;
alter table public.budgets enable row level security;
alter table public.expenses enable row level security;
alter table public.income enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.user_profiles enable row level security;
alter table public.posts enable row level security;
alter table public.subscribers enable row level security;
