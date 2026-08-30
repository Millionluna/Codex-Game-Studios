import "server-only";

import { createHash } from "node:crypto";
import { types as nodeTypes } from "node:util";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST,
  validateTestOnlyCaresLinkV1CommunicationNotePreviewKeyCustodySnapshot,
} from "./communication-note-preview-key-custody.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_EXECUTOR_ROLE,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POSTGRES_SQL,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_RPC_NAME,
  createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalPostgresPort,
} from "./communication-note-preview-runner-terminal-postgres.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST,
} from "./communication-note-preview-runner-terminal-policy.server";
import {
  composeTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrust,
  createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustRegistry,
  resolveTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalCallerIdentity,
} from "./communication-note-preview-runner-terminal-trust-composition.server";
import {
  createTestOnlyCaresLinkV1CommunicationNotePreviewSignedRunnerTerminalRuntimePort,
  type CaresLinkV1CommunicationNotePreviewRunnerTerminalDatabaseResult,
} from "./communication-note-preview-signed-runner-terminal-runtime-port.server";
import {
  type CaresLinkV1VerifiedCommunicationNotePreviewAuthorization,
} from "./communication-note-preview-execution-authority.server";
import { CaresLinkV1ContractError } from "./shared-contracts";

const MAXIMUM_CUSTODY_RESOLUTION_LIFETIME_MS = 5 * 60 * 1_000;
const MAXIMUM_CALLER_LEASE_LIFETIME_MS = 10 * 60 * 1_000;
const MINIMUM_CALLER_LEASE_REMAINING_MS = 30 * 1_000;
const TRANSACTION_TIMEOUT_MS = 10 * 1_000;
const RESOLVER_SETTLEMENT_TIMEOUT_MS = 5 * 1_000;
const DATABASE_SETTLEMENT_TIMEOUT_MS = 12 * 1_000;
const CLEANUP_SETTLEMENT_TIMEOUT_MS = 5 * 1_000;
const RUNTIME_ROLE_PATTERN =
  /^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const TEST_ONLY_DATABASE_TARGETS = new WeakSet<object>();
const TEST_ONLY_CUSTODY_RESOLVERS = new WeakSet<object>();
const TEST_ONLY_CALLER_CREDENTIAL_RESOLVERS = new WeakSet<object>();
const TEST_ONLY_CONSUMED_LEASE_REFERENCES = new Set<string>();
const TEST_ONLY_CONSUMED_SESSION_BINDINGS = new Set<string>();
const TEST_ONLY_CONSUMED_RUNTIME_ROLES = new Set<string>();
const TEST_ONLY_CONSUMED_QUERY_FUNCTIONS = new WeakSet<
  ResolvedRuntimeQueryPort["query"]
>();
const TEST_ONLY_EXCLUSIVE_SESSION_LEASES = new WeakMap<
  object,
  {
    query: ResolvedRuntimeQueryPort["query"];
    state: "ISSUED" | "CONSUMED" | "RELEASED";
  }
>();

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_VERSION =
  "binding.communication.openai.synthetic-preview.2026-08-30.m1l.v1" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_READY =
  false as const;

const RESOLVED_RUNTIME_BINDING_POLICY_CORE = deepFreeze({
  version:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_VERSION,
  status:
    "SOURCE_CONTRACT_WITH_UNAPPLIED_INHERITED_CALLER_BINDING_NOT_APPROVED",
  ready: false,
  purpose:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE,
  callerRole:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE,
  executorRole:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_EXECUTOR_ROLE,
  rpcNames: [
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_RPC_NAME,
  ],
  custodyPolicyDigest:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST,
  terminalPolicyDigest:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST,
  maximumCustodyResolutionLifetimeMs:
    MAXIMUM_CUSTODY_RESOLUTION_LIFETIME_MS,
  maximumCallerLeaseLifetimeMs: MAXIMUM_CALLER_LEASE_LIFETIME_MS,
  minimumCallerLeaseRemainingMs: MINIMUM_CALLER_LEASE_REMAINING_MS,
  transactionTimeoutMs: TRANSACTION_TIMEOUT_MS,
  resolverSettlementTimeoutMs: RESOLVER_SETTLEMENT_TIMEOUT_MS,
  databaseSettlementTimeoutMs: DATABASE_SETTLEMENT_TIMEOUT_MS,
  cleanupSettlementTimeoutMs: CLEANUP_SETTLEMENT_TIMEOUT_MS,
  targetClass: "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW",
  postgresMajor: 17,
  transactionIsolation: "READ COMMITTED",
  roleScope: "INHERITED_CALLER_PRIVILEGES_WITHOUT_SET_ROLE",
  runtimeCurrentUserRemainsSessionUser: true,
  runtimeLoginRevokedBeforeUse: true,
  callerMembershipAdmin: false,
  callerMembershipInherit: true,
  callerMembershipSet: false,
  runtimeInboundCreatorMembershipSource:
    "POSTGRESQL_CREATEROLE_AUTOMATIC_CREATOR_EDGE",
  runtimeInboundCreatorMembershipCount: 1,
  runtimeInboundCreatorMembershipMember: "postgres",
  runtimeInboundCreatorMembershipGrantorSuperuser: true,
  runtimeInboundCreatorMembershipGrantorDistinctFromMember: true,
  runtimeInboundCreatorMembershipAdmin: true,
  runtimeInboundCreatorMembershipInherit: false,
  runtimeInboundCreatorMembershipSet: false,
  runtimeInboundCreatorMembershipImmediatelyUsable: false,
  callerOwnedPersistentObjectsAllowed: false,
  connectionMode: "ONE_PHYSICAL_SESSION_SINGLE_USE",
  queryResultMode: "NORMALIZED_ROWS_ONLY",
  databaseClockAndBackendAttestationRequired: true,
  authorizationExpiryCeilingRequired: true,
  monotonicClockRequired: true,
  abortSignalRequired: true,
  executorPostureAttestationRequired: true,
  leaseSessionRuntimeAndQuerySingleUseRequired: true,
  strictReleaseBindingRequired: true,
  acquisitionDigestTombstoneRequired: true,
  testOnlyReleaseReportRequired: true,
  automaticRetry: false,
  rawCredentialMaterialPresent: false,
  privateKeyMaterialPresent: false,
} as const);

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_POLICY_DIGEST =
  "cfb9f27b63f1a623950b3033fc04300149bcba26389994aa04eb2d2213ea1115" as const;

if (
  canonicalSha256(RESOLVED_RUNTIME_BINDING_POLICY_CORE) !==
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_POLICY_DIGEST
) {
  throw unavailable();
}

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_POLICY =
  deepFreeze({
    ...RESOLVED_RUNTIME_BINDING_POLICY_CORE,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_POLICY_DIGEST,
  });

export const CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNNER_TERMINAL_CUSTODY_RESOLVER =
  undefined;
export const CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNNER_TERMINAL_CALLER_CREDENTIAL_RESOLVER =
  undefined;
export const CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RESOLVED_RUNTIME_DATABASE_TARGET =
  undefined;
