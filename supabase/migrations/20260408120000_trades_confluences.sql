-- Free-form confluence labels on trades (review modal).
alter table public.trades
  add column if not exists confluences jsonb not null default '[]'::jsonb;

comment on column public.trades.confluences is 'Array of user-defined confluence tag strings (JSON array).';
