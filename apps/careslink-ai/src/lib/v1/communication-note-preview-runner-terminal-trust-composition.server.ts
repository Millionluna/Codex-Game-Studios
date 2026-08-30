import "server-only";

import { createHash } from "node:crypto";
import { types as nodeTypes } from "node:util";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST,
  validateTestOnlyCaresLinkV1CommunicationNotePreviewKeyCustodySnapshot,
  type CaresLinkV1CommunicationNotePreviewKeyCustodySnapshot,
} from "./communication-note-preview-key-custody.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST,
  validateTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustedSigningKey,
  verifyTestOnlyCaresLinkV1CommunicationNotePreviewSignedRunnerTerminal,
  type CaresLinkV1CommunicationNotePreviewRunnerTerminalTrustedSigningKey,
  type CaresLinkV1VerifiedCommunicationNotePreviewRunnerTerminal,
} from "./communication-note-preview-runner-terminal-policy.server";
import {
  type CaresLinkV1VerifiedCommunicationNotePreviewAuthorization,
} from "./communication-note-preview-execution-authority.server";
import { CaresLinkV1ContractError } from "./shared-contracts";

const TRUST_REGISTRY_MAXIMUM_AGE_MS = 5 * 60 * 1_000;
const RUNNER_TERMINAL_CALLER_INDEX = 4;
const RUNNER_TERMINAL_DATABASE_PURPOSE =
  "RUNNER_TERMINAL_PERSISTENCE" as const;
const RUNNER_TERMINAL_CALLER_ROLE =
  "careslink_v1_preview_runner_terminal_caller" as const;
const RUNNER_TERMINAL_EXECUTOR_ROLE =
  "careslink_v1_preview_runner_terminal_executor" as const;
const RUNNER_TERMINAL_RPC_NAME =
  "persist_verified_communication_note_preview_runner_terminal" as const;

declare const runnerTerminalTrustRegistryBrand: unique symbol;
declare const runnerTerminalTrustCompositionBrand: unique symbol;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_TRUST_COMPOSITION_READY =
  false as const;

type TrustRegistryDigestCore = Readonly<{
  source: "EXTERNAL_RUNNER_TERMINAL_TRUST_REGISTRY_SNAPSHOT";
  custodyPolicyDigest: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST;
  terminalPolicyDigest: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST;
  registryReferenceSha256: string;
  signerCustodyReferenceSha256: string;
  observedAt: string;
  trustedSigningKey: CaresLinkV1CommunicationNotePreviewRunnerTerminalTrustedSigningKey;
  privateKeyMaterialPresent: false;
}>;

export type CaresLinkV1CommunicationNotePreviewRunnerTerminalTrustRegistry =
  Readonly<{
    source: "EXTERNAL_RUNNER_TERMINAL_TRUST_REGISTRY_SNAPSHOT";
    status: "TEST_ONLY_VALIDATED_NOT_APPROVED";
    custodyPolicyDigest: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST;
    terminalPolicyDigest: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST;
    registrySnapshotSha256: string;
    registryReferenceSha256: string;
    signerCustodyReferenceSha256: string;
    observedAt: string;
    signerKeyIdHash: string;
    signerPublicKeySha256: string;
    privateKeyMaterialPresent: false;
    [runnerTerminalTrustRegistryBrand]: true;
  }>;

export type CaresLinkV1CommunicationNotePreviewRunnerTerminalTrustComposition =
  Readonly<{
    status: "TEST_ONLY_COMPOSED_NOT_APPROVED";
    purpose: typeof RUNNER_TERMINAL_DATABASE_PURPOSE;
    callerRole: typeof RUNNER_TERMINAL_CALLER_ROLE;
    executorRole: typeof RUNNER_TERMINAL_EXECUTOR_ROLE;
    rpcNames: readonly [typeof RUNNER_TERMINAL_RPC_NAME];
    custodyPolicyDigest: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST;
    terminalPolicyDigest: typeof CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST;
    registrySnapshotSha256: string;
    registryReferenceSha256: string;
    signerCustodyReferenceSha256: string;
    signerKeyIdHash: string;
    signerPublicKeySha256: string;
    databaseLogin: false;
    executorMembershipEnabled: false;
    rawCredentialMaterialPresent: false;
    privateKeyMaterialPresent: false;
    [runnerTerminalTrustCompositionBrand]: true;
  }>;

type RunnerTerminalCallerIdentity =
  CaresLinkV1CommunicationNotePreviewKeyCustodySnapshot["callers"][number];

type TrustRegistryRecord = Readonly<{
  publicSnapshot: CaresLinkV1CommunicationNotePreviewRunnerTerminalTrustRegistry;
  trustedSigningKey: CaresLinkV1CommunicationNotePreviewRunnerTerminalTrustedSigningKey;
}>;

