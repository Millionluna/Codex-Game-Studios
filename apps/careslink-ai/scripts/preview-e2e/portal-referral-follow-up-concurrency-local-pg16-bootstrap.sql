-- Minimum Supabase-compatible bootstrap for the disposable Referral Follow-up
-- concurrency gate. This file is valid only on a fresh passwordless IPv4
-- loopback PostgreSQL 16 server started with:
--   - a high port (49152-65535);
--   - listen_addresses=127.0.0.1;
--   - careslink.portal_follow_up_concurrency_marker=
--       2026-08-26.local-pg16.m1c.1.
-- It is not a Supabase emulator and must never be applied to a hosted target.

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_ssl boolean;
begin
  select ssl
  into v_ssl
  from pg_catalog.pg_stat_ssl
  where pid = pg_catalog.pg_backend_pid();

  if current_user <> 'postgres'
    or current_database() <> 'postgres'
    or pg_catalog.current_setting('server_version_num')::integer < 160000
    or pg_catalog.current_setting('server_version_num')::integer >= 170000
    or pg_catalog.inet_server_addr() is distinct from
      '127.0.0.1'::pg_catalog.inet
    or pg_catalog.inet_server_port() < 49152
    or pg_catalog.inet_server_port() > 65535
    or coalesce(v_ssl, false)
    or pg_catalog.current_setting(
      'careslink.portal_follow_up_concurrency_marker',
      true
    ) is distinct from '2026-08-26.local-pg16.m1c.1'
  then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_BOOTSTRAP_UNSAFE';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_roles
    where rolname in ('anon', 'authenticated', 'service_role')
  )
    or pg_catalog.to_regnamespace('auth') is not null
    or pg_catalog.to_regnamespace('extensions') is not null
  then
    raise exception 'PORTAL_FOLLOW_UP_CONCURRENCY_BOOTSTRAP_NOT_FRESH';
  end if;
end;
$$;

create role anon
  nologin
  noinherit
  nosuperuser
  nocreatedb
  nocreaterole
  noreplication
  nobypassrls;

create role authenticated
  nologin
  noinherit
  nosuperuser
  nocreatedb
  nocreaterole
  noreplication
  nobypassrls;

create role service_role
  nologin
  noinherit
  nosuperuser
  nocreatedb
  nocreaterole
  noreplication
  bypassrls;

create schema auth authorization postgres;
create schema extensions authorization postgres;

revoke all on schema auth, extensions
from public, anon, authenticated, service_role;

grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  instance_id uuid not null,
  id uuid primary key,
  aud text,
  role text,
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  is_anonymous boolean not null default false,
  banned_until timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table auth.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  not_after timestamptz
);

revoke all on auth.users, auth.sessions
from public, anon, authenticated, service_role;

create function auth.jwt()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    nullif(
      pg_catalog.current_setting('request.jwt.claims', true),
      ''
    )::jsonb,
    '{}'::jsonb
  )
$$;

create function auth.uid()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif(auth.jwt()->>'sub', '')::uuid
$$;

grant execute on function auth.jwt(), auth.uid()
to anon, authenticated, service_role;

commit;
