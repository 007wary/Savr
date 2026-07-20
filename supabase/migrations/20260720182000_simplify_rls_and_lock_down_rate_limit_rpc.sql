-- Addresses several findings from the Supabase advisor scan:
--
-- 1. (security, WARN) check_token_refresh_rate_limit was callable directly by
--    anon/authenticated via PostgREST RPC, letting anyone pass an arbitrary
--    p_user_id to burn or exhaust another user's rate-limit budget, bypassing
--    the edge function's JWT check entirely. The revoke below targets
--    anon/authenticated directly, which turned out to be a no-op — new
--    functions grant EXECUTE to PUBLIC by default, and role-level revokes
--    don't override an inherited PUBLIC grant. Actually fixed in
--    20260720182008_revoke_public_execute_rate_limit_rpc.sql, which revokes
--    from PUBLIC itself.
--
-- 2. (performance, multiple_permissive_policies) budgets, expenses,
--    recurring_expenses, and user_profiles each carry a blanket "manage own
--    X" ALL policy (already correct on its own since
--    20260630202300_harden_all_policy_with_check.sql added WITH CHECK) in
--    addition to four redundant per-command policies doing the identical
--    check. Postgres evaluates every applicable policy per query, so this
--    doubles RLS overhead on the app's hottest tables for no behavioral
--    difference. Drop the redundant per-command policies.
--
-- 3. (performance, auth_rls_initplan) All remaining policies call auth.uid()/
--    auth.role() directly, which Postgres re-evaluates per row instead of
--    once per query. Wrap in (select ...) so it's evaluated once.
--
-- 4. (performance, unindexed_foreign_keys) income.account_id has no covering
--    index.

revoke execute on function public.check_token_refresh_rate_limit(uuid, int, int) from anon, authenticated;
-- budgets: drop redundant per-command policies, keep+rewrite the ALL policy
drop policy if exists "Users can only delete own budgets" on public.budgets;
drop policy if exists "Users can only insert own budgets" on public.budgets;
drop policy if exists "Users can only see own budgets" on public.budgets;
drop policy if exists "Users can only update own budgets" on public.budgets;
drop policy if exists "Users can manage own budgets" on public.budgets;
create policy "Users can manage own budgets" on public.budgets
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- expenses
drop policy if exists "Users can only delete own expenses" on public.expenses;
drop policy if exists "Users can only insert own expenses" on public.expenses;
drop policy if exists "Users can only see own expenses" on public.expenses;
drop policy if exists "Users can only update own expenses" on public.expenses;
drop policy if exists "Users can manage own expenses" on public.expenses;
create policy "Users can manage own expenses" on public.expenses
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- recurring_expenses
drop policy if exists "Users can only delete own recurring" on public.recurring_expenses;
drop policy if exists "Users can only insert own recurring" on public.recurring_expenses;
drop policy if exists "Users can only see own recurring" on public.recurring_expenses;
drop policy if exists "Users can only update own recurring" on public.recurring_expenses;
drop policy if exists "Users can manage own recurring expenses" on public.recurring_expenses;
create policy "Users can manage own recurring expenses" on public.recurring_expenses
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- user_profiles
drop policy if exists "Users can insert own profile" on public.user_profiles;
drop policy if exists "Users can update own profile" on public.user_profiles;
drop policy if exists "Users can view own profile" on public.user_profiles;
drop policy if exists "Users can manage own profile" on public.user_profiles;
create policy "Users can manage own profile" on public.user_profiles
  for all using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
-- income (single ALL policy already, just needs the initplan fix)
drop policy if exists "Users can manage own income" on public.income;
create policy "Users can manage own income" on public.income
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- accounts (single ALL policy already, just needs the initplan fix)
drop policy if exists "Users can manage own accounts" on public.accounts;
create policy "Users can manage own accounts" on public.accounts
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- posts / subscribers: distinct policies for different roles, left as two
-- policies each (not merged), only rewritten for the initplan fix.
drop policy if exists "Service role has full access to posts" on public.posts;
create policy "Service role has full access to posts" on public.posts
  for all using ((select auth.role()) = 'service_role');
drop policy if exists "Service role has full access to subscribers" on public.subscribers;
create policy "Service role has full access to subscribers" on public.subscribers
  for all using ((select auth.role()) = 'service_role');
create index if not exists idx_income_account_id on public.income(account_id);
