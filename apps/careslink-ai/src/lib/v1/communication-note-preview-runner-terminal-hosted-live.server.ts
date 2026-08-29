import "server-only";

import { types as nodeTypes } from "node:util";

import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POSTGRES_SQL,
  createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalPostgresPort,
} from "./communication-note-preview-runner-terminal-postgres.server";
import {
  createTestOnlyCaresLinkV1CommunicationNotePreviewSignedRunnerTerminalRuntimePort,
} from "./communication-note-preview-signed-runner-terminal-runtime-port.server";
import {
  createM1ghFailedRunnerTerminalEnvelope,
  createM1ghRunnerTerminalTrustFixture,
} from "./communication-note-preview-runner-terminal-trust-test-fixtures";
import { CaresLinkV1ContractError } from "./shared-contracts";

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_HOSTED_LIVE_READY =
  false as const;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_VALID_MANAGEMENT_APPLICATION_NAME =
  "careslink-preview-runner-terminal-valid-e2e-management" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_VALID_RUNTIME_APPLICATION_NAME =
  "careslink-preview-runner-terminal-valid-e2e" as const;
const IDENTITY_MANAGEMENT_APPLICATION_NAME =
  "careslink-preview-runner-terminal-identity-management" as const;

const RUNTIME_ROLE_PATTERN =
  /^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const DATABASE_CLOCK_SQL = `select
  pg_catalog.to_char(
    pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp())
      at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ) as database_now,
  current_user,
  session_user,
  pg_catalog.current_database() as database_name,
  pg_catalog.current_setting('server_version_num')::pg_catalog.int4 /
    10000 as postgres_major` as const;

const CHAIN_CATALOG_SQL = `select
  pg_catalog.to_char(
    pg_catalog.date_trunc('milliseconds', pg_catalog.clock_timestamp())
      at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ) as database_now,
  authorization_record.authorization_digest,
  authorization_record.run_id_hash,
  claim_record.claim_id::pg_catalog.text,
  reservation_record.reservation_id::pg_catalog.text,
  reservation_record.slot_index,
  reservation_record.fixture_id,
  reservation_record.run_ordinal,
  receipt_record.receipt_digest
from careslink_v1_generation.communication_note_preview_authorizations
  as authorization_record
join careslink_v1_generation.communication_note_preview_claims as claim_record
  on claim_record.authorization_digest =
    authorization_record.authorization_digest
join careslink_v1_generation.communication_note_preview_dispatch_reservations
  as reservation_record on reservation_record.claim_id = claim_record.claim_id
join careslink_v1_generation.communication_note_preview_dispatch_receipts
  as receipt_record on receipt_record.reservation_id =
    reservation_record.reservation_id
where authorization_record.authorization_digest = $1::pg_catalog.text` as const;

const RUNTIME_BASE_IDENTITY_SQL = `select
  current_user,
  session_user,
  pg_catalog.pg_has_role(
    current_user,
    'careslink_v1_preview_runner_terminal_caller',
    'MEMBER'
  ) as caller_member,
  pg_catalog.pg_has_role(
    current_user,
    'careslink_v1_preview_runner_terminal_caller',
    'SET'
  ) as caller_set,
  pg_catalog.pg_has_role(
    current_user,
    'careslink_v1_preview_runner_terminal_caller',
    'USAGE'
  ) as caller_inherited` as const;

const RUNTIME_CALLER_IDENTITY_SQL = `select
  current_user,
  session_user,
  pg_catalog.has_function_privilege(
    current_user,
    'careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(jsonb,text,text)',
    'EXECUTE'
  ) as exact_rpc_executable,
  pg_catalog.has_schema_privilege(
    current_user,
    'careslink_v1_generation',
    'CREATE'
  ) as generation_schema_create` as const;

type QueryResult = Readonly<{
  rowCount?: number | null;
  rows: readonly unknown[];
}>;

