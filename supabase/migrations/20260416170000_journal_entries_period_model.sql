-- Journal entries period model for Pulsed:
-- adds journal_type/period_key/content columns, unique period identity,
-- and updated_at trigger. Includes optional backfill from legacy
-- date + pre_market_notes fields when present.

create extension if not exists pgcrypto;

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  journal_type text,
  period_key text,
  content text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.journal_entries
  add column if not exists journal_type text,
  add column if not exists period_key text,
  add column if not exists content text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.journal_entries
set
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where created_at is null or updated_at is null;

alter table public.journal_entries
  alter column created_at set default now(),
  alter column updated_at set default now(),
  alter column created_at set not null,
  alter column updated_at set not null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'journal_entries'
      and column_name = 'date'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'journal_entries'
      and column_name = 'pre_market_notes'
  ) then
    execute $sql$
      update public.journal_entries
      set
        journal_type = coalesce(journal_type, 'daily'),
        period_key = coalesce(period_key, date::text),
        content = coalesce(content, pre_market_notes),
        created_at = coalesce(created_at, now()),
        updated_at = coalesce(updated_at, now())
      where date is not null
        and (
          journal_type is null
          or period_key is null
          or content is null
        )
    $sql$;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_journal_type_check'
  ) then
    alter table public.journal_entries
      add constraint journal_entries_journal_type_check
      check (journal_type in ('daily', 'weekly', 'monthly'));
  end if;
end $$;

create index if not exists journal_entries_user_id_idx
  on public.journal_entries (user_id);

create index if not exists journal_entries_user_type_created_idx
  on public.journal_entries (user_id, journal_type, created_at desc);

create unique index if not exists journal_entries_user_type_period_key_uidx
  on public.journal_entries (user_id, journal_type, period_key);

create or replace function public.set_journal_entries_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists journal_entries_set_updated_at on public.journal_entries;
create trigger journal_entries_set_updated_at
before update on public.journal_entries
for each row
execute function public.set_journal_entries_updated_at();
