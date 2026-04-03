-- Add stored time zone for the user (used by charts/journal formatting later)
alter table public.profiles add column if not exists time_zone text;

