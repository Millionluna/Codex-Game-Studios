import "server-only";

import { createHash } from "node:crypto";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import { buildCaresLinkV1CanonicalNoteContent } from "./note-generation-output";
import { scanCaresLinkV1CleanedFacts } from "./privacy-review-scanner.server";
import {
  CaresLinkV1RegisteredWorkerExecutionError,
  validateCaresLinkV1NoteGenerationWorkerRegistration,
  type CaresLinkV1NoteGenerationRegisteredWorkerPayloadPort,
  type CaresLinkV1NoteGenerationRegisteredWorkerStore,
  type CaresLinkV1NoteGenerationWorkerRegistration,
  type CaresLinkV1RegisteredWorkerClaim,
  type CaresLinkV1RegisteredWorkerFailureSettlement,
  type CaresLinkV1RegisteredWorkerPersistedOutcome,
  type CaresLinkV1RegisteredWorkerRecoverySummary,
  type CaresLinkV1RegisteredWorkerSettleReason,
  type CaresLinkV1RegisteredWorkerSuccess,
} from "./note-generation-registered-worker";
import {
  CARESLINK_V1_NOTE_PROVIDER_COST_SOURCES,
  CARESLINK_V1_NOTE_PROVIDER_FINISH_REASONS,
  CARESLINK_V1_NOTE_PROVIDER_USAGE_SOURCES,
  validateCaresLinkV1NoteProviderAttemptEvidence,
  validateCaresLinkV1NoteProviderPolicySnapshot,
  type CaresLinkV1NoteProviderAttemptEvidence,
  type CaresLinkV1NoteProviderPolicySnapshot,
} from "./note-generation-provider-policy";
import {
  parseCaresLinkV1NoteGenerationWorkerPolicy,
  type CaresLinkV1NoteGenerationWorkerPolicy,
} from "./note-generation-worker-policy";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_LOCALES,
  CARESLINK_V1_NOTE_SCHEMA_VERSION,
  CARESLINK_V1_NOTE_TYPE_CODES,
  CaresLinkV1ContractError,
  getCaresLinkV1NoteType,
  validateCaresLinkV1CleanedFacts,
  type CaresLinkV1NoteContent,
  type CaresLinkV1NoteTypeCode,
} from "./shared-contracts";
import { CARESLINK_V1_SERVER_SAVE_ACK } from "./transport-contract";

/** Source-only contract. No client, route, environment or runtime is wired. */
export const CARESLINK_V1_REGISTERED_WORKER_ADAPTER_READY = false as const;

export const CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES = {
  claimNext: "claim_v1_shadow_note_generation_job",
  heartbeat: "heartbeat_v1_shadow_note_generation_attempt",
  fenceAttempt: "fence_v1_shadow_note_generation_attempt",
  commitCanonicalSuccess: "commit_v1_shadow_note_generation_success",
  settleFailure: "settle_v1_shadow_note_generation_failure",
  resolveAttemptOutcome: "resolve_v1_shadow_note_generation_attempt",
  recoverExpired: "recover_v1_shadow_note_generation_expired",
  authorizePayloadAttempt: "authorize_v1_shadow_note_generation_payload_attempt",
  consumePayloadGrant: "consume_v1_shadow_note_generation_payload_grant",
} as const;

type RpcNames = typeof CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES;
export type CaresLinkV1RegisteredWorkerAdapterRpcName = RpcNames[keyof RpcNames];

type RegistrationArgs = Readonly<{
  p_registration_digest: string;
  p_worker_policy_version: string;
  p_worker_policy_digest: string;
}>;

type ClaimArgs = RegistrationArgs &
  Readonly<{
    p_worker_identity_hash: string;
    p_contract_version: typeof CARESLINK_V1_CONTRACT_VERSION;
    p_schema_version: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
  }>;

type AttemptArgs = RegistrationArgs &
  Readonly<{
    p_job_id: string;
    p_attempt_id: string;
    p_lease_token: string;
  }>;

type PayloadAttemptArgs = Readonly<{
  p_job_id: string;
  p_payload_id: string;
  p_attempt_id: string;
  p_lease_token: string;
  p_registration_digest: string;
}>;

export type CaresLinkV1RegisteredWorkerAdapterRpcArguments = Readonly<{
  [CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.claimNext]: ClaimArgs;
  [CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.heartbeat]: AttemptArgs;
  [CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.fenceAttempt]: AttemptArgs;
  [CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.commitCanonicalSuccess]:
    AttemptArgs &
      Readonly<{
        p_fence_id: string;
        p_fence_digest: string;
        p_canonical_content: CaresLinkV1NoteContent;
        p_canonical_content_hash: string;
        p_provider_evidence: CaresLinkV1NoteProviderAttemptEvidence;
      }>;
  [CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.settleFailure]:
    AttemptArgs &
      Readonly<{
        p_reason: CaresLinkV1RegisteredWorkerSettleReason;
        p_provider_evidence: CaresLinkV1NoteProviderAttemptEvidence | null;
      }>;
  [CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.resolveAttemptOutcome]:
    Readonly<{
      p_job_id: string;
      p_attempt_id: string;
      p_lease_token: string;
      p_registration_digest: string;
      p_expected_content_hash: string | null;
      p_expected_provider_evidence_hash: string | null;
    }>;
  [CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.recoverExpired]: ClaimArgs;
  [CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.authorizePayloadAttempt]:
    PayloadAttemptArgs;
  [CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.consumePayloadGrant]:
    PayloadAttemptArgs & Readonly<{ p_grant_id: string }>;
}>;

export type CaresLinkV1RegisteredWorkerAdapterRpcError = Readonly<{
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
}>;

export type CaresLinkV1RegisteredWorkerAdapterRpcResult = Readonly<{
  data: unknown;
  error: CaresLinkV1RegisteredWorkerAdapterRpcError | null;
}>;

/**
 * Must be a server-private privileged client whose execute permission is not
 * granted to anon/authenticated. No credential or URL is accepted here.
 */
export type CaresLinkV1RegisteredWorkerPrivilegedRpcClient = Readonly<{
  rpc<Name extends CaresLinkV1RegisteredWorkerAdapterRpcName>(
    functionName: Name,
    args: CaresLinkV1RegisteredWorkerAdapterRpcArguments[Name],
  ): PromiseLike<CaresLinkV1RegisteredWorkerAdapterRpcResult>;
}>;

/** The only port permitted to return raw facts to this composite adapter. */
export type CaresLinkV1RegisteredWorkerVaultConsumePort = Readonly<{
  consumeOneTimeGrant(input: Readonly<{
    vaultGrant: string;
    grantId: string;
    jobId: string;
    payloadId: string;
    attemptId: string;
    registrationDigest: string;
    expiresAt: string;
  }>): PromiseLike<unknown>;
}>;

export type CaresLinkV1RegisteredWorkerCompositeAdapter = Readonly<{
  store: CaresLinkV1NoteGenerationRegisteredWorkerStore;
  payload: CaresLinkV1NoteGenerationRegisteredWorkerPayloadPort;
}>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const SERVER_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const POSITIVE_DECIMAL = /^[1-9][0-9]*$/;
const SETTLE_REASONS = [
  "LEASE_EXPIRED",
  "PROVIDER_TIMEOUT",
  "PROVIDER_TRANSIENT",
  "PROVIDER_PERMANENT",
  "PROVIDER_OUTPUT_INVALID",
  "PAYLOAD_UNAVAILABLE",
  "SESSION_REVOKED",
  "PRIVACY_REVIEW_STALE",
  "CANCELLED",
  "POLICY_MISMATCH",
  "INTERNAL_FAILURE",
] as const;
const PAYLOAD_DENIAL_REASONS = [
  "PAYLOAD_UNAVAILABLE",
  "SESSION_REVOKED",
  "PRIVACY_REVIEW_STALE",
] as const;
const EVIDENCE_KEYS = [
  "policyDigest",
  "providerId",
  "modelId",
  "modelRevision",
  "modelRevisionAvailability",
  "policyVersion",
  "promptTemplateVersion",
  "goldenSetVersion",
  "parserVersion",
  "serviceCode",
  "rateCatalogVersion",
  "timeoutMs",
  "workerPolicyDigest",
  "deadlineAt",
  "startedAt",
  "finishedAt",
  "durationMs",
  "finishReason",
  "providerRequestIdHash",
  "usage",
  "cost",
  "candidateDigest",
] as const;

/**
 * Explicit behavioral composition only. It does not make the adapter served,
 * discover credentials, register a worker or grant database permissions.
 */
