import "server-only";

import { createHash } from "node:crypto";
import { types as nodeTypes } from "node:util";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_VERSION,
  createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeBrokerAdapters,
  type CaresLinkV1CommunicationNotePreviewRuntimeBrokerManagementSessionFactory,
} from "./communication-note-preview-approved-runtime-broker.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_SESSION_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_SESSION_VERSION,
  createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementSessionFactory,
  type CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementClientConstructor,
} from "./communication-note-preview-approved-runtime-management-session.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_POSTGRES_SESSION_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_POSTGRES_SESSION_VERSION,
  createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresSessionFactory,
  type CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresClientConstructor,
} from "./communication-note-preview-approved-runtime-postgres-session.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_VERSION,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_ADAPTER_ACCESS,
  readCaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetForAdapter,
  resolveTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeTarget,
  type CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetAdapterAccess,
  type CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetCallContext,
  type CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetCapability,
  type CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetEndpoint,
} from "./communication-note-preview-approved-runtime-target.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_VERSION,
  createTestOnlyCaresLinkV1CommunicationNotePreviewDurableCallerCredentialResolver,
  type CaresLinkV1CommunicationNotePreviewExclusiveSessionFactory,
} from "./communication-note-preview-durable-caller-credential-resolver.server";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_VERSION,
  createTestOnlyCaresLinkV1CommunicationNotePreviewResolvedRunnerTerminalRuntimePort,
  createTestOnlyCaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget,
  type CaresLinkV1CommunicationNotePreviewResolvedRunnerTerminalRuntimePort,
  type CaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget,
} from "./communication-note-preview-runner-terminal-resolved-runtime-binding.server";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./ndis-shadow-guard";
import { CaresLinkV1ContractError } from "./shared-contracts";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const RUNTIME_ROLE_PATTERN =
  /^careslink_v1_preview_runner_terminal_runtime_[a-f0-9]{16}$/;
const RUNTIME_PASSWORD_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SESSION_POOLER_HOST_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.pooler\.supabase\.com$/;
const MAXIMUM_TARGET_AGE_MS = 5 * 60 * 1_000;
const MAXIMUM_CA_BYTES = 64 * 1_024;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_VERSION =
  "adapters.communication.openai.synthetic-preview.2026-08-31.m1m.v1" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_READY =
  false as const;

const APPROVED_RUNTIME_ADAPTERS_POLICY_CORE = deepFreeze({
  version:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_VERSION,
  status: "SOURCE_ADAPTER_BUNDLE_NOT_ACTIVATED",
  ready: false,
  targetResolverVersion:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_VERSION,
  targetResolverPolicyDigest:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_POLICY_DIGEST,
  brokerAdapterVersion:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_VERSION,
  brokerAdapterPolicyDigest:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_BROKER_POLICY_DIGEST,
  managementSessionVersion:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_SESSION_VERSION,
  managementSessionPolicyDigest:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_MANAGEMENT_SESSION_POLICY_DIGEST,
  postgresSessionVersion:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_POSTGRES_SESSION_VERSION,
  postgresSessionPolicyDigest:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_POSTGRES_SESSION_POLICY_DIGEST,
  durableResolverVersion:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_VERSION,
  durableResolverPolicyDigest:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_DURABLE_CALLER_CREDENTIAL_RESOLVER_POLICY_DIGEST,
  resolvedRuntimeBindingVersion:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_VERSION,
  resolvedRuntimeBindingPolicyDigest:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RESOLVED_RUNTIME_BINDING_POLICY_DIGEST,
  sameSealedTargetRequired: true,
  managementCredentialTransport: "ONE_USE_CALLBACK_ONLY",
  separateManagementAndRuntimeClients: true,
  managementConnectionProfileDerivedFromSealedTarget: true,
  runtimeOpenRequestCrossBindingRequired: true,
  rawCredentialMaterialPresent: false,
  activationApproved: false,
} as const);

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_POLICY_DIGEST =
  "f8ee0df473161d6acb3c6e601a96014c97c2e460e1d6004f5d7c1d8c56583abc" as const;

if (
  canonicalSha256(APPROVED_RUNTIME_ADAPTERS_POLICY_CORE) !==
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_POLICY_DIGEST
) {
  throw unavailable();
}

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_POLICY =
  deepFreeze({
    ...APPROVED_RUNTIME_ADAPTERS_POLICY_CORE,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_POLICY_DIGEST,
  });

