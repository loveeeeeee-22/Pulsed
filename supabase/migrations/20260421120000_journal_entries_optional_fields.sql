-- Add optional journal columns (safe, additive). Does not drop data.
-- For full RLS/policy repair, see existing migration 20260415180000_user_account_deletion.sql

alter table public.journal_entries
  add column if not exists mood integer,
  add column if not exists pre_market_notes text,
  add column if not exists daily_plan text,
  add column if not exists market_observations text,
  add column if not exists what_went_well text,
  add column if not exists what_to_improve text,
  add column if not exists rules_followed text,
  add column if not exists overall_grade text;

alter table public.journal_entries
  alter column journal_type set default 'daily';
