import { describe, expect, it, vi } from "vitest";

import {
  CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES,
  type CaresLinkV1RegisteredWorkerAdapterRpcName,
  type CaresLinkV1RegisteredWorkerAdapterRpcResult,
  type CaresLinkV1RegisteredWorkerPrivilegedRpcClient,
} from "./note-generation-registered-worker-adapter.server";
import {
  CARESLINK_V1_REGISTERED_WORKER_POSTGRES_CLIENT_READY,
  createTestOnlyCaresLinkV1RegisteredWorkerPostgresClient,
} from "./note-generation-registered-worker-postgres.server";

vi.mock("server-only", () => ({}));

const IDS = {
  job: "10000000-0000-4000-8000-000000000001",
  payload: "10000000-0000-4000-8000-000000000002",
  attempt: "10000000-0000-4000-8000-000000000003",
  fence: "10000000-0000-4000-8000-000000000004",
  grant: "10000000-0000-4000-8000-000000000005",
} as const;

const VALUES = {
  registrationDigest: "a".repeat(64),
  workerPolicyVersion: "worker.test-only.v1",
  workerPolicyDigest: "b".repeat(64),
  workerIdentityHash: "c".repeat(64),
  contractVersion: "1.0.0-shadow.1",
  schemaVersion: "2026-08-09.v1-shadow",
  leaseToken: "lease-token-private-001",
  fenceDigest: "d".repeat(64),
  contentHash: "e".repeat(64),
  evidenceHash: "f".repeat(64),
  content: { kind: "test-only-canonical-content" },
  evidence: { kind: "test-only-provider-evidence" },
} as const;

type RpcCase = Readonly<{
  name: CaresLinkV1RegisteredWorkerAdapterRpcName;
  args: Readonly<Record<string, unknown>>;
  sql: string;
  values: readonly unknown[];
}>;

