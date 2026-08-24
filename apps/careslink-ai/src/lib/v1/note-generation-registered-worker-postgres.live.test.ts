import { createHash } from "node:crypto";
import { createRequire } from "node:module";

import { describe, expect, it, vi } from "vitest";

import {
  NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_DATABASE_URL_ENV,
  NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_POLICY,
  validateNoteWorkerRpcOwnerAbLocalPg16DatabaseUrl,
} from "../../../scripts/preview-e2e/note-worker-rpc-owner-ab-local-pg16-policy.mjs";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import { buildCaresLinkV1CanonicalNoteContent } from "./note-generation-output";
import {
  createCaresLinkV1NoteProviderAttemptEvidence,
  createCaresLinkV1NoteProviderPolicySnapshot,
  createCaresLinkV1NoteProviderWorkerPolicyBinding,
  type CaresLinkV1NoteProviderAttemptEvidence,
  type CaresLinkV1NoteProviderPolicyCore,
  type CaresLinkV1NoteProviderPolicySnapshot,
} from "./note-generation-provider-policy";
import {
  CARESLINK_V1_REGISTERED_WORKER_ADAPTER_READY,
  CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES,
  createTestOnlyCaresLinkV1RegisteredWorkerCompositeAdapter,
  type CaresLinkV1RegisteredWorkerAdapterRpcName,
  type CaresLinkV1RegisteredWorkerPrivilegedRpcClient,
  type CaresLinkV1RegisteredWorkerVaultConsumePort,
} from "./note-generation-registered-worker-adapter.server";
import {
  CARESLINK_V1_REGISTERED_WORKER_POSTGRES_CLIENT_READY,
  createTestOnlyCaresLinkV1RegisteredWorkerPostgresClient,
} from "./note-generation-registered-worker-postgres.server";
import {
  CARESLINK_V1_NOTE_GENERATION_REGISTERED_WORKER_READY,
  CaresLinkV1RegisteredWorkerExecutionError,
  createCaresLinkV1NoteGenerationWorkerRegistration,
  type CaresLinkV1NoteGenerationWorkerRegistration,
  type CaresLinkV1RegisteredWorkerClaim,
} from "./note-generation-registered-worker";
import {
  createCaresLinkV1NoteGenerationWorkerPolicyDigest,
  type CaresLinkV1NoteGenerationWorkerPolicy,
  type CaresLinkV1NoteGenerationWorkerPolicyDefinition,
} from "./note-generation-worker-policy";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CARESLINK_V1_NOTE_TYPE_CODES,
  CARESLINK_V1_RATE_CATALOG_VERSION,
  getCaresLinkV1NoteType,
  type CaresLinkV1NoteTypeCode,
} from "./shared-contracts";

vi.mock("server-only", () => ({}));

const SUPPORT_SCHEMA = "careslink_v1_generation_owner_ab_test_support";
const APPLICATION_NAME =
  NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_POLICY.requiredApplicationName;
const RUNNER_ROLE =
  NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_POLICY.requiredDatabaseRole;
const LOOPBACK_HOST =
  NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_POLICY.requiredHost;
const explicitLiveDatabaseUrl =
  process.env[NOTE_WORKER_RPC_OWNER_AB_LOCAL_PG16_DATABASE_URL_ENV];

const SUPPORT_SQL = Object.freeze({
  fixtureCatalog: `select ${SUPPORT_SCHEMA}.fixture_catalog() as result`,
  activateOwnerA:
    `select ${SUPPORT_SCHEMA}.activate_owner_a_fixture() as result`,
  activateOwnerB:
    `select ${SUPPORT_SCHEMA}.activate_owner_b_fixture() as result`,
  activatePrivacyDenied:
    `select ${SUPPORT_SCHEMA}.activate_privacy_denied_fixture() as result`,
  consumeOwnerA:
    `select ${SUPPORT_SCHEMA}.consume_owner_a_grant_test_only() as result`,
  consumeOwnerB:
    `select ${SUPPORT_SCHEMA}.consume_owner_b_grant_test_only() as result`,
  revokePrivacyDenied:
    `select ${SUPPORT_SCHEMA}.revoke_privacy_denied_fixture() as result`,
  fixtureState: `select ${SUPPORT_SCHEMA}.fixture_state() as result`,
});

const FIXTURE_CATALOG_KEYS = [
  "applicationName",
  "contractVersion",
  "schemaVersion",
  "registrationDigest",
  "workerIdentityHash",
  "workerPolicyVersion",
  "workerPolicyDigest",
  "fixtures",
] as const;
const FIXTURES_KEYS = ["ownerA", "ownerB", "privacyDenied"] as const;
const FIXTURE_KEYS = ["jobId", "payloadId"] as const;
const FIXTURE_STATE_KEYS = [
  "jobStatus",
  "jobFailureReason",
  "attemptStatus",
  "attemptFailureReason",
  "payloadState",
  "payloadRevokeReason",
  "grantStatus",
  "grantCount",
  "evidenceCount",
  "outboxCount",
  "rlsProjection",
] as const;
const PROJECTION_KEYS = [
  "documents",
  "revisions",
  "syncChanges",
  "mutationReceipts",
] as const;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;

