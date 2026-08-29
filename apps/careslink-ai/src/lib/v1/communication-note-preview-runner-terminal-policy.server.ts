import "server-only";

import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";
import { types as nodeTypes } from "node:util";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import { CaresLinkV1ContractError } from "./shared-contracts";

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DOMAIN =
  "CARESLINK_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_SIGNING_PURPOSE =
  "CARESLINK_RUNNER_TERMINAL" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_SIGNING_PREFIX =
  "CARESLINK-V1-ED25519\n" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_VERSION =
  "policy.communication.openai.synthetic-preview.runner-terminal.2026-08-29.m1g-g.v2" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_STATEMENT_VERSION =
  "runner-terminal.communication.openai.synthetic-preview.2026-08-29.m1g-g.v2" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_READY =
  false as const;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_STATES =
  deepFreeze(["ACCEPTED", "FAILED"] as const);
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_FAILURE_REASONS =
  deepFreeze([
    "CANCELLED",
    "PROVIDER_EVIDENCE_INVALID",
    "GOLDEN_EVALUATION_FAILED",
    "HUMAN_REVIEW_FAILED",
    "REPORT_INVALID",
  ] as const);

const AUTHORITY_POLICY_DIGEST =
  "7804c7d60bb8c686d66a4c0aed74b373023dda672f1ebfa0a8e7c8af4eb7a9d9" as const;
const RUNNER_POLICY_DIGEST =
  "a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4" as const;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const BASE64URL_SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{86}$/;
const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CLOCK_SKEW_MS = 5_000;
const ED25519_SPKI_DER_PREFIX = Buffer.from(
  "302a300506032b6570032100",
  "hex",
);
const ED25519_SPKI_DER_LENGTH = 44;
const VERIFIED_RUNNER_TERMINALS = new WeakSet<object>();

const RUNNER_TERMINAL_POLICY_CORE = deepFreeze({
  version:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_VERSION,
  statementVersion:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_STATEMENT_VERSION,
  status: "SOURCE_CONTRACT_ONLY_SIGNED_CALLER_NOT_PROVISIONED",
  capability: "SIGNED_DURABLE_RUNNER_TERMINAL_DATABASE_CONTRACT",
  sourceBindings: {
    authorityPolicyDigest: AUTHORITY_POLICY_DIGEST,
    runnerPolicyDigest: RUNNER_POLICY_DIGEST,
  },
  reservationResult: {
    reservedAtSource: "DATABASE_ROW",
    freshDispatchAuthorized: true,
    exactReplayDispatchAuthorized: false,
    callerSuppliedReservedAt: false,
  },
  terminal: {
    states: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_STATES,
    failureReasons:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_FAILURE_REASONS,
    receiptOutcomeRequired: "COMPLETED",
    acceptanceRequiresSevenCriticalChecks: true,
    acceptanceReviewLocales: ["en", "zh-Hans", "zh-Hant"],
    exactReplayOnly: true,
    automaticRetry: false,
    attestationTrustRoot: "INDEPENDENT_CARESLINK_ED25519_SIGNED_TERMINAL",
    signatureAlgorithm: "Ed25519",
    signatureEncoding: "BASE64URL_NO_PADDING",
    signingPrefix:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_SIGNING_PREFIX,
    signingPurpose:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_SIGNING_PURPOSE,
    allowedDomain:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DOMAIN,
    independentSignaturePersisted: true,
    verifierIdentityHmacIsSignature: false,
  },
  continuation: {
    requiredReceiptOutcome: "COMPLETED",
    requiredRunnerTerminalState: "ACCEPTED",
    missingTerminal: "PENDING_NO_DISPATCH_AUTHORITY",
    failedTerminal: "PERMANENTLY_CONSUMED",
  },
  database: {
    schema: "careslink_v1_generation",
    executorRole: "careslink_v1_preview_runner_terminal_executor",
    callerRole: "careslink_v1_preview_runner_terminal_caller",
    callerShellPresent: true,
    callerExecuteGranted: true,
    runtimeLoginPresent: false,
    runtimeMembershipPresent: false,
    authenticatedRuntimePortReady: false,
    dataApiExecute: false,
    forcedRls: true,
    appendOnly: true,
  },
} as const);

