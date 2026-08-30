import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260830065750_add_communication_note_preview_runtime_credential_broker.sql";
const migration = readFileSync(join(process.cwd(), migrationPath), "utf8");
const normalizedMigration = normalizeSql(migration);
const canonicalMigration = canonicalSql(migration);

const brokerSchema = "careslink_v1_runtime_broker";
const acquisitions = `${brokerSchema}.acquisitions`;
const terminalSchema = "careslink_v1_generation";
const terminalRpc =
  `${terminalSchema}.persist_verified_communication_note_preview_runner_terminal`;
const unfencedTerminal =
  `${terminalSchema}._persist_verified_communication_note_preview_terminal_unfenced`;
const terminalCaller = "careslink_v1_preview_runner_terminal_caller";
const terminalExecutor = "careslink_v1_preview_runner_terminal_executor";
const staticPostureHelper =
  `${brokerSchema}._assert_terminal_static_posture`;
const runtimePostureHelper =
  `${brokerSchema}._assert_runtime_privilege_posture`;
const apiRoles = [
  "public",
  "anon",
  "authenticated",
  "service_role",
  "authenticator",
] as const;

const expectedColumns = [
  "acquisition_digest",
  "authorization_digest",
  "run_id_hash",
  "database_target_digest",
  "caller_identity_hmac",
  "fence_token",
  "state",
  "runtime_role",
  "runtime_role_oid",
  "lease_reference_sha256",
  "session_binding_sha256",
  "credential_verifier_sha256",
  "issued_at",
  "expires_at",
  "bound_backend_pid",
  "bound_backend_start",
  "bound_at",
  "tombstoned_at",
  "tombstone_transaction_id",
  "future_issuance_blocked",
  "revoked_at",
  "reported_session_disposition",
  "reported_credential_disposition",
  "receipt_digest",
  "reusable",
  "raw_credential_material_present",
  "created_at",
  "updated_at",
] as const;

const managementFunctions = [
  "acquire",
  "bind",
  "tombstone",
  "finalize",
  "inspect",
] as const;

const expectedCreatedFunctions = [
  `${brokerSchema}._assert_management_session`,
  `${brokerSchema}._guard_transition`,
  `${brokerSchema}._deny_truncate`,
  ...managementFunctions.map((name) => `${brokerSchema}.${name}`),
  `${brokerSchema}._current_runtime_backend_start`,
  terminalRpc,
  staticPostureHelper,
  runtimePostureHelper,
] as const;

