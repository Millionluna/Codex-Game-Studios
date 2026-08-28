-- Communication Note disposable Preview custody caller shells.
--
-- Source-only and default-off. These four NOLOGIN roles describe the exact
-- database identities that a later reviewed secret-custody adapter may enter
-- after authenticating its own purpose-bound credential. Each role receives
-- only private-schema USAGE and its exact execution-authority RPC surface:
-- authorization registration (one), authorization revocation (one), dispatch
-- claim/reservation (two), or receipt persistence (one).
--
-- This migration deliberately creates no LOGIN, password, credential, key,
-- usable INHERIT/SET membership, row, caller adapter, HTTPS path, model
-- request, deployment or hosted mutation. In particular, callers are not
-- members of the executor roles; SECURITY DEFINER RPC ownership remains the
-- only execution boundary. On PostgreSQL 16+, a non-superuser CREATEROLE
-- migration actor may retain the server-created ADMIN-only bootstrap edge to
-- each role it creates; that edge has INHERIT=false and SET=false and is not a
-- runtime execution path. The migration runner owns the transaction boundary.

select pg_catalog.set_config(
  'careslink.migration_entry_role',
  current_user,
  true
);

create role careslink_v1_preview_authorization_registration_caller
  with nologin nosuperuser nocreatedb nocreaterole noinherit
    noreplication nobypassrls;
create role careslink_v1_preview_authorization_revocation_caller
  with nologin nosuperuser nocreatedb nocreaterole noinherit
    noreplication nobypassrls;
create role careslink_v1_preview_dispatch_caller
  with nologin nosuperuser nocreatedb nocreaterole noinherit
    noreplication nobypassrls;
create role careslink_v1_preview_receipt_caller
  with nologin nosuperuser nocreatedb nocreaterole noinherit
    noreplication nobypassrls;

-- PostgreSQL 16+ SET-only edges let each existing object owner grant the
-- narrow ACL itself. These migration-only memberships are removed below.
grant careslink_v1_generation_owner to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_preview_authorization_executor to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_preview_dispatch_executor to current_user
  with admin false, inherit false, set true
  granted by current_user;
grant careslink_v1_preview_receipt_executor to current_user
  with admin false, inherit false, set true
  granted by current_user;

set role careslink_v1_generation_owner;

grant usage on schema careslink_v1_generation
  to careslink_v1_preview_authorization_registration_caller,
    careslink_v1_preview_authorization_revocation_caller,
    careslink_v1_preview_dispatch_caller,
    careslink_v1_preview_receipt_caller;
revoke create on schema careslink_v1_generation
  from careslink_v1_preview_authorization_registration_caller,
    careslink_v1_preview_authorization_revocation_caller,
    careslink_v1_preview_dispatch_caller,
    careslink_v1_preview_receipt_caller;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_preview_authorization_executor;

revoke all on function
  careslink_v1_generation.persist_verified_communication_note_preview_authorization(
    jsonb, text, text
  )
from careslink_v1_preview_authorization_registration_caller,
  careslink_v1_preview_authorization_revocation_caller,
  careslink_v1_preview_dispatch_caller,
  careslink_v1_preview_receipt_caller;
grant execute on function
  careslink_v1_generation.persist_verified_communication_note_preview_authorization(
    jsonb, text, text
  )
to careslink_v1_preview_authorization_registration_caller;

revoke all on function
  careslink_v1_generation.revoke_communication_note_preview_authorization(
    text, uuid, text, text, text
  )
from careslink_v1_preview_authorization_registration_caller,
  careslink_v1_preview_authorization_revocation_caller,
  careslink_v1_preview_dispatch_caller,
  careslink_v1_preview_receipt_caller;
grant execute on function
  careslink_v1_generation.revoke_communication_note_preview_authorization(
    text, uuid, text, text, text
  )
to careslink_v1_preview_authorization_revocation_caller;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_preview_dispatch_executor;

revoke all on function
  careslink_v1_generation.claim_communication_note_preview_authorization(
    text, uuid, text, text, text, text, text
  )
from careslink_v1_preview_authorization_registration_caller,
  careslink_v1_preview_authorization_revocation_caller,
  careslink_v1_preview_dispatch_caller,
  careslink_v1_preview_receipt_caller;
grant execute on function
  careslink_v1_generation.claim_communication_note_preview_authorization(
    text, uuid, text, text, text, text, text
  )
to careslink_v1_preview_dispatch_caller;

revoke all on function
  careslink_v1_generation.reserve_communication_note_preview_dispatch(
    uuid, text, uuid, integer, text, integer, text, integer, text, text
  )
from careslink_v1_preview_authorization_registration_caller,
  careslink_v1_preview_authorization_revocation_caller,
  careslink_v1_preview_dispatch_caller,
  careslink_v1_preview_receipt_caller;
grant execute on function
  careslink_v1_generation.reserve_communication_note_preview_dispatch(
    uuid, text, uuid, integer, text, integer, text, integer, text, text
  )
to careslink_v1_preview_dispatch_caller;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

set role careslink_v1_preview_receipt_executor;

revoke all on function
  careslink_v1_generation.persist_verified_communication_note_preview_dispatch_receipt(
    jsonb, text, text, text
  )
from careslink_v1_preview_authorization_registration_caller,
  careslink_v1_preview_authorization_revocation_caller,
  careslink_v1_preview_dispatch_caller,
  careslink_v1_preview_receipt_caller;
grant execute on function
  careslink_v1_generation.persist_verified_communication_note_preview_dispatch_receipt(
    jsonb, text, text, text
  )
to careslink_v1_preview_receipt_caller;

select pg_catalog.set_config(
  'role',
  pg_catalog.current_setting('careslink.migration_entry_role'),
  false
);

-- Remove only this migration's temporary PostgreSQL-16 SET edges. The four
-- durable caller shells retain no usable INHERIT/SET edge and no relationship
-- to an executor/runtime role. A non-superuser CREATEROLE actor may retain only
-- PostgreSQL 16's non-usable ADMIN bootstrap edge described above.
revoke careslink_v1_preview_receipt_executor
  from current_user granted by current_user;
revoke careslink_v1_preview_dispatch_executor
  from current_user granted by current_user;
revoke careslink_v1_preview_authorization_executor
  from current_user granted by current_user;
revoke careslink_v1_generation_owner
  from current_user granted by current_user;
