import "server-only";

import { createHash } from "node:crypto";
import { types as nodeTypes } from "node:util";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import {
  type CaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget,
} from "./communication-note-preview-runner-terminal-resolved-runtime-binding.server";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./ndis-shadow-guard";
import { CaresLinkV1ContractError } from "./shared-contracts";

const MAXIMUM_CONTROL_PLANE_AGE_MS = 5 * 60 * 1_000;
const MAXIMUM_CONTROL_PLANE_REMAINING_MS = 5 * 60 * 1_000;
const MAXIMUM_TLS_ROOT_CERTIFICATE_BYTES = 64 * 1_024;
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SESSION_POOLER_HOST_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.pooler\.supabase\.com$/;

declare const approvedRuntimeTargetCapabilityBrand: unique symbol;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_VERSION =
  "target.communication.openai.synthetic-preview.2026-08-31.m1m.v1" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_READY =
  false as const;

const APPROVED_RUNTIME_TARGET_POLICY_CORE = deepFreeze({
  version:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_VERSION,
  status: "SOURCE_ADAPTER_NOT_ACTIVATED",
  ready: false,
  targetClass: "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW",
  productionTargetAllowed: false,
  defaultBranchAllowed: false,
  persistentAllowed: false,
  withDataAllowed: false,
  database: "postgres",
  postgresMajor: 17,
  allowedConnectionModes: ["DIRECT", "SUPAVISOR_SESSION"],
  port: 5432,
  tlsMode: "VERIFY_FULL_PINNED_CA",
  maximumControlPlaneAgeMs: MAXIMUM_CONTROL_PLANE_AGE_MS,
  maximumControlPlaneRemainingMs: MAXIMUM_CONTROL_PLANE_REMAINING_MS,
  rawCredentialMaterialPresent: false,
  targetDescriptorBinding: "CANONICAL_SHA256_SEALED_WEAKMAP",
  caBinding: "AUTHENTICATED_CONTROL_PLANE_SHA256_AND_PINNED_BYTES",
  clockBinding: "INJECTED_MONOTONIC_RESOLVER_CLOCK",
} as const);

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_POLICY_DIGEST =
  "18f77b59a92c65b58fac4090fa3b16e8c6281dedca8b11903cf09f7cf2e361d2" as const;

if (
  canonicalSha256(APPROVED_RUNTIME_TARGET_POLICY_CORE) !==
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_POLICY_DIGEST
) {
  throw unavailable();
}

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_POLICY =
  deepFreeze({
    ...APPROVED_RUNTIME_TARGET_POLICY_CORE,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_POLICY_DIGEST,
  });

/**
 * Deliberately unforgeable by string or Symbol.for lookups. The next sibling
 * adapter must import this exact symbol before it can unwrap a sealed target.
 */
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_ADAPTER_ACCESS =
  Symbol(
    "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_ADAPTER_ACCESS",
  );

export type CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetEndpoint =
  Readonly<{
    connectionMode: "DIRECT" | "SUPAVISOR_SESSION";
    hostname: string;
    port: 5432;
    database: "postgres";
    usernameProjectRefSuffix: string | null;
  }>;

export type CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetCapability =
  Readonly<{
    status: "SEALED_DISPOSABLE_PREVIEW_RUNTIME_TARGET_NOT_APPROVED";
    rawCredentialMaterialPresent: false;
    [approvedRuntimeTargetCapabilityBrand]: true;
  }>;

export type CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetResolution =
  Readonly<{
    descriptor: CaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget;
    capability: CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetCapability;
  }>;

export type CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetAdapterAccess =
  Readonly<{
    targetProjectRef: string;
    productionProjectRef: typeof CARESLINK_PRODUCTION_SUPABASE_REF;
    endpoint: CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetEndpoint;
    tlsRootCertificate: Uint8Array;
    tlsRootCertificateSha256: string;
    rawCredentialMaterialPresent: false;
  }>;

export type CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetCallContext =
  Readonly<{ signal: AbortSignal }>;

export type CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetResolver =
  Readonly<{
    status: "TEST_ONLY_SOURCE_CONTRACT_NOT_APPROVED";
    resolve: (
      request: unknown,
      context: CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetCallContext,
    ) => Promise<CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetResolution>;
  }>;