export type CaresLinkV1CommunicationNotePreviewRunnerTerminalPolicy =
  typeof RUNNER_TERMINAL_POLICY_CORE &
    Readonly<{
      policyDigest: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST;
    }>;

const COMPUTED_RUNNER_TERMINAL_POLICY_DIGEST = createCanonicalSha256(
  RUNNER_TERMINAL_POLICY_CORE,
);
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST =
  "d0ac3b14ceb97535cfed935250566b59d8ac42a93123a750d3a686102a8d1cfa" as const;

if (
  COMPUTED_RUNNER_TERMINAL_POLICY_DIGEST !==
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST
) {
  throw unavailable();
}

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY =
  deepFreeze({
    ...RUNNER_TERMINAL_POLICY_CORE,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST,
  }) satisfies CaresLinkV1CommunicationNotePreviewRunnerTerminalPolicy;

export const CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNNER_TERMINAL_POLICY =
  undefined as
    | CaresLinkV1CommunicationNotePreviewRunnerTerminalPolicy
    | undefined;

export type CaresLinkV1CommunicationNotePreviewRunnerTerminalTrustedSigningKey =
  Readonly<{
    keyId: string;
    publicKeySpkiDerBase64: string;
    publicKeySha256: string;
    status: "ACTIVE";
    notBefore: string;
    expiresAt: string;
    purpose: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_SIGNING_PURPOSE;
    allowedDomain: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DOMAIN;
  }>;

export const CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNNER_TERMINAL_SIGNING_KEY =
  undefined as
    | CaresLinkV1CommunicationNotePreviewRunnerTerminalTrustedSigningKey
    | undefined;

type TerminalFailureReason =
  (typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_FAILURE_REASONS)[number];

export type CaresLinkV1CommunicationNotePreviewRunnerTerminalUsage =
  Readonly<{
    source: "PROVIDER";
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    totalTokensReconciliation: "REPORTED" | "CALCULATED";
    cachedInputTokens: number;
    cachedInputTokensReconciliation: "REPORTED" | "ASSUMED_ZERO";
    reasoningTokens: number | null;
    reasoningTokensReconciliation: "REPORTED" | "UNAVAILABLE";
  }>;

type AcceptanceEvidence = Readonly<{
  requestBodySha256: string;
  requestBodyUtf8ByteLength: number;
  semanticCanonicalRequestSha256: string;
  receiptSignatureSha256: string;
  fixtureDigest: string;
  preflightInputTokens: number;
  providerRequestIdHash: string;
  candidateDigest: string;
  usage: CaresLinkV1CommunicationNotePreviewRunnerTerminalUsage;
  calculatedCostUpperBoundMicroUsd: number;
  criticalChecks: Readonly<{
    STRICT_SCHEMA: true;
    SHARED_OUTPUT_PRIVACY: true;
    DATE_TIME_PARITY: true;
    NUMERIC_PARITY: true;
    DECISION_LANGUAGE: true;
    REFUSAL_ABSENT: true;
    HUMAN_SEMANTIC_GROUNDEDNESS: true;
  }>;
  humanReviews: readonly Readonly<{
    locale: "en" | "zh-Hans" | "zh-Hant";
    passed: true;
  }>[];
  receiptProviderCorrelation: "UNATTESTED_NO_SHARED_IDENTIFIER";
}>;