export const CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RESOLVED_RUNNER_TERMINAL_RUNTIME_PORT =
  undefined;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BEGIN_SQL =
  "begin isolation level read committed read write" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_STATEMENT_TIMEOUT_SQL =
  "set local statement_timeout = '5s'" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_LOCK_TIMEOUT_SQL =
  "set local lock_timeout = '1s'" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_IDLE_TIMEOUT_SQL =
  "set local idle_in_transaction_session_timeout = '5s'" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_TRANSACTION_TIMEOUT_SQL =
  "set local transaction_timeout = '10s'" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_TIMEOUT_SQL =
  Object.freeze([
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_STATEMENT_TIMEOUT_SQL,
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_LOCK_TIMEOUT_SQL,
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_IDLE_TIMEOUT_SQL,
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_TRANSACTION_TIMEOUT_SQL,
  ] as const);
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_COMMIT_SQL =
  "commit" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_ROLLBACK_SQL =
  "rollback" as const;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BASE_IDENTITY_SQL =
  `select
  current_user,
  session_user,
  pg_catalog.pg_backend_pid() as backend_pid,
  pg_catalog.pg_current_xact_id()::pg_catalog.text as transaction_id,
  pg_catalog.to_char(
    pg_catalog.clock_timestamp() at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ) as database_now,
  pg_catalog.current_database() as database_name,
  pg_catalog.current_setting('server_version_num')::pg_catalog.int4 /
    10000 as postgres_major,
  pg_catalog.current_setting('transaction_isolation') as transaction_isolation,
  runtime_role.rolcanlogin,
  runtime_role.rolsuper,
  runtime_role.rolinherit,
  runtime_role.rolcreaterole,
  runtime_role.rolcreatedb,
  runtime_role.rolreplication,
  runtime_role.rolbypassrls,
  runtime_role.rolconnlimit,
  pg_catalog.to_char(
    runtime_role.rolvaliduntil at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ) as role_valid_until,
  pg_catalog.pg_has_role(
    current_user,
    '${CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE}',
    'MEMBER'
  ) as caller_member,
  pg_catalog.pg_has_role(
    current_user,
    '${CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE}',
    'SET'
  ) as caller_set,
  pg_catalog.pg_has_role(
    current_user,
    '${CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE}',
    'USAGE'
  ) as caller_inherited,
  (
    select pg_catalog.count(*)::pg_catalog.int4
    from pg_catalog.pg_auth_members as membership
    where membership.member = runtime_role.oid
  ) as direct_membership_count,
  (
    select pg_catalog.count(*)::pg_catalog.int4
    from pg_catalog.pg_auth_members as inbound_membership
    where inbound_membership.roleid = runtime_role.oid
  ) as runtime_inbound_membership_count,
  not exists (
    select 1
    from pg_catalog.pg_auth_members as inbound_membership
    join pg_catalog.pg_roles as grantor_role
      on grantor_role.oid = inbound_membership.grantor
    where inbound_membership.roleid = runtime_role.oid
      and not (
        inbound_membership.member = pg_catalog.to_regrole('postgres')
        and grantor_role.rolsuper
        and inbound_membership.grantor <> inbound_membership.member
        and inbound_membership.admin_option
        and not inbound_membership.inherit_option
        and not inbound_membership.set_option
      )
  ) as runtime_inbound_membership_posture,
  membership.admin_option as caller_membership_admin,
  membership.inherit_option as caller_membership_inherit,
  membership.set_option as caller_membership_set,
  (
    select pg_catalog.has_function_privilege(
      current_user,
      function_record.oid,
      'EXECUTE'
    )
    from pg_catalog.pg_proc as function_record
    join pg_catalog.pg_namespace as namespace_record
      on namespace_record.oid = function_record.pronamespace
    where namespace_record.nspname = 'careslink_v1_generation'
      and function_record.proname =
        '${CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_RPC_NAME}'
      and pg_catalog.oidvectortypes(function_record.proargtypes) =
        'jsonb, text, text'
  ) as base_exact_rpc_executable,
  pg_catalog.has_schema_privilege(
    current_user,
    'careslink_v1_generation',
    'USAGE'
  ) as base_generation_schema_usage,
  pg_catalog.has_schema_privilege(
    current_user,
    'careslink_v1_generation',
    'CREATE'
  ) as base_generation_schema_create,
  (
    select pg_catalog.count(*)::pg_catalog.int4
    from pg_catalog.pg_proc as function_record
    join pg_catalog.pg_namespace as namespace_record
      on namespace_record.oid = function_record.pronamespace
    where namespace_record.nspname = 'careslink_v1_generation'
      and pg_catalog.has_function_privilege(
        current_user,
        function_record.oid,
        'EXECUTE'
      )
  ) as base_generation_executable_function_count,
  (
    with candidate_relation as materialized (
      select relation_record.oid
      from pg_catalog.pg_class as relation_record
      join pg_catalog.pg_namespace as namespace_record
        on namespace_record.oid = relation_record.relnamespace
      where namespace_record.nspname = 'careslink_v1_generation'
        and relation_record.relkind in ('r', 'p', 'v', 'm', 'f')
    )
    select pg_catalog.count(*)::pg_catalog.int4
    from candidate_relation as relation_record
    where (
        pg_catalog.has_table_privilege(
          current_user,
          relation_record.oid,
          'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
        )
        or pg_catalog.has_any_column_privilege(
          current_user,
          relation_record.oid,
          'SELECT,INSERT,UPDATE,REFERENCES'
        )
      )
  ) as base_generation_table_privilege_count,
  (
    with candidate_sequence as materialized (
      select sequence_record.oid
      from pg_catalog.pg_class as sequence_record
      join pg_catalog.pg_namespace as namespace_record
        on namespace_record.oid = sequence_record.relnamespace
      where namespace_record.nspname = 'careslink_v1_generation'
        and sequence_record.relkind = 'S'
    )
    select pg_catalog.count(*)::pg_catalog.int4
    from candidate_sequence as sequence_record
    where pg_catalog.has_sequence_privilege(
        current_user,
        sequence_record.oid,
        'USAGE,SELECT,UPDATE'
      )
  ) as base_generation_sequence_privilege_count,
  pg_catalog.pg_has_role(
    current_user,
    '${CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_EXECUTOR_ROLE}',
    'SET'
  ) as executor_set,
  pg_catalog.pg_has_role(current_user, 'authenticator', 'SET') as authenticator_set,
  pg_catalog.pg_has_role(current_user, 'anon', 'SET') as anon_set,
  pg_catalog.pg_has_role(current_user, 'authenticated', 'SET') as authenticated_set,
  pg_catalog.pg_has_role(current_user, 'service_role', 'SET') as service_role_set,
  pg_catalog.pg_has_role('authenticator', current_user, 'SET') as authenticator_can_set_runtime,
  pg_catalog.pg_has_role('anon', current_user, 'SET') as anon_can_set_runtime,
  pg_catalog.pg_has_role('authenticated', current_user, 'SET') as authenticated_can_set_runtime,
  pg_catalog.pg_has_role('service_role', current_user, 'SET') as service_role_can_set_runtime
from pg_catalog.pg_roles as runtime_role
join pg_catalog.pg_roles as caller_role
  on caller_role.rolname =
    '${CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE}'
join pg_catalog.pg_auth_members as membership
  on membership.member = runtime_role.oid
 and membership.roleid = caller_role.oid
where runtime_role.rolname = current_user` as const;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_INHERITED_CALLER_IDENTITY_SQL =
  `select
  current_user,
  session_user,
  pg_catalog.pg_backend_pid() as backend_pid,
  pg_catalog.pg_current_xact_id()::pg_catalog.text as transaction_id,
  pg_catalog.to_char(
    pg_catalog.clock_timestamp() at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ) as database_now,
  pg_catalog.current_database() as database_name,
  pg_catalog.current_setting('server_version_num')::pg_catalog.int4 /
    10000 as postgres_major,
  pg_catalog.current_setting('transaction_isolation') as transaction_isolation,
  runtime_role.rolcanlogin as runtime_rolcanlogin,
  runtime_role.rolsuper as runtime_rolsuper,
  runtime_role.rolinherit as runtime_rolinherit,
  runtime_role.rolcreaterole as runtime_rolcreaterole,
  runtime_role.rolcreatedb as runtime_rolcreatedb,
  runtime_role.rolreplication as runtime_rolreplication,
  runtime_role.rolbypassrls as runtime_rolbypassrls,
  runtime_role.rolconnlimit as runtime_rolconnlimit,
  pg_catalog.to_char(
    runtime_role.rolvaliduntil at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ) as runtime_role_valid_until,
  caller_role.rolcanlogin as caller_rolcanlogin,
  caller_role.rolsuper as caller_rolsuper,
  caller_role.rolinherit as caller_rolinherit,
  caller_role.rolcreaterole as caller_rolcreaterole,
  caller_role.rolcreatedb as caller_rolcreatedb,
  caller_role.rolreplication as caller_rolreplication,
  caller_role.rolbypassrls as caller_rolbypassrls,
  pg_catalog.pg_has_role(
    current_user,
    '${CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE}',
    'MEMBER'
  ) as caller_member,
  pg_catalog.pg_has_role(
    current_user,
    '${CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE}',
    'SET'
  ) as caller_set,
  pg_catalog.pg_has_role(
    current_user,
    '${CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE}',
    'USAGE'
  ) as caller_inherited,
  (
    select pg_catalog.count(*)::pg_catalog.int4
    from pg_catalog.pg_auth_members as direct_membership
    where direct_membership.member = runtime_role.oid
  ) as direct_membership_count,
  (
    select pg_catalog.count(*)::pg_catalog.int4
    from pg_catalog.pg_auth_members as runtime_inbound_membership
    where runtime_inbound_membership.roleid = runtime_role.oid
  ) as runtime_inbound_membership_count,
  not exists (
    select 1
    from pg_catalog.pg_auth_members as runtime_inbound_membership
    join pg_catalog.pg_roles as grantor_role
      on grantor_role.oid = runtime_inbound_membership.grantor
    where runtime_inbound_membership.roleid = runtime_role.oid
      and not (
        runtime_inbound_membership.member = pg_catalog.to_regrole('postgres')
        and grantor_role.rolsuper
        and runtime_inbound_membership.grantor <>
          runtime_inbound_membership.member
        and runtime_inbound_membership.admin_option
        and not runtime_inbound_membership.inherit_option
        and not runtime_inbound_membership.set_option
      )
  ) as runtime_inbound_membership_posture,
  membership.admin_option as caller_membership_admin,
  membership.inherit_option as caller_membership_inherit,
  membership.set_option as caller_membership_set,
  attested_executor_role.rolcanlogin as executor_rolcanlogin,
  attested_executor_role.rolsuper as executor_rolsuper,
  attested_executor_role.rolinherit as executor_rolinherit,
  attested_executor_role.rolcreaterole as executor_rolcreaterole,
  attested_executor_role.rolcreatedb as executor_rolcreatedb,
  attested_executor_role.rolreplication as executor_rolreplication,
  attested_executor_role.rolbypassrls as executor_rolbypassrls,
  (
    select pg_catalog.count(*)::pg_catalog.int4
    from pg_catalog.pg_auth_members as executor_outbound_membership
    where executor_outbound_membership.member = attested_executor_role.oid
  ) as executor_outbound_membership_count,
  (
    select pg_catalog.count(*)::pg_catalog.int4
    from pg_catalog.pg_auth_members as executor_inbound_membership
    where executor_inbound_membership.roleid = attested_executor_role.oid
      and (
        executor_inbound_membership.set_option
        or executor_inbound_membership.inherit_option
      )
  ) as executor_inbound_active_membership_count,
  (
    select pg_catalog.count(*)::pg_catalog.int4
    from pg_catalog.pg_auth_members as membership
    where membership.member = caller_role.oid
  ) as caller_outbound_membership_count,
  (
    select pg_catalog.count(*)::pg_catalog.int4
    from pg_catalog.pg_auth_members as inbound_membership
    join pg_catalog.pg_roles as inbound_member_role
      on inbound_member_role.oid = inbound_membership.member
    where inbound_membership.roleid = caller_role.oid
      and (inbound_membership.set_option or inbound_membership.inherit_option)
      and inbound_member_role.rolname !~
        '^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$'
  ) as non_runtime_inbound_active_membership_count,
  (
    select pg_catalog.has_function_privilege(
      current_user,
      function_record.oid,
      'EXECUTE'
    )
    from pg_catalog.pg_proc as function_record
    join pg_catalog.pg_namespace as namespace_record
      on namespace_record.oid = function_record.pronamespace
    where namespace_record.nspname = 'careslink_v1_generation'
      and function_record.proname =
        '${CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_RPC_NAME}'
      and pg_catalog.oidvectortypes(function_record.proargtypes) =
        'jsonb, text, text'
  ) as exact_rpc_executable,
  pg_catalog.has_schema_privilege(
    current_user,
    'careslink_v1_generation',
    'USAGE'
  ) as generation_schema_usage,
  pg_catalog.has_schema_privilege(
    current_user,
    'careslink_v1_generation',
    'CREATE'
  ) as generation_schema_create,
  (
    select
      function_record.proowner = executor_role.oid
      and function_record.prosecdef
      and function_record.provolatile = 'v'
      and function_record.prokind = 'f'
      and language_record.lanname = 'plpgsql'
      and not function_record.proretset
      and function_record.provariadic = 0
      and pg_catalog.oidvectortypes(function_record.proargtypes) =
        'jsonb, text, text'
      and pg_catalog.pg_get_function_identity_arguments(function_record.oid) =
        'p_statement jsonb, p_signature_base64url text, p_verifier_identity_hmac text'
      and pg_catalog.format_type(function_record.prorettype, null) = 'jsonb'
      and function_record.proconfig is not null
      and pg_catalog.cardinality(function_record.proconfig) = 1
      and function_record.proconfig[1] in ('search_path=', 'search_path=""')
    from pg_catalog.pg_proc as function_record
    join pg_catalog.pg_namespace as namespace_record
      on namespace_record.oid = function_record.pronamespace
    join pg_catalog.pg_roles as executor_role
      on executor_role.rolname =
        '${CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_EXECUTOR_ROLE}'
    join pg_catalog.pg_language as language_record
      on language_record.oid = function_record.prolang
    where namespace_record.nspname = 'careslink_v1_generation'
      and function_record.proname =
        '${CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_RPC_NAME}'
      and pg_catalog.oidvectortypes(function_record.proargtypes) =
        'jsonb, text, text'
  ) as exact_rpc_metadata_valid,
  (
    select
      pg_catalog.count(*) = 2
      and pg_catalog.count(*) filter (
        where privilege_record.grantee = caller_role.oid
      ) = 1
      and pg_catalog.count(*) filter (
        where privilege_record.grantee = executor_role.oid
      ) = 1
      and pg_catalog.bool_and(
        privilege_record.grantor = executor_role.oid
      )
      and pg_catalog.bool_and(not privilege_record.is_grantable)
    from pg_catalog.pg_proc as function_record
    join pg_catalog.pg_namespace as namespace_record
      on namespace_record.oid = function_record.pronamespace
    join pg_catalog.pg_roles as executor_role
      on executor_role.rolname =
        '${CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_EXECUTOR_ROLE}'
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        function_record.proacl,
        pg_catalog.acldefault('f', function_record.proowner)
      )
    ) as privilege_record
    where namespace_record.nspname = 'careslink_v1_generation'
      and function_record.proname =
        '${CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_RPC_NAME}'
      and pg_catalog.oidvectortypes(function_record.proargtypes) =
        'jsonb, text, text'
      and privilege_record.privilege_type = 'EXECUTE'
  ) as exact_rpc_acl_valid,
  (
    select pg_catalog.has_function_privilege(
      'authenticator', function_record.oid, 'EXECUTE'
    )
    from pg_catalog.pg_proc as function_record
    join pg_catalog.pg_namespace as namespace_record
      on namespace_record.oid = function_record.pronamespace
    where namespace_record.nspname = 'careslink_v1_generation'
      and function_record.proname =
        '${CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_RPC_NAME}'
      and pg_catalog.oidvectortypes(function_record.proargtypes) =
        'jsonb, text, text'
  ) as authenticator_exact_rpc_executable,
  (
    select pg_catalog.has_function_privilege(
      'anon', function_record.oid, 'EXECUTE'
    )
    from pg_catalog.pg_proc as function_record
    join pg_catalog.pg_namespace as namespace_record
      on namespace_record.oid = function_record.pronamespace
    where namespace_record.nspname = 'careslink_v1_generation'
      and function_record.proname =
        '${CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_RPC_NAME}'
      and pg_catalog.oidvectortypes(function_record.proargtypes) =
        'jsonb, text, text'
  ) as anon_exact_rpc_executable,
  (
    select pg_catalog.has_function_privilege(
      'authenticated', function_record.oid, 'EXECUTE'
    )
    from pg_catalog.pg_proc as function_record
    join pg_catalog.pg_namespace as namespace_record
      on namespace_record.oid = function_record.pronamespace
    where namespace_record.nspname = 'careslink_v1_generation'
      and function_record.proname =
        '${CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_RPC_NAME}'
      and pg_catalog.oidvectortypes(function_record.proargtypes) =
        'jsonb, text, text'
  ) as authenticated_exact_rpc_executable,
  (
    select pg_catalog.has_function_privilege(
      'service_role', function_record.oid, 'EXECUTE'
    )
    from pg_catalog.pg_proc as function_record
    join pg_catalog.pg_namespace as namespace_record
      on namespace_record.oid = function_record.pronamespace
    where namespace_record.nspname = 'careslink_v1_generation'
      and function_record.proname =
        '${CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_RPC_NAME}'
      and pg_catalog.oidvectortypes(function_record.proargtypes) =
        'jsonb, text, text'
  ) as service_role_exact_rpc_executable,
  (
    select pg_catalog.count(*)::pg_catalog.int4
    from pg_catalog.pg_proc as function_record
    join pg_catalog.pg_namespace as namespace_record
      on namespace_record.oid = function_record.pronamespace
    where namespace_record.nspname = 'careslink_v1_generation'
      and pg_catalog.has_function_privilege(
        current_user,
        function_record.oid,
        'EXECUTE'
      )
  ) as generation_executable_function_count,
  (
    with candidate_relation as materialized (
      select relation_record.oid
      from pg_catalog.pg_class as relation_record
      join pg_catalog.pg_namespace as namespace_record
        on namespace_record.oid = relation_record.relnamespace
      where namespace_record.nspname = 'careslink_v1_generation'
        and relation_record.relkind in ('r', 'p', 'v', 'm', 'f')
    )
    select pg_catalog.count(*)::pg_catalog.int4
    from candidate_relation as relation_record
    where (
        pg_catalog.has_table_privilege(
          current_user,
          relation_record.oid,
          'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
        )
        or pg_catalog.has_any_column_privilege(
          current_user,
          relation_record.oid,
          'SELECT,INSERT,UPDATE,REFERENCES'
        )
      )
  ) as generation_table_privilege_count,
  (
    with candidate_sequence as materialized (
      select sequence_record.oid
      from pg_catalog.pg_class as sequence_record
      join pg_catalog.pg_namespace as namespace_record
        on namespace_record.oid = sequence_record.relnamespace
      where namespace_record.nspname = 'careslink_v1_generation'
        and sequence_record.relkind = 'S'
    )
    select pg_catalog.count(*)::pg_catalog.int4
    from candidate_sequence as sequence_record
    where pg_catalog.has_sequence_privilege(
        current_user,
        sequence_record.oid,
        'USAGE,SELECT,UPDATE'
      )
  ) as generation_sequence_privilege_count,
  pg_catalog.pg_has_role(
    current_user,
    '${CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_EXECUTOR_ROLE}',
    'SET'
  ) as executor_set,
  pg_catalog.pg_has_role(current_user, 'authenticator', 'SET') as authenticator_set,
  pg_catalog.pg_has_role(current_user, 'anon', 'SET') as anon_set,
  pg_catalog.pg_has_role(current_user, 'authenticated', 'SET') as authenticated_set,
  pg_catalog.pg_has_role(current_user, 'service_role', 'SET') as service_role_set,
  pg_catalog.pg_has_role('authenticator', current_user, 'SET') as authenticator_can_set_runtime,
  pg_catalog.pg_has_role('anon', current_user, 'SET') as anon_can_set_runtime,
  pg_catalog.pg_has_role('authenticated', current_user, 'SET') as authenticated_can_set_runtime,
  pg_catalog.pg_has_role('service_role', current_user, 'SET') as service_role_can_set_runtime
from pg_catalog.pg_roles as runtime_role
join pg_catalog.pg_roles as caller_role
  on caller_role.rolname =
    '${CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE}'
join pg_catalog.pg_auth_members as membership
  on membership.member = runtime_role.oid
 and membership.roleid = caller_role.oid
join pg_catalog.pg_roles as attested_executor_role
  on attested_executor_role.rolname =
    '${CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_EXECUTOR_ROLE}'
where runtime_role.rolname = current_user` as const;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_RESET_IDENTITY_SQL =
  `select
  current_user,
  session_user,
  pg_catalog.pg_backend_pid() as backend_pid,
  pg_catalog.to_char(
    pg_catalog.clock_timestamp() at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ) as database_now` as const;

