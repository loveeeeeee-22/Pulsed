-- Whether the user has completed trade review (modal) for this row.
alter table public.trades
  add column if not exists reviewed boolean not null default false;

comment on column public.trades.reviewed is 'True after user closes trade review with “Mark as reviewed” (or equivalent).';

-- Existing rows pre-feature: treat as already reviewed so the queue only applies to new trades.
update public.trades set reviewed = true where reviewed = false;