type FailureEvidence = Readonly<{
  requestBodySha256: null;
  requestBodyUtf8ByteLength: null;
  semanticCanonicalRequestSha256: null;
  receiptSignatureSha256: null;
  fixtureDigest: null;
  preflightInputTokens: null;
  providerRequestIdHash: null;
  candidateDigest: null;
  usage: null;
  calculatedCostUpperBoundMicroUsd: null;
  criticalChecks: null;
  humanReviews: null;
  receiptProviderCorrelation: null;
}>;

type StatementCore = Readonly<{
  domain: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DOMAIN;
  version: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_STATEMENT_VERSION;
  signingPurpose: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_SIGNING_PURPOSE;
  signerKeyIdHash: string;
  signerPublicKeySha256: string;
  authorityPolicyDigest: typeof AUTHORITY_POLICY_DIGEST;
  runnerPolicyDigest: typeof RUNNER_POLICY_DIGEST;
  terminalPolicyVersion: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_VERSION;
  terminalPolicyDigest: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST;
  authorizationDigest: string;
  runIdHash: string;
  claimId: string;
  reservationId: string;
  receiptDigest: string;
  slotIndex: number;
  fixtureId: string;
  runOrdinal: number;
  observedAt: string;
  noRetry: true;
}>;

export type CaresLinkV1CommunicationNotePreviewRunnerTerminalStatement =
  StatementCore &
    (
      | (Readonly<{ state: "ACCEPTED"; failureReason: null }> &
          AcceptanceEvidence)
      | (Readonly<{
          state: "FAILED";
          failureReason: TerminalFailureReason;
        }> & FailureEvidence)
    );

export type CaresLinkV1CommunicationNotePreviewRunnerTerminalEnvelope =
  Readonly<{
    statement: CaresLinkV1CommunicationNotePreviewRunnerTerminalStatement;
    signature: string;
  }>;

export type CaresLinkV1VerifiedCommunicationNotePreviewRunnerTerminal =
  Readonly<{
    statement: CaresLinkV1CommunicationNotePreviewRunnerTerminalStatement;
    runnerTerminalDigest: string;
    signature: string;
    signatureSha256: string;
    authenticity: "EXTERNAL_RUNNER_TERMINAL_ED25519_VERIFIED";
    verifiedAt: string;
  }>;

const STATEMENT_KEYS = [
  "authorityPolicyDigest",
  "authorizationDigest",
  "calculatedCostUpperBoundMicroUsd",
  "candidateDigest",
  "claimId",
  "criticalChecks",
  "domain",
  "failureReason",
  "fixtureDigest",
  "fixtureId",
  "humanReviews",
  "noRetry",
  "observedAt",
  "preflightInputTokens",
  "providerRequestIdHash",
  "receiptDigest",
  "receiptProviderCorrelation",
  "receiptSignatureSha256",
  "requestBodySha256",
  "requestBodyUtf8ByteLength",
  "reservationId",
  "runIdHash",
  "runOrdinal",
  "runnerPolicyDigest",
  "semanticCanonicalRequestSha256",
  "signerKeyIdHash",
  "signerPublicKeySha256",
  "signingPurpose",
  "slotIndex",
  "state",
  "terminalPolicyDigest",
  "terminalPolicyVersion",
  "usage",
  "version",
] as const;

export function validateTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustedSigningKey(
  value: unknown,
  options: Readonly<{ now: string }>,
): CaresLinkV1CommunicationNotePreviewRunnerTerminalTrustedSigningKey {
  try {
    const optionRecord = exactDataRecord(options, ["now"]);
    const now = requireTimestamp(optionRecord.now);
    return validateTrustedSigningKey(value, now);
  } catch {
    throw invalid("Runner terminal trusted signing key is invalid");
  }
}

