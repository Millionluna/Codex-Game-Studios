import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import { createValidCaresLinkV1CleanedFacts } from "./cleaned-facts-test-fixtures";
import { buildCaresLinkV1CanonicalNoteContent } from "./note-generation-output";
import {
  createCaresLinkV1NoteProviderAttemptEvidence,
  createCaresLinkV1NoteProviderPolicySnapshot,
  createCaresLinkV1NoteProviderWorkerPolicyBinding,
  type CaresLinkV1NoteProviderAttemptEvidence,
  type CaresLinkV1NoteProviderPolicyCore,
} from "./note-generation-provider-policy";
import { createCaresLinkV1CleanedFactsHash } from "./product-api-memory";
import {
  CARESLINK_V1_REGISTERED_WORKER_ADAPTER_READY,
  CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES,
  createTestOnlyCaresLinkV1RegisteredWorkerCompositeAdapter,
  type CaresLinkV1RegisteredWorkerAdapterRpcName,
  type CaresLinkV1RegisteredWorkerAdapterRpcResult,
  type CaresLinkV1RegisteredWorkerPrivilegedRpcClient,
  type CaresLinkV1RegisteredWorkerVaultConsumePort,
} from "./note-generation-registered-worker-adapter.server";
import {
  CaresLinkV1RegisteredWorkerExecutionError,
  createCaresLinkV1NoteGenerationWorkerRegistration,
  createCaresLinkV1RegisteredWorkerIdentityHash,
  type CaresLinkV1RegisteredWorkerClaim,
  type CaresLinkV1RegisteredWorkerSettleReason,
} from "./note-generation-registered-worker";
import {
  CARESLINK_V1_NOTE_GENERATION_RETRYABLE_OUTCOMES,
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

const IDS = {
  job: "10000000-0000-4000-8000-000000000001",
  payload: "10000000-0000-4000-8000-000000000002",
  attempt: "10000000-0000-4000-8000-000000000003",
  grant: "10000000-0000-4000-8000-000000000004",
  fence: "10000000-0000-4000-8000-000000000005",
  transaction: "10000000-0000-4000-8000-000000000006",
  canonical: "10000000-0000-4000-8000-000000000007",
  revision: "10000000-0000-4000-8000-000000000008",
} as const;
const LEASE_TOKEN = "lease-token-private-001";
const VAULT_GRANT = "vault-grant-private-001";
const COMMITTED_AT = "2026-08-20T01:00:00.000Z";
const GRANT_EXPIRES_AT = "2026-08-20T01:10:00.000Z";
const PROVIDER_STARTED_AT = "2026-08-20T00:59:00.000Z";
const PROVIDER_FINISHED_AT = "2026-08-20T00:59:01.000Z";
const CANDIDATE = {
  englishDraft: "Observable support facts only.",
  reviewVersions: {
    "zh-Hans": "仅包含可观察的支持事实。",
    "zh-Hant": "僅包含可觀察的支援事實。",
  },
  missingFacts: [],
  neutralWordingChecks: [],
  followUpPrompts: [],
};

describe("CaresLink V1 registered worker composite adapter", () => {
  it("is TEST_ONLY, default-off, exact-RPC and has no URL, env, clock or Points inputs", () => {
    type Options = Parameters<
      typeof createTestOnlyCaresLinkV1RegisteredWorkerCompositeAdapter
    >[0];
    type HasUrl = "url" extends keyof Options ? true : false;
    type HasSecret = "secret" extends keyof Options ? true : false;
    type HasClock = "clock" extends keyof Options ? true : false;
    type HasPoints = "points" extends keyof Options ? true : false;
    const absent: [HasUrl, HasSecret, HasClock, HasPoints] = [
      false,
      false,
      false,
      false,
    ];

    expect(CARESLINK_V1_REGISTERED_WORKER_ADAPTER_READY).toBe(false);
    expect(CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES).toEqual({
      claimNext: "claim_v1_shadow_note_generation_job",
      heartbeat: "heartbeat_v1_shadow_note_generation_attempt",
      fenceAttempt: "fence_v1_shadow_note_generation_attempt",
      commitCanonicalSuccess: "commit_v1_shadow_note_generation_success",
      settleFailure: "settle_v1_shadow_note_generation_failure",
      resolveAttemptOutcome: "resolve_v1_shadow_note_generation_attempt",
      recoverExpired: "recover_v1_shadow_note_generation_expired",
      authorizePayloadAttempt:
        "authorize_v1_shadow_note_generation_payload_attempt",
      consumePayloadGrant:
        "consume_v1_shadow_note_generation_payload_grant",
    });
    expect(Object.keys(CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES)).toHaveLength(9);
    expect(absent).toEqual([false, false, false, false]);
  });

  it("rejects non-TEST_ONLY, extra factory fields and timeout drift before RPC", () => {
    const harness = createHarness();
    expect(() =>
      createTestOnlyCaresLinkV1RegisteredWorkerCompositeAdapter({
        ...harness.factoryOptions,
        capability: "LIVE" as "TEST_ONLY",
      }),
    ).toThrowError(CaresLinkV1RegisteredWorkerExecutionError);
    expect(() =>
      createTestOnlyCaresLinkV1RegisteredWorkerCompositeAdapter({
        ...harness.factoryOptions,
        extra: true,
      } as unknown as Parameters<
        typeof createTestOnlyCaresLinkV1RegisteredWorkerCompositeAdapter
      >[0]),
    ).toThrowError(CaresLinkV1RegisteredWorkerExecutionError);

    const driftedPolicies = harness.setup.providerPolicies.map((policy, index) =>
      index === 0
        ? createProviderPolicy(policy.noteType, policy.timeoutMs - 1)
        : policy,
    );
    expect(() =>
      createTestOnlyCaresLinkV1RegisteredWorkerCompositeAdapter({
        ...harness.factoryOptions,
        approvedProviderPolicies: driftedPolicies,
      }),
    ).toThrowError(CaresLinkV1RegisteredWorkerExecutionError);
    expect(harness.rpc).not.toHaveBeenCalled();
  });

  it("uses exact RPC names and parameters while the database owns time and retry", async () => {
    const harness = createHarness();
    const attemptInput = harness.attemptInput();
    await harness.adapter.store.claimNext(harness.claimInput());
    await harness.adapter.store.heartbeat(attemptInput);
    const fence = await harness.adapter.store.fenceAttempt(attemptInput);
    await harness.adapter.store.commitCanonicalSuccess({
      claim: harness.claim,
      fence,
      registration: harness.setup.registration,
      content: harness.canonical.content,
      contentHash: harness.canonical.contentHash,
      providerEvidence: harness.evidence,
    });
    await harness.adapter.store.settleFailure({
      ...attemptInput,
      reason: "PROVIDER_TRANSIENT",
    });
    await harness.adapter.store.resolveAttemptOutcome({
      claim: harness.claim,
      registration: harness.setup.registration,
      expectedContentHash: null,
      expectedProviderEvidenceHash: null,
    });
    await harness.adapter.store.recoverExpired(harness.claimInput());
    const grant = await harness.adapter.payload.authorizeAttempt(
      harness.payloadInput(),
    );
    await harness.adapter.payload.consumeAttemptGrant({
      ...harness.payloadInput(),
      grantId: grant.grantId,
    });

    expect(harness.rpc.mock.calls.map(([name]) => name)).toEqual(
      Object.values(CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES),
    );
    const claimArgs = harness.rpc.mock.calls[0]?.[1];
    expect(claimArgs).toEqual({
      p_registration_digest: harness.setup.registration.registrationDigest,
      p_worker_policy_version: harness.setup.workerPolicy.version,
      p_worker_policy_digest: harness.setup.workerPolicy.digest,
      p_worker_identity_hash: harness.claim.attempt.workerIdentityHash,
      p_contract_version: CARESLINK_V1_CONTRACT_VERSION,
      p_schema_version: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    });
    const attemptArgs = harness.rpc.mock.calls[1]?.[1];
    expect(attemptArgs).toEqual({
      p_job_id: IDS.job,
      p_attempt_id: IDS.attempt,
      p_lease_token: LEASE_TOKEN,
      p_registration_digest: harness.setup.registration.registrationDigest,
      p_worker_policy_version: harness.setup.workerPolicy.version,
      p_worker_policy_digest: harness.setup.workerPolicy.digest,
    });
    expect(harness.rpc.mock.calls[5]?.[1]).toEqual({
      p_job_id: IDS.job,
      p_attempt_id: IDS.attempt,
      p_lease_token: LEASE_TOKEN,
      p_registration_digest: harness.setup.registration.registrationDigest,
      p_expected_content_hash: null,
      p_expected_provider_evidence_hash: null,
    });
    expect(harness.rpc.mock.calls[7]?.[1]).toEqual({
      p_job_id: IDS.job,
      p_payload_id: IDS.payload,
      p_attempt_id: IDS.attempt,
      p_lease_token: LEASE_TOKEN,
      p_registration_digest: harness.setup.registration.registrationDigest,
    });
    expect(harness.rpc.mock.calls[8]?.[1]).toEqual({
      p_job_id: IDS.job,
      p_payload_id: IDS.payload,
      p_attempt_id: IDS.attempt,
      p_lease_token: LEASE_TOKEN,
      p_registration_digest: harness.setup.registration.registrationDigest,
      p_grant_id: IDS.grant,
    });
    for (const [name, args] of harness.rpc.mock.calls) {
      if (name === CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.commitCanonicalSuccess) {
        continue;
      }
      expect(Object.keys(args).join(" ")).not.toMatch(
        /owner|session|clock|now|duration|max_attempt|retry_delay|facts|locator|vault/i,
      );
    }
  });

  it("claims, idles, replays, heartbeats, fences and recovers exact DTOs", async () => {
    const harness = createHarness();
    await expect(
      harness.adapter.store.claimNext(harness.claimInput()),
    ).resolves.toEqual(harness.claim);
    await expect(
      harness.adapter.store.claimNext(harness.claimInput()),
    ).resolves.toEqual(harness.claim);
    await expect(
      harness.adapter.store.heartbeat(harness.attemptInput()),
    ).resolves.toBeUndefined();
    await expect(
      harness.adapter.store.fenceAttempt(harness.attemptInput()),
    ).resolves.toEqual(harness.fence);
    await expect(
      harness.adapter.store.recoverExpired(harness.claimInput()),
    ).resolves.toEqual({ recovered: 3, requeued: 2, failed: 1 });

    harness.respond.set(
      CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.claimNext,
      { status: "IDLE", claim: null },
    );
    await expect(
      harness.adapter.store.claimNext(harness.claimInput()),
    ).resolves.toBeUndefined();
  });

  it("authorizes then consumes one vault grant without putting facts in RPC metadata or logs", async () => {
    const logs = [
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "info").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];
    try {
      const secretFacts = createValidCaresLinkV1CleanedFacts("communication");
      const harness = createHarness({ vaultFacts: secretFacts });
      const grant = await harness.adapter.payload.authorizeAttempt(
        harness.payloadInput(),
      );
      await expect(
        harness.adapter.payload.consumeAttemptGrant({
          ...harness.payloadInput(),
          grantId: grant.grantId,
        }),
      ).resolves.toEqual(secretFacts);
      expect(harness.events).toEqual([
        "authorize-rpc",
        "consume-rpc",
        "vault-consume",
      ]);
      expect(harness.vault.consumeOneTimeGrant).toHaveBeenCalledWith({
        vaultGrant: VAULT_GRANT,
        grantId: IDS.grant,
        jobId: IDS.job,
        payloadId: IDS.payload,
        attemptId: IDS.attempt,
        registrationDigest: harness.setup.registration.registrationDigest,
        expiresAt: GRANT_EXPIRES_AT,
      });
      const rpcText = JSON.stringify(harness.rpc.mock.calls);
      expect(rpcText).not.toContain(JSON.stringify(secretFacts));
      expect(rpcText).not.toContain(VAULT_GRANT);
      for (const log of logs) expect(log).not.toHaveBeenCalled();
    } finally {
      for (const log of logs) log.mockRestore();
    }
  });

  it("fails the second grant consumption before the vault can return facts twice", async () => {
    let consumes = 0;
    const harness = createHarness({
      rpcOverride(name) {
        if (name === CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.consumePayloadGrant) {
          consumes += 1;
          if (consumes > 1) {
            return rpcError("PAYLOAD_UNAVAILABLE");
          }
        }
        return undefined;
      },
    });
    const input = { ...harness.payloadInput(), grantId: IDS.grant };
    await expect(
      harness.adapter.payload.consumeAttemptGrant(input),
    ).resolves.toEqual(createValidCaresLinkV1CleanedFacts("communication"));
    await expect(
      harness.adapter.payload.consumeAttemptGrant(input),
    ).rejects.toMatchObject({ reason: "PAYLOAD_UNAVAILABLE" });
    expect(harness.vault.consumeOneTimeGrant).toHaveBeenCalledTimes(1);
  });

  it("consumes privacy-confirmed facts with scanner findings when the bound hash matches", async () => {
    const facts = {
      ...createValidCaresLinkV1CleanedFacts("communication"),
      observable_facts: "The confirmed contact was person@example.com.",
    };
    const harness = createHarness({
      vaultFacts: facts,
      cleanedFactsHash: createCaresLinkV1CleanedFactsHash(facts),
    });

    await expect(
      harness.adapter.payload.consumeAttemptGrant({
        ...harness.payloadInput(),
        grantId: IDS.grant,
      }),
    ).resolves.toEqual(facts);
    expect(harness.vault.consumeOneTimeGrant).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "wrong hash",
      (): unknown => ({
        ...createValidCaresLinkV1CleanedFacts("communication"),
        observable_facts: "A different but valid observable fact.",
      }),
    ],
    [
      "wrong Note type",
      (): unknown => createValidCaresLinkV1CleanedFacts("progress"),
    ],
    ["wrong shape", (): unknown => "not-an-object"],
    [
      "prototype pollution",
      (): unknown =>
        Object.assign(
          Object.create({ inherited: "blocked" }) as Record<string, unknown>,
          createValidCaresLinkV1CleanedFacts("communication"),
        ),
    ],
    [
      "oversize payload",
      (): unknown => ({
        ...createValidCaresLinkV1CleanedFacts("communication"),
        observable_facts: "x".repeat(70_000),
      }),
    ],
  ] as const)("rejects vault facts with %s", async (_label, createFacts) => {
    const harness = createHarness({ vaultFacts: createFacts() });
    await expect(
      harness.adapter.payload.consumeAttemptGrant({
        ...harness.payloadInput(),
        grantId: IDS.grant,
      }),
    ).rejects.toMatchObject({ reason: "PAYLOAD_UNAVAILABLE" });
    expect(harness.vault.consumeOneTimeGrant).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["Note type", "noteType", "progress"],
    ["contract", "contractVersion", "0.0.0-drift"],
    ["schema", "schemaVersion", "2099-01-01.drift"],
    ["cleaned facts hash", "cleanedFactsHash", sha256("owner-b-facts")],
  ] as const)(
    "rejects consume authorization with drifted %s before vault access",
    async (_label, field, drift) => {
      const harness = createHarness();
      const authorization = {
        ...vaultAuthorization(harness.claim),
        [field]: drift,
      };
      harness.respond.set(
        CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.consumePayloadGrant,
        authorization,
      );
      await expect(
        harness.adapter.payload.consumeAttemptGrant({
          ...harness.payloadInput(),
          grantId: IDS.grant,
        }),
      ).rejects.toMatchObject({ reason: "PAYLOAD_UNAVAILABLE" });
      expect(harness.vault.consumeOneTimeGrant).not.toHaveBeenCalled();
    },
  );

  it.each([
    "SESSION_REVOKED",
    "PRIVACY_REVIEW_STALE",
    "PAYLOAD_UNAVAILABLE",
  ] as const)(
    "surfaces an atomically settled authorize denial for %s without vault access",
    async (reason) => {
      const harness = createHarness();
      harness.respond.set(
        CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.authorizePayloadAttempt,
        payloadDeniedAndSettled(harness.claim, reason),
      );

      await expect(
        harness.adapter.payload.authorizeAttempt(harness.payloadInput()),
      ).rejects.toMatchObject({
        name: "CaresLinkV1RegisteredWorkerExecutionError",
        reason,
      });
      expect(harness.vault.consumeOneTimeGrant).not.toHaveBeenCalled();
    },
  );

  it.each([
    "SESSION_REVOKED",
    "PRIVACY_REVIEW_STALE",
    "PAYLOAD_UNAVAILABLE",
  ] as const)(
    "surfaces an atomically settled consume denial for %s without vault access",
    async (reason) => {
      const harness = createHarness();
      harness.respond.set(
        CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.consumePayloadGrant,
        payloadDeniedAndSettled(harness.claim, reason),
      );

      await expect(
        harness.adapter.payload.consumeAttemptGrant({
          ...harness.payloadInput(),
          grantId: IDS.grant,
        }),
      ).rejects.toMatchObject({
        name: "CaresLinkV1RegisteredWorkerExecutionError",
        reason,
      });
      expect(harness.vault.consumeOneTimeGrant).not.toHaveBeenCalled();
    },
  );

  const deniedSettlementDrifts = [
    ["status", (value: Record<string, unknown>) => {
      value.status = "DENIED";
    }],
    ["transaction ID", (value: Record<string, unknown>) => {
      value.transactionId = "not-a-uuid";
    }],
    ["transaction status", (value: Record<string, unknown>) => {
      value.transactionStatus = "ROLLED_BACK";
    }],
    ["atomic declaration", (value: Record<string, unknown>) => {
      value.atomic = false;
    }],
    ["commit time", (value: Record<string, unknown>) => {
      value.committedAt = "not-a-server-time";
    }],
    ["registration digest", (value: Record<string, unknown>) => {
      value.registrationDigest = sha256("other-registration");
    }],
    ["denial reason", (value: Record<string, unknown>) => {
      value.reason = "CANCELLED";
    }],
    ["job reference", (value: Record<string, unknown>) => {
      value.jobReferenceHash = sha256("other-job");
    }],
    ["attempt reference", (value: Record<string, unknown>) => {
      value.attemptReferenceHash = sha256("other-attempt");
    }],
    ["payload reference", (value: Record<string, unknown>) => {
      value.payloadReferenceHash = sha256("other-payload");
    }],
    ["job terminal status", (value: Record<string, unknown>) => {
      value.jobStatus = "RUNNING";
    }],
    ["attempt terminal status", (value: Record<string, unknown>) => {
      value.attemptStatus = "RUNNING";
    }],
    ["payload state", (value: Record<string, unknown>) => {
      value.payloadState = "AVAILABLE";
    }],
    ["payload disposition", (value: Record<string, unknown>) => {
      value.payloadDisposition = "RETAINED_FOR_RETRY";
    }],
    ["purge event hash", (value: Record<string, unknown>) => {
      value.purgeEventReferenceHash = "not-a-sha256";
    }],
  ] as const;

  it.each(["authorize", "consume"] as const)(
    "rejects drifted atomically settled %s denials before vault access",
    async (operation) => {
      for (const [label, mutate] of deniedSettlementDrifts) {
        const harness = createHarness();
        const denial = payloadDeniedAndSettled(
          harness.claim,
          "SESSION_REVOKED",
        ) as Record<string, unknown>;
        mutate(denial);
        harness.respond.set(
          operation === "authorize"
            ? CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.authorizePayloadAttempt
            : CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.consumePayloadGrant,
          denial,
        );

        const call =
          operation === "authorize"
            ? harness.adapter.payload.authorizeAttempt(harness.payloadInput())
            : harness.adapter.payload.consumeAttemptGrant({
                ...harness.payloadInput(),
                grantId: IDS.grant,
              });
        await expect(call, label).rejects.toMatchObject({
          reason: "INTERNAL_FAILURE",
        });
        expect(
          harness.vault.consumeOneTimeGrant,
          label,
        ).not.toHaveBeenCalled();
      }
    },
  );

  it("accepts a complete atomic success and returns metadata-only canonical refs", async () => {
    const harness = createHarness();
    const result = await harness.adapter.store.commitCanonicalSuccess({
      claim: harness.claim,
      fence: harness.fence,
      registration: harness.setup.registration,
      content: harness.canonical.content,
      contentHash: harness.canonical.contentHash,
      providerEvidence: harness.evidence,
    });
    expect(result).toEqual({
      canonicalId: IDS.canonical,
      revisionId: IDS.revision,
      contentHash: harness.canonical.contentHash,
      revisionNumber: 1,
      baseRevisionId: null,
    });
    expect(result).not.toHaveProperty("canonicalContent");
    expect(harness.atomicSuccess).not.toHaveProperty("canonicalContent");
    expect(harness.atomicSuccess).not.toHaveProperty("providerEvidence");
    expect(harness.rpc).toHaveBeenCalledWith(
      CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.commitCanonicalSuccess,
      expect.objectContaining({
        p_fence_id: IDS.fence,
        p_fence_digest: harness.fence.fenceDigest,
        p_canonical_content_hash: harness.canonical.contentHash,
        p_canonical_content: harness.canonical.content,
        p_provider_evidence: harness.evidence,
      }),
    );
  });

  it.each([
    ["legacy canonicalContent echo", (value: Record<string, unknown>): void => {
      value.canonicalContent = { private: "must-not-echo" };
    }],
    ["legacy providerEvidence echo", (value: Record<string, unknown>): void => {
      value.providerEvidence = { private: "must-not-echo" };
    }],
    ["extra top key", (value: Record<string, unknown>): void => {
      value.extra = true;
    }],
    ["mutation kind drift", (value: Record<string, unknown>): void => {
      (value.mutationReceipt as Record<string, unknown>).mutationKind =
        "APPEND_REVISION";
    }],
    ["job content hash drift", (value: Record<string, unknown>): void => {
      (value.jobTerminal as Record<string, unknown>).contentHash = sha256("drift");
    }],
    ["evidence hash drift", (value: Record<string, unknown>): void => {
      (value.attemptTerminal as Record<string, unknown>).providerEvidenceHash =
        sha256("drift");
    }],
    ["payload not revoked", (value: Record<string, unknown>): void => {
      (value.payloadMetadata as Record<string, unknown>).state = "AVAILABLE";
    }],
    ["purge not enqueued", (value: Record<string, unknown>): void => {
      (value.purgeOutboxAcknowledgment as Record<string, unknown>).status =
        "PENDING";
    }],
  ] as const)("rejects malformed atomic success: %s", async (_label, mutate) => {
    const harness = createHarness();
    const malformed = structuredClone(harness.atomicSuccess) as Record<string, unknown>;
    mutate(malformed);
    harness.respond.set(
      CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.commitCanonicalSuccess,
      malformed,
    );
    await expect(harness.commit()).rejects.toMatchObject({
      reason: "INTERNAL_FAILURE",
    });
  });

  it.each([
    ["extra content key", (content: Record<string, unknown>): void => {
      content.extra = true;
    }],
    ["wrong disclaimer", (content: Record<string, unknown>): void => {
      content.disclaimer = "Not the server disclaimer";
    }],
    ["unsafe output", (content: Record<string, unknown>): void => {
      content.englishDraft = "Contact person@example.com";
    }],
  ] as const)(
    "rejects %s with a matching recomputed hash before commit RPC",
    async (_label, mutate) => {
      const harness = createHarness();
      const content = structuredClone(harness.canonical.content) as Record<string, unknown>;
      mutate(content);
      const hash = sha256(stringifyCaresLinkV1CanonicalJson(content));
      await expect(
        harness.adapter.store.commitCanonicalSuccess({
          claim: harness.claim,
          fence: harness.fence,
          registration: harness.setup.registration,
          content: content as typeof harness.canonical.content,
          contentHash: hash,
          providerEvidence: harness.evidence,
        }),
      ).rejects.toMatchObject({ reason: "INTERNAL_FAILURE" });
      expect(harness.rpc).not.toHaveBeenCalled();
    },
  );

  it("accepts complete retry and terminal atomic settlements", async () => {
    const retry = createHarness();
    await expect(
      retry.adapter.store.settleFailure({
        ...retry.attemptInput(),
        reason: "PROVIDER_TRANSIENT",
      }),
    ).resolves.toEqual(retry.retrySettlement);

    const terminal = createHarness();
    terminal.respond.set(
      CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.settleFailure,
      terminal.atomicTerminalSettlement,
    );
    await expect(
      terminal.adapter.store.settleFailure({
        ...terminal.attemptInput(),
        reason: "PROVIDER_PERMANENT",
      }),
    ).resolves.toEqual(terminal.terminalSettlement);
  });

  it.each([
    ["naked settlement", (h: ReturnType<typeof createHarness>) => h.retrySettlement],
    ["wrong nextEligibleAt", (h: ReturnType<typeof createHarness>) => {
      const value = structuredClone(h.atomicRetrySettlement);
      value.jobTransition.nextEligibleAt = COMMITTED_AT;
      return value;
    }],
    ["wrong payload disposition", (h: ReturnType<typeof createHarness>) => {
      const value = structuredClone(h.atomicRetrySettlement);
      value.payloadMetadata.state = "REVOKED";
      return value;
    }],
    ["legacy EXPIRED attempt status", (h: ReturnType<typeof createHarness>) => {
      const value = structuredClone(h.atomicRetrySettlement);
      value.attemptTerminal.status = "EXPIRED";
      return value;
    }],
    ["extra settlement key", (h: ReturnType<typeof createHarness>) => ({ ...h.atomicRetrySettlement, extra: true })],
  ] as const)("rejects malformed atomic settlement: %s", async (_label, response) => {
    const harness = createHarness();
    harness.respond.set(
      CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.settleFailure,
      response(harness),
    );
    await expect(
      harness.adapter.store.settleFailure({
        ...harness.attemptInput(),
        reason: "PROVIDER_TRANSIENT",
      }),
    ).rejects.toMatchObject({ reason: expect.stringMatching(/INTERNAL_FAILURE|POLICY_MISMATCH/) });
  });

  it("resolves complete atomic success/settlement and rejects legacy simple envelopes", async () => {
    const success = createHarness();
    success.respond.set(
      CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.resolveAttemptOutcome,
      { status: "SUCCEEDED", atomicSuccess: success.atomicSuccess },
    );
    await expect(
      success.adapter.store.resolveAttemptOutcome({
        claim: success.claim,
        registration: success.setup.registration,
        expectedContentHash: success.canonical.contentHash,
        expectedProviderEvidenceHash: success.evidenceHash,
      }),
    ).resolves.toMatchObject({ status: "SUCCEEDED", result: { revisionNumber: 1 } });

    const settled = createHarness();
    settled.respond.set(
      CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.resolveAttemptOutcome,
      { status: "RETRY_SCHEDULED", atomicSettlement: settled.atomicRetrySettlement },
    );
    await expect(
      settled.adapter.store.resolveAttemptOutcome({
        claim: settled.claim,
        registration: settled.setup.registration,
        expectedContentHash: null,
        expectedProviderEvidenceHash: null,
      }),
    ).resolves.toEqual({
      status: "RETRY_SCHEDULED",
      settlement: settled.retrySettlement,
    });

    for (const legacy of [
      { status: "SUCCEEDED", result: success.atomicSuccess.canonical },
      { status: "RETRY_SCHEDULED", settlement: settled.retrySettlement },
    ]) {
      const harness = createHarness();
      harness.respond.set(
        CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.resolveAttemptOutcome,
        legacy,
      );
      await expect(
        harness.adapter.store.resolveAttemptOutcome({
          claim: harness.claim,
          registration: harness.setup.registration,
          expectedContentHash:
            legacy.status === "SUCCEEDED" ? harness.canonical.contentHash : null,
          expectedProviderEvidenceHash:
            legacy.status === "SUCCEEDED" ? harness.evidenceHash : null,
        }),
      ).rejects.toMatchObject({ reason: "INTERNAL_FAILURE" });
    }
  });

  it("rejects provider evidence hash drift in resolved success and failure envelopes", async () => {
    const success = createHarness();
    success.respond.set(
      CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.resolveAttemptOutcome,
      { status: "SUCCEEDED", atomicSuccess: success.atomicSuccess },
    );
    await expect(
      success.adapter.store.resolveAttemptOutcome({
        claim: success.claim,
        registration: success.setup.registration,
        expectedContentHash: success.canonical.contentHash,
        expectedProviderEvidenceHash: sha256("wrong-success-evidence"),
      }),
    ).rejects.toMatchObject({ reason: "INTERNAL_FAILURE" });

    const failure = createHarness();
    const settlementWithEvidence = atomicSettlementDto(
      failure.claim,
      failure.retrySettlement,
      failure.evidence,
    );
    failure.respond.set(
      CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.resolveAttemptOutcome,
      {
        status: "RETRY_SCHEDULED",
        atomicSettlement: settlementWithEvidence,
      },
    );
    await expect(
      failure.adapter.store.resolveAttemptOutcome({
        claim: failure.claim,
        registration: failure.setup.registration,
        expectedContentHash: null,
        expectedProviderEvidenceHash: sha256("wrong-failure-evidence"),
      }),
    ).rejects.toMatchObject({ reason: "INTERNAL_FAILURE" });
  });

  it("does not retry a lost commit response and permits an explicit full resolve", async () => {
    let loseCommit = true;
    const harness = createHarness({
      rpcOverride(name) {
        if (
          name === CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.commitCanonicalSuccess &&
          loseCommit
        ) {
          return new Error("response lost");
        }
        if (name === CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.resolveAttemptOutcome) {
          return { status: "SUCCEEDED", atomicSuccess: harness.atomicSuccess };
        }
        return undefined;
      },
    });
    await expect(harness.commit()).rejects.toMatchObject({
      reason: "INTERNAL_FAILURE",
    });
    expect(
      harness.rpc.mock.calls.filter(
        ([name]) =>
          name === CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.commitCanonicalSuccess,
      ),
    ).toHaveLength(1);
    loseCommit = false;
    await expect(
      harness.adapter.store.resolveAttemptOutcome({
        claim: harness.claim,
        registration: harness.setup.registration,
        expectedContentHash: harness.canonical.contentHash,
        expectedProviderEvidenceHash: harness.evidenceHash,
      }),
    ).resolves.toMatchObject({ status: "SUCCEEDED" });
  });

  it("does not retry a lost settlement response and resolves the full atomic settlement", async () => {
    let loseSettlement = true;
    const harness = createHarness({
      rpcOverride(name) {
        if (
          name === CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.settleFailure &&
          loseSettlement
        ) {
          return new Error("response lost");
        }
        if (name === CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.resolveAttemptOutcome) {
          return {
            status: "RETRY_SCHEDULED",
            atomicSettlement: harness.atomicRetrySettlement,
          };
        }
        return undefined;
      },
    });

    await expect(
      harness.adapter.store.settleFailure({
        ...harness.attemptInput(),
        reason: "PROVIDER_TRANSIENT",
      }),
    ).rejects.toMatchObject({ reason: "INTERNAL_FAILURE" });
    expect(
      harness.rpc.mock.calls.filter(
        ([name]) =>
          name === CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.settleFailure,
      ),
    ).toHaveLength(1);

    loseSettlement = false;
    await expect(
      harness.adapter.store.resolveAttemptOutcome({
        claim: harness.claim,
        registration: harness.setup.registration,
        expectedContentHash: null,
        expectedProviderEvidenceHash: null,
      }),
    ).resolves.toEqual({
      status: "RETRY_SCHEDULED",
      settlement: harness.retrySettlement,
    });
  });

  it.each([
    ["AUTH_REQUIRED", "AUTH_REQUIRED"],
    ["SESSION_REVOKED", "SESSION_REVOKED"],
    ["PRIVACY_REVIEW_REQUIRED", "PRIVACY_REVIEW_REQUIRED"],
    ["PRIVACY_REVIEW_STALE", "PRIVACY_REVIEW_STALE"],
    ["FORBIDDEN", "FORBIDDEN"],
  ] as const)("maps structured database error %s", async (message, expectedCode) => {
    const harness = createHarness({ rpcOverride: () => rpcError(message) });
    await expect(
      harness.adapter.store.claimNext(harness.claimInput()),
    ).rejects.toMatchObject({ code: expectedCode });
  });

  it.each([
    [{ message: "LEASE_EXPIRED" }, "LEASE_EXPIRED"],
    [{ code: "PGRST202", message: "missing RPC" }, "POLICY_MISMATCH"],
    [{ message: "raw database secret: bearer-123" }, "INTERNAL_FAILURE"],
  ] as const)("maps worker database errors without exposing raw details", async (error, reason) => {
    const logs = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const harness = createHarness({
        rpcOverride: () => ({ data: null, error }),
      });
      let caught: unknown;
      try {
        await harness.adapter.store.claimNext(harness.claimInput());
      } catch (value) {
        caught = value;
      }
      expect(caught).toMatchObject({
        name: "CaresLinkV1RegisteredWorkerExecutionError",
        reason,
        message: "Registered Note worker execution failed",
      });
      expect(JSON.stringify(caught)).not.toContain("bearer-123");
      expect(logs).not.toHaveBeenCalled();
    } finally {
      logs.mockRestore();
    }
  });

  it("fails closed on extra/prototype DTOs and cross-job hashes", async () => {
    const harness = createHarness();
    const prototypeClaim = Object.assign(Object.create({ inherited: true }),
      harness.claim,
    ) as CaresLinkV1RegisteredWorkerClaim;
    await expect(
      harness.adapter.store.heartbeat({
        ...harness.attemptInput(),
        claim: prototypeClaim,
      }),
    ).rejects.toMatchObject({ reason: "INTERNAL_FAILURE" });
    expect(harness.rpc).not.toHaveBeenCalled();

    harness.respond.set(
      CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.heartbeat,
      { ...attemptAck(harness.claim), extra: true },
    );
    await expect(
      harness.adapter.store.heartbeat(harness.attemptInput()),
    ).rejects.toMatchObject({ reason: "INTERNAL_FAILURE" });

    harness.respond.set(
      CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.authorizePayloadAttempt,
      { ...payloadGrant(harness.claim), jobReferenceHash: sha256("owner-b-job") },
    );
    await expect(
      harness.adapter.payload.authorizeAttempt(harness.payloadInput()),
    ).rejects.toMatchObject({ reason: "PAYLOAD_UNAVAILABLE" });
  });
});

