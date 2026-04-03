-- Broker OAuth / API connections for Pulsed (trade import & replay).
-- Run in Supabase SQL Editor if you do not use CLI migrations.

create table if not exists public.broker_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  broker_name text not null,
  environment text,
  credentials jsonb not null default '{}'::jsonb,
  account_id text,
  account_name text,
  last_sync_at timestamptz,
  sync_status text not null default 'healthy',
  trades_imported integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  -- Last few sync events for UI: [{ "at": "ISO", "message": "text", "ok": true }]
  sync_events jsonb not null default '[]'::jsonb
);

comment on table public.broker_connections is 'Linked broker accounts for auto-import and replay.';
comment on column public.broker_connections.broker_name is 'Stable id e.g. tradovate, rithmic';
comment on column public.broker_connections.environment is 'live | demo for Tradovate-style brokers';
comment on column public.broker_connections.credentials is 'Encrypted or token payload; never log in plain text.';
comment on column public.broker_connections.sync_status is 'healthy | error | syncing';

create index if not exists broker_connections_user_id_idx
  on public.broker_connections (user_id);

create index if not exists broker_connections_user_broker_idx
  on public.broker_connections (user_id, broker_name)
  where is_active = true;

alter table public.broker_connections enable row level security;

drop policy if exists broker_connections_select_own on public.broker_connections;
create policy broker_connections_select_own
  on public.broker_connections for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists broker_connections_insert_own on public.broker_connections;
create policy broker_connections_insert_own
  on public.broker_connections for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists broker_connections_update_own on public.broker_connections;
create policy broker_connections_update_own
  on public.broker_connections for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists broker_connections_delete_own on public.broker_connections;
create policy broker_connections_delete_own
  on public.broker_connections for delete
  to authenticated
  using ((select auth.uid()) = user_id);
