-- SCALVS.ai cloud sync: one workspace document per signed-in user.
-- Run in the Supabase SQL editor (or `supabase db push`).

create table if not exists public.workspaces (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  state      jsonb       not null,
  updated_at timestamptz not null default now()
);

alter table public.workspaces enable row level security;

-- Each user can only see and change their own workspace.
drop policy if exists "workspaces_select_own" on public.workspaces;
create policy "workspaces_select_own" on public.workspaces
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "workspaces_insert_own" on public.workspaces;
create policy "workspaces_insert_own" on public.workspaces
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "workspaces_update_own" on public.workspaces;
create policy "workspaces_update_own" on public.workspaces
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "workspaces_delete_own" on public.workspaces;
create policy "workspaces_delete_own" on public.workspaces
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Guard against oversized documents (about 2 MB).
alter table public.workspaces drop constraint if exists workspaces_state_size;
alter table public.workspaces add constraint workspaces_state_size check (pg_column_size(state) < 2000000);