export type CaresLinkV1CommunicationNotePreviewRunnerTerminalHostedLiveQueryPort =
  Readonly<{
    query: (
      sql: string,
      values?: readonly unknown[],
    ) => PromiseLike<QueryResult>;
  }>;

export type CaresLinkV1CommunicationNotePreviewRunnerTerminalHostedLiveEvidence =
  Readonly<{
    ok: true;
    terminalState: "FAILED";
    failureReason: "CANCELLED";
    firstCreated: true;
    exactReplayCreated: false;
    validConflictRejected: true;
    conflictCode: "IDEMPOTENCY_CONFLICT";
    sourceTrustCompositionVerified: true;
    actualRuntimeLoginQueryVerified: true;
    finalExpectedLedgerCounts: readonly [1, 0, 1, 1, 1, 1];
    acceptedPathBlockedByUsageContractMismatch: true;
  }>;

export async function runTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalHostedLiveGate(
  value: unknown,
): Promise<CaresLinkV1CommunicationNotePreviewRunnerTerminalHostedLiveEvidence> {
  const options = exactDataRecord(value, [
    "adminQueryPort",
    "runtimeQueryPort",
    "runtimeRole",
    "expectedPostgresMajor",
    "setupSql",
  ]);
  const admin = requireQueryPort(options.adminQueryPort);
  const runtime = requireQueryPort(options.runtimeQueryPort);
  const runtimeRole = requireRuntimeRole(options.runtimeRole);
  const expectedPostgresMajor = requirePostgresMajor(
    options.expectedPostgresMajor,
  );
  const setupSql = requireSetupSql(options.setupSql);

  let runtimeRoleSet = false;
  try {
    const initialClock = parseManagementClock(
      await admin.query(DATABASE_CLOCK_SQL),
      expectedPostgresMajor,
    );
    const fixture = createM1ghRunnerTerminalTrustFixture({
      now: initialClock,
    });
    await runSetupTransaction(admin, setupSql, [
      ["careslink.runner_terminal_valid.runtime_role", runtimeRole],
      [
        "careslink.runner_terminal_valid.expected_pg_major",
        String(expectedPostgresMajor),
      ],
      [
        "careslink.runner_terminal_valid.authorization_statement",
        JSON.stringify(fixture.authorizationStatement),
      ],
      [
        "careslink.runner_terminal_valid.authorization_signature",
        fixture.authorizationSignature,
      ],
    ]);
    const catalog = parseChainCatalog(
      await admin.query(CHAIN_CATALOG_SQL, [
        fixture.verifiedAuthorization.authorizationDigest,
      ]),
      fixture.verifiedAuthorization.authorizationDigest,
      fixture.authorizationStatement.runIdHash,
    );

    const baseIdentity = singleDataRow(
      await runtime.query(RUNTIME_BASE_IDENTITY_SQL),
    );
    if (
      baseIdentity.current_user !== runtimeRole ||
      baseIdentity.session_user !== runtimeRole ||
      baseIdentity.caller_member !== true ||
      baseIdentity.caller_set !== true ||
      baseIdentity.caller_inherited !== false
    ) {
      throw failed("RUNNER_TERMINAL_HOSTED_LIVE_RUNTIME_IDENTITY_FAILED");
    }
    await runtime.query(
      `set role ${CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE}`,
    );
    runtimeRoleSet = true;
    const callerIdentity = singleDataRow(
      await runtime.query(RUNTIME_CALLER_IDENTITY_SQL),
    );
    if (
      callerIdentity.current_user !==
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE ||
      callerIdentity.session_user !== runtimeRole ||
      callerIdentity.exact_rpc_executable !== true ||
      callerIdentity.generation_schema_create !== false
    ) {
      throw failed("RUNNER_TERMINAL_HOSTED_LIVE_CALLER_IDENTITY_FAILED");
    }

    const databasePort =
      createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalPostgresPort(
        {
          capability: "TEST_ONLY_RUNNER_TERMINAL_POSTGRES_PORT",
          trustComposition: fixture.trustComposition,
          queryPort: Object.freeze({
            async query(
              sql: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POSTGRES_SQL,
              values: readonly [unknown, string, string],
            ) {
              if (
                sql !==
                CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POSTGRES_SQL
              ) {
                throw failed(
                  "RUNNER_TERMINAL_HOSTED_LIVE_QUERY_CONTRACT_FAILED",
                );
              }
              const result = await runtime.query(sql, values);
              return Object.freeze({ rows: result.rows });
            },
          }),
        },
      );
    const runtimePort =
      createTestOnlyCaresLinkV1CommunicationNotePreviewSignedRunnerTerminalRuntimePort(
        {
          capability: "TEST_ONLY_SIGNED_RUNNER_TERMINAL_RUNTIME_PORT",
          trustComposition: fixture.trustComposition,
          databasePort,
          clock: Object.freeze({ now: () => catalog.databaseNow }),
        },
      );
    const binding = Object.freeze({
      claimId: catalog.claimId,
      reservationId: catalog.reservationId,
      receiptDigest: catalog.receiptDigest,
      slotIndex: catalog.slotIndex,
      fixtureId: catalog.fixtureId,
      runOrdinal: catalog.runOrdinal,
      observedAt: catalog.databaseNow,
    });
    const envelope = createM1ghFailedRunnerTerminalEnvelope(fixture, {
      ...binding,
      failureReason: "CANCELLED",
    });
    const first = await runtimePort.persist(envelope);
    const replay = await runtimePort.persist(envelope);
    if (
      first.created !== true ||
      first.state !== "FAILED" ||
      first.continuationEligible !== false ||
      first.status !== "RUNNER_TERMINAL_RECORDED" ||
      replay.created !== false ||
      replay.state !== "FAILED" ||
      replay.continuationEligible !== false ||
      replay.status !== "ALREADY_RECORDED" ||
      replay.runnerTerminalDigest !== first.runnerTerminalDigest ||
      replay.recordedAt !== first.recordedAt
    ) {
      throw failed("RUNNER_TERMINAL_HOSTED_LIVE_REPLAY_FAILED");
    }

    const conflict = createM1ghFailedRunnerTerminalEnvelope(fixture, {
      ...binding,
      failureReason: "REPORT_INVALID",
    });
    let conflictRejected = false;
    try {
      await runtimePort.persist(conflict);
    } catch (error) {
      conflictRejected =
        error instanceof CaresLinkV1ContractError &&
        error.code === "IDEMPOTENCY_CONFLICT";
    }
    if (!conflictRejected) {
      throw failed("RUNNER_TERMINAL_HOSTED_LIVE_CONFLICT_FAILED");
    }

    return Object.freeze({
      ok: true as const,
      terminalState: "FAILED" as const,
      failureReason: "CANCELLED" as const,
      firstCreated: true as const,
      exactReplayCreated: false as const,
      validConflictRejected: true as const,
      conflictCode: "IDEMPOTENCY_CONFLICT" as const,
      sourceTrustCompositionVerified: true as const,
      actualRuntimeLoginQueryVerified: true as const,
      finalExpectedLedgerCounts: Object.freeze([
        1, 0, 1, 1, 1, 1,
      ] as const),
      acceptedPathBlockedByUsageContractMismatch: true as const,
    });
  } catch (error) {
    if (isHostedLiveError(error)) throw error;
    throw failed("RUNNER_TERMINAL_HOSTED_LIVE_FAILED");
  } finally {
    if (runtimeRoleSet) {
      try {
        await runtime.query("reset role");
      } catch {
        // The caller must still close, quiesce and delete the disposable branch.
      }
    }
  }
}