export function createTestOnlyCaresLinkV1RegisteredWorkerCompositeAdapter(
  options: Readonly<{
    capability: "TEST_ONLY";
    client: CaresLinkV1RegisteredWorkerPrivilegedRpcClient;
    vault: CaresLinkV1RegisteredWorkerVaultConsumePort;
    approvedWorkerPolicy: CaresLinkV1NoteGenerationWorkerPolicy;
    approvedProviderPolicies: readonly CaresLinkV1NoteProviderPolicySnapshot[];
  }>,
): CaresLinkV1RegisteredWorkerCompositeAdapter {
  if (!isRecord(options) || options.capability !== "TEST_ONLY") {
    throw unavailable("INTERNAL_FAILURE");
  }
  exactKeys(
    options,
    [
      "capability",
      "client",
      "vault",
      "approvedWorkerPolicy",
      "approvedProviderPolicies",
    ],
    "adapter factory options",
  );
  if (
    !isRecord(options.client) ||
    typeof options.client.rpc !== "function" ||
    !isRecord(options.vault) ||
    typeof options.vault.consumeOneTimeGrant !== "function"
  ) {
    throw unavailable("INTERNAL_FAILURE");
  }
  const client = Object.freeze({ rpc: options.client.rpc.bind(options.client) });
  const vault = Object.freeze({
    consumeOneTimeGrant: options.vault.consumeOneTimeGrant.bind(options.vault),
  });
  const approved = createApprovedPolicyBinding(
    options.approvedWorkerPolicy,
    options.approvedProviderPolicies,
  );

  const store: CaresLinkV1NoteGenerationRegisteredWorkerStore = Object.freeze({
    async claimNext(input) {
      const binding = registrationBinding(
        input.registration,
        input.workerPolicy,
        approved,
      );
      const workerIdentityHash = expectSha256(
        input.workerIdentityHash,
        "worker identity hash",
      );
      if (workerIdentityHash !== binding.registration.workerIdentityHash) {
        throw unavailable("POLICY_MISMATCH");
      }
      const data = await callRpc(
        client,
        CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.claimNext,
        {
          ...binding.args,
          p_worker_identity_hash: workerIdentityHash,
          p_contract_version: CARESLINK_V1_CONTRACT_VERSION,
          p_schema_version: CARESLINK_V1_NOTE_SCHEMA_VERSION,
        },
        "INTERNAL_FAILURE",
      );
      return parseClaimEnvelope(data, binding.registration, workerIdentityHash);
    },

    async heartbeat(input) {
      const prepared = prepareAttemptCall(input, approved);
      const data = await callRpc(
        client,
        CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.heartbeat,
        prepared.args,
        "LEASE_EXPIRED",
      );
      assertAttemptAck(data, "RENEWED", prepared.claim);
    },

    async fenceAttempt(input) {
      const prepared = prepareAttemptCall(input, approved);
      const data = await callRpc(
        client,
        CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.fenceAttempt,
        prepared.args,
        "LEASE_EXPIRED",
      );
      return parseFence(data, prepared.claim);
    },

    async commitCanonicalSuccess(input) {
      assertPlainTree(input.registration);
      const registration = validateCaresLinkV1NoteGenerationWorkerRegistration(
        input.registration,
      );
      assertRegistrationMatchesApproved(registration, approved);
      const claim = sanitizeClaim(input.claim, registration);
      const fence = parseFenceValue(input.fence);
      const contentHash = expectSha256(input.contentHash, "content hash");
      const content = rebuildCanonicalContent(input.content, claim.job.noteType);
      if (
        sha256(stringifyCaresLinkV1CanonicalJson(content)) !== contentHash
      ) {
        throw unavailable("INTERNAL_FAILURE");
      }
      const providerPolicy = approvedPolicyForClaim(claim, approved);
      const candidate = providerCandidateFromContent(content);
      const evidence = parseContentFreeEvidence(
        input.providerEvidence,
        claim,
        providerPolicy,
        approved.workerPolicy,
        candidate,
      );
      const data = await callRpc(
        client,
        CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.commitCanonicalSuccess,
        {
          ...attemptArgs(claim, registration),
          p_fence_id: fence.fenceId,
          p_fence_digest: fence.fenceDigest,
          p_canonical_content: content,
          p_canonical_content_hash: contentHash,
          p_provider_evidence: evidence,
        },
        "INTERNAL_FAILURE",
      );
      return parseAtomicCommit(
        data,
        claim,
        contentHash,
        sha256(stringifyCaresLinkV1CanonicalJson(evidence)),
      );
    },

    async settleFailure(input) {
      const prepared = prepareAttemptCall(input, approved);
      const reason = expectEnum(input.reason, SETTLE_REASONS, "settle reason");
      const evidence = input.providerEvidence
        ? parseContentFreeEvidence(
            input.providerEvidence,
            prepared.claim,
            approvedPolicyForClaim(prepared.claim, approved),
            approved.workerPolicy,
          )
        : null;
      const data = await callRpc(
        client,
        CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.settleFailure,
        {
          ...prepared.args,
          p_reason: reason,
          p_provider_evidence: evidence,
        },
        "INTERNAL_FAILURE",
      );
      const settlement = parseAtomicSettlement(
        data,
        prepared.claim,
        approved,
        reason,
        evidence === null
          ? null
          : sha256(stringifyCaresLinkV1CanonicalJson(evidence)),
      );
      if (settlement.reason !== reason) throw unavailable("INTERNAL_FAILURE");
      return settlement;
    },

    async resolveAttemptOutcome(input) {
      assertPlainTree(input.registration);
      const registration = validateCaresLinkV1NoteGenerationWorkerRegistration(
        input.registration,
      );
      assertRegistrationMatchesApproved(registration, approved);
      const claim = sanitizeClaim(input.claim, registration);
      const expectedContentHash =
        input.expectedContentHash === null
          ? null
          : expectSha256(input.expectedContentHash, "expected content hash");
      const expectedProviderEvidenceHash =
        input.expectedProviderEvidenceHash === null
          ? null
          : expectSha256(
              input.expectedProviderEvidenceHash,
              "expected provider evidence hash",
            );
      const data = await callRpc(
        client,
        CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.resolveAttemptOutcome,
        {
          p_job_id: claim.job.jobId,
          p_attempt_id: claim.attempt.attemptId,
          p_lease_token: claim.leaseToken,
          p_registration_digest: registration.registrationDigest,
          p_expected_content_hash: expectedContentHash,
          p_expected_provider_evidence_hash: expectedProviderEvidenceHash,
        },
        "INTERNAL_FAILURE",
      );
      return parsePersistedOutcome(
        data,
        claim,
        expectedContentHash,
        expectedProviderEvidenceHash,
        approved,
      );
    },

    async recoverExpired(input) {
      const binding = registrationBinding(
        input.registration,
        input.workerPolicy,
        approved,
      );
      const workerIdentityHash = expectSha256(
        input.workerIdentityHash,
        "worker identity hash",
      );
      if (workerIdentityHash !== binding.registration.workerIdentityHash) {
        throw unavailable("POLICY_MISMATCH");
      }
      const data = await callRpc(
        client,
        CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.recoverExpired,
        {
          ...binding.args,
          p_worker_identity_hash: workerIdentityHash,
          p_contract_version: CARESLINK_V1_CONTRACT_VERSION,
          p_schema_version: CARESLINK_V1_NOTE_SCHEMA_VERSION,
        },
        "INTERNAL_FAILURE",
      );
      return parseRecovery(data);
    },
  });

  const payload: CaresLinkV1NoteGenerationRegisteredWorkerPayloadPort =
    Object.freeze({
      async authorizeAttempt(input) {
        const args = payloadArgs(input);
        const data = await callRpc(
          client,
          CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.authorizePayloadAttempt,
          args,
          "PAYLOAD_UNAVAILABLE",
        );
        throwIfPayloadDeniedAndSettled(data, input);
        return parsePayloadGrant(data, input);
      },

      async consumeAttemptGrant(input) {
        const args = {
          ...payloadArgs(input),
          p_grant_id: expectUuid(input.grantId, "grant ID"),
        };
        const data = await callRpc(
          client,
          CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.consumePayloadGrant,
          args,
          "PAYLOAD_UNAVAILABLE",
        );
        throwIfPayloadDeniedAndSettled(data, input);
        const authorization = parseVaultAuthorization(data, input);
        let facts: unknown;
        try {
          facts = await vault.consumeOneTimeGrant({
            vaultGrant: authorization.vaultGrant,
            grantId: args.p_grant_id,
            jobId: args.p_job_id,
            payloadId: args.p_payload_id,
            attemptId: args.p_attempt_id,
            registrationDigest: args.p_registration_digest,
            expiresAt: authorization.expiresAt,
          });
        } catch {
          throw unavailable("PAYLOAD_UNAVAILABLE");
        }
        let validatedFacts: ReturnType<
          typeof validateCaresLinkV1CleanedFacts
        >;
        try {
          assertPlainTree(facts);
          validatedFacts = validateCaresLinkV1CleanedFacts(
            authorization.noteType,
            facts,
          );
          const scan = scanCaresLinkV1CleanedFacts(validatedFacts);
          if (scan.cleanedFactsHash !== authorization.cleanedFactsHash) {
            throw unavailable("PAYLOAD_UNAVAILABLE");
          }
        } catch {
          throw unavailable("PAYLOAD_UNAVAILABLE");
        }
        return validatedFacts;
      },
    });

  return Object.freeze({ store, payload });
}

