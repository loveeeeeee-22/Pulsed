-- Allow pending state for broker connections (MetaApi / API approval flows).
alter table public.broker_connections
  drop constraint if exists broker_connections_sync_status_check;

alter table public.broker_connections
  add constraint broker_connections_sync_status_check
  check (sync_status in ('healthy', 'error', 'syncing', 'pending'));

comment on column public.broker_connections.sync_status is 'healthy | error | syncing | pending';
