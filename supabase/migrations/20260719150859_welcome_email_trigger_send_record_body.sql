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
$$;;