const CLEANED_FACTS = Object.freeze({
  occurred_at: "2026-08-24T00:00:00Z",
  contact_channel: "phone",
  parties_by_role: Object.freeze(["support worker"]),
  observable_facts: "TEST_ONLY clean owner isolation fixture",
  action_taken: "TEST_ONLY documented",
});

const PROVIDER_CANDIDATE = Object.freeze({
  englishDraft: "Observable support facts were documented.",
  reviewVersions: Object.freeze({
    "zh-Hans": "已记录可观察的支持事实。",
    "zh-Hant": "已記錄可觀察的支援事實。",
  }),
  missingFacts: Object.freeze([]),
  neutralWordingChecks: Object.freeze([]),
  followUpPrompts: Object.freeze([]),
});

type FixtureCatalogItem = Readonly<{
  jobId: string;
  payloadId: string;
}>;

type FixtureCatalog = Readonly<{
  applicationName: typeof APPLICATION_NAME;
  contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
  schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
  registrationDigest: string;
  workerIdentityHash: string;
  workerPolicyVersion: string;
  workerPolicyDigest: string;
  fixtures: Readonly<{
    ownerA: FixtureCatalogItem;
    ownerB: FixtureCatalogItem;
    privacyDenied: FixtureCatalogItem;
  }>;
}>;

type RlsProjection = Readonly<{
  documents: number;
  revisions: number;
  syncChanges: number;
  mutationReceipts: number;
}>;

type FixtureStateItem = Readonly<{
  jobStatus: string;
  jobFailureReason: string | null;
  attemptStatus: string;
  attemptFailureReason: string | null;
  payloadState: string;
  payloadRevokeReason: string | null;
  grantStatus: string | null;
  grantCount: number;
  evidenceCount: number;
  outboxCount: number;
  rlsProjection: RlsProjection;
}>;

type FixtureState = Readonly<{
  ownerA: FixtureStateItem;
  ownerB: FixtureStateItem;
  privacyDenied: FixtureStateItem;
}>;

type PgQueryResult = Readonly<{
  rowCount: number | null;
  rows: readonly unknown[];
}>;

type PgClient = Readonly<{
  connect(): Promise<void>;
  end(): Promise<void>;
  on(event: "error", listener: (error: unknown) => void): PgClient;
  query(sql: string, values?: readonly unknown[]): Promise<PgQueryResult>;
}>;

type PgClientConstructor = new (options: Readonly<{
  connectionString: string;
  application_name: typeof APPLICATION_NAME;
  ssl: false;
  connectionTimeoutMillis: number;
  query_timeout: number;
  statement_timeout: number;
}>) => PgClient;

type RuntimeBinding = Readonly<{
  workerPolicy: CaresLinkV1NoteGenerationWorkerPolicy;
  providerPolicies: readonly CaresLinkV1NoteProviderPolicySnapshot[];
  communicationPolicy: CaresLinkV1NoteProviderPolicySnapshot;
  registration: CaresLinkV1NoteGenerationWorkerRegistration;
}>;

class OwnerAbLiveGateError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "OwnerAbLiveGateError";
  }
}

describe("CaresLink V1 registered worker Postgres owner A/B live gate", () => {
  it("remains source-only, unregistered and default-off", () => {
    expect([
      CARESLINK_V1_REGISTERED_WORKER_POSTGRES_CLIENT_READY,
      CARESLINK_V1_REGISTERED_WORKER_ADAPTER_READY,
      CARESLINK_V1_NOTE_GENERATION_REGISTERED_WORKER_READY,
    ]).toEqual([false, false, false]);
  });

  if (explicitLiveDatabaseUrl !== undefined) {
    it(
      "proves owner-isolated registered-worker transactions on explicit local PG16",
      { timeout: 30_000 },
      async () => {
        const databaseUrl = requireLocalRunnerDatabaseUrl(
          explicitLiveDatabaseUrl,
        );
        const Client = loadPgClient();
        const client = new Client({
          connectionString: databaseUrl,
          application_name: APPLICATION_NAME,
          ssl: false,
          connectionTimeoutMillis: 5_000,
          query_timeout: 9_000,
          statement_timeout: 8_000,
        });
        let connected = false;
        let backgroundClientError = false;
        client.on("error", () => {
          backgroundClientError = true;
        });

        try {
          await connect(client);
          connected = true;
          await runOwnerAbGate(client);
          requireGate(
            !backgroundClientError,
            "OWNER_AB_LIVE_BACKGROUND_CLIENT_ERROR",
          );
        } catch (error) {
          if (error instanceof OwnerAbLiveGateError) throw error;
          throw new OwnerAbLiveGateError("OWNER_AB_LIVE_GATE_FAILED");
        } finally {
          if (connected) await endQuietly(client);
        }
      },
    );
  }
});