type NormalizedQueryResult = Readonly<{
  rows: readonly unknown[];
}>;

type BoundedCallContext = Readonly<{
  signal: AbortSignal;
}>;

type ResolvedRuntimeQueryPort = Readonly<{
  query: (
    sql: string,
    values: readonly unknown[] | undefined,
    context: BoundedCallContext,
  ) => PromiseLike<NormalizedQueryResult>;
}>;

export type CaresLinkV1CommunicationNotePreviewRunnerTerminalCustodyResolver =
  Readonly<{
    resolve: (
      request: unknown,
      context: BoundedCallContext,
    ) => PromiseLike<unknown>;
  }>;

export type CaresLinkV1CommunicationNotePreviewRunnerTerminalCallerCredentialResolver =
  Readonly<{
    acquire: (
      request: unknown,
      context: BoundedCallContext,
    ) => PromiseLike<unknown>;
    revoke: (
      request: unknown,
      context: BoundedCallContext,
    ) => PromiseLike<unknown>;
  }>;

export type CaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget =
  Readonly<{
    status: "VALIDATED_DISPOSABLE_PREVIEW_TARGET_NOT_APPROVED";
    targetClass: "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW";
    targetProjectRefHmac: string;
    productionProjectRefHmac: string;
    controlPlaneEvidenceSha256: string;
    databaseName: "postgres";
    postgresMajor: 17;
    projectStatus: "ACTIVE_HEALTHY";
    tlsMode: "VERIFY_FULL_PINNED_CA";
    tlsRootCertificateSha256: string;
    observedAt: string;
    expiresAt: string;
    defaultBranch: false;
    persistent: false;
    withData: false;
    productionExcluded: true;
    rawCredentialMaterialPresent: false;
  }>;

export type CaresLinkV1CommunicationNotePreviewResolvedRunnerTerminalRuntimePort =
  Readonly<{
    status: "TEST_ONLY_SOURCE_CONTRACT_NOT_APPROVED";
    purpose: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE;
    callerRole: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE;
    persist: (
      envelope: unknown,
    ) => Promise<CaresLinkV1CommunicationNotePreviewRunnerTerminalDatabaseResult>;
  }>;

