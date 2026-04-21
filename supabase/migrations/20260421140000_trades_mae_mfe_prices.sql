-- Optional excursion prices for MAE/MFE analytics (manual or future broker fill)
alter table public.trades
  add column if not exists mae_price numeric;

alter table public.trades
  add column if not exists mfe_price numeric;