type ApprovedPolicyBinding = Readonly<{
  workerPolicy: CaresLinkV1NoteGenerationWorkerPolicy;
  providerPolicies: ReadonlyMap<
    CaresLinkV1NoteTypeCode,
    CaresLinkV1NoteProviderPolicySnapshot
  >;
}>;

function createApprovedPolicyBinding(
  workerPolicyValue: unknown,
  providerPolicyValues: unknown,
): ApprovedPolicyBinding {
  assertPlainTree(workerPolicyValue);
  assertPlainTree(providerPolicyValues);
  const workerPolicy = parseCaresLinkV1NoteGenerationWorkerPolicy(
    workerPolicyValue,
  );
  if (workerPolicy.status !== "APPROVED" || !Array.isArray(providerPolicyValues)) {
    throw unavailable("POLICY_MISMATCH");
  }
  const providerPolicies = new Map<
    CaresLinkV1NoteTypeCode,
    CaresLinkV1NoteProviderPolicySnapshot
  >();
  for (const value of providerPolicyValues) {
    assertPlainTree(value);
    let policy: CaresLinkV1NoteProviderPolicySnapshot;
    try {
      policy = validateCaresLinkV1NoteProviderPolicySnapshot(value);
    } catch {
      throw unavailable("POLICY_MISMATCH");
    }
    if (
      providerPolicies.has(policy.noteType) ||
      policy.timeoutMs !== workerPolicy.providerDeadlineMs
    ) {
      throw unavailable("POLICY_MISMATCH");
    }
    providerPolicies.set(policy.noteType, policy);
  }
  if (
    providerPolicies.size !== CARESLINK_V1_NOTE_TYPE_CODES.length ||
    CARESLINK_V1_NOTE_TYPE_CODES.some(
      (noteType) => !providerPolicies.has(noteType),
    )
  ) {
    throw unavailable("POLICY_MISMATCH");
  }
  return Object.freeze({
    workerPolicy,
    providerPolicies: providerPolicies as ReadonlyMap<
      CaresLinkV1NoteTypeCode,
      CaresLinkV1NoteProviderPolicySnapshot
    >,
  });
}

function assertRegistrationMatchesApproved(
  registration: CaresLinkV1NoteGenerationWorkerRegistration,
  approved: ApprovedPolicyBinding,
) {
  if (
    registration.workerPolicyVersion !== approved.workerPolicy.version ||
    registration.workerPolicyDigest !== approved.workerPolicy.digest ||
    registration.providerPolicies.length !== approved.providerPolicies.size ||
    registration.providerPolicies.some((binding) => {
      const policy = approved.providerPolicies.get(binding.noteType);
      return (
        !policy ||
        binding.policyVersion !== policy.policyVersion ||
        binding.policyDigest !== policy.policyDigest
      );
    })
  ) {
    throw unavailable("POLICY_MISMATCH");
  }
}

function approvedPolicyForClaim(
  claim: CaresLinkV1RegisteredWorkerClaim,
  approved: ApprovedPolicyBinding,
) {
  const policy = approved.providerPolicies.get(claim.job.noteType);
  if (
    !policy ||
    policy.policyVersion !== claim.job.providerPolicyVersion ||
    policy.policyDigest !== claim.job.providerPolicyDigest ||
    policy.serviceCode !== claim.job.serviceCode
  ) {
    throw unavailable("POLICY_MISMATCH");
  }
  return policy;
}

function registrationBinding(
  registrationValue: CaresLinkV1NoteGenerationWorkerRegistration,
  workerPolicyValue: CaresLinkV1NoteGenerationWorkerPolicy,
  approved: ApprovedPolicyBinding,
) {
  assertPlainTree(registrationValue);
  assertPlainTree(workerPolicyValue);
  const registration = validateCaresLinkV1NoteGenerationWorkerRegistration(
    registrationValue,
  );
  const workerPolicy = parseCaresLinkV1NoteGenerationWorkerPolicy(
    workerPolicyValue,
  );
  assertRegistrationMatchesApproved(registration, approved);
  if (
    workerPolicy.status !== "APPROVED" ||
    workerPolicy.digest !== approved.workerPolicy.digest ||
    registration.workerPolicyVersion !== workerPolicy.version ||
    registration.workerPolicyDigest !== workerPolicy.digest ||
    registration.contractVersion !== CARESLINK_V1_CONTRACT_VERSION ||
    registration.schemaVersion !== CARESLINK_V1_NOTE_SCHEMA_VERSION
  ) {
    throw unavailable("POLICY_MISMATCH");
  }
  return Object.freeze({
    registration,
    workerPolicy,
    args: Object.freeze({
      p_registration_digest: registration.registrationDigest,
      p_worker_policy_version: workerPolicy.version,
      p_worker_policy_digest: workerPolicy.digest,
    }),
  });
}

function prepareAttemptCall(input: Readonly<{
  claim: CaresLinkV1RegisteredWorkerClaim;
  registration: CaresLinkV1NoteGenerationWorkerRegistration;
  workerPolicy: CaresLinkV1NoteGenerationWorkerPolicy;
}>, approved: ApprovedPolicyBinding) {
  const binding = registrationBinding(
    input.registration,
    input.workerPolicy,
    approved,
  );
  const claim = sanitizeClaim(input.claim, binding.registration);
  return Object.freeze({
    claim,
    args: attemptArgs(claim, binding.registration, binding.workerPolicy),
  });
}

function attemptArgs(
  claim: CaresLinkV1RegisteredWorkerClaim,
  registration: CaresLinkV1NoteGenerationWorkerRegistration,
  workerPolicy?: CaresLinkV1NoteGenerationWorkerPolicy,
): AttemptArgs {
  if (workerPolicy && claim.job.workerPolicyDigest !== workerPolicy.digest) {
    throw unavailable("POLICY_MISMATCH");
  }
  return Object.freeze({
    p_job_id: claim.job.jobId,
    p_attempt_id: claim.attempt.attemptId,
    p_lease_token: claim.leaseToken,
    p_registration_digest: registration.registrationDigest,
    p_worker_policy_version: claim.job.workerPolicyVersion,
    p_worker_policy_digest: claim.job.workerPolicyDigest,
  });
}

function payloadArgs(input: Readonly<{
  jobId: string;
  payloadId: string;
  attemptId: string;
  leaseToken: string;
  registrationDigest: string;
  noteType: CaresLinkV1NoteTypeCode;
  contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
  schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
  cleanedFactsHash: string;
}>): PayloadAttemptArgs {
  if (
    !isRecord(input) ||
    input.contractVersion !== CARESLINK_V1_CONTRACT_VERSION ||
    input.schemaVersion !== CARESLINK_V1_NOTE_SCHEMA_VERSION
  ) {
    throw unavailable("PAYLOAD_UNAVAILABLE");
  }
  expectEnum(input.noteType, CARESLINK_V1_NOTE_TYPE_CODES, "payload Note type");
  expectSha256(input.cleanedFactsHash, "cleaned facts hash");
  return Object.freeze({
    p_job_id: expectUuid(input.jobId, "job ID"),
    p_payload_id: expectUuid(input.payloadId, "payload ID"),
    p_attempt_id: expectUuid(input.attemptId, "attempt ID"),
    p_lease_token: expectOpaque(input.leaseToken, "lease token"),
    p_registration_digest: expectSha256(
      input.registrationDigest,
      "registration digest",
    ),
  });
}