type HarnessOptions = Readonly<{
  vaultFacts?: unknown;
  cleanedFactsHash?: string;
  rpcOverride?: (
    name: CaresLinkV1RegisteredWorkerAdapterRpcName,
    args: Record<string, unknown>,
  ) => CaresLinkV1RegisteredWorkerAdapterRpcResult | unknown | Error | undefined;
}>;

function createHarness(options: HarnessOptions = {}) {
  const setup = createSetup();
  const defaultFacts = createValidCaresLinkV1CleanedFacts("communication");
  const cleanedFactsHash =
    options.cleanedFactsHash ?? createCaresLinkV1CleanedFactsHash(defaultFacts);
  const claim = createClaim(setup, cleanedFactsHash);
  const canonical = buildCaresLinkV1CanonicalNoteContent(
    "communication",
    createValidCaresLinkV1CleanedFacts("communication"),
    CANDIDATE,
  );
  const evidence = createEvidence(setup, CANDIDATE);
  const evidenceHash = sha256(stringifyCaresLinkV1CanonicalJson(evidence));
  const fence = {
    fenceId: IDS.fence,
    fenceDigest: sha256("fence-digest"),
    expiresAt: GRANT_EXPIRES_AT,
  };
  const retrySettlement = {
    disposition: "RETRY_SCHEDULED" as const,
    reason: "PROVIDER_TRANSIENT" as const,
    payloadDisposition: "RETAINED_FOR_RETRY" as const,
    baseDelayMs: 1_000,
    jitterMs: 0,
    retryDelayMs: 1_000,
  };
  const terminalSettlement = {
    disposition: "FAILED" as const,
    reason: "PROVIDER_PERMANENT" as const,
    payloadDisposition: "REVOKED_PURGE_ENQUEUED" as const,
    baseDelayMs: null,
    jitterMs: null,
    retryDelayMs: null,
  };
  const atomicSuccess = atomicSuccessDto(claim, canonical, evidence);
  const atomicRetrySettlement = atomicSettlementDto(
    claim,
    retrySettlement,
    null,
  );
  const atomicTerminalSettlement = atomicSettlementDto(
    claim,
    terminalSettlement,
    null,
  );
  const respond = new Map<CaresLinkV1RegisteredWorkerAdapterRpcName, unknown>([
    [CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.claimNext, { status: "CLAIMED", claim }],
    [CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.heartbeat, attemptAck(claim)],
    [CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.fenceAttempt, fenceAck(claim, fence)],
    [CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.commitCanonicalSuccess, atomicSuccess],
    [CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.settleFailure, atomicRetrySettlement],
    [CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.resolveAttemptOutcome, { status: "RUNNING" }],
    [CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.recoverExpired, { recovered: 3, requeued: 2, failed: 1 }],
    [CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.authorizePayloadAttempt, payloadGrant(claim)],
    [CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.consumePayloadGrant, vaultAuthorization(claim)],
  ]);
  const events: string[] = [];
  const rpc = vi.fn(async (name: CaresLinkV1RegisteredWorkerAdapterRpcName, args: Record<string, unknown>) => {
    if (name === CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.authorizePayloadAttempt) {
      events.push("authorize-rpc");
    }
    if (name === CARESLINK_V1_REGISTERED_WORKER_ADAPTER_RPC_NAMES.consumePayloadGrant) {
      events.push("consume-rpc");
    }
    const override = options.rpcOverride?.(name, args);
    if (override instanceof Error) throw override;
    if (override !== undefined) {
      if (isRpcResult(override)) return override;
      return { data: override, error: null };
    }
    return { data: respond.get(name), error: null };
  });
  const client = { rpc: rpc as CaresLinkV1RegisteredWorkerPrivilegedRpcClient["rpc"] };
  const vault = {
    consumeOneTimeGrant: vi.fn(async () => {
      events.push("vault-consume");
      return options.vaultFacts ?? createValidCaresLinkV1CleanedFacts("communication");
    }),
  } satisfies CaresLinkV1RegisteredWorkerVaultConsumePort;
  const factoryOptions = {
    capability: "TEST_ONLY" as const,
    client,
    vault,
    approvedWorkerPolicy: setup.workerPolicy,
    approvedProviderPolicies: setup.providerPolicies,
  };
  const adapter = createTestOnlyCaresLinkV1RegisteredWorkerCompositeAdapter(
    factoryOptions,
  );

  return {
    adapter,
    factoryOptions,
    setup,
    claim,
    canonical,
    evidence,
    evidenceHash,
    fence,
    retrySettlement,
    terminalSettlement,
    atomicSuccess,
    atomicRetrySettlement,
    atomicTerminalSettlement,
    respond,
    rpc,
    vault,
    events,
    claimInput: () => ({
      workerIdentityHash: claim.attempt.workerIdentityHash,
      registration: setup.registration,
      workerPolicy: setup.workerPolicy,
    }),
    attemptInput: () => ({
      claim,
      registration: setup.registration,
      workerPolicy: setup.workerPolicy,
    }),
    payloadInput: () => ({
      jobId: IDS.job,
      payloadId: IDS.payload,
      attemptId: IDS.attempt,
      leaseToken: LEASE_TOKEN,
      registrationDigest: setup.registration.registrationDigest,
      noteType: claim.job.noteType,
      contractVersion: claim.job.contractVersion,
      schemaVersion: claim.job.schemaVersion,
      cleanedFactsHash: claim.job.cleanedFactsHash,
    }),
    commit: () =>
      adapter.store.commitCanonicalSuccess({
        claim,
        fence,
        registration: setup.registration,
        content: canonical.content,
        contentHash: canonical.contentHash,
        providerEvidence: evidence,
      }),
  };
}

