-- Auth + role/profile + RLS policies for users, branches, employees, positions.

begin;

-- Ensure branch_admin role is accepted.
alter table public.users
  drop constraint if exists users_role_check;

alter table public.users
  add constraint users_role_check
  check (role in ('admin', 'branch_admin', 'employee', 'night_manager', 'rider_incharge'));

-- Utility functions for RLS (security definer to avoid recursion with RLS lookups).
create or replace function public.app_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.role
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function public.app_current_branch_id()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select u.branch_id
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.app_current_role() = 'admin', false);
$$;

create or replace function public.is_branch_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.app_current_role() = 'branch_admin', false);
$$;

create or replace function public.is_night_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.app_current_role() in ('night_manager', 'rider_incharge'), false);
$$;

-- Login helper: allow username login by resolving to email.
create or replace function public.lookup_login_email(p_username text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.email
  from public.users u
  where lower(u.username) = lower(trim(p_username))
  limit 1;
$$;

grant execute on function public.lookup_login_email(text) to anon, authenticated;

-- Auto-create public.users profile when auth user is created.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate_username text;
  resolved_username text;
begin
  candidate_username := split_part(new.email, '@', 1);
  resolved_username := candidate_username;

  while exists(select 1 from public.users where username = resolved_username) loop
    resolved_username := candidate_username || '_' || substr(gen_random_uuid()::text, 1, 6);
  end loop;

  insert into public.users (auth_user_id, username, email, role)
  values (new.id, resolved_username, new.email, 'employee')
  on conflict (auth_user_id) do update
    set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Backfill existing rows by email if auth_user_id is null.
update public.users u
set auth_user_id = au.id
from auth.users au
where u.auth_user_id is null
  and lower(u.email) = lower(au.email);

-- RLS enablement
alter table public.users enable row level security;
alter table public.branches enable row level security;
alter table public.positions enable row level security;
alter table public.employees enable row level security;

-- USERS policies
drop policy if exists users_select_own_or_admin on public.users;
create policy users_select_own_or_admin
on public.users
for select
using (
  auth.uid() = auth_user_id
  or public.is_admin()
);

drop policy if exists users_update_own_or_admin on public.users;
create policy users_update_own_or_admin
on public.users
for update
using (
  auth.uid() = auth_user_id
  or public.is_admin()
)
with check (
  auth.uid() = auth_user_id
  or public.is_admin()
);

drop policy if exists users_insert_admin_only on public.users;
create policy users_insert_admin_only
on public.users
for insert
with check (public.is_admin());

drop policy if exists users_delete_admin_only on public.users;
create policy users_delete_admin_only
on public.users
for delete
using (public.is_admin());

-- BRANCHES policies
drop policy if exists branches_select_authenticated on public.branches;
create policy branches_select_authenticated
on public.branches
for select
using (auth.uid() is not null);

drop policy if exists branches_insert_admin_only on public.branches;
create policy branches_insert_admin_only
on public.branches
for insert
with check (public.is_admin());

drop policy if exists branches_update_admin_only on public.branches;
create policy branches_update_admin_only
on public.branches
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists branches_delete_admin_only on public.branches;
create policy branches_delete_admin_only
on public.branches
for delete
using (public.is_admin());

-- POSITIONS policies
drop policy if exists positions_select_authenticated on public.positions;
create policy positions_select_authenticated
on public.positions
for select
using (auth.uid() is not null);

drop policy if exists positions_insert_admin_only on public.positions;
create policy positions_insert_admin_only
on public.positions
for insert
with check (public.is_admin());

drop policy if exists positions_update_admin_only on public.positions;
create policy positions_update_admin_only
on public.positions
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists positions_delete_admin_only on public.positions;
create policy positions_delete_admin_only
on public.positions
for delete
using (public.is_admin() and lower(name) <> 'rider');

-- EMPLOYEES policies
drop policy if exists employees_select_by_role on public.employees;
create policy employees_select_by_role
on public.employees
for select
using (
  public.is_admin()
  or (
    public.is_branch_admin()
    and branch_id = public.app_current_branch_id()
  )
  or (
    public.is_night_manager()
    and branch_id = public.app_current_branch_id()
    and lower(coalesce(post, '')) = 'rider'
  )
);

drop policy if exists employees_insert_by_role on public.employees;
create policy employees_insert_by_role
on public.employees
for insert
with check (
  public.is_admin()
  or (
    public.is_branch_admin()
    and branch_id = public.app_current_branch_id()
  )
  or (
    public.is_night_manager()
    and branch_id = public.app_current_branch_id()
    and lower(coalesce(post, '')) = 'rider'
  )
);

drop policy if exists employees_update_by_role on public.employees;
create policy employees_update_by_role
on public.employees
for update
using (
  public.is_admin()
  or (
    public.is_branch_admin()
    and branch_id = public.app_current_branch_id()
  )
  or (
    public.is_night_manager()
    and branch_id = public.app_current_branch_id()
    and lower(coalesce(post, '')) = 'rider'
  )
)
with check (
  public.is_admin()
  or (
    public.is_branch_admin()
    and branch_id = public.app_current_branch_id()
  )
  or (
    public.is_night_manager()
    and branch_id = public.app_current_branch_id()
    and lower(coalesce(post, '')) = 'rider'
  )
);

drop policy if exists employees_delete_admin_only on public.employees;
create policy employees_delete_admin_only
on public.employees
for delete
using (public.is_admin());

-- Storage bucket for employee documents
insert into storage.buckets (id, name, public)
values ('employee-documents', 'employee-documents', true)
on conflict (id) do nothing;

drop policy if exists employee_docs_read_authenticated on storage.objects;
create policy employee_docs_read_authenticated
on storage.objects
for select
using (
  bucket_id = 'employee-documents'
  and auth.uid() is not null
);

drop policy if exists employee_docs_write_by_role on storage.objects;
create policy employee_docs_write_by_role
on storage.objects
for insert
with check (
  bucket_id = 'employee-documents'
  and (
    public.is_admin()
    or public.is_branch_admin()
    or public.is_night_manager()
  )
);

drop policy if exists employee_docs_update_by_role on storage.objects;
create policy employee_docs_update_by_role
on storage.objects
for update
using (
  bucket_id = 'employee-documents'
  and (
    public.is_admin()
    or public.is_branch_admin()
    or public.is_night_manager()
  )
)
with check (
  bucket_id = 'employee-documents'
  and (
    public.is_admin()
    or public.is_branch_admin()
    or public.is_night_manager()
  )
);

drop policy if exists employee_docs_delete_by_role on storage.objects;
create policy employee_docs_delete_by_role
on storage.objects
for delete
using (
  bucket_id = 'employee-documents'
  and (
    public.is_admin()
    or public.is_branch_admin()
    or public.is_night_manager()
  )
);

commit;
