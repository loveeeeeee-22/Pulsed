-- MetaApi cloud account id for MT4/MT5 broker_connections rows.
alter table public.broker_connections
  add column if not exists metaapi_account_id text;

comment on column public.broker_connections.metaapi_account_id is
  'MetaApi Metatrader account _id; used for RPC sync and disconnect.';

create unique index if not exists broker_connections_user_metaapi_account_idx
  on public.broker_connections (user_id, metaapi_account_id)
  where metaapi_account_id is not null;
