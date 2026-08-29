import {
  createHash,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import { CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES } from "./communication-note-golden";

vi.mock("server-only", () => ({}));

import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_PREFLIGHT_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_PREFLIGHT_VERSION,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_EVIDENCE_PINS,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_PROJECT_REF_HMAC_VERSION,
  type CaresLinkV1CommunicationNotePreviewActivationPreflightCandidate,
} from "./communication-note-preview-activation-preflight.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_PREVIEW_EVALUATION,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_READY,
} from "./communication-note-preview-evaluation-policy";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_PREVIEW_RUNNER_POLICY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_READY,
} from "./communication-note-preview-evaluation-runner.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_OWNER_SIGNING_KEY,
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RECEIPT_SIGNING_KEY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_DOMAIN,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_VERSION,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZED_SLOTS,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EXECUTION_AUTHORITY_READY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_ATTESTATION_READY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_DOMAIN,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_VERSION,
  createCaresLinkV1CommunicationNotePreviewSigningMessage,
  verifyTestOnlyCaresLinkV1CommunicationNotePreviewAuthorization,
  type CaresLinkV1CommunicationNotePreviewAuthorizationStatement,
  type CaresLinkV1CommunicationNotePreviewDispatchReceiptStatement,
  type CaresLinkV1CommunicationNotePreviewReceiptOutcome,
  type CaresLinkV1CommunicationNotePreviewTrustedSigningKey,
  type CaresLinkV1VerifiedCommunicationNotePreviewAuthorization,
} from "./communication-note-preview-execution-authority.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_KEY_CUSTODY_SNAPSHOT,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_IDENTITIES_READY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_IDENTITY_HMAC_VERSION,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_READY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_VERSION,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PROVIDER_CORRELATION_HMAC_VERSION,
  validateTestOnlyCaresLinkV1CommunicationNotePreviewKeyCustodySnapshot,
  type CaresLinkV1CommunicationNotePreviewKeyCustodySnapshot,
} from "./communication-note-preview-key-custody.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_COORDINATOR_BLOCKED_REASONS,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_COORDINATOR_POLICY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_COORDINATOR_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_COORDINATOR_VERSION,
  createCaresLinkV1CommunicationNotePreviewReserveBeforeDispatchCoordinator,
  validateTestOnlyCaresLinkV1CommunicationNotePreviewCoordinatorTranscript,
} from "./communication-note-preview-reserve-before-dispatch-coordinator.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_VERSION,
} from "./communication-note-preview-runner-terminal-policy.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_EXTERNALLY_APPROVED_REQUEST_BODY_PIN,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_READY,
} from "./communication-note-preview-request-body-pin";
import { CARESLINK_V1_OPENAI_COMMUNICATION_NOTE_PROVIDER_READY } from "./communication-note-provider-policy";

const NOW = "2026-08-28T02:00:00.000Z";
const PREFLIGHT_OBSERVED_AT = "2026-08-28T01:59:00.000Z";