function createSetup() {
  const workerPolicy = createWorkerPolicy();
  const providerPolicies = CARESLINK_V1_NOTE_TYPE_CODES.map((noteType) =>
    createProviderPolicy(noteType, workerPolicy.providerDeadlineMs),
  );
  const identity = {
    identityVersion: "worker-identity.v1",
    workerId: "worker-private-identity-001",
  };
  const registration = createCaresLinkV1NoteGenerationWorkerRegistration({
    registrationVersion: "adapter.test-only.v1",
    status: "APPROVED",
    contractVersion: CARESLINK_V1_CONTRACT_VERSION,
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    workerIdentityVersion: identity.identityVersion,
    workerIdentityHash: createCaresLinkV1RegisteredWorkerIdentityHash(identity),
    workerPolicyVersion: workerPolicy.version,
    workerPolicyDigest: workerPolicy.digest,
    payloadPolicyVersion: "payload.test-only.v1",
    payloadPolicySnapshotHash: sha256("payload-policy"),
    providerPolicies: providerPolicies.map((policy) => ({
      noteType: policy.noteType,
      policyVersion: policy.policyVersion,
      policyDigest: policy.policyDigest,
    })),
  });
  return { workerPolicy, providerPolicies, registration };
}

function createWorkerPolicy(): CaresLinkV1NoteGenerationWorkerPolicy {
  const definition: CaresLinkV1NoteGenerationWorkerPolicyDefinition = {
    version: "worker-policy.test-only.v1",
    status: "APPROVED",
    maxQueueAgeMs: 60_000,
    minimumPayloadRemainingAtClaimMs: 40_000,
    leaseDurationMs: 10_000,
    heartbeatIntervalMs: 3_000,
    heartbeatSafetyMarginMs: 2_000,
    attemptDeadlineMs: 40_000,
    providerDeadlineMs: 30_000,
    commitSafetyMarginMs: 10_000,
    maxAttempts: 3,
    retryDelayMsAfterAttempt: [1_000, 2_000],
    retryableOutcomes: [...CARESLINK_V1_NOTE_GENERATION_RETRYABLE_OUTCOMES],
    recoveryBatchLimit: 20,
    jitter: { mode: "NONE" },
  };
  return {
    ...definition,
    digest: createCaresLinkV1NoteGenerationWorkerPolicyDigest(definition),
  };
}

