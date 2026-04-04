-- Support full account deletion: per-user journal rows, trades cascade with accounts,
-- and RLS so users only see their own journal entries.
--
-- If journal_entries already had rows with no owner, user_id stays null and RLS will hide them.
-- Assign user_id in SQL for those rows if you need to recover them, or delete orphans manually.

-- ─── journal_entries.user_id (cascade when auth user is deleted) ───────────
alter table public.journal_entries
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

create index if not exists journal_entries_user_id_idx on public.journal_entries (user_id);

alter table public.journal_entries enable row level security;

drop policy if exists journal_entries_select_own on public.journal_entries;
create policy journal_entries_select_own
  on public.journal_entries for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists journal_entries_insert_own on public.journal_entries;
create policy journal_entries_insert_own
  on public.journal_entries for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists journal_entries_update_own on public.journal_entries;
create policy journal_entries_update_own
  on public.journal_entries for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists journal_entries_delete_own on public.journal_entries;
create policy journal_entries_delete_own
  on public.journal_entries for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ─── trades → accounts: CASCADE so deleting user → accounts → trades ───────
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'trades'
      and c.contype = 'f'
      and pg_get_constraintdef(c.oid) like '%account_id%'
      and pg_get_constraintdef(c.oid) ilike '%references%accounts%'
  loop
    execute format('alter table public.trades drop constraint %I', r.conname);
  end loop;
end $$;

do $$
begin
  alter table public.trades
    add constraint trades_account_id_fkey
    foreign key (account_id) references public.accounts (id) on delete cascade;
exception
  when duplicate_object then
    null;
end $$;