type ValidatedCallerLease = Readonly<{
  requestDigest: string;
  leaseReferenceSha256: string;
  sessionBindingSha256: string;
  runtimeRole: string;
  databaseName: "postgres";
  postgresMajor: 17;
  authorizationExpiresAt: string;
  issuedAt: string;
  expiresAt: string;
  queryPort: ResolvedRuntimeQueryPort;
}>;

export function createCaresLinkV1CommunicationNotePreviewResolvedRunnerTerminalRuntimePort(
  _value: unknown,
): never {
  void _value;
  throw unavailable();
}

export function createTestOnlyCaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget {
  const target = validateDatabaseTargetShape(value);
  TEST_ONLY_DATABASE_TARGETS.add(target);
  return target;
}

export function createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalCustodyResolver(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewRunnerTerminalCustodyResolver {
  const object = exactDataRecord(value, ["capability", "resolve"]);
  if (
    object.capability !== "TEST_ONLY_RUNNER_TERMINAL_CUSTODY_RESOLVER" ||
    typeof object.resolve !== "function" ||
    nodeTypes.isProxy(object.resolve)
  ) {
    throw unavailable();
  }
  const resolver = Object.freeze({
    resolve:
      object.resolve as CaresLinkV1CommunicationNotePreviewRunnerTerminalCustodyResolver["resolve"],
  });
  TEST_ONLY_CUSTODY_RESOLVERS.add(resolver);
  return resolver;
}

export function createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalCallerCredentialResolver(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewRunnerTerminalCallerCredentialResolver {
  const object = exactDataRecord(value, ["capability", "acquire", "revoke"]);
  if (
    object.capability !==
      "TEST_ONLY_RUNNER_TERMINAL_CALLER_CREDENTIAL_RESOLVER" ||
    typeof object.acquire !== "function" ||
    nodeTypes.isProxy(object.acquire) ||
    typeof object.revoke !== "function" ||
    nodeTypes.isProxy(object.revoke)
  ) {
    throw unavailable();
  }
  const resolver = Object.freeze({
    acquire:
      object.acquire as CaresLinkV1CommunicationNotePreviewRunnerTerminalCallerCredentialResolver["acquire"],
    revoke:
      object.revoke as CaresLinkV1CommunicationNotePreviewRunnerTerminalCallerCredentialResolver["revoke"],
  });
  TEST_ONLY_CALLER_CREDENTIAL_RESOLVERS.add(resolver);
  return resolver;
}

export function createTestOnlyCaresLinkV1CommunicationNotePreviewExclusiveSessionLease(
  value: unknown,
): Readonly<Record<string, unknown>> {
  const object = exactDataRecord(value, ["capability", "descriptor", "query"]);
  if (
    object.capability !== "TEST_ONLY_EXCLUSIVE_SESSION_LEASE" ||
    typeof object.query !== "function" ||
    nodeTypes.isProxy(object.query)
  ) {
    throw unavailable();
  }
  const publicLease = deepFreeze({ ...readDataRecord(object.descriptor) });
  TEST_ONLY_EXCLUSIVE_SESSION_LEASES.set(publicLease, {
    query: object.query as ResolvedRuntimeQueryPort["query"],
    state: "ISSUED",
  });
  return publicLease;
}

export function createTestOnlyCaresLinkV1CommunicationNotePreviewResolvedRunnerTerminalRuntimePort(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewResolvedRunnerTerminalRuntimePort {
  const options = exactDataRecord(value, [
    "capability",
    "verifiedAuthorization",
    "databaseTarget",
    "custodyResolver",
    "callerCredentialResolver",
    "clock",
  ]);
  if (options.capability !== "TEST_ONLY_M1L_RESOLVED_RUNTIME_BINDING") {
    throw unavailable();
  }
  const verifiedAuthorization =
    options.verifiedAuthorization as CaresLinkV1VerifiedCommunicationNotePreviewAuthorization;
  const authorization = extractAuthorizationBinding(verifiedAuthorization);
  const databaseTarget = requireTestOnlyDatabaseTarget(options.databaseTarget);
  const custodyResolver = requireTestOnlyCustodyResolver(options.custodyResolver);
  const callerCredentialResolver = requireTestOnlyCallerCredentialResolver(
    options.callerCredentialResolver,
  );
  const clock = validateClock(options.clock);

  return Object.freeze({
    status: "TEST_ONLY_SOURCE_CONTRACT_NOT_APPROVED" as const,
    purpose:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE,
    callerRole:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE,
    async persist(envelope: unknown) {
      const requestNow = readClock(clock);
      validateDatabaseTargetFreshness(databaseTarget, requestNow);
      validateResolutionFreshness(
        authorization.authorizationExpiresAt,
        requestNow,
      );
      const trustRequest = createTrustResolutionRequest(
        authorization,
        databaseTarget,
        requestNow,
      );
      let rawTrustResolution: unknown;
      try {
        rawTrustResolution = await awaitBoundedSettlement(
          RESOLVER_SETTLEMENT_TIMEOUT_MS,
          (context) => custodyResolver.resolve(trustRequest, context),
        );
      } catch {
        throw unavailable();
      }
      const trustNow = readClock(clock);
      validateDatabaseTargetFreshness(databaseTarget, trustNow);
      const trust = validateTrustResolution(
        rawTrustResolution,
        trustRequest,
        verifiedAuthorization,
        trustNow,
      );
      const callerRequest = createCallerResolutionRequest(
        authorization,
        trust,
        databaseTarget,
        trustNow,
      );

      let rawLease: unknown;
      let lease: ValidatedCallerLease | undefined;
      let result:
        | CaresLinkV1CommunicationNotePreviewRunnerTerminalDatabaseResult
        | undefined;
      let primaryFailure: unknown;
      let cleanupFailed = false;
      try {
        rawLease = await awaitBoundedSettlement(
          RESOLVER_SETTLEMENT_TIMEOUT_MS,
          (context) => callerCredentialResolver.acquire(callerRequest, context),
        );
        const leaseNow = readClock(clock);
        validateDatabaseTargetFreshness(databaseTarget, leaseNow);
        validateResolutionFreshness(trust.expiresAt, leaseNow);
        lease = validateCallerLease(
          rawLease,
          callerRequest,
          databaseTarget,
          trust.expiresAt,
          leaseNow,
        );
        result = await persistWithLease(
          lease,
          trust.trustComposition,
          envelope,
          databaseTarget,
          trust.expiresAt,
          clock,
        );
      } catch (error) {
        primaryFailure = error;
      } finally {
        try {
          const cleanupBinding = extractLeaseCleanupBinding(rawLease);
          const revocationRequest = createCallerRevocationRequest(
            callerRequest,
            cleanupBinding,
          );
          const rawReceipt = await awaitBoundedSettlement(
            CLEANUP_SETTLEMENT_TIMEOUT_MS,
            (context) =>
              callerCredentialResolver.revoke(revocationRequest, context),
          );
          validateRevocationReceipt(
            rawReceipt,
            revocationRequest,
            readClock(clock),
          );
          markTestOnlySessionLeaseReleased(rawLease);
        } catch {
          cleanupFailed = true;
        }
      }
      if (cleanupFailed) throw unavailable();
      if (primaryFailure !== undefined) throw sanitizeRuntimeFailure(primaryFailure);
      if (!result) throw unavailable();
      return result;
    },
  });
}

function createTrustResolutionRequest(
  authorization: Readonly<{
    authorizationDigest: string;
    runIdHash: string;
    authorizationExpiresAt: string;
  }>,
  databaseTarget: CaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget,
  observedAt: string,
) {
  const databaseTargetDigest = canonicalSha256(databaseTarget);
  const core = deepFreeze({
    version:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_VERSION,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_POLICY_DIGEST,
    purpose:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE,
    custodyPolicyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST,
    terminalPolicyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST,
    authorizationDigest: authorization.authorizationDigest,
    runIdHash: authorization.runIdHash,
    authorizationExpiresAt: authorization.authorizationExpiresAt,
    databaseTargetDigest,
    observedAt,
    rawCredentialMaterialPresent: false as const,
    privateKeyMaterialPresent: false as const,
  });
  return deepFreeze({ ...core, requestDigest: canonicalSha256(core) });
}

function validateTrustResolution(
  value: unknown,
  request: ReturnType<typeof createTrustResolutionRequest>,
  verifiedAuthorization: CaresLinkV1VerifiedCommunicationNotePreviewAuthorization,
  now: string,
) {
  try {
    const object = exactDataRecord(value, [
      "status",
      "requestDigest",
      "observedAt",
      "expiresAt",
      "authenticatedDeliveryEvidenceSha256",
      "completeRevocationEvidenceSha256",
      "registryCandidate",
      "custodySnapshot",
      "rawCredentialMaterialPresent",
      "privateKeyMaterialPresent",
    ]);
    const observedAt = new Date(requireTimestamp(object.observedAt)).toISOString();
    const expiresAt = new Date(requireTimestamp(object.expiresAt)).toISOString();
    if (
      object.status !== "RESOLVED_CUSTODY_NOT_APPROVED" ||
      object.requestDigest !== request.requestDigest ||
      observedAt !== request.observedAt ||
      Date.parse(request.authorizationExpiresAt) <= Date.parse(now) ||
      Date.parse(expiresAt) <= Date.parse(now) ||
      Date.parse(expiresAt) > Date.parse(request.authorizationExpiresAt) ||
      Date.parse(expiresAt) - Date.parse(observedAt) >
        MAXIMUM_CUSTODY_RESOLUTION_LIFETIME_MS ||
      object.rawCredentialMaterialPresent !== false ||
      object.privateKeyMaterialPresent !== false
    ) {
      throw unavailable();
    }
    const authenticatedDeliveryEvidenceSha256 = requireSha256(
      object.authenticatedDeliveryEvidenceSha256,
    );
    const completeRevocationEvidenceSha256 = requireSha256(
      object.completeRevocationEvidenceSha256,
    );
    if (
      authenticatedDeliveryEvidenceSha256 ===
        completeRevocationEvidenceSha256 ||
      new Set([
        request.requestDigest,
        authenticatedDeliveryEvidenceSha256,
        completeRevocationEvidenceSha256,
      ]).size !== 3
    ) {
      throw unavailable();
    }
    const custodySnapshot =
      validateTestOnlyCaresLinkV1CommunicationNotePreviewKeyCustodySnapshot(
        object.custodySnapshot,
        { now, verifiedAuthorization },
      );
    const trustRegistry =
      createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustRegistry(
        object.registryCandidate,
        { now },
      );
    const trustComposition =
      composeTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrust({
        capability: "TEST_ONLY_RUNNER_TERMINAL_TRUST_COMPOSITION",
        trustRegistry,
        custodySnapshot,
        verifiedAuthorization,
        now,
      });
    const callerIdentity =
      resolveTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalCallerIdentity(
        trustComposition,
      );
    const custodySnapshotSha256 = canonicalSha256(custodySnapshot);
    const resolutionCore = deepFreeze({
      requestDigest: request.requestDigest,
      registrySnapshotSha256: trustRegistry.registrySnapshotSha256,
      custodySnapshotSha256,
      authenticatedDeliveryEvidenceSha256,
      completeRevocationEvidenceSha256,
      observedAt,
      expiresAt,
    });
    return Object.freeze({
      trustComposition,
      callerIdentity,
      registrySnapshotSha256: trustRegistry.registrySnapshotSha256,
      custodyResolutionDigest: canonicalSha256(resolutionCore),
      expiresAt,
    });
  } catch {
    throw unavailable();
  }
}

function createCallerResolutionRequest(
  authorization: Readonly<{
    authorizationDigest: string;
    runIdHash: string;
    authorizationExpiresAt: string;
  }>,
  trust: ReturnType<typeof validateTrustResolution>,
  databaseTarget: CaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget,
  observedAt: string,
) {
  const caller = trust.callerIdentity;
  const core = deepFreeze({
    version:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_VERSION,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_POLICY_DIGEST,
    purpose:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE,
    callerRole:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE,
    executorRole:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_EXECUTOR_ROLE,
    rpcNames: Object.freeze([
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_RPC_NAME,
    ] as const),
    authorizationDigest: authorization.authorizationDigest,
    runIdHash: authorization.runIdHash,
    authorizationExpiresAt: authorization.authorizationExpiresAt,
    registrySnapshotSha256: trust.registrySnapshotSha256,
    custodyResolutionDigest: trust.custodyResolutionDigest,
    identityHmac: caller.identityHmac,
    credentialReferenceSha256: caller.credentialReferenceSha256,
    databaseTargetDigest: canonicalSha256(databaseTarget),
    targetProjectRefHmac: databaseTarget.targetProjectRefHmac,
    productionProjectRefHmac: databaseTarget.productionProjectRefHmac,
    controlPlaneEvidenceSha256:
      databaseTarget.controlPlaneEvidenceSha256,
    databaseName: databaseTarget.databaseName,
    postgresMajor: databaseTarget.postgresMajor,
    projectStatus: databaseTarget.projectStatus,
    tlsMode: databaseTarget.tlsMode,
    tlsRootCertificateSha256:
      databaseTarget.tlsRootCertificateSha256,
    observedAt,
    targetClass: "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW" as const,
    rawCredentialMaterialPresent: false as const,
  });
  return deepFreeze({ ...core, requestDigest: canonicalSha256(core) });
}

function validateCallerLease(
  value: unknown,
  request: ReturnType<typeof createCallerResolutionRequest>,
  databaseTarget: CaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget,
  trustExpiresAt: string,
  now: string,
): ValidatedCallerLease {
  const sessionRecord =
    value && typeof value === "object"
      ? TEST_ONLY_EXCLUSIVE_SESSION_LEASES.get(value)
      : undefined;
  if (!sessionRecord || sessionRecord.state !== "ISSUED") {
    throw unavailable();
  }
  const cleanupBinding = extractLeaseCleanupBinding(value);
  const identityConflict = quarantineTestOnlyCallerLeaseIdentity(
    cleanupBinding,
    sessionRecord,
  );
  if (identityConflict || cleanupBinding.bindingState !== "COMPLETE") {
    throw unavailable();
  }
  const {
    leaseReferenceSha256,
    sessionBindingSha256,
    runtimeRole,
  } = cleanupBinding;
  const object = exactDataRecord(value, [
    "status",
    "requestDigest",
    "purpose",
    "callerRole",
    "executorRole",
    "rpcNames",
    "identityHmac",
    "credentialReferenceSha256",
    "leaseReferenceSha256",
    "sessionBindingSha256",
    "runtimeRole",
    "requiredConnectionMode",
    "queryResultMode",
    "reuseAllowed",
    "concurrentUseAllowed",
    "targetClass",
    "databaseTargetDigest",
    "targetProjectRefHmac",
    "productionProjectRefHmac",
    "controlPlaneEvidenceSha256",
    "databaseName",
    "postgresMajor",
    "authorizationExpiresAt",
    "projectStatus",
    "tlsMode",
    "tlsRootCertificateSha256",
    "issuedAt",
    "expiresAt",
    "revokeBy",
    "defaultBranch",
    "persistent",
    "withData",
    "productionExcluded",
    "rawCredentialMaterialPresent",
  ]);
  const rpcNames = exactDataArray(object.rpcNames, 1);
  const issuedAt = new Date(requireTimestamp(object.issuedAt)).toISOString();
  const expiresAt = new Date(requireTimestamp(object.expiresAt)).toISOString();
  const revokeBy = new Date(requireTimestamp(object.revokeBy)).toISOString();
  const nowMs = Date.parse(now);
  if (
    object.status !== "TEST_ONLY_EXCLUSIVE_SESSION_LEASE_NOT_APPROVED" ||
    object.requestDigest !== request.requestDigest ||
    object.purpose !== request.purpose ||
    object.callerRole !== request.callerRole ||
    object.executorRole !== request.executorRole ||
    rpcNames[0] !== request.rpcNames[0] ||
    object.identityHmac !== request.identityHmac ||
    object.credentialReferenceSha256 !==
      request.credentialReferenceSha256 ||
    object.leaseReferenceSha256 !== leaseReferenceSha256 ||
    object.sessionBindingSha256 !== sessionBindingSha256 ||
    object.runtimeRole !== runtimeRole ||
    object.requiredConnectionMode !== "ONE_PHYSICAL_SESSION_SINGLE_USE" ||
    object.queryResultMode !== "NORMALIZED_ROWS_ONLY" ||
    object.reuseAllowed !== false ||
    object.concurrentUseAllowed !== false ||
    object.targetClass !== request.targetClass ||
    object.databaseTargetDigest !== request.databaseTargetDigest ||
    object.targetProjectRefHmac !== request.targetProjectRefHmac ||
    object.productionProjectRefHmac !== request.productionProjectRefHmac ||
    object.controlPlaneEvidenceSha256 !==
      request.controlPlaneEvidenceSha256 ||
    object.databaseName !== request.databaseName ||
    object.postgresMajor !== request.postgresMajor ||
    object.authorizationExpiresAt !== request.authorizationExpiresAt ||
    object.projectStatus !== request.projectStatus ||
    object.tlsMode !== request.tlsMode ||
    object.tlsRootCertificateSha256 !==
      request.tlsRootCertificateSha256 ||
    Date.parse(issuedAt) > nowMs ||
    nowMs - Date.parse(issuedAt) > MAXIMUM_CALLER_LEASE_LIFETIME_MS ||
    Date.parse(expiresAt) <= nowMs ||
    Date.parse(expiresAt) - nowMs < MINIMUM_CALLER_LEASE_REMAINING_MS ||
    Date.parse(expiresAt) - Date.parse(issuedAt) >
      MAXIMUM_CALLER_LEASE_LIFETIME_MS ||
    Date.parse(expiresAt) > Date.parse(databaseTarget.expiresAt) ||
    Date.parse(expiresAt) > Date.parse(trustExpiresAt) ||
    Date.parse(expiresAt) > Date.parse(request.authorizationExpiresAt) ||
    revokeBy !== expiresAt ||
    object.defaultBranch !== false ||
    object.persistent !== false ||
    object.withData !== false ||
    object.productionExcluded !== true ||
    object.rawCredentialMaterialPresent !== false
  ) {
    throw unavailable();
  }
  const targetProjectRefHmac = requireSha256(object.targetProjectRefHmac);
  const productionProjectRefHmac = requireSha256(
    object.productionProjectRefHmac,
  );
  const tlsRootCertificateSha256 = requireSha256(
    object.tlsRootCertificateSha256,
  );
  const controlPlaneEvidenceSha256 = requireSha256(
    object.controlPlaneEvidenceSha256,
  );
  if (
    new Set([
      request.identityHmac,
      request.credentialReferenceSha256,
      leaseReferenceSha256,
      sessionBindingSha256,
      targetProjectRefHmac,
      productionProjectRefHmac,
      tlsRootCertificateSha256,
      controlPlaneEvidenceSha256,
    ]).size !== 8
  ) {
    throw unavailable();
  }
  return Object.freeze({
    requestDigest: request.requestDigest,
    leaseReferenceSha256,
    sessionBindingSha256,
    runtimeRole,
    databaseName: "postgres" as const,
    postgresMajor: 17 as const,
    authorizationExpiresAt: request.authorizationExpiresAt,
    issuedAt,
    expiresAt,
    queryPort: Object.freeze({
      query: sessionRecord.query,
    }),
  });
}

function quarantineTestOnlyCallerLeaseIdentity(
  cleanupBinding: ReturnType<typeof extractLeaseCleanupBinding>,
  sessionRecord: {
    query: ResolvedRuntimeQueryPort["query"];
    state: "ISSUED" | "CONSUMED" | "RELEASED";
  },
) {
  const identityConflict =
    (cleanupBinding.leaseReferenceSha256 !== null &&
      TEST_ONLY_CONSUMED_LEASE_REFERENCES.has(
        cleanupBinding.leaseReferenceSha256,
      )) ||
    (cleanupBinding.sessionBindingSha256 !== null &&
      TEST_ONLY_CONSUMED_SESSION_BINDINGS.has(
        cleanupBinding.sessionBindingSha256,
      )) ||
    (cleanupBinding.runtimeRole !== null &&
      TEST_ONLY_CONSUMED_RUNTIME_ROLES.has(cleanupBinding.runtimeRole)) ||
    TEST_ONLY_CONSUMED_QUERY_FUNCTIONS.has(sessionRecord.query);

  if (cleanupBinding.leaseReferenceSha256 !== null) {
    TEST_ONLY_CONSUMED_LEASE_REFERENCES.add(
      cleanupBinding.leaseReferenceSha256,
    );
  }
  if (cleanupBinding.sessionBindingSha256 !== null) {
    TEST_ONLY_CONSUMED_SESSION_BINDINGS.add(
      cleanupBinding.sessionBindingSha256,
    );
  }
  if (cleanupBinding.runtimeRole !== null) {
    TEST_ONLY_CONSUMED_RUNTIME_ROLES.add(cleanupBinding.runtimeRole);
  }
  TEST_ONLY_CONSUMED_QUERY_FUNCTIONS.add(sessionRecord.query);
  sessionRecord.state = "CONSUMED";
  return identityConflict;
}

async function persistWithLease(
  lease: ValidatedCallerLease,
  trustComposition: unknown,
  envelope: unknown,
  databaseTarget: CaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget,
  trustExpiresAt: string,
  clock: Readonly<{ now: () => string }>,
) {
  const queryBounded = (
    timeoutMs: number,
    sql: string,
    values?: readonly unknown[],
  ) =>
    awaitBoundedSettlement(timeoutMs, (context) =>
      lease.queryPort.query(sql, values, context),
    );
  let transactionOutcome: "NOT_STARTED" | "UNCERTAIN" | "COMMITTED" =
    "NOT_STARTED";
  let databaseSession:
    | Readonly<{ backendPid: number; transactionId: string }>
    | undefined;
  let result:
    | CaresLinkV1CommunicationNotePreviewRunnerTerminalDatabaseResult
    | undefined;
  let primaryFailure: unknown;
  let cleanupFailed = false;
  try {
    validateOperationFreshness(
      lease,
      databaseTarget,
      trustExpiresAt,
      readClock(clock),
      MINIMUM_CALLER_LEASE_REMAINING_MS,
    );
    transactionOutcome = "UNCERTAIN";
    validateEmptyNormalizedQueryResult(
      await queryBounded(
        DATABASE_SETTLEMENT_TIMEOUT_MS,
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BEGIN_SQL,
      ),
    );
    for (const timeoutSql of
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_TIMEOUT_SQL) {
      validateEmptyNormalizedQueryResult(
        await queryBounded(DATABASE_SETTLEMENT_TIMEOUT_MS, timeoutSql),
      );
    }
    databaseSession = validateBaseIdentity(
      await queryBounded(
        DATABASE_SETTLEMENT_TIMEOUT_MS,
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BASE_IDENTITY_SQL,
      ),
      lease,
    );
    validateInheritedCallerIdentity(
      await queryBounded(
        DATABASE_SETTLEMENT_TIMEOUT_MS,
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_INHERITED_CALLER_IDENTITY_SQL,
      ),
      lease,
      databaseSession,
      TRANSACTION_TIMEOUT_MS,
    );
    const persistNow = readClock(clock);
    validateOperationFreshness(
      lease,
      databaseTarget,
      trustExpiresAt,
      persistNow,
      TRANSACTION_TIMEOUT_MS,
    );
    const databasePort =
      createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalPostgresPort(
        {
          capability: "TEST_ONLY_RUNNER_TERMINAL_POSTGRES_PORT",
          trustComposition,
          queryPort: Object.freeze({
            query: async (
              sql: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POSTGRES_SQL,
              values: readonly [unknown, string, string],
            ) => {
              if (
                sql !==
                CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POSTGRES_SQL
              ) {
                throw unavailable();
              }
              return queryBounded(
                DATABASE_SETTLEMENT_TIMEOUT_MS,
                sql,
                values,
              );
            },
          }),
        },
      );
    const runtimePort =
      createTestOnlyCaresLinkV1CommunicationNotePreviewSignedRunnerTerminalRuntimePort(
        {
          capability: "TEST_ONLY_SIGNED_RUNNER_TERMINAL_RUNTIME_PORT",
          trustComposition,
          databasePort,
          clock: Object.freeze({ now: () => persistNow }),
        },
      );
    result = await runtimePort.persist(envelope);
    validateOperationFreshness(
      lease,
      databaseTarget,
      trustExpiresAt,
      readClock(clock),
      1,
    );
    validateInheritedCallerIdentity(
      await queryBounded(
        DATABASE_SETTLEMENT_TIMEOUT_MS,
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_INHERITED_CALLER_IDENTITY_SQL,
      ),
      lease,
      databaseSession,
      1,
    );
    validateEmptyNormalizedQueryResult(
      await queryBounded(
        DATABASE_SETTLEMENT_TIMEOUT_MS,
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_COMMIT_SQL,
      ),
    );
    transactionOutcome = "COMMITTED";
  } catch (error) {
    primaryFailure = error;
  } finally {
    if (transactionOutcome === "UNCERTAIN") {
      try {
        validateEmptyNormalizedQueryResult(
          await queryBounded(
            CLEANUP_SETTLEMENT_TIMEOUT_MS,
            CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_ROLLBACK_SQL,
          ),
        );
      } catch {
        cleanupFailed = true;
      }
    }
    if (transactionOutcome !== "NOT_STARTED") {
      try {
        validateResetIdentity(
          await queryBounded(
            CLEANUP_SETTLEMENT_TIMEOUT_MS,
            CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_RESET_IDENTITY_SQL,
          ),
          lease,
          databaseSession?.backendPid,
        );
      } catch {
        cleanupFailed = true;
      }
    }
  }
  if (cleanupFailed) throw unavailable();
  if (primaryFailure !== undefined) throw sanitizeRuntimeFailure(primaryFailure);
  if (transactionOutcome !== "COMMITTED" || !result) throw unavailable();
  return result;
}

function validateBaseIdentity(value: unknown, lease: ValidatedCallerLease) {
  const row = singleDataRow(value);
  const backendPid = requireBackendPid(row.backend_pid);
  const transactionId = requireTransactionId(row.transaction_id);
  validateDatabaseLeaseTime(row.database_now, lease, TRANSACTION_TIMEOUT_MS);
  if (
    row.current_user !== lease.runtimeRole ||
    row.session_user !== lease.runtimeRole ||
    row.database_name !== lease.databaseName ||
    row.postgres_major !== lease.postgresMajor ||
    row.transaction_isolation !== "read committed" ||
    row.rolcanlogin !== false ||
    row.rolsuper !== false ||
    row.rolinherit !== true ||
    row.rolcreaterole !== false ||
    row.rolcreatedb !== false ||
    row.rolreplication !== false ||
    row.rolbypassrls !== false ||
    row.rolconnlimit !== 1 ||
    row.role_valid_until !== lease.expiresAt ||
    row.caller_member !== true ||
    row.caller_set !== false ||
    row.caller_inherited !== true ||
    row.direct_membership_count !== 1 ||
    row.runtime_inbound_membership_count !== 1 ||
    row.runtime_inbound_membership_posture !== true ||
    row.caller_membership_admin !== false ||
    row.caller_membership_inherit !== true ||
    row.caller_membership_set !== false ||
    row.base_exact_rpc_executable !== true ||
    row.base_generation_schema_usage !== true ||
    row.base_generation_schema_create !== false ||
    row.base_generation_executable_function_count !== 1 ||
    row.base_generation_table_privilege_count !== 0 ||
    row.base_generation_sequence_privilege_count !== 0 ||
    row.executor_set !== false ||
    row.authenticator_set !== false ||
    row.anon_set !== false ||
    row.authenticated_set !== false ||
    row.service_role_set !== false ||
    row.authenticator_can_set_runtime !== false ||
    row.anon_can_set_runtime !== false ||
    row.authenticated_can_set_runtime !== false ||
    row.service_role_can_set_runtime !== false
  ) {
    throw unavailable();
  }
  return Object.freeze({ backendPid, transactionId });
}

function validateInheritedCallerIdentity(
  value: unknown,
  lease: ValidatedCallerLease,
  expectedSession: Readonly<{ backendPid: number; transactionId: string }>,
  minimumRemainingMs: number,
) {
  const row = singleDataRow(value);
  const backendPid = requireBackendPid(row.backend_pid);
  const transactionId = requireTransactionId(row.transaction_id);
  validateDatabaseLeaseTime(row.database_now, lease, minimumRemainingMs);
  if (
    row.current_user !== lease.runtimeRole ||
    row.session_user !== lease.runtimeRole ||
    backendPid !== expectedSession.backendPid ||
    transactionId !== expectedSession.transactionId ||
    row.database_name !== lease.databaseName ||
    row.postgres_major !== lease.postgresMajor ||
    row.transaction_isolation !== "read committed" ||
    row.runtime_rolcanlogin !== false ||
    row.runtime_rolsuper !== false ||
    row.runtime_rolinherit !== true ||
    row.runtime_rolcreaterole !== false ||
    row.runtime_rolcreatedb !== false ||
    row.runtime_rolreplication !== false ||
    row.runtime_rolbypassrls !== false ||
    row.runtime_rolconnlimit !== 1 ||
    row.runtime_role_valid_until !== lease.expiresAt ||
    row.caller_rolcanlogin !== false ||
    row.caller_rolsuper !== false ||
    row.caller_rolinherit !== false ||
    row.caller_rolcreaterole !== false ||
    row.caller_rolcreatedb !== false ||
    row.caller_rolreplication !== false ||
    row.caller_rolbypassrls !== false ||
    row.caller_member !== true ||
    row.caller_set !== false ||
    row.caller_inherited !== true ||
    row.direct_membership_count !== 1 ||
    row.runtime_inbound_membership_count !== 1 ||
    row.runtime_inbound_membership_posture !== true ||
    row.caller_membership_admin !== false ||
    row.caller_membership_inherit !== true ||
    row.caller_membership_set !== false ||
    row.executor_rolcanlogin !== false ||
    row.executor_rolsuper !== false ||
    row.executor_rolinherit !== false ||
    row.executor_rolcreaterole !== false ||
    row.executor_rolcreatedb !== false ||
    row.executor_rolreplication !== false ||
    row.executor_rolbypassrls !== false ||
    row.executor_outbound_membership_count !== 0 ||
    row.executor_inbound_active_membership_count !== 0 ||
    row.caller_outbound_membership_count !== 0 ||
    row.non_runtime_inbound_active_membership_count !== 0 ||
    row.exact_rpc_executable !== true ||
    row.generation_schema_usage !== true ||
    row.generation_schema_create !== false ||
    row.exact_rpc_metadata_valid !== true ||
    row.exact_rpc_acl_valid !== true ||
    row.authenticator_exact_rpc_executable !== false ||
    row.anon_exact_rpc_executable !== false ||
    row.authenticated_exact_rpc_executable !== false ||
    row.service_role_exact_rpc_executable !== false ||
    row.generation_executable_function_count !== 1 ||
    row.generation_table_privilege_count !== 0 ||
    row.generation_sequence_privilege_count !== 0 ||
    row.executor_set !== false ||
    row.authenticator_set !== false ||
    row.anon_set !== false ||
    row.authenticated_set !== false ||
    row.service_role_set !== false ||
    row.authenticator_can_set_runtime !== false ||
    row.anon_can_set_runtime !== false ||
    row.authenticated_can_set_runtime !== false ||
    row.service_role_can_set_runtime !== false
  ) {
    throw unavailable();
  }
}

function validateResetIdentity(
  value: unknown,
  lease: ValidatedCallerLease,
  expectedBackendPid: number | undefined,
) {
  const row = singleDataRow(value);
  const backendPid = requireBackendPid(row.backend_pid);
  requireTimestamp(row.database_now);
  if (
    row.current_user !== lease.runtimeRole ||
    row.session_user !== lease.runtimeRole ||
    expectedBackendPid === undefined ||
    backendPid !== expectedBackendPid
  ) {
    throw unavailable();
  }
}

function singleDataRow(value: unknown): Record<string, unknown> {
  const result = exactDataRecord(value, ["rows"]);
  const rows = exactDataArray(result.rows, 1);
  const row = rows[0];
  if (
    !row ||
    typeof row !== "object" ||
    Array.isArray(row) ||
    nodeTypes.isProxy(row)
  ) {
    throw unavailable();
  }
  const prototype = Object.getPrototypeOf(row);
  if (prototype !== Object.prototype && prototype !== null) throw unavailable();
  if (Object.getOwnPropertySymbols(row).length !== 0) throw unavailable();
  const resultRow = Object.create(null) as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(row)) {
    const descriptor = Object.getOwnPropertyDescriptor(row, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw unavailable();
    }
    resultRow[key] = descriptor.value;
  }
  return resultRow;
}

function validateEmptyNormalizedQueryResult(value: unknown) {
  const result = exactDataRecord(value, ["rows"]);
  exactDataArray(result.rows, 0);
}

function requireBackendPid(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw unavailable();
  }
  return value as number;
}

function requireTransactionId(value: unknown) {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
    throw unavailable();
  }
  return value;
}

