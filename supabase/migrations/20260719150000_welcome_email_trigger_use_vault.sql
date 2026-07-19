-- The on_new_user_profile trigger previously called supabase_functions.http_request
-- with a service_role JWT hardcoded directly in the trigger's action_statement,
-- which is stored in plaintext in pg_trigger / information_schema.triggers and
-- readable by any role with sufficient catalog privileges. This replaces it with
-- a SECURITY DEFINER wrapper that resolves the key from Supabase Vault at call
-- time via pg_net, so no secret is persisted in trigger metadata.
--
-- Requires a Vault secret named 'welcome_email_service_key' holding the current
-- service_role key (created out-of-band via vault.create_secret(), not in a
-- migration file, so it is never committed to source control).
--
-- Also fixes a pre-existing bug: the original trigger sent an empty '{}' body,
-- so welcome-email's `payload.record.email` was always undefined and the
-- Mailchimp/Brevo calls never had real user data. This now forwards the new
-- row as `{ record: <row> }`, matching what welcome-email/index.ts expects.

create or replace function public.notify_welcome_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  service_key text;
begin
  select decrypted_secret into service_key
  from vault.decrypted_secrets
  where name = 'welcome_email_service_key';

  perform extensions.net.http_post(
    url := 'https://fsrbsqhlgfdqugixqtxc.supabase.co/functions/v1/welcome-email',
    headers := jsonb_build_object(
      'Content-type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object('record', to_jsonb(new)),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

drop trigger if exists on_new_user_profile on public.user_profiles;
create trigger on_new_user_profile
  after insert on public.user_profiles
  for each row execute function public.notify_welcome_email();