export async function runTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalHostedPostcheck(
  value: unknown,
) {
  const options = exactDataRecord(value, [
    "adminQueryPort",
    "runtimeRole",
    "expectedPostgresMajor",
    "postcheckSql",
  ]);
  const admin = requireQueryPort(options.adminQueryPort);
  const runtimeRole = requireRuntimeRole(options.runtimeRole);
  const expectedPostgresMajor = requirePostgresMajor(
    options.expectedPostgresMajor,
  );
  const postcheckSql = requirePostcheckSql(options.postcheckSql);
  await runPostcheckTransaction(admin, postcheckSql, [
    ["careslink.runner_terminal_valid.runtime_role", runtimeRole],
    [
      "careslink.runner_terminal_valid.expected_pg_major",
      String(expectedPostgresMajor),
    ],
  ]);
  return Object.freeze({
    ok: true as const,
    temporaryRuntimeLoginDropped: true as const,
    durableLedgerCounts: Object.freeze([1, 0, 1, 1, 1, 1] as const),
    appendOnlyTriggerEnabled: true as const,
    ledgerCleanupBoundary: "DISPOSABLE_PREVIEW_BRANCH_DELETION" as const,
  });
}

export async function runTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalHostedQuiesce(
  value: unknown,
) {
  const options = exactDataRecord(value, [
    "adminQueryPort",
    "runtimeRole",
    "quiesceSql",
  ]);
  const admin = requireQueryPort(options.adminQueryPort);
  const runtimeRole = requireRuntimeRole(options.runtimeRole);
  const quiesceSql = requireQuiesceSql(options.quiesceSql);
  let applicationNameChanged = false;
  try {
    await admin.query(
      "select pg_catalog.set_config('application_name', $1::pg_catalog.text, false)",
      [IDENTITY_MANAGEMENT_APPLICATION_NAME],
    );
    applicationNameChanged = true;
    await runScriptTransaction(
      admin,
      quiesceSql,
      [["careslink.runner_terminal_identity.runtime_role", runtimeRole]],
      "RUNNER_TERMINAL_HOSTED_LIVE_QUIESCE_FAILED",
    );
    const roleState = singleDataRow(
      await admin.query(
        `select pg_catalog.count(*) = 1
          and pg_catalog.bool_and(not role_record.rolcanlogin) as quiesced
        from pg_catalog.pg_roles as role_record
        where role_record.rolname = $1::pg_catalog.text`,
        [runtimeRole],
      ),
    );
    if (roleState.quiesced !== true) {
      throw failed("RUNNER_TERMINAL_HOSTED_LIVE_QUIESCE_FAILED");
    }
  } catch (error) {
    if (isHostedLiveError(error)) throw error;
    throw failed("RUNNER_TERMINAL_HOSTED_LIVE_QUIESCE_FAILED");
  } finally {
    if (applicationNameChanged) {
      try {
        await admin.query(
          "select pg_catalog.set_config('application_name', $1::pg_catalog.text, false)",
          [
            CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_VALID_MANAGEMENT_APPLICATION_NAME,
          ],
        );
      } catch {
        throw failed(
          "RUNNER_TERMINAL_HOSTED_LIVE_MANAGEMENT_APPLICATION_RESTORE_FAILED",
        );
      }
    }
  }
  return Object.freeze({
    ok: true as const,
    temporaryRuntimeRoleNoLogin: true as const,
  });
}

