-- Broker OAuth/API connections per user (Pulsed).
-- Run in Supabase SQL Editor if not using CLI migrations.

create table if not exists public.broker_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  broker_name text not null,
  environment text not null default 'live',
  credentials jsonb not null default '{}'::jsonb,
  account_id text,
  account_name text,
  last_sync_at timestamptz,
  sync_status text not null default 'healthy',
  trades_imported integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint broker_connections_environment_check check (environment in ('live', 'demo')),
  constraint broker_connections_sync_status_check check (sync_status in ('healthy', 'error', 'syncing'))
);

create index if not exists broker_connections_user_id_idx on public.broker_connections (user_id);
create index if not exists broker_connections_broker_name_idx on public.broker_connections (broker_name);

comment on table public.broker_connections is 'User-linked broker integrations for auto-import and replay.';
comment on column public.broker_connections.credentials is 'Broker tokens/credentials; encrypt at application layer before insert.';
comment on column public.broker_connections.broker_name is 'Stable slug e.g. tradovate, rithmic, interactive_brokers.';

alter table public.broker_connections enable row level security;

create policy broker_connections_select_own
  on public.broker_connections for select
  using (auth.uid() = user_id);

create policy broker_connections_insert_own
  on public.broker_connections for insert
  with check (auth.uid() = user_id);

create policy broker_connections_update_own
  on public.broker_connections for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy broker_connections_delete_own
  on public.broker_connections for delete
  using (auth.uid() = user_id);
