-- MT5 EA ingestion: per-user API keys + dedupe by broker ticket per Pulsed account.

-- ─── API keys (authenticated users manage their own rows via RLS) ────────────
create table if not exists public.user_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  api_key text not null unique,
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);

create index if not exists user_api_keys_user_id_idx on public.user_api_keys (user_id);

alter table public.user_api_keys enable row level security;

drop policy if exists user_api_keys_select_own on public.user_api_keys;
create policy user_api_keys_select_own
  on public.user_api_keys for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists user_api_keys_insert_own on public.user_api_keys;
create policy user_api_keys_insert_own
  on public.user_api_keys for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists user_api_keys_update_own on public.user_api_keys;
create policy user_api_keys_update_own
  on public.user_api_keys for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists user_api_keys_delete_own on public.user_api_keys;
create policy user_api_keys_delete_own
  on public.user_api_keys for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ─── Trades: MT5 ticket for deduplication ──────────────────────────────────
alter table public.trades add column if not exists mt5_ticket bigint;

create unique index if not exists trades_mt5_ticket_account_idx
  on public.trades (account_id, mt5_ticket)
  where mt5_ticket is not null;

-- ─── Optional helper when inserting keys from SQL ────────────────────────────
create or replace function public.generate_api_key()
returns text
language sql
as $$
  select encode(gen_random_bytes(24), 'hex');
$$;