function validateDatabaseLeaseTime(
  value: unknown,
  lease: ValidatedCallerLease,
  minimumRemainingMs: number,
) {
  const databaseNow = requireTimestamp(value);
  if (
    databaseNow < Date.parse(lease.issuedAt) ||
    Date.parse(lease.expiresAt) - databaseNow < minimumRemainingMs
  ) {
    throw unavailable();
  }
}

function extractAuthorizationBinding(
  value: CaresLinkV1VerifiedCommunicationNotePreviewAuthorization,
) {
  try {
    const authorization = exactDataRecord(value, [
      "statement",
      "authorizationDigest",
      "signature",
      "signatureSha256",
      "authenticity",
      "verifiedAt",
    ]);
    const statement = readDataRecord(authorization.statement);
    const authorizationExpiresAt = new Date(
      requireTimestamp(statement.expiresAt),
    ).toISOString();
    return Object.freeze({
      authorizationDigest: requireSha256(authorization.authorizationDigest),
      runIdHash: requireSha256(statement.runIdHash),
      authorizationExpiresAt,
    });
  } catch {
    throw unavailable();
  }
}

function validateDatabaseTargetShape(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget {
  const object = exactDataRecord(value, [
    "status",
    "targetClass",
    "targetProjectRefHmac",
    "productionProjectRefHmac",
    "controlPlaneEvidenceSha256",
    "databaseName",
    "postgresMajor",
    "projectStatus",
    "tlsMode",
    "tlsRootCertificateSha256",
    "observedAt",
    "expiresAt",
    "defaultBranch",
    "persistent",
    "withData",
    "productionExcluded",
    "rawCredentialMaterialPresent",
  ]);
  if (
    object.status !== "VALIDATED_DISPOSABLE_PREVIEW_TARGET_NOT_APPROVED" ||
    object.targetClass !==
      "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW" ||
    object.databaseName !== "postgres" ||
    object.postgresMajor !== 17 ||
    object.projectStatus !== "ACTIVE_HEALTHY" ||
    object.tlsMode !== "VERIFY_FULL_PINNED_CA" ||
    object.defaultBranch !== false ||
    object.persistent !== false ||
    object.withData !== false ||
    object.productionExcluded !== true ||
    object.rawCredentialMaterialPresent !== false
  ) {
    throw unavailable();
  }
  const targetProjectRefHmac = requireSha256(object.targetProjectRefHmac);
  const productionProjectRefHmac = requireSha256(
    object.productionProjectRefHmac,
  );
  const controlPlaneEvidenceSha256 = requireSha256(
    object.controlPlaneEvidenceSha256,
  );
  const tlsRootCertificateSha256 = requireSha256(
    object.tlsRootCertificateSha256,
  );
  if (
    new Set([
      targetProjectRefHmac,
      productionProjectRefHmac,
      controlPlaneEvidenceSha256,
      tlsRootCertificateSha256,
    ]).size !== 4
  ) {
    throw unavailable();
  }
  return deepFreeze({
    status: "VALIDATED_DISPOSABLE_PREVIEW_TARGET_NOT_APPROVED" as const,
    targetClass:
      "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW" as const,
    targetProjectRefHmac,
    productionProjectRefHmac,
    controlPlaneEvidenceSha256,
    databaseName: "postgres" as const,
    postgresMajor: 17 as const,
    projectStatus: "ACTIVE_HEALTHY" as const,
    tlsMode: "VERIFY_FULL_PINNED_CA" as const,
    tlsRootCertificateSha256,
    observedAt: new Date(requireTimestamp(object.observedAt)).toISOString(),
    expiresAt: new Date(requireTimestamp(object.expiresAt)).toISOString(),
    defaultBranch: false as const,
    persistent: false as const,
    withData: false as const,
    productionExcluded: true as const,
    rawCredentialMaterialPresent: false as const,
  });
}

function validateDatabaseTargetFreshness(
  target: CaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget,
  now: string,
) {
  const observedAt = Date.parse(target.observedAt);
  const expiresAt = Date.parse(target.expiresAt);
  const nowMs = Date.parse(now);
  if (
    observedAt > nowMs ||
    nowMs - observedAt > MAXIMUM_CUSTODY_RESOLUTION_LIFETIME_MS ||
    expiresAt <= nowMs ||
    expiresAt - nowMs > MAXIMUM_CUSTODY_RESOLUTION_LIFETIME_MS
  ) {
    throw unavailable();
  }
}

function validateResolutionFreshness(expiresAt: string, now: string) {
  if (Date.parse(expiresAt) <= Date.parse(now)) {
    throw unavailable();
  }
}

function validateOperationFreshness(
  lease: ValidatedCallerLease,
  databaseTarget: CaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget,
  trustExpiresAt: string,
  now: string,
  minimumRemainingMs: number,
) {
  validateDatabaseTargetFreshness(databaseTarget, now);
  validateResolutionFreshness(lease.authorizationExpiresAt, now);
  validateResolutionFreshness(trustExpiresAt, now);
  if (Date.parse(lease.expiresAt) - Date.parse(now) < minimumRemainingMs) {
    throw unavailable();
  }
}

function requireTestOnlyDatabaseTarget(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    !TEST_ONLY_DATABASE_TARGETS.has(value)
  ) {
    throw unavailable();
  }
  return value as CaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget;
}

