import {
  COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_ERROR_CODES as POLICY_ERRORS,
  COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_IDENTITY_POLICY as POLICY,
  CommunicationNotePreviewRunnerTerminalIdentityPolicyError,
  assertCommunicationNotePreviewRunnerTerminalIdentityPolicyRegression,
  assertCommunicationNotePreviewRunnerTerminalIdentitySqlPolicy,
  createCommunicationNotePreviewRuntimeRoleName,
  extractCommunicationNotePreviewBranchDatabaseTarget,
  parseCommunicationNotePreviewRunnerTerminalIdentityArguments,
} from "./communication-note-preview-runner-terminal-identity-policy.mjs";

const ERROR_CODES = new Set([
  ...Object.values(POLICY_ERRORS),
  "RUNNER_TERMINAL_IDENTITY_DRIVER_INVALID",
  "RUNNER_TERMINAL_IDENTITY_CONNECTION_FAILED",
  "RUNNER_TERMINAL_IDENTITY_TLS_FAILED",
  "RUNNER_TERMINAL_IDENTITY_SETUP_FAILED",
  "RUNNER_TERMINAL_IDENTITY_BASE_IDENTITY_FAILED",
  "RUNNER_TERMINAL_IDENTITY_SET_ROLE_FAILED",
  "RUNNER_TERMINAL_IDENTITY_RPC_PROBE_FAILED",
  "RUNNER_TERMINAL_IDENTITY_DENIAL_PROBE_FAILED",
  "RUNNER_TERMINAL_IDENTITY_QUIESCE_FAILED",
  "RUNNER_TERMINAL_IDENTITY_DRAIN_FAILED",
  "RUNNER_TERMINAL_IDENTITY_CLEANUP_FAILED",
  "RUNNER_TERMINAL_IDENTITY_INTERNAL_FAILED",
]);

export class CommunicationNotePreviewRunnerTerminalIdentityHarnessError extends Error {
  constructor(code) {
    const fixedCode = ERROR_CODES.has(code)
      ? code
      : "RUNNER_TERMINAL_IDENTITY_INTERNAL_FAILED";
    super(fixedCode);
    this.name =
      "CommunicationNotePreviewRunnerTerminalIdentityHarnessError";
    this.code = fixedCode;
  }
}

function fail(code) {
  throw new CommunicationNotePreviewRunnerTerminalIdentityHarnessError(code);
}

function assert(condition, code) {
  if (!condition) fail(code);
}

function fixedRoleIdentifier(roleName) {
  if (
    typeof roleName !== "string" ||
    !new RegExp(`^${POLICY.runtimeRolePrefix}[a-f0-9]{16}$`).test(roleName)
  ) {
    fail("RUNNER_TERMINAL_IDENTITY_INTERNAL_FAILED");
  }
  return `"${roleName}"`;
}

function safeOwnErrorCode(error) {
  if (!error || typeof error !== "object") return "";
  const descriptor = Object.getOwnPropertyDescriptor(error, "code");
  return descriptor && "value" in descriptor && typeof descriptor.value === "string"
    ? descriptor.value
    : "";
}

const DIRECT_UNREACHABLE_CODES = new Set([
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
]);

export function createCommunicationNotePreviewDatabaseConnectionConfig(
  candidate,
  sslRootCertificate,
  user,
  password,
) {
  return Object.freeze({
    host: candidate.host,
    port: candidate.port,
    database: candidate.database,
    user,
    password,
    application_name:
      user === candidate.user
        ? POLICY.managementApplicationName
        : POLICY.applicationName,
    connectionTimeoutMillis: 10_000,
    query_timeout: 10_000,
    options: "-c row_security=on",
    client_encoding: "UTF8",
    sslnegotiation: "postgres",
    ssl: Object.freeze({
      ca: sslRootCertificate,
      rejectUnauthorized: true,
    }),
  });
}

