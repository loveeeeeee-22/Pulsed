-- Global app flags (maintenance mode, etc.). Row id `maintenance` drives the public maintenance screen.

create table if not exists public.app_settings (
  id text primary key,
  is_active boolean not null default false,
  message text,
  ends_at timestamptz,
  started_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.app_settings is 'Key/value-style settings; maintenance row is read by all clients.';

insert into public.app_settings (id, is_active, message, ends_at, started_at, updated_at)
values (
  'maintenance',
  false,
  'We are performing scheduled maintenance to improve your experience. We will be back shortly.',
  null,
  null,
  now()
)
on conflict (id) do nothing;

alter table public.app_settings enable row level security;

-- Anyone can read settings (needed for pre-auth maintenance gate + realtime).
drop policy if exists app_settings_select_all on public.app_settings;
create policy app_settings_select_all
  on public.app_settings for select
  using (true);

-- No insert/update/delete for anon/authenticated — updates go through service role (API route).

-- Optional: Supabase Dashboard → Database → Publications → supabase_realtime → add `app_settings`
-- so UPDATE events reach clients immediately (polling still runs every 60s without this).