export type CaresLinkV1CommunicationNotePreviewApprovedRuntimeAdapterBundle =
  Readonly<{
    status: "TEST_ONLY_M1M_APPROVED_RUNTIME_ADAPTER_BUNDLE_NOT_ACTIVATED";
    databaseTarget: CaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget;
    runtimePort: CaresLinkV1CommunicationNotePreviewResolvedRunnerTerminalRuntimePort;
  }>;

type Clock = Readonly<{ now: () => string }>;
type Entropy = Readonly<{ bytes: (length: number) => Uint8Array }>;
type PrivateTargetBinding = Readonly<{
  capability: CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetCapability;
  descriptor: CaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget;
  descriptorSha256: string;
  targetProjectRef: string;
  productionProjectRef: typeof CARESLINK_PRODUCTION_SUPABASE_REF;
  endpoint: CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetEndpoint;
  tlsRootCertificateSha256: string;
}>;

export const CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNTIME_ADAPTER_BUNDLE =
  undefined as
    | CaresLinkV1CommunicationNotePreviewApprovedRuntimeAdapterBundle
    | undefined;

export async function createCaresLinkV1CommunicationNotePreviewApprovedRuntimeAdapters(
  _value: unknown,
  _context: unknown,
): Promise<never> {
  void _value;
  void _context;
  throw unavailable();
}

/**
 * Source-only composition. It resolves and seals one target, then wires only
 * injected ports. No environment, secret-manager, network or database action
 * is performed by this factory itself.
 */
export async function createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeAdapters(
  value: unknown,
  contextValue: unknown,
): Promise<CaresLinkV1CommunicationNotePreviewApprovedRuntimeAdapterBundle> {
  let initialAccess:
    | CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetAdapterAccess
    | undefined;
  try {
    const options = exactDataRecord(value, [
      "capability",
      "targetResolver",
      "targetRequest",
      "verifiedAuthorization",
      "custodyResolver",
      "managementCredentialTransport",
      "ManagementClient",
      "Client",
      "clock",
      "entropy",
    ]);
    if (
      options.capability !== "TEST_ONLY_M1M_APPROVED_RUNTIME_ADAPTERS"
    ) {
      throw unavailable();
    }
    const context = validateContext(contextValue);
    const clock = validateClock(options.clock);
    const entropy = validateEntropy(options.entropy);
    requireNotAborted(context.signal);

    const resolution =
      await resolveTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeTarget(
        options.targetResolver,
        options.targetRequest,
        context,
      );
    requireNotAborted(context.signal);
    initialAccess =
      readCaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetForAdapter(
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_ADAPTER_ACCESS,
        resolution.capability,
        resolution.descriptor,
      );
    const initialNow = readClock(clock);
    const binding = createPrivateTargetBinding(
      resolution.capability,
      resolution.descriptor,
      initialAccess,
      initialNow,
    );
    const databaseTarget =
      createTestOnlyCaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget(
        resolution.descriptor,
      );
    const managementSessionFactory =
      createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementSessionFactory(
        {
          capability:
            "TEST_ONLY_M1M_APPROVED_RUNTIME_MANAGEMENT_SESSION",
          connectionProfile: Object.freeze({
            host: initialAccess.endpoint.hostname,
            port: 5432 as const,
            database: "postgres" as const,
            projectRef: initialAccess.targetProjectRef,
            connectionMode:
              initialAccess.endpoint.connectionMode === "DIRECT"
                ? ("DIRECT" as const)
                : ("SESSION_POOLER" as const),
            sslRootCertificate: initialAccess.tlsRootCertificate,
            sslRootCertificateSha256:
              initialAccess.tlsRootCertificateSha256,
            targetDescriptorSha256: binding.descriptorSha256,
            expiresAt: binding.descriptor.expiresAt,
          }),
          credentialTransport: options.managementCredentialTransport,
          Client:
            options.ManagementClient as CaresLinkV1CommunicationNotePreviewApprovedRuntimeManagementClientConstructor,
        },
      );
    const targetBoundManagementSessionFactory =
      createTargetBoundManagementSessionFactory(
        binding,
        managementSessionFactory,
        clock,
      );
    const brokerAdapters =
      createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeBrokerAdapters(
        {
          capability: "TEST_ONLY_M1M_APPROVED_RUNTIME_BROKER_ADAPTERS",
          managementSessionFactory: Object.freeze({
            open: targetBoundManagementSessionFactory.open,
          }),
        },
      );
    const postgresSessionFactory =
      createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresSessionFactory(
        {
          capability: "TEST_ONLY_M1M_APPROVED_RUNTIME_POSTGRES_SESSION",
          Client:
            options.Client as CaresLinkV1CommunicationNotePreviewApprovedRuntimePostgresClientConstructor,
        },
      );
    const targetBoundSessionFactory = createTargetBoundSessionFactory(
      binding,
      postgresSessionFactory,
      clock,
    );
    const callerCredentialResolver =
      createTestOnlyCaresLinkV1CommunicationNotePreviewDurableCallerCredentialResolver(
        {
          capability:
            "TEST_ONLY_M1L_DURABLE_CALLER_CREDENTIAL_RESOLVER",
          brokerPort: brokerAdapters.brokerPort,
          sessionFactory: targetBoundSessionFactory,
          auditPort: brokerAdapters.auditPort,
          clock,
          entropy,
        },
      );
    const runtimePort =
      createTestOnlyCaresLinkV1CommunicationNotePreviewResolvedRunnerTerminalRuntimePort(
        {
          capability: "TEST_ONLY_M1L_RESOLVED_RUNTIME_BINDING",
          verifiedAuthorization: options.verifiedAuthorization,
          databaseTarget,
          custodyResolver: options.custodyResolver,
          callerCredentialResolver,
          clock,
        },
      );
    requireNotAborted(context.signal);
    return Object.freeze({
      status:
        "TEST_ONLY_M1M_APPROVED_RUNTIME_ADAPTER_BUNDLE_NOT_ACTIVATED" as const,
      databaseTarget,
      runtimePort,
    });
  } catch {
    throw unavailable();
  } finally {
    clearCertificate(initialAccess?.tlsRootCertificate);
    initialAccess = undefined;
  }
}