type TrustCompositionRecord = Readonly<{
  publicComposition: CaresLinkV1CommunicationNotePreviewRunnerTerminalTrustComposition;
  trustedSigningKey: CaresLinkV1CommunicationNotePreviewRunnerTerminalTrustedSigningKey;
  callerIdentity: RunnerTerminalCallerIdentity;
}>;

const TRUST_REGISTRIES = new WeakMap<object, TrustRegistryRecord>();
const TRUST_COMPOSITIONS = new WeakMap<object, TrustCompositionRecord>();
const VERIFIED_TERMINAL_COMPOSITIONS = new WeakMap<
  object,
  CaresLinkV1CommunicationNotePreviewRunnerTerminalTrustComposition
>();

export const CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNNER_TERMINAL_TRUST_REGISTRY =
  undefined as
    | CaresLinkV1CommunicationNotePreviewRunnerTerminalTrustRegistry
    | undefined;
export const CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNNER_TERMINAL_TRUST_COMPOSITION =
  undefined as
    | CaresLinkV1CommunicationNotePreviewRunnerTerminalTrustComposition
    | undefined;

export function createCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustRegistryDigest(
  value: unknown,
) {
  try {
    const core = validateTrustRegistryDigestCore(value);
    return canonicalSha256(core);
  } catch {
    throw unavailable();
  }
}

/**
 * Brands one locally supplied, content-free registry candidate after exact
 * validation. The brand proves only that this module performed validation; it
 * does not attest external provenance, perform registry I/O or grant approval.
 */
export function createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustRegistry(
  value: unknown,
  options: Readonly<{ now: string }>,
): CaresLinkV1CommunicationNotePreviewRunnerTerminalTrustRegistry {
  try {
    const optionRecord = exactDataRecord(options, ["now"]);
    const now = requireTimestamp(optionRecord.now);
    const object = exactDataRecord(value, [
      "capability",
      "source",
      "custodyPolicyDigest",
      "terminalPolicyDigest",
      "registrySnapshotSha256",
      "registryReferenceSha256",
      "signerCustodyReferenceSha256",
      "observedAt",
      "trustedSigningKey",
      "privateKeyMaterialPresent",
    ]);
    if (
      object.capability !== "TEST_ONLY_RUNNER_TERMINAL_TRUST_REGISTRY"
    ) {
      throw unavailable();
    }
    const core = validateTrustRegistryDigestCore({
      source: object.source,
      custodyPolicyDigest: object.custodyPolicyDigest,
      terminalPolicyDigest: object.terminalPolicyDigest,
      registryReferenceSha256: object.registryReferenceSha256,
      signerCustodyReferenceSha256: object.signerCustodyReferenceSha256,
      observedAt: object.observedAt,
      trustedSigningKey: object.trustedSigningKey,
      privateKeyMaterialPresent: object.privateKeyMaterialPresent,
    }, new Date(now).toISOString());
    const registrySnapshotSha256 = requireSha256(
      object.registrySnapshotSha256,
    );
    const observedAt = Date.parse(core.observedAt);
    if (
      registrySnapshotSha256 !== canonicalSha256(core) ||
      observedAt > now ||
      now - observedAt > TRUST_REGISTRY_MAXIMUM_AGE_MS ||
      new Set([
        registrySnapshotSha256,
        core.registryReferenceSha256,
        core.signerCustodyReferenceSha256,
        core.trustedSigningKey.publicKeySha256,
      ]).size !== 4
    ) {
      throw unavailable();
    }
    const publicSnapshot = Object.freeze({
      source: "EXTERNAL_RUNNER_TERMINAL_TRUST_REGISTRY_SNAPSHOT" as const,
      status: "TEST_ONLY_VALIDATED_NOT_APPROVED" as const,
      custodyPolicyDigest:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST,
      terminalPolicyDigest:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST,
      registrySnapshotSha256,
      registryReferenceSha256: core.registryReferenceSha256,
      signerCustodyReferenceSha256: core.signerCustodyReferenceSha256,
      observedAt: core.observedAt,
      signerKeyIdHash: textSha256(core.trustedSigningKey.keyId),
      signerPublicKeySha256: core.trustedSigningKey.publicKeySha256,
      privateKeyMaterialPresent: false as const,
    }) as CaresLinkV1CommunicationNotePreviewRunnerTerminalTrustRegistry;
    TRUST_REGISTRIES.set(publicSnapshot, Object.freeze({
      publicSnapshot,
      trustedSigningKey: core.trustedSigningKey,
    }));
    return publicSnapshot;
  } catch {
    throw unavailable();
  }
}

/**
 * Resolves the terminal signer and fifth caller from a complete M1g-c custody
 * candidate. No direct key, caller, login or credential input is accepted.
 */
