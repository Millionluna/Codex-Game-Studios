-- TEST_ONLY postcheck body for one disposable Preview signed-terminal gate.
-- The runtime role must already be NOLOGIN and have no active backend. This
-- script proves the durable 1/0/1/1/1/1 chain and append-only enforcement,
-- then removes only the temporary role. The ledgers remain for branch deletion.

do $careslink_runner_terminal_valid_postcheck$
declare
  v_runtime_name pg_catalog.text := pg_catalog.current_setting(
    'careslink.runner_terminal_valid.runtime_role', true
  );
  v_expected_major pg_catalog.int4 := pg_catalog.current_setting(
    'careslink.runner_terminal_valid.expected_pg_major', true
  )::pg_catalog.int4;
  v_runtime pg_catalog.oid := pg_catalog.to_regrole(v_runtime_name);
  v_caller pg_catalog.oid := pg_catalog.to_regrole(
    'careslink_v1_preview_runner_terminal_caller'
  );
  v_terminal careslink_v1_generation.communication_note_preview_runner_terminals%rowtype;
begin
  if current_user <> 'postgres'
    or session_user <> 'postgres'
    or pg_catalog.current_database() <> 'postgres'
    or pg_catalog.current_setting('application_name') <>
      'careslink-preview-runner-terminal-valid-e2e-management'
    or v_expected_major not in (16, 17)
    or pg_catalog.current_setting('server_version_num')::pg_catalog.int4 /
      10000 <> v_expected_major
  then
    raise exception 'RUNNER_TERMINAL_VALID_POSTCHECK_MANAGEMENT_UNSAFE';
  end if;

  if v_runtime_name !~
      '^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$'
    or v_runtime is null
    or v_caller is null
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_roles as role_record
      where role_record.oid = v_runtime
        and not role_record.rolcanlogin
        and not role_record.rolsuper
        and not role_record.rolcreatedb
        and not role_record.rolcreaterole
        and not role_record.rolinherit
        and not role_record.rolreplication
        and not role_record.rolbypassrls
        and role_record.rolconnlimit = 1
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.member = v_runtime
        and membership.roleid = v_caller
        and not membership.admin_option
        and not membership.inherit_option
        and membership.set_option
    ) <> 1
    or (
      select pg_catalog.count(*)
      from pg_catalog.pg_auth_members as membership
      where membership.member = v_runtime
    ) <> 1
    or exists (
      select 1
      from pg_catalog.pg_stat_activity as activity
      where activity.usename = v_runtime_name
        and activity.backend_type = 'client backend'
    )
  then
    raise exception 'RUNNER_TERMINAL_VALID_POSTCHECK_RUNTIME_UNSAFE';
  end if;

  if (select pg_catalog.count(*) from
      careslink_v1_generation.communication_note_preview_authorizations) <> 1
    or (select pg_catalog.count(*) from
      careslink_v1_generation.communication_note_preview_authorization_revocations) <> 0
    or (select pg_catalog.count(*) from
      careslink_v1_generation.communication_note_preview_claims) <> 1
    or (select pg_catalog.count(*) from
      careslink_v1_generation.communication_note_preview_dispatch_reservations) <> 1
    or (select pg_catalog.count(*) from
      careslink_v1_generation.communication_note_preview_dispatch_receipts) <> 1
    or (select pg_catalog.count(*) from
      careslink_v1_generation.communication_note_preview_runner_terminals) <> 1
  then
    raise exception 'RUNNER_TERMINAL_VALID_POSTCHECK_LEDGER_COUNTS_FAILED';
  end if;

  select terminal.* into strict v_terminal
  from careslink_v1_generation.communication_note_preview_runner_terminals
    as terminal;
  if v_terminal.terminal_state is distinct from 'FAILED'
    or v_terminal.failure_reason is distinct from 'CANCELLED'
    or v_terminal.authenticity is distinct from
      'EXTERNAL_RUNNER_TERMINAL_ED25519_VERIFIED'
    or v_terminal.verifier_method is distinct from
      'APPLICATION_ED25519_TERMINAL_TRUST_REGISTRY'
    or v_terminal.signature_base64url !~ '^[A-Za-z0-9_-]{86}$'
    or v_terminal.signature_sha256 !~ '^[a-f0-9]{64}$'
    or v_terminal.signer_key_id_hash !~ '^[a-f0-9]{64}$'
    or v_terminal.signer_public_key_sha256 !~ '^[a-f0-9]{64}$'
    or v_terminal.statement->>'state' is distinct from 'FAILED'
    or v_terminal.statement->>'failureReason' is distinct from 'CANCELLED'
    or v_terminal.statement->'usage' is distinct from 'null'::pg_catalog.jsonb
    or v_terminal.statement->'criticalChecks' is distinct from
      'null'::pg_catalog.jsonb
    or v_terminal.statement->'humanReviews' is distinct from
      'null'::pg_catalog.jsonb
    or not v_terminal.no_retry
    or not v_terminal.shadow_only
  then
    raise exception 'RUNNER_TERMINAL_VALID_POSTCHECK_TERMINAL_FAILED';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_trigger as trigger_record
    where trigger_record.tgrelid =
      'careslink_v1_generation.communication_note_preview_runner_terminals'::pg_catalog.regclass
      and trigger_record.tgname =
        'communication_note_preview_runner_terminals_append_only'
      and not trigger_record.tgisinternal
      and trigger_record.tgenabled = 'O'
      and pg_catalog.pg_get_triggerdef(trigger_record.oid) ~*
        'BEFORE DELETE OR UPDATE|BEFORE UPDATE OR DELETE'
  ) <> 1 then
    raise exception 'RUNNER_TERMINAL_VALID_POSTCHECK_TRIGGER_DRIFT';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_auth_members as membership
    join pg_catalog.pg_roles as grantor_role
      on grantor_role.oid = membership.grantor
    where membership.member = current_user::pg_catalog.regrole
      and membership.roleid =
        'careslink_v1_generation_owner'::pg_catalog.regrole
      and not (
        grantor_role.rolsuper
        and membership.grantor <> membership.member
        and membership.admin_option
        and coalesce(
          (pg_catalog.to_jsonb(membership)->>'inherit_option')::pg_catalog.bool,
          false
        ) is false
        and coalesce(
          (pg_catalog.to_jsonb(membership)->>'set_option')::pg_catalog.bool,
          false
        ) is false
      )
  ) or (
    select pg_catalog.count(*)
    from pg_catalog.pg_auth_members as membership
    where membership.member = current_user::pg_catalog.regrole
      and membership.roleid =
        'careslink_v1_generation_owner'::pg_catalog.regrole
  ) > 1 or exists (
    select 1
    from pg_catalog.pg_policy as policy_record
    where policy_record.polrelid =
      'careslink_v1_generation.communication_note_preview_runner_terminals'::pg_catalog.regclass
      and policy_record.polname =
        'comm_preview_runner_terminals_postcheck_owner_probe'
  ) then
    raise exception 'RUNNER_TERMINAL_VALID_POSTCHECK_PROBE_BASELINE_DRIFT';
  end if;