function createProviderPolicy(noteType: CaresLinkV1NoteTypeCode, timeoutMs: number) {
  const core: CaresLinkV1NoteProviderPolicyCore = {
    noteType,
    serviceCode: getCaresLinkV1NoteType(noteType).generationServiceCode,
    contractVersion: CARESLINK_V1_CONTRACT_VERSION,
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    rateCatalogVersion: CARESLINK_V1_RATE_CATALOG_VERSION,
    providerId: "provider.test-only",
    modelId: "model.test-only",
    modelRevision: "revision.test-only",
    modelRevisionAvailability: "EXACT",
    policyVersion: `provider.${noteType}.v1`,
    promptTemplateVersion: `prompt.${noteType}.v1`,
    goldenSetVersion: `golden.${noteType}.v1`,
    parserVersion: "parser.note.v1",
    timeoutMs,
  };
  return createCaresLinkV1NoteProviderPolicySnapshot(core);
}

function createClaim(
  setup: ReturnType<typeof createSetup>,
  cleanedFactsHash = createCaresLinkV1CleanedFactsHash(
    createValidCaresLinkV1CleanedFacts("communication"),
  ),
): CaresLinkV1RegisteredWorkerClaim {
  const provider = setup.providerPolicies[0];
  return {
    job: {
      jobId: IDS.job,
      payloadId: IDS.payload,
      noteType: "communication",
      sourceLocale: "en",
      serviceCode: "note.communication.generate",
      contractVersion: CARESLINK_V1_CONTRACT_VERSION,
      schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
      workerPolicyVersion: setup.workerPolicy.version,
      workerPolicyDigest: setup.workerPolicy.digest,
      providerPolicyVersion: provider.policyVersion,
      providerPolicyDigest: provider.policyDigest,
      payloadPolicyVersion: setup.registration.payloadPolicyVersion,
      payloadPolicySnapshotHash: setup.registration.payloadPolicySnapshotHash,
      cleanedFactsHash,
      status: "RUNNING",
    },
    attempt: {
      attemptId: IDS.attempt,
      ordinal: 1,
      status: "RUNNING",
      leaseTokenHash: sha256(LEASE_TOKEN),
      workerIdentityHash: setup.registration.workerIdentityHash,
      registrationDigest: setup.registration.registrationDigest,
    },
    leaseToken: LEASE_TOKEN,
  };
}