async function runOwnerAbGate(client: PgClient): Promise<void> {
  const catalog = parseFixtureCatalog(
    await invokeSupport(client, "fixtureCatalog"),
  );
  const runtime = createRuntimeBinding(catalog);
  const postgresClient =
    createTestOnlyCaresLinkV1RegisteredWorkerPostgresClient({
      capability: "TEST_ONLY",
      queryPort: Object.freeze({
        query(sql: string, values: readonly unknown[]) {
          return client.query(sql, values);
        },
      }),
    });
  const rpcCallCounts = new Map<CaresLinkV1RegisteredWorkerAdapterRpcName, number>();
  let loseNextCommitResponse = false;
  const trackedRpc: CaresLinkV1RegisteredWorkerPrivilegedRpcClient["rpc"] =
    async (name, args) => {
      rpcCallCounts.set(name, (rpcCallCounts.get(name) ?? 0) + 1);
      const result = await postgresClient.rpc(name, args);
      if (
        loseNextCommitResponse &&
        name ===
          CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES
            .commitCanonicalSuccess &&
        result.error === null
      ) {
        loseNextCommitResponse = false;
        throw new OwnerAbLiveGateError(
          "OWNER_AB_LIVE_SIMULATED_COMMIT_RESPONSE_LOSS",
        );
      }
      return result;
    };
  const trackedClient = Object.freeze({ rpc: trackedRpc });
  let vaultCalls = 0;
  const vault = Object.freeze({
    async consumeOneTimeGrant() {
      vaultCalls += 1;
      throw new OwnerAbLiveGateError("OWNER_AB_LIVE_VAULT_MUST_NOT_RUN");
    },
  }) satisfies CaresLinkV1RegisteredWorkerVaultConsumePort;
  const adapter = createTestOnlyCaresLinkV1RegisteredWorkerCompositeAdapter({
    capability: "TEST_ONLY",
    client: trackedClient,
    vault,
    approvedWorkerPolicy: runtime.workerPolicy,
    approvedProviderPolicies: runtime.providerPolicies,
  });
  const claimInput = Object.freeze({
    workerIdentityHash: catalog.workerIdentityHash,
    registration: runtime.registration,
    workerPolicy: runtime.workerPolicy,
  });

  await requireSupportSuccess(client, "activateOwnerA");
  const ownerAClaim = requireClaim(
    await adapter.store.claimNext(claimInput),
    catalog.fixtures.ownerA,
    "OWNER_AB_LIVE_OWNER_A_CLAIM_MISMATCH",
  );
  await adapter.store.heartbeat(
    attemptInput(ownerAClaim, runtime),
  );
  await adapter.payload.authorizeAttempt(payloadInput(ownerAClaim));
  await requireSupportSuccess(client, "consumeOwnerA");
  const ownerAFence = await adapter.store.fenceAttempt(
    attemptInput(ownerAClaim, runtime),
  );
  const ownerAMaterial = createCommitMaterial(runtime);
  const ownerASuccess = await adapter.store.commitCanonicalSuccess({
    claim: ownerAClaim,
    fence: ownerAFence,
    registration: runtime.registration,
    content: ownerAMaterial.content.content,
    contentHash: ownerAMaterial.content.contentHash,
    providerEvidence: ownerAMaterial.evidence,
  });
  const ownerAResolved = await adapter.store.resolveAttemptOutcome({
    claim: ownerAClaim,
    registration: runtime.registration,
    expectedContentHash: ownerAMaterial.content.contentHash,
    expectedProviderEvidenceHash: ownerAMaterial.evidenceHash,
  });
  requireGate(
    ownerAResolved.status === "SUCCEEDED" &&
      ownerAResolved.result.contentHash === ownerASuccess.contentHash,
    "OWNER_AB_LIVE_OWNER_A_RESOLVE_MISMATCH",
  );

  await requireSupportSuccess(client, "activateOwnerB");
  const ownerBClaim = requireClaim(
    await adapter.store.claimNext(claimInput),
    catalog.fixtures.ownerB,
    "OWNER_AB_LIVE_OWNER_B_CLAIM_MISMATCH",
  );
  requireGate(
    ownerBClaim.attempt.attemptId !== ownerAClaim.attempt.attemptId &&
      ownerBClaim.leaseToken !== ownerAClaim.leaseToken,
    "OWNER_AB_LIVE_OWNER_ATTEMPT_CAPABILITY_COLLISION",
  );

  await requireExecutionFailure(
    () =>
      adapter.store.heartbeat(
        attemptInput(
          replaceClaimJobId(ownerBClaim, catalog.fixtures.ownerA.jobId),
          runtime,
        ),
      ),
    "LEASE_EXPIRED",
    "OWNER_AB_LIVE_CROSS_JOB_NOT_REJECTED",
  );
  await requireExecutionFailure(
    () =>
      adapter.store.settleFailure({
        ...attemptInput(
          replaceClaimAttemptId(
            ownerBClaim,
            ownerAClaim.attempt.attemptId,
          ),
          runtime,
        ),
        reason: "PROVIDER_PERMANENT",
      }),
    "POLICY_MISMATCH",
    "OWNER_AB_LIVE_CROSS_ATTEMPT_NOT_REJECTED",
  );
  await requireExecutionFailure(
    () =>
      adapter.payload.authorizeAttempt({
        ...payloadInput(ownerBClaim),
        payloadId: catalog.fixtures.ownerA.payloadId,
      }),
    "PAYLOAD_UNAVAILABLE",
    "OWNER_AB_LIVE_CROSS_PAYLOAD_NOT_REJECTED",
  );
  await requireExecutionFailure(
    () =>
      adapter.store.fenceAttempt(
        attemptInput(
          replaceClaimLease(ownerBClaim, ownerAClaim.leaseToken),
          runtime,
        ),
      ),
    "LEASE_EXPIRED",
    "OWNER_AB_LIVE_CROSS_LEASE_NOT_REJECTED",
  );

  await adapter.payload.authorizeAttempt(payloadInput(ownerBClaim));

  await requireSupportSuccess(client, "activatePrivacyDenied");
  const privacyDeniedClaim = requireClaim(
    await adapter.store.claimNext(claimInput),
    catalog.fixtures.privacyDenied,
    "OWNER_AB_LIVE_PRIVACY_CLAIM_MISMATCH",
  );
  const privacyGrant = await adapter.payload.authorizeAttempt(
    payloadInput(privacyDeniedClaim),
  );
  await requireRollbackOnly(client, async () => {
    await requireExecutionFailure(
      () =>
        adapter.payload.consumeAttemptGrant({
          ...payloadInput(ownerBClaim),
          grantId: privacyGrant.grantId,
        }),
      "PAYLOAD_UNAVAILABLE",
      "OWNER_AB_LIVE_CROSS_GRANT_NOT_REJECTED",
    );
  });

  await requireSupportSuccess(client, "consumeOwnerB");
  const ownerBFence = await adapter.store.fenceAttempt(
    attemptInput(ownerBClaim, runtime),
  );
  const ownerBMaterial = createCommitMaterial(runtime);
  const commitCallsBeforeLoss =
    rpcCallCounts.get(
      CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.commitCanonicalSuccess,
    ) ?? 0;
  loseNextCommitResponse = true;
  await requireExecutionFailure(
    () =>
      adapter.store.commitCanonicalSuccess({
        claim: ownerBClaim,
        fence: ownerBFence,
        registration: runtime.registration,
        content: ownerBMaterial.content.content,
        contentHash: ownerBMaterial.content.contentHash,
        providerEvidence: ownerBMaterial.evidence,
      }),
    "INTERNAL_FAILURE",
    "OWNER_AB_LIVE_COMMIT_RESPONSE_LOSS_NOT_SURFACED",
  );
  requireGate(
    !loseNextCommitResponse &&
      (rpcCallCounts.get(
        CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES
          .commitCanonicalSuccess,
      ) ?? 0) === commitCallsBeforeLoss + 1,
    "OWNER_AB_LIVE_COMMIT_WAS_RETRIED",
  );
  const ownerBResolved = await adapter.store.resolveAttemptOutcome({
    claim: ownerBClaim,
    registration: runtime.registration,
    expectedContentHash: ownerBMaterial.content.contentHash,
    expectedProviderEvidenceHash: ownerBMaterial.evidenceHash,
  });
  requireGate(
    ownerBResolved.status === "SUCCEEDED",
    "OWNER_AB_LIVE_OWNER_B_RESOLVE_MISMATCH",
  );

  await requireSupportSuccess(client, "revokePrivacyDenied");
  await requireExecutionFailure(
    () => adapter.payload.authorizeAttempt(payloadInput(privacyDeniedClaim)),
    "PRIVACY_REVIEW_STALE",
    "OWNER_AB_LIVE_REVOKED_PRIVACY_AUTHORIZE_NOT_SETTLED",
  );
  await requireExecutionFailure(
    () =>
      adapter.payload.consumeAttemptGrant({
        ...payloadInput(privacyDeniedClaim),
        grantId: privacyGrant.grantId,
      }),
    "PRIVACY_REVIEW_STALE",
    "OWNER_AB_LIVE_REVOKED_PRIVACY_CONSUME_NOT_SETTLED",
  );
  const privacySettlement = await adapter.store.settleFailure({
    ...attemptInput(privacyDeniedClaim, runtime),
    reason: "PRIVACY_REVIEW_STALE",
  });
  requireGate(
    privacySettlement.disposition === "FAILED" &&
      privacySettlement.reason === "PRIVACY_REVIEW_STALE" &&
      privacySettlement.payloadDisposition === "REVOKED_PURGE_ENQUEUED" &&
      privacySettlement.baseDelayMs === null &&
      privacySettlement.jitterMs === null &&
      privacySettlement.retryDelayMs === null,
    "OWNER_AB_LIVE_PRIVACY_SETTLEMENT_REPLAY_MISMATCH",
  );
  requireGate(vaultCalls === 0, "OWNER_AB_LIVE_VAULT_WAS_CALLED");

  const recovery = await adapter.store.recoverExpired(claimInput);
  requireGate(
    recovery.recovered === 0 &&
      recovery.requeued === 0 &&
      recovery.failed === 0,
    "OWNER_AB_LIVE_RECOVERY_NOT_EMPTY",
  );
  requireGate(
    (await adapter.store.claimNext(claimInput)) === undefined,
    "OWNER_AB_LIVE_FINAL_CLAIM_NOT_IDLE",
  );
  requireAllRpcsCalled(rpcCallCounts);

  const state = parseFixtureState(await invokeSupport(client, "fixtureState"));
  requireFinalFixtureState(state);
}

