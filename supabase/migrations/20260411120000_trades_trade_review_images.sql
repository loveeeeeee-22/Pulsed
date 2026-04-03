-- Screenshots / pasted chart images for trade review (separate from rich-text notes).
alter table public.trades
  add column if not exists trade_review_images jsonb not null default '[]'::jsonb;

comment on column public.trades.trade_review_images is 'Array of {id, src} objects; src is typically a data URL for pasted screenshots.';
