create table if not exists public.admin_session_state (
  id boolean primary key default true,
  revoked_before timestamptz not null default 'epoch',
  constraint admin_session_state_singleton check (id)
);

insert into public.admin_session_state (id, revoked_before)
values (true, 'epoch')
on conflict (id) do nothing;

alter table public.admin_session_state enable row level security;
;
