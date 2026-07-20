-- Replace the hardcoded-JWT trigger with a wrapper function that resolves the
-- service_role key from Vault at call time via pg_net, so no secret is stored
-- in trigger metadata (pg_trigger/information_schema.triggers), which is
-- readable by any role with sufficient catalog privileges.

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
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

drop trigger if exists on_new_user_profile on public.user_profiles;
create trigger on_new_user_profile
  after insert on public.user_profiles
  for each row execute function public.notify_welcome_email();;
