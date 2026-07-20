-- google-token-refresh had no rate limiting: any user with a valid Supabase
-- JWT could call it as fast as they wanted, burning the app's shared Google
-- OAuth client quota. This adds a small per-user attempt log and a
-- SECURITY DEFINER helper the edge function calls before hitting Google,
-- capping refreshes to 10 per user per 5-minute window.

create table if not exists public.token_refresh_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_token_refresh_attempts_user_time
  on public.token_refresh_attempts(user_id, created_at desc);

alter table public.token_refresh_attempts enable row level security;

-- No client-facing policies: this table is only ever touched by the
-- SECURITY DEFINER function below, called from the edge function using the
-- service role. Regular users have no direct access.

create or replace function public.check_token_refresh_rate_limit(
  p_user_id uuid,
  p_max_attempts int default 10,
  p_window_minutes int default 5
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt_count int;
begin
  select count(*) into attempt_count
  from public.token_refresh_attempts
  where user_id = p_user_id
    and created_at > now() - make_interval(mins => p_window_minutes);

  if attempt_count >= p_max_attempts then
    return false;
  end if;

  insert into public.token_refresh_attempts (user_id) values (p_user_id);

  -- Opportunistically prune old rows so the table doesn't grow unbounded.
  delete from public.token_refresh_attempts
  where created_at < now() - make_interval(mins => p_window_minutes * 4);

  return true;
end;
$$;