export async function drainTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalHostedBackends(
  value: unknown,
) {
  const options = exactDataRecord(value, ["adminQueryPort", "runtimeRole"]);
  const admin = requireQueryPort(options.adminQueryPort);
  const runtimeRole = requireRuntimeRole(options.runtimeRole);
  try {
    const result = await admin.query(
      `select pid, state, application_name
      from pg_catalog.pg_stat_activity
      where usename = $1::pg_catalog.text
        and backend_type = 'client backend'
        and pid <> pg_catalog.pg_backend_pid()`,
      [runtimeRole],
    );
    if (!Array.isArray(result.rows)) {
      throw failed("RUNNER_TERMINAL_HOSTED_LIVE_DRAIN_FAILED");
    }
    for (const rawBackend of result.rows) {
      if (
        !rawBackend ||
        typeof rawBackend !== "object" ||
        Array.isArray(rawBackend) ||
        nodeTypes.isProxy(rawBackend)
      ) {
        throw failed("RUNNER_TERMINAL_HOSTED_LIVE_DRAIN_FAILED");
      }
      const backend = rawBackend as Record<string, unknown>;
      if (
        !Number.isInteger(backend.pid) ||
        backend.state !== "idle" ||
        (backend.application_name !== "Supavisor" &&
          backend.application_name !==
            CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_VALID_RUNTIME_APPLICATION_NAME)
      ) {
        throw failed("RUNNER_TERMINAL_HOSTED_LIVE_DRAIN_FAILED");
      }
      const terminated = singleDataRow(
        await admin.query(
          "select pg_catalog.pg_terminate_backend($1::pg_catalog.int4) as terminated",
          [backend.pid],
        ),
      );
      if (terminated.terminated !== true) {
        throw failed("RUNNER_TERMINAL_HOSTED_LIVE_DRAIN_FAILED");
      }
    }
    const residue = singleDataRow(
      await admin.query(
        `select not exists (
          select 1 from pg_catalog.pg_stat_activity
          where usename = $1::pg_catalog.text
            and backend_type = 'client backend'
        ) as absent`,
        [runtimeRole],
      ),
    );
    if (residue.absent !== true) {
      throw failed("RUNNER_TERMINAL_HOSTED_LIVE_DRAIN_FAILED");
    }
  } catch (error) {
    if (isHostedLiveError(error)) throw error;
    throw failed("RUNNER_TERMINAL_HOSTED_LIVE_DRAIN_FAILED");
  }
  return Object.freeze({ ok: true as const, exactRuntimeBackendsAbsent: true });
}