function requireTestOnlyCustodyResolver(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    !TEST_ONLY_CUSTODY_RESOLVERS.has(value)
  ) {
    throw unavailable();
  }
  return value as CaresLinkV1CommunicationNotePreviewRunnerTerminalCustodyResolver;
}

function requireTestOnlyCallerCredentialResolver(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    !TEST_ONLY_CALLER_CREDENTIAL_RESOLVERS.has(value)
  ) {
    throw unavailable();
  }
  return value as CaresLinkV1CommunicationNotePreviewRunnerTerminalCallerCredentialResolver;
}

function validateClock(value: unknown) {
  const object = exactDataRecord(value, ["now"]);
  if (typeof object.now !== "function" || nodeTypes.isProxy(object.now)) {
    throw unavailable();
  }
  const sourceNow = object.now as () => string;
  let lastObservedMs = Number.NEGATIVE_INFINITY;
  return Object.freeze({
    now: () => {
      const currentMs = requireTimestamp(sourceNow());
      if (currentMs < lastObservedMs) throw unavailable();
      lastObservedMs = currentMs;
      return new Date(currentMs).toISOString();
    },
  });
}

function readClock(clock: Readonly<{ now: () => string }>) {
  try {
    return new Date(requireTimestamp(clock.now())).toISOString();
  } catch {
    throw unavailable();
  }
}