const RPC_CASES: readonly RpcCase[] = [
  {
    name: CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.claimNext,
    args: {
      p_registration_digest: VALUES.registrationDigest,
      p_worker_policy_version: VALUES.workerPolicyVersion,
      p_worker_policy_digest: VALUES.workerPolicyDigest,
      p_worker_identity_hash: VALUES.workerIdentityHash,
      p_contract_version: VALUES.contractVersion,
      p_schema_version: VALUES.schemaVersion,
    },
    sql: `select careslink_v1_generation.claim_v1_shadow_note_generation_job(
  $1::pg_catalog.text,
  $2::pg_catalog.text,
  $3::pg_catalog.text,
  $4::pg_catalog.text,
  $5::pg_catalog.text,
  $6::pg_catalog.text
) as data`,
    values: [
      VALUES.registrationDigest,
      VALUES.workerPolicyVersion,
      VALUES.workerPolicyDigest,
      VALUES.workerIdentityHash,
      VALUES.contractVersion,
      VALUES.schemaVersion,
    ],
  },
  {
    name: CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.heartbeat,
    args: {
      p_job_id: IDS.job,
      p_attempt_id: IDS.attempt,
      p_lease_token: VALUES.leaseToken,
      p_registration_digest: VALUES.registrationDigest,
      p_worker_policy_version: VALUES.workerPolicyVersion,
      p_worker_policy_digest: VALUES.workerPolicyDigest,
    },
    sql: `select careslink_v1_generation.heartbeat_v1_shadow_note_generation_attempt(
  $1::pg_catalog.uuid,
  $2::pg_catalog.uuid,
  $3::pg_catalog.text,
  $4::pg_catalog.text,
  $5::pg_catalog.text,
  $6::pg_catalog.text
) as data`,
    values: [
      IDS.job,
      IDS.attempt,
      VALUES.leaseToken,
      VALUES.registrationDigest,
      VALUES.workerPolicyVersion,
      VALUES.workerPolicyDigest,
    ],
  },
  {
    name: CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.fenceAttempt,
    args: {
      p_job_id: IDS.job,
      p_attempt_id: IDS.attempt,
      p_lease_token: VALUES.leaseToken,
      p_registration_digest: VALUES.registrationDigest,
      p_worker_policy_version: VALUES.workerPolicyVersion,
      p_worker_policy_digest: VALUES.workerPolicyDigest,
    },
    sql: `select careslink_v1_generation.fence_v1_shadow_note_generation_attempt(
  $1::pg_catalog.uuid,
  $2::pg_catalog.uuid,
  $3::pg_catalog.text,
  $4::pg_catalog.text,
  $5::pg_catalog.text,
  $6::pg_catalog.text
) as data`,
    values: [
      IDS.job,
      IDS.attempt,
      VALUES.leaseToken,
      VALUES.registrationDigest,
      VALUES.workerPolicyVersion,
      VALUES.workerPolicyDigest,
    ],
  },
  {
    name:
      CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.commitCanonicalSuccess,
    args: {
      p_job_id: IDS.job,
      p_attempt_id: IDS.attempt,
      p_lease_token: VALUES.leaseToken,
      p_registration_digest: VALUES.registrationDigest,
      p_worker_policy_version: VALUES.workerPolicyVersion,
      p_worker_policy_digest: VALUES.workerPolicyDigest,
      p_fence_id: IDS.fence,
      p_fence_digest: VALUES.fenceDigest,
      p_canonical_content: VALUES.content,
      p_canonical_content_hash: VALUES.contentHash,
      p_provider_evidence: VALUES.evidence,
    },
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
    values: [
      IDS.job,
      IDS.attempt,
      VALUES.leaseToken,
      VALUES.registrationDigest,
      VALUES.workerPolicyVersion,
      VALUES.workerPolicyDigest,
      IDS.fence,
      VALUES.fenceDigest,
      VALUES.content,
      VALUES.contentHash,
      VALUES.evidence,
    ],
  },
  {
    name: CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.settleFailure,
    args: {
      p_job_id: IDS.job,
      p_attempt_id: IDS.attempt,
      p_lease_token: VALUES.leaseToken,
      p_registration_digest: VALUES.registrationDigest,
      p_worker_policy_version: VALUES.workerPolicyVersion,
      p_worker_policy_digest: VALUES.workerPolicyDigest,
      p_reason: "PROVIDER_TRANSIENT",
      p_provider_evidence: VALUES.evidence,
    },
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
    values: [
      IDS.job,
      IDS.attempt,
      VALUES.leaseToken,
      VALUES.registrationDigest,
      VALUES.workerPolicyVersion,
      VALUES.workerPolicyDigest,
      "PROVIDER_TRANSIENT",
      VALUES.evidence,
    ],
  },
  {
    name:
      CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.resolveAttemptOutcome,
    args: {
      p_job_id: IDS.job,
      p_attempt_id: IDS.attempt,
      p_lease_token: VALUES.leaseToken,
      p_registration_digest: VALUES.registrationDigest,
      p_expected_content_hash: VALUES.contentHash,
      p_expected_provider_evidence_hash: VALUES.evidenceHash,
    },
    sql: `select careslink_v1_generation.resolve_v1_shadow_note_generation_attempt(
  $1::pg_catalog.uuid,
  $2::pg_catalog.uuid,
  $3::pg_catalog.text,
  $4::pg_catalog.text,
  $5::pg_catalog.text,
  $6::pg_catalog.text
) as data`,
    values: [
      IDS.job,
      IDS.attempt,
      VALUES.leaseToken,
      VALUES.registrationDigest,
      VALUES.contentHash,
      VALUES.evidenceHash,
    ],
  },
  {
    name: CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.recoverExpired,
    args: {
      p_registration_digest: VALUES.registrationDigest,
      p_worker_policy_version: VALUES.workerPolicyVersion,
      p_worker_policy_digest: VALUES.workerPolicyDigest,
      p_worker_identity_hash: VALUES.workerIdentityHash,
      p_contract_version: VALUES.contractVersion,
      p_schema_version: VALUES.schemaVersion,
    },
    sql: `select careslink_v1_generation.recover_v1_shadow_note_generation_expired(
  $1::pg_catalog.text,
  $2::pg_catalog.text,
  $3::pg_catalog.text,
  $4::pg_catalog.text,
  $5::pg_catalog.text,
  $6::pg_catalog.text
) as data`,
    values: [
      VALUES.registrationDigest,
      VALUES.workerPolicyVersion,
      VALUES.workerPolicyDigest,
      VALUES.workerIdentityHash,
      VALUES.contractVersion,
      VALUES.schemaVersion,
    ],
  },
  {
    name:
      CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.authorizePayloadAttempt,
    args: {
      p_job_id: IDS.job,
      p_payload_id: IDS.payload,
      p_attempt_id: IDS.attempt,
      p_lease_token: VALUES.leaseToken,
      p_registration_digest: VALUES.registrationDigest,
    },
    sql: `select careslink_v1_generation.authorize_v1_shadow_note_generation_payload_attempt(
  $1::pg_catalog.uuid,
  $2::pg_catalog.uuid,
  $3::pg_catalog.uuid,
  $4::pg_catalog.text,
  $5::pg_catalog.text
) as data`,
    values: [
      IDS.job,
      IDS.payload,
      IDS.attempt,
      VALUES.leaseToken,
      VALUES.registrationDigest,
    ],
  },
  {
    name: CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.consumePayloadGrant,
    args: {
      p_job_id: IDS.job,
      p_payload_id: IDS.payload,
      p_attempt_id: IDS.attempt,
      p_lease_token: VALUES.leaseToken,
      p_registration_digest: VALUES.registrationDigest,
      p_grant_id: IDS.grant,
    },
    sql: `select careslink_v1_generation.consume_v1_shadow_note_generation_payload_grant(
  $1::pg_catalog.uuid,
  $2::pg_catalog.uuid,
  $3::pg_catalog.uuid,
  $4::pg_catalog.text,
  $5::pg_catalog.text,
  $6::pg_catalog.uuid
) as data`,
    values: [
      IDS.job,
      IDS.payload,
      IDS.attempt,
      VALUES.leaseToken,
      VALUES.registrationDigest,
      IDS.grant,
    ],
  },
] as const;

