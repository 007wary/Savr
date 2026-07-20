-- notify_welcome_email is a SECURITY DEFINER trigger function (fires
-- on_new_user_profile after insert on public.user_profiles). It was
-- publicly callable via /rest/v1/rpc/notify_welcome_email by anon and
-- authenticated, letting anyone trigger a welcome-email send (and the
-- Vault-secret-fetching + Firebase/Mailchimp/Brevo call path behind it)
-- with no real input. It is never meant to be called directly — only via
-- the trigger — so revoke the inherited PUBLIC grant.
--
-- Triggers execute as the function's owner regardless of EXECUTE grants,
-- so this does not affect the on_new_user_profile trigger's behavior.
--
-- This revoke targets PUBLIC only. anon/authenticated turned out to hold
-- direct grants here too (not just an inherited PUBLIC grant), so this was
-- incomplete — actually fixed in
-- 20260720182801_lock_down_welcome_email_trigger_rpc.sql, which also
-- revokes from anon and authenticated explicitly.

revoke execute on function public.notify_welcome_email() from public;