export function composeTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrust(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewRunnerTerminalTrustComposition {
  try {
    const options = exactDataRecord(value, [
      "capability",
      "trustRegistry",
      "custodySnapshot",
      "verifiedAuthorization",
      "now",
    ]);
    if (
      options.capability !== "TEST_ONLY_RUNNER_TERMINAL_TRUST_COMPOSITION"
    ) {
      throw unavailable();
    }
    const now = new Date(requireTimestamp(options.now)).toISOString();
    const registry = requireTrustRegistry(options.trustRegistry);
    const observedAt = Date.parse(registry.publicSnapshot.observedAt);
    const composedAt = Date.parse(now);
    if (
      observedAt > composedAt ||
      composedAt - observedAt > TRUST_REGISTRY_MAXIMUM_AGE_MS
    ) {
      throw unavailable();
    }
    const custody =
      validateTestOnlyCaresLinkV1CommunicationNotePreviewKeyCustodySnapshot(
        options.custodySnapshot,
        {
          now,
          verifiedAuthorization:
            options.verifiedAuthorization as CaresLinkV1VerifiedCommunicationNotePreviewAuthorization,
        },
      );
    const terminalSigner = custody.runnerTerminalSigner;
    if (
      registry.publicSnapshot.signerCustodyReferenceSha256 !==
        terminalSigner.custodyReferenceSha256 ||
      registry.publicSnapshot.signerKeyIdHash !== terminalSigner.keyIdHash ||
      registry.publicSnapshot.signerPublicKeySha256 !==
        terminalSigner.publicKeySha256 ||
      canonicalSha256(registry.trustedSigningKey) !==
        canonicalSha256(terminalSigner.trustedSigningKey)
    ) {
      throw unavailable();
    }
    const mapping =
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_CALLER_MAPPINGS[
        RUNNER_TERMINAL_CALLER_INDEX
      ];
    const callerIdentity = custody.callers[RUNNER_TERMINAL_CALLER_INDEX];
    if (
      mapping.purpose !== RUNNER_TERMINAL_DATABASE_PURPOSE ||
      mapping.callerRole !== RUNNER_TERMINAL_CALLER_ROLE ||
      mapping.executorRole !== RUNNER_TERMINAL_EXECUTOR_ROLE ||
      mapping.rpcNames.length !== 1 ||
      mapping.rpcNames[0] !== RUNNER_TERMINAL_RPC_NAME ||
      callerIdentity?.purpose !== mapping.purpose ||
      callerIdentity.callerRole !== mapping.callerRole ||
      callerIdentity.executorRole !== mapping.executorRole ||
      callerIdentity.rpcNames.length !== 1 ||
      callerIdentity.rpcNames[0] !== RUNNER_TERMINAL_RPC_NAME
    ) {
      throw unavailable();
    }
    const publicComposition = Object.freeze({
      status: "TEST_ONLY_COMPOSED_NOT_APPROVED" as const,
      purpose: RUNNER_TERMINAL_DATABASE_PURPOSE,
      callerRole: RUNNER_TERMINAL_CALLER_ROLE,
      executorRole: RUNNER_TERMINAL_EXECUTOR_ROLE,
      rpcNames: Object.freeze([RUNNER_TERMINAL_RPC_NAME] as const),
      custodyPolicyDigest:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST,
      terminalPolicyDigest:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST,
      registrySnapshotSha256:
        registry.publicSnapshot.registrySnapshotSha256,
      registryReferenceSha256:
        registry.publicSnapshot.registryReferenceSha256,
      signerCustodyReferenceSha256:
        terminalSigner.custodyReferenceSha256,
      signerKeyIdHash: terminalSigner.keyIdHash,
      signerPublicKeySha256: terminalSigner.publicKeySha256,
      databaseLogin: false as const,
      executorMembershipEnabled: false as const,
      rawCredentialMaterialPresent: false as const,
      privateKeyMaterialPresent: false as const,
    }) as CaresLinkV1CommunicationNotePreviewRunnerTerminalTrustComposition;
    TRUST_COMPOSITIONS.set(publicComposition, Object.freeze({
      publicComposition,
      trustedSigningKey: registry.trustedSigningKey,
      callerIdentity,
    }));
    return publicComposition;
  } catch {
    throw unavailable();
  }
}

export function requireTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustComposition(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewRunnerTerminalTrustComposition {
  return requireTrustComposition(value).publicComposition;
}

export function resolveTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalCallerIdentity(
  value: unknown,
): RunnerTerminalCallerIdentity {
  return requireTrustComposition(value).callerIdentity;
}

export function verifyTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalWithTrustComposition(
  composition: unknown,
  envelope: unknown,
  now: string,
): CaresLinkV1VerifiedCommunicationNotePreviewRunnerTerminal {
  try {
    const record = requireTrustComposition(composition);
    const verified =
      verifyTestOnlyCaresLinkV1CommunicationNotePreviewSignedRunnerTerminal(
        envelope,
        { trustedKeySnapshot: record.trustedSigningKey, now },
      );
    VERIFIED_TERMINAL_COMPOSITIONS.set(verified, record.publicComposition);
    return verified;
  } catch {
    throw unavailable();
  }
}

export function requireTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalVerifiedForTrustComposition(
  value: unknown,
  composition: unknown,
): CaresLinkV1VerifiedCommunicationNotePreviewRunnerTerminal {
  const requiredComposition =
    requireTrustComposition(composition).publicComposition;
  if (!value || typeof value !== "object" || nodeTypes.isProxy(value)) {
    throw unavailable();
  }
  if (VERIFIED_TERMINAL_COMPOSITIONS.get(value) !== requiredComposition) {
    throw unavailable();
  }
  return value as CaresLinkV1VerifiedCommunicationNotePreviewRunnerTerminal;
}

function requireTrustRegistry(value: unknown) {
  if (!value || typeof value !== "object" || nodeTypes.isProxy(value)) {
    throw unavailable();
  }
  const record = TRUST_REGISTRIES.get(value);
  if (!record || record.publicSnapshot !== value) throw unavailable();
  return record;
}

function requireTrustComposition(value: unknown) {
  if (!value || typeof value !== "object" || nodeTypes.isProxy(value)) {
    throw unavailable();
  }
  const record = TRUST_COMPOSITIONS.get(value);
  if (!record || record.publicComposition !== value) throw unavailable();
  return record;
}

function validateTrustRegistryDigestCore(
  value: unknown,
  activeAt?: string,
): TrustRegistryDigestCore {
  const object = exactDataRecord(value, [
    "source",
    "custodyPolicyDigest",
    "terminalPolicyDigest",
    "registryReferenceSha256",
    "signerCustodyReferenceSha256",
    "observedAt",
    "trustedSigningKey",
    "privateKeyMaterialPresent",
  ]);
  if (
    object.source !==
      "EXTERNAL_RUNNER_TERMINAL_TRUST_REGISTRY_SNAPSHOT" ||
    object.custodyPolicyDigest !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST ||
    object.terminalPolicyDigest !==
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST ||
    object.privateKeyMaterialPresent !== false
  ) {
    throw unavailable();
  }
  const observedAt = new Date(requireTimestamp(object.observedAt)).toISOString();
  const trustedSigningKey = activeAt
    ? validateTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalTrustedSigningKey(
        object.trustedSigningKey,
        { now: activeAt },
      )
    : validateRegistrySigningKeyShape(object.trustedSigningKey);
  return Object.freeze({
    source: "EXTERNAL_RUNNER_TERMINAL_TRUST_REGISTRY_SNAPSHOT" as const,
    custodyPolicyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_KEY_CUSTODY_POLICY_DIGEST,
    terminalPolicyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL_POLICY_DIGEST,
    registryReferenceSha256: requireSha256(object.registryReferenceSha256),
    signerCustodyReferenceSha256: requireSha256(
      object.signerCustodyReferenceSha256,
    ),
    observedAt,
    trustedSigningKey,
    privateKeyMaterialPresent: false as const,
  });
}

function validateRegistrySigningKeyShape(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewRunnerTerminalTrustedSigningKey {
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
    typeof object.publicKeySpkiDerBase64 !== "string" ||
    object.status !== "ACTIVE" ||
    object.purpose !== "CARESLINK_RUNNER_TERMINAL" ||
    object.allowedDomain !==
      "CARESLINK_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL"
  ) {
    throw unavailable();
  }
  return Object.freeze({
    keyId: object.keyId,
    publicKeySpkiDerBase64: object.publicKeySpkiDerBase64,
    publicKeySha256: requireSha256(object.publicKeySha256),
    status: "ACTIVE" as const,
    notBefore: new Date(requireTimestamp(object.notBefore)).toISOString(),
    expiresAt: new Date(requireTimestamp(object.expiresAt)).toISOString(),
    purpose: "CARESLINK_RUNNER_TERMINAL" as const,
    allowedDomain:
      "CARESLINK_COMMUNICATION_NOTE_PREVIEW_RUNNER_TERMINAL" as const,
  });
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

function requireSha256(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw unavailable();
  }
  return value;
}

function requireTimestamp(value: unknown): number {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    throw unavailable();
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw unavailable();
  }
  return parsed;
}

function canonicalSha256(value: unknown) {
  return createHash("sha256")
    .update(stringifyCaresLinkV1CanonicalJson(value), "utf8")
    .digest("hex");
}

function textSha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function unavailable() {
  return new CaresLinkV1ContractError(
    "PRODUCT_API_DISABLED",
    "Communication Note runner terminal trust composition is unavailable",
  );
}