function createTargetBoundManagementSessionFactory(
  binding: PrivateTargetBinding,
  managementSessionFactory: CaresLinkV1CommunicationNotePreviewRuntimeBrokerManagementSessionFactory,
  clock: Clock,
) {
  return Object.freeze({
    async open(contextValue: unknown) {
      let access:
        | CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetAdapterAccess
        | undefined;
      try {
        const context = validateContext(contextValue);
        validateTargetFreshness(binding.descriptor, readClock(clock));
        requireNotAborted(context.signal);
        access =
          readCaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetForAdapter(
            CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_ADAPTER_ACCESS,
            binding.capability,
            binding.descriptor,
          );
        validateTargetAccess(access, binding);
        requireNotAborted(context.signal);
        return await managementSessionFactory.open(context);
      } catch {
        throw unavailable();
      } finally {
        clearCertificate(access?.tlsRootCertificate);
        access = undefined;
      }
    },
  });
}

function createTargetBoundSessionFactory(
  binding: PrivateTargetBinding,
  postgresSessionFactory: CaresLinkV1CommunicationNotePreviewExclusiveSessionFactory,
  clock: Clock,
): CaresLinkV1CommunicationNotePreviewExclusiveSessionFactory {
  return Object.freeze({
    async open(requestValue: unknown, contextValue: unknown) {
      let access:
        | CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetAdapterAccess
        | undefined;
      let request:
        | ReturnType<typeof validateDurableOpenRequest>
        | undefined;
      let password: string | undefined;
      try {
        const context = validateContext(contextValue);
        const now = readClock(clock);
        request = validateDurableOpenRequest(
          requestValue,
          binding,
          now,
        );
        password = request.password;
        const runtimeRole = request.runtimeRole;
        const expiresAt = request.expiresAt;
        request = undefined;
        requireNotAborted(context.signal);
        access =
          readCaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetForAdapter(
            CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_ADAPTER_ACCESS,
            binding.capability,
            binding.descriptor,
          );
        validateTargetAccess(access, binding);
        requireNotAborted(context.signal);
        return await postgresSessionFactory.open(
          Object.freeze({
            connectionProfile: Object.freeze({
              host: access.endpoint.hostname,
              port: 5432 as const,
              database: "postgres" as const,
              runtimeRole,
              projectRef: access.targetProjectRef,
              connectionMode:
                access.endpoint.connectionMode === "DIRECT"
                  ? ("DIRECT" as const)
                  : ("SESSION_POOLER" as const),
              sslRootCertificate: access.tlsRootCertificate,
              sslRootCertificateSha256:
                access.tlsRootCertificateSha256,
              expiresAt,
            }),
            password,
          }),
          context,
        );
      } catch {
        throw unavailable();
      } finally {
        clearCertificate(access?.tlsRootCertificate);
        access = undefined;
        request = undefined;
        password = undefined;
      }
    },
  });
}