export type CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetControlPlaneObservationPort =
  Readonly<{
  observe: (
    request: Readonly<{
      source: "SUPABASE_CONTROL_PLANE";
      targetProjectRef: string;
    }>,
    context: CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetCallContext,
  ) => PromiseLike<unknown>;
  }>;

export type CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetProjectRefHmacPort =
  Readonly<{
  hmac: (
    request: Readonly<{
      purpose: "SUPABASE_PROJECT_REF_BINDING";
      projectRef: string;
    }>,
    context: CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetCallContext,
  ) => PromiseLike<unknown>;
  }>;

export type CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetPinnedCaLoader =
  Readonly<{
  load: (
    request: Readonly<{ tlsRootCertificateSha256: string }>,
    context: CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetCallContext,
  ) => PromiseLike<unknown>;
  }>;

type Clock = Readonly<{ now: () => string }>;

type ResolverDependencies = Readonly<{
  observe: CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetControlPlaneObservationPort["observe"];
  hmac: CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetProjectRefHmacPort["hmac"];
  load: CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetPinnedCaLoader["load"];
  now: Clock["now"];
}>;

type PrivateTargetRecord = {
  descriptor: CaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget;
  descriptorSha256: string;
  targetProjectRef: string;
  productionProjectRef: typeof CARESLINK_PRODUCTION_SUPABASE_REF;
  endpoint: CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetEndpoint;
  tlsRootCertificate: Uint8Array;
  tlsRootCertificateSha256: string;
  now: Clock["now"];
  lastReadAtMs: number;
};

const TEST_ONLY_RESOLVERS = new WeakMap<object, ResolverDependencies>();
const SEALED_TARGETS = new WeakMap<object, PrivateTargetRecord>();

export const CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNTIME_TARGET_RESOLVER =
  undefined as
    | CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetResolver
    | undefined;

export function createCaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetResolver(
  _value: unknown,
): never {
  void _value;
  throw unavailable();
}

/**
 * Builds only an injected TestOnly boundary. It performs no environment,
 * filesystem, Supabase SDK, network, secret-manager or database access.
 */