describe("Communication Note M1g-g reserve-before-dispatch coordinator transcript", () => {
  it("literal-pins a source-only policy and preserves every existing readiness and approval latch", () => {
    expect(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_COORDINATOR_VERSION).toBe(
      "coordinator.communication.openai.synthetic-preview.2026-08-29.m1g-g.v3",
    );
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_COORDINATOR_POLICY_DIGEST,
    ).toBe(
      "f6609c2f357b5fda92ae5aa1b459dfb1e32b7893c3e8436e0e94a8ffa2bbe675",
    );
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_COORDINATOR_POLICY,
    ).toMatchObject({
      status: "SOURCE_CONTRACT_ONLY_NO_EXECUTION_CAPABILITY",
      capability: "TEST_ONLY_TRANSCRIPT_VALIDATION",
      coordinatorReady: false,
      activationReady: false,
      dispatchCapability: "ABSENT",
      preRunDispatchApproved: false,
      postRunEvaluationAccepted: false,
      databaseContract: {
        reservationResultReservedAt:
          "PRESENT_SOURCE_ONLY_NOT_RUNTIME_EVIDENCE",
        runnerTerminalLedger:
          "PRESENT_SIGNED_SOURCE_CONTRACT_CALLER_SHELL_NO_RUNTIME_IDENTITY",
        runnerTerminalPolicyVersion:
          CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_VERSION,
        runnerTerminalPolicyDigest:
          CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST,
      },
      stateMachine: {
        ordering: "SERIAL_SLOT_INDEX_ASCENDING",
        continuation:
          "ONLY_RECORDED_COMPLETED_RECEIPT_AND_DURABLE_ACCEPTED_RUNNER_TERMINAL",
        automaticRetry: false,
        maximumAttemptsPerSlot: 1,
        maximumSlots: 6,
        replayAuthority: "ABSENT",
        responseLossAuthority: "ABSENT",
      },
      transcriptEvidence: {
        databaseAttestation: "ABSENT",
        providerAttestation: "ABSENT",
        wireBytesAuthority: "ABSENT",
        claimToken: "PROHIBITED_FROM_TRANSCRIPT",
        databaseReservedAt:
          "CANDIDATE_ONLY_RUNTIME_RPC_RESULT_NOT_OBTAINED",
      },
      runnerAcceptance: {
        reportStatus: "PASS",
        providerDeadlineMs: 30_000,
        exactCriticalChecks: [
          "STRICT_SCHEMA",
          "SHARED_OUTPUT_PRIVACY",
          "DATE_TIME_PARITY",
          "NUMERIC_PARITY",
          "DECISION_LANGUAGE",
          "REFUSAL_ABSENT",
          "HUMAN_SEMANTIC_GROUNDEDNESS",
        ],
        exactHumanReviewLocales: ["en", "zh-Hans", "zh-Hant"],
        providerCorrelation: "UNATTESTED_NO_SHARED_IDENTIFIER",
        durableTerminalState: "ABSENT",
      },
      purposeSeparation: {
        crossRoleReuse: "PROHIBITED",
        providerRequestHashReuse: "PROHIBITED",
        candidateDigestSameRoleReuse: "ALLOWED",
        fixtureDigestSameRoleReuse: "ALLOWED",
      },
    });
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_COORDINATOR_BLOCKED_REASONS,
    ).toEqual([
      "ACTIVATION_PREFLIGHT_REMAINS_BLOCKED",
      "PRE_RUN_DISPATCH_APPROVAL_ABSENT",
      "PURPOSE_SCOPED_RUNTIME_IDENTITY_NOT_ACTIVATED",
      "DATABASE_ATTESTED_RESERVED_AT_ABSENT",
      "DURABLE_RUNNER_TERMINAL_STATE_ABSENT",
    ]);
    expect([
      CARESLINK_V1_OPENAI_COMMUNICATION_NOTE_PROVIDER_READY,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EVALUATION_READY,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_READY,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_REQUEST_BODY_PIN_READY,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_EXECUTION_AUTHORITY_READY,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_ATTESTATION_READY,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_READY,
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_IDENTITIES_READY,
    ]).toEqual(Array.from({ length: 8 }, () => false));
    expect([
      CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_PREVIEW_EVALUATION,
      CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_PREVIEW_RUNNER_POLICY,
      CARESLINK_V1_COMMUNICATION_NOTE_EXTERNALLY_APPROVED_REQUEST_BODY_PIN,
      CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_OWNER_SIGNING_KEY,
      CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RECEIPT_SIGNING_KEY,
      CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_KEY_CUSTODY_SNAPSHOT,
    ]).toEqual(Array.from({ length: 6 }, () => undefined));
    expectFixedFailure(() =>
      createCaresLinkV1CommunicationNotePreviewReserveBeforeDispatchCoordinator(),
    );
  });

  it("validates and sanitizes one exact six-slot signed transcript without creating authority", () => {
    const fixture = createFixture();
    const result = validate(fixture);

    expect(result).toMatchObject({
      authenticity: "UNATTESTED_INJECTED_TEST_TRANSCRIPT",
      coordinatorReady: false,
      activationReady: false,
      dispatchCapability: "ABSENT",
      preRunDispatchApproved: false,
      postRunEvaluationAccepted: false,
      activationBlockedReasons: [
        "EXTERNAL_PROVENANCE_NOT_AUTHENTICATED",
        "RUNTIME_IDENTITIES_NOT_PROVISIONED",
        "KEY_RESOLVERS_AND_TRANSPORT_ABSENT",
        "HUMAN_REVIEW_NOT_COMPLETED",
        "FINAL_RUN_APPROVAL_ABSENT",
      ],
      coordinatorBlockedReasons: [
        "ACTIVATION_PREFLIGHT_REMAINS_BLOCKED",
        "PRE_RUN_DISPATCH_APPROVAL_ABSENT",
        "PURPOSE_SCOPED_RUNTIME_IDENTITY_NOT_ACTIVATED",
        "DATABASE_ATTESTED_RESERVED_AT_ABSENT",
        "DURABLE_RUNNER_TERMINAL_STATE_ABSENT",
      ],
    });
    expect(result.transcript.slots).toHaveLength(6);
    expect(result.transcript.runnerPreflight.slots).toHaveLength(6);
    expect(
      result.transcript.slots.map(
        (slot) => slot.receiptVerification.outcome,
      ),
    ).toEqual(Array.from({ length: 6 }, () => "COMPLETED"));
    expect(result.transcript.terminalState).toBe(
      "TEST_TRANSCRIPT_COMPLETE_NOT_ACTIVATION_AUTHORITY",
    );
    expect(result.transcriptDigest).toBe(
      createCanonicalSha256(result.transcript),
    );
    expectRecursivelyFrozen(result);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(fixture.receiptSignatures[0]);
    for (const forbidden of [
      '"claimToken"',
      '"requestBody"',
      '"prompt"',
      '"cleanedFacts"',
      '"observable_facts"',
      '"outputText"',
      '"apiKey"',
      '"privateKey"',
      "Bearer ",
      "https://",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it.each([
    "PROVIDER_HTTP_ERROR",
    "TRANSPORT_AMBIGUOUS",
    "LOCAL_PRE_DISPATCH_ABORTED",
  ] as const)(
    "accepts %s only as an irreversible recorded terminal outcome",
    (outcome) => {
      const fixture = createFixture({ terminalOutcome: outcome, slotCount: 3 });
      const result = validate(fixture);
      expect(result.transcript.slots).toHaveLength(3);
      expect(result.transcript.slots[2].receiptVerification.outcome).toBe(
        outcome,
      );
      expect(result.transcript.slots[2].transport === null).toBe(
        outcome === "LOCAL_PRE_DISPATCH_ABORTED",
      );
      expect(result.transcript.terminalState).toBe(
        "TEST_TRANSCRIPT_TERMINAL_NO_RETRY",
      );
    },
  );

  it("fails closed on replay, ordering, source, slot, caller and persistence drift", () => {
    const mutations: readonly ((fixture: Fixture) => void)[] = [
      (fixture) => {
        (
          fixture.transcript.sourceBindings as unknown as MutableRecord
        ).authorityPolicyDigest = hex("f");
      },
      (fixture) => {
        fixture.transcript.authorizationRegistration.state =
          "AUTHORIZATION_REPLAYED";
      },
      (fixture) => {
        fixture.transcript.authorizationRegistration.callerIdentityHmac =
          hex("f");
      },
      (fixture) => {
        fixture.transcript.authorizationRegistration.authorizationSignatureSha256 =
          hex("f");
      },
      (fixture) => {
        fixture.transcript.claim.state = "ALREADY_CLAIMED";
      },
      (fixture) => {
        fixture.transcript.claim.authorizationDigest = hex("f");
      },
      (fixture) => {
        fixture.transcript.claim.executorIdentityHmac = hex("f");
      },
      (fixture) => {
        fixture.transcript.slots[1].reservation.reservationId =
          fixture.transcript.slots[0].reservation.reservationId;
      },
      (fixture) => {
        fixture.transcript.slots[1].reservation.clientRequestIdHmac =
          fixture.transcript.slots[0].reservation.clientRequestIdHmac;
      },
      (fixture) => {
        fixture.transcript.slots[0].reservation.clientRequestIdHmac =
          fixture.transcript.sourceBindings.authorizationDigest;
      },
      (fixture) => {
        fixture.transcript.slots[2].reservation.slotIndex = 1;
      },
      (fixture) => {
        fixture.transcript.slots[2].reservation.claimId =
          "30000000-0000-4000-8000-000000000001";
      },
      (fixture) => {
        fixture.transcript.slots[2].reservation.requestBodySha256 = hex("f");
      },
      (fixture) => {
        fixture.transcript.slots[2].reservation.state = "ALREADY_RESERVED";
      },
      (fixture) => {
        fixture.transcript.slots[2].transport!.reservationId =
          fixture.transcript.slots[1].reservation.reservationId;
      },
      (fixture) => {
        fixture.transcript.slots[2].receiptPersistence.receiptDigest = hex("f");
      },
      (fixture) => {
        fixture.transcript.slots[2].receiptPersistence.callerIdentityHmac =
          hex("f");
      },
      (fixture) => {
        fixture.transcript.runnerPreflight.slots[0].preflightInputTokens = 0;
      },
      (fixture) => {
        fixture.transcript.slots[2].runnerAcceptance = null;
      },
      (fixture) => {
        fixture.transcript.slots[2].runnerAcceptance!.runIdHash = hex("f");
      },
      (fixture) => {
        fixture.transcript.slots[2].runnerAcceptance!.receiptDigest =
          hex("f");
      },
      (fixture) => {
        fixture.transcript.slots[2].runnerAcceptance!.reservationId =
          "30000000-0000-4000-8000-000000000001";
      },
      (fixture) => {
        fixture.transcript.slots[2].runnerAcceptance!.receiptProviderCorrelation =
          "VERIFIED";
      },
      (fixture) => {
        const checks = fixture.transcript.slots[2].runnerAcceptance!
          .criticalChecks as MutableRecord;
        checks.STRICT_SCHEMA = false;
      },
      (fixture) => {
        fixture.transcript.slots[2].runnerAcceptance!.calculatedCostUpperBoundMicroUsd =
          331;
      },
      (fixture) => {
        fixture.transcript.terminalState =
          "TEST_TRANSCRIPT_TERMINAL_NO_RETRY";
      },
      (fixture) => {
        Object.assign(fixture.transcript.claim, {
          claimToken: "must-not-leak",
        });
      },
    ];

    for (const mutate of mutations) {
      const fixture = createFixture();
      mutate(fixture);
      expectFixedFailure(() => validate(fixture));
    }
  });

  it("rejects continuation after a non-completed receipt and incomplete all-completed transcripts", () => {
    const terminal = createFixture({
      terminalOutcome: "TRANSPORT_AMBIGUOUS",
      slotCount: 3,
    });
    const trailingSlot = createFixture().transcript.slots[3];
    terminal.transcript.slots.push(trailingSlot);
    expectFixedFailure(() => validate(terminal));

    const incomplete = createFixture();
    incomplete.transcript.slots.length = 5;
    expectFixedFailure(() => validate(incomplete));
  });

  it("models provider-completed runner failure as terminal while keeping its durable gate blocked", () => {
    const fixture = createFixture({
      runnerFailureReason: "HUMAN_REVIEW_FAILED",
      slotCount: 3,
    });
    const result = validate(fixture);
    expect(result.transcript.slots[2]).toMatchObject({
      receiptVerification: { outcome: "COMPLETED" },
      runnerAcceptance: null,
      runnerFailure: {
        state: "RUNNER_SLOT_FAILED_TEST_CANDIDATE",
        reason: "HUMAN_REVIEW_FAILED",
        noRetry: true,
        durableTerminalState: "ABSENT_TEST_CANDIDATE_ONLY",
      },
    });
    expect(result.transcript.terminalState).toBe(
      "TEST_TRANSCRIPT_TERMINAL_NO_RETRY",
    );
    expect(result.coordinatorBlockedReasons).toContain(
      "DURABLE_RUNNER_TERMINAL_STATE_ABSENT",
    );

    const continuation = createFixture({
      runnerFailureReason: "HUMAN_REVIEW_FAILED",
      slotCount: 3,
    });
    continuation.transcript.slots.push(createFixture().transcript.slots[3]);
    expectFixedFailure(() => validate(continuation));

    const drift = createFixture({
      runnerFailureReason: "HUMAN_REVIEW_FAILED",
      slotCount: 3,
    });
    drift.transcript.slots[2].runnerFailure!.receiptDigest = hex("f");
    expectFixedFailure(() => validate(drift));

    const contradictory = createFixture({
      runnerFailureReason: "HUMAN_REVIEW_FAILED",
      slotCount: 3,
    });
    contradictory.transcript.slots[2].runnerAcceptance =
      createFixture().transcript.slots[2].runnerAcceptance;
    expectFixedFailure(() => validate(contradictory));
  });

  it("allows only an exact receipt-persistence replay and never adds another transport event", () => {
    const fixture = createFixture();
    fixture.transcript.slots[1].receiptPersistence.writeDisposition =
      "EXACT_REPLAY_TEST_CANDIDATE";
    const result = validate(fixture);
    expect(
      result.transcript.slots[1].receiptPersistence.writeDisposition,
    ).toBe("EXACT_REPLAY_TEST_CANDIDATE");
    expect(result.transcript.slots[1].transport?.state).toBe(
      "TRANSPORT_ENTERED_TEST_CANDIDATE",
    );

    const drift = createFixture();
    drift.transcript.slots[1].receiptPersistence.writeDisposition =
      "DRIFTED_REPLAY";
    expectFixedFailure(() => validate(drift));
  });

  it("requires no transport before a local abort and an irreversible transport latch for every other outcome", () => {
    const localAbort = createFixture({
      terminalOutcome: "LOCAL_PRE_DISPATCH_ABORTED",
      slotCount: 1,
    });
    localAbort.transcript.slots[0].transport =
      createFixture().transcript.slots[0].transport;
    expectFixedFailure(() => validate(localAbort));

    const completed = createFixture();
    completed.transcript.slots[0].transport = null;
    expectFixedFailure(() => validate(completed));

    const terminal = createFixture({
      terminalOutcome: "PROVIDER_HTTP_ERROR",
      slotCount: 1,
    });
    terminal.transcript.slots[0].runnerAcceptance =
      createFixture().transcript.slots[0].runnerAcceptance;
    expectFixedFailure(() => validate(terminal));
  });

  it("requires the durable claim candidate to retain at least five authorization minutes", () => {
    const fixture = createFixture({
      authorizationExpiresAt: "2026-08-28T02:04:02.000Z",
      preflightExpiresAt: "2026-08-28T02:04:02.000Z",
    });
    expectFixedFailure(() => validate(fixture));
  });

  it("cryptographically rejects receipt drift and rejects candidate reservedAt or event time inversion", () => {
    const signatureDrift = createFixture();
    signatureDrift.transcript.slots[0].receiptVerification.envelope.statement = {
      ...signatureDrift.transcript.slots[0].receiptVerification.envelope
        .statement,
      clientRequestIdHmac: hex("f"),
    };
    expectFixedFailure(() => validate(signatureDrift));

    const reservedAtDrift = createFixture();
    reservedAtDrift.transcript.slots[0].receiptVerification.databaseReservedAtCandidate =
      timestamp(59);
    expectFixedFailure(() => validate(reservedAtDrift));

    const timeInversion = createFixture();
    timeInversion.transcript.slots[1].reservation.databaseReservedAtCandidate =
      timestamp(2);
    expectFixedFailure(() => validate(timeInversion));
  });

  it("rejects globally reused provider correlation HMACs even when every receipt is validly re-signed", () => {
    const fixture = createFixture();
    const firstRequestHmac =
      fixture.transcript.slots[0].receiptVerification.envelope.statement
        .transport.openAiRequestIdHmac;
    const secondReceipt =
      fixture.transcript.slots[1].receiptVerification.envelope.statement;
    fixture.transcript.slots[1].receiptVerification.envelope.statement = {
      ...secondReceipt,
      transport: {
        ...secondReceipt.transport,
        openAiRequestIdHmac: firstRequestHmac,
      },
    };
    resignReceipt(fixture, 1);
    expectFixedFailure(() => validate(fixture));

    const runnerFixture = createFixture();
    runnerFixture.transcript.slots[1].runnerAcceptance!.providerRequestIdHash =
      runnerFixture.transcript.slots[0].runnerAcceptance!
        .providerRequestIdHash;
    expectFixedFailure(() => validate(runnerFixture));

    const providerToCandidate = createFixture();
    providerToCandidate.transcript.slots[1].runnerAcceptance!.candidateDigest =
      providerToCandidate.transcript.slots[0].runnerAcceptance!
        .providerRequestIdHash;
    expectFixedFailure(() => validate(providerToCandidate));

    const candidateToProvider = createFixture();
    candidateToProvider.transcript.slots[1].runnerAcceptance!.providerRequestIdHash =
      candidateToProvider.transcript.slots[0].runnerAcceptance!
        .candidateDigest;
    expectFixedFailure(() => validate(candidateToProvider));

    const candidateToClient = createFixture();
    candidateToClient.transcript.slots[1].reservation.clientRequestIdHmac =
      candidateToClient.transcript.slots[0].runnerAcceptance!.candidateDigest;
    expectFixedFailure(() => validate(candidateToClient));

    const candidateToTransport = createFixture();
    const transportReceipt =
      candidateToTransport.transcript.slots[1].receiptVerification.envelope
        .statement;
    candidateToTransport.transcript.slots[1].receiptVerification.envelope.statement =
      {
        ...transportReceipt,
        transport: {
          ...transportReceipt.transport,
          openAiRequestIdHmac:
            candidateToTransport.transcript.slots[0].runnerAcceptance!
              .candidateDigest as string,
        },
      };
    resignReceipt(candidateToTransport, 1);
    expectFixedFailure(() => validate(candidateToTransport));

    const fixtureToProvider = createFixture();
    fixtureToProvider.transcript.slots[1].runnerAcceptance!.providerRequestIdHash =
      fixtureToProvider.transcript.slots[0].runnerAcceptance!.fixtureDigest;
    expectFixedFailure(() => validate(fixtureToProvider));
  });

  it("mirrors runner reconciliation relationships instead of accepting impossible report evidence", () => {
    const reportedNull = createFixture();
    (
      reportedNull.transcript.slots[0].runnerAcceptance!.usage as MutableRecord
    ).reasoningTokensReconciliation = "REPORTED";
    expectFixedFailure(() => validate(reportedNull));

    const unavailableValue = createFixture();
    const unavailableStatement =
      unavailableValue.transcript.slots[0].receiptVerification.envelope
        .statement;
    if (unavailableStatement.usage === null) {
      throw new Error("test receipt usage is unavailable");
    }
    unavailableValue.transcript.slots[0].receiptVerification.envelope.statement =
      {
        ...unavailableStatement,
        usage: { ...unavailableStatement.usage, reasoningTokens: 1 },
      };
    (
      unavailableValue.transcript.slots[0].runnerAcceptance!
        .usage as MutableRecord
    ).reasoningTokens = 1;
    resignReceipt(unavailableValue, 0);
    expectFixedFailure(() => validate(unavailableValue));

    const assumedNonZero = createFixture();
    const assumedStatement =
      assumedNonZero.transcript.slots[0].receiptVerification.envelope.statement;
    if (assumedStatement.usage === null) {
      throw new Error("test receipt usage is unavailable");
    }
    const cachedUsage = { ...assumedStatement.usage, cachedInputTokens: 1 };
    const cachedCost = calculateTestCostMicroUsd(cachedUsage);
    assumedNonZero.transcript.slots[0].receiptVerification.envelope.statement =
      {
        ...assumedStatement,
        usage: cachedUsage,
        calculatedCostUpperBoundMicroUsd: cachedCost,
      };
    Object.assign(
      assumedNonZero.transcript.slots[0].runnerAcceptance!
        .usage as MutableRecord,
      {
        cachedInputTokens: 1,
        cachedInputTokensReconciliation: "ASSUMED_ZERO",
      },
    );
    assumedNonZero.transcript.slots[0].runnerAcceptance!.calculatedCostUpperBoundMicroUsd =
      cachedCost;
    resignReceipt(assumedNonZero, 0);
    expectFixedFailure(() => validate(assumedNonZero));
  });

  it("rejects non-local provider observations beyond the bound 30-second runner deadline", () => {
    const fixture = createFixture({
      terminalOutcome: "PROVIDER_HTTP_ERROR",
      slotCount: 1,
    });
    fixture.transcript.slots[0].receiptVerification.envelope.statement = {
      ...fixture.transcript.slots[0].receiptVerification.envelope.statement,
      observedAt: timestamp(40),
    };
    fixture.transcript.slots[0].receiptVerification.observedAt = timestamp(41);
    fixture.transcript.slots[0].receiptPersistence.observedAt = timestamp(42);
    resignReceipt(fixture, 0);
    expectFixedFailure(() => validate(fixture));

    const ambiguous = createFixture({
      terminalOutcome: "TRANSPORT_AMBIGUOUS",
      slotCount: 1,
    });
    ambiguous.transcript.slots[0].receiptVerification.envelope.statement = {
      ...ambiguous.transcript.slots[0].receiptVerification.envelope.statement,
      observedAt: timestamp(40),
    };
    ambiguous.transcript.slots[0].receiptVerification.observedAt =
      timestamp(41);
    ambiguous.transcript.slots[0].receiptPersistence.observedAt =
      timestamp(42);
    resignReceipt(ambiguous, 0);
    expect(validate(ambiguous).transcript.terminalState).toBe(
      "TEST_TRANSCRIPT_TERMINAL_NO_RETRY",
    );
  });

  it("rejects getters, proxies, aliases and oversized or deeply nested input with one sanitized error", () => {
    const fixture = createFixture();
    const getterCandidate = { ...fixture.transcript };
    Object.defineProperty(getterCandidate, "status", {
      enumerable: true,
      get() {
        throw new Error("must-not-leak getter");
      },
    });
    expectFixedFailure(() =>
      validateTestOnlyCaresLinkV1CommunicationNotePreviewCoordinatorTranscript(
        getterCandidate,
        fixture.options,
      ),
    );
    expectFixedFailure(() =>
      validateTestOnlyCaresLinkV1CommunicationNotePreviewCoordinatorTranscript(
        new Proxy(fixture.transcript, {}),
        fixture.options,
      ),
    );

    const alias = createFixture();
    alias.transcript.slots[1] = alias.transcript.slots[0];
    expectFixedFailure(() => validate(alias));

    let deeplyNested: Record<string, unknown> = {};
    for (let depth = 0; depth < 34; depth += 1) {
      deeplyNested = { next: deeplyNested };
    }
    expectFixedFailure(() =>
      validateTestOnlyCaresLinkV1CommunicationNotePreviewCoordinatorTranscript(
        deeplyNested,
        fixture.options,
      ),
    );

    const oversized: unknown[] = [];
    oversized.length = 257;
    expectFixedFailure(() =>
      validateTestOnlyCaresLinkV1CommunicationNotePreviewCoordinatorTranscript(
        oversized,
        fixture.options,
      ),
    );
  });
});

function validate(fixture: Fixture) {
  return validateTestOnlyCaresLinkV1CommunicationNotePreviewCoordinatorTranscript(
    fixture.transcript,
    fixture.options,
  );
}

type MutableRecord = Record<string, unknown>;
type MutableSlot = {
  reservation: MutableRecord;
  transport: MutableRecord | null;
  receiptVerification: {
    state: string;
    observedAt: string;
    databaseReservedAtCandidate: string;
    envelope: {
      statement: CaresLinkV1CommunicationNotePreviewDispatchReceiptStatement;
      signature: string;
    };
    evidence: string;
  };
  receiptPersistence: MutableRecord;
  runnerAcceptance: MutableRecord | null;
  runnerFailure: MutableRecord | null;
};
type Fixture = ReturnType<typeof createFixture>;

function createFixture(
  input: Readonly<{
    terminalOutcome?: Exclude<
      CaresLinkV1CommunicationNotePreviewReceiptOutcome,
      "COMPLETED"
    >;
    slotCount?: number;
    authorizationExpiresAt?: string;
    preflightExpiresAt?: string;
    runnerFailureReason?: "HUMAN_REVIEW_FAILED";
  }> = {},
) {
  const ownerSigner = createSigningFixture("OWNER_AUTHORIZATION");
  const receiptSigner = createSigningFixture("CARESLINK_DISPATCH_RECEIPT");
  const runnerTerminalSigner = createRunnerTerminalSigningFixture();
  const authorizationStatement = createAuthorizationStatement(
    ownerSigner.trustedKey,
    input.authorizationExpiresAt,
  );
  const verifiedAuthorization =
    verifyTestOnlyCaresLinkV1CommunicationNotePreviewAuthorization(
      {
        statement: authorizationStatement,
        signature: signStatement(
          authorizationStatement,
          ownerSigner.privateKey,
        ),
      },
      {
        trustedKeySnapshot: ownerSigner.trustedKey,
        now: NOW,
        expected: {
          ownerSubjectHmac: authorizationStatement.ownerSubjectHmac,
          tenantScopeHmac: authorizationStatement.tenantScopeHmac,
          runIdHash: authorizationStatement.runIdHash,
        },
      },
    );
  const custodySnapshot =
    validateTestOnlyCaresLinkV1CommunicationNotePreviewKeyCustodySnapshot(
      createCustodySnapshot(
        ownerSigner.trustedKey,
        receiptSigner.trustedKey,
        runnerTerminalSigner.trustedKey,
        verifiedAuthorization,
      ),
      { now: NOW, verifiedAuthorization },
    );
  const preflightCandidate = createPreflightCandidate(
    verifiedAuthorization,
    custodySnapshot,
    input.preflightExpiresAt,
  );
  const slotCount = input.slotCount ?? 6;
  const slots: MutableSlot[] = [];
  const receiptSignatures: string[] = [];
  for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
    const outcome =
      slotIndex === slotCount - 1 && input.terminalOutcome
        ? input.terminalOutcome
        : "COMPLETED";
    const runnerFailureReason =
      slotIndex === slotCount - 1 ? input.runnerFailureReason : undefined;
    const slot = createSlot(
      slotIndex,
      outcome,
      receiptSigner.privateKey,
      receiptSigner.trustedKey,
      verifiedAuthorization,
      requireCallerIdentity(custodySnapshot, "RECEIPT_PERSISTENCE"),
      runnerFailureReason,
    );
    slots.push(slot.value);
    receiptSignatures.push(slot.signature);
  }
  const transcript = {
    version: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_COORDINATOR_VERSION,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_COORDINATOR_POLICY_DIGEST,
    status: "TEST_ONLY_TRANSCRIPT_NOT_EXECUTABLE",
    observedAt: NOW,
    sourceBindings: {
      activationPreflightPolicyDigest:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_PREFLIGHT_POLICY_DIGEST,
      activationPreflightCandidateDigest:
        createCanonicalSha256(preflightCandidate),
      authorityPolicyDigest:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY_DIGEST,
      keyCustodyPolicyDigest:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST,
      custodySnapshotDigest: createCanonicalSha256(custodySnapshot),
      ...CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS,
      authorizationDigest: verifiedAuthorization.authorizationDigest,
      runIdHash: verifiedAuthorization.statement.runIdHash,
    },
    authorizationRegistration: {
      state: "AUTHORIZATION_REGISTERED_TEST_CANDIDATE_NOT_DB_ATTESTED",
      observedAt: timestamp(1),
      authorizationDigest: verifiedAuthorization.authorizationDigest,
      authorizationSignatureSha256:
        verifiedAuthorization.signatureSha256,
      runIdHash: verifiedAuthorization.statement.runIdHash,
      callerIdentityHmac: requireCallerIdentity(
        custodySnapshot,
        "AUTHORIZATION_REGISTRATION",
      ),
      evidence: "UNATTESTED_TEST_ONLY",
    },
    runnerPreflight: {
      state: "RUNNER_PREFLIGHT_ACCEPTED_TEST_CANDIDATE",
      observedAt: timestamp(2),
      runnerPolicyDigest:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS
          .runnerPolicyDigest,
      requestBodyPinBundleDigest:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS
          .requestBodyPinBundleDigest,
      projectedCostMicroUsdPerCall: 20_130,
      projectedCostMicroUsd: 120_780,
      maximumRunCostMicroUsd: 250_000,
      slots: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZED_SLOTS.map(
        (slot) => ({ ...slot, preflightInputTokens: 100 }),
      ),
      evidence: "UNATTESTED_TEST_ONLY",
    },
    claim: {
      state: "CLAIM_GRANTED_TEST_CANDIDATE_NOT_DB_ATTESTED",
      observedAt: timestamp(3),
      claimId: "10000000-0000-4000-8000-000000000010",
      executorIdentityHmac: requireCallerIdentity(
        custodySnapshot,
        "DISPATCH",
      ),
      authorizationDigest: verifiedAuthorization.authorizationDigest,
      runIdHash: verifiedAuthorization.statement.runIdHash,
      authorityPolicyDigest:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY_DIGEST,
      requestBodyPinBundleDigest:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS
          .requestBodyPinBundleDigest,
      runnerPolicyDigest:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS
          .runnerPolicyDigest,
      evidence: "UNATTESTED_TEST_ONLY",
    },
    slots,
    terminalState: input.terminalOutcome || input.runnerFailureReason
      ? "TEST_TRANSCRIPT_TERMINAL_NO_RETRY"
      : "TEST_TRANSCRIPT_COMPLETE_NOT_ACTIVATION_AUTHORITY",
  };
  return {
    transcript,
    receiptSignatures,
    receiptPrivateKey: receiptSigner.privateKey,
    options: {
      now: NOW,
      preflightCandidate,
      verifiedAuthorization,
      custodySnapshot,
    },
  };
}

function resignReceipt(fixture: Fixture, slotIndex: number) {
  const receiptVerification =
    fixture.transcript.slots[slotIndex].receiptVerification;
  const signature = signStatement(
    receiptVerification.envelope.statement,
    fixture.receiptPrivateKey,
  );
  receiptVerification.envelope.signature = signature;
  fixture.transcript.slots[slotIndex].receiptPersistence.receiptDigest =
    createCanonicalSha256(receiptVerification.envelope.statement);
  fixture.transcript.slots[slotIndex].receiptPersistence.signatureSha256 =
    sha256(signature);
  const runnerAcceptance =
    fixture.transcript.slots[slotIndex].runnerAcceptance;
  if (runnerAcceptance !== null) {
    runnerAcceptance.receiptDigest =
      fixture.transcript.slots[slotIndex].receiptPersistence.receiptDigest;
    runnerAcceptance.receiptSignatureSha256 =
      fixture.transcript.slots[slotIndex].receiptPersistence.signatureSha256;
  }
  const runnerFailure = fixture.transcript.slots[slotIndex].runnerFailure;
  if (runnerFailure !== null) {
    runnerFailure.receiptDigest =
      fixture.transcript.slots[slotIndex].receiptPersistence.receiptDigest;
    runnerFailure.receiptSignatureSha256 =
      fixture.transcript.slots[slotIndex].receiptPersistence.signatureSha256;
  }
}

function createSlot(
  slotIndex: number,
  outcome: CaresLinkV1CommunicationNotePreviewReceiptOutcome,
  privateKey: KeyObject,
  trustedKey: CaresLinkV1CommunicationNotePreviewTrustedSigningKey,
  authorization: CaresLinkV1VerifiedCommunicationNotePreviewAuthorization,
  receiptCallerIdentityHmac: string,
  runnerFailureReason?: "HUMAN_REVIEW_FAILED",
) {
  const slot = CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZED_SLOTS[
    slotIndex
  ];
  if (!slot) throw new Error("test slot is unavailable");
  const reservationId = `20000000-0000-4000-8000-${String(slotIndex + 1).padStart(12, "0")}`;
  const clientRequestIdHmac = sha256(`client-request-${slotIndex}`);
  const baseSecond = 4 + slotIndex * 9;
  const databaseReservedAtCandidate = timestamp(baseSecond);
  const reservationObservedAt = timestamp(baseSecond + 1);
  const transportObservedAt = timestamp(baseSecond + 2);
  const receiptStatementObservedAt = timestamp(baseSecond + 3);
  const receiptVerificationObservedAt = timestamp(baseSecond + 4);
  const receiptPersistenceObservedAt = timestamp(baseSecond + 5);
  const runnerAcceptanceObservedAt = timestamp(baseSecond + 6);
  const usage =
    outcome === "COMPLETED"
      ? {
          source: "PROVIDER" as const,
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          cachedInputTokens: 0,
          reasoningTokens: null,
        }
      : null;
  const calculatedCostUpperBoundMicroUsd =
    usage === null ? (outcome === "LOCAL_PRE_DISPATCH_ABORTED" ? 0 : null) : 330;
  const transport =
    outcome === "COMPLETED"
      ? {
          httpStatus: 200,
          openAiRequestIdHmac: sha256(`openai-request-${slotIndex}`),
          openAiResponseIdHmac: sha256(`openai-response-${slotIndex}`),
        }
      : outcome === "PROVIDER_HTTP_ERROR"
        ? {
            httpStatus: 500,
            openAiRequestIdHmac: sha256(`openai-request-${slotIndex}`),
            openAiResponseIdHmac: null,
          }
        : {
            httpStatus: null,
            openAiRequestIdHmac: null,
            openAiResponseIdHmac: null,
          };
  const statement = {
    domain: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_DOMAIN,
    version: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_VERSION,
    authorizationDigest: authorization.authorizationDigest,
    claimId: "10000000-0000-4000-8000-000000000010",
    runIdHash: authorization.statement.runIdHash,
    reservationId,
    slotIndex: slot.slotIndex,
    fixtureId: slot.fixtureId,
    runOrdinal: slot.runOrdinal,
    requestBodySha256: slot.requestBodySha256,
    requestBodyUtf8ByteLength: slot.requestBodyUtf8ByteLength,
    semanticCanonicalRequestSha256:
      slot.semanticCanonicalRequestSha256,
    clientRequestIdHmac,
    outcome,
    transport,
    usage,
    calculatedCostUpperBoundMicroUsd,
    observedAt: receiptStatementObservedAt,
    noRetry: true,
    authenticity: "CARESLINK_SIGNED_INTERNAL_OBSERVATION",
    providerAttestation: "ABSENT",
    transportScope: "APPLICATION_ENVELOPE_AND_TLS_CLIENT_OBSERVATION",
    notProofOf: [
      "EXACT_PROVIDER_RECEIPT",
      "BILLING",
      "MODEL_EXECUTION",
      "EXACTLY_ONCE",
    ],
    signerKeyIdHash: sha256(trustedKey.keyId),
    signerPublicKeySha256: trustedKey.publicKeySha256,
  } satisfies CaresLinkV1CommunicationNotePreviewDispatchReceiptStatement;
  const signature = signStatement(statement, privateKey);
  const receiptDigest = createCanonicalSha256(statement);
  const signatureSha256 = sha256(signature);
  return {
    signature,
    value: {
      reservation: {
        state: "RESERVATION_GRANTED_TEST_CANDIDATE_NOT_DB_ATTESTED",
        observedAt: reservationObservedAt,
        databaseReservedAtCandidate,
        reservationId,
        claimId: "10000000-0000-4000-8000-000000000010",
        authorizationDigest: authorization.authorizationDigest,
        runIdHash: authorization.statement.runIdHash,
        slotIndex: slot.slotIndex,
        fixtureId: slot.fixtureId,
        runOrdinal: slot.runOrdinal,
        requestBodySha256: slot.requestBodySha256,
        requestBodyUtf8ByteLength: slot.requestBodyUtf8ByteLength,
        semanticCanonicalRequestSha256:
          slot.semanticCanonicalRequestSha256,
        clientRequestIdHmac,
        attemptNumber: 1,
        automaticRetry: false,
        evidence: "UNATTESTED_TEST_ONLY",
      },
      transport:
        outcome === "LOCAL_PRE_DISPATCH_ABORTED"
          ? null
          : {
              state: "TRANSPORT_ENTERED_TEST_CANDIDATE",
              observedAt: transportObservedAt,
              reservationId,
              slotIndex: slot.slotIndex,
              requestBodySha256: slot.requestBodySha256,
              requestBodyUtf8ByteLength: slot.requestBodyUtf8ByteLength,
              clientRequestIdHmac,
              wireBytesAuthority: "ABSENT_SOURCE_ONLY",
            },
      receiptVerification: {
        state: "RECEIPT_SIGNATURE_VERIFIED_TEST_CANDIDATE",
        observedAt: receiptVerificationObservedAt,
        databaseReservedAtCandidate,
        envelope: { statement, signature },
        evidence: "TEST_ONLY_SIGNATURE_CHECK_NOT_DB_ATTESTATION",
      },
      receiptPersistence: {
        state: "RECEIPT_RECORDED_TEST_CANDIDATE_NOT_DB_ATTESTED",
        observedAt: receiptPersistenceObservedAt,
        receiptDigest,
        signatureSha256,
        outcome,
        callerIdentityHmac: receiptCallerIdentityHmac,
        writeDisposition: "FIRST_INSERT_TEST_CANDIDATE",
        evidence: "UNATTESTED_TEST_ONLY",
      },
      runnerAcceptance:
        outcome === "COMPLETED" && runnerFailureReason === undefined
          ? {
              state: "RUNNER_SLOT_ACCEPTED_TEST_CANDIDATE",
              observedAt: runnerAcceptanceObservedAt,
              authorizationDigest: authorization.authorizationDigest,
              runIdHash: authorization.statement.runIdHash,
              claimId: "10000000-0000-4000-8000-000000000010",
              reservationId,
              receiptDigest,
              receiptSignatureSha256: signatureSha256,
              slotIndex: slot.slotIndex,
              fixtureId: slot.fixtureId,
              runOrdinal: slot.runOrdinal,
              fixtureDigest: createCanonicalSha256(
                requireGoldenFixture(slot.fixtureId),
              ),
              requestBodySha256: slot.requestBodySha256,
              requestBodyUtf8ByteLength: slot.requestBodyUtf8ByteLength,
              semanticCanonicalRequestSha256:
                slot.semanticCanonicalRequestSha256,
              preflightInputTokens: 100,
              providerRequestIdHash: sha256(
                `runner-provider-request-${slotIndex}`,
              ),
              candidateDigest: sha256(`runner-candidate-${slotIndex}`),
              usage: {
                source: "PROVIDER",
                inputTokens: 100,
                outputTokens: 50,
                totalTokens: 150,
                totalTokensReconciliation: "REPORTED",
                cachedInputTokens: 0,
                cachedInputTokensReconciliation: "REPORTED",
                reasoningTokens: null,
                reasoningTokensReconciliation: "UNAVAILABLE",
              },
              calculatedCostUpperBoundMicroUsd: 330,
              criticalChecks: {
                STRICT_SCHEMA: true,
                SHARED_OUTPUT_PRIVACY: true,
                DATE_TIME_PARITY: true,
                NUMERIC_PARITY: true,
                DECISION_LANGUAGE: true,
                REFUSAL_ABSENT: true,
                HUMAN_SEMANTIC_GROUNDEDNESS: true,
              },
              humanReviews: [
                { locale: "en", passed: true },
                { locale: "zh-Hans", passed: true },
                { locale: "zh-Hant", passed: true },
              ],
              receiptProviderCorrelation:
                "UNATTESTED_NO_SHARED_IDENTIFIER",
              evidence: "UNATTESTED_TEST_ONLY",
            }
          : null,
      runnerFailure:
        outcome === "COMPLETED" && runnerFailureReason !== undefined
          ? {
              state: "RUNNER_SLOT_FAILED_TEST_CANDIDATE",
              observedAt: runnerAcceptanceObservedAt,
              authorizationDigest: authorization.authorizationDigest,
              runIdHash: authorization.statement.runIdHash,
              claimId: "10000000-0000-4000-8000-000000000010",
              reservationId,
              receiptDigest,
              receiptSignatureSha256: signatureSha256,
              slotIndex: slot.slotIndex,
              fixtureId: slot.fixtureId,
              runOrdinal: slot.runOrdinal,
              reason: runnerFailureReason,
              noRetry: true,
              durableTerminalState: "ABSENT_TEST_CANDIDATE_ONLY",
              evidence: "UNATTESTED_TEST_ONLY",
            }
          : null,
    },
  };
}

function requireGoldenFixture(fixtureId: string) {
  const fixture = CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES.find(
    (candidate) => candidate.id === fixtureId,
  );
  if (!fixture) throw new Error("test fixture is unavailable");
  return fixture;
}

function createAuthorizationStatement(
  trustedKey: CaresLinkV1CommunicationNotePreviewTrustedSigningKey,
  expiresAt = "2026-08-28T02:14:00.000Z",
): CaresLinkV1CommunicationNotePreviewAuthorizationStatement {
  return {
    domain: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_DOMAIN,
    version: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_VERSION,
    authorizationId: "10000000-0000-4000-8000-000000000001",
    authorizationNonceHash: hex("1"),
    ownerSubjectHmac: hex("2"),
    tenantScopeHmac: hex("3"),
    runIdHash: hex("4"),
    signerKeyIdHash: sha256(trustedKey.keyId),
    signerPublicKeySha256: trustedKey.publicKeySha256,
    issuedAt: PREFLIGHT_OBSERVED_AT,
    notBefore: PREFLIGHT_OBSERVED_AT,
    expiresAt,
    sourceBindings:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS,
    environmentEvidence: {
      openAiProjectIdHmac: sha256("provider-project-id-hmac"),
      australiaProjectConfigurationSha256: sha256(
        "provider-australia-region-evidence",
      ),
      zeroDataRetentionConfigurationSha256: sha256(
        "provider-zero-data-retention-evidence",
      ),
      modifiedRetentionAmendmentSha256: sha256(
        "provider-modified-retention-amendment",
      ),
      ownerProcessingAcknowledgementSha256: sha256(
        "provider-owner-processing-acknowledgement",
      ),
      pricingAndModelAvailabilitySha256: sha256(
        "provider-model-and-pricing",
      ),
      providerSpendLimitSha256: sha256(
        "provider-monthly-spend-limit-evidence",
      ),
      temporaryCredentialReferenceSha256: sha256(
        "provider-temporary-credential-reference",
      ),
    },
    budget: {
      currency: "USD",
      maximumCalls: 6,
      maximumAttemptsPerSlot: 1,
      automaticRetry: false,
      fallbackModel: null,
      maximumInputTokensPerCall: 10_000,
      maximumOutputTokensPerCall: 2_400,
      maximumProjectedCostMicroUsdPerCall: 20_130,
      projectedCostMicroUsd: 120_780,
      maximumCostMicroUsd: 250_000,
      pricingVersion: "openai.gpt-5.4-mini.au.2026-08-27.v1",
      costNature: "CALCULATED_UPPER_BOUND_NOT_INVOICE",
    },
    input: {
      classification: "SYNTHETIC_DEIDENTIFIED_GOLDEN_FIXTURES_ONLY",
      realCareDataAllowed: false,
    },
    slots: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZED_SLOTS,
  };
}

function createCustodySnapshot(
  ownerTrustedKey: CaresLinkV1CommunicationNotePreviewTrustedSigningKey,
  receiptTrustedKey: CaresLinkV1CommunicationNotePreviewTrustedSigningKey,
  runnerTerminalTrustedKey: ReturnType<
    typeof createRunnerTerminalSigningFixture
  >["trustedKey"],
  verifiedAuthorization: CaresLinkV1VerifiedCommunicationNotePreviewAuthorization,
): CaresLinkV1CommunicationNotePreviewKeyCustodySnapshot {
  return {
    version: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_VERSION,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST,
    authorityPolicyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_POLICY_DIGEST,
    status: "TEST_ONLY_CANDIDATE_NOT_APPROVED",
    authorizationBinding: {
      authorizationDigest: verifiedAuthorization.authorizationDigest,
      runIdHash: verifiedAuthorization.statement.runIdHash,
      openAiProjectIdHmac:
        verifiedAuthorization.statement.environmentEvidence.openAiProjectIdHmac,
      temporaryCredentialReferenceSha256:
        verifiedAuthorization.statement.environmentEvidence
          .temporaryCredentialReferenceSha256,
    },
    ownerTrustRegistry: {
      source: "EXTERNAL_TRUST_REGISTRY_SNAPSHOT",
      registrySnapshotSha256: sha256("owner-registry-snapshot"),
      registryReferenceSha256: sha256("owner-registry-reference"),
      observedAt: PREFLIGHT_OBSERVED_AT,
      trustedSigningKey: ownerTrustedKey,
      privateKeyMaterialPresent: false,
    },
    receiptSigner: {
      trustedSigningKey: receiptTrustedKey,
      keyIdHash: sha256(receiptTrustedKey.keyId),
      publicKeySha256: receiptTrustedKey.publicKeySha256,
      custodyReferenceSha256: sha256("receipt-custody-reference"),
      privateKeyMaterialPresent: false,
      nonExportable: true,
      exportAllowed: false,
      signingScope: "CARESLINK_PREVIEW_RECEIPT_DOMAIN_ONLY",
      genericSigning: "PROHIBITED",
    },
    runnerTerminalSigner: {
      trustedSigningKey: runnerTerminalTrustedKey,
      keyIdHash: sha256(runnerTerminalTrustedKey.keyId),
      publicKeySha256: runnerTerminalTrustedKey.publicKeySha256,
      custodyReferenceSha256: sha256(
        "runner-terminal-custody-reference",
      ),
      privateKeyMaterialPresent: false,
      nonExportable: true,
      exportAllowed: false,
      signingScope: "CARESLINK_PREVIEW_RUNNER_TERMINAL_DOMAIN_ONLY",
      genericSigning: "PROHIBITED",
    },
    providerCredential: {
      credentialType: "PROJECT_SERVICE_ACCOUNT_API_KEY",
      projectIdHmac:
        verifiedAuthorization.statement.environmentEvidence.openAiProjectIdHmac,
      serviceAccountIdHmac: sha256("provider-service-account-id-hmac"),
      apiKeyIdHmac: sha256("provider-api-key-id-hmac"),
      credentialReferenceSha256:
        verifiedAuthorization.statement.environmentEvidence
          .temporaryCredentialReferenceSha256,
      scopesEvidenceSha256: sha256("provider-scopes-evidence"),
      issuedAt: PREFLIGHT_OBSERVED_AT,
      expiresAt: "2026-08-28T02:20:00.000Z",
      revokeBy: "2026-08-28T02:20:00.000Z",
      administrationAllowed: false,
      automaticRenewal: false,
      maximumCalls: 6,
      rawCredentialMaterialPresent: false,
      exportAllowed: false,
    },
    hmacDomains: {
      callerIdentity: {
        algorithm: "HMAC-SHA256",
        purpose: "CARESLINK_PREVIEW_CALLER_IDENTITY",
        version: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_IDENTITY_HMAC_VERSION,
        keyReferenceSha256: sha256("caller-identity-hmac-key-reference"),
        rawHmacKeyMaterialPresent: false,
        exportAllowed: false,
      },
      providerCorrelation: {
        algorithm: "HMAC-SHA256",
        purpose: "OPENAI_PREVIEW_PROVIDER_CORRELATION",
        version:
          CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PROVIDER_CORRELATION_HMAC_VERSION,
        keyReferenceSha256: sha256(
          "provider-correlation-hmac-key-reference",
        ),
        rawHmacKeyMaterialPresent: false,
        exportAllowed: false,
      },
    },
    callers: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS.map(
      (mapping, index) => ({
        ...mapping,
        identityHmac: sha256(`caller-${index}-identity-hmac`),
        credentialReferenceSha256: sha256(
          `caller-${index}-credential-reference`,
        ),
        databaseLogin: false,
        executorMembershipEnabled: false,
        rawCredentialMaterialPresent: false,
        exportAllowed: false,
      }),
    ),
  };
}

function createPreflightCandidate(
  verifiedAuthorization: CaresLinkV1VerifiedCommunicationNotePreviewAuthorization,
  custodySnapshot: CaresLinkV1CommunicationNotePreviewKeyCustodySnapshot,
  expiresAt = "2026-08-28T02:10:00.000Z",
): CaresLinkV1CommunicationNotePreviewActivationPreflightCandidate {
  const statement = verifiedAuthorization.statement;
  return {
    version:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_PREFLIGHT_VERSION,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_ACTIVATION_PREFLIGHT_POLICY_DIGEST,
    status: "TEST_ONLY_CANDIDATE_NOT_APPROVED",
    observedAt: custodySnapshot.ownerTrustRegistry.observedAt,
    expiresAt,
    authorization: {
      authorizationDigest: verifiedAuthorization.authorizationDigest,
      signatureSha256: verifiedAuthorization.signatureSha256,
    },
    custody: {
      snapshotDigest: createCanonicalSha256(custodySnapshot),
    },
    ownerTrust: {
      registrySnapshotSha256:
        custodySnapshot.ownerTrustRegistry.registrySnapshotSha256,
      fetchedRegistryBytesSha256:
        custodySnapshot.ownerTrustRegistry.registrySnapshotSha256,
      registryReferenceSha256:
        custodySnapshot.ownerTrustRegistry.registryReferenceSha256,
      registryObservedAt: custodySnapshot.ownerTrustRegistry.observedAt,
      authenticatedDeliveryEvidenceSha256: sha256("registry-delivery"),
      completeRevocationEvidenceSha256: sha256("registry-revocation"),
      signingCeremonyAttributionEvidenceSha256: sha256("owner-ceremony"),
    },
    receiptCustody: {
      observedAt: custodySnapshot.ownerTrustRegistry.observedAt,
      custodyReferenceSha256:
        custodySnapshot.receiptSigner.custodyReferenceSha256,
      keyIdHash: custodySnapshot.receiptSigner.keyIdHash,
      publicKeySha256: custodySnapshot.receiptSigner.publicKeySha256,
      status: "NON_EXPORTABLE_ACTIVE_CANDIDATE",
      privateKeyMaterialPresent: false,
      exportAllowed: false,
      accessLogEvidenceSha256: sha256("receipt-access-log"),
      rotationAndRevocationEvidenceSha256: sha256("receipt-lifecycle"),
      teardownPlanSha256: sha256("receipt-teardown"),
    },
    runnerTerminalCustody: {
      observedAt: custodySnapshot.ownerTrustRegistry.observedAt,
      custodyReferenceSha256:
        custodySnapshot.runnerTerminalSigner.custodyReferenceSha256,
      keyIdHash: custodySnapshot.runnerTerminalSigner.keyIdHash,
      publicKeySha256:
        custodySnapshot.runnerTerminalSigner.publicKeySha256,
      status: "NON_EXPORTABLE_ACTIVE_CANDIDATE",
      privateKeyMaterialPresent: false,
      exportAllowed: false,
      accessLogEvidenceSha256: sha256("runner-terminal-access-log"),
      rotationAndRevocationEvidenceSha256: sha256(
        "runner-terminal-lifecycle",
      ),
      teardownPlanSha256: sha256("runner-terminal-teardown"),
    },
    provider: {
      observedAt: custodySnapshot.ownerTrustRegistry.observedAt,
      projectIdHmac: statement.environmentEvidence.openAiProjectIdHmac,
      projectStatus: "ACTIVE",
      region: "AUSTRALIA",
      regionEvidenceSha256:
        statement.environmentEvidence.australiaProjectConfigurationSha256,
      retention: "ZERO_DATA_RETENTION",
      retentionEvidenceSha256:
        statement.environmentEvidence.zeroDataRetentionConfigurationSha256,
      modifiedRetentionAmendmentSha256:
        statement.environmentEvidence.modifiedRetentionAmendmentSha256,
      ownerProcessingAcknowledgementSha256:
        statement.environmentEvidence.ownerProcessingAcknowledgementSha256,
      modelId:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORITY_SOURCE_BINDINGS
          .modelId,
      modelAndPricingEvidenceSha256:
        statement.environmentEvidence.pricingAndModelAvailabilitySha256,
      monthlyHardSpendLimit: {
        currency: "USD",
        amountCents: 25,
        interval: "MONTH",
        enforcementStatus: "ENFORCING",
        nature: "DEFENCE_IN_DEPTH_NOT_PER_RUN_BUDGET_AUTHORITY",
        evidenceSha256:
          statement.environmentEvidence.providerSpendLimitSha256,
      },
      perRunBudget: {
        maximumCalls: 6,
        maximumAttemptsPerSlot: 1,
        automaticRetry: false,
        fallbackModel: null,
        maximumCostMicroUsd: 250_000,
        enforcement: "APPLICATION_SIX_SLOT_RESERVATION_NO_RETRY",
      },
      serviceAccount: {
        credentialReferenceSha256:
          custodySnapshot.providerCredential.credentialReferenceSha256,
        scopesEvidenceSha256:
          custodySnapshot.providerCredential.scopesEvidenceSha256,
        administrationAllowed: false,
        providerEnforcedExpiry: "ABSENT",
        operationalExpiresAt: custodySnapshot.providerCredential.expiresAt,
        teardownBy: custodySnapshot.providerCredential.revokeBy,
        deleteAndAbsencePlanSha256: sha256(
          "service-account-delete-absence",
        ),
      },
    },
    database: {
      observedAt: custodySnapshot.ownerTrustRegistry.observedAt,
      targetClass: "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW",
      projectRefHmacAlgorithm: "HMAC-SHA256",
      projectRefHmacPurpose: "CARESLINK_PREVIEW_DATABASE_PROJECT_REF",
      projectRefHmacVersion:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_PROJECT_REF_HMAC_VERSION,
      projectRefHmacKeyReferenceSha256: sha256(
        "database-project-ref-hmac-key-reference",
      ),
      targetProjectRefHmac: sha256("preview-project-ref"),
      productionProjectRefHmac: sha256("production-project-ref"),
      defaultBranch: false,
      persistent: false,
      withData: false,
      productionExcluded: true,
      ...CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DATABASE_EVIDENCE_PINS,
      runnerTerminalContract: "SIGNED_SOURCE_ONLY_DEFAULT_OFF",
      runnerTerminalExecutorRole:
        "careslink_v1_preview_runner_terminal_executor",
      runnerTerminalCallerPresent: true,
      runnerTerminalCallerExecuteGranted: true,
      runnerTerminalRuntimeIdentityPresent: false,
      runnerTerminalRuntimeMembershipPresent: false,
      runnerTerminalCredentialResolverPresent: false,
      runnerTerminalRuntimeExecute: false,
      apiRoleExecute: false,
      fixtureRowCount: 0,
      callerBindings:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS.map(
          (mapping, index) => ({
            purpose: mapping.purpose,
            callerShellRole: mapping.callerRole,
            executorRole: mapping.executorRole,
            rpcNames: [...mapping.rpcNames],
            loginIdentityHmac: custodySnapshot.callers[index].identityHmac,
            loginCapability: true,
            rawCredentialMaterialPresent: false,
            roleInherit: false,
            superuser: false,
            createRole: false,
            createDb: false,
            replication: false,
            bypassRls: false,
            callerMembershipAdmin: false,
            callerMembershipInherit: false,
            callerMembershipSet: true,
            executorMembership: false,
            apiRoleMembership: false,
            otherCallerShellMemberships: false,
            directTablePrivileges: false,
            directSequencePrivileges: false,
            directFunctionPrivileges: false,
            activeBackendCount: 0,
          }),
        ),
      sessionConfinementEvidenceSha256: sha256("db-session-confinement"),
      credentialRotationEvidenceSha256: sha256("db-credential-rotation"),
      membershipTeardownEvidenceSha256: sha256("db-membership-teardown"),
      zeroBackendAbsenceEvidenceSha256: sha256("db-zero-backend-absence"),
    },
    humanReview: {
      observedAt: custodySnapshot.ownerTrustRegistry.observedAt,
      requiredReviewCount: 18,
      attributionRequired: true,
      planSha256: sha256("human-review-plan"),
      reviewerAssignmentSha256: sha256("human-reviewer-assignment"),
      resultsStatus: "NOT_STARTED",
      finalRunApproval: "ABSENT",
    },
  };
}

function requireCallerIdentity(
  custodySnapshot: CaresLinkV1CommunicationNotePreviewKeyCustodySnapshot,
  purpose: "AUTHORIZATION_REGISTRATION" | "DISPATCH" | "RECEIPT_PERSISTENCE",
) {
  const caller = custodySnapshot.callers.find(
    (candidate) => candidate.purpose === purpose,
  );
  if (!caller) throw new Error("test caller is unavailable");
  return caller.identityHmac;
}

function createSigningFixture(
  purpose: "OWNER_AUTHORIZATION" | "CARESLINK_DISPATCH_RECEIPT",
) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyDer = publicKey.export({ format: "der", type: "spki" });
  const core = {
    keyId:
      purpose === "OWNER_AUTHORIZATION"
        ? "owner-preview-2026-08"
        : "receipt-preview-2026-08",
    publicKeySpkiDerBase64: publicKeyDer.toString("base64"),
    publicKeySha256: createHash("sha256")
      .update(publicKeyDer)
      .digest("hex"),
    status: "ACTIVE",
    notBefore: "2026-08-28T01:00:00.000Z",
    expiresAt: "2026-08-28T03:00:00.000Z",
  } as const;
  const trustedKey =
    purpose === "OWNER_AUTHORIZATION"
      ? {
          ...core,
          purpose,
          allowedDomain:
            CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_AUTHORIZATION_DOMAIN,
          ownerSubjectHmac: hex("2"),
          tenantScopeHmac: hex("3"),
        }
      : {
          ...core,
          purpose,
          allowedDomain:
            CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RECEIPT_DOMAIN,
          ownerSubjectHmac: null,
          tenantScopeHmac: null,
        };
  return {
    privateKey,
    trustedKey:
      trustedKey satisfies CaresLinkV1CommunicationNotePreviewTrustedSigningKey,
  };
}