export function assertCaresLinkV1CommunicationNotePreviewRunnerTerminalHostedSqlPolicy(
  setupSql: unknown,
  postcheckSql: unknown,
) {
  const setup = requireSetupSql(setupSql);
  const postcheck = requirePostcheckSql(postcheckSql);
  return Object.freeze({
    ok: true as const,
    syntheticOnly: setup.includes(
      "SYNTHETIC_DEIDENTIFIED_GOLDEN_FIXTURES_ONLY",
    ),
    terminalWriteReservedForRuntime: true as const,
    exactPreDeleteCountsLocked: postcheck.includes(
      "RUNNER_TERMINAL_VALID_POSTCHECK_LEDGER_COUNTS_FAILED",
    ),
    appendOnlyProofLocked: postcheck.includes(
      "IMMUTABLE_PREVIEW_EXECUTION_AUTHORITY_LEDGER",
    ),
    temporaryLoginOnlyCleanup: true as const,
  });
}

async function runSetupTransaction(
  queryPort: CaresLinkV1CommunicationNotePreviewRunnerTerminalHostedLiveQueryPort,
  script: string,
  settings: readonly (readonly [string, string])[],
) {
  await runScriptTransaction(
    queryPort,
    script,
    settings,
    "RUNNER_TERMINAL_HOSTED_LIVE_SETUP_FAILED",
  );
}

async function runPostcheckTransaction(
  queryPort: CaresLinkV1CommunicationNotePreviewRunnerTerminalHostedLiveQueryPort,
  script: string,
  settings: readonly (readonly [string, string])[],
) {
  await runScriptTransaction(
    queryPort,
    script,
    settings,
    "RUNNER_TERMINAL_HOSTED_LIVE_POSTCHECK_FAILED",
  );
}

async function runScriptTransaction(
  queryPort: CaresLinkV1CommunicationNotePreviewRunnerTerminalHostedLiveQueryPort,
  script: string,
  settings: readonly (readonly [string, string])[],
  failureCode: string,
) {
  let transactionOpen = false;
  try {
    await queryPort.query("begin isolation level read committed");
    transactionOpen = true;
    await queryPort.query("set local statement_timeout = '8s'");
    await queryPort.query("set local lock_timeout = '2s'");
    await queryPort.query(
      "set local idle_in_transaction_session_timeout = '10s'",
    );
    for (const [name, setting] of settings) {
      await queryPort.query(
        "select pg_catalog.set_config($1::pg_catalog.text, $2::pg_catalog.text, true)",
        [name, setting],
      );
    }
    await queryPort.query(script);
    await queryPort.query("commit");
    transactionOpen = false;
  } catch {
    if (transactionOpen) {
      try {
        await queryPort.query("rollback");
      } catch {
        // Only the fixed gate error is externally observable.
      }
    }
    throw failed(failureCode);
  }
}

