-- Withdrawals and legacy credits (non-trade) cash movements per account.
-- `kind` expense = money out (profit withdrawal); income = credit in. Balance is accounts.balance + trade P&L + signed cash rows.

create table if not exists public.account_cash_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  kind text not null check (kind in ('income', 'expense')),
  amount numeric(14, 2) not null check (amount > 0),
  category text not null,
  occurred_on date not null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists account_cash_transactions_user_id_idx
  on public.account_cash_transactions (user_id);

create index if not exists account_cash_transactions_account_id_idx
  on public.account_cash_transactions (account_id);

create index if not exists account_cash_transactions_occurred_on_idx
  on public.account_cash_transactions (occurred_on desc);

comment on table public.account_cash_transactions is 'Non-trade withdrawals (expense) and credits (income) affecting account equity.';

create or replace function public.set_account_cash_transaction_user_id()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_account_cash_transactions_set_user on public.account_cash_transactions;
create trigger trg_account_cash_transactions_set_user
  before insert on public.account_cash_transactions
  for each row
  execute function public.set_account_cash_transaction_user_id();

alter table public.account_cash_transactions enable row level security;

drop policy if exists account_cash_transactions_select_own on public.account_cash_transactions;
create policy account_cash_transactions_select_own
  on public.account_cash_transactions for select
  using (auth.uid() = user_id);

drop policy if exists account_cash_transactions_insert_own on public.account_cash_transactions;
create policy account_cash_transactions_insert_own
  on public.account_cash_transactions for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.accounts a
      where a.id = account_id
        and a.user_id = auth.uid()
    )
  );

drop policy if exists account_cash_transactions_delete_own on public.account_cash_transactions;
create policy account_cash_transactions_delete_own
  on public.account_cash_transactions for delete
  using (auth.uid() = user_id);