function createRunnerTerminalSigningFixture() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyDer = publicKey.export({ format: "der", type: "spki" });
  return {
    privateKey,
    trustedKey: {
      keyId: "runner-terminal-preview-2026-08",
      publicKeySpkiDerBase64: publicKeyDer.toString("base64"),
      publicKeySha256: createHash("sha256")
        .update(publicKeyDer)
        .digest("hex"),
      status: "ACTIVE" as const,
      notBefore: "2026-08-28T01:00:00.000Z",
      expiresAt: "2026-08-28T03:00:00.000Z",
      purpose: "CARESLINK_RUNNER_TERMINAL" as const,
      allowedDomain:
        "CARESLINK_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL" as const,
    },
  };
}

function signStatement(statement: unknown, privateKey: KeyObject) {
  return sign(
    null,
    createCaresLinkV1CommunicationNotePreviewSigningMessage(statement),
    privateKey,
  ).toString("base64url");
}

function expectFixedFailure(callback: () => unknown) {
  let thrown: unknown;
  try {
    callback();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toMatchObject({
    code: "VALIDATION_ERROR",
    message:
      "Communication Note preview reserve-before-dispatch coordinator is unavailable",
  });
  expect(String(thrown)).not.toMatch(/must-not-leak|Bearer|api-key/i);
}

function expectRecursivelyFrozen(
  value: unknown,
  seen = new Set<object>(),
): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) {
    expectRecursivelyFrozen(child, seen);
  }
}

function createCanonicalSha256(value: unknown) {
  return createHash("sha256")
    .update(stringifyCaresLinkV1CanonicalJson(value), "utf8")
    .digest("hex");
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hex(character: string) {
  return character.repeat(64);
}

function calculateTestCostMicroUsd(
  usage: Readonly<{
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
  }>,
) {
  const uncachedInputTokens = usage.inputTokens - usage.cachedInputTokens;
  return Math.ceil(
    ((uncachedInputTokens * 750_000 +
      usage.cachedInputTokens * 75_000 +
      usage.outputTokens * 4_500_000) *
      11_000) /
      10_000_000_000,
  );
}

function timestamp(secondsAfterPreflight: number) {
  return new Date(
    Date.parse(PREFLIGHT_OBSERVED_AT) + secondsAfterPreflight * 1_000,
  ).toISOString();
}