function createRuntimeBinding(catalog: FixtureCatalog): RuntimeBinding {
  const workerDefinition: CaresLinkV1NoteGenerationWorkerPolicyDefinition = {
    version: "worker.owner-ab.20260824.v1",
    status: "APPROVED",
    maxQueueAgeMs: 1_800_000,
    minimumPayloadRemainingAtClaimMs: 180_000,
    leaseDurationMs: 120_000,
    heartbeatIntervalMs: 20_000,
    heartbeatSafetyMarginMs: 5_000,
    attemptDeadlineMs: 180_000,
    providerDeadlineMs: 20_000,
    commitSafetyMarginMs: 5_000,
    maxAttempts: 2,
    retryDelayMsAfterAttempt: [1_000],
    retryableOutcomes: [
      "LEASE_EXPIRED",
      "PROVIDER_TIMEOUT",
      "PROVIDER_TRANSIENT",
    ],
    recoveryBatchLimit: 10,
    jitter: { mode: "NONE" },
  };
  const workerPolicy = Object.freeze({
    ...workerDefinition,
    digest: createCaresLinkV1NoteGenerationWorkerPolicyDigest(
      workerDefinition,
    ),
  });
  requireGate(
    workerPolicy.version === catalog.workerPolicyVersion &&
      workerPolicy.digest === catalog.workerPolicyDigest,
    "OWNER_AB_LIVE_WORKER_POLICY_MISMATCH",
  );

  const providerPolicies = Object.freeze(
    CARESLINK_V1_NOTE_TYPE_CODES.map((noteType) =>
      createOwnerAbProviderPolicy(noteType, workerPolicy.providerDeadlineMs),
    ),
  );
  const communicationPolicy = providerPolicies.find(
    (policy) => policy.noteType === "communication",
  );
  requireGate(
    communicationPolicy !== undefined,
    "OWNER_AB_LIVE_COMMUNICATION_POLICY_MISSING",
  );
  const payloadPolicySnapshotHash = sha256Canonical({
    policyVersion: "payload.owner-ab.20260824.v1",
    encryptionProfileVersion: "encryption.owner-ab.test.v1",
    backupDispositionVersion: "backup.owner-ab.test.v1",
  });
  const registration = createCaresLinkV1NoteGenerationWorkerRegistration({
    registrationVersion: "registration.owner-ab.20260824.v1",
    status: "APPROVED",
    contractVersion: CARESLINK_V1_CONTRACT_VERSION,
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    workerIdentityVersion: "worker-identity.owner-ab.test.v1",
    workerIdentityHash: catalog.workerIdentityHash,
    workerPolicyVersion: workerPolicy.version,
    workerPolicyDigest: workerPolicy.digest,
    payloadPolicyVersion: "payload.owner-ab.20260824.v1",
    payloadPolicySnapshotHash,
    providerPolicies: providerPolicies.map((policy) => ({
      noteType: policy.noteType,
      policyVersion: policy.policyVersion,
      policyDigest: policy.policyDigest,
    })),
  });
  requireGate(
    registration.registrationDigest === catalog.registrationDigest,
    "OWNER_AB_LIVE_REGISTRATION_MISMATCH",
  );
  return Object.freeze({
    workerPolicy,
    providerPolicies,
    communicationPolicy,
    registration,
  });
}

