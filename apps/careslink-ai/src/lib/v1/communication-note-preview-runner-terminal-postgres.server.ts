import "server-only";

import { createHash } from "node:crypto";
import { types as nodeTypes } from "node:util";

import {
  createCaresLinkV1CommunicationNotePreviewRunnerTerminalStatementDigest,
  isTestOnlyCaresLinkV1VerifiedCommunicationNotePreviewRunnerTerminal,
  type CaresLinkV1VerifiedCommunicationNotePreviewRunnerTerminal,
} from "./communication-note-preview-runner-terminal-policy.server";
import {
  requireTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustComposition,
  requireTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalVerifiedForTrustComposition,
  resolveTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalCallerIdentity,
  type CaresLinkV1CommunicationNotePreviewRunnerTerminalTrustComposition,
} from "./communication-note-preview-runner-terminal-trust-composition.server";
import { CaresLinkV1ContractError } from "./shared-contracts";

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POSTGRES_READY =
  false as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE =
  "RUNNER_TERMINAL_PERSISTENCE" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE =
  "careslink_v1_preview_runner_terminal_caller" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_EXECUTOR_ROLE =
  "careslink_v1_preview_runner_terminal_executor" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_RPC_NAME =
  "persist_verified_communication_note_preview_runner_terminal" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POSTGRES_SQL =
  `select careslink_v1_generation.persist_verified_communication_note_preview_runner_terminal(
  $1::pg_catalog.jsonb,
  $2::pg_catalog.text,
  $3::pg_catalog.text
) as data` as const;

if (
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE !==
    "RUNNER_TERMINAL_PERSISTENCE" ||
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE !==
    "careslink_v1_preview_runner_terminal_caller" ||
  !CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POSTGRES_SQL.includes(
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_RPC_NAME,
  )
) {
  throw unavailable();
}

export type CaresLinkV1CommunicationNotePreviewRunnerTerminalPostgresQueryPort =
  Readonly<{
    query: (
      sql: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POSTGRES_SQL,
      values: readonly [unknown, string, string],
    ) => PromiseLike<unknown>;
  }>;

export type CaresLinkV1CommunicationNotePreviewRunnerTerminalCallerIdentity =
  Readonly<{
    purpose: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE;
    callerRole: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE;
    executorRole: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_EXECUTOR_ROLE;
    rpcNames: readonly [
      typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_RPC_NAME,
    ];
    identityHmac: string;
    credentialReferenceSha256: string;
    databaseLogin: false;
    executorMembershipEnabled: false;
    rawCredentialMaterialPresent: false;
    exportAllowed: false;
  }>;

export type CaresLinkV1CommunicationNotePreviewRunnerTerminalAuthenticatedDatabasePort =
  Readonly<{
    purpose: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE;
    callerRole: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE;
    persistVerifiedRunnerTerminal: (
      verified: CaresLinkV1VerifiedCommunicationNotePreviewRunnerTerminal,
    ) => PromiseLike<unknown>;
  }>;

export const CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNNER_TERMINAL_POSTGRES_PORT =
  undefined as
    | CaresLinkV1CommunicationNotePreviewRunnerTerminalAuthenticatedDatabasePort
    | undefined;

const AUTHENTICATED_DATABASE_PORTS = new WeakMap<
  object,
  CaresLinkV1CommunicationNotePreviewRunnerTerminalTrustComposition
>();

