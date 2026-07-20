-- 20260720184000 revoked EXECUTE on notify_welcome_email from PUBLIC only,
-- which was incomplete: anon and authenticated held direct grants on this
-- function (not just an inherited PUBLIC grant, unlike
-- check_token_refresh_rate_limit), so they were still able to call it after
-- that migration. Revoke from them explicitly too.

revoke execute on function public.notify_welcome_email() from public, anon, authenticated;
