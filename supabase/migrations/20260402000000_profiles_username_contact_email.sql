-- Run this if you already created `profiles` and need username + contact email.

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists contact_email text;

create unique index if not exists profiles_username_unique_lower
  on public.profiles (lower(trim(username)))
  where username is not null and length(trim(username)) > 0;