function createEvidence(
  setup: ReturnType<typeof createSetup>,
  candidate: unknown,
): CaresLinkV1NoteProviderAttemptEvidence {
  const policy = setup.providerPolicies[0];
  const binding = createCaresLinkV1NoteProviderWorkerPolicyBinding({
    policySnapshot: policy,
    workerPolicy: setup.workerPolicy,
    startedAt: PROVIDER_STARTED_AT,
  });
  return createCaresLinkV1NoteProviderAttemptEvidence({
    policySnapshot: policy,
    workerPolicyBinding: binding,
    workerPolicy: setup.workerPolicy,
    candidate,
    finishedAt: PROVIDER_FINISHED_AT,
    finishReason: "COMPLETED",
    providerRequestId: "provider-request-private-001",
    usage: { status: "UNAVAILABLE", source: "UNAVAILABLE" },
    cost: { status: "UNAVAILABLE", source: "UNAVAILABLE" },
  });
}

function atomicSuccessDto(
  claim: CaresLinkV1RegisteredWorkerClaim,
  canonical: ReturnType<typeof buildCaresLinkV1CanonicalNoteContent>,
  evidence: CaresLinkV1NoteProviderAttemptEvidence,
) {
  const transactionId = IDS.transaction;
  const evidenceHash = sha256(stringifyCaresLinkV1CanonicalJson(evidence));
  const mutationReferenceHash = sha256(
    stringifyCaresLinkV1CanonicalJson({
      kind: "careslink.v1.note-generation-mutation",
      jobId: claim.job.jobId,
      attemptId: claim.attempt.attemptId,
      registrationDigest: claim.attempt.registrationDigest,
    }),
  );
  return {
    transaction: {
      transactionId,
      status: "COMMITTED",
      atomic: true,
      committedAt: COMMITTED_AT,
      registrationDigest: claim.attempt.registrationDigest,
    },
    canonical: {
      canonicalId: IDS.canonical,
      revisionId: IDS.revision,
      contentHash: canonical.contentHash,
      revisionNumber: 1,
      baseRevisionId: null,
    },
    syncReceipt: {
      transactionId,
      status: "APPENDED",
      kind: "DOCUMENT_UPSERTED",
      changeId: "1",
      canonicalId: IDS.canonical,
      revisionId: IDS.revision,
      contentHash: canonical.contentHash,
      serverTime: COMMITTED_AT,
    },
    mutationReceipt: {
      transactionId,
      status: "SERVER_ACKNOWLEDGED",
      mutationReferenceHash,
      mutationKind: "CREATE_DOCUMENT",
      canonicalId: IDS.canonical,
      revisionId: IDS.revision,
      contentHash: canonical.contentHash,
      serverTime: COMMITTED_AT,
    },
    jobTerminal: {
      transactionId,
      status: "SUCCEEDED",
      jobReferenceHash: sha256(claim.job.jobId),
      canonicalId: IDS.canonical,
      revisionId: IDS.revision,
      contentHash: canonical.contentHash,
      finishedAt: COMMITTED_AT,
    },
    attemptTerminal: {
      transactionId,
      status: "SUCCEEDED",
      attemptReferenceHash: sha256(claim.attempt.attemptId),
      contentHash: canonical.contentHash,
      providerEvidenceHash: evidenceHash,
      finishedAt: COMMITTED_AT,
    },
    payloadMetadata: {
      transactionId,
      state: "REVOKED",
      payloadDisposition: "REVOKED_PURGE_ENQUEUED",
      revokeReason: "SUCCEEDED",
      payloadReferenceHash: sha256(claim.job.payloadId),
      revokedAt: COMMITTED_AT,
    },
    purgeOutboxAcknowledgment: {
      transactionId,
      status: "ENQUEUED",
      reason: "SUCCEEDED",
      payloadReferenceHash: sha256(claim.job.payloadId),
      eventReferenceHash: sha256("purge-event-success"),
      enqueuedAt: COMMITTED_AT,
    },
  };
}