end
$careslink_runner_terminal_valid_postcheck$;

create temporary table m1gh_valid_owner_membership_snapshot
on commit drop as
select
  membership.roleid,
  membership.member,
  membership.grantor,
  membership.admin_option,
  coalesce(
    (pg_catalog.to_jsonb(membership)->>'inherit_option')::pg_catalog.bool,
    false
  ) as inherit_option,
  coalesce(
    (pg_catalog.to_jsonb(membership)->>'set_option')::pg_catalog.bool,
    false
  ) as set_option
from pg_catalog.pg_auth_members as membership
where membership.member = current_user::pg_catalog.regrole
  and membership.roleid =
    'careslink_v1_generation_owner'::pg_catalog.regrole;

-- The table is FORCE RLS and the Hosted management role is not assumed to be
-- superuser. A transaction-local SET edge and temporary owner-only policy make
-- exactly one existing row visible, so this is a real trigger execution proof.
grant careslink_v1_generation_owner to current_user
  with admin false, inherit false, set true granted by current_user;
set local role careslink_v1_generation_owner;
create policy comm_preview_runner_terminals_postcheck_owner_probe
on careslink_v1_generation.communication_note_preview_runner_terminals
for all to careslink_v1_generation_owner
using (true)
with check (true);

do $careslink_runner_terminal_valid_append_only$
declare
  v_message pg_catalog.text;
  v_append_only_rejected pg_catalog.bool := false;