function sanitizeClaim(
  value: CaresLinkV1RegisteredWorkerClaim,
  registration: CaresLinkV1NoteGenerationWorkerRegistration,
): CaresLinkV1RegisteredWorkerClaim {
  const claim = exactObject(value, ["job", "attempt", "leaseToken"], "claim");
  const job = exactObject(
    claim.job,
    [
      "jobId",
      "payloadId",
      "noteType",
      "sourceLocale",
      "serviceCode",
      "contractVersion",
      "schemaVersion",
      "workerPolicyVersion",
      "workerPolicyDigest",
      "providerPolicyVersion",
      "providerPolicyDigest",
      "payloadPolicyVersion",
      "payloadPolicySnapshotHash",
      "cleanedFactsHash",
      "status",
    ],
    "claim job",
  );
  const attempt = exactObject(
    claim.attempt,
    [
      "attemptId",
      "ordinal",
      "status",
      "leaseTokenHash",
      "workerIdentityHash",
      "registrationDigest",
    ],
    "claim attempt",
  );
  const noteType = expectEnum(job.noteType, CARESLINK_V1_NOTE_TYPE_CODES, "note type");
  const sourceLocale = expectEnum(job.sourceLocale, CARESLINK_V1_LOCALES, "locale");
  const leaseToken = expectOpaque(claim.leaseToken, "lease token");
  const cleanedFactsHash = expectSha256(
    job.cleanedFactsHash,
    "cleaned facts hash",
  );
  const providerBinding = registration.providerPolicies.find(
    (entry) => entry.noteType === noteType,
  );
  if (
    job.status !== "RUNNING" ||
    attempt.status !== "RUNNING" ||
    job.contractVersion !== CARESLINK_V1_CONTRACT_VERSION ||
    job.schemaVersion !== CARESLINK_V1_NOTE_SCHEMA_VERSION ||
    job.workerPolicyVersion !== registration.workerPolicyVersion ||
    job.workerPolicyDigest !== registration.workerPolicyDigest ||
    job.payloadPolicyVersion !== registration.payloadPolicyVersion ||
    job.payloadPolicySnapshotHash !== registration.payloadPolicySnapshotHash ||
    !providerBinding ||
    job.providerPolicyVersion !== providerBinding.policyVersion ||
    job.providerPolicyDigest !== providerBinding.policyDigest ||
    job.serviceCode !== getCaresLinkV1NoteType(noteType).generationServiceCode ||
    attempt.workerIdentityHash !== registration.workerIdentityHash ||
    attempt.registrationDigest !== registration.registrationDigest ||
    expectSha256(attempt.leaseTokenHash, "lease token hash") !== sha256(leaseToken)
  ) {
    throw unavailable("POLICY_MISMATCH");
  }
  const ordinal = expectPositiveInteger(attempt.ordinal, "attempt ordinal");
  return Object.freeze({
    job: Object.freeze({
      jobId: expectUuid(job.jobId, "job ID"),
      payloadId: expectUuid(job.payloadId, "payload ID"),
      noteType,
      sourceLocale,
      serviceCode: job.serviceCode as CaresLinkV1RegisteredWorkerClaim["job"]["serviceCode"],
      contractVersion: CARESLINK_V1_CONTRACT_VERSION,
      schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
      workerPolicyVersion: registration.workerPolicyVersion,
      workerPolicyDigest: registration.workerPolicyDigest,
      providerPolicyVersion: providerBinding.policyVersion,
      providerPolicyDigest: providerBinding.policyDigest,
      payloadPolicyVersion: registration.payloadPolicyVersion,
      payloadPolicySnapshotHash: registration.payloadPolicySnapshotHash,
      cleanedFactsHash,
      status: "RUNNING",
    }),
    attempt: Object.freeze({
      attemptId: expectUuid(attempt.attemptId, "attempt ID"),
      ordinal,
      status: "RUNNING",
      leaseTokenHash: expectSha256(attempt.leaseTokenHash, "lease token hash"),
      workerIdentityHash: registration.workerIdentityHash,
      registrationDigest: registration.registrationDigest,
    }),
    leaseToken,
  });
}

async function callRpc<Name extends CaresLinkV1RegisteredWorkerAdapterRpcName>(
  client: CaresLinkV1RegisteredWorkerPrivilegedRpcClient,
  name: Name,
  args: CaresLinkV1RegisteredWorkerAdapterRpcArguments[Name],
  fallback: CaresLinkV1RegisteredWorkerSettleReason,
) {
  let result: CaresLinkV1RegisteredWorkerAdapterRpcResult;
  try {
    result = await client.rpc(name, args);
  } catch {
    throw unavailable(fallback);
  }
  const envelope = exactObject(result, ["data", "error"], "RPC result");
  if (envelope.error !== null) {
    throw mapRpcError(envelope.error, fallback);
  }
  if (envelope.data === null || envelope.data === undefined) {
    throw unavailable(fallback);
  }
  return envelope.data;
}

function mapRpcError(
  value: unknown,
  fallback: CaresLinkV1RegisteredWorkerSettleReason,
): Error {
  const error = isRecord(value) ? value : {};
  const message = typeof error.message === "string" ? error.message : "";
  const code = typeof error.code === "string" ? error.code : "";
  if (message === "AUTH_REQUIRED" || message === "SESSION_REVOKED") {
    return new CaresLinkV1ContractError(
      message,
      message === "AUTH_REQUIRED"
        ? "Authentication is required"
        : "The authenticated session is no longer active",
    );
  }
  if (
    message === "PRIVACY_REVIEW_REQUIRED" ||
    message === "PRIVACY_REVIEW_STALE"
  ) {
    return new CaresLinkV1ContractError(
      message,
      "The privacy review proof is unavailable or stale",
    );
  }
  if (message === "FORBIDDEN" || code === "42501") {
    return new CaresLinkV1ContractError(
      "FORBIDDEN",
      "The privileged worker operation is not authorized",
    );
  }
  if ((SETTLE_REASONS as readonly string[]).includes(message)) {
    return unavailable(message as CaresLinkV1RegisteredWorkerSettleReason);
  }
  if (code === "PGRST202") return unavailable("POLICY_MISMATCH");
  return unavailable(fallback);
}

function parseClaimEnvelope(
  value: unknown,
  registration: CaresLinkV1NoteGenerationWorkerRegistration,
  workerIdentityHash: string,
) {
  const record = exactObject(value, ["status", "claim"], "claim envelope");
  if (record.status === "IDLE" && record.claim === null) return undefined;
  if (record.status !== "CLAIMED") throw unavailable("INTERNAL_FAILURE");
  const claim = sanitizeClaim(
    record.claim as CaresLinkV1RegisteredWorkerClaim,
    registration,
  );
  if (claim.attempt.workerIdentityHash !== workerIdentityHash) {
    throw unavailable("POLICY_MISMATCH");
  }
  return claim;
}

function assertAttemptAck(
  value: unknown,
  expectedStatus: "RENEWED",
  claim: CaresLinkV1RegisteredWorkerClaim,
) {
  const record = exactObject(
    value,
    [
      "status",
      "jobReferenceHash",
      "attemptReferenceHash",
      "registrationDigest",
    ],
    "attempt acknowledgment",
  );
  if (
    record.status !== expectedStatus ||
    record.jobReferenceHash !== sha256(claim.job.jobId) ||
    record.attemptReferenceHash !== sha256(claim.attempt.attemptId) ||
    record.registrationDigest !== claim.attempt.registrationDigest
  ) {
    throw unavailable("LEASE_EXPIRED");
  }
}

function parseFence(value: unknown, claim: CaresLinkV1RegisteredWorkerClaim) {
  const record = exactObject(
    value,
    [
      "status",
      "fenceId",
      "fenceDigest",
      "expiresAt",
      "jobReferenceHash",
      "attemptReferenceHash",
      "registrationDigest",
    ],
    "attempt fence",
  );
  if (
    record.status !== "FENCED" ||
    record.jobReferenceHash !== sha256(claim.job.jobId) ||
    record.attemptReferenceHash !== sha256(claim.attempt.attemptId) ||
    record.registrationDigest !== claim.attempt.registrationDigest
  ) {
    throw unavailable("LEASE_EXPIRED");
  }
  return parseFenceValue(record);
}

function parseFenceValue(value: unknown) {
  const record = exactObjectWithOptionalKeys(
    value,
    ["fenceId", "fenceDigest", "expiresAt"],
    [
      "status",
      "jobReferenceHash",
      "attemptReferenceHash",
      "registrationDigest",
    ],
    "fence value",
  );
  return Object.freeze({
    fenceId: expectUuid(record.fenceId, "fence ID"),
    fenceDigest: expectSha256(record.fenceDigest, "fence digest"),
    expiresAt: expectServerTime(record.expiresAt, "fence expiry"),
  });
}

