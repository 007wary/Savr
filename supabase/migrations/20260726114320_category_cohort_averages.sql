-- Cohort comparison for the dashboard: "you spent less than most Savr users
-- on Dining this month". Needs a cross-user aggregate, which local SQLite
-- can never see (each device only has its own data) — this has to live here.
--
-- Deliberately NOT per-user or auth-gated: the result is identical for every
-- caller (a global average per category for the current month), so there's
-- no reason to authenticate the request or rate-limit it per user. Exposing
-- it as a SECURITY DEFINER RPC to anon/authenticated lets the app call it
-- with the existing anon-key client, no new edge function needed.
--
-- Privacy: only ever returns an aggregate (avg + user_count), never a row a
-- single user could be identified from. min_users guards against a category
-- with only 1-2 spenders this month effectively exposing one person's spend
-- as "the average" — such categories are simply omitted from the result.
create or replace function public.get_category_cohort_averages(p_month text, p_min_users int default 5)
returns table (category text, avg_amount numeric, user_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.category,
    round(sum(e.amount) / count(distinct e.user_id), 2) as avg_amount,
    count(distinct e.user_id) as user_count
  from public.expenses e
  where e.date >= (p_month || '-01')::date
    and e.date < ((p_month || '-01')::date + interval '1 month')
  group by e.category
  having count(distinct e.user_id) >= p_min_users;
$$;

revoke execute on function public.get_category_cohort_averages(text, int) from public;
grant execute on function public.get_category_cohort_averages(text, int) to anon, authenticated;