export function verifyTestOnlyCaresLinkV1CommunicationNotePreviewSignedRunnerTerminal(
  envelope: unknown,
  options: Readonly<{ trustedKeySnapshot: unknown; now: string }>,
): CaresLinkV1VerifiedCommunicationNotePreviewRunnerTerminal {
  try {
    const optionRecord = exactDataRecord(options, [
      "trustedKeySnapshot",
      "now",
    ]);
    const now = requireTimestamp(optionRecord.now);
    const trustedKey = validateTrustedSigningKey(
      optionRecord.trustedKeySnapshot,
      now,
    );
    const object = exactDataRecord(envelope, ["statement", "signature"]);
    const statement = validateStatement(object.statement, now, trustedKey);
    const signature = requireEd25519Signature(object.signature);
    verifyStatementSignature(statement, signature, trustedKey);
    const verified = deepFreeze({
      statement,
      runnerTerminalDigest: createCanonicalSha256(statement),
      signature,
      signatureSha256: createTextSha256(signature),
      authenticity: "EXTERNAL_RUNNER_TERMINAL_ED25519_VERIFIED" as const,
      verifiedAt: new Date(now).toISOString(),
    });
    VERIFIED_RUNNER_TERMINALS.add(verified);
    return verified;
  } catch {
    throw invalid("Signed runner terminal envelope is invalid");
  }
}

export function isTestOnlyCaresLinkV1VerifiedCommunicationNotePreviewRunnerTerminal(
  value: unknown,
): value is CaresLinkV1VerifiedCommunicationNotePreviewRunnerTerminal {
  return value !== null &&
    typeof value === "object" &&
    !nodeTypes.isProxy(value) &&
    VERIFIED_RUNNER_TERMINALS.has(value);
}

export function createCaresLinkV1CommunicationNotePreviewRunnerTerminalSigningMessage(
  statement: unknown,
) {
  return Buffer.from(
    `${CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_SIGNING_PREFIX}${stringifyCaresLinkV1CanonicalJson(statement)}`,
    "utf8",
  );
}

export function createCaresLinkV1CommunicationNotePreviewRunnerTerminalStatementDigest(
  statement: unknown,
) {
  return createCanonicalSha256(statement);
}

export function createCaresLinkV1CommunicationNotePreviewRunnerTerminalPersistence(): never {
  throw unavailable();
}

function validateTrustedSigningKey(value: unknown, now: number) {
  const object = exactDataRecord(value, [
    "keyId",
    "publicKeySpkiDerBase64",
    "publicKeySha256",
    "status",
    "notBefore",
    "expiresAt",
    "purpose",
    "allowedDomain",
  ]);
  if (
    typeof object.keyId !== "string" ||
    !IDENTIFIER_PATTERN.test(object.keyId) ||
    typeof object.publicKeySpkiDerBase64 !== "string" ||
    object.publicKeySpkiDerBase64.length !== 60 ||
    !BASE64_PATTERN.test(object.publicKeySpkiDerBase64) ||
    object.status !== "ACTIVE" ||
    object.purpose !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_SIGNING_PURPOSE ||
    object.allowedDomain !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DOMAIN
  ) {
    throw invalid("Runner terminal trusted signing key is invalid");
  }
  const keyBytes = decodeCanonicalBase64(object.publicKeySpkiDerBase64);
  if (
    keyBytes.length !== ED25519_SPKI_DER_LENGTH ||
    !keyBytes.subarray(0, ED25519_SPKI_DER_PREFIX.length)
      .equals(ED25519_SPKI_DER_PREFIX)
  ) {
    throw invalid("Runner terminal Ed25519 public key is invalid");
  }
  const publicKeySha256 = requireSha256(object.publicKeySha256);
  if (createBufferSha256(keyBytes) !== publicKeySha256) {
    throw invalid("Runner terminal signing-key fingerprint is invalid");
  }
  let publicKey;
  try {
    publicKey = createPublicKey({ key: keyBytes, format: "der", type: "spki" });
  } catch {
    throw invalid("Runner terminal Ed25519 public key is invalid");
  }
  if (publicKey.asymmetricKeyType !== "ed25519") {
    throw invalid("Runner terminal Ed25519 public key is invalid");
  }
  const notBefore = requireTimestamp(object.notBefore);
  const expiresAt = requireTimestamp(object.expiresAt);
  if (expiresAt <= notBefore || now < notBefore || now >= expiresAt) {
    throw invalid("Runner terminal trusted signing key is not active");
  }
  return deepFreeze({
    keyId: object.keyId,
    publicKeySpkiDerBase64: object.publicKeySpkiDerBase64,
    publicKeySha256,
    status: "ACTIVE" as const,
    notBefore: new Date(notBefore).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    purpose:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_SIGNING_PURPOSE,
    allowedDomain:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DOMAIN,
  });
}

