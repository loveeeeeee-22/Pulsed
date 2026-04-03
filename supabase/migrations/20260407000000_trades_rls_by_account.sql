-- Prevent users from seeing/modifying other users' trades.
-- This scopes trades to the owner of the linked account.

alter table public.trades enable row level security;

drop policy if exists trades_select_own on public.trades;
create policy trades_select_own
  on public.trades for select
  using (
    exists (
      select 1 from public.accounts a
      where a.id = trades.account_id
        and a.user_id = auth.uid()
    )
  );

drop policy if exists trades_insert_own on public.trades;
create policy trades_insert_own
  on public.trades for insert
  with check (
    exists (
      select 1 from public.accounts a
      where a.id = trades.account_id
        and a.user_id = auth.uid()
    )
  );

drop policy if exists trades_update_own on public.trades;
create policy trades_update_own
  on public.trades for update
  using (
    exists (
      select 1 from public.accounts a
      where a.id = trades.account_id
        and a.user_id = auth.uid()
    )
  );

drop policy if exists trades_delete_own on public.trades;
create policy trades_delete_own
  on public.trades for delete
  using (
    exists (
      select 1 from public.accounts a
      where a.id = trades.account_id
        and a.user_id = auth.uid()
    )
  );

