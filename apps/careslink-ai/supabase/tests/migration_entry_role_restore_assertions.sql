-- Rollback-only PostgreSQL 16 assertion for the Supabase Hosted migration-role
-- topology. Invoke this file from a LOGIN session after that session has used
-- SET ROLE to enter the migration actor, so session_user <> current_user.
-- No role or other fixture survives the final ROLLBACK.

\set ON_ERROR_STOP on

begin;

do $preflight$
begin
  if current_setting('server_version_num')::integer < 160000 then
    raise exception 'migration entry-role restoration requires PostgreSQL 16 or newer';
  end if;

  if session_user = current_user then
    raise exception 'test requires session_user <> current_user';
  end if;

  if not coalesce((
    select role.rolcreaterole
    from pg_catalog.pg_roles as role
    where role.rolname = current_user
  ), false) then
    raise exception 'migration entry actor must have CREATEROLE';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_roles as role
    where role.rolname = 'careslink_migration_restore_test_owner'
  ) then
    raise exception 'migration restore test role already exists';
  end if;
end;
$preflight$;

select pg_catalog.set_config(
  'careslink.migration_entry_role',
  current_user,
  true
);

create role careslink_migration_restore_test_owner
  with nologin nosuperuser nocreatedb nocreaterole noinherit
    noreplication nobypassrls;

grant careslink_migration_restore_test_owner to current_user
  with admin false, inherit false, set true
  granted by current_user;

set role careslink_migration_restore_test_owner;

do $owner_window$
begin
  if current_user <> 'careslink_migration_restore_test_owner' then
    raise exception 'temporary owner role was not entered';
  end if;

  if session_user = current_user then
    raise exception 'temporary owner role collapsed into the transport login';
  end if;
end;
$owner_window$;

create temporary table careslink_migration_restore_acl_probe (
  value integer not null
);

do $grant_entry_actor$
begin
  execute pg_catalog.format(
    'grant select on table pg_temp.careslink_migration_restore_acl_probe to %I',
    pg_catalog.current_setting('careslink.migration_entry_role')
  );
end;
$grant_entry_actor$;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

do $restored_entry_actor$
begin
  if current_user
      <> pg_catalog.current_setting('careslink.migration_entry_role')
    or session_user = current_user
    or pg_catalog.current_setting('role')
      <> pg_catalog.current_setting('careslink.migration_entry_role')
    or not pg_catalog.has_table_privilege(
      current_user,
      'pg_temp.careslink_migration_restore_acl_probe',
      'SELECT'
    )
    or pg_catalog.has_table_privilege(
      session_user,
      'pg_temp.careslink_migration_restore_acl_probe',
      'SELECT'
    )
    or (
      select pg_catalog.pg_get_userbyid(relation.relowner)
      from pg_catalog.pg_class as relation
      where relation.oid =
        'pg_temp.careslink_migration_restore_acl_probe'::regclass
    ) <> 'careslink_migration_restore_test_owner'
  then
    raise exception 'temporary owner window did not restore the migration entry actor';
  end if;
end;
$restored_entry_actor$;

set role careslink_migration_restore_test_owner;

do $revoke_entry_actor$
begin
  execute pg_catalog.format(
    'revoke select on table pg_temp.careslink_migration_restore_acl_probe from %I',
    pg_catalog.current_setting('careslink.migration_entry_role')
  );

  if pg_catalog.has_table_privilege(
    pg_catalog.current_setting('careslink.migration_entry_role'),
    'pg_temp.careslink_migration_restore_acl_probe',
    'SELECT'
  ) then
    raise exception 'captured entry actor retained the temporary ACL';
  end if;
end;
$revoke_entry_actor$;

drop table pg_temp.careslink_migration_restore_acl_probe;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

revoke careslink_migration_restore_test_owner from current_user
  granted by current_user;

drop role careslink_migration_restore_test_owner;

rollback;
