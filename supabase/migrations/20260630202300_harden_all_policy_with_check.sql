-- The broad "Users can manage own X" ALL policies on budgets, expenses, and
-- recurring_expenses had no WITH CHECK clause, meaning that policy alone would let
-- a user insert/update a row claiming someone else's user_id. Today this is masked
-- by the separate per-command INSERT/UPDATE policies on the same tables (Postgres
-- requires every applicable policy to pass), but if those narrower policies are ever
-- removed, the ALL policy's missing WITH CHECK silently reopens cross-user writes.
-- Adding WITH CHECK here makes the ALL policy correct on its own, independent of the
-- other policies' continued existence.

alter policy "Users can manage own budgets" on public.budgets
  with check (auth.uid() = user_id);

alter policy "Users can manage own expenses" on public.expenses
  with check (auth.uid() = user_id);

alter policy "Users can manage own recurring expenses" on public.recurring_expenses
  with check (auth.uid() = user_id);
