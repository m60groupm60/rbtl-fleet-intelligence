-- Run in Supabase SQL Editor after creating your Supabase project.
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 role text not null check (role in ('manager','driver')) default 'driver',
 display_name text not null default '',
 inspector_ids text[] not null default '{}',
 created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
-- Each signed-in user may read their own role and inspector IDs, but cannot modify them.
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles for select to authenticated using ((select auth.uid())=id);
-- IMPORTANT: No user-facing INSERT/UPDATE/DELETE policies. Only the Supabase dashboard admin may assign roles.
-- Example (replace UUID with an actual auth.users ID, and inspector ID with an actual inspector ID):
-- insert into public.profiles(id,role,display_name,inspector_ids)
-- values ('00000000-0000-0000-0000-000000000000','driver','Example Driver',ARRAY['INSPECTOR_ID_HERE']);