function parseAtomicCommit(
  value: unknown,
  claim: CaresLinkV1RegisteredWorkerClaim,
  expectedContentHash: string,
  expectedProviderEvidenceHash: string,
): CaresLinkV1RegisteredWorkerSuccess {
  const record = exactObject(
    value,
    [
      "transaction",
      "canonical",
      "syncReceipt",
      "mutationReceipt",
      "jobTerminal",
      "attemptTerminal",
      "payloadMetadata",
      "purgeOutboxAcknowledgment",
    ],
    "atomic success",
  );
  const transaction = exactObject(
    record.transaction,
    [
      "transactionId",
      "status",
      "atomic",
      "committedAt",
      "registrationDigest",
    ],
    "transaction declaration",
  );
  const transactionId = expectUuid(
    transaction.transactionId,
    "transaction ID",
  );
  const committedAt = expectServerTime(
    transaction.committedAt,
    "transaction commit time",
  );
  if (
    transaction.status !== "COMMITTED" ||
    transaction.atomic !== true ||
    transaction.registrationDigest !== claim.attempt.registrationDigest
  ) {
    throw unavailable("INTERNAL_FAILURE");
  }
  const canonical = parseSuccess(record.canonical, expectedContentHash);
  const sync = exactObject(
    record.syncReceipt,
    [
      "transactionId",
      "status",
      "kind",
      "changeId",
      "canonicalId",
      "revisionId",
      "contentHash",
      "serverTime",
    ],
    "sync receipt",
  );
  const mutation = exactObject(
    record.mutationReceipt,
    [
      "transactionId",
      "status",
      "mutationReferenceHash",
      "mutationKind",
      "canonicalId",
      "revisionId",
      "contentHash",
      "serverTime",
    ],
    "mutation receipt",
  );
  const jobTerminal = exactObject(
    record.jobTerminal,
    [
      "transactionId",
      "status",
      "jobReferenceHash",
      "canonicalId",
      "revisionId",
      "contentHash",
      "finishedAt",
    ],
    "job terminal",
  );
  const attemptTerminal = exactObject(
    record.attemptTerminal,
    [
      "transactionId",
      "status",
      "attemptReferenceHash",
      "contentHash",
      "providerEvidenceHash",
      "finishedAt",
    ],
    "attempt terminal",
  );
  const payloadMetadata = exactObject(
    record.payloadMetadata,
    [
      "transactionId",
      "state",
      "payloadDisposition",
      "revokeReason",
      "payloadReferenceHash",
      "revokedAt",
    ],
    "payload metadata",
  );
  const purgeOutbox = exactObject(
    record.purgeOutboxAcknowledgment,
    [
      "transactionId",
      "status",
      "reason",
      "payloadReferenceHash",
      "eventReferenceHash",
      "enqueuedAt",
    ],
    "purge outbox acknowledgment",
  );
  const serverTime = expectServerTime(sync.serverTime, "sync server time");
  const mutationReferenceHash = sha256(
    stringifyCaresLinkV1CanonicalJson({
      kind: "careslink.v1.note-generation-mutation",
      jobId: claim.job.jobId,
      attemptId: claim.attempt.attemptId,
      registrationDigest: claim.attempt.registrationDigest,
    }),
  );
  if (
    sync.transactionId !== transactionId ||
    sync.status !== "APPENDED" ||
    sync.kind !== "DOCUMENT_UPSERTED" ||
    !isPositiveDecimal(sync.changeId) ||
    sync.canonicalId !== canonical.canonicalId ||
    sync.revisionId !== canonical.revisionId ||
    sync.contentHash !== canonical.contentHash ||
    mutation.transactionId !== transactionId ||
    mutation.status !== CARESLINK_V1_SERVER_SAVE_ACK ||
    mutation.mutationReferenceHash !== mutationReferenceHash ||
    mutation.mutationKind !== "CREATE_DOCUMENT" ||
    mutation.canonicalId !== canonical.canonicalId ||
    mutation.revisionId !== canonical.revisionId ||
    mutation.contentHash !== canonical.contentHash ||
    mutation.serverTime !== serverTime ||
    jobTerminal.transactionId !== transactionId ||
    jobTerminal.status !== "SUCCEEDED" ||
    jobTerminal.jobReferenceHash !== sha256(claim.job.jobId) ||
    jobTerminal.canonicalId !== canonical.canonicalId ||
    jobTerminal.revisionId !== canonical.revisionId ||
    jobTerminal.contentHash !== canonical.contentHash ||
    jobTerminal.finishedAt !== committedAt ||
    attemptTerminal.transactionId !== transactionId ||
    attemptTerminal.status !== "SUCCEEDED" ||
    attemptTerminal.attemptReferenceHash !==
      sha256(claim.attempt.attemptId) ||
    attemptTerminal.contentHash !== canonical.contentHash ||
    attemptTerminal.providerEvidenceHash !== expectedProviderEvidenceHash ||
    attemptTerminal.finishedAt !== committedAt ||
    payloadMetadata.transactionId !== transactionId ||
    payloadMetadata.state !== "REVOKED" ||
    payloadMetadata.payloadDisposition !== "REVOKED_PURGE_ENQUEUED" ||
    payloadMetadata.revokeReason !== "SUCCEEDED" ||
    payloadMetadata.payloadReferenceHash !== sha256(claim.job.payloadId) ||
    payloadMetadata.revokedAt !== committedAt ||
    purgeOutbox.transactionId !== transactionId ||
    purgeOutbox.status !== "ENQUEUED" ||
    purgeOutbox.reason !== "SUCCEEDED" ||
    purgeOutbox.payloadReferenceHash !== sha256(claim.job.payloadId) ||
    !SHA256.test(
      typeof purgeOutbox.eventReferenceHash === "string"
        ? purgeOutbox.eventReferenceHash
        : "",
    ) ||
    purgeOutbox.enqueuedAt !== committedAt ||
    serverTime !== committedAt
  ) {
    throw unavailable("INTERNAL_FAILURE");
  }
  return canonical;
}

function parseSuccess(value: unknown, expectedContentHash: string) {
  const record = exactObject(
    value,
    [
      "canonicalId",
      "revisionId",
      "contentHash",
      "revisionNumber",
      "baseRevisionId",
    ],
    "canonical success",
  );
  const result = Object.freeze({
    canonicalId: expectUuid(record.canonicalId, "canonical ID"),
    revisionId: expectUuid(record.revisionId, "revision ID"),
    contentHash: expectSha256(record.contentHash, "content hash"),
    revisionNumber: record.revisionNumber,
    baseRevisionId: record.baseRevisionId,
  });
  if (
    result.contentHash !== expectedContentHash ||
    result.revisionNumber !== 1 ||
    result.baseRevisionId !== null
  ) {
    throw unavailable("INTERNAL_FAILURE");
  }
  return result as CaresLinkV1RegisteredWorkerSuccess;
}

function parseSettlement(value: unknown): CaresLinkV1RegisteredWorkerFailureSettlement {
  const record = exactObject(
    value,
    [
      "disposition",
      "reason",
      "payloadDisposition",
      "baseDelayMs",
      "jitterMs",
      "retryDelayMs",
    ],
    "failure settlement",
  );
  const disposition = expectEnum(
    record.disposition,
    ["RETRY_SCHEDULED", "FAILED", "CANCELLED"] as const,
    "settlement disposition",
  );
  const settlement = Object.freeze({
    disposition,
    reason: expectEnum(record.reason, SETTLE_REASONS, "settlement reason"),
    payloadDisposition: expectEnum(
      record.payloadDisposition,
      ["RETAINED_FOR_RETRY", "REVOKED_PURGE_ENQUEUED"] as const,
      "payload disposition",
    ),
    baseDelayMs: nullableNonnegativeInteger(record.baseDelayMs, "base delay"),
    jitterMs: nullableNonnegativeInteger(record.jitterMs, "retry jitter"),
    retryDelayMs: nullableNonnegativeInteger(record.retryDelayMs, "retry delay"),
  });
  if (disposition === "RETRY_SCHEDULED") {
    if (
      settlement.payloadDisposition !== "RETAINED_FOR_RETRY" ||
      settlement.baseDelayMs === null ||
      settlement.jitterMs === null ||
      settlement.retryDelayMs === null ||
      settlement.baseDelayMs + settlement.jitterMs !== settlement.retryDelayMs ||
      settlement.reason === "CANCELLED"
    ) {
      throw unavailable("INTERNAL_FAILURE");
    }
  } else if (
    settlement.payloadDisposition !== "REVOKED_PURGE_ENQUEUED" ||
    settlement.baseDelayMs !== null ||
    settlement.jitterMs !== null ||
    settlement.retryDelayMs !== null ||
    (disposition === "CANCELLED") !== (settlement.reason === "CANCELLED")
  ) {
    throw unavailable("INTERNAL_FAILURE");
  }
  return settlement;
}