function validateDurableOpenRequest(
  value: unknown,
  binding: PrivateTargetBinding,
  now: string,
) {
  const object = exactDataRecord(value, [
    "acquisitionRequestDigest",
    "runtimeRole",
    "password",
    "databaseName",
    "requiredConnectionMode",
    "targetClass",
    "databaseTargetDigest",
    "targetProjectRefHmac",
    "productionProjectRefHmac",
    "controlPlaneEvidenceSha256",
    "tlsMode",
    "tlsRootCertificateSha256",
    "expiresAt",
  ]);
  const acquisitionRequestDigest = requireSha256(
    object.acquisitionRequestDigest,
  );
  const runtimeRole = requireRuntimeRole(object.runtimeRole);
  const expiresAt = requireTimestamp(object.expiresAt);
  validateTargetFreshness(binding.descriptor, now);
  if (
    runtimeRole !==
      `careslink_v1_preview_runner_terminal_runtime_${acquisitionRequestDigest.slice(0, 16)}` ||
    typeof object.password !== "string" ||
    !RUNTIME_PASSWORD_PATTERN.test(object.password) ||
    object.databaseName !== binding.descriptor.databaseName ||
    binding.descriptor.postgresMajor !== 17 ||
    object.requiredConnectionMode !==
      "ONE_PHYSICAL_SESSION_SINGLE_USE" ||
    object.targetClass !== binding.descriptor.targetClass ||
    object.databaseTargetDigest !== binding.descriptorSha256 ||
    object.targetProjectRefHmac !==
      binding.descriptor.targetProjectRefHmac ||
    object.productionProjectRefHmac !==
      binding.descriptor.productionProjectRefHmac ||
    object.controlPlaneEvidenceSha256 !==
      binding.descriptor.controlPlaneEvidenceSha256 ||
    object.tlsMode !== binding.descriptor.tlsMode ||
    object.tlsRootCertificateSha256 !==
      binding.descriptor.tlsRootCertificateSha256 ||
    Date.parse(expiresAt) <= Date.parse(now) ||
    Date.parse(expiresAt) > Date.parse(binding.descriptor.expiresAt)
  ) {
    throw unavailable();
  }
  return Object.freeze({
    runtimeRole:
      runtimeRole as `careslink_v1_preview_runner_terminal_runtime_${string}`,
    password: object.password,
    expiresAt,
  });
}

function createPrivateTargetBinding(
  capability: CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetCapability,
  descriptor: CaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget,
  access: CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetAdapterAccess,
  now: string,
): PrivateTargetBinding {
  validateTargetFreshness(descriptor, now);
  const descriptorSha256 = canonicalSha256(descriptor);
  const normalizedAccess = normalizeTargetAccess(access, descriptor);
  const binding = Object.freeze({
    capability,
    descriptor,
    descriptorSha256,
    targetProjectRef: normalizedAccess.targetProjectRef,
    productionProjectRef: normalizedAccess.productionProjectRef,
    endpoint: normalizedAccess.endpoint,
    tlsRootCertificateSha256:
      normalizedAccess.tlsRootCertificateSha256,
  });
  return binding;
}

function validateTargetAccess(
  value: unknown,
  binding: PrivateTargetBinding,
) {
  const normalized = normalizeTargetAccess(value, binding.descriptor);
  if (
    normalized.targetProjectRef !== binding.targetProjectRef ||
    normalized.productionProjectRef !== binding.productionProjectRef ||
    normalized.tlsRootCertificateSha256 !==
      binding.tlsRootCertificateSha256 ||
    !sameEndpoint(normalized.endpoint, binding.endpoint)
  ) {
    throw unavailable();
  }
}

