import "server-only";

import { types as nodeTypes } from "node:util";

import {
  type CaresLinkV1VerifiedCommunicationNotePreviewRunnerTerminal,
} from "./communication-note-preview-runner-terminal-policy.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE,
  requireTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalPostgresPort,
  type CaresLinkV1CommunicationNotePreviewRunnerTerminalAuthenticatedDatabasePort,
} from "./communication-note-preview-runner-terminal-postgres.server";
import {
  requireTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustComposition,
  verifyTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalWithTrustComposition,
} from "./communication-note-preview-runner-terminal-trust-composition.server";
import { CaresLinkV1ContractError } from "./shared-contracts";

export {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE,
};
export type {
  CaresLinkV1CommunicationNotePreviewRunnerTerminalAuthenticatedDatabasePort,
};

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_SIGNED_RUNNER_TERMINAL_RUNTIME_PORT_READY =
  false as const;

export type CaresLinkV1CommunicationNotePreviewRunnerTerminalDatabaseResult =
  Readonly<{
    created: boolean;
    runnerTerminalRecorded: true;
    continuationEligible: boolean;
    runnerTerminalDigest: string;
    state: "ACCEPTED" | "FAILED";
    recordedAt: string;
    status: "RUNNER_TERMINAL_RECORDED" | "ALREADY_RECORDED";
  }>;

export type CaresLinkV1CommunicationNotePreviewSignedRunnerTerminalRuntimePort =
  Readonly<{
    purpose: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE;
    persist: (
      envelope: unknown,
    ) => Promise<CaresLinkV1CommunicationNotePreviewRunnerTerminalDatabaseResult>;
  }>;

export const CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_SIGNED_RUNNER_TERMINAL_RUNTIME_PORT =
  undefined as
    | CaresLinkV1CommunicationNotePreviewSignedRunnerTerminalRuntimePort
    | undefined;

export function createTestOnlyCaresLinkV1CommunicationNotePreviewSignedRunnerTerminalRuntimePort(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewSignedRunnerTerminalRuntimePort {
  const options = exactDataRecord(value, [
    "capability",
    "trustComposition",
    "databasePort",
    "clock",
  ]);
  if (options.capability !== "TEST_ONLY_SIGNED_RUNNER_TERMINAL_RUNTIME_PORT") {
    throw unavailable();
  }
  const trustComposition =
    requireTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustComposition(
      options.trustComposition,
    );
  const databasePort =
    requireTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalPostgresPort(
      options.databasePort,
      trustComposition,
    );
  const clock = validateClock(options.clock);

  return Object.freeze({
    purpose:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE,
    async persist(envelope: unknown) {
      let now: string;
      try {
        now = clock.now();
      } catch {
        throw unavailable();
      }
      const verified =
        verifyTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalWithTrustComposition(
          trustComposition,
          envelope,
          now,
        );
      let rawResult: unknown;
      try {
        rawResult = await databasePort.persistVerifiedRunnerTerminal(verified);
      } catch (error) {
        throw sanitizeDatabaseError(error);
      }
      return validateDatabaseResult(rawResult, verified);
    },
  });
}

function sanitizeDatabaseError(value: unknown) {
  const code = safeErrorCode(value);
  switch (code) {
    case "FORBIDDEN":
      return new CaresLinkV1ContractError(
        "FORBIDDEN",
        "The runner terminal database operation is not authorized",
      );
    case "IDEMPOTENCY_CONFLICT":
      return new CaresLinkV1ContractError(
        "IDEMPOTENCY_CONFLICT",
        "The runner terminal was already recorded with different evidence",
      );
    case "INVALID_STATE_TRANSITION":
      return new CaresLinkV1ContractError(
        "INVALID_STATE_TRANSITION",
        "The runner terminal database binding is not writable",
      );
    case "VALIDATION_ERROR":
      return new CaresLinkV1ContractError(
        "VALIDATION_ERROR",
        "The runner terminal database request is invalid",
      );
    default:
      return unavailable();
  }
}

function safeErrorCode(value: unknown) {
  if (!value || typeof value !== "object" || nodeTypes.isProxy(value)) return "";
  const descriptor = Object.getOwnPropertyDescriptor(value, "code");
  return descriptor && "value" in descriptor && typeof descriptor.value === "string"
    ? descriptor.value
    : "";
}

function validateClock(value: unknown) {
  const object = exactDataRecord(value, ["now"]);
  if (typeof object.now !== "function") throw unavailable();
  return Object.freeze({ now: object.now as () => string });
}

function validateDatabaseResult(
  value: unknown,
  verified: CaresLinkV1VerifiedCommunicationNotePreviewRunnerTerminal,
): CaresLinkV1CommunicationNotePreviewRunnerTerminalDatabaseResult {
  const object = exactDataRecord(value, [
    "created",
    "runnerTerminalRecorded",
    "continuationEligible",
    "runnerTerminalDigest",
    "state",
    "recordedAt",
    "status",
  ]);
  const expectedContinuation = verified.statement.state === "ACCEPTED";
  const expectedStatus = object.created
    ? "RUNNER_TERMINAL_RECORDED"
    : "ALREADY_RECORDED";
  if (
    typeof object.created !== "boolean" ||
    object.runnerTerminalRecorded !== true ||
    object.continuationEligible !== expectedContinuation ||
    object.runnerTerminalDigest !== verified.runnerTerminalDigest ||
    object.state !== verified.statement.state ||
    !isTimestamp(object.recordedAt) ||
    object.status !== expectedStatus
  ) {
    throw unavailable();
  }
  return deepFreeze({
    created: object.created,
    runnerTerminalRecorded: true as const,
    continuationEligible: expectedContinuation,
    runnerTerminalDigest: verified.runnerTerminalDigest,
    state: verified.statement.state,
    recordedAt: object.recordedAt,
    status: expectedStatus,
  });
}

function isTimestamp(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    return false;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
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
    throw unavailable();
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw unavailable();
  if (Object.getOwnPropertySymbols(value).length !== 0) throw unavailable();
  const names = Object.getOwnPropertyNames(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    names.length !== expected.length ||
    names.some((name, index) => name !== expected[index])
  ) {
    throw unavailable();
  }
  const result = Object.create(null) as Record<Key, unknown>;
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw unavailable();
    }
    result[key] = descriptor.value;
  }
  return result;
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
    "Communication Note signed runner terminal runtime port is unavailable",
  );
}