function validateStatement(
  value: unknown,
  now: number,
  trustedKey: CaresLinkV1CommunicationNotePreviewRunnerTerminalTrustedSigningKey,
): CaresLinkV1CommunicationNotePreviewRunnerTerminalStatement {
  const object = exactDataRecord(value, STATEMENT_KEYS);
  const observedAt = requireTimestamp(object.observedAt);
  if (
    object.domain !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DOMAIN ||
    object.version !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_STATEMENT_VERSION ||
    object.signingPurpose !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_SIGNING_PURPOSE ||
    object.signerKeyIdHash !== createTextSha256(trustedKey.keyId) ||
    object.signerPublicKeySha256 !== trustedKey.publicKeySha256 ||
    object.authorityPolicyDigest !== AUTHORITY_POLICY_DIGEST ||
    object.runnerPolicyDigest !== RUNNER_POLICY_DIGEST ||
    object.terminalPolicyVersion !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_VERSION ||
    object.terminalPolicyDigest !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST ||
    object.noRetry !== true ||
    !isUuid(object.claimId) ||
    !isUuid(object.reservationId) ||
    !isSha256(object.authorizationDigest) ||
    !isSha256(object.runIdHash) ||
    !isSha256(object.receiptDigest) ||
    !Number.isSafeInteger(object.slotIndex) ||
    (object.slotIndex as number) < 0 ||
    (object.slotIndex as number) > 5 ||
    typeof object.fixtureId !== "string" ||
    object.fixtureId.length < 1 ||
    object.fixtureId.length > 128 ||
    !Number.isSafeInteger(object.runOrdinal) ||
    ((object.runOrdinal as number) !== 1 && (object.runOrdinal as number) !== 2) ||
    observedAt > now + CLOCK_SKEW_MS ||
    observedAt < Date.parse(trustedKey.notBefore) ||
    observedAt >= Date.parse(trustedKey.expiresAt)
  ) {
    throw invalid("Runner terminal statement is invalid");
  }

  const core = {
    domain:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DOMAIN,
    version:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_STATEMENT_VERSION,
    signingPurpose:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_SIGNING_PURPOSE,
    signerKeyIdHash: object.signerKeyIdHash as string,
    signerPublicKeySha256: object.signerPublicKeySha256 as string,
    authorityPolicyDigest: AUTHORITY_POLICY_DIGEST,
    runnerPolicyDigest: RUNNER_POLICY_DIGEST,
    terminalPolicyVersion:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_VERSION,
    terminalPolicyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST,
    authorizationDigest: object.authorizationDigest as string,
    runIdHash: object.runIdHash as string,
    claimId: object.claimId as string,
    reservationId: object.reservationId as string,
    receiptDigest: object.receiptDigest as string,
    slotIndex: object.slotIndex as number,
    fixtureId: object.fixtureId,
    runOrdinal: object.runOrdinal as number,
    observedAt: new Date(observedAt).toISOString(),
    noRetry: true as const,
  };

  if (object.state === "ACCEPTED" && object.failureReason === null) {
    const acceptance = validateAcceptanceEvidence(object);
    requirePairwiseDistinct([
      core.signerKeyIdHash,
      core.signerPublicKeySha256,
      core.authorizationDigest,
      core.runIdHash,
      core.receiptDigest,
      core.terminalPolicyDigest,
      core.authorityPolicyDigest,
      core.runnerPolicyDigest,
      acceptance.requestBodySha256,
      acceptance.semanticCanonicalRequestSha256,
      acceptance.receiptSignatureSha256,
      acceptance.fixtureDigest,
      acceptance.providerRequestIdHash,
      acceptance.candidateDigest,
    ]);
    return deepFreeze({
      ...core,
      state: "ACCEPTED" as const,
      failureReason: null,
      ...acceptance,
    });
  }
  if (
    object.state === "FAILED" &&
    typeof object.failureReason === "string" &&
    (CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_FAILURE_REASONS as readonly string[])
      .includes(object.failureReason) &&
    [
      "requestBodySha256",
      "requestBodyUtf8ByteLength",
      "semanticCanonicalRequestSha256",
      "receiptSignatureSha256",
      "fixtureDigest",
      "preflightInputTokens",
      "providerRequestIdHash",
      "candidateDigest",
      "usage",
      "calculatedCostUpperBoundMicroUsd",
      "criticalChecks",
      "humanReviews",
      "receiptProviderCorrelation",
    ].every((key) => object[key as keyof typeof object] === null)
  ) {
    requirePairwiseDistinct([
      core.signerKeyIdHash,
      core.signerPublicKeySha256,
      core.authorizationDigest,
      core.runIdHash,
      core.receiptDigest,
      core.terminalPolicyDigest,
      core.authorityPolicyDigest,
      core.runnerPolicyDigest,
    ]);
    return deepFreeze({
      ...core,
      state: "FAILED" as const,
      failureReason: object.failureReason as TerminalFailureReason,
      requestBodySha256: null,
      requestBodyUtf8ByteLength: null,
      semanticCanonicalRequestSha256: null,
      receiptSignatureSha256: null,
      fixtureDigest: null,
      preflightInputTokens: null,
      providerRequestIdHash: null,
      candidateDigest: null,
      usage: null,
      calculatedCostUpperBoundMicroUsd: null,
      criticalChecks: null,
      humanReviews: null,
      receiptProviderCorrelation: null,
    });
  }
  throw invalid("Runner terminal state evidence is invalid");
}

