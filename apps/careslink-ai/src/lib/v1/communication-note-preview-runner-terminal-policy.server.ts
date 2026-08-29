import "server-only";

import { createHash } from "node:crypto";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import { CaresLinkV1ContractError } from "./shared-contracts";

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_VERSION =
  "policy.communication.openai.synthetic-preview.runner-terminal.2026-08-29.m1g-f.v1" as const;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_STATEMENT_VERSION =
  "runner-terminal.communication.openai.synthetic-preview.2026-08-29.m1g-f.v1" as const;

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

const RUNNER_TERMINAL_POLICY_CORE = deepFreeze({
  version:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_VERSION,
  statementVersion:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_STATEMENT_VERSION,
  status: "SOURCE_CONTRACT_ONLY_NO_RUNTIME_CALLER",
  capability: "DURABLE_RUNNER_TERMINAL_DATABASE_CONTRACT",
  sourceBindings: {
    authorityPolicyDigest:
      "7804c7d60bb8c686d66a4c0aed74b373023dda672f1ebfa0a8e7c8af4eb7a9d9",
    runnerPolicyDigest:
      "a604057aceed70b741d4e1ac2a0e1f9bdf5d13721955448ec083948fb8b4a7c4",
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
    attestationTrustRoot: "UNRESOLVED_BEFORE_RUNTIME_GRANT",
    independentSignaturePersisted: false,
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
    runtimeCallerPresent: false,
    runtimeExecuteGranted: false,
    dataApiExecute: false,
    forcedRls: true,
    appendOnly: true,
  },
} as const);

export type CaresLinkV1CommunicationNotePreviewRunnerTerminalPolicy =
  typeof RUNNER_TERMINAL_POLICY_CORE & Readonly<{ policyDigest: string }>;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST =
  "4f38d9ea27e9673138350ecdbc294e14e200cd09247f07244433a51cb62f6f5a" as const;

if (
  createCanonicalSha256(RUNNER_TERMINAL_POLICY_CORE) !==
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

export function createCaresLinkV1CommunicationNotePreviewRunnerTerminalPersistence(): never {
  throw unavailable();
}

function createCanonicalSha256(value: unknown) {
  return createHash("sha256")
    .update(stringifyCaresLinkV1CanonicalJson(value), "utf8")
    .digest("hex");
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

function unavailable() {
  return new CaresLinkV1ContractError(
    "PRODUCT_API_DISABLED",
    "Communication Note preview runner terminal persistence is unavailable",
  );
}
