import "server-only";

import { createHash } from "node:crypto";
import { types as nodeTypes } from "node:util";

import { Client as PgClient } from "pg";
import pgPackageJson from "pg/package.json";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_POLICY_DIGEST,
  createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeAdapters,
  type CaresLinkV1CommunicationNotePreviewApprovedRuntimeAdapterBundle,
} from "./communication-note-preview-approved-runtime-adapters.server";
import { CaresLinkV1ContractError } from "./shared-contracts";

const PG_PACKAGE_NAME = "pg" as const;
const PG_PACKAGE_VERSION = "8.23.0" as const;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_COMPOSITION_VERSION =
  "composition.communication.openai.synthetic-preview.2026-09-01.m1r.v1" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_COMPOSITION_READY =
  false as const;

const PRODUCT_RUNTIME_COMPOSITION_POLICY_CORE = deepFreeze({
  version:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_COMPOSITION_VERSION,
  status: "SOURCE_PRODUCT_RUNTIME_COMPOSITION_NOT_ACTIVATED",
  ready: false,
  runtimeDependencyPromoted: true,
  nodeRuntimeRequired: true,
  edgeRuntimeSupported: false,
  postgresDriverPackage: PG_PACKAGE_NAME,
  postgresDriverVersion: PG_PACKAGE_VERSION,
  postgresDriverImport: "STATIC_SERVER_ONLY_NAMED_IMPORT",
  approvedRuntimeAdaptersPolicyDigest:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_ADAPTERS_POLICY_DIGEST,
  sameClientConstructorForManagementAndRuntime: true,
  clientConstructorExported: false,
  constructorInstantiationAtModuleLoad: false,
  approvedTargetResolverPresent: false,
  controlPlaneIdentityPresent: false,
  credentialTransportPresent: false,
  deploymentIdentityPresent: false,
  productRouteImporterPresent: false,
  providerModelEvaluationApproved: false,
  productionTargetAllowed: false,
  productionMigrationApproved: false,
  deploymentApproved: false,
  activationApproved: false,
} as const);

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_COMPOSITION_POLICY_DIGEST =
  "1227ff3dac4283749b62b8af953dea02d51da31f3edc0a9d4c3c62a9a1364af0" as const;

if (
  canonicalSha256(PRODUCT_RUNTIME_COMPOSITION_POLICY_CORE) !==
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_COMPOSITION_POLICY_DIGEST
) {
  throw unavailable();
}

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_COMPOSITION_POLICY =
  deepFreeze({
    ...PRODUCT_RUNTIME_COMPOSITION_POLICY_CORE,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_COMPOSITION_POLICY_DIGEST,
  });

const PRIVATE_PG_CLIENT = validatePgClientConstructor();

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_COMPOSITION =
  undefined as
    | CaresLinkV1CommunicationNotePreviewApprovedRuntimeAdapterBundle
    | undefined;

export async function createCaresLinkV1CommunicationNotePreviewProductRuntimeComposition(
  _value: unknown,
  _context: unknown,
): Promise<never> {
  void _value;
  void _context;
  throw unavailable();
}

/**
 * Source-only test composition. The caller supplies audited ports, while this
 * module privately supplies the pinned production-installed PostgreSQL driver.
 * It does not discover a target, credential or environment value on its own.
 */
export async function createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeComposition(
  value: unknown,
  contextValue: unknown,
): Promise<CaresLinkV1CommunicationNotePreviewApprovedRuntimeAdapterBundle> {
  try {
    const options = exactDataRecord(value, [
      "capability",
      "targetResolver",
      "targetRequest",
      "verifiedAuthorization",
      "custodyResolver",
      "managementCredentialTransport",
      "clock",
      "entropy",
    ]);
    if (
      options.capability !==
      "TEST_ONLY_M1R_PRODUCT_RUNTIME_COMPOSITION"
    ) {
      throw unavailable();
    }
    return await createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeAdapters(
      {
        capability: "TEST_ONLY_M1M_APPROVED_RUNTIME_ADAPTERS",
        targetResolver: options.targetResolver,
        targetRequest: options.targetRequest,
        verifiedAuthorization: options.verifiedAuthorization,
        custodyResolver: options.custodyResolver,
        managementCredentialTransport:
          options.managementCredentialTransport,
        ManagementClient: PRIVATE_PG_CLIENT,
        Client: PRIVATE_PG_CLIENT,
        clock: options.clock,
        entropy: options.entropy,
      },
      contextValue,
    );
  } catch {
    throw unavailable();
  }
}

function validatePgClientConstructor() {
  if (
    pgPackageJson.name !== PG_PACKAGE_NAME ||
    pgPackageJson.version !== PG_PACKAGE_VERSION ||
    typeof PgClient !== "function" ||
    nodeTypes.isProxy(PgClient)
  ) {
    throw unavailable();
  }
  const prototypeDescriptor = Object.getOwnPropertyDescriptor(
    PgClient,
    "prototype",
  );
  const prototype =
    prototypeDescriptor && "value" in prototypeDescriptor
      ? prototypeDescriptor.value
      : undefined;
  if (
    !prototype ||
    typeof prototype !== "object" ||
    nodeTypes.isProxy(prototype) ||
    ["connect", "query", "end", "on"].some(
      (method) => !hasCallableDataMethod(prototype, method),
    )
  ) {
    throw unavailable();
  }
  return PgClient;
}

function hasCallableDataMethod(value: object, method: string) {
  let current: object | null = value;
  while (current && current !== Object.prototype) {
    if (nodeTypes.isProxy(current)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(current, method);
    if (descriptor) {
      return "value" in descriptor && typeof descriptor.value === "function";
    }
    current = Object.getPrototypeOf(current);
  }
  return false;
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
    "Communication Note preview product runtime composition is unavailable",
  );
}
