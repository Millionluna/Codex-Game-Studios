import "server-only";

import {
  CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES,
  type CaresLinkV1RegisteredWorkerAdapterRpcArguments,
  type CaresLinkV1RegisteredWorkerAdapterRpcError,
  type CaresLinkV1RegisteredWorkerAdapterRpcName,
  type CaresLinkV1RegisteredWorkerAdapterRpcResult,
  type CaresLinkV1RegisteredWorkerPrivilegedRpcClient,
} from "./note-generation-registered-worker-adapter.server";
import {
  CARESLINK_V1_REGISTERED_WORKER_SETTLE_REASONS,
  CaresLinkV1RegisteredWorkerExecutionError,
} from "./note-generation-registered-worker";

/**
 * Source-only query adapter. It creates no connection, pool, route, registry,
 * environment lookup, database role or execute grant.
 */
export const CARESLINK_V1_REGISTERED_WORKER_POSTGRES_CLIENT_READY =
  false as const;

export type CaresLinkV1RegisteredWorkerPostgresQueryPort = Readonly<{
  query(sql: string, values: readonly unknown[]): PromiseLike<unknown>;
}>;

type RpcCall = Readonly<{
  sql: string;
  argumentKeys: readonly string[];
}>;

const RPC_CALLS: Readonly<
  Record<CaresLinkV1RegisteredWorkerAdapterRpcName, RpcCall>
