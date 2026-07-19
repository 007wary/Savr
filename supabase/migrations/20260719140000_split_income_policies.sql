-- income currently has only a single blanket "ALL" policy, unlike budgets, expenses,
-- and recurring_expenses which each also have per-command SELECT/INSERT/UPDATE/DELETE
-- policies. The ALL policy already carries both USING and WITH CHECK, so this is not
-- an active vulnerability, but it leaves income inconsistent with the rest of the
-- schema's defense-in-depth pattern established in 20260630202300_harden_all_policy_with_check.sql.

drop policy if exists "Users can only see own income" on public.income;
create policy "Users can only see own income" on public.income
  for select using (auth.uid() = user_id);

drop policy if exists "Users can only insert own income" on public.income;
create policy "Users can only insert own income" on public.income
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can only update own income" on public.income;
create policy "Users can only update own income" on public.income
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can only delete own income" on public.income;
create policy "Users can only delete own income" on public.income
  for delete using (auth.uid() = user_id);