function parseAtomicSettlement(
  value: unknown,
  claim: CaresLinkV1RegisteredWorkerClaim,
  approved: ApprovedPolicyBinding,
  expectedReason?: CaresLinkV1RegisteredWorkerSettleReason,
  expectedProviderEvidenceHash?: string | null,
): CaresLinkV1RegisteredWorkerFailureSettlement {
  const record = exactObject(
    value,
    [
      "transaction",
      "settlement",
      "jobTransition",
      "attemptTerminal",
      "payloadMetadata",
      "purgeOutboxAcknowledgment",
    ],
    "atomic failure settlement",
  );
  const transaction = exactObject(
    record.transaction,
    [
      "transactionId",
      "status",
      "atomic",
      "committedAt",
      "registrationDigest",
    ],
    "settlement transaction declaration",
  );
  const transactionId = expectUuid(transaction.transactionId, "transaction ID");
  const committedAt = expectServerTime(
    transaction.committedAt,
    "transaction commit time",
  );
  if (
    transaction.status !== "COMMITTED" ||
    transaction.atomic !== true ||
    transaction.registrationDigest !== claim.attempt.registrationDigest
  ) {
    throw unavailable("INTERNAL_FAILURE");
  }
  const settlement = parseSettlement(record.settlement);
  assertSettlementMatchesPolicy(
    settlement,
    claim.attempt.ordinal,
    approved.workerPolicy,
  );
  if (expectedReason !== undefined && settlement.reason !== expectedReason) {
    throw unavailable("INTERNAL_FAILURE");
  }
  const job = exactObject(
    record.jobTransition,
    [
      "transactionId",
      "status",
      "jobReferenceHash",
      "nextEligibleAt",
      "finishedAt",
    ],
    "job settlement transition",
  );
  const attempt = exactObject(
    record.attemptTerminal,
    [
      "transactionId",
      "status",
      "attemptReferenceHash",
      "reason",
      "providerEvidenceHash",
      "finishedAt",
    ],
    "attempt settlement terminal",
  );
  const payload = exactObject(
    record.payloadMetadata,
    [
      "transactionId",
      "state",
      "payloadDisposition",
      "revokeReason",
      "payloadReferenceHash",
      "revokedAt",
    ],
    "settlement payload metadata",
  );
  const expectedAttemptStatus =
    settlement.disposition === "CANCELLED"
      ? "CANCELLED"
      : settlement.reason === "LEASE_EXPIRED"
        ? "LEASE_EXPIRED"
        : "FAILED";
  if (
    job.transactionId !== transactionId ||
    job.jobReferenceHash !== sha256(claim.job.jobId) ||
    attempt.transactionId !== transactionId ||
    attempt.status !== expectedAttemptStatus ||
    attempt.attemptReferenceHash !== sha256(claim.attempt.attemptId) ||
    attempt.reason !== settlement.reason ||
    attempt.providerEvidenceHash !== expectedProviderEvidenceHash ||
    attempt.finishedAt !== committedAt ||
    payload.transactionId !== transactionId ||
    payload.payloadReferenceHash !== sha256(claim.job.payloadId)
  ) {
    throw unavailable("INTERNAL_FAILURE");
  }
  if (settlement.disposition === "RETRY_SCHEDULED") {
    const nextEligibleAt = expectServerTime(
      job.nextEligibleAt,
      "next eligible time",
    );
    if (
      job.status !== "QUEUED" ||
      job.finishedAt !== null ||
      Date.parse(nextEligibleAt) - Date.parse(committedAt) !==
        settlement.retryDelayMs ||
      payload.state !== "AVAILABLE" ||
      payload.payloadDisposition !== "RETAINED_FOR_RETRY" ||
      payload.revokeReason !== null ||
      payload.revokedAt !== null ||
      record.purgeOutboxAcknowledgment !== null
    ) {
      throw unavailable("INTERNAL_FAILURE");
    }
  } else {
    const purgeOutbox = parseTerminalPurgeOutbox(
      record.purgeOutboxAcknowledgment,
      transactionId,
      committedAt,
      claim.job.payloadId,
      settlement.disposition,
    );
    void purgeOutbox;
    if (
      job.status !== settlement.disposition ||
      job.nextEligibleAt !== null ||
      job.finishedAt !== committedAt ||
      payload.state !== "REVOKED" ||
      payload.payloadDisposition !== "REVOKED_PURGE_ENQUEUED" ||
      payload.revokeReason !== settlement.disposition ||
      payload.revokedAt !== committedAt
    ) {
      throw unavailable("INTERNAL_FAILURE");
    }
  }
  return settlement;
}

function assertSettlementMatchesPolicy(
  settlement: CaresLinkV1RegisteredWorkerFailureSettlement,
  ordinal: number,
  policy: CaresLinkV1NoteGenerationWorkerPolicy,
) {
  const retryAllowed =
    ([
      "LEASE_EXPIRED",
      "PROVIDER_TIMEOUT",
      "PROVIDER_TRANSIENT",
    ] as readonly string[]).includes(settlement.reason) &&
    (policy.retryableOutcomes as readonly string[]).includes(
      settlement.reason,
    ) &&
    ordinal < policy.maxAttempts;
  const baseDelayMs = retryAllowed
    ? policy.retryDelayMsAfterAttempt[ordinal - 1]
    : null;
  const validJitter =
    retryAllowed &&
    settlement.jitterMs !== null &&
    (policy.jitter.mode === "NONE"
      ? settlement.jitterMs === 0
      : settlement.jitterMs <= policy.jitter.maxMs);
  if (
    (settlement.disposition === "RETRY_SCHEDULED") !== retryAllowed ||
    (retryAllowed
      ? settlement.baseDelayMs !== baseDelayMs ||
        !validJitter ||
        settlement.retryDelayMs !==
          (baseDelayMs as number) + (settlement.jitterMs as number)
      : settlement.baseDelayMs !== null ||
        settlement.jitterMs !== null ||
        settlement.retryDelayMs !== null)
  ) {
    throw unavailable("POLICY_MISMATCH");
  }
}

function parseTerminalPurgeOutbox(
  value: unknown,
  transactionId: string,
  committedAt: string,
  payloadId: string,
  reason: "FAILED" | "CANCELLED",
) {
  const record = exactObject(
    value,
    [
      "transactionId",
      "status",
      "reason",
      "payloadReferenceHash",
      "eventReferenceHash",
      "enqueuedAt",
    ],
    "settlement purge outbox acknowledgment",
  );
  if (
    record.transactionId !== transactionId ||
    record.status !== "ENQUEUED" ||
    record.reason !== reason ||
    record.payloadReferenceHash !== sha256(payloadId) ||
    !isSha256(record.eventReferenceHash) ||
    record.enqueuedAt !== committedAt
  ) {
    throw unavailable("INTERNAL_FAILURE");
  }
  return record;
}

function parsePersistedOutcome(
  value: unknown,
  claim: CaresLinkV1RegisteredWorkerClaim,
  expectedContentHash: string | null,
  expectedProviderEvidenceHash: string | null,
  approved: ApprovedPolicyBinding,
): CaresLinkV1RegisteredWorkerPersistedOutcome {
  const record = recordWithStatus(value, "persisted outcome");
  if (record.status === "RUNNING") {
    exactKeys(record, ["status"], "running outcome");
    return Object.freeze({ status: "RUNNING" });
  }
  if (record.status === "SUCCEEDED") {
    exactKeys(record, ["status", "atomicSuccess"], "success outcome");
    if (!expectedContentHash || !expectedProviderEvidenceHash) {
      throw unavailable("INTERNAL_FAILURE");
    }
    return Object.freeze({
      status: "SUCCEEDED",
      result: parseAtomicCommit(
        record.atomicSuccess,
        claim,
        expectedContentHash,
        expectedProviderEvidenceHash,
      ),
    });
  }
  if (
    record.status === "RETRY_SCHEDULED" ||
    record.status === "FAILED" ||
    record.status === "CANCELLED"
  ) {
    exactKeys(record, ["status", "atomicSettlement"], "settled outcome");
    const settlement = parseAtomicSettlement(
      record.atomicSettlement,
      claim,
      approved,
      undefined,
      expectedProviderEvidenceHash,
    );
    if (settlement.disposition !== record.status) {
      throw unavailable("INTERNAL_FAILURE");
    }
    return Object.freeze({ status: record.status, settlement });
  }
  throw unavailable("INTERNAL_FAILURE");
}

function parseRecovery(value: unknown): CaresLinkV1RegisteredWorkerRecoverySummary {
  const record = exactObject(
    value,
    ["recovered", "requeued", "failed"],
    "recovery summary",
  );
  const result = Object.freeze({
    recovered: expectNonnegativeInteger(record.recovered, "recovered count"),
    requeued: expectNonnegativeInteger(record.requeued, "requeued count"),
    failed: expectNonnegativeInteger(record.failed, "failed count"),
  });
  if (result.recovered !== result.requeued + result.failed) {
    throw unavailable("INTERNAL_FAILURE");
  }
  return result;
}

/**
 * Authority failures must be committed by the database before they surface as
 * worker errors. Raising from inside the RPC would roll the terminal mutation
 * back and could leave a RUNNING attempt after a worker crash.
 */
function throwIfPayloadDeniedAndSettled(
  value: unknown,
  input: Readonly<{
    jobId: string;
    payloadId: string;
    attemptId: string;
    registrationDigest: string;
  }>,
): void {
  const valueWithStatus = recordWithStatus(value, "payload authorization");
  if (valueWithStatus.status !== "DENIED_SETTLED") return;
  const record = exactObject(
    valueWithStatus,
    [
      "status",
      "transactionId",
      "transactionStatus",
      "atomic",
      "committedAt",
      "registrationDigest",
      "reason",
      "jobReferenceHash",
      "attemptReferenceHash",
      "payloadReferenceHash",
      "jobStatus",
      "attemptStatus",
      "payloadState",
      "payloadDisposition",
      "purgeEventReferenceHash",
    ],
    "settled payload denial",
  );
  expectUuid(record.transactionId, "transaction ID");
  expectServerTime(record.committedAt, "transaction commit time");
  const reason = expectEnum(
    record.reason,
    PAYLOAD_DENIAL_REASONS,
    "payload denial reason",
  );
  if (
    record.transactionStatus !== "COMMITTED" ||
    record.atomic !== true ||
    record.registrationDigest !== input.registrationDigest ||
    record.jobReferenceHash !== sha256(input.jobId) ||
    record.attemptReferenceHash !== sha256(input.attemptId) ||
    record.payloadReferenceHash !== sha256(input.payloadId) ||
    record.jobStatus !== "FAILED" ||
    record.attemptStatus !== "FAILED" ||
    record.payloadState !== "REVOKED" ||
    record.payloadDisposition !== "REVOKED_PURGE_ENQUEUED" ||
    !isSha256(record.purgeEventReferenceHash)
  ) {
    throw unavailable("INTERNAL_FAILURE");
  }
  throw unavailable(reason);
}