function createOwnerAbProviderPolicy(
  noteType: CaresLinkV1NoteTypeCode,
  timeoutMs: number,
): CaresLinkV1NoteProviderPolicySnapshot {
  const core: CaresLinkV1NoteProviderPolicyCore = {
    noteType,
    serviceCode: getCaresLinkV1NoteType(noteType).generationServiceCode,
    contractVersion: CARESLINK_V1_CONTRACT_VERSION,
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    rateCatalogVersion: CARESLINK_V1_RATE_CATALOG_VERSION,
    providerId: "provider.owner-ab.test",
    modelId: "model.owner-ab.test",
    modelRevision: null,
    modelRevisionAvailability: "PROVIDER_NOT_EXPOSED",
    policyVersion: "provider.owner-ab.20260824.v1",
    promptTemplateVersion: "prompt.owner-ab.test.v1",
    goldenSetVersion: "golden.owner-ab.test.v1",
    parserVersion: "parser.owner-ab.test.v1",
    timeoutMs,
  };
  return createCaresLinkV1NoteProviderPolicySnapshot(core);
}

function createCommitMaterial(runtime: RuntimeBinding) {
  const content = buildCaresLinkV1CanonicalNoteContent(
    "communication",
    CLEANED_FACTS,
    PROVIDER_CANDIDATE,
  );
  const startedAt = new Date().toISOString();
  const binding = createCaresLinkV1NoteProviderWorkerPolicyBinding({
    policySnapshot: runtime.communicationPolicy,
    workerPolicy: runtime.workerPolicy,
    startedAt,
  });
  const evidence: CaresLinkV1NoteProviderAttemptEvidence =
    createCaresLinkV1NoteProviderAttemptEvidence({
      policySnapshot: runtime.communicationPolicy,
      workerPolicyBinding: binding,
      workerPolicy: runtime.workerPolicy,
      candidate: PROVIDER_CANDIDATE,
      finishedAt: startedAt,
      finishReason: "COMPLETED",
      providerRequestId: "test-only-owner-ab-provider-request",
      usage: { status: "UNAVAILABLE", source: "UNAVAILABLE" },
      cost: { status: "UNAVAILABLE", source: "UNAVAILABLE" },
    });
  return Object.freeze({
    content,
    evidence,
    evidenceHash: sha256Canonical(evidence),
  });
}