describe("CaresLink V1 registered-worker direct Postgres client", () => {
  it("remains TEST_ONLY and exposes no URL, environment, pool or registry input", () => {
    type Options = Parameters<
      typeof createTestOnlyCaresLinkV1RegisteredWorkerPostgresClient
    >[0];
    type HasUrl = "url" extends keyof Options ? true : false;
    type HasEnvironment = "env" extends keyof Options ? true : false;
    type HasPool = "pool" extends keyof Options ? true : false;
    type HasRegistry = "registry" extends keyof Options ? true : false;
    const absent: [HasUrl, HasEnvironment, HasPool, HasRegistry] = [
      false,
      false,
      false,
      false,
    ];

    expect(CARESLINK_V1_REGISTERED_WORKER_POSTGRES_CLIENT_READY).toBe(false);
    expect(absent).toEqual([false, false, false, false]);
    expect(() =>
      createTestOnlyCaresLinkV1RegisteredWorkerPostgresClient({
        capability: "LIVE" as "TEST_ONLY",
        queryPort: { query: vi.fn() },
      }),
    ).toThrowError(expect.objectContaining({ reason: "INTERNAL_FAILURE" }));
    expect(() =>
      createTestOnlyCaresLinkV1RegisteredWorkerPostgresClient({
        capability: "TEST_ONLY",
        queryPort: { query: vi.fn() },
        url: "postgresql://forbidden",
      } as unknown as Options),
    ).toThrowError(expect.objectContaining({ reason: "INTERNAL_FAILURE" }));

    const prototypePort = Object.assign(
      Object.create({ inherited: true }) as Record<string, unknown>,
      { query: vi.fn() },
    );
    expect(() =>
      createTestOnlyCaresLinkV1RegisteredWorkerPostgresClient({
        capability: "TEST_ONLY",
        queryPort:
          prototypePort as unknown as Options["queryPort"],
      }),
    ).toThrowError(expect.objectContaining({ reason: "INTERNAL_FAILURE" }));
    expect(() =>
      createTestOnlyCaresLinkV1RegisteredWorkerPostgresClient({
        capability: "TEST_ONLY",
        queryPort: { query: vi.fn(), extra: true },
      } as unknown as Options),
    ).toThrowError(expect.objectContaining({ reason: "INTERNAL_FAILURE" }));
    const accessorPort: Record<string, unknown> = {};
    Object.defineProperty(accessorPort, "query", {
      enumerable: true,
      get: () => vi.fn(),
    });
    expect(() =>
      createTestOnlyCaresLinkV1RegisteredWorkerPostgresClient({
        capability: "TEST_ONLY",
        queryPort:
          accessorPort as unknown as Options["queryPort"],
      }),
    ).toThrowError(expect.objectContaining({ reason: "INTERNAL_FAILURE" }));
  });

  it.each(RPC_CASES)(
    "calls only the fixed schema-qualified $name SQL with exact ordered values",
    async ({ name, args, sql, values }) => {
      const data = Object.freeze({ status: "TEST_ONLY_OK", name });
      const query = vi.fn(
        async (sqlInput: string, valueInput: readonly unknown[]) => {
          void sqlInput;
          void valueInput;
          return {
            command: "SELECT",
            rowCount: 1,
            rows: [{ data }],
          };
        },
      );
      const client = createClient(query);

      await expect(invoke(client, name, args)).resolves.toEqual({
        data,
        error: null,
      });
      expect(query).toHaveBeenCalledTimes(1);
      expect(query).toHaveBeenCalledWith(sql, values);
      expect(Object.isFrozen(query.mock.calls[0]?.[1])).toBe(true);
      if (
        name ===
        CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.commitCanonicalSuccess
      ) {
        expect(query.mock.calls[0]?.[1][8]).toBe(VALUES.content);
        expect(query.mock.calls[0]?.[1][10]).toBe(VALUES.evidence);
      }
    },
  );

  it("rejects unknown functions and inexact or accessor arguments before query", async () => {
    const query = vi.fn(async () => ({ rows: [{ data: { status: "OK" } }] }));
    const client = createClient(query);
    const claim = RPC_CASES[0];

    await expect(
      invoke(client, "unreviewed_worker_rpc", claim.args),
    ).resolves.toEqual(internalFailure());
    await expect(
      invoke(client, claim.name, { ...claim.args, extra: true }),
    ).resolves.toEqual(internalFailure());
    const missing = { ...claim.args };
    delete missing.p_schema_version;
    await expect(invoke(client, claim.name, missing)).resolves.toEqual(
      internalFailure(),
    );
    const accessor = { ...claim.args };
    Object.defineProperty(accessor, "p_schema_version", {
      enumerable: true,
      get: () => VALUES.schemaVersion,
    });
    await expect(invoke(client, claim.name, accessor)).resolves.toEqual(
      internalFailure(),
    );
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    ["empty rows", { rows: [] }],
    ["multiple rows", { rows: [{ data: { status: "A" } }, { data: { status: "B" } }] }],
    ["null data", { rows: [{ data: null }] }],
    ["extra result column", { rows: [{ data: { status: "A" }, extra: true }] }],
    ["missing rows", { rowCount: 1 }],
  ] as const)("fails closed on %s", async (_label, result) => {
    const query = vi.fn(async () => result);
    const client = createClient(query);
    const claim = RPC_CASES[0];

    await expect(invoke(client, claim.name, claim.args)).resolves.toEqual(
      internalFailure(),
    );
  });

  it("rejects accessor query results without evaluating them", async () => {
    const rowsGetter = vi.fn(() => [{ data: { status: "FORBIDDEN" } }]);
    const result: Record<string, unknown> = {};
    Object.defineProperty(result, "rows", {
      enumerable: true,
      get: rowsGetter,
    });
    const rowDataGetter = vi.fn(() => ({ status: "FORBIDDEN" }));
    const row: Record<string, unknown> = {};
    Object.defineProperty(row, "data", {
      enumerable: true,
      get: rowDataGetter,
    });
    const claim = RPC_CASES[0];

    const rowsAccessorClient = createClient(vi.fn(async () => result));
    await expect(
      invoke(rowsAccessorClient, claim.name, claim.args),
    ).resolves.toEqual(internalFailure());
    expect(rowsGetter).not.toHaveBeenCalled();

    const rowSlotGetter = vi.fn(() => ({ data: { status: "FORBIDDEN" } }));
    const accessorRows = new Array<unknown>(1);
    Object.defineProperty(accessorRows, "0", {
      enumerable: true,
      get: rowSlotGetter,
    });
    const rowSlotAccessorClient = createClient(
      vi.fn(async () => ({ rows: accessorRows })),
    );
    await expect(
      invoke(rowSlotAccessorClient, claim.name, claim.args),
    ).resolves.toEqual(internalFailure());
    expect(rowSlotGetter).not.toHaveBeenCalled();

    const dataAccessorClient = createClient(
      vi.fn(async () => ({ rows: [row] })),
    );
    await expect(
      invoke(dataAccessorClient, claim.name, claim.args),
    ).resolves.toEqual(internalFailure());
    expect(rowDataGetter).not.toHaveBeenCalled();
  });

  it("normalizes unknown query failures to one fixed content-free error", async () => {
    const query = vi.fn(async () => {
      throw Object.assign(new Error("database secret bearer-123"), {
        code: "ECONNRESET",
        detail: "private connection details",
        hint: "private hint",
      });
    });
    const client = createClient(query);
    const claim = RPC_CASES[0];
    const result = await invoke(client, claim.name, claim.args);

    expect(result).toEqual(internalFailure());
    expect(JSON.stringify(result)).not.toMatch(
      /bearer-123|connection details|ECONNRESET|hint/,
    );

    const proxyFailure = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          throw new Error("proxy database secret");
        },
      },
    );
    const proxyClient = createClient(
      vi.fn(async () => {
        throw proxyFailure;
      }),
    );
    await expect(invoke(proxyClient, claim.name, claim.args)).resolves.toEqual(
      internalFailure(),
    );
  });

  it.each([
    [
      Object.assign(new Error("SESSION_REVOKED"), {
        code: "P0001",
        detail: "must not survive",
      }),
      { code: "P0001", message: "SESSION_REVOKED" },
    ],
    [
      Object.assign(new Error("PRIVACY_REVIEW_STALE"), {
        code: "ABCDE",
        detail: "unreviewed code must not survive",
      }),
      { code: "XX000", message: "INTERNAL_FAILURE" },
    ],
    [
      Object.assign(new Error("raw database privilege detail"), {
        code: "42501",
        hint: "must not survive",
      }),
      { code: "42501", message: "FORBIDDEN" },
    ],
  ] as const)(
    "retains only allowlisted database semantics",
    async (databaseError, expectedError) => {
      const query = vi.fn(async () => {
        throw databaseError;
      });
      const client = createClient(query);
      const claim = RPC_CASES[0];

      await expect(invoke(client, claim.name, claim.args)).resolves.toEqual({
        data: null,
        error: expectedError,
      });
    },
  );
});

function createClient(
  query: (sql: string, values: readonly unknown[]) => PromiseLike<unknown>,
) {
  return createTestOnlyCaresLinkV1RegisteredWorkerPostgresClient({
    capability: "TEST_ONLY",
    queryPort: { query },
  });
}

function invoke(
  client: CaresLinkV1RegisteredWorkerPrivilegedRpcClient,
  name: string,
  args: Readonly<Record<string, unknown>>,
) {
  const rpc = client.rpc as unknown as (
    functionName: string,
    rpcArguments: Readonly<Record<string, unknown>>,
  ) => PromiseLike<CaresLinkV1RegisteredWorkerAdapterRpcResult>;
  return rpc(name, args);
}

function internalFailure(): CaresLinkV1RegisteredWorkerAdapterRpcResult {
  return {
    data: null,
    error: { code: "XX000", message: "INTERNAL_FAILURE" },
  };
}
