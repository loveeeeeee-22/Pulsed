-- Links each account to a user and stores prop vs personal + firm/broker name.
-- Run in Supabase SQL editor if your `accounts` table already exists.

alter table public.accounts add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.accounts add column if not exists category text;
alter table public.accounts add column if not exists provider text;

create index if not exists accounts_user_id_idx on public.accounts (user_id);

comment on column public.accounts.category is 'prop | personal';
comment on column public.accounts.provider is 'Prop firm or broker name';
