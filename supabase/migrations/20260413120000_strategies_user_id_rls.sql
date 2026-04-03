-- Scope playbooks (strategies) to the owning Supabase user.
alter table public.strategies
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

-- Backfill owner when playbook was tied to an account.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'strategies'
      and column_name = 'account_id'
  ) then
    update public.strategies s
    set user_id = a.user_id
    from public.accounts a
    where s.account_id is not null
      and s.account_id = a.id
      and s.user_id is null;
  end if;
end $$;

-- Backfill from trades: first account that used this strategy.
update public.strategies s
set user_id = sub.uid
from (
  select distinct on (t.strategy_id)
    t.strategy_id,
    a.user_id as uid
  from public.trades t
  inner join public.accounts a on a.id = t.account_id
  where t.strategy_id is not null
  order by t.strategy_id, t.date asc nulls last, t.id asc
) sub
where s.id = sub.strategy_id
  and s.user_id is null;

alter table public.strategies enable row level security;

drop policy if exists strategies_select_own on public.strategies;
create policy strategies_select_own
  on public.strategies for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists strategies_insert_own on public.strategies;
create policy strategies_insert_own
  on public.strategies for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists strategies_update_own on public.strategies;
create policy strategies_update_own
  on public.strategies for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists strategies_delete_own on public.strategies;
create policy strategies_delete_own
  on public.strategies for delete
  to authenticated
  using ((select auth.uid()) = user_id);
