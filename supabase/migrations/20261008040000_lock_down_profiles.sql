-- Lock down public.profiles.
--
-- Previously four policies ("Anyone can read/insert/update/delete profiles",
-- USING true) let anyone holding the public anon key read every row and
-- rewrite or delete any profile — including swapping a victim's
-- telegram_chat_id to take over their account via Telegram login.
--
-- All app reads/writes of profiles now go through server routes using the
-- service role (which bypasses RLS). Signed-in Supabase-auth users may still
-- read/update their own row; role/tier changes stay blocked by the
-- enforce_profile_privilege_lock trigger.

drop policy if exists "Anyone can read profiles" on public.profiles;
drop policy if exists "Anyone can insert profiles" on public.profiles;
drop policy if exists "Anyone can update profiles" on public.profiles;
drop policy if exists "Anyone can delete profiles" on public.profiles;

alter table public.profiles enable row level security;

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles
  for select to authenticated using (auth.uid() = id);

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