function attemptInput(
  claim: CaresLinkV1RegisteredWorkerClaim,
  runtime: RuntimeBinding,
) {
  return Object.freeze({
    claim,
    registration: runtime.registration,
    workerPolicy: runtime.workerPolicy,
  });
}

function payloadInput(claim: CaresLinkV1RegisteredWorkerClaim) {
  return Object.freeze({
    jobId: claim.job.jobId,
    payloadId: claim.job.payloadId,
    attemptId: claim.attempt.attemptId,
    leaseToken: claim.leaseToken,
    registrationDigest: claim.attempt.registrationDigest,
    noteType: claim.job.noteType,
    contractVersion: claim.job.contractVersion,
    schemaVersion: claim.job.schemaVersion,
    cleanedFactsHash: claim.job.cleanedFactsHash,
  });
}

function replaceClaimJobId(
  claim: CaresLinkV1RegisteredWorkerClaim,
  jobId: string,
): CaresLinkV1RegisteredWorkerClaim {
  return Object.freeze({
    ...claim,
    job: Object.freeze({ ...claim.job, jobId }),
  });
}

function replaceClaimAttemptId(
  claim: CaresLinkV1RegisteredWorkerClaim,
  attemptId: string,
): CaresLinkV1RegisteredWorkerClaim {
  return Object.freeze({
    ...claim,
    attempt: Object.freeze({ ...claim.attempt, attemptId }),
  });
}

function replaceClaimLease(
  claim: CaresLinkV1RegisteredWorkerClaim,
  leaseToken: string,
): CaresLinkV1RegisteredWorkerClaim {
  return Object.freeze({
    ...claim,
    attempt: Object.freeze({
      ...claim.attempt,
      leaseTokenHash: sha256Text(leaseToken),
    }),
    leaseToken,
  });
}

function requireClaim(
  claim: CaresLinkV1RegisteredWorkerClaim | undefined,
  fixture: FixtureCatalogItem,
  code: string,
): CaresLinkV1RegisteredWorkerClaim {
  requireGate(
    claim !== undefined &&
      claim.job.jobId === fixture.jobId &&
      claim.job.payloadId === fixture.payloadId,
    code,
  );
  return claim;
}

async function requireExecutionFailure(
  operation: () => Promise<unknown>,
  expectedReason: string,
  code: string,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    requireGate(
      error instanceof CaresLinkV1RegisteredWorkerExecutionError &&
        error.reason === expectedReason,
      code,
    );
    return;
  }
  throw new OwnerAbLiveGateError(code);
}

async function requireRollbackOnly(
  client: PgClient,
  operation: () => Promise<void>,
): Promise<void> {
  try {
    await client.query("begin");
  } catch {
    throw new OwnerAbLiveGateError("OWNER_AB_LIVE_ROLLBACK_BEGIN_FAILED");
  }

  let operationError: unknown;
  try {
    await operation();
  } catch (error) {
    operationError = error;
  }

  try {
    await client.query("rollback");
  } catch {
    throw new OwnerAbLiveGateError("OWNER_AB_LIVE_ROLLBACK_FAILED");
  }
  if (operationError !== undefined) throw operationError;
}

function requireAllRpcsCalled(
  callCounts: ReadonlyMap<CaresLinkV1RegisteredWorkerAdapterRpcName, number>,
): void {
  const expectedNames = Object.values(
    CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES,
  );
  requireGate(
    expectedNames.length === 9 &&
      expectedNames.every((name) => (callCounts.get(name) ?? 0) > 0) &&
      [...callCounts.keys()].every((name) => expectedNames.includes(name)),
    "OWNER_AB_LIVE_RPC_COVERAGE_MISMATCH",
  );
}

async function invokeSupport(
  client: PgClient,
  helper: keyof typeof SUPPORT_SQL,
): Promise<unknown> {
  let result: PgQueryResult;
  try {
    result = await client.query(SUPPORT_SQL[helper]);
  } catch {
    throw new OwnerAbLiveGateError("OWNER_AB_LIVE_SUPPORT_QUERY_FAILED");
  }
  requireGate(
    result.rowCount === 1 && result.rows.length === 1,
    "OWNER_AB_LIVE_SUPPORT_RESULT_CARDINALITY",
  );
  const row = exactRecord(
    result.rows[0],
    ["result"],
    "OWNER_AB_LIVE_SUPPORT_RESULT_SHAPE",
  );
  requireGate(
    row.result !== null && row.result !== undefined,
    "OWNER_AB_LIVE_SUPPORT_RESULT_EMPTY",
  );
  return row.result;
}

async function requireSupportSuccess(
  client: PgClient,
  helper: keyof typeof SUPPORT_SQL,
): Promise<void> {
  requireGate(
    (await invokeSupport(client, helper)) === true,
    "OWNER_AB_LIVE_SUPPORT_MUTATION_FAILED",
  );
}

