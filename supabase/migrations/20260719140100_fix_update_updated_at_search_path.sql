-- public.update_updated_at had a mutable search_path (flagged by Supabase's
-- function_search_path_mutable advisor), which lets a caller with schema-creation
-- privileges shadow objects the function resolves unqualified. Pin it to empty
-- so all references must be fully schema-qualified.

create or replace function public.update_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