export function createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetResolver(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetResolver {
  try {
    const options = exactDataRecord(value, [
      "capability",
      "controlPlaneObservationPort",
      "projectRefHmacPort",
      "pinnedCaLoader",
      "clock",
    ]);
    if (
      options.capability !==
      "TEST_ONLY_APPROVED_RUNTIME_TARGET_RESOLVER"
    ) {
      throw unavailable();
    }
    const observationPort = exactDataRecord(
      options.controlPlaneObservationPort,
      ["observe"],
    );
    const hmacPort = exactDataRecord(options.projectRefHmacPort, ["hmac"]);
    const caLoader = exactDataRecord(options.pinnedCaLoader, ["load"]);
    const clock = exactDataRecord(options.clock, ["now"]);
    const functions = [
      observationPort.observe,
      hmacPort.hmac,
      caLoader.load,
      clock.now,
    ];
    if (
      functions.some(
        (candidate) =>
          typeof candidate !== "function" || nodeTypes.isProxy(candidate),
      ) ||
      new Set([
        options.controlPlaneObservationPort,
        options.projectRefHmacPort,
        options.pinnedCaLoader,
      ]).size !== 3 ||
      new Set(functions.slice(0, 3)).size !== 3
    ) {
      throw unavailable();
    }
    const dependencies = Object.freeze({
      observe:
        observationPort.observe as CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetControlPlaneObservationPort["observe"],
      hmac:
        hmacPort.hmac as CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetProjectRefHmacPort["hmac"],
      load:
        caLoader.load as CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetPinnedCaLoader["load"],
      now: clock.now as Clock["now"],
    });
    const resolver = Object.freeze({
      status: "TEST_ONLY_SOURCE_CONTRACT_NOT_APPROVED" as const,
      async resolve(
        request: unknown,
        context: CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetCallContext,
      ) {
        return resolveApprovedRuntimeTarget(dependencies, request, context);
      },
    });
    TEST_ONLY_RESOLVERS.set(resolver, dependencies);
    return resolver;
  } catch {
    throw unavailable();
  }
}

export async function resolveTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeTarget(
  resolver: unknown,
  request: unknown,
  context: CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetCallContext,
): Promise<CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetResolution> {
  try {
    if (
      !resolver ||
      typeof resolver !== "object" ||
      nodeTypes.isProxy(resolver) ||
      !TEST_ONLY_RESOLVERS.has(resolver)
    ) {
      throw unavailable();
    }
    return await (resolver as CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetResolver)
      .resolve(request, context);
  } catch {
    throw unavailable();
  }
}

/**
 * Narrow sibling-adapter reader. The public resolution remains content-free;
 * raw refs, split endpoint fields and CA bytes exist only in this WeakMap and
 * are returned as fresh copies after exact-symbol and capability checks.
 */
export function readCaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetForAdapter(
  access: unknown,
  capability: unknown,
  expectedDescriptor: unknown,
): CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetAdapterAccess {
  try {
    if (
      access !==
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_ADAPTER_ACCESS ||
      !capability ||
      typeof capability !== "object" ||
      nodeTypes.isProxy(capability) ||
      !Object.isFrozen(capability)
    ) {
      throw unavailable();
    }
    const object = exactDataRecord(capability, [
      "status",
      "rawCredentialMaterialPresent",
    ]);
    if (
      object.status !==
        "SEALED_DISPOSABLE_PREVIEW_RUNTIME_TARGET_NOT_APPROVED" ||
      object.rawCredentialMaterialPresent !== false
    ) {
      throw unavailable();
    }
    const record = SEALED_TARGETS.get(capability);
    if (!record) throw unavailable();
    const descriptor = validatePublicDescriptor(expectedDescriptor);
    const descriptorSha256 = canonicalSha256(descriptor);
    const readAt = Date.parse(requireTimestamp(record.now()));
    if (
      descriptorSha256 !== record.descriptorSha256 ||
      !samePublicDescriptor(descriptor, record.descriptor) ||
      readAt < record.lastReadAtMs
    ) {
      throw unavailable();
    }
    validateControlPlaneFreshness(
      record.descriptor.observedAt,
      record.descriptor.expiresAt,
      readAt,
    );
    record.lastReadAtMs = readAt;
    return Object.freeze({
      targetProjectRef: record.targetProjectRef,
      productionProjectRef: record.productionProjectRef,
      endpoint: Object.freeze({ ...record.endpoint }),
      tlsRootCertificate: Uint8Array.from(record.tlsRootCertificate),
      tlsRootCertificateSha256: record.tlsRootCertificateSha256,
      rawCredentialMaterialPresent: false as const,
    });
  } catch {
    throw unavailable();
  }
}

async function resolveApprovedRuntimeTarget(
  dependencies: ResolverDependencies,
  requestValue: unknown,
  contextValue: CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetCallContext,
) {
  try {
    const request = exactDataRecord(requestValue, [
      "targetProjectRef",
      "tlsRootCertificateSha256",
    ]);
    const targetProjectRef = requireProjectRef(request.targetProjectRef);
    const tlsRootCertificateSha256 = requireSha256(
      request.tlsRootCertificateSha256,
    );
    if (targetProjectRef === CARESLINK_PRODUCTION_SUPABASE_REF) {
      throw unavailable();
    }
    const context = validateContext(contextValue);
    const now = Date.parse(requireTimestamp(dependencies.now()));
    requireNotAborted(context.signal);

    const observation = validateControlPlaneObservation(
      await dependencies.observe(
        Object.freeze({
          source: "SUPABASE_CONTROL_PLANE" as const,
          targetProjectRef,
        }),
        context,
      ),
      targetProjectRef,
      tlsRootCertificateSha256,
      now,
    );
    requireNotAborted(context.signal);

    const targetHmac = await resolveProjectRefHmac(
      dependencies,
      targetProjectRef,
      context,
    );
    requireNotAborted(context.signal);
    const productionHmac = await resolveProjectRefHmac(
      dependencies,
      CARESLINK_PRODUCTION_SUPABASE_REF,
      context,
    );
    requireNotAborted(context.signal);
    if (
      targetHmac.keyReferenceSha256 !==
        productionHmac.keyReferenceSha256 ||
      targetHmac.projectRefHmac === productionHmac.projectRefHmac
    ) {
      throw unavailable();
    }

    const caResult = exactDataRecord(
      await dependencies.load(
        Object.freeze({
          tlsRootCertificateSha256:
            observation.tlsRootCertificateSha256,
        }),
        context,
      ),
      ["tlsRootCertificate", "rawCredentialMaterialPresent"],
    );
    requireNotAborted(context.signal);
    if (
      caResult.rawCredentialMaterialPresent !== false ||
      !(caResult.tlsRootCertificate instanceof Uint8Array) ||
      nodeTypes.isProxy(caResult.tlsRootCertificate) ||
      caResult.tlsRootCertificate.byteLength === 0 ||
      caResult.tlsRootCertificate.byteLength >
        MAXIMUM_TLS_ROOT_CERTIFICATE_BYTES
    ) {
      throw unavailable();
    }
    const tlsRootCertificate = Uint8Array.from(
      caResult.tlsRootCertificate,
    );
    if (
      bytesSha256(tlsRootCertificate) !==
      observation.tlsRootCertificateSha256
    ) {
      throw unavailable();
    }
    if (
      new Set([
        targetHmac.projectRefHmac,
        productionHmac.projectRefHmac,
        observation.controlPlaneEvidenceSha256,
        observation.tlsRootCertificateSha256,
      ]).size !== 4
    ) {
      throw unavailable();
    }
    const completedAt = Date.parse(requireTimestamp(dependencies.now()));
    if (completedAt < now) throw unavailable();
    validateControlPlaneFreshness(
      observation.observedAt,
      observation.expiresAt,
      completedAt,
    );

    const descriptor = Object.freeze({
      status:
        "VALIDATED_DISPOSABLE_PREVIEW_TARGET_NOT_APPROVED" as const,
      targetClass:
        "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW" as const,
      targetProjectRefHmac: targetHmac.projectRefHmac,
      productionProjectRefHmac: productionHmac.projectRefHmac,
      controlPlaneEvidenceSha256:
        observation.controlPlaneEvidenceSha256,
      databaseName: "postgres" as const,
      postgresMajor: 17 as const,
      projectStatus: "ACTIVE_HEALTHY" as const,
      tlsMode: "VERIFY_FULL_PINNED_CA" as const,
      tlsRootCertificateSha256: observation.tlsRootCertificateSha256,
      observedAt: observation.observedAt,
      expiresAt: observation.expiresAt,
      defaultBranch: false as const,
      persistent: false as const,
      withData: false as const,
      productionExcluded: true as const,
      rawCredentialMaterialPresent: false as const,
    }) satisfies CaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget;
    const capability = Object.freeze({
      status:
        "SEALED_DISPOSABLE_PREVIEW_RUNTIME_TARGET_NOT_APPROVED" as const,
      rawCredentialMaterialPresent: false as const,
    }) as CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetCapability;
    SEALED_TARGETS.set(capability, {
      descriptor,
      descriptorSha256: canonicalSha256(descriptor),
      targetProjectRef,
      productionProjectRef: CARESLINK_PRODUCTION_SUPABASE_REF,
      endpoint: observation.endpoint,
      tlsRootCertificate,
      tlsRootCertificateSha256: observation.tlsRootCertificateSha256,
      now: dependencies.now,
      lastReadAtMs: completedAt,
    });
    return Object.freeze({ descriptor, capability });
  } catch {
    throw unavailable();
  }
}

function validateControlPlaneObservation(
  value: unknown,
  expectedTargetProjectRef: string,
  expectedTlsRootCertificateSha256: string,
  now: number,
) {
  const object = exactDataRecord(value, [
    "source",
    "targetProjectRef",
    "parentProjectRef",
    "defaultBranch",
    "persistent",
    "withData",
    "postgresMajor",
    "projectStatus",
    "observedAt",
    "expiresAt",
    "controlPlaneEvidenceSha256",
    "tlsRootCertificateSha256",
    "endpoint",
    "rawCredentialMaterialPresent",
  ]);
  const targetProjectRef = requireProjectRef(object.targetProjectRef);
  const parentProjectRef = requireProjectRef(object.parentProjectRef);
  if (
    object.source !== "SUPABASE_CONTROL_PLANE" ||
    targetProjectRef !== expectedTargetProjectRef ||
    targetProjectRef === CARESLINK_PRODUCTION_SUPABASE_REF ||
    parentProjectRef !== CARESLINK_PRODUCTION_SUPABASE_REF ||
    object.defaultBranch !== false ||
    object.persistent !== false ||
    object.withData !== false ||
    object.postgresMajor !== 17 ||
    object.projectStatus !== "ACTIVE_HEALTHY" ||
    object.rawCredentialMaterialPresent !== false
  ) {
    throw unavailable();
  }
  const observedAt = requireTimestamp(object.observedAt);
  const expiresAt = requireTimestamp(object.expiresAt);
  const tlsRootCertificateSha256 = requireSha256(
    object.tlsRootCertificateSha256,
  );
  if (
    tlsRootCertificateSha256 !== expectedTlsRootCertificateSha256
  ) {
    throw unavailable();
  }
  validateControlPlaneFreshness(observedAt, expiresAt, now);
  return Object.freeze({
    controlPlaneEvidenceSha256: requireSha256(
      object.controlPlaneEvidenceSha256,
    ),
    observedAt,
    expiresAt,
    tlsRootCertificateSha256,
    endpoint: validateEndpoint(object.endpoint, targetProjectRef),
  });
}

function validatePublicDescriptor(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget {
  const object = exactDataRecord(value, [
    "status",
    "targetClass",
    "targetProjectRefHmac",
    "productionProjectRefHmac",
    "controlPlaneEvidenceSha256",
    "databaseName",
    "postgresMajor",
    "projectStatus",
    "tlsMode",
    "tlsRootCertificateSha256",
    "observedAt",
    "expiresAt",
    "defaultBranch",
    "persistent",
    "withData",
    "productionExcluded",
    "rawCredentialMaterialPresent",
  ]);
  if (
    object.status !==
      "VALIDATED_DISPOSABLE_PREVIEW_TARGET_NOT_APPROVED" ||
    object.targetClass !==
      "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW" ||
    object.databaseName !== "postgres" ||
    object.postgresMajor !== 17 ||
    object.projectStatus !== "ACTIVE_HEALTHY" ||
    object.tlsMode !== "VERIFY_FULL_PINNED_CA" ||
    object.defaultBranch !== false ||
    object.persistent !== false ||
    object.withData !== false ||
    object.productionExcluded !== true ||
    object.rawCredentialMaterialPresent !== false
  ) {
    throw unavailable();
  }
  const targetProjectRefHmac = requireSha256(
    object.targetProjectRefHmac,
  );
  const productionProjectRefHmac = requireSha256(
    object.productionProjectRefHmac,
  );
  const controlPlaneEvidenceSha256 = requireSha256(
    object.controlPlaneEvidenceSha256,
  );
  const tlsRootCertificateSha256 = requireSha256(
    object.tlsRootCertificateSha256,
  );
  if (
    new Set([
      targetProjectRefHmac,
      productionProjectRefHmac,
      controlPlaneEvidenceSha256,
      tlsRootCertificateSha256,
    ]).size !== 4
  ) {
    throw unavailable();
  }
  return Object.freeze({
    status:
      "VALIDATED_DISPOSABLE_PREVIEW_TARGET_NOT_APPROVED" as const,
    targetClass:
      "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW" as const,
    targetProjectRefHmac,
    productionProjectRefHmac,
    controlPlaneEvidenceSha256,
    databaseName: "postgres" as const,
    postgresMajor: 17 as const,
    projectStatus: "ACTIVE_HEALTHY" as const,
    tlsMode: "VERIFY_FULL_PINNED_CA" as const,
    tlsRootCertificateSha256,
    observedAt: requireTimestamp(object.observedAt),
    expiresAt: requireTimestamp(object.expiresAt),
    defaultBranch: false as const,
    persistent: false as const,
    withData: false as const,
    productionExcluded: true as const,
    rawCredentialMaterialPresent: false as const,
  });
}

function samePublicDescriptor(
  left: CaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget,
  right: CaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget,
) {
  return (
    left.status === right.status &&
    left.targetClass === right.targetClass &&
    left.targetProjectRefHmac === right.targetProjectRefHmac &&
    left.productionProjectRefHmac === right.productionProjectRefHmac &&
    left.controlPlaneEvidenceSha256 ===
      right.controlPlaneEvidenceSha256 &&
    left.databaseName === right.databaseName &&
    left.postgresMajor === right.postgresMajor &&
    left.projectStatus === right.projectStatus &&
    left.tlsMode === right.tlsMode &&
    left.tlsRootCertificateSha256 ===
      right.tlsRootCertificateSha256 &&
    left.observedAt === right.observedAt &&
    left.expiresAt === right.expiresAt &&
    left.defaultBranch === right.defaultBranch &&
    left.persistent === right.persistent &&
    left.withData === right.withData &&
    left.productionExcluded === right.productionExcluded &&
    left.rawCredentialMaterialPresent ===
      right.rawCredentialMaterialPresent
  );
}

function validateControlPlaneFreshness(
  observedAt: string,
  expiresAt: string,
  now: number,
) {
  const observedAtMs = Date.parse(observedAt);
  const expiresAtMs = Date.parse(expiresAt);
  if (
    observedAtMs > now ||
    now - observedAtMs > MAXIMUM_CONTROL_PLANE_AGE_MS ||
    expiresAtMs <= now ||
    expiresAtMs - now > MAXIMUM_CONTROL_PLANE_REMAINING_MS ||
    expiresAtMs <= observedAtMs
  ) {
    throw unavailable();
  }
}

function validateEndpoint(
  value: unknown,
  targetProjectRef: string,
): CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetEndpoint {
  const object = exactDataRecord(value, [
    "connectionMode",
    "hostname",
    "port",
    "database",
    "usernameProjectRefSuffix",
  ]);
  if (
    typeof object.hostname !== "string" ||
    object.hostname.length === 0 ||
    object.hostname !== object.hostname.toLowerCase() ||
    object.port !== 5432 ||
    object.database !== "postgres"
  ) {
    throw unavailable();
  }
  if (
    object.connectionMode === "DIRECT" &&
    object.hostname === `db.${targetProjectRef}.supabase.co` &&
    object.usernameProjectRefSuffix === null
  ) {
    return Object.freeze({
      connectionMode: "DIRECT" as const,
      hostname: object.hostname,
      port: 5432 as const,
      database: "postgres" as const,
      usernameProjectRefSuffix: null,
    });
  }
  if (
    object.connectionMode === "SUPAVISOR_SESSION" &&
    SESSION_POOLER_HOST_PATTERN.test(object.hostname) &&
    object.usernameProjectRefSuffix === targetProjectRef
  ) {
    return Object.freeze({
      connectionMode: "SUPAVISOR_SESSION" as const,
      hostname: object.hostname,
      port: 5432 as const,
      database: "postgres" as const,
      usernameProjectRefSuffix: targetProjectRef,
    });
  }
  throw unavailable();
}

async function resolveProjectRefHmac(
  dependencies: ResolverDependencies,
  projectRef: string,
  context: CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetCallContext,
) {
  const object = exactDataRecord(
    await dependencies.hmac(
      Object.freeze({
        purpose: "SUPABASE_PROJECT_REF_BINDING" as const,
        projectRef,
      }),
      context,
    ),
    ["projectRefHmac", "keyReferenceSha256", "rawKeyMaterialPresent"],
  );
  if (object.rawKeyMaterialPresent !== false) throw unavailable();
  return Object.freeze({
    projectRefHmac: requireSha256(object.projectRefHmac),
    keyReferenceSha256: requireSha256(object.keyReferenceSha256),
  });
}

function validateContext(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetCallContext {
  const object = exactDataRecord(value, ["signal"]);
  if (
    !(object.signal instanceof AbortSignal) ||
    nodeTypes.isProxy(object.signal)
  ) {
    throw unavailable();
  }
  return Object.freeze({ signal: object.signal });
}

function requireNotAborted(signal: AbortSignal) {
  if (signal.aborted) throw unavailable();
}

function requireProjectRef(value: unknown) {
  if (typeof value !== "string" || !PROJECT_REF_PATTERN.test(value)) {
    throw unavailable();
  }
  return value;
}

function requireSha256(value: unknown) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw unavailable();
  }
  return value;
}

function requireTimestamp(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length < 20 ||
    value.length > 40 ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw unavailable();
  }
  return new Date(value).toISOString();
}

function bytesSha256(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalSha256(value: unknown) {
  return createHash("sha256")
    .update(stringifyCaresLinkV1CanonicalJson(value), "utf8")
    .digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

function exactDataRecord(
  value: unknown,
  exactKeys: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw unavailable();
  }
  const ownNames = Object.getOwnPropertyNames(value);
  if (
    ownNames.length !== exactKeys.length ||
    exactKeys.some((key) => !ownNames.includes(key))
  ) {
    throw unavailable();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    exactKeys.some((key) => {
      const descriptor = descriptors[key];
      return !descriptor || !descriptor.enumerable || !("value" in descriptor);
    })
  ) {
    throw unavailable();
  }
  return value as Record<string, unknown>;
}

function unavailable() {
  return new CaresLinkV1ContractError(
    "PRODUCT_API_DISABLED",
    "Communication Note preview approved runtime target is unavailable",
  );
}