export function createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalPostgresPort(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewRunnerTerminalAuthenticatedDatabasePort {
  const options = exactDataRecord(value, [
    "capability",
    "trustComposition",
    "queryPort",
  ]);
  if (options.capability !== "TEST_ONLY_RUNNER_TERMINAL_POSTGRES_PORT") {
    throw unavailable();
  }
  const trustComposition =
    requireTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustComposition(
      options.trustComposition,
    );
  const callerIdentity = validateCallerIdentity(
    resolveTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalCallerIdentity(
      trustComposition,
    ),
  );
  const queryPortObject = exactDataRecord(options.queryPort, ["query"]);
  if (typeof queryPortObject.query !== "function") throw unavailable();
  const query = queryPortObject.query as CaresLinkV1CommunicationNotePreviewRunnerTerminalPostgresQueryPort["query"];

  const port = Object.freeze({
    purpose:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE,
    callerRole:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE,
    async persistVerifiedRunnerTerminal(
      verified: CaresLinkV1VerifiedCommunicationNotePreviewRunnerTerminal,
    ) {
      const terminal = validateVerifiedTerminal(
        requireTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalVerifiedForTrustComposition(
          verified,
          trustComposition,
        ),
      );
      let rawResult: unknown;
      try {
        rawResult = await query(
          CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POSTGRES_SQL,
          [terminal.statement, terminal.signature, callerIdentity.identityHmac],
        );
      } catch (error) {
        throw mapPostgresError(error);
      }
      const result = exactDataRecord(rawResult, ["rows"]);
      const rows = exactDataArray(result.rows, 1);
      const row = exactDataRecord(rows[0], ["data"]);
      if (row.data === null || row.data === undefined) throw unavailable();
      return row.data;
    },
  });
  AUTHENTICATED_DATABASE_PORTS.set(port, trustComposition);
  return port;
}

export function requireTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalPostgresPort(
  value: unknown,
  trustComposition: unknown,
): CaresLinkV1CommunicationNotePreviewRunnerTerminalAuthenticatedDatabasePort {
  const requiredComposition =
    requireTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustComposition(
      trustComposition,
    );
  if (!value || typeof value !== "object" || nodeTypes.isProxy(value)) {
    throw unavailable();
  }
  const boundComposition = AUTHENTICATED_DATABASE_PORTS.get(value);
  if (boundComposition !== requiredComposition) throw unavailable();
  return value as CaresLinkV1CommunicationNotePreviewRunnerTerminalAuthenticatedDatabasePort;
}

function validateCallerIdentity(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewRunnerTerminalCallerIdentity {
  const object = exactDataRecord(value, [
    "purpose",
    "callerRole",
    "executorRole",
    "rpcNames",
    "identityHmac",
    "credentialReferenceSha256",
    "databaseLogin",
    "executorMembershipEnabled",
    "rawCredentialMaterialPresent",
    "exportAllowed",
  ]);
  const rpcNames = exactDataArray(object.rpcNames, 1);
  if (
    object.purpose !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE ||
    object.callerRole !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE ||
    object.executorRole !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_EXECUTOR_ROLE ||
    rpcNames[0] !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_RPC_NAME ||
    !isSha256(object.identityHmac) ||
    !isSha256(object.credentialReferenceSha256) ||
    object.identityHmac === object.credentialReferenceSha256 ||
    object.databaseLogin !== false ||
    object.executorMembershipEnabled !== false ||
    object.rawCredentialMaterialPresent !== false ||
    object.exportAllowed !== false
  ) {
    throw unavailable();
  }
  return Object.freeze({
    purpose:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_DATABASE_PURPOSE,
    callerRole:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_CALLER_ROLE,
    executorRole:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_EXECUTOR_ROLE,
    rpcNames: Object.freeze([
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_RPC_NAME,
    ] as const),
    identityHmac: object.identityHmac,
    credentialReferenceSha256: object.credentialReferenceSha256,
    databaseLogin: false as const,
    executorMembershipEnabled: false as const,
    rawCredentialMaterialPresent: false as const,
    exportAllowed: false as const,
  });
}

function validateVerifiedTerminal(
  value: unknown,
): CaresLinkV1VerifiedCommunicationNotePreviewRunnerTerminal {
  if (
    !isTestOnlyCaresLinkV1VerifiedCommunicationNotePreviewRunnerTerminal(value)
  ) {
    throw unavailable();
  }
  const object = exactDataRecord(value, [
    "statement",
    "runnerTerminalDigest",
    "signature",
    "signatureSha256",
    "authenticity",
    "verifiedAt",
  ]);
  if (
    object.authenticity !== "EXTERNAL_RUNNER_TERMINAL_ED25519_VERIFIED" ||
    !isSha256(object.runnerTerminalDigest) ||
    object.runnerTerminalDigest !==
      createCaresLinkV1CommunicationNotePreviewRunnerTerminalStatementDigest(
        object.statement,
      ) ||
    typeof object.signature !== "string" ||
    !/^[A-Za-z0-9_-]{86}$/.test(object.signature) ||
    !isSha256(object.signatureSha256) ||
    object.signatureSha256 !== sha256(object.signature) ||
    !isTimestamp(object.verifiedAt)
  ) {
    throw unavailable();
  }
  return value;
}

function mapPostgresError(value: unknown) {
  const code = safeErrorString(value, "code");
  const message = safeErrorString(value, "message");
  if (code === "42501" || message === "FORBIDDEN") {
    return new CaresLinkV1ContractError(
      "FORBIDDEN",
      "The runner terminal database operation is not authorized",
    );
  }
  if (message === "RUNNER_TERMINAL_CONFLICT") {
    return new CaresLinkV1ContractError(
      "IDEMPOTENCY_CONFLICT",
      "The runner terminal was already recorded with different evidence",
    );
  }
  if (
    message === "VALIDATION_ERROR" ||
    message === "RUNNER_TERMINAL_TIME_INVALID" ||
    message === "UNSUPPORTED_TRANSACTION_ISOLATION"
  ) {
    return new CaresLinkV1ContractError(
      "VALIDATION_ERROR",
      "The runner terminal database request is invalid",
    );
  }
  if (
    message === "AUTHORIZATION_NOT_FOUND" ||
    message === "CLAIM_NOT_FOUND" ||
    message === "RESERVATION_NOT_FOUND" ||
    message === "RECEIPT_NOT_FOUND" ||
    message === "RUNNER_TERMINAL_SIGNER_NOT_INDEPENDENT" ||
    message === "RUNNER_TERMINAL_BINDING_INVALID" ||
    message === "RUNTIME_CREDENTIAL_NOT_ACTIVE" ||
    code === "55P03"
  ) {
    return new CaresLinkV1ContractError(
      "INVALID_STATE_TRANSITION",
      "The runner terminal database binding is not writable",
    );
  }
  return unavailable();
}

function safeErrorString(value: unknown, key: "code" | "message") {
  if (!value || typeof value !== "object" || nodeTypes.isProxy(value)) return "";
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor && typeof descriptor.value === "string"
    ? descriptor.value
    : "";
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
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

function exactDataArray(value: unknown, expectedLength: number): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    nodeTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0 ||
    value.length !== expectedLength
  ) {
    throw unavailable();
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
    throw unavailable();
  }
  for (let index = 0; index < expectedLength; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw unavailable();
    }
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    !lengthDescriptor ||
    lengthDescriptor.enumerable ||
    !("value" in lengthDescriptor) ||
    lengthDescriptor.value !== expectedLength
  ) {
    throw unavailable();
  }
  return value;
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function unavailable() {
  return new CaresLinkV1ContractError(
    "PRODUCT_API_DISABLED",
    "Communication Note runner terminal Postgres port is unavailable",
  );
}
