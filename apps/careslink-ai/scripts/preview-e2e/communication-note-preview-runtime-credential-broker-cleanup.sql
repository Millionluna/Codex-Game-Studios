-- TEST_ONLY runtime-resource teardown for the isolated local broker.
--
-- Set `careslink.runtime_broker.acquisition_digest` for this management
-- session before submitting the file. Do not wrap this file in another
-- transaction: its first COMMIT makes the acquisition tombstone and issued
-- role's NOLOGIN fence durable before session termination/removal starts. If
-- finalize fails, the committed tombstone and login fence remain for retry.
--
-- This intentionally retains the metadata row, fence and identity hashes.
-- The disposable database/project is the only final metadata teardown.

\set ON_ERROR_STOP on

begin;

do $careslink_test_only_runtime_broker_cleanup_guard$
declare
  v_acquisition_digest pg_catalog.text := pg_catalog.current_setting(
    'careslink.runtime_broker.acquisition_digest', true
  );
begin
  if current_user <> 'postgres'
    or session_user <> 'postgres'
    or pg_catalog.current_database() <> 'postgres'
    or pg_catalog.current_setting('application_name') <>
      'careslink-preview-runtime-credential-broker-management'
    or not coalesce(
      v_acquisition_digest ~ '^[a-f0-9]{64}$', false
    )
    or pg_catalog.to_regprocedure(
      'careslink_test_only_runtime_broker.tombstone(text)'
    ) is null
    or pg_catalog.to_regprocedure(
      'careslink_test_only_runtime_broker.finalize(text)'
    ) is null
  then
    raise exception 'TEST_ONLY_RUNTIME_BROKER_CLEANUP_UNSAFE';
  end if;
end
$careslink_test_only_runtime_broker_cleanup_guard$;

select careslink_test_only_runtime_broker.tombstone(
  pg_catalog.current_setting(
    'careslink.runtime_broker.acquisition_digest', true
  )
) as durable_tombstone;

commit;

-- This is deliberately a new top-level transaction. finalize also compares
-- pg_current_xact_id() with the stored tombstone transaction and fails closed
-- if a caller removes this durability boundary.
begin;

select careslink_test_only_runtime_broker.finalize(
  pg_catalog.current_setting(
    'careslink.runtime_broker.acquisition_digest', true
  )
) as release_receipt;

commit;