function parseManagementClock(value: unknown, expectedPostgresMajor: 16 | 17) {
  const row = singleDataRow(value);
  if (
    row.current_user !== "postgres" ||
    row.session_user !== "postgres" ||
    row.database_name !== "postgres" ||
    row.postgres_major !== expectedPostgresMajor ||
    !isTimestamp(row.database_now)
  ) {
    throw failed("RUNNER_TERMINAL_HOSTED_LIVE_MANAGEMENT_TARGET_FAILED");
  }
  return row.database_now;
}

function parseChainCatalog(
  value: unknown,
  expectedAuthorizationDigest: string,
  expectedRunIdHash: string,
) {
  const row = singleDataRow(value);
  if (
    !isTimestamp(row.database_now) ||
    row.authorization_digest !== expectedAuthorizationDigest ||
    row.run_id_hash !== expectedRunIdHash ||
    typeof row.claim_id !== "string" ||
    !UUID_PATTERN.test(row.claim_id) ||
    typeof row.reservation_id !== "string" ||
    !UUID_PATTERN.test(row.reservation_id) ||
    !SHA256_PATTERN.test(String(row.receipt_digest)) ||
    row.slot_index !== 0 ||
    row.fixture_id !== "communication.en.phone-duration.v1" ||
    row.run_ordinal !== 1
  ) {
    throw failed("RUNNER_TERMINAL_HOSTED_LIVE_CATALOG_FAILED");
  }
  return Object.freeze({
    databaseNow: row.database_now,
    claimId: row.claim_id,
    reservationId: row.reservation_id,
    receiptDigest: row.receipt_digest as string,
    slotIndex: 0 as const,
    fixtureId: "communication.en.phone-duration.v1" as const,
    runOrdinal: 1 as const,
  });
}

function singleDataRow(value: unknown): Record<string, unknown> {
  const result = exactDataRecord(value, ["rows"], true);
  if (!Array.isArray(result.rows) || result.rows.length !== 1) {
    throw failed("RUNNER_TERMINAL_HOSTED_LIVE_QUERY_RESULT_FAILED");
  }
  const row = result.rows[0];
  if (
    !row ||
    typeof row !== "object" ||
    Array.isArray(row) ||
    nodeTypes.isProxy(row)
  ) {
    throw failed("RUNNER_TERMINAL_HOSTED_LIVE_QUERY_RESULT_FAILED");
  }
  const prototype = Object.getPrototypeOf(row);
  if (prototype !== Object.prototype && prototype !== null) {
    throw failed("RUNNER_TERMINAL_HOSTED_LIVE_QUERY_RESULT_FAILED");
  }
  return row as Record<string, unknown>;
}