function atomicSettlementDto(
  claim: CaresLinkV1RegisteredWorkerClaim,
  settlement: {
    disposition: "RETRY_SCHEDULED" | "FAILED" | "CANCELLED";
    reason: CaresLinkV1RegisteredWorkerSettleReason;
    payloadDisposition: "RETAINED_FOR_RETRY" | "REVOKED_PURGE_ENQUEUED";
    baseDelayMs: number | null;
    jitterMs: number | null;
    retryDelayMs: number | null;
  },
  evidence: CaresLinkV1NoteProviderAttemptEvidence | null,
) {
  const retry = settlement.disposition === "RETRY_SCHEDULED";
  const transactionId = IDS.transaction;
  const evidenceHash = evidence
    ? sha256(stringifyCaresLinkV1CanonicalJson(evidence))
    : null;
  return {
    transaction: {
      transactionId,
      status: "COMMITTED",
      atomic: true,
      committedAt: COMMITTED_AT,
      registrationDigest: claim.attempt.registrationDigest,
    },
    settlement,
    jobTransition: {
      transactionId,
      status: retry ? "QUEUED" : settlement.disposition,
      jobReferenceHash: sha256(claim.job.jobId),
      nextEligibleAt: retry
        ? new Date(Date.parse(COMMITTED_AT) + (settlement.retryDelayMs ?? 0)).toISOString()
        : null,
      finishedAt: retry ? null : COMMITTED_AT,
    },
    attemptTerminal: {
      transactionId,
      status:
        settlement.disposition === "CANCELLED"
          ? "CANCELLED"
          : settlement.reason === "LEASE_EXPIRED"
            ? "LEASE_EXPIRED"
            : "FAILED",
      attemptReferenceHash: sha256(claim.attempt.attemptId),
      reason: settlement.reason,
      providerEvidenceHash: evidenceHash,
      finishedAt: COMMITTED_AT,
    },
    payloadMetadata: {
      transactionId,
      state: retry ? "AVAILABLE" : "REVOKED",
      payloadDisposition: retry
        ? "RETAINED_FOR_RETRY"
        : "REVOKED_PURGE_ENQUEUED",
      revokeReason: retry ? null : settlement.disposition,
      payloadReferenceHash: sha256(claim.job.payloadId),
      revokedAt: retry ? null : COMMITTED_AT,
    },
    purgeOutboxAcknowledgment: retry
      ? null
      : {
          transactionId,
          status: "ENQUEUED",
          reason: settlement.disposition,
          payloadReferenceHash: sha256(claim.job.payloadId),
          eventReferenceHash: sha256("purge-event-settlement"),
          enqueuedAt: COMMITTED_AT,
        },
  };
}

