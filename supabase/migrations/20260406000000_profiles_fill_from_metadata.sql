-- Populate `profiles` fields from Supabase Auth user metadata at signup.
-- This keeps Sign Up informative while still using email verification.

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (
    id,
    username,
    first_name,
    last_name,
    phone,
    country_code,
    city
  )
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data->>'username', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'first_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'last_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'phone', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'country_code', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'city', '')), '')
  )
  on conflict (id) do update set
    username = coalesce(excluded.username, public.profiles.username),
    first_name = coalesce(excluded.first_name, public.profiles.first_name),
    last_name = coalesce(excluded.last_name, public.profiles.last_name),
    phone = coalesce(excluded.phone, public.profiles.phone),
    country_code = coalesce(excluded.country_code, public.profiles.country_code),
    city = coalesce(excluded.city, public.profiles.city);

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