async function awaitBoundedSettlement<T>(
  timeoutMs: number,
  invoke: (context: BoundedCallContext) => PromiseLike<T>,
): Promise<T> {
  const controller = new AbortController();
  const context = Object.freeze({ signal: controller.signal });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(unavailable());
      try {
        controller.abort();
      } catch {
        // The fixed timeout failure remains authoritative.
      }
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => invoke(context)),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function extractLeaseCleanupBinding(value: unknown) {
  const none = Object.freeze({
    bindingState: "NONE" as const,
    leaseReferenceSha256: null,
    sessionBindingSha256: null,
    runtimeRole: null,
  });
  const invalid = Object.freeze({
    bindingState: "INVALID" as const,
    leaseReferenceSha256: null as string | null,
    sessionBindingSha256: null as string | null,
    runtimeRole: null as string | null,
  });
  if (value === undefined || value === null) return none;
  if (
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeTypes.isProxy(value)
  ) {
    return invalid;
  }
  const leaseReference = readOptionalCleanupDataValue(
    value,
    "leaseReferenceSha256",
  );
  const sessionBinding = readOptionalCleanupDataValue(
    value,
    "sessionBindingSha256",
  );
  const runtimeRole = readOptionalCleanupDataValue(value, "runtimeRole");
  if (
    leaseReference.valid &&
    sessionBinding.valid &&
    runtimeRole.valid &&
    leaseReference.value === null &&
    sessionBinding.value === null &&
    runtimeRole.value === null
  ) {
    return none;
  }
  const leaseReferenceSha256 =
    leaseReference.valid &&
    typeof leaseReference.value === "string" &&
    SHA256_PATTERN.test(leaseReference.value)
      ? leaseReference.value
      : null;
  const sessionBindingSha256 =
    sessionBinding.valid &&
    typeof sessionBinding.value === "string" &&
    SHA256_PATTERN.test(sessionBinding.value)
      ? sessionBinding.value
      : null;
  const validatedRuntimeRole =
    runtimeRole.valid &&
    typeof runtimeRole.value === "string" &&
    RUNTIME_ROLE_PATTERN.test(runtimeRole.value)
      ? runtimeRole.value
      : null;
  if (
    leaseReferenceSha256 !== null &&
    sessionBindingSha256 !== null &&
    validatedRuntimeRole !== null
  ) {
    return Object.freeze({
      bindingState: "COMPLETE" as const,
      leaseReferenceSha256,
      sessionBindingSha256,
      runtimeRole: validatedRuntimeRole,
    });
  }
  return Object.freeze({
    ...invalid,
    leaseReferenceSha256,
    sessionBindingSha256,
    runtimeRole: validatedRuntimeRole,
  });
}

