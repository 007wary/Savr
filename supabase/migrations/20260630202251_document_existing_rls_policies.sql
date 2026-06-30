-- Snapshot of RLS policies actually in effect on the live project as of 2026-06-30,
-- captured via:
--   select schemaname, tablename, policyname, cmd, qual, with_check
--   from pg_policies where schemaname = 'public' order by tablename, policyname;
-- This file documents existing state for review purposes; it intentionally uses
-- `create policy if not exists`-equivalent guards (drop+recreate) so it is safe to
-- apply against the already-configured live database without erroring on duplicates.
--
-- transfers and recurring_income are SQLite-only / Google-Drive-backup-only tables
-- (see src/services/sqliteService.js) and have no Postgres counterpart by design.

-- accounts
drop policy if exists "Users can manage own accounts" on public.accounts;
create policy "Users can manage own accounts" on public.accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- budgets
drop policy if exists "Users can manage own budgets" on public.budgets;
create policy "Users can manage own budgets" on public.budgets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can only delete own budgets" on public.budgets;
create policy "Users can only delete own budgets" on public.budgets
  for delete using (auth.uid() = user_id);

drop policy if exists "Users can only insert own budgets" on public.budgets;
create policy "Users can only insert own budgets" on public.budgets
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can only see own budgets" on public.budgets;
create policy "Users can only see own budgets" on public.budgets
  for select using (auth.uid() = user_id);

drop policy if exists "Users can only update own budgets" on public.budgets;
create policy "Users can only update own budgets" on public.budgets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- expenses
drop policy if exists "Users can manage own expenses" on public.expenses;
create policy "Users can manage own expenses" on public.expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can only delete own expenses" on public.expenses;
create policy "Users can only delete own expenses" on public.expenses
  for delete using (auth.uid() = user_id);

drop policy if exists "Users can only insert own expenses" on public.expenses;
create policy "Users can only insert own expenses" on public.expenses
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can only see own expenses" on public.expenses;
create policy "Users can only see own expenses" on public.expenses
  for select using (auth.uid() = user_id);

drop policy if exists "Users can only update own expenses" on public.expenses;
create policy "Users can only update own expenses" on public.expenses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- income
drop policy if exists "Users can manage own income" on public.income;
create policy "Users can manage own income" on public.income
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- recurring_expenses
drop policy if exists "Users can manage own recurring expenses" on public.recurring_expenses;
create policy "Users can manage own recurring expenses" on public.recurring_expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can only delete own recurring" on public.recurring_expenses;
create policy "Users can only delete own recurring" on public.recurring_expenses
  for delete using (auth.uid() = user_id);

drop policy if exists "Users can only insert own recurring" on public.recurring_expenses;
create policy "Users can only insert own recurring" on public.recurring_expenses
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can only see own recurring" on public.recurring_expenses;
create policy "Users can only see own recurring" on public.recurring_expenses
  for select using (auth.uid() = user_id);

drop policy if exists "Users can only update own recurring" on public.recurring_expenses;
create policy "Users can only update own recurring" on public.recurring_expenses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- user_profiles
drop policy if exists "Users can manage own profile" on public.user_profiles;
create policy "Users can manage own profile" on public.user_profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.user_profiles;
create policy "Users can insert own profile" on public.user_profiles
  for insert with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.user_profiles;
create policy "Users can update own profile" on public.user_profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Users can view own profile" on public.user_profiles;
create policy "Users can view own profile" on public.user_profiles
  for select using (auth.uid() = id);

-- posts (service-managed content table, not user-owned data)
drop policy if exists "Public can read published posts" on public.posts;
create policy "Public can read published posts" on public.posts
  for select using (published = true);

drop policy if exists "Service role has full access to posts" on public.posts;
create policy "Service role has full access to posts" on public.posts
  for all using (auth.role() = 'service_role');

-- subscribers (service-managed, no client access)
drop policy if exists "Service role has full access to subscribers" on public.subscribers;
create policy "Service role has full access to subscribers" on public.subscribers
  for all using (auth.role() = 'service_role');
