-- 20260720182000 revoked EXECUTE on check_token_refresh_rate_limit from
-- anon/authenticated directly, which was a no-op: new functions grant
-- EXECUTE to PUBLIC by default, and anon/authenticated inherit that PUBLIC
-- grant rather than holding it directly, so revoking from the roles
-- themselves doesn't remove it. Must revoke from PUBLIC, then grant back
-- only to the role the edge function actually uses (service_role).

revoke execute on function public.check_token_refresh_rate_limit(uuid, int, int) from public;
grant execute on function public.check_token_refresh_rate_limit(uuid, int, int) to service_role;