> = Object.freeze({
  [CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.claimNext]: Object.freeze({
    sql: `select careslink_v1_generation.claim_v1_shadow_note_generation_job(
  $1::pg_catalog.text,
  $2::pg_catalog.text,
  $3::pg_catalog.text,
  $4::pg_catalog.text,
  $5::pg_catalog.text,
  $6::pg_catalog.text
) as data`,
    argumentKeys: Object.freeze([
      "p_registration_digest",
      "p_worker_policy_version",
      "p_worker_policy_digest",
      "p_worker_identity_hash",
      "p_contract_version",
      "p_schema_version",
    ]),
  }),
  [CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.heartbeat]: Object.freeze({
    sql: `select careslink_v1_generation.heartbeat_v1_shadow_note_generation_attempt(
  $1::pg_catalog.uuid,
  $2::pg_catalog.uuid,
  $3::pg_catalog.text,
  $4::pg_catalog.text,
  $5::pg_catalog.text,
  $6::pg_catalog.text
) as data`,
    argumentKeys: Object.freeze([
      "p_job_id",
      "p_attempt_id",
      "p_lease_token",
      "p_registration_digest",
      "p_worker_policy_version",
      "p_worker_policy_digest",
    ]),
  }),
  [CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.fenceAttempt]: Object.freeze({
    sql: `select careslink_v1_generation.fence_v1_shadow_note_generation_attempt(
  $1::pg_catalog.uuid,
  $2::pg_catalog.uuid,
  $3::pg_catalog.text,
  $4::pg_catalog.text,
  $5::pg_catalog.text,
  $6::pg_catalog.text
) as data`,
    argumentKeys: Object.freeze([
      "p_job_id",
      "p_attempt_id",
      "p_lease_token",
      "p_registration_digest",
      "p_worker_policy_version",
      "p_worker_policy_digest",
    ]),
  }),
  [CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.commitCanonicalSuccess]:
    Object.freeze({
      sql: `select careslink_v1_generation.commit_v1_shadow_note_generation_success(
  $1::pg_catalog.uuid,
  $2::pg_catalog.uuid,
  $3::pg_catalog.text,
  $4::pg_catalog.text,
  $5::pg_catalog.text,
  $6::pg_catalog.text,
  $7::pg_catalog.uuid,
  $8::pg_catalog.text,
  $9::pg_catalog.jsonb,
  $10::pg_catalog.text,
  $11::pg_catalog.jsonb
) as data`,
      argumentKeys: Object.freeze([
        "p_job_id",
        "p_attempt_id",
        "p_lease_token",
        "p_registration_digest",
        "p_worker_policy_version",
        "p_worker_policy_digest",
        "p_fence_id",
        "p_fence_digest",
        "p_canonical_content",
        "p_canonical_content_hash",
        "p_provider_evidence",
      ]),
    }),
  [CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.settleFailure]: Object.freeze({
    sql: `select careslink_v1_generation.settle_v1_shadow_note_generation_failure(
  $1::pg_catalog.uuid,
  $2::pg_catalog.uuid,
  $3::pg_catalog.text,
  $4::pg_catalog.text,
  $5::pg_catalog.text,
  $6::pg_catalog.text,
  $7::pg_catalog.text,
  $8::pg_catalog.jsonb
) as data`,
    argumentKeys: Object.freeze([
      "p_job_id",
      "p_attempt_id",
      "p_lease_token",
      "p_registration_digest",
      "p_worker_policy_version",
      "p_worker_policy_digest",
      "p_reason",
      "p_provider_evidence",
    ]),
  }),
  [CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.resolveAttemptOutcome]:
    Object.freeze({
      sql: `select careslink_v1_generation.resolve_v1_shadow_note_generation_attempt(
  $1::pg_catalog.uuid,
  $2::pg_catalog.uuid,
  $3::pg_catalog.text,
  $4::pg_catalog.text,
  $5::pg_catalog.text,
  $6::pg_catalog.text
) as data`,
      argumentKeys: Object.freeze([
        "p_job_id",
        "p_attempt_id",
        "p_lease_token",
        "p_registration_digest",
        "p_expected_content_hash",
        "p_expected_provider_evidence_hash",
      ]),
    }),
  [CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.recoverExpired]: Object.freeze({
    sql: `select careslink_v1_generation.recover_v1_shadow_note_generation_expired(
  $1::pg_catalog.text,
  $2::pg_catalog.text,
  $3::pg_catalog.text,
  $4::pg_catalog.text,
  $5::pg_catalog.text,
  $6::pg_catalog.text
) as data`,
    argumentKeys: Object.freeze([
      "p_registration_digest",
      "p_worker_policy_version",
      "p_worker_policy_digest",
      "p_worker_identity_hash",
      "p_contract_version",
      "p_schema_version",
    ]),
  }),
  [CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.authorizePayloadAttempt]:
    Object.freeze({
      sql: `select careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(
  $1::pg_catalog.uuid,
  $2::pg_catalog.uuid,
  $3::pg_catalog.uuid,
  $4::pg_catalog.text,
  $5::pg_catalog.text
) as data`,
      argumentKeys: Object.freeze([
        "p_job_id",
        "p_payload_id",
        "p_attempt_id",
        "p_lease_token",
        "p_registration_digest",
      ]),
    }),
  [CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.consumePayloadGrant]:
    Object.freeze({
      sql: `select careslink_v1_generation.consume_v1_shadow_note_generation_payload_grant(
  $1::pg_catalog.uuid,
  $2::pg_catalog.uuid,
  $3::pg_catalog.uuid,
  $4::pg_catalog.text,
  $5::pg_catalog.text,
  $6::pg_catalog.uuid
) as data`,
      argumentKeys: Object.freeze([
        "p_job_id",
        "p_payload_id",
        "p_attempt_id",
        "p_lease_token",
        "p_registration_digest",
        "p_grant_id",
      ]),
    }),
});

const SAFE_DATABASE_MESSAGES = new Set<string>([
  ...CARESLINK_V1_REGISTERED_WORKER_SETTLE_REASONS,
  "AUTH_REQUIRED",
  "PRIVACY_REVIEW_REQUIRED",
  "FORBIDDEN",
]);

const INTERNAL_ERROR = Object.freeze({
  code: "XX000",
  message: "INTERNAL_FAILURE",
});

/**
 * Adapts one already-created Postgres query capability to the existing worker
 * RPC port. The caller remains responsible for connection lifecycle and for a
 * database identity with only the separately reviewed nine-function grant.
 */
