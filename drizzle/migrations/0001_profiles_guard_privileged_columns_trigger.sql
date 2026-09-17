create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- service role / server-side context (no session user) is trusted
  if auth.uid() is null then
    return new;
  end if;

  -- workspace admins may change privileged fields
  if public.has_role(auth.uid(), 'admin') then
    return new;
  end if;

  -- everyone else: role, is_active, workspace_id always stay unchanged
  new.role := old.role;
  new.is_active := old.is_active;
  new.workspace_id := old.workspace_id;
  return new;
end
$$;

revoke execute on function public.profiles_guard_privileged_columns() from anon, authenticated;

drop trigger if exists profiles_guard_privileged_columns on public.profiles;
create trigger profiles_guard_privileged_columns
before update on public.profiles
for each row execute function public.profiles_guard_privileged_columns();