-- Run this in the Supabase SQL editor (or use the Supabase CLI) if you have not created these objects yet.
-- Profiles store app-specific user fields; auth email and created_at stay on auth.users.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text,
  contact_email text,
  first_name text,
  last_name text,
  date_of_birth date,
  gender text,
  country_code text,
  city text,
  street text,
  postal_code text,
  phone text,
  avatar_url text,
  updated_at timestamptz not null default now()
);

create index if not exists profiles_country_code_idx on public.profiles (country_code);

create unique index if not exists profiles_username_unique_lower
  on public.profiles (lower(trim(username)))
  where username is not null and length(trim(username)) > 0;

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

create or replace function public.set_profiles_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_profiles_updated_at();

-- Optional: empty profile row when a user signs up (so the app can update without insert quirks).
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Storage: run supabase/migrations/20260416120000_storage_avatars_bucket.sql (creates "avatars" bucket + RLS).