function requireQueryPort(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewRunnerTerminalHostedLiveQueryPort {
  const object = exactDataRecord(value, ["query"]);
  if (typeof object.query !== "function") {
    throw failed("RUNNER_TERMINAL_HOSTED_LIVE_QUERY_PORT_FAILED");
  }
  return Object.freeze({
    query: object.query as CaresLinkV1CommunicationNotePreviewRunnerTerminalHostedLiveQueryPort["query"],
  });
}

function requireSetupSql(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length < 8_000 ||
    /\b(?:truncate|delete\s+from|drop\s+table|drop\s+schema)\b/i.test(value) ||
    !value.includes("RUNNER_TERMINAL_VALID_SETUP_MANAGEMENT_UNSAFE") ||
    !value.includes("RUNNER_TERMINAL_VALID_SETUP_LEDGER_NOT_EMPTY") ||
    !value.includes("persist_verified_communication_note_preview_authorization") ||
    !value.includes("claim_communication_note_preview_authorization") ||
    !value.includes("reserve_communication_note_preview_dispatch") ||
    !value.includes("persist_verified_communication_note_preview_dispatch_receipt") ||
    !value.includes("RUNNER_TERMINAL_VALID_SETUP_POSTCHECK_FAILED") ||
    /v_result\s*:=\s*careslink_v1_generation\.persist_verified_communication_note_preview_runner_terminal/i.test(
      value,
    )
  ) {
    throw failed("RUNNER_TERMINAL_HOSTED_LIVE_SETUP_SQL_POLICY_FAILED");
  }
  return value;
}

function requirePostcheckSql(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length < 5_000 ||
    /\b(?:truncate|delete\s+from|drop\s+table|drop\s+schema)\b/i.test(value) ||
    !value.includes("RUNNER_TERMINAL_VALID_POSTCHECK_LEDGER_COUNTS_FAILED") ||
    !value.includes("IMMUTABLE_PREVIEW_EXECUTION_AUTHORITY_LEDGER") ||
    !/drop\s+role\s+%I/i.test(value) ||
    !/disposable\s+Preview/i.test(value)
  ) {
    throw failed("RUNNER_TERMINAL_HOSTED_LIVE_POSTCHECK_SQL_POLICY_FAILED");
  }
  return value;
}

function requireQuiesceSql(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length < 800 ||
    /\b(?:truncate|insert|update|delete)\b/i.test(value) ||
    !value.includes("RUNNER_TERMINAL_IDENTITY_QUIESCE_MANAGEMENT_UNSAFE") ||
    !value.includes("RUNNER_TERMINAL_IDENTITY_QUIESCE_POSTCHECK_FAILED") ||
    !value.includes("alter role %I nologin")
  ) {
    throw failed("RUNNER_TERMINAL_HOSTED_LIVE_QUIESCE_SQL_POLICY_FAILED");
  }
  return value;
}

function requireRuntimeRole(value: unknown) {
  if (typeof value !== "string" || !RUNTIME_ROLE_PATTERN.test(value)) {
    throw failed("RUNNER_TERMINAL_HOSTED_LIVE_RUNTIME_ROLE_FAILED");
  }
  return value;
}

function requirePostgresMajor(value: unknown): 16 | 17 {
  if (value !== 16 && value !== 17) {
    throw failed("RUNNER_TERMINAL_HOSTED_LIVE_POSTGRES_MAJOR_FAILED");
  }
  return value;
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    TIMESTAMP_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function exactDataRecord<const Key extends string>(
  value: unknown,
  expectedKeys: readonly Key[],
  allowExtraKeys = false,
): Record<Key, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeTypes.isProxy(value)
  ) {
    throw failed("RUNNER_TERMINAL_HOSTED_LIVE_INPUT_FAILED");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw failed("RUNNER_TERMINAL_HOSTED_LIVE_INPUT_FAILED");
  }
  const names = Object.getOwnPropertyNames(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    (!allowExtraKeys && names.length !== expected.length) ||
    expected.some((name) => !names.includes(name))
  ) {
    throw failed("RUNNER_TERMINAL_HOSTED_LIVE_INPUT_FAILED");
  }
  const result = Object.create(null) as Record<Key, unknown>;
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw failed("RUNNER_TERMINAL_HOSTED_LIVE_INPUT_FAILED");
    }
    result[key] = descriptor.value;
  }
  return result;
}

function isHostedLiveError(value: unknown): value is Error {
  return (
    value instanceof Error &&
    value.name === "CaresLinkV1RunnerTerminalHostedLiveError"
  );
}

function failed(code: string) {
  const error = new Error(code);
  error.name = "CaresLinkV1RunnerTerminalHostedLiveError";
  return error;
}