function readOptionalCleanupDataValue(value: object, key: string) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
    return Object.freeze({ valid: false as const, value: undefined });
  }
  return Object.freeze({ valid: true as const, value: descriptor.value });
}

function createCallerRevocationRequest(
  callerRequest: ReturnType<typeof createCallerResolutionRequest>,
  cleanupBinding: ReturnType<typeof extractLeaseCleanupBinding>,
) {
  const core = deepFreeze({
    version:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_VERSION,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_POLICY_DIGEST,
    acquisitionRequestDigest: callerRequest.requestDigest,
    authorizationDigest: callerRequest.authorizationDigest,
    runIdHash: callerRequest.runIdHash,
    databaseTargetDigest: callerRequest.databaseTargetDigest,
    callerRole: callerRequest.callerRole,
    bindingState: cleanupBinding.bindingState,
    leaseReferenceSha256: cleanupBinding.leaseReferenceSha256,
    sessionBindingSha256: cleanupBinding.sessionBindingSha256,
    runtimeRole: cleanupBinding.runtimeRole,
    rawCredentialMaterialPresent: false as const,
  });
  return deepFreeze({ ...core, requestDigest: canonicalSha256(core) });
}

function markTestOnlySessionLeaseReleased(value: unknown) {
  if (!value || typeof value !== "object") return;
  const record = TEST_ONLY_EXCLUSIVE_SESSION_LEASES.get(value);
  if (record) record.state = "RELEASED";
}

export function createCaresLinkV1CommunicationNotePreviewReleaseReportDigest(
  value: unknown,
) {
  try {
    return canonicalSha256(readDataRecord(value));
  } catch {
    throw unavailable();
  }
}

function validateRevocationReceipt(
  value: unknown,
  request: ReturnType<typeof createCallerRevocationRequest>,
  now: string,
) {
  const object = exactDataRecord(value, [
    "status",
    "requestDigest",
    "acquisitionRequestDigest",
    "leaseReferenceSha256",
    "sessionBindingSha256",
    "runtimeRole",
    "reportedAt",
    "reportedSessionDisposition",
    "reportedCredentialDisposition",
    "acquisitionRequestTombstoned",
    "futureIssuanceBlocked",
    "reusable",
    "rawCredentialMaterialPresent",
    "receiptDigest",
  ]);
  const reportedAt = new Date(requireTimestamp(object.reportedAt)).toISOString();
  const core = deepFreeze({
    status: object.status,
    requestDigest: object.requestDigest,
    acquisitionRequestDigest: object.acquisitionRequestDigest,
    leaseReferenceSha256: object.leaseReferenceSha256,
    sessionBindingSha256: object.sessionBindingSha256,
    runtimeRole: object.runtimeRole,
    reportedAt,
    reportedSessionDisposition: object.reportedSessionDisposition,
    reportedCredentialDisposition: object.reportedCredentialDisposition,
    acquisitionRequestTombstoned: object.acquisitionRequestTombstoned,
    futureIssuanceBlocked: object.futureIssuanceBlocked,
    reusable: object.reusable,
    rawCredentialMaterialPresent: object.rawCredentialMaterialPresent,
  });
  const hasCompleteLeaseBinding =
    request.bindingState === "COMPLETE" &&
    request.leaseReferenceSha256 !== null &&
    request.sessionBindingSha256 !== null &&
    request.runtimeRole !== null;
  const hasNoLeaseBinding =
    request.bindingState === "NONE" &&
    request.leaseReferenceSha256 === null &&
    request.sessionBindingSha256 === null &&
    request.runtimeRole === null;
  const reportsDestroyedAndRevoked =
    object.reportedSessionDisposition === "DESTROYED" &&
    object.reportedCredentialDisposition === "REVOKED";
  const reportsNotAcquiredAndNotIssued =
    object.reportedSessionDisposition === "NOT_ACQUIRED" &&
    object.reportedCredentialDisposition === "NOT_ISSUED";
  if (
    object.status !== "TEST_ONLY_RELEASE_REPORTED_NOT_APPROVED" ||
    object.requestDigest !== request.requestDigest ||
    object.acquisitionRequestDigest !== request.acquisitionRequestDigest ||
    object.leaseReferenceSha256 !== request.leaseReferenceSha256 ||
    object.sessionBindingSha256 !== request.sessionBindingSha256 ||
    object.runtimeRole !== request.runtimeRole ||
    Date.parse(reportedAt) > Date.parse(now) ||
    Date.parse(now) - Date.parse(reportedAt) >
      MAXIMUM_CUSTODY_RESOLUTION_LIFETIME_MS ||
    (!hasCompleteLeaseBinding && !hasNoLeaseBinding) ||
    (hasCompleteLeaseBinding && !reportsDestroyedAndRevoked) ||
    (hasNoLeaseBinding &&
      !reportsDestroyedAndRevoked &&
      !reportsNotAcquiredAndNotIssued) ||
    object.acquisitionRequestTombstoned !== true ||
    object.futureIssuanceBlocked !== true ||
    object.reusable !== false ||
    object.rawCredentialMaterialPresent !== false ||
    object.receiptDigest !== canonicalSha256(core)
  ) {
    throw unavailable();
  }
}

function sanitizeRuntimeFailure(value: unknown) {
  const code = safeErrorCode(value);
  switch (code) {
    case "FORBIDDEN":
      return new CaresLinkV1ContractError(
        "FORBIDDEN",
        "The resolved runner terminal operation is not authorized",
      );
    case "IDEMPOTENCY_CONFLICT":
      return new CaresLinkV1ContractError(
        "IDEMPOTENCY_CONFLICT",
        "The resolved runner terminal was already recorded with different evidence",
      );
    case "INVALID_STATE_TRANSITION":
      return new CaresLinkV1ContractError(
        "INVALID_STATE_TRANSITION",
        "The resolved runner terminal binding is not writable",
      );
    case "VALIDATION_ERROR":
      return new CaresLinkV1ContractError(
        "VALIDATION_ERROR",
        "The resolved runner terminal request is invalid",
      );
    default:
      return unavailable();
  }
}

function safeErrorCode(value: unknown) {
  if (!value || typeof value !== "object" || nodeTypes.isProxy(value)) return "";
  const descriptor = Object.getOwnPropertyDescriptor(value, "code");
  return descriptor && "value" in descriptor && typeof descriptor.value === "string"
    ? descriptor.value
    : "";
}

function exactDataRecord<const Key extends string>(
  value: unknown,
  expectedKeys: readonly Key[],
): Record<Key, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeTypes.isProxy(value)
  ) {
    throw unavailable();
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw unavailable();
  if (Object.getOwnPropertySymbols(value).length !== 0) throw unavailable();
  const names = Object.getOwnPropertyNames(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    names.length !== expected.length ||
    names.some((name, index) => name !== expected[index])
  ) {
    throw unavailable();
  }
  const result = Object.create(null) as Record<Key, unknown>;
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw unavailable();
    }
    result[key] = descriptor.value;
  }
  return result;
}

function readDataRecord(value: unknown): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeTypes.isProxy(value)
  ) {
    throw unavailable();
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw unavailable();
  if (Object.getOwnPropertySymbols(value).length !== 0) throw unavailable();
  const result = Object.create(null) as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw unavailable();
    }
    result[key] = descriptor.value;
  }
  return result;
}

function exactDataArray(value: unknown, expectedLength: number) {
  if (
    !Array.isArray(value) ||
    nodeTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0 ||
    value.length !== expectedLength
  ) {
    throw unavailable();
  }
  const expectedNames = [
    ...Array.from({ length: expectedLength }, (_, index) => String(index)),
    "length",
  ].sort();
  const names = Object.getOwnPropertyNames(value).sort();
  if (
    names.length !== expectedNames.length ||
    names.some((name, index) => name !== expectedNames[index])
  ) {
    throw unavailable();
  }
  for (let index = 0; index < expectedLength; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw unavailable();
    }
  }
  return value as readonly unknown[];
}

function requireSha256(value: unknown): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw unavailable();
  }
  return value;
}

function requireTimestamp(value: unknown): number {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    throw unavailable();
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw unavailable();
  }
  return parsed;
}

function canonicalSha256(value: unknown) {
  return createHash("sha256")
    .update(stringifyCaresLinkV1CanonicalJson(value), "utf8")
    .digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

function unavailable() {
  return new CaresLinkV1ContractError(
    "PRODUCT_API_DISABLED",
    "Communication Note resolved runner terminal runtime binding is unavailable",
  );
}
