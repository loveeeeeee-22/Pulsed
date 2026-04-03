-- ═══════════════════════════════════════════════════════════════════════════
-- Pulsed: run this entire script in Supabase → SQL Editor → New query → Run
-- Safe to run more than once (uses IF NOT EXISTS / DROP POLICY IF EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── broker_connections ───────────────────────────────────────────────────
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
  sync_events jsonb not null default '[]'::jsonb
);

alter table public.broker_connections
  add column if not exists pulsed_account_id uuid references public.accounts (id) on delete set null;

create index if not exists broker_connections_user_id_idx
  on public.broker_connections (user_id);
create index if not exists broker_connections_user_broker_idx
  on public.broker_connections (user_id, broker_name)
  where is_active = true;
create index if not exists broker_connections_pulsed_account_idx
  on public.broker_connections (pulsed_account_id)
  where pulsed_account_id is not null;

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

-- ─── historical_cache (Tradovate replay cache, 24h TTL in app) ─────────────
create table if not exists public.historical_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  resolution text not null,
  date date not null,
  cache_key text not null,
  candles_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint historical_cache_cache_key_key unique (cache_key)
);

create index if not exists historical_cache_user_created_idx
  on public.historical_cache (user_id, created_at desc);

alter table public.historical_cache enable row level security;

drop policy if exists historical_cache_select_own on public.historical_cache;
create policy historical_cache_select_own
  on public.historical_cache for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists historical_cache_insert_own on public.historical_cache;
create policy historical_cache_insert_own
  on public.historical_cache for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists historical_cache_update_own on public.historical_cache;
create policy historical_cache_update_own
  on public.historical_cache for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists historical_cache_delete_own on public.historical_cache;
create policy historical_cache_delete_own
  on public.historical_cache for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ─── sync_logs (audit trail for broker sync) ────────────────────────────────
create table if not exists public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.broker_connections (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists sync_logs_connection_idx
  on public.sync_logs (connection_id, created_at desc);

alter table public.sync_logs enable row level security;

drop policy if exists sync_logs_select_own on public.sync_logs;
create policy sync_logs_select_own
  on public.sync_logs for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists sync_logs_insert_own on public.sync_logs;
create policy sync_logs_insert_own
  on public.sync_logs for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- ─── trades.confluences (review modal tags) if missing ─────────────────────
alter table public.trades
  add column if not exists confluences jsonb not null default '[]'::jsonb;