describe("Communication Note M1l runtime credential broker migration contract", () => {
  it("is one additive transaction guarded for the exact Hosted non-superuser posture", () => {
    expect(migrationPath).toMatch(
      /^supabase\/migrations\/\d{14}_add_communication_note_preview_runtime_credential_broker\.sql$/,
    );
    expect(normalizedMigration).toMatch(/^begin;/);
    expect(normalizedMigration).toMatch(/commit;$/);
    expect(normalizedMigration.match(/\bbegin;/g)).toHaveLength(1);
    expect(normalizedMigration.match(/\bcommit;/g)).toHaveLength(1);
    expect(normalizedMigration).not.toMatch(
      /\b(?:drop schema|drop table|truncate table|create extension|alter extension)\b/,
    );

    const setupGuard = normalizeSql(
      dollarBlock("do $careslink_v1_runtime_broker_setup_guard$"),
    );
    expect(setupGuard).toContain("current_user <> 'postgres'");
    expect(setupGuard).toContain("session_user <> 'postgres'");
    expect(setupGuard).toContain("current_database() <> 'postgres'");
    expect(setupGuard).toContain("10000 not in (16, 17)");
    expect(setupGuard).toContain(
      "current_setting( 'max_prepared_transactions' )::pg_catalog.int4 <> 0",
    );
    expect(setupGuard).toContain("select not role_record.rolsuper");
    expect(setupGuard).toContain("and role_record.rolcreaterole");
    expect(setupGuard).toContain("and role_record.rolbypassrls");
    expect(setupGuard).toContain(
      "pg_has_role( current_user, 'pg_signal_backend', 'usage' )",
    );
    expect(setupGuard).toContain(
      "pg_has_role( current_user, 'pg_read_all_stats', 'usage' )",
    );
    expect(setupGuard).not.toContain("select role_record.rolsuper and");
    expect(setupGuard).not.toContain("and not role_record.rolcreaterole");
    expect(setupGuard).not.toContain("and not role_record.rolbypassrls");
    expect(setupGuard).not.toContain("to_regprocedure(");
    expect(setupGuard).toContain(
      "namespace.nspname = 'careslink_v1_generation'",
    );
    expect(setupGuard).toContain(
      "procedure.proname = 'persist_verified_communication_note_preview_runner_terminal'",
    );
    expect(normalizedMigration).toContain(
      `create schema ${brokerSchema} authorization postgres;`,
    );

    const predecessorGuard = normalizeSql(
      dollarBlock("do $careslink_v1_terminal_predecessor_guard$"),
    );
    expect(predecessorGuard).toContain(
      "procedure.proowner = v_executor",
    );
    expect(predecessorGuard).toContain("procedure.prosecdef");
    expect(predecessorGuard).toContain("acl.privilege_type = 'execute'");
    expect(predecessorGuard).toContain(
      "acl.grantee not in (v_executor, v_caller)",
    );
    expect(predecessorGuard).toContain("acl.grantor <> v_executor");
    expect(predecessorGuard).toContain("acl.is_grantable");
    expect(predecessorGuard).toContain(
      "membership.roleid in (v_executor, v_caller)",
    );
    expect(predecessorGuard).toContain("membership.admin_option");
    expect(predecessorGuard).toContain("not membership.inherit_option");
    expect(predecessorGuard).toContain("not membership.set_option");
    expect(predecessorGuard).toContain("from pg_catalog.pg_shdepend");
    expect(predecessorGuard).toContain(
      "dependency.refclassid = 'pg_catalog.pg_authid'::pg_catalog.regclass",
    );
    expect(predecessorGuard).toContain(
      "dependency.dbid = v_database",
    );
    expect(predecessorGuard).toContain(
      "dependency.classid = 'pg_catalog.pg_namespace'::pg_catalog.regclass",
    );
    expect(predecessorGuard).toContain(
      "dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass",
    );
    expect(predecessorGuard).toContain("dependency.objsubid = 0");
    expect(predecessorGuard).toContain("dependency.deptype = 'o'");
  });

  it("persists only immutable digests, lifecycle metadata and an explicit no-raw-material bit", () => {
    const table = tableBlock(acquisitions);
    const columns = [
      ...table.matchAll(/^\s{2}([a-z][a-z0-9_]*)\s+pg_catalog\.[a-z0-9_]+/gim),
    ].map((match) => match[1]);

    expect(columns).toEqual(expectedColumns);
    expect(normalizeSql(table)).not.toMatch(
      /\b(?:password|scram_verifier|dsn|connection_string|database_url|raw_credential|raw_secret)\s+pg_catalog\.(?:text|bytea|jsonb)\b/,
    );
    expect(normalizeSql(table)).toContain(
      "raw_credential_material_present pg_catalog.bool not null default false",
    );
    expect(normalizeSql(table)).toContain(
      "reusable pg_catalog.bool not null default false",
    );

    const acquire = normalizeSql(functionBlock(`${brokerSchema}.acquire`));
    expect(acquire).toContain("p_scram_verifier := null;");
    expect(acquire).not.toMatch(
      /insert into [^(]+\([^)]*\b(?:p_scram_verifier|password|dsn)\b/,
    );
  });

  it("uses a partial runtime OID uniqueness fence so durable tombstones survive OID reuse", () => {
    const table = normalizeSql(tableBlock(acquisitions));
    expect(table).toContain("runtime_role_oid pg_catalog.oid");
    expect(table).not.toMatch(/runtime_role_oid pg_catalog\.oid\s+unique/);

    expect(normalizedMigration).toContain(
      `create unique index runtime_credential_broker_active_runtime_oid_unique on ${acquisitions} (runtime_role_oid) where runtime_role_oid is not null and state <> 'revoked';`,
    );
    expect(
      normalizedMigration.match(
        /create unique index [a-z0-9_]+ on careslink_v1_runtime_broker\.acquisitions \(runtime_role_oid\)/g,
      ),
    ).toHaveLength(1);
  });

  it("keeps every lifecycle function invoker-rights with an empty search path and a strict management guard", () => {
    const brokerFunctions = [
      "_assert_management_session",
      "_guard_transition",
      "_deny_truncate",
      ...managementFunctions,
    ];

    for (const functionName of brokerFunctions) {
      const block = normalizeSql(
        functionBlock(`${brokerSchema}.${functionName}`),
      );
      expect(block, functionName).toContain("security invoker");
      expect(block, functionName).not.toContain("security definer");
      expect(block, functionName).toContain("set search_path = ''");
    }

    expect(
      [
        ...migration.matchAll(
          /\bcreate\s+function\s+([a-z][a-z0-9_.]+)\s*\(/gi,
        ),
      ].map((match) => match[1].toLowerCase()),
    ).toEqual(expectedCreatedFunctions);
    for (const qualifiedName of expectedCreatedFunctions) {
      expect(
        normalizeSql(functionBlock(qualifiedName)),
        qualifiedName,
      ).toContain("set search_path = ''");
    }

    for (const functionName of managementFunctions) {
      expect(
        normalizeSql(functionBlock(`${brokerSchema}.${functionName}`)),
        functionName,
      ).toContain(
        `perform ${brokerSchema}._assert_management_session();`,
      );
    }

    const managementGuard = normalizeSql(
      functionBlock(`${brokerSchema}._assert_management_session`),
    );
    expect(managementGuard).toContain("current_user <> 'postgres'");
    expect(managementGuard).toContain("session_user <> 'postgres'");
    expect(managementGuard).toContain("current_database() <> 'postgres'");
    expect(managementGuard).toContain(
      "current_setting('application_name') <> 'careslink-preview-runtime-credential-broker-management'",
    );
    expect(managementGuard).toContain("select not role_record.rolsuper");
    expect(managementGuard).toContain("and role_record.rolcreaterole");
    expect(managementGuard).toContain("and role_record.rolbypassrls");
    expect(managementGuard).toContain("'pg_signal_backend', 'usage'");
    expect(managementGuard).toContain("'pg_read_all_stats', 'usage'");
    expect(managementGuard).toContain(
      "current_setting( 'max_prepared_transactions' )::pg_catalog.int4 <> 0",
    );
    expect(managementGuard).toContain(
      "set_config('lock_timeout', '5s', true)",
    );
  });

  it("serializes every lifecycle transition on one transaction advisory-lock namespace", () => {
    for (const functionName of [
      "acquire",
      "bind",
      "tombstone",
      "finalize",
    ] as const) {
      const block = canonicalSql(
        functionBlock(`${brokerSchema}.${functionName}`),
      );
      expect(block, functionName).toContain(
        "pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_acquisition_digest,836492741))",
      );
    }

    const inspect = canonicalSql(functionBlock(`${brokerSchema}.inspect`));
    expect(inspect).toContain(
      "pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(p_acquisition_digest,836492741))",
    );
    expect(normalizedMigration).not.toMatch(
      /\bpg_(?:try_)?advisory_lock(?:_shared)?\s*\(/,
    );
  });

  it("terminates the exact bound backend even after mutable session settings drift", () => {
    const tombstone = normalizeSql(
      functionBlock(`${brokerSchema}.tombstone`),
    );
    expect(tombstone).toContain(
      "activity.pid = v_acquisition.bound_backend_pid",
    );
    expect(tombstone).toContain(
      "activity.backend_start = v_acquisition.bound_backend_start",
    );
    expect(tombstone).toContain(
      "activity.usesysid = v_acquisition.runtime_role_oid",
    );
    expect(tombstone).toContain(
      "activity.usename = v_acquisition.runtime_role",
    );
    expect(tombstone).not.toContain("activity.application_name");
    expect(tombstone).toContain("if not v_terminated then");
    expect(tombstone).toContain("pg_catalog.pg_stat_clear_snapshot()");
  });

  it("derives an inherited-only runtime role, limits issuance to 45-90 seconds and flips LOGIN off at bind", () => {
    const table = normalizeSql(tableBlock(acquisitions));
    const acquire = normalizeSql(functionBlock(`${brokerSchema}.acquire`));
    const bind = normalizeSql(functionBlock(`${brokerSchema}.bind`));

    for (const source of [table, acquire]) {
      expect(source).toContain(
        "'careslink_v1_preview_runner_terminal_runtime_' || pg_catalog.substr(",
      );
      expect(source).toContain("acquisition_digest, 1, 16)");
    }
    expect(acquire).toContain(
      "p_expires_at < v_issued_at + pg_catalog.make_interval(secs => 45)",
    );
    expect(acquire).toContain(
      "p_expires_at > v_issued_at + pg_catalog.make_interval(secs => 90)",
    );
    expect(table).toContain(
      "expires_at <= issued_at + pg_catalog.make_interval(secs => 90)",
    );
    expect(acquire).toContain(
      "create role %i with login nosuperuser nocreatedb nocreaterole inherit noreplication nobypassrls connection limit 1 password %l valid until %l",
    );
    expect(acquire).toContain(
      "grant careslink_v1_preview_runner_terminal_caller to %i with admin false, inherit true, set false",
    );
    expect(acquire).toContain("and role_record.rolinherit");
    expect(acquire).toContain("and membership.inherit_option");
    expect(acquire).toContain("and not membership.set_option");
    expect(acquire).toContain(
      "not pg_catalog.pg_has_role(v_runtime_oid, v_caller, 'usage')",
    );
    expect(acquire).toContain(
      "pg_catalog.pg_has_role(v_runtime_oid, v_caller, 'set')",
    );
    expect(acquire).toContain("where membership.roleid = v_runtime_oid");
    expect(acquire).toContain("and grantor_role.rolsuper");
    expect(acquire).toContain("and membership.admin_option");
    expect(acquire).toContain(
      "not pg_catalog.has_function_privilege( v_runtime_oid, v_terminal_oid, 'execute' )",
    );

    const sessionCheck = bind.indexOf("from pg_catalog.pg_stat_activity");
    const noLogin = bind.indexOf(
      "alter role %i with nologin",
      sessionCheck,
    );
    const activeUpdate = bind.indexOf(`update ${acquisitions}`, noLogin);
    expect(sessionCheck).toBeGreaterThanOrEqual(0);
    expect(noLogin).toBeGreaterThan(sessionCheck);
    expect(activeUpdate).toBeGreaterThan(noLogin);
    expect(bind.slice(activeUpdate)).toContain("set state = 'active'");
    expect(bind.slice(noLogin, activeUpdate)).toContain(
      "not role_record.rolcanlogin",
    );
    expect(bind).toContain("and role_record.rolinherit");
    expect(bind).toContain("and membership.inherit_option");
    expect(bind).toContain("and not membership.set_option");
    expect(bind).toContain(
      "v_acquisition.runtime_role_oid, v_caller, 'usage'",
    );
    expect(bind).toContain(
      "v_acquisition.runtime_role_oid, v_caller, 'set'",
    );
    expect(bind).toContain(
      "where membership.roleid = v_acquisition.runtime_role_oid",
    );
    expect(bind).toContain("and grantor_role.rolsuper");
  });

  it("reproves cluster-wide static caller ownership, exact ACLs and runtime privileges at every usable boundary", () => {
    const staticPosture = normalizeSql(functionBlock(staticPostureHelper));
    const runtimePosture = normalizeSql(functionBlock(runtimePostureHelper));
    const acquire = normalizeSql(functionBlock(`${brokerSchema}.acquire`));
    const bind = normalizeSql(functionBlock(`${brokerSchema}.bind`));
    const wrapper = normalizeSql(functionBlock(terminalRpc));

    for (const helper of [staticPosture, runtimePosture]) {
      expect(helper).toContain("security definer");
      expect(helper).toContain("set search_path = ''");
    }
    expect(staticPosture).toContain("from pg_catalog.pg_shdepend");
    expect(staticPosture).toContain(
      "dependency.refclassid = 'pg_catalog.pg_authid'::pg_catalog.regclass",
    );
    expect(staticPosture).toContain("dependency.refobjid = v_caller");
    expect(staticPosture).toContain("dependency.deptype = 'o'");
    expect(staticPosture).toContain("dependency.dbid = v_database");
    expect(staticPosture).toContain(
      "dependency.classid = 'pg_catalog.pg_namespace'::pg_catalog.regclass",
    );
    expect(staticPosture).toContain(
      "dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass",
    );
    expect(staticPosture).toContain("dependency.objid = v_generation_schema");
    expect(staticPosture).toContain("dependency.objid = v_wrapper");
    expect(staticPosture).toContain("dependency.objsubid = 0");
    expect(staticPosture).toContain(
      "acl.grantee = v_caller or acl.grantor = v_caller",
    );
    expect(staticPosture).toContain("acl.grantor = v_generation_owner");
    expect(staticPosture).toContain("procedure.proowner = v_executor");
    expect(staticPosture).toContain("procedure.prosecdef");
    expect(staticPosture).toContain(
      "pg_catalog.has_any_column_privilege(",
    );
    expect(staticPosture).toContain("with candidate_relation as materialized");
    expect(staticPosture).toContain("with candidate_sequence as materialized");
    expect(staticPosture).toContain(
      "raise exception 'runtime_credential_terminal_static_posture_unsafe'",
    );

    expect(runtimePosture).toContain(
      `perform ${staticPostureHelper}();`,
    );
    expect(runtimePosture).toContain("dependency.refobjid = p_runtime_oid");
    expect(runtimePosture).toContain(
      "dependency.deptype in ('a', 'i', 'r', 't')",
    );
    expect(runtimePosture).toContain(
      "pg_catalog.has_any_column_privilege(",
    );
    expect(runtimePosture).toContain("with candidate_relation as materialized");
    expect(runtimePosture).toContain("with candidate_sequence as materialized");
    expect(runtimePosture).toContain(
      "raise exception 'runtime_credential_runtime_privilege_posture_unsafe'",
    );

    expect(acquire).toContain(`perform ${staticPostureHelper}();`);
    expect(acquire).toContain(`perform ${runtimePostureHelper}(`);
    expect(acquire).toContain("pg_catalog.has_any_column_privilege(");
    expect(bind.match(new RegExp(
      escapeRegExp(`perform ${runtimePostureHelper}(`),
      "g",
    ))).toHaveLength(2);
    expect(bind).toContain(`perform ${staticPostureHelper}();`);
    expect(wrapper).toContain(`perform ${runtimePostureHelper}(`);
    expect(wrapper).toContain("exception when others then");

    for (const helper of [staticPostureHelper, runtimePostureHelper]) {
      const revoke = canonicalStatementStartingAt(
        `revoke all on function ${helper}(`,
      );
      for (const role of [...apiRoles, terminalCaller, terminalExecutor]) {
        expect(revoke).toContain(role);
      }
      expect(
        canonicalStatementStartingAt(`grant execute on function ${helper}(`),
      ).toContain(`to ${terminalExecutor};`);
    }
  });

  it("wraps the unchanged three-argument terminal RPC with a shared transaction fence", () => {
    const wrapper = normalizeSql(functionBlock(terminalRpc));
    const wrapperHeader = wrapper.slice(0, wrapper.indexOf("returns")).trim();

    expect(wrapperHeader).toBe(
      normalizeSql(`
        create function ${terminalRpc}(
          p_statement pg_catalog.jsonb,
          p_signature_base64url pg_catalog.text,
          p_verifier_identity_hmac pg_catalog.text
        )
      `),
    );
    expect(wrapper).toContain("security definer");
    expect(wrapper).toContain("set search_path = ''");
    expect(wrapper).toContain(
      "pg_catalog.pg_advisory_xact_lock_shared(",
    );
    expect(wrapper).toContain(
      "pg_catalog.hashtextextended( v_acquisition.acquisition_digest, 836492741 )",
    );
    expect(wrapper).toContain("exception when lock_not_available then");

    const firstRead = wrapper.indexOf(`from ${acquisitions} as acquisition`);
    const sharedFence = wrapper.indexOf(
      "pg_catalog.pg_advisory_xact_lock_shared(",
      firstRead,
    );
    const lockedRead = wrapper.indexOf(
      `from ${acquisitions} as acquisition`,
      sharedFence,
    );
    const activeRecheck = wrapper.indexOf(
      "v_acquisition.state <> 'active'",
      lockedRead,
    );
    const terminalWrite = wrapper.indexOf(`${unfencedTerminal}(`, activeRecheck);

    expect(firstRead).toBeGreaterThanOrEqual(0);
    expect(sharedFence).toBeGreaterThan(firstRead);
    expect(lockedRead).toBeGreaterThan(sharedFence);
    expect(activeRecheck).toBeGreaterThan(lockedRead);
    expect(terminalWrite).toBeGreaterThan(activeRecheck);
  });

  it("revalidates ACTIVE, statement identity and the exact bound backend only after taking the shared fence", () => {
    const wrapper = normalizeSql(functionBlock(terminalRpc));
    const sharedFence = wrapper.indexOf(
      "pg_catalog.pg_advisory_xact_lock_shared(",
    );
    const lockedRead = wrapper.indexOf(
      `from ${acquisitions} as acquisition`,
      sharedFence,
    );
    const activeRecheck = wrapper.indexOf(
      "v_acquisition.state <> 'active'",
      lockedRead,
    );
    const terminalWrite = wrapper.indexOf(`${unfencedTerminal}(`, activeRecheck);
    const fencedChecks = wrapper.slice(activeRecheck, terminalWrite);

    expect(fencedChecks).toContain("v_acquisition.future_issuance_blocked");
    expect(fencedChecks).toContain("v_acquisition.tombstoned_at is not null");
    expect(fencedChecks).toContain("v_acquisition.revoked_at is not null");
    expect(fencedChecks).toContain(
      "v_acquisition.runtime_role_oid is distinct from v_runtime_oid",
    );
    expect(fencedChecks).toContain(
      "v_acquisition.bound_backend_pid <> pg_catalog.pg_backend_pid()",
    );
    expect(fencedChecks).toContain(
      "v_acquisition.bound_backend_start is distinct from v_backend_start",
    );
    expect(fencedChecks).toContain(
      "v_acquisition.authorization_digest is distinct from p_statement->>'authorizationdigest'",
    );
    expect(fencedChecks).toContain(
      "v_acquisition.run_id_hash is distinct from p_statement->>'runidhash'",
    );
    expect(fencedChecks).toContain(
      "v_acquisition.caller_identity_hmac is distinct from p_verifier_identity_hmac",
    );
    expect(fencedChecks).toContain(
      "current_setting('statement_timeout') <> '5s'",
    );
    expect(fencedChecks).toContain(
      "current_setting('lock_timeout') <> '1s'",
    );
    expect(fencedChecks).toContain(
      "current_setting( 'idle_in_transaction_session_timeout' ) <> '5s'",
    );
    expect(fencedChecks).toContain("and not role_record.rolcanlogin");
    expect(fencedChecks).toContain("and role_record.rolinherit");
    expect(fencedChecks).toContain("and membership.inherit_option");
    expect(fencedChecks).toContain("and not membership.set_option");
    expect(fencedChecks).toContain(
      "where membership.roleid = v_acquisition.runtime_role_oid",
    );
    expect(fencedChecks).toContain("and grantor_role.rolsuper");
    expect(fencedChecks).toContain("'usage'");
    expect(fencedChecks).toContain("'set'");
    expect(fencedChecks).toContain("and role_record.rolconnlimit = 1");
    expect(fencedChecks).toContain(
      "and role_record.rolvaliduntil = v_acquisition.expires_at",
    );
    expect(fencedChecks).toContain(") <> 1");

    const backendIdentity = wrapper.indexOf(
      `${brokerSchema}._current_runtime_backend_start()`,
      lockedRead,
    );
    expect(backendIdentity).toBeGreaterThan(lockedRead);
    expect(backendIdentity).toBeLessThan(activeRecheck);
  });

  it("requires the exact inherited caller edge before revoking and dropping the runtime role", () => {
    const finalize = normalizeSql(
      functionBlock(`${brokerSchema}.finalize`),
    );
    const membershipGuard = finalize.indexOf(
      "membership.member = v_acquisition.runtime_role_oid",
    );
    const revokeCaller = finalize.indexOf(
      "revoke careslink_v1_preview_runner_terminal_caller from %i",
      membershipGuard,
    );
    const dropRole = finalize.indexOf("drop role %i", revokeCaller);

    expect(membershipGuard).toBeGreaterThanOrEqual(0);
    expect(finalize.slice(membershipGuard, revokeCaller)).toContain(
      "membership.roleid = v_caller",
    );
    expect(finalize.slice(membershipGuard, revokeCaller)).toContain(
      "membership.inherit_option",
    );
    expect(finalize.slice(membershipGuard, revokeCaller)).toContain(
      "not membership.set_option",
    );
    expect(finalize.slice(membershipGuard, revokeCaller)).toContain(
      "v_acquisition.runtime_role_oid, v_caller, 'usage'",
    );
    expect(finalize.slice(membershipGuard, revokeCaller)).toContain(
      "v_acquisition.runtime_role_oid, v_caller, 'set'",
    );
    expect(finalize.slice(membershipGuard, revokeCaller)).toContain(
      "where membership.roleid = v_acquisition.runtime_role_oid",
    );
    expect(finalize.slice(membershipGuard, revokeCaller)).toContain(
      "and grantor_role.rolsuper",
    );
    expect(revokeCaller).toBeGreaterThan(membershipGuard);
    expect(dropRole).toBeGreaterThan(revokeCaller);
  });

  it("keeps the unfenced inner RPC executor-only and owns the wrapper as that executor", () => {
    const grantOwnerMembership = canonicalMigration.indexOf(
      canonicalSql(
        `grant careslink_v1_generation_owner to current_user with admin false, inherit false, set true granted by current_user;`,
      ),
    );
    const grantExecutorMembership = canonicalMigration.indexOf(
      canonicalSql(
        `grant ${terminalExecutor} to current_user with admin false, inherit false, set true granted by current_user;`,
      ),
      grantOwnerMembership,
    );
    const setOwnerForCreate = canonicalMigration.indexOf(
      canonicalSql("set role careslink_v1_generation_owner;"),
      grantExecutorMembership,
    );
    const grantSchemaCreate = canonicalMigration.indexOf(
      canonicalSql(
        `grant create on schema careslink_v1_generation to ${terminalExecutor};`,
      ),
      setOwnerForCreate,
    );
    const setExecutor = canonicalMigration.indexOf(
      canonicalSql(`set role ${terminalExecutor};`),
      grantSchemaCreate,
    );
    const renameInner = canonicalMigration.indexOf(
      canonicalSql(
        `alter function ${terminalRpc}(pg_catalog.jsonb, pg_catalog.text, pg_catalog.text) rename to _persist_verified_communication_note_preview_terminal_unfenced;`,
      ),
    );
    const createWrapper = canonicalMigration.indexOf(
      canonicalSql(`create function ${terminalRpc}(`),
      renameInner,
    );
    const restoreEntryRole = canonicalMigration.indexOf(
      canonicalSql(
        "select pg_catalog.set_config('role', pg_catalog.current_setting('careslink.migration_entry_role'), false);",
      ),
      createWrapper,
    );
    expect(setExecutor).toBeGreaterThanOrEqual(0);
    expect(grantOwnerMembership).toBeGreaterThanOrEqual(0);
    expect(grantExecutorMembership).toBeGreaterThan(grantOwnerMembership);
    expect(setOwnerForCreate).toBeGreaterThan(grantExecutorMembership);
    expect(grantSchemaCreate).toBeGreaterThan(setOwnerForCreate);
    expect(setExecutor).toBeGreaterThan(grantSchemaCreate);
    expect(renameInner).toBeGreaterThan(setExecutor);
    expect(createWrapper).toBeGreaterThan(renameInner);
    expect(restoreEntryRole).toBeGreaterThan(createWrapper);

    const setOwnerForRevoke = canonicalMigration.indexOf(
      canonicalSql("set role careslink_v1_generation_owner;"),
      restoreEntryRole,
    );
    const revokeSchemaCreate = canonicalMigration.indexOf(
      canonicalSql(
        `revoke create on schema careslink_v1_generation from ${terminalExecutor};`,
      ),
      setOwnerForRevoke,
    );
    const revokeExecutorMembership = canonicalMigration.indexOf(
      canonicalSql(
        `revoke ${terminalExecutor} from current_user granted by current_user;`,
      ),
      revokeSchemaCreate,
    );
    const revokeOwnerMembership = canonicalMigration.indexOf(
      canonicalSql(
        "revoke careslink_v1_generation_owner from current_user granted by current_user;",
      ),
      revokeExecutorMembership,
    );
    expect(setOwnerForRevoke).toBeGreaterThan(restoreEntryRole);
    expect(revokeSchemaCreate).toBeGreaterThan(setOwnerForRevoke);
    expect(revokeExecutorMembership).toBeGreaterThan(revokeSchemaCreate);
    expect(revokeOwnerMembership).toBeGreaterThan(revokeExecutorMembership);

    const innerAclGuard = normalizeSql(
      dollarBlock("do $careslink_v1_terminal_inner_acl_guard$"),
    );
    expect(innerAclGuard).toContain("procedure.proowner = v_executor");
    expect(innerAclGuard).toContain("acl.grantee = v_executor");
    expect(innerAclGuard).toContain("acl.grantor = v_executor");
    expect(innerAclGuard).toContain("not acl.is_grantable");
    expect(innerAclGuard).toContain(
      "has_function_privilege( v_caller, v_inner, 'execute' )",
    );

    const cleanupGuard = normalizeSql(
      dollarBlock("do $careslink_v1_terminal_cleanup_guard$"),
    );
    expect(cleanupGuard).toContain(
      "has_schema_privilege( v_executor, v_generation_schema, 'create' )",
    );
    expect(cleanupGuard).toContain(
      "membership.roleid in (v_executor, v_owner)",
    );

    const innerRevoke = canonicalStatementStartingAt(
      `revoke all on function ${unfencedTerminal}(`,
    );
    for (const role of [...apiRoles, terminalCaller, terminalExecutor]) {
      expect(innerRevoke).toContain(role);
    }
    expect(
      canonicalStatementStartingAt(
        `grant execute on function ${unfencedTerminal}(`,
      ),
    ).toBe(
      canonicalSql(
        `grant execute on function ${unfencedTerminal}(pg_catalog.jsonb, pg_catalog.text, pg_catalog.text) to ${terminalExecutor};`,
      ),
    );

    const backendIdentityHelper =
      `${brokerSchema}._current_runtime_backend_start`;
    const helper = normalizeSql(functionBlock(backendIdentityHelper));
    expect(helper).toContain("security definer");
    expect(helper).toContain("set search_path = ''");
    expect(helper).toContain(
      "activity.pid = pg_catalog.pg_backend_pid()",
    );
    expect(helper).toContain("activity.usename = session_user");
    expect(helper).toContain(
      "candidate.usesysid = v_runtime_oid or candidate.usename = session_user",
    );
    expect(helper).toContain(") = 1");
    const helperRevoke = canonicalStatementStartingAt(
      `revoke all on function ${backendIdentityHelper}(`,
    );
    for (const role of [...apiRoles, terminalCaller, terminalExecutor]) {
      expect(helperRevoke).toContain(role);
    }
    expect(
      canonicalStatementStartingAt(
        `grant execute on function ${backendIdentityHelper}(`,
      ),
    ).toBe(
      canonicalSql(
        `grant execute on function ${backendIdentityHelper}() to ${terminalExecutor};`,
      ),
    );

    const wrapperRevoke = canonicalStatementStartingAt(
      `revoke all on function ${terminalRpc}(`,
      createWrapper,
    );
    for (const role of [...apiRoles, terminalCaller, terminalExecutor]) {
      expect(wrapperRevoke).toContain(role);
    }
    expect(
      canonicalStatementStartingAt(
        `grant execute on function ${terminalRpc}(`,
        createWrapper,
      ),
    ).toBe(
      canonicalSql(
        `grant execute on function ${terminalRpc}(pg_catalog.jsonb, pg_catalog.text, pg_catalog.text) to ${terminalExecutor}, ${terminalCaller};`,
      ),
    );
  });

  it("combines exact ACLs, default-deny privileges, composite-type access and FORCE RLS", () => {
    const schemaRevoke = canonicalStatementStartingAt(
      `revoke all on schema ${brokerSchema}`,
    );
    const tableRevoke = canonicalStatementStartingAt(
      `revoke all on table ${acquisitions}`,
    );
    const typeRevoke = canonicalStatementStartingAt(
      `revoke all on type ${acquisitions}`,
    );
    for (const role of apiRoles) {
      expect(schemaRevoke).toContain(role);
      expect(tableRevoke).toContain(role);
      expect(typeRevoke).toContain(role);
    }
    expect(typeRevoke).toContain(terminalCaller);

    expect(
      canonicalStatementStartingAt(`grant usage on schema ${brokerSchema}`),
    ).toBe(
      canonicalSql(
        `grant usage on schema ${brokerSchema} to ${terminalExecutor};`,
      ),
    );
    expect(
      canonicalStatementStartingAt(`grant select on table ${acquisitions}`),
    ).toBe(
      canonicalSql(
        `grant select on table ${acquisitions} to ${terminalExecutor};`,
      ),
    );
    expect(
      canonicalStatementStartingAt(`grant usage on type ${acquisitions}`),
    ).toBe(
      canonicalSql(
        `grant usage on type ${acquisitions} to ${terminalExecutor};`,
      ),
    );

    expect(normalizedMigration).toContain(
      `alter table ${acquisitions} enable row level security;`,
    );
    expect(normalizedMigration).toContain(
      `alter table ${acquisitions} force row level security;`,
    );
    const policy = canonicalStatementStartingAt(
      "create policy runtime_credential_broker_terminal_session_select",
    );
    expect(policy).toBe(
      canonicalSql(
        `create policy runtime_credential_broker_terminal_session_select on ${acquisitions} for select to ${terminalExecutor} using (runtime_role = session_user);`,
      ),
    );
    expect(normalizedMigration.match(/\bcreate policy\b/g)).toHaveLength(1);

    for (const objectKind of [
      "functions",
      "tables",
      "sequences",
      "types",
    ] as const) {
      const defaults = canonicalStatementStartingAt(
        `alter default privileges for role postgres in schema ${brokerSchema} revoke`,
        0,
        objectKind,
      );
      expect(defaults).toContain(`on ${objectKind} from`);
      for (const role of [...apiRoles, terminalCaller]) {
        expect(defaults).toContain(role);
      }
    }

    expect(normalizedMigration).not.toMatch(
      /\bgrant\b[^;]*\bto\s+(?:public|anon|authenticated|service_role|authenticator)\b/,
    );
  });
});

function normalizeSql(source: string) {
  return source.replace(/--.*$/gm, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function canonicalSql(source: string) {
  return normalizeSql(source).replace(/\s*([(),;])\s*/g, "$1");
}

function functionBlock(qualifiedName: string) {
  const startMatch = new RegExp(
    `create\\s+function\\s+${escapeRegExp(qualifiedName)}\\s*\\(`,
    "i",
  ).exec(migration);
  expect(startMatch, `${qualifiedName} function is missing`).not.toBeNull();
  const start = startMatch!.index;
  const tail = migration.slice(start);
  const bodyStart = /\bas\s+\$([a-z0-9_]+)\$/i.exec(tail);
  expect(bodyStart, `${qualifiedName} body delimiter is missing`).not.toBeNull();
  const delimiter = `$${bodyStart![1]}$;`;
  const end = tail.indexOf(delimiter, bodyStart!.index + bodyStart![0].length);
  expect(end, `${qualifiedName} function is unterminated`).toBeGreaterThanOrEqual(0);
  return tail.slice(0, end + delimiter.length);
}

function tableBlock(qualifiedName: string) {
  const marker = `create table ${qualifiedName} (`;
  const start = migration.toLowerCase().indexOf(marker);
  expect(start, `${qualifiedName} table is missing`).toBeGreaterThanOrEqual(0);
  const end = migration.toLowerCase().indexOf("\n);", start);
  expect(end, `${qualifiedName} table is unterminated`).toBeGreaterThan(start);
  return migration.slice(start, end + 3);
}

function dollarBlock(marker: string) {
  const start = migration.toLowerCase().indexOf(marker.toLowerCase());
  expect(start, `${marker} block is missing`).toBeGreaterThanOrEqual(0);
  const delimiter = marker.slice(marker.indexOf("$"));
  const end = migration.indexOf(`${delimiter};`, start + marker.length);
  expect(end, `${marker} block is unterminated`).toBeGreaterThan(start);
  return migration.slice(start, end + delimiter.length + 1);
}

function canonicalStatementStartingAt(
  marker: string,
  fromIndex = 0,
  requiredFragment?: string,
) {
  const canonicalMarker = canonicalSql(marker);
  let start = canonicalMigration.indexOf(canonicalMarker, fromIndex);
  while (start >= 0) {
    const end = canonicalMigration.indexOf(";", start);
    expect(end, `${marker} statement is unterminated`).toBeGreaterThan(start);
    const statement = canonicalMigration.slice(start, end + 1);
    if (
      !requiredFragment ||
      statement.includes(`on ${requiredFragment} from`)
    ) {
      return statement;
    }
    start = canonicalMigration.indexOf(canonicalMarker, start + 1);
  }
  expect(start, `${marker} statement is missing`).toBeGreaterThanOrEqual(0);
  return "";
}

function escapeRegExp(source: string) {
  return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
