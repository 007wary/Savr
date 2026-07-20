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
  for delete using (auth.uid() = user_id);;