export function createTestOnlyCaresLinkV1RegisteredWorkerPostgresClient(
  options: Readonly<{
    capability: "TEST_ONLY";
    queryPort: CaresLinkV1RegisteredWorkerPostgresQueryPort;
  }>,
): CaresLinkV1RegisteredWorkerPrivilegedRpcClient {
  if (
    !isPlainRecord(options) ||
    !hasExactDataKeys(options, ["capability", "queryPort"]) ||
    options.capability !== "TEST_ONLY" ||
    !hasExactDataKeys(options.queryPort, ["query"]) ||
    typeof options.queryPort.query !== "function"
  ) {
    throw new CaresLinkV1RegisteredWorkerExecutionError("INTERNAL_FAILURE");
  }

  const query = options.queryPort.query.bind(options.queryPort);
  const rpc = async <Name extends CaresLinkV1RegisteredWorkerAdapterRpcName>(
    functionName: Name,
    args: CaresLinkV1RegisteredWorkerAdapterRpcArguments[Name],
  ): Promise<CaresLinkV1RegisteredWorkerAdapterRpcResult> => {
    const call = rpcCall(functionName);
    if (!call || !hasExactDataKeys(args, call.argumentKeys)) {
      return failed(INTERNAL_ERROR);
    }

    const record = args as Readonly<Record<string, unknown>>;
    const values = Object.freeze(
      call.argumentKeys.map((argumentKey) => record[argumentKey]),
    );

    let result: unknown;
    try {
      result = await query(call.sql, values);
    } catch (error) {
      try {
        return failed(normalizePostgresError(error));
      } catch {
        return failed(INTERNAL_ERROR);
      }
    }
    try {
      return parseQueryResult(result);
    } catch {
      return failed(INTERNAL_ERROR);
    }
  };

  return Object.freeze({ rpc });
}

function rpcCall(value: unknown): RpcCall | undefined {
  if (typeof value !== "string" || !Object.hasOwn(RPC_CALLS, value)) {
    return undefined;
  }
  return RPC_CALLS[value as CaresLinkV1RegisteredWorkerAdapterRpcName];
}

function parseQueryResult(
  value: unknown,
): CaresLinkV1RegisteredWorkerAdapterRpcResult {
  const rows = ownDataProperty(value, "rows");
  if (!Array.isArray(rows) || rows.length !== 1) {
    return failed(INTERNAL_ERROR);
  }
  const row = ownDataProperty(rows, "0");
  if (!hasExactDataKeys(row, ["data"])) {
    return failed(INTERNAL_ERROR);
  }
  const data = ownDataProperty(row, "data");
  if (data === null || data === undefined) {
    return failed(INTERNAL_ERROR);
  }
  return Object.freeze({ data, error: null });
}

function normalizePostgresError(
  value: unknown,
): CaresLinkV1RegisteredWorkerAdapterRpcError {
  const code = ownStringProperty(value, "code");
  const message = ownStringProperty(value, "message");
  if (code === "42501") {
    return Object.freeze({ code, message: "FORBIDDEN" });
  }
  if (code === "P0001" && message && SAFE_DATABASE_MESSAGES.has(message)) {
    return Object.freeze({
      code: "P0001",
      message,
    });
  }
  return INTERNAL_ERROR;
}

function failed(
  error: CaresLinkV1RegisteredWorkerAdapterRpcError,
): CaresLinkV1RegisteredWorkerAdapterRpcResult {
  return Object.freeze({ data: null, error });
}

function hasExactDataKeys(
  value: unknown,
  expectedKeys: readonly string[],
): value is Readonly<Record<string, unknown>> {
  if (!isPlainRecord(value) || Object.getOwnPropertySymbols(value).length > 0) {
    return false;
  }
  const actualKeys = Object.getOwnPropertyNames(value).sort();
  const sortedExpected = [...expectedKeys].sort();
  if (
    actualKeys.length !== sortedExpected.length ||
    actualKeys.some((key, index) => key !== sortedExpected[index])
  ) {
    return false;
  }
  return actualKeys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return Boolean(
      descriptor &&
        descriptor.enumerable &&
        "value" in descriptor &&
        descriptor.get === undefined &&
        descriptor.set === undefined,
    );
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownDataProperty(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function ownStringProperty(value: unknown, key: string): string | undefined {
  const property = ownDataProperty(value, key);
  return typeof property === "string" ? property : undefined;
}