async function connectPreferredAdmin(
  Client,
  candidates,
  sslRootCertificate,
) {
  let direct = new Client(
    createCommunicationNotePreviewDatabaseConnectionConfig(
      candidates.direct,
      sslRootCertificate,
      candidates.direct.user,
      candidates.direct.password,
    ),
  );
  const directBackground = attachBackgroundErrorGuard(direct);
  try {
    await direct.connect();
    assertVerifiedPreviewTlsConnection(direct);
    return Object.freeze({
      client: direct,
      candidate: candidates.direct,
      connectionMode: "direct",
      backgroundState: directBackground,
    });
  } catch (error) {
    await closeQuietly(direct);
    direct = undefined;
    if (!DIRECT_UNREACHABLE_CODES.has(safeOwnErrorCode(error))) {
      fail("RUNNER_TERMINAL_IDENTITY_CONNECTION_FAILED");
    }
  }
  const session = new Client(
    createCommunicationNotePreviewDatabaseConnectionConfig(
      candidates.sessionPooler,
      sslRootCertificate,
      candidates.sessionPooler.user,
      candidates.sessionPooler.password,
    ),
  );
  const sessionBackground = attachBackgroundErrorGuard(session);
  try {
    await session.connect();
    assertVerifiedPreviewTlsConnection(session);
    return Object.freeze({
      client: session,
      candidate: candidates.sessionPooler,
      connectionMode: "session_pooler_fallback",
      backgroundState: sessionBackground,
    });
  } catch {
    await closeQuietly(session);
    fail("RUNNER_TERMINAL_IDENTITY_CONNECTION_FAILED");
  }
}

function attachBackgroundErrorGuard(client) {
  const state = { failed: false };
  if (typeof client?.on === "function") {
    client.on("error", () => {
      state.failed = true;
    });
  }
  return state;
}

export function assertVerifiedPreviewTlsConnection(client) {
  const stream = client?.connection?.stream;
  if (
    stream?.encrypted !== true ||
    stream?.authorized !== true ||
    stream?.authorizationError != null
  ) {
    fail("RUNNER_TERMINAL_IDENTITY_TLS_FAILED");
  }
  return Object.freeze({ encrypted: true, authorized: true });
}

async function rollbackQuietly(client) {
  try {
    await client.query("rollback");
  } catch {
    // The fixed harness error is the only externally observable failure.
  }
}

async function runScriptTransaction(client, script, settings, failureCode) {
  let transactionOpen = false;
  try {
    await client.query("begin isolation level read committed");
    transactionOpen = true;
    await client.query("set local statement_timeout = '8s'");
    await client.query("set local lock_timeout = '2s'");
    await client.query(
      "set local idle_in_transaction_session_timeout = '10s'",
    );
    await client.query("set local password_encryption = 'scram-sha-256'");
    for (const [name, value] of settings) {
      await client.query({
        text: "select pg_catalog.set_config($1::text, $2::text, true)",
        values: [name, value],
      });
    }
    await client.query(script);
    await client.query("commit");
    transactionOpen = false;
  } catch {
    if (transactionOpen) await rollbackQuietly(client);
    fail(failureCode);
  }
}

const BASE_IDENTITY_SQL = `
  select
    current_user,
    session_user,
    role_record.rolcanlogin,
    role_record.rolsuper,
    role_record.rolcreatedb,
    role_record.rolcreaterole,
    role_record.rolinherit,
    role_record.rolreplication,
    role_record.rolbypassrls,
    role_record.rolconnlimit,
    pg_catalog.pg_has_role(
      current_user,
      'careslink_v1_preview_runner_terminal_caller',
      'MEMBER'
    ) as caller_member,
    pg_catalog.pg_has_role(
      current_user,
      'careslink_v1_preview_runner_terminal_caller',
      'USAGE'
    ) as caller_inherited,
    pg_catalog.pg_has_role(
      current_user,
      'careslink_v1_preview_runner_terminal_caller',
      'SET'
    ) as caller_set,
    pg_catalog.pg_has_role(
      current_user,
      'careslink_v1_preview_runner_terminal_executor',
      'MEMBER'
    ) as executor_member,
    pg_catalog.pg_has_role('authenticator', current_user, 'SET')
      as authenticator_can_set_runtime,
    (
      select pg_catalog.has_function_privilege(
        current_user, procedure.oid, 'EXECUTE'
      )
      from pg_catalog.pg_proc as procedure
      join pg_catalog.pg_namespace as namespace_record
        on namespace_record.oid = procedure.pronamespace
      where namespace_record.nspname = 'careslink_v1_generation'
        and procedure.proname =
          'persist_verified_communication_note_preview_runner_terminal'
        and pg_catalog.pg_get_function_identity_arguments(procedure.oid) =
          'p_statement jsonb, p_signature_base64url text, p_verifier_identity_hmac text'
    ) as exact_rpc_executable,
    (
      select pg_catalog.count(*) = 1
        and pg_catalog.bool_and(not membership.admin_option)
        and pg_catalog.bool_and(not membership.inherit_option)
        and pg_catalog.bool_and(membership.set_option)
      from pg_catalog.pg_auth_members as membership
      where membership.member = current_user::pg_catalog.regrole
    ) as exact_membership_edge,
    not exists (
      select 1
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace_record
        on namespace_record.oid = relation.relnamespace
      where namespace_record.nspname in (
          'auth', 'public', 'careslink_v1_generation'
        )
        and relation.relkind in ('r', 'p', 'v', 'm', 'f')
        and (
          pg_catalog.has_table_privilege(
            current_user, relation.oid,
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
          )
          or pg_catalog.has_any_column_privilege(
            current_user, relation.oid,
            'SELECT,INSERT,UPDATE,REFERENCES'
          )
        )
    ) as table_privileges_absent,
    exists (
      select 1
      from pg_catalog.pg_stat_ssl as ssl_state
      where ssl_state.pid = pg_catalog.pg_backend_pid()
        and ssl_state.ssl
    ) as ssl_active
  from pg_catalog.pg_roles as role_record
  where role_record.rolname = current_user
`;