function validateAcceptanceEvidence(
  object: Record<(typeof STATEMENT_KEYS)[number], unknown>,
): AcceptanceEvidence {
  const requestBodySha256 = requireSha256(object.requestBodySha256);
  const semanticCanonicalRequestSha256 = requireSha256(
    object.semanticCanonicalRequestSha256,
  );
  const receiptSignatureSha256 = requireSha256(object.receiptSignatureSha256);
  const fixtureDigest = requireSha256(object.fixtureDigest);
  const providerRequestIdHash = requireSha256(object.providerRequestIdHash);
  const candidateDigest = requireSha256(object.candidateDigest);
  const requestBodyUtf8ByteLength = requireInteger(
    object.requestBodyUtf8ByteLength,
    1,
    9_999_999,
  );
  const preflightInputTokens = requireInteger(
    object.preflightInputTokens,
    1,
    10_000,
  );
  const calculatedCostUpperBoundMicroUsd = requireInteger(
    object.calculatedCostUpperBoundMicroUsd,
    0,
    20_130,
  );
  const usage = validateUsage(object.usage);
  if (preflightInputTokens < usage.inputTokens) {
    throw invalid("Runner terminal token evidence is invalid");
  }
  const checks = exactDataRecord(object.criticalChecks, [
    "STRICT_SCHEMA",
    "SHARED_OUTPUT_PRIVACY",
    "DATE_TIME_PARITY",
    "NUMERIC_PARITY",
    "DECISION_LANGUAGE",
    "REFUSAL_ABSENT",
    "HUMAN_SEMANTIC_GROUNDEDNESS",
  ]);
  if (Object.values(checks).some((entry) => entry !== true)) {
    throw invalid("Runner terminal critical checks are invalid");
  }
  const reviewValues = exactDataArray(object.humanReviews, 3);
  const humanReviews = (["en", "zh-Hans", "zh-Hant"] as const).map(
    (locale, index) => {
      const review = exactDataRecord(reviewValues[index], [
        "locale",
        "passed",
      ]);
      if (review.locale !== locale || review.passed !== true) {
        throw invalid("Runner terminal human reviews are invalid");
      }
      return deepFreeze({ locale, passed: true as const });
    },
  );
  if (
    object.receiptProviderCorrelation !==
    "UNATTESTED_NO_SHARED_IDENTIFIER"
  ) {
    throw invalid("Runner terminal receipt correlation is invalid");
  }
  return deepFreeze({
    requestBodySha256,
    requestBodyUtf8ByteLength,
    semanticCanonicalRequestSha256,
    receiptSignatureSha256,
    fixtureDigest,
    preflightInputTokens,
    providerRequestIdHash,
    candidateDigest,
    usage,
    calculatedCostUpperBoundMicroUsd,
    criticalChecks: deepFreeze({
      STRICT_SCHEMA: true as const,
      SHARED_OUTPUT_PRIVACY: true as const,
      DATE_TIME_PARITY: true as const,
      NUMERIC_PARITY: true as const,
      DECISION_LANGUAGE: true as const,
      REFUSAL_ABSENT: true as const,
      HUMAN_SEMANTIC_GROUNDEDNESS: true as const,
    }),
    humanReviews: deepFreeze(humanReviews),
    receiptProviderCorrelation: "UNATTESTED_NO_SHARED_IDENTIFIER" as const,
  });
}

