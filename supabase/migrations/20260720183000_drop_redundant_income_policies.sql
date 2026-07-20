-- 20260719145445_split_income_policies.sql added four granular per-command
-- policies to public.income to match the defense-in-depth pattern already
-- used on budgets/expenses/recurring_expenses. That pattern was cleaned up
-- for those three tables in 20260720182000 (dropped as redundant with the
-- already-correct "manage own X" ALL policy, per Supabase's
-- multiple_permissive_policies advisor), but income was missed since it
-- wasn't visible in the locally-tracked migration history at the time.
-- Apply the same cleanup here for consistency and to resolve the remaining
-- multiple_permissive_policies / auth_rls_initplan advisor findings on income.

drop policy if exists "Users can only delete own income" on public.income;
drop policy if exists "Users can only insert own income" on public.income;
drop policy if exists "Users can only see own income" on public.income;
drop policy if exists "Users can only update own income" on public.income;