const CALLER_IDENTITY_SQL = `
  with denied_rpc(signature) as (
    values
      ('careslink_v1_generation.persist_verified_communication_note_preview_authorization(jsonb,text,text)'),
      ('careslink_v1_generation.revoke_communication_note_preview_authorization(text,uuid,text,text,text)'),
      ('careslink_v1_generation.claim_communication_note_preview_authorization(text,uuid,text,text,text,text,text)'),
      ('careslink_v1_generation.reserve_communication_note_preview_dispatch(uuid,text,uuid,integer,text,integer,text,integer,text,text)'),
      ('careslink_v1_generation.persist_verified_communication_note_preview_dispatch_receipt(jsonb,text,text,text)')
  ), resolved_denied_rpc as (
    select pg_catalog.to_regprocedure(signature) as function_oid
    from denied_rpc
  )
  select
    current_user,
    session_user,
    pg_catalog.has_schema_privilege(
      current_user, 'careslink_v1_generation', 'USAGE'
    ) as generation_schema_usage,
    pg_catalog.has_schema_privilege(
      current_user, 'careslink_v1_generation', 'CREATE'
    ) as generation_schema_create,
    pg_catalog.has_function_privilege(
      current_user,
      'careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(jsonb,text,text)',
      'EXECUTE'
    ) as exact_rpc_executable,
    (
      select pg_catalog.count(*) = 5
        and pg_catalog.bool_and(function_oid is not null)
        and pg_catalog.bool_and(not pg_catalog.has_function_privilege(
          current_user, function_oid, 'EXECUTE'
        ))
      from resolved_denied_rpc
    ) as other_rpc_denied,
    not exists (
      select 1
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace_record
        on namespace_record.oid = relation.relnamespace
      where namespace_record.nspname in (
          'auth', 'public', 'careslink_v1_generation'
        )
        and relation.relkind in ('r', 'p', 'v', 'm', 'f')
        and (
          pg_catalog.has_table_privilege(
            current_user, relation.oid,
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
          )
          or pg_catalog.has_any_column_privilege(
            current_user, relation.oid,
            'SELECT,INSERT,UPDATE,REFERENCES'
          )
        )
    ) as table_privileges_absent
`;

function assertBaseIdentity(row, runtimeRole) {
  assert(
    row?.current_user === runtimeRole &&
      row.session_user === runtimeRole &&
      row.rolcanlogin === true &&
      row.rolsuper === false &&
      row.rolcreatedb === false &&
      row.rolcreaterole === false &&
      row.rolinherit === false &&
      row.rolreplication === false &&
      row.rolbypassrls === false &&
      row.rolconnlimit === 1 &&
      row.caller_member === true &&
      row.caller_inherited === false &&
      row.caller_set === true &&
      row.executor_member === false &&
      row.authenticator_can_set_runtime === false &&
      row.exact_rpc_executable === false &&
      row.exact_membership_edge === true &&
      row.table_privileges_absent === true &&
      row.ssl_active === true,
    "RUNNER_TERMINAL_IDENTITY_BASE_IDENTITY_FAILED",
  );
}