function attemptAck(claim: CaresLinkV1RegisteredWorkerClaim) {
  return {
    status: "RENEWED",
    jobReferenceHash: sha256(claim.job.jobId),
    attemptReferenceHash: sha256(claim.attempt.attemptId),
    registrationDigest: claim.attempt.registrationDigest,
  };
}

function fenceAck(
  claim: CaresLinkV1RegisteredWorkerClaim,
  fence: { fenceId: string; fenceDigest: string; expiresAt: string },
) {
  return {
    status: "FENCED",
    ...fence,
    jobReferenceHash: sha256(claim.job.jobId),
    attemptReferenceHash: sha256(claim.attempt.attemptId),
    registrationDigest: claim.attempt.registrationDigest,
  };
}

function payloadGrant(claim: CaresLinkV1RegisteredWorkerClaim) {
  return {
    status: "AUTHORIZED",
    grantId: IDS.grant,
    expiresAt: GRANT_EXPIRES_AT,
    jobReferenceHash: sha256(claim.job.jobId),
    attemptReferenceHash: sha256(claim.attempt.attemptId),
    payloadReferenceHash: sha256(claim.job.payloadId),
    registrationDigest: claim.attempt.registrationDigest,
  };
}

function payloadDeniedAndSettled(
  claim: CaresLinkV1RegisteredWorkerClaim,
  reason:
    | "SESSION_REVOKED"
    | "PRIVACY_REVIEW_STALE"
    | "PAYLOAD_UNAVAILABLE",
) {
  return {
    status: "DENIED_SETTLED",
    transactionId: IDS.transaction,
    transactionStatus: "COMMITTED",
    atomic: true,
    committedAt: COMMITTED_AT,
    registrationDigest: claim.attempt.registrationDigest,
    reason,
    jobReferenceHash: sha256(claim.job.jobId),
    attemptReferenceHash: sha256(claim.attempt.attemptId),
    payloadReferenceHash: sha256(claim.job.payloadId),
    jobStatus: "FAILED",
    attemptStatus: "FAILED",
    payloadState: "REVOKED",
    payloadDisposition: "REVOKED_PURGE_ENQUEUED",
    purgeEventReferenceHash: sha256(`purge-event-${reason}`),
  };
}

function vaultAuthorization(claim: CaresLinkV1RegisteredWorkerClaim) {
  return {
    status: "CONSUME_AUTHORIZED",
    vaultGrant: VAULT_GRANT,
    expiresAt: GRANT_EXPIRES_AT,
    grantReferenceHash: sha256(IDS.grant),
    jobReferenceHash: sha256(claim.job.jobId),
    attemptReferenceHash: sha256(claim.attempt.attemptId),
    payloadReferenceHash: sha256(claim.job.payloadId),
    registrationDigest: claim.attempt.registrationDigest,
    noteType: "communication",
    contractVersion: CARESLINK_V1_CONTRACT_VERSION,
    schemaVersion: CARESLINK_V1_NOTE_SCHEMA_VERSION,
    cleanedFactsHash: claim.job.cleanedFactsHash,
  };
}

function rpcError(message: string): CaresLinkV1RegisteredWorkerAdapterRpcResult {
  return { data: null, error: { message } };
}

function isRpcResult(value: unknown): value is CaresLinkV1RegisteredWorkerAdapterRpcResult {
  return Boolean(
    value &&
      typeof value === "object" &&
      Object.hasOwn(value, "data") &&
      Object.hasOwn(value, "error"),
  );
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