function parseFixtureCatalog(value: unknown): FixtureCatalog {
  const record = exactRecord(
    value,
    FIXTURE_CATALOG_KEYS,
    "OWNER_AB_LIVE_CATALOG_SHAPE",
  );
  requireGate(
    record.applicationName === APPLICATION_NAME &&
      record.contractVersion === CARESLINK_V1_CONTRACT_VERSION &&
      record.schemaVersion === CARESLINK_V1_NOTE_SCHEMA_VERSION &&
      isSha256(record.registrationDigest) &&
      isSha256(record.workerIdentityHash) &&
      isIdentifier(record.workerPolicyVersion) &&
      isSha256(record.workerPolicyDigest),
    "OWNER_AB_LIVE_CATALOG_VALUE",
  );
  const fixtures = exactRecord(
    record.fixtures,
    FIXTURES_KEYS,
    "OWNER_AB_LIVE_FIXTURES_SHAPE",
  );
  const ownerA = parseFixtureItem(fixtures.ownerA);
  const ownerB = parseFixtureItem(fixtures.ownerB);
  const privacyDenied = parseFixtureItem(fixtures.privacyDenied);
  for (const key of FIXTURE_KEYS) {
    requireGate(
      new Set([ownerA[key], ownerB[key], privacyDenied[key]]).size === 3,
      "OWNER_AB_LIVE_FIXTURE_ID_COLLISION",
    );
  }
  return Object.freeze({
    applicationName: APPLICATION_NAME,
    contractVersion: CARESLINK_V1_CONTRACT_VERSION,
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    registrationDigest: record.registrationDigest,
    workerIdentityHash: record.workerIdentityHash,
    workerPolicyVersion: record.workerPolicyVersion,
    workerPolicyDigest: record.workerPolicyDigest,
    fixtures: Object.freeze({ ownerA, ownerB, privacyDenied }),
  }) as FixtureCatalog;
}

function parseFixtureItem(value: unknown): FixtureCatalogItem {
  const record = exactRecord(
    value,
    FIXTURE_KEYS,
    "OWNER_AB_LIVE_FIXTURE_SHAPE",
  );
  requireGate(
    FIXTURE_KEYS.every((key) => isUuid(record[key])),
    "OWNER_AB_LIVE_FIXTURE_VALUE",
  );
  return Object.freeze({
    jobId: record.jobId,
    payloadId: record.payloadId,
  }) as FixtureCatalogItem;
}

function parseFixtureState(value: unknown): FixtureState {
  const record = exactRecord(
    value,
    FIXTURES_KEYS,
    "OWNER_AB_LIVE_STATE_SHAPE",
  );
  return Object.freeze({
    ownerA: parseFixtureStateItem(record.ownerA),
    ownerB: parseFixtureStateItem(record.ownerB),
    privacyDenied: parseFixtureStateItem(record.privacyDenied),
  });
}

function parseFixtureStateItem(value: unknown): FixtureStateItem {
  const record = exactRecord(
    value,
    FIXTURE_STATE_KEYS,
    "OWNER_AB_LIVE_STATE_ITEM_SHAPE",
  );
  const projectionRecord = exactRecord(
    record.rlsProjection,
    PROJECTION_KEYS,
    "OWNER_AB_LIVE_PROJECTION_SHAPE",
  );
  requireGate(
    typeof record.jobStatus === "string" &&
      isNullableString(record.jobFailureReason) &&
      typeof record.attemptStatus === "string" &&
      isNullableString(record.attemptFailureReason) &&
      typeof record.payloadState === "string" &&
      isNullableString(record.payloadRevokeReason) &&
      isNullableString(record.grantStatus) &&
      isNonnegativeInteger(record.grantCount) &&
      isNonnegativeInteger(record.evidenceCount) &&
      isNonnegativeInteger(record.outboxCount) &&
      PROJECTION_KEYS.every((key) =>
        isNonnegativeInteger(projectionRecord[key]),
      ),
    "OWNER_AB_LIVE_STATE_ITEM_VALUE",
  );
  return Object.freeze({
    jobStatus: record.jobStatus,
    jobFailureReason: record.jobFailureReason,
    attemptStatus: record.attemptStatus,
    attemptFailureReason: record.attemptFailureReason,
    payloadState: record.payloadState,
    payloadRevokeReason: record.payloadRevokeReason,
    grantStatus: record.grantStatus,
    grantCount: record.grantCount,
    evidenceCount: record.evidenceCount,
    outboxCount: record.outboxCount,
    rlsProjection: Object.freeze({
      documents: projectionRecord.documents,
      revisions: projectionRecord.revisions,
      syncChanges: projectionRecord.syncChanges,
      mutationReceipts: projectionRecord.mutationReceipts,
    }),
  }) as FixtureStateItem;
}