function assertCallerIdentity(row, runtimeRole) {
  assert(
    row?.current_user === POLICY.callerRole &&
      row.session_user === runtimeRole &&
      row.generation_schema_usage === true &&
      row.generation_schema_create === false &&
      row.exact_rpc_executable === true &&
      row.other_rpc_denied === true &&
      row.table_privileges_absent === true,
    "RUNNER_TERMINAL_IDENTITY_SET_ROLE_FAILED",
  );
}

async function expectFixedDatabaseDenial(client, sql, code, message) {
  try {
    await client.query(sql);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      error.code === code &&
      (message === undefined || error.message === message)
    ) {
      return;
    }
  }
  fail("RUNNER_TERMINAL_IDENTITY_DENIAL_PROBE_FAILED");
}

async function inspectRuntimeIdentity(runtime, runtimeRole) {
  await runtime.query("set statement_timeout = '8s'");
  await runtime.query("set lock_timeout = '2s'");
  await runtime.query("set idle_in_transaction_session_timeout = '10s'");
  const base = await runtime.query(BASE_IDENTITY_SQL);
  assert(base.rowCount === 1, "RUNNER_TERMINAL_IDENTITY_BASE_IDENTITY_FAILED");
  assertBaseIdentity(base.rows[0], runtimeRole);

  for (const deniedRole of [
    "anon",
    "authenticated",
    "service_role",
    POLICY.executorRole,
  ]) {
    await expectFixedDatabaseDenial(
      runtime,
      `set role ${deniedRole}`,
      "42501",
    );
  }
  await expectFixedDatabaseDenial(
    runtime,
    `grant ${POLICY.callerRole} to ${fixedRoleIdentifier(runtimeRole)}`,
    "42501",
  );

  await runtime.query(`set role ${POLICY.callerRole}`);
  const caller = await runtime.query(CALLER_IDENTITY_SQL);
  assert(caller.rowCount === 1, "RUNNER_TERMINAL_IDENTITY_SET_ROLE_FAILED");
  assertCallerIdentity(caller.rows[0], runtimeRole);

  try {
    await runtime.query(
      `select careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(
        '{}'::pg_catalog.jsonb,
        pg_catalog.repeat('A', 86),
        pg_catalog.repeat('0', 64)
      )`,
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      error.code === "P0001" &&
      error.message === "VALIDATION_ERROR"
    ) {
      await runtime.query("reset role");
      return Object.freeze({
        baseIdentityVerified: true,
        setOnlyCallerMembershipVerified: true,
        exactRpcEntryVerified: true,
        otherRpcDenied: true,
        tablesDenied: true,
        dataApiRoleSwitchDenied: true,
      });
    }
  }
  fail("RUNNER_TERMINAL_IDENTITY_RPC_PROBE_FAILED");
}

async function closeQuietly(client) {
  try {
    await client.end();
  } catch {
    // Cleanup still proceeds through the exact random-role backend drain.
  }
}

async function assertNewRuntimeLoginDenied(Client, connectionConfig) {
  const probe = new Client(connectionConfig);
  let connected = false;
  try {
    await probe.connect();
    connected = true;
  } catch (error) {
    const code = safeOwnErrorCode(error);
    if (code.startsWith("28")) return;
    fail("RUNNER_TERMINAL_IDENTITY_QUIESCE_FAILED");
  } finally {
    if (connected) await closeQuietly(probe);
  }
  fail("RUNNER_TERMINAL_IDENTITY_QUIESCE_FAILED");
}