function validateUsage(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewRunnerTerminalUsage {
  const object = exactDataRecord(value, [
    "source",
    "inputTokens",
    "outputTokens",
    "totalTokens",
    "totalTokensReconciliation",
    "cachedInputTokens",
    "cachedInputTokensReconciliation",
    "reasoningTokens",
    "reasoningTokensReconciliation",
  ]);
  const inputTokens = requireInteger(object.inputTokens, 0, 10_000);
  const outputTokens = requireInteger(object.outputTokens, 0, 2_400);
  const totalTokens = requireInteger(object.totalTokens, 0, 12_400);
  const cachedInputTokens = requireInteger(object.cachedInputTokens, 0, inputTokens);
  const reasoningTokens =
    object.reasoningTokens === null
      ? null
      : requireInteger(object.reasoningTokens, 0, outputTokens);
  if (
    object.source !== "PROVIDER" ||
    (object.totalTokensReconciliation !== "REPORTED" &&
      object.totalTokensReconciliation !== "CALCULATED") ||
    totalTokens !== inputTokens + outputTokens ||
    (object.cachedInputTokensReconciliation !== "REPORTED" &&
      object.cachedInputTokensReconciliation !== "ASSUMED_ZERO") ||
    (object.cachedInputTokensReconciliation === "ASSUMED_ZERO" &&
      cachedInputTokens !== 0) ||
    (object.reasoningTokensReconciliation !== "REPORTED" &&
      object.reasoningTokensReconciliation !== "UNAVAILABLE") ||
    (object.reasoningTokensReconciliation === "UNAVAILABLE") !==
      (reasoningTokens === null)
  ) {
    throw invalid("Runner terminal usage is invalid");
  }
  return deepFreeze({
    source: "PROVIDER" as const,
    inputTokens,
    outputTokens,
    totalTokens,
    totalTokensReconciliation: object.totalTokensReconciliation,
    cachedInputTokens,
    cachedInputTokensReconciliation: object.cachedInputTokensReconciliation,
    reasoningTokens,
    reasoningTokensReconciliation: object.reasoningTokensReconciliation,
  });
}

function verifyStatementSignature(
  statement: CaresLinkV1CommunicationNotePreviewRunnerTerminalStatement,
  signature: string,
  trustedKey: CaresLinkV1CommunicationNotePreviewRunnerTerminalTrustedSigningKey,
) {
  const publicKey = createPublicKey({
    key: decodeCanonicalBase64(trustedKey.publicKeySpkiDerBase64),
    format: "der",
    type: "spki",
  });
  if (
    publicKey.asymmetricKeyType !== "ed25519" ||
    !verifySignature(
      null,
      createCaresLinkV1CommunicationNotePreviewRunnerTerminalSigningMessage(
        statement,
      ),
      publicKey,
      decodeCanonicalBase64Url(signature),
    )
  ) {
    throw invalid("Runner terminal signature authenticity check failed");
  }
}

function requireEd25519Signature(value: unknown) {
  if (
    typeof value !== "string" ||
    !BASE64URL_SIGNATURE_PATTERN.test(value) ||
    decodeCanonicalBase64Url(value).length !== 64
  ) {
    throw invalid("Runner terminal Ed25519 signature is invalid");
  }
  return value;
}

function decodeCanonicalBase64(value: string) {
  const bytes = Buffer.from(value, "base64");
  if (bytes.length === 0 || bytes.toString("base64") !== value) {
    throw invalid("Runner terminal public key encoding is invalid");
  }
  return bytes;
}

function decodeCanonicalBase64Url(value: string) {
  const bytes = Buffer.from(value, "base64url");
  if (bytes.toString("base64url") !== value) {
    throw invalid("Runner terminal signature encoding is invalid");
  }
  return bytes;
}

function requireTimestamp(value: unknown) {
  if (typeof value !== "string" || !TIMESTAMP_PATTERN.test(value)) {
    throw invalid("Runner terminal timestamp is invalid");
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw invalid("Runner terminal timestamp is invalid");
  }
  return parsed;
}

function requireInteger(value: unknown, minimum: number, maximum: number) {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    throw invalid("Runner terminal integer evidence is invalid");
  }
  return value as number;
}