function normalizeTargetAccess(
  value: unknown,
  descriptor: CaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget,
) {
  const access = exactDataRecord(value, [
    "targetProjectRef",
    "productionProjectRef",
    "endpoint",
    "tlsRootCertificate",
    "tlsRootCertificateSha256",
    "rawCredentialMaterialPresent",
  ]);
  const targetProjectRef = requireProjectRef(access.targetProjectRef);
  const productionProjectRef = requireProjectRef(
    access.productionProjectRef,
  );
  const tlsRootCertificateSha256 = requireSha256(
    access.tlsRootCertificateSha256,
  );
  if (
    targetProjectRef === CARESLINK_PRODUCTION_SUPABASE_REF ||
    productionProjectRef !== CARESLINK_PRODUCTION_SUPABASE_REF ||
    tlsRootCertificateSha256 !==
      descriptor.tlsRootCertificateSha256 ||
    access.rawCredentialMaterialPresent !== false ||
    !(access.tlsRootCertificate instanceof Uint8Array) ||
    nodeTypes.isProxy(access.tlsRootCertificate) ||
    access.tlsRootCertificate.byteLength === 0 ||
    access.tlsRootCertificate.byteLength > MAXIMUM_CA_BYTES ||
    bytesSha256(access.tlsRootCertificate) !==
      tlsRootCertificateSha256
  ) {
    throw unavailable();
  }
  const endpoint = validateEndpoint(access.endpoint, targetProjectRef);
  return Object.freeze({
    targetProjectRef,
    productionProjectRef:
      productionProjectRef as typeof CARESLINK_PRODUCTION_SUPABASE_REF,
    endpoint,
    tlsRootCertificateSha256,
  });
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

function sameEndpoint(
  left: CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetEndpoint,
  right: CaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetEndpoint,
) {
  return (
    left.connectionMode === right.connectionMode &&
    left.hostname === right.hostname &&
    left.port === right.port &&
    left.database === right.database &&
    left.usernameProjectRefSuffix === right.usernameProjectRefSuffix
  );
}

function validateTargetFreshness(
  descriptor: CaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget,
  now: string,
) {
  const nowMs = Date.parse(now);
  const observedAt = Date.parse(descriptor.observedAt);
  const expiresAt = Date.parse(descriptor.expiresAt);
  if (
    descriptor.databaseName !== "postgres" ||
    descriptor.postgresMajor !== 17 ||
    descriptor.projectStatus !== "ACTIVE_HEALTHY" ||
    descriptor.defaultBranch !== false ||
    descriptor.persistent !== false ||
    descriptor.withData !== false ||
    descriptor.productionExcluded !== true ||
    descriptor.rawCredentialMaterialPresent !== false ||
    observedAt > nowMs ||
    nowMs - observedAt > MAXIMUM_TARGET_AGE_MS ||
    expiresAt <= nowMs
  ) {
    throw unavailable();
  }
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

function validateClock(value: unknown): Clock {
  const object = exactDataRecord(value, ["now"]);
  if (typeof object.now !== "function" || nodeTypes.isProxy(object.now)) {
    throw unavailable();
  }
  const source = object.now as Clock["now"];
  let last = Number.NEGATIVE_INFINITY;
  return Object.freeze({
    now() {
      const normalized = requireTimestamp(source());
      const current = Date.parse(normalized);
      if (current < last) throw unavailable();
      last = current;
      return normalized;
    },
  });
}

function validateEntropy(value: unknown): Entropy {
  const object = exactDataRecord(value, ["bytes"]);
  if (typeof object.bytes !== "function" || nodeTypes.isProxy(object.bytes)) {
    throw unavailable();
  }
  return Object.freeze({ bytes: object.bytes as Entropy["bytes"] });
}

function readClock(clock: Clock) {
  try {
    return clock.now();
  } catch {
    throw unavailable();
  }
}

function requireNotAborted(signal: AbortSignal) {
  if (signal.aborted) throw unavailable();
}

function requireSha256(value: unknown) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw unavailable();
  }
  return value;
}

function requireProjectRef(value: unknown) {
  if (typeof value !== "string" || !PROJECT_REF_PATTERN.test(value)) {
    throw unavailable();
  }
  return value;
}

function requireRuntimeRole(value: unknown) {
  if (typeof value !== "string" || !RUNTIME_ROLE_PATTERN.test(value)) {
    throw unavailable();
  }
  return value;
}

function requireTimestamp(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw unavailable();
  }
  return value;
}

function clearCertificate(value: Uint8Array | undefined) {
  try {
    value?.fill(0);
  } catch {
    // A validated private copy is normally mutable; public errors stay fixed.
  }
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
  const names = Object.getOwnPropertyNames(value);
  if (
    names.length !== exactKeys.length ||
    exactKeys.some((key) => !names.includes(key))
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
    "Communication Note preview approved runtime adapters are unavailable",
  );
}