async function drainExactIdleRuntimeBackends(admin, runtimeRole) {
  let result;
  try {
    result = await admin.query({
      text: `
        select pid, state, application_name
        from pg_catalog.pg_stat_activity
        where usename = $1::text
          and backend_type = 'client backend'
          and pid <> pg_catalog.pg_backend_pid()
      `,
      values: [runtimeRole],
    });
  } catch {
    fail("RUNNER_TERMINAL_IDENTITY_DRAIN_FAILED");
  }
  for (const backend of result.rows) {
    if (
      backend.state !== "idle" ||
      (backend.application_name !== "Supavisor" &&
        backend.application_name !== POLICY.applicationName)
    ) {
      fail("RUNNER_TERMINAL_IDENTITY_DRAIN_FAILED");
    }
    const terminated = await admin.query({
      text: "select pg_catalog.pg_terminate_backend($1::pg_catalog.int4) as terminated",
      values: [backend.pid],
    });
    assert(
      terminated.rows[0]?.terminated === true,
      "RUNNER_TERMINAL_IDENTITY_DRAIN_FAILED",
    );
  }
  const residue = await admin.query({
    text: `select not exists (
      select 1 from pg_catalog.pg_stat_activity
      where usename = $1::text and backend_type = 'client backend'
    ) as absent`,
    values: [runtimeRole],
  });
  assert(residue.rows[0]?.absent === true, "RUNNER_TERMINAL_IDENTITY_DRAIN_FAILED");
}

async function runtimeRolePresent(admin, runtimeRole) {
  const result = await admin.query({
    text: "select pg_catalog.to_regrole($1::text) is not null as present",
    values: [runtimeRole],
  });
  assert(
    result.rowCount === 1 &&
      typeof result.rows[0]?.present === "boolean",
    "RUNNER_TERMINAL_IDENTITY_CLEANUP_FAILED",
  );
  return result.rows[0].present;
}

async function assertRuntimeRoleResidueAbsent(admin, runtimeRole) {
  const result = await admin.query({
    text: `select
      pg_catalog.to_regrole($1::text) is null as role_absent,
      not exists (
        select 1 from pg_catalog.pg_stat_activity
        where usename = $1::text
          and backend_type = 'client backend'
      ) as sessions_absent`,
    values: [runtimeRole],
  });
  assert(
    result.rowCount === 1 &&
      result.rows[0]?.role_absent === true &&
      result.rows[0]?.sessions_absent === true,
    "RUNNER_TERMINAL_IDENTITY_CLEANUP_FAILED",
  );
}

async function cleanupRuntimeRoleWithAdmin({
  admin,
  runtimeRole,
  roleSettings,
  quiesceSql,
  cleanupSql,
}) {
  if (await runtimeRolePresent(admin, runtimeRole)) {
    await runScriptTransaction(
      admin,
      quiesceSql,
      roleSettings,
      "RUNNER_TERMINAL_IDENTITY_QUIESCE_FAILED",
    );
    await drainExactIdleRuntimeBackends(admin, runtimeRole);
    await runScriptTransaction(
      admin,
      cleanupSql,
      roleSettings,
      "RUNNER_TERMINAL_IDENTITY_CLEANUP_FAILED",
    );
  }
  await assertRuntimeRoleResidueAbsent(admin, runtimeRole);
}