begin
  begin
    update careslink_v1_generation.communication_note_preview_runner_terminals
    set recorded_at = recorded_at
    where terminal_state = 'FAILED';
    raise exception 'RUNNER_TERMINAL_VALID_EXPECTED_APPEND_ONLY_REJECTION';
  exception when others then
    get stacked diagnostics v_message = message_text;
    v_append_only_rejected :=
      v_message = 'IMMUTABLE_PREVIEW_EXECUTION_AUTHORITY_LEDGER';
  end;
  if not v_append_only_rejected then
    raise exception 'RUNNER_TERMINAL_VALID_POSTCHECK_APPEND_ONLY_FAILED';
  end if;
end
$careslink_runner_terminal_valid_append_only$;

drop policy comm_preview_runner_terminals_postcheck_owner_probe
on careslink_v1_generation.communication_note_preview_runner_terminals;
reset role;
revoke careslink_v1_generation_owner from current_user
  granted by current_user;

do $careslink_runner_terminal_valid_cleanup$
declare
  v_runtime_name pg_catalog.text := pg_catalog.current_setting(
    'careslink.runner_terminal_valid.runtime_role', true
  );
  v_runtime pg_catalog.oid := pg_catalog.to_regrole(v_runtime_name);
begin
  if current_user <> 'postgres'
    or session_user <> 'postgres'
    or v_runtime is null
    or exists (
      (
        select
          membership.roleid,
          membership.member,
          membership.grantor,
          membership.admin_option,
          coalesce(
            (pg_catalog.to_jsonb(membership)->>'inherit_option')::pg_catalog.bool,
            false
          ),
          coalesce(
            (pg_catalog.to_jsonb(membership)->>'set_option')::pg_catalog.bool,
            false
          )
        from pg_catalog.pg_auth_members as membership
        where membership.member = current_user::pg_catalog.regrole
          and membership.roleid =
            'careslink_v1_generation_owner'::pg_catalog.regrole
        except all
        select * from pg_temp.m1gh_valid_owner_membership_snapshot
      )
      union all
      (
        select * from pg_temp.m1gh_valid_owner_membership_snapshot
        except all
        select
          membership.roleid,
          membership.member,
          membership.grantor,
          membership.admin_option,
          coalesce(
            (pg_catalog.to_jsonb(membership)->>'inherit_option')::pg_catalog.bool,
            false
          ),
          coalesce(
            (pg_catalog.to_jsonb(membership)->>'set_option')::pg_catalog.bool,
            false
          )
        from pg_catalog.pg_auth_members as membership
        where membership.member = current_user::pg_catalog.regrole
          and membership.roleid =
            'careslink_v1_generation_owner'::pg_catalog.regrole
      )
    )
    or exists (
      select 1
      from pg_catalog.pg_policy as policy_record
      where policy_record.polrelid =
        'careslink_v1_generation.communication_note_preview_runner_terminals'::pg_catalog.regclass
        and policy_record.polname =
          'comm_preview_runner_terminals_postcheck_owner_probe'
    )
  then
    raise exception 'RUNNER_TERMINAL_VALID_POSTCHECK_PROBE_CLEANUP_FAILED';
  end if;

  execute pg_catalog.format(
    'revoke careslink_v1_preview_runner_terminal_caller from %I',
    v_runtime_name
  );
  execute pg_catalog.format('drop role %I', v_runtime_name);

  if pg_catalog.to_regrole(v_runtime_name) is not null
    or exists (
      select 1
      from pg_catalog.pg_auth_members as membership
      where membership.member = v_runtime
        or membership.roleid = v_runtime
        or membership.grantor = v_runtime
    )
    or (select pg_catalog.count(*) from
      careslink_v1_generation.communication_note_preview_authorizations) <> 1
    or (select pg_catalog.count(*) from
      careslink_v1_generation.communication_note_preview_authorization_revocations) <> 0
    or (select pg_catalog.count(*) from
      careslink_v1_generation.communication_note_preview_claims) <> 1
    or (select pg_catalog.count(*) from
      careslink_v1_generation.communication_note_preview_dispatch_reservations) <> 1
    or (select pg_catalog.count(*) from
      careslink_v1_generation.communication_note_preview_dispatch_receipts) <> 1
    or (select pg_catalog.count(*) from
      careslink_v1_generation.communication_note_preview_runner_terminals) <> 1
  then
    raise exception 'RUNNER_TERMINAL_VALID_POSTCHECK_CLEANUP_FAILED';
  end if;
end
$careslink_runner_terminal_valid_cleanup$;