function requireSha256(value: unknown) {
  if (!isSha256(value)) throw invalid("Runner terminal digest is invalid");
  return value;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function requirePairwiseDistinct(values: readonly string[]) {
  if (new Set(values).size !== values.length) {
    throw invalid("Runner terminal evidence purposes are not separated");
  }
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
    throw invalid("Runner terminal object is invalid");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw invalid("Runner terminal object is invalid");
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    throw invalid("Runner terminal object is invalid");
  }
  const names = Object.getOwnPropertyNames(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    names.length !== expected.length ||
    names.some((name, index) => name !== expected[index])
  ) {
    throw invalid("Runner terminal object keys are invalid");
  }
  const result = Object.create(null) as Record<Key, unknown>;
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw invalid("Runner terminal object property is invalid");
    }
    result[key] = descriptor.value;
  }
  return result;
}

function exactDataArray(value: unknown, expectedLength: number): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    nodeTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0 ||
    value.length !== expectedLength
  ) {
    throw invalid("Runner terminal array is invalid");
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
    throw invalid("Runner terminal array is invalid");
  }
  for (let index = 0; index < expectedLength; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw invalid("Runner terminal array is invalid");
    }
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    !lengthDescriptor ||
    lengthDescriptor.enumerable ||
    !("value" in lengthDescriptor) ||
    lengthDescriptor.value !== expectedLength
  ) {
    throw invalid("Runner terminal array is invalid");
  }
  return value;
}

function createCanonicalSha256(value: unknown) {
  return createHash("sha256")
    .update(stringifyCaresLinkV1CanonicalJson(value), "utf8")
    .digest("hex");
}

function createTextSha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function createBufferSha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}

function invalid(message: string) {
  return new CaresLinkV1ContractError("VALIDATION_ERROR", message);
}

function unavailable() {
  return new CaresLinkV1ContractError(
    "PRODUCT_API_DISABLED",
    "Communication Note preview runner terminal persistence is unavailable",
  );
}
