alter table public.accounts
  add column if not exists environment text;

alter table public.accounts
  add column if not exists broker text;

alter table public.accounts
  add column if not exists currency text;

alter table public.accounts
  add column if not exists color text;

update public.accounts
set environment = coalesce(nullif(environment, ''), 'live')
where environment is null or environment = '';

update public.accounts
set currency = coalesce(nullif(currency, ''), 'USD')
where currency is null or currency = '';

update public.accounts
set color = coalesce(nullif(color, ''), '#7C3AED')
where color is null or color = '';

alter table public.accounts
  alter column currency set default 'USD';

alter table public.accounts
  alter column color set default '#7C3AED';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'accounts'
      and column_name = 'environment'
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'accounts_environment_check'
      and conrelid = 'public.accounts'::regclass
  ) then
    execute 'alter table public.accounts add constraint accounts_environment_check check (environment in (''live'', ''demo''))';
  end if;
end
$$;