export async function runCommunicationNotePreviewRunnerTerminalIdentityHarness({
  Client,
  connectionCandidates,
  sslRootCertificate,
  expectedBranchRef,
  expectedPostgresMajor,
  runtimeRole,
  runtimePassword,
  expiresAt,
  setupSql,
  quiesceSql,
  cleanupSql,
}) {
  if (typeof Client !== "function") {
    fail("RUNNER_TERMINAL_IDENTITY_DRIVER_INVALID");
  }
  let admin;
  let selectedCandidate;
  let connectionMode;
  let adminBackgroundState;
  let adminConnected = false;
  let runtime;
  let runtimeConnectionConfig;
  let runtimeConnected = false;
  let runtimeBackgroundState;
  let roleCommitted = false;
  let runtimeEvidence;
  const roleSettings = [
    ["careslink.runner_terminal_identity.runtime_role", runtimeRole],
  ];
  let primaryFailure;
  let cleanupFailure;
  let identityProofFailure;
  let quiesced = false;
  let newLoginDenied = false;
  try {
    try {
      const connected = await connectPreferredAdmin(
        Client,
        connectionCandidates,
        sslRootCertificate,
      );
      admin = connected.client;
      selectedCandidate = connected.candidate;
      connectionMode = connected.connectionMode;
      adminBackgroundState = connected.backgroundState;
      adminConnected = true;
    } catch {
      fail("RUNNER_TERMINAL_IDENTITY_CONNECTION_FAILED");
    }
    assertVerifiedPreviewTlsConnection(admin);
    await runScriptTransaction(
      admin,
      setupSql,
      [
        ...roleSettings,
        [
          "careslink.runner_terminal_identity.runtime_password",
          runtimePassword,
        ],
        ["careslink.runner_terminal_identity.runtime_expires_at", expiresAt],
        [
          "careslink.runner_terminal_identity.expected_pg_major",
          String(expectedPostgresMajor),
        ],
      ],
      "RUNNER_TERMINAL_IDENTITY_SETUP_FAILED",
    );
    roleCommitted = true;

    const runtimeDatabaseUser =
      selectedCandidate.mode === "session_pooler"
        ? `${runtimeRole}.${expectedBranchRef}`
        : runtimeRole;
    runtimeConnectionConfig =
      createCommunicationNotePreviewDatabaseConnectionConfig(
      selectedCandidate,
      sslRootCertificate,
      runtimeDatabaseUser,
      runtimePassword,
    );
    runtime = new Client(runtimeConnectionConfig);
    runtimeBackgroundState = attachBackgroundErrorGuard(runtime);
    try {
      await runtime.connect();
      runtimeConnected = true;
    } catch {
      fail("RUNNER_TERMINAL_IDENTITY_CONNECTION_FAILED");
    }
    assertVerifiedPreviewTlsConnection(runtime);
    runtimeEvidence = await inspectRuntimeIdentity(runtime, runtimeRole);
    if (
      adminBackgroundState?.failed === true ||
      runtimeBackgroundState?.failed === true
    ) {
      fail("RUNNER_TERMINAL_IDENTITY_CONNECTION_FAILED");
    }
    runtimeEvidence = Object.freeze({
      ok: true,
      policyVersion: POLICY.version,
      postgresMajor: expectedPostgresMajor,
      connectionMode,
      temporaryRuntimeRole: "random_name_redacted",
      credentialMaterial: "process_memory_only_until_exit",
      ...runtimeEvidence,
      probeKind: "INVALID_ENVELOPE_NO_WRITE_PROBE",
    });
  } catch (error) {
    primaryFailure = error;
  } finally {
    if (roleCommitted && adminConnected) {
      try {
        await runScriptTransaction(
          admin,
          quiesceSql,
          roleSettings,
          "RUNNER_TERMINAL_IDENTITY_QUIESCE_FAILED",
        );
        quiesced = true;
      } catch (error) {
        identityProofFailure ??= error;
      }
    }
    if (quiesced && runtimeConnectionConfig) {
      try {
        await assertNewRuntimeLoginDenied(Client, runtimeConnectionConfig);
        newLoginDenied = true;
      } catch (error) {
        identityProofFailure ??= error;
      }
    }
    if (runtimeConnected) {
      await closeQuietly(runtime);
      runtimeConnected = false;
    }
    if (adminConnected) {
      try {
        await cleanupRuntimeRoleWithAdmin({
          admin,
          runtimeRole,
          roleSettings,
          quiesceSql,
          cleanupSql,
        });
        roleCommitted = false;
        cleanupFailure = undefined;
      } catch (error) {
        cleanupFailure = error;
        await closeQuietly(admin);
        adminConnected = false;
        try {
          const reconnected = await connectPreferredAdmin(
            Client,
            connectionCandidates,
            sslRootCertificate,
          );
          admin = reconnected.client;
          adminConnected = true;
          await cleanupRuntimeRoleWithAdmin({
            admin,
            runtimeRole,
            roleSettings,
            quiesceSql,
            cleanupSql,
          });
          roleCommitted = false;
          cleanupFailure = undefined;
        } catch {
          cleanupFailure = new CommunicationNotePreviewRunnerTerminalIdentityHarnessError(
            "RUNNER_TERMINAL_IDENTITY_CLEANUP_FAILED",
          );
        }
      }
      if (adminConnected) {
        await closeQuietly(admin);
        adminConnected = false;
      }
    }
  }
  if (cleanupFailure) throw cleanupFailure;
  if (identityProofFailure) throw identityProofFailure;
  if (primaryFailure) throw primaryFailure;
  return Object.freeze({
    ...runtimeEvidence,
    newLoginDeniedAfterNoLogin: newLoginDenied,
    zeroResidueCleanupVerified: true,
  });
}