function requireFinalFixtureState(state: FixtureState): void {
  requireFixtureState(
    state.ownerA,
    {
      jobStatus: "SUCCEEDED",
      jobFailureReason: null,
      attemptStatus: "SUCCEEDED",
      attemptFailureReason: null,
      payloadState: "REVOKED",
      payloadRevokeReason: "SUCCEEDED",
      grantStatus: "CONSUMED",
      grantCount: 1,
      evidenceCount: 1,
      outboxCount: 1,
      projectionCount: 1,
    },
    "OWNER_AB_LIVE_OWNER_A_FINAL_STATE",
  );
  requireFixtureState(
    state.ownerB,
    {
      jobStatus: "SUCCEEDED",
      jobFailureReason: null,
      attemptStatus: "SUCCEEDED",
      attemptFailureReason: null,
      payloadState: "REVOKED",
      payloadRevokeReason: "SUCCEEDED",
      grantStatus: "CONSUMED",
      grantCount: 1,
      evidenceCount: 1,
      outboxCount: 1,
      projectionCount: 1,
    },
    "OWNER_AB_LIVE_OWNER_B_FINAL_STATE",
  );
  requireFixtureState(
    state.privacyDenied,
    {
      jobStatus: "FAILED",
      jobFailureReason: "PRIVACY_REVIEW_STALE",
      attemptStatus: "FAILED",
      attemptFailureReason: "PRIVACY_REVIEW_STALE",
      payloadState: "REVOKED",
      payloadRevokeReason: "FAILED",
      grantStatus: "REVOKED",
      grantCount: 1,
      evidenceCount: 0,
      outboxCount: 1,
      projectionCount: 0,
    },
    "OWNER_AB_LIVE_PRIVACY_FINAL_STATE",
  );
}

function requireFixtureState(
  state: FixtureStateItem,
  expected: Readonly<{
    jobStatus: string;
    jobFailureReason: string | null;
    attemptStatus: string;
    attemptFailureReason: string | null;
    payloadState: string;
    payloadRevokeReason: string;
    grantStatus: string;
    grantCount: number;
    evidenceCount: number;
    outboxCount: number;
    projectionCount: number;
  }>,
  code: string,
): void {
  requireGate(
    state.jobStatus === expected.jobStatus &&
      state.jobFailureReason === expected.jobFailureReason &&
      state.attemptStatus === expected.attemptStatus &&
      state.attemptFailureReason === expected.attemptFailureReason &&
      state.payloadState === expected.payloadState &&
      state.payloadRevokeReason === expected.payloadRevokeReason &&
      state.grantStatus === expected.grantStatus &&
      state.grantCount === expected.grantCount &&
      state.evidenceCount === expected.evidenceCount &&
      state.outboxCount === expected.outboxCount &&
      PROJECTION_KEYS.every(
        (key) => state.rlsProjection[key] === expected.projectionCount,
      ),
    code,
  );
}

function exactRecord<const Keys extends readonly string[]>(
  value: unknown,
  keys: Keys,
  code: string,
): Record<Keys[number], unknown> {
  requireGate(
    value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (Object.getPrototypeOf(value) === Object.prototype ||
        Object.getPrototypeOf(value) === null),
    code,
  );
  const record = value as Record<string, unknown>;
  const ownKeys = Reflect.ownKeys(record);
  requireGate(
    ownKeys.length === keys.length &&
      keys.every((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(record, key);
        return (
          descriptor !== undefined &&
          "value" in descriptor &&
          descriptor.enumerable
        );
      }),
    code,
  );
  return record as Record<Keys[number], unknown>;
}

function loadPgClient(): PgClientConstructor {
  let loaded: unknown;
  try {
    loaded = createRequire(import.meta.url)("pg");
  } catch {
    throw new OwnerAbLiveGateError("OWNER_AB_LIVE_PG_DRIVER_UNAVAILABLE");
  }
  requireGate(
    loaded !== null &&
      typeof loaded === "object" &&
      typeof (loaded as { Client?: unknown }).Client === "function",
    "OWNER_AB_LIVE_PG_DRIVER_INVALID",
  );
  return (loaded as { Client: PgClientConstructor }).Client;
}

function requireLocalRunnerDatabaseUrl(value: string): string {
  let descriptor: ReturnType<
    typeof validateNoteWorkerRpcOwnerAbLocalPg16DatabaseUrl
  >;
  try {
    descriptor = validateNoteWorkerRpcOwnerAbLocalPg16DatabaseUrl(value);
  } catch {
    throw new OwnerAbLiveGateError("OWNER_AB_LIVE_DATABASE_TARGET_DENIED");
  }
  requireGate(
    descriptor.ok === true &&
      descriptor.hostname === LOOPBACK_HOST &&
      descriptor.databaseRole === RUNNER_ROLE &&
      descriptor.database === "postgres" &&
      descriptor.applicationName === APPLICATION_NAME &&
      descriptor.postgresMajor === 16 &&
      descriptor.passwordMaterial === "absent" &&
      descriptor.sslMode === "disabled",
    "OWNER_AB_LIVE_DATABASE_TARGET_DENIED",
  );
  return value;
}

async function connect(client: PgClient): Promise<void> {
  try {
    await client.connect();
  } catch {
    throw new OwnerAbLiveGateError("OWNER_AB_LIVE_DATABASE_CONNECT_FAILED");
  }
}

async function endQuietly(client: PgClient): Promise<void> {
  try {
    await client.end();
  } catch {
    // A disposable local gate is torn down by the outer fixed cleanup path.
  }
}

function sha256Canonical(value: unknown): string {
  return sha256Text(stringifyCaresLinkV1CanonicalJson(value));
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256.test(value);
}

function isIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value)
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNonnegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function requireGate(
  condition: unknown,
  code: string,
): asserts condition {
  if (!condition) throw new OwnerAbLiveGateError(code);
}