function parsePayloadGrant(
  value: unknown,
  input: Readonly<{
    jobId: string;
    payloadId: string;
    attemptId: string;
    registrationDigest: string;
    noteType: CaresLinkV1NoteTypeCode;
    contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
    schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
    cleanedFactsHash: string;
  }>,
) {
  const record = exactObject(
    value,
    [
      "status",
      "grantId",
      "expiresAt",
      "jobReferenceHash",
      "attemptReferenceHash",
      "payloadReferenceHash",
      "registrationDigest",
    ],
    "payload grant",
  );
  if (
    record.status !== "AUTHORIZED" ||
    record.jobReferenceHash !== sha256(input.jobId) ||
    record.attemptReferenceHash !== sha256(input.attemptId) ||
    record.payloadReferenceHash !== sha256(input.payloadId) ||
    record.registrationDigest !== input.registrationDigest
  ) {
    throw unavailable("PAYLOAD_UNAVAILABLE");
  }
  return Object.freeze({
    grantId: expectUuid(record.grantId, "grant ID"),
    expiresAt: expectServerTime(record.expiresAt, "grant expiry"),
  });
}

function parseVaultAuthorization(
  value: unknown,
  input: Readonly<{
    grantId: string;
    jobId: string;
    payloadId: string;
    attemptId: string;
    registrationDigest: string;
    noteType: CaresLinkV1NoteTypeCode;
    contractVersion: typeof CARESLINK_V1_CONTRACT_VERSION;
    schemaVersion: typeof CARESLINK_V1_NOTE_SCHEMA_VERSION;
    cleanedFactsHash: string;
  }>,
) {
  const record = exactObject(
    value,
    [
      "status",
      "vaultGrant",
      "expiresAt",
      "grantReferenceHash",
      "jobReferenceHash",
      "attemptReferenceHash",
      "payloadReferenceHash",
      "registrationDigest",
      "noteType",
      "contractVersion",
      "schemaVersion",
      "cleanedFactsHash",
    ],
    "vault authorization",
  );
  if (
    record.status !== "CONSUME_AUTHORIZED" ||
    record.grantReferenceHash !== sha256(input.grantId) ||
    record.jobReferenceHash !== sha256(input.jobId) ||
    record.attemptReferenceHash !== sha256(input.attemptId) ||
    record.payloadReferenceHash !== sha256(input.payloadId) ||
    record.registrationDigest !== input.registrationDigest ||
    record.noteType !== input.noteType ||
    record.contractVersion !== input.contractVersion ||
    record.schemaVersion !== input.schemaVersion ||
    record.cleanedFactsHash !== input.cleanedFactsHash
  ) {
    throw unavailable("PAYLOAD_UNAVAILABLE");
  }
  return Object.freeze({
    vaultGrant: expectOpaque(record.vaultGrant, "vault grant"),
    expiresAt: expectServerTime(record.expiresAt, "vault grant expiry"),
    noteType: expectEnum(
      record.noteType,
      CARESLINK_V1_NOTE_TYPE_CODES,
      "payload Note type",
    ),
    cleanedFactsHash: expectSha256(
      record.cleanedFactsHash,
      "cleaned facts hash",
    ),
  });
}

function rebuildCanonicalContent(
  value: unknown,
  noteType: CaresLinkV1NoteTypeCode,
): CaresLinkV1NoteContent {
  assertPlainTree(value);
  const supplied = exactObject(
    canonicalClone(value),
    [
      "englishDraft",
      "reviewVersions",
      "factsSummary",
      "missingFacts",
      "neutralWordingChecks",
      "followUpPrompts",
      "disclaimer",
    ],
    "canonical Note content",
  );
  let rebuilt: ReturnType<typeof buildCaresLinkV1CanonicalNoteContent>;
  try {
    rebuilt = buildCaresLinkV1CanonicalNoteContent(
      noteType,
      supplied.factsSummary,
      providerCandidateFromContent(supplied),
    );
  } catch {
    throw unavailable("INTERNAL_FAILURE");
  }
  if (
    stringifyCaresLinkV1CanonicalJson(rebuilt.content) !==
    stringifyCaresLinkV1CanonicalJson(supplied)
  ) {
    throw unavailable("INTERNAL_FAILURE");
  }
  return rebuilt.content;
}

function providerCandidateFromContent(value: Readonly<Record<string, unknown>>) {
  return Object.freeze({
    englishDraft: value.englishDraft,
    reviewVersions: value.reviewVersions,
    missingFacts: value.missingFacts,
    neutralWordingChecks: value.neutralWordingChecks,
    followUpPrompts: value.followUpPrompts,
  });
}

function parseContentFreeEvidence(
  value: unknown,
  claim: CaresLinkV1RegisteredWorkerClaim,
  policy: CaresLinkV1NoteProviderPolicySnapshot,
  workerPolicy: CaresLinkV1NoteGenerationWorkerPolicy,
  candidate?: unknown,
): CaresLinkV1NoteProviderAttemptEvidence {
  assertPlainTree(value);
  const record = exactObject(
    canonicalClone(value),
    EVIDENCE_KEYS,
    "provider evidence",
  );
  rejectSensitiveEvidenceKeys(record);
  const startedAt = expectServerTime(record.startedAt, "provider start time");
  const deadlineAt = expectServerTime(record.deadlineAt, "provider deadline");
  const finishedAt = expectServerTime(record.finishedAt, "provider finish time");
  const durationMs = expectNonnegativeInteger(
    record.durationMs,
    "provider duration",
  );
  const finishReason = expectEnum(
    record.finishReason,
    CARESLINK_V1_NOTE_PROVIDER_FINISH_REASONS,
    "provider finish reason",
  );
  if (
    policy.noteType !== claim.job.noteType ||
    policy.policyDigest !== claim.job.providerPolicyDigest ||
    policy.policyVersion !== claim.job.providerPolicyVersion ||
    workerPolicy.status !== "APPROVED" ||
    workerPolicy.digest !== claim.job.workerPolicyDigest ||
    policy.timeoutMs !== workerPolicy.providerDeadlineMs ||
    record.policyDigest !== policy.policyDigest ||
    record.providerId !== policy.providerId ||
    record.modelId !== policy.modelId ||
    record.modelRevision !== policy.modelRevision ||
    record.modelRevisionAvailability !== policy.modelRevisionAvailability ||
    record.policyVersion !== policy.policyVersion ||
    record.promptTemplateVersion !== policy.promptTemplateVersion ||
    record.goldenSetVersion !== policy.goldenSetVersion ||
    record.parserVersion !== policy.parserVersion ||
    record.serviceCode !== policy.serviceCode ||
    record.rateCatalogVersion !== policy.rateCatalogVersion ||
    record.timeoutMs !== policy.timeoutMs ||
    record.workerPolicyDigest !== workerPolicy.digest ||
    Date.parse(deadlineAt) - Date.parse(startedAt) !== policy.timeoutMs ||
    Date.parse(finishedAt) - Date.parse(startedAt) !== durationMs ||
    durationMs > policy.timeoutMs ||
    Date.parse(finishedAt) > Date.parse(deadlineAt)
  ) {
    throw unavailable("POLICY_MISMATCH");
  }
  const providerRequestIdHash =
    record.providerRequestIdHash === null
      ? null
      : expectSha256(record.providerRequestIdHash, "provider request hash");
  const candidateDigest = expectSha256(
    record.candidateDigest,
    "candidate digest",
  );
  parseProviderUsage(record.usage);
  parseProviderCost(record.cost);
  if (candidate !== undefined) {
    try {
      return validateCaresLinkV1NoteProviderAttemptEvidence(record, {
        policySnapshot: policy,
        workerPolicyBinding: {
          providerPolicyDigest: policy.policyDigest,
          workerPolicyDigest: workerPolicy.digest,
          providerDeadlineMs: workerPolicy.providerDeadlineMs,
          startedAt,
          deadlineAt:
            deadlineAt as CaresLinkV1NoteProviderAttemptEvidence["deadlineAt"],
        },
        workerPolicy,
        candidate,
      });
    } catch {
      throw unavailable("INTERNAL_FAILURE");
    }
  }
  return Object.freeze({
    policyDigest: policy.policyDigest,
    providerId: policy.providerId,
    modelId: policy.modelId,
    modelRevision: policy.modelRevision,
    modelRevisionAvailability: policy.modelRevisionAvailability,
    policyVersion: policy.policyVersion,
    promptTemplateVersion: policy.promptTemplateVersion,
    goldenSetVersion: policy.goldenSetVersion,
    parserVersion: policy.parserVersion,
    serviceCode: policy.serviceCode,
    rateCatalogVersion: policy.rateCatalogVersion,
    timeoutMs: policy.timeoutMs,
    workerPolicyDigest: workerPolicy.digest,
    deadlineAt: deadlineAt as CaresLinkV1NoteProviderAttemptEvidence["deadlineAt"],
    startedAt,
    finishedAt,
    durationMs,
    finishReason,
    providerRequestIdHash,
    usage: parseProviderUsage(record.usage),
    cost: parseProviderCost(record.cost),
    candidateDigest,
  });
}