async function readBoundedStdin() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > POLICY.maximumStdinBytes) {
      fail(POLICY_ERRORS.stdinInvalid);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, bytes).toString("utf8");
}

async function main() {
  // Private pipe contract: `supabase branches get -o json` is preferred;
  // `supabase branches get --output-format json` may wrap the same map.
  assertCommunicationNotePreviewRunnerTerminalIdentityPolicyRegression();
  const args = parseCommunicationNotePreviewRunnerTerminalIdentityArguments(
    process.argv.slice(2),
  );
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    fail(POLICY_ERRORS.tlsDenied);
  }
  if (
    Object.entries(process.env).some(
      ([key, value]) => /^PG[A-Z0-9_]*$/.test(key) && value,
    )
  ) {
    fail(POLICY_ERRORS.databaseTargetDenied);
  }
  const branchJson = await readBoundedStdin();
  const target = extractCommunicationNotePreviewBranchDatabaseTarget(
    branchJson,
    { expectedBranchRef: args.expectedBranchRef },
  );

  const [{ readFile }, { createHash, randomBytes }, pgModule] = await Promise.all([
    import("node:fs/promises"),
    import("node:crypto"),
    import("pg"),
  ]);
  const Client = pgModule.Client ?? pgModule.default?.Client;
  if (typeof Client !== "function") {
    fail("RUNNER_TERMINAL_IDENTITY_DRIVER_INVALID");
  }
  const scriptUrls = [
    new URL(
      "./communication-note-preview-runner-terminal-identity-setup.sql",
      import.meta.url,
    ),
    new URL(
      "./communication-note-preview-runner-terminal-identity-quiesce.sql",
      import.meta.url,
    ),
    new URL(
      "./communication-note-preview-runner-terminal-identity-cleanup.sql",
      import.meta.url,
    ),
  ];
  const [setupSql, quiesceSql, cleanupSql] = await Promise.all(
    scriptUrls.map((url) => readFile(url, "utf8")),
  );
  assertCommunicationNotePreviewRunnerTerminalIdentitySqlPolicy(
    setupSql,
    quiesceSql,
    cleanupSql,
  );
  let sslRootCertificate;
  try {
    const certificateBuffer = await readFile(args.sslRootCertPath);
    if (
      certificateBuffer.length === 0 ||
      certificateBuffer.length > POLICY.maximumCaBytes ||
      createHash("sha256").update(certificateBuffer).digest("hex") !==
        args.expectedSslRootCertSha256
    ) {
      fail(POLICY_ERRORS.tlsDenied);
    }
    sslRootCertificate = certificateBuffer.toString("utf8");
    if (
      !sslRootCertificate.includes("-----BEGIN CERTIFICATE-----") ||
      !sslRootCertificate.includes("-----END CERTIFICATE-----")
    ) {
      fail(POLICY_ERRORS.tlsDenied);
    }
  } catch (error) {
    if (
      error instanceof CommunicationNotePreviewRunnerTerminalIdentityHarnessError
    ) {
      throw error;
    }
    fail(POLICY_ERRORS.tlsDenied);
  }

  const runtimeRole = createCommunicationNotePreviewRuntimeRoleName(
    randomBytes(8).toString("hex"),
  );
  let runtimePassword = randomBytes(POLICY.runtimePasswordBytes).toString(
    "base64url",
  );
  const expiresAt = new Date(
    Date.now() + POLICY.runtimeValidityMs,
  ).toISOString();
  const connectionCandidates = target.takeAdminConnectionCandidates();
  try {
    const evidence =
      await runCommunicationNotePreviewRunnerTerminalIdentityHarness({
        Client,
        connectionCandidates,
        sslRootCertificate,
        expectedBranchRef: args.expectedBranchRef,
        expectedPostgresMajor: args.expectedPostgresMajor,
        runtimeRole,
        runtimePassword,
        expiresAt,
        setupSql,
        quiesceSql,
        cleanupSql,
      });
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  } finally {
    runtimePassword = undefined;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    const code =
      error instanceof
        CommunicationNotePreviewRunnerTerminalIdentityHarnessError ||
      error instanceof
        CommunicationNotePreviewRunnerTerminalIdentityPolicyError
        ? error.code
        : "RUNNER_TERMINAL_IDENTITY_INTERNAL_FAILED";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