function parseProviderUsage(value: unknown) {
  const record = isRecord(value) ? value : unavailableRecord();
  if (record.status === "UNAVAILABLE") {
    exactKeys(record, ["status", "source"], "unavailable provider usage");
    if (record.source !== "UNAVAILABLE") throw unavailable("INTERNAL_FAILURE");
    return Object.freeze({ status: "UNAVAILABLE", source: "UNAVAILABLE" } as const);
  }
  if (record.status !== "REPORTED") throw unavailable("INTERNAL_FAILURE");
  const allowed = [
    "status",
    "source",
    "inputTokens",
    "outputTokens",
    "totalTokens",
    "cachedInputTokens",
    "reasoningTokens",
  ] as const;
  if (Object.keys(record).some((key) => !allowed.includes(key as never))) {
    throw unavailable("INTERNAL_FAILURE");
  }
  const source = expectEnum(
    record.source,
    CARESLINK_V1_NOTE_PROVIDER_USAGE_SOURCES,
    "provider usage source",
  );
  const counts: Record<string, number> = {};
  for (const key of allowed.slice(2)) {
    if (Object.hasOwn(record, key)) {
      counts[key] = expectNonnegativeInteger(record[key], "provider token count");
    }
  }
  if (
    Object.keys(counts).length === 0 ||
    (counts.totalTokens !== undefined &&
      ((counts.inputTokens !== undefined &&
        counts.totalTokens < counts.inputTokens) ||
        (counts.outputTokens !== undefined &&
          counts.totalTokens < counts.outputTokens) ||
        (counts.inputTokens !== undefined &&
          counts.outputTokens !== undefined &&
          counts.totalTokens < counts.inputTokens + counts.outputTokens)))
  ) {
    throw unavailable("INTERNAL_FAILURE");
  }
  return Object.freeze({ status: "REPORTED" as const, source, ...counts });
}

function parseProviderCost(value: unknown) {
  const record = isRecord(value) ? value : unavailableRecord();
  if (record.status === "UNAVAILABLE") {
    exactKeys(record, ["status", "source"], "unavailable provider cost");
    if (record.source !== "UNAVAILABLE") throw unavailable("INTERNAL_FAILURE");
    return Object.freeze({ status: "UNAVAILABLE", source: "UNAVAILABLE" } as const);
  }
  const status = expectEnum(
    record.status,
    ["REPORTED", "CALCULATED"] as const,
    "provider cost status",
  );
  exactKeys(
    record,
    ["status", "source", "currency", "decimalAmount", "pricingVersion"],
    "provider cost",
  );
  const source = expectEnum(
    record.source,
    CARESLINK_V1_NOTE_PROVIDER_COST_SOURCES,
    "provider cost source",
  );
  if (
    (status === "CALCULATED") !== (source === "SERVER_PRICING_CATALOG") ||
    typeof record.currency !== "string" ||
    !/^[A-Z]{3}$/.test(record.currency) ||
    typeof record.decimalAmount !== "string" ||
    record.decimalAmount.length > 64 ||
    !/^(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/.test(record.decimalAmount)
  ) {
    throw unavailable("INTERNAL_FAILURE");
  }
  return Object.freeze({
    status,
    source,
    currency: record.currency,
    decimalAmount: record.decimalAmount,
    pricingVersion: expectSafeIdentifier(
      record.pricingVersion,
      "provider pricing version",
    ),
  });
}

function unavailableRecord(): never {
  throw unavailable("INTERNAL_FAILURE");
}

function rejectSensitiveEvidenceKeys(value: unknown, path = "evidence") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      rejectSensitiveEvidenceKeys(entry, `${path}[${index}]`),
    );
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    const allowed =
      key === "promptTemplateVersion" ||
      key.endsWith("Tokens") ||
      key === "providerRequestIdHash";
    if (
      !allowed &&
      /(prompt|facts|output|access|authorization|refresh|owner|session|proof|lease|vault|secret|error)/i.test(
        key,
      )
    ) {
      throw unavailable("INTERNAL_FAILURE");
    }
    rejectSensitiveEvidenceKeys(nested, `${path}.${key}`);
  }
}

function recordWithStatus(value: unknown, label: string) {
  void label;
  if (!isRecord(value) || typeof value.status !== "string") {
    throw unavailable("INTERNAL_FAILURE");
  }
  return value;
}

function exactObject<const Key extends string>(
  value: unknown,
  keys: readonly Key[],
  label: string,
): Record<Key, unknown> {
  if (!isRecord(value)) throw unavailable("INTERNAL_FAILURE");
  exactKeys(value, keys, label);
  return value as Record<Key, unknown>;
}

function exactObjectWithOptionalKeys<const Required extends string>(
  value: unknown,
  required: readonly Required[],
  optional: readonly string[],
  label: string,
) {
  void label;
  if (!isRecord(value)) throw unavailable("INTERNAL_FAILURE");
  const actual = Object.keys(value);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    actual.some((key) => !required.includes(key as Required) && !optional.includes(key))
  ) {
    throw unavailable("INTERNAL_FAILURE");
  }
  return value as Record<Required, unknown> & Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  _label: string,
) {
  void _label;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw unavailable("INTERNAL_FAILURE");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertPlainTree(value: unknown, seen = new Set<object>()): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return;
  }
  if (typeof value !== "object" || seen.has(value)) {
    throw unavailable("INTERNAL_FAILURE");
  }
  seen.add(value);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw unavailable("INTERNAL_FAILURE");
    }
    value.forEach((entry) => assertPlainTree(entry, seen));
    return;
  }
  if (!isRecord(value) || Object.getOwnPropertySymbols(value).length > 0) {
    throw unavailable("INTERNAL_FAILURE");
  }
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (
      !descriptor.enumerable ||
      !("value" in descriptor) ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      throw unavailable("INTERNAL_FAILURE");
    }
    assertPlainTree(descriptor.value, seen);
  }
}

function expectUuid(value: unknown, _label: string) {
  void _label;
  if (typeof value !== "string" || !UUID.test(value)) {
    throw unavailable("INTERNAL_FAILURE");
  }
  return value.toLowerCase();
}

function expectSha256(value: unknown, _label: string) {
  void _label;
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw unavailable("INTERNAL_FAILURE");
  }
  return value;
}

function expectOpaque(value: unknown, _label: string) {
  void _label;
  if (
    typeof value !== "string" ||
    value.length < 16 ||
    value.length > 512 ||
    /\s/.test(value) ||
    /^(?:https?:|file:|data:|Bearer\s)/i.test(value)
  ) {
    throw unavailable("INTERNAL_FAILURE");
  }
  return value;
}

function expectServerTime(value: unknown, _label: string) {
  void _label;
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (
    typeof value !== "string" ||
    !SERVER_TIME.test(value) ||
    !Number.isFinite(parsed) ||
    new Date(parsed).toISOString() !== value
  ) {
    throw unavailable("INTERNAL_FAILURE");
  }
  return value;
}

function expectSafeIdentifier(value: unknown, _label: string) {
  void _label;
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value)
  ) {
    throw unavailable("INTERNAL_FAILURE");
  }
  return value;
}

function expectPositiveInteger(value: unknown, _label: string) {
  void _label;
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw unavailable("INTERNAL_FAILURE");
  }
  return value as number;
}

function expectNonnegativeInteger(value: unknown, _label: string) {
  void _label;
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw unavailable("INTERNAL_FAILURE");
  }
  return value as number;
}

function nullableNonnegativeInteger(value: unknown, label: string) {
  return value === null ? null : expectNonnegativeInteger(value, label);
}

function expectEnum<const Value extends string>(
  value: unknown,
  allowed: readonly Value[],
  _label: string,
): Value {
  void _label;
  if (typeof value !== "string" || !allowed.includes(value as Value)) {
    throw unavailable("INTERNAL_FAILURE");
  }
  return value as Value;
}

function isPositiveDecimal(value: unknown) {
  return typeof value === "string" && POSITIVE_DECIMAL.test(value);
}

function isSha256(value: unknown) {
  return typeof value === "string" && SHA256.test(value);
}

function canonicalClone(value: unknown): unknown {
  try {
    return JSON.parse(stringifyCaresLinkV1CanonicalJson(value)) as unknown;
  } catch {
    throw unavailable("INTERNAL_FAILURE");
  }
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function unavailable(reason: CaresLinkV1RegisteredWorkerSettleReason) {
  return new CaresLinkV1RegisteredWorkerExecutionError(reason);
}
