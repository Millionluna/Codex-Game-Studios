import "server-only";

import { createHash } from "node:crypto";

import type {
  PortalReferralApi,
  PortalReferralApiMutationMetadata,
  PortalReferralCreateCommand,
} from "./portal-referral-adapter.server";
import {
  PORTAL_REFERRAL_PREVIEW_REGION_CODES,
  PORTAL_REFERRAL_PREVIEW_SERVICE_TYPE_CODES,
  PORTAL_REFERRAL_STATUSES,
  PortalReferralWorkflowError,
  createPortalReferralMutationIdHash,
  createPortalReferralMutationPayloadHash,
  type PortalReferralListItem,
  type PortalReferralMutationAck,
} from "./portal-referral-workflow";
import { assertCaresLinkV1IdempotencyKey } from "./v1/shared-contracts";

export const PORTAL_REFERRAL_SUPABASE_RPC_NAMES = Object.freeze({
  authorize: "portal_referral_intake_authorize",
  list: "portal_referral_intake_list",
  create: "portal_referral_intake_create",
} as const);

export type PortalReferralSupabaseRpcError = Readonly<{
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
}>;

export type PortalReferralSupabaseRpcResult = Readonly<{
  data: unknown;
  error: PortalReferralSupabaseRpcError | null;
  status: number;
}>;

/** A request-scoped, cookie-authenticated client. It must never be service-role. */
export type PortalReferralSessionScopedSupabaseRpcClient = Readonly<{
  rpc(
    functionName: string,
    args?: Readonly<Record<string, unknown>>,
  ): PromiseLike<PortalReferralSupabaseRpcResult>;
}>;

export type PortalReferralAuthorization = Readonly<{
  userId: string;
  organizationId: string;
  organizationType: "REFERRAL_SOURCE";
  organizationStatus: "ACTIVE";
  membershipRole: "referral_source";
  membershipStatus: "ACTIVE";
}>;

export type PortalReferralAuthorizationResolution =
  | Readonly<{ ok: true; authorization: PortalReferralAuthorization }>
  | Readonly<{
      ok: false;
      reason:
        | "capability_disabled"
        | "auth_required"
        | "session_revoked"
        | "forbidden"
        | "adapter_unavailable";
    }>;

export async function authorizePortalReferralSupabaseClient(
  client: PortalReferralSessionScopedSupabaseRpcClient,
): Promise<PortalReferralAuthorizationResolution> {
  let result: PortalReferralSupabaseRpcResult;
  try {
    result = await client.rpc(PORTAL_REFERRAL_SUPABASE_RPC_NAMES.authorize);
  } catch {
    return { ok: false, reason: "adapter_unavailable" };
  }

  if (!isRpcResult(result)) {
    return { ok: false, reason: "adapter_unavailable" };
  }
  if (result.error !== null) {
    return authorizationError(result.error, result.status);
  }

  try {
    return {
      ok: true,
      authorization: parseAuthorizationEnvelope(result.data),
    };
  } catch {
    return { ok: false, reason: "adapter_unavailable" };
  }
}

export function createSupabasePortalReferralApi(
  client: PortalReferralSessionScopedSupabaseRpcClient,
  authorization: PortalReferralAuthorization,
): PortalReferralApi {
  const trustedAuthorization = parseAuthorization({
    ...authorization,
  });

  const unsupported = async (): Promise<never> => {
    throw new PortalReferralWorkflowError(
      "FORBIDDEN",
      "Portal referral operation is not enabled",
    );
  };

  return Object.freeze({
    async listReferrals() {
      const data = await callWorkflowRpc(
        client,
        PORTAL_REFERRAL_SUPABASE_RPC_NAMES.list,
        {
          p_limit: 50,
          p_before_updated_at: null,
          p_before_id: null,
        },
      );
      return parseListEnvelope(data);
    },

    async createReferral(
      command: PortalReferralCreateCommand,
      mutation: PortalReferralApiMutationMetadata,
    ) {
      const normalizedCommand = normalizeCreateCommand(command);
      const mutationId = assertMutationId(mutation?.mutationId);
      const correlationId = assertServerCorrelationId(mutation?.correlationId);
      const payloadHash = createPortalReferralMutationPayloadHash({
        actor: {
          organizationId: trustedAuthorization.organizationId,
          role: trustedAuthorization.membershipRole,
          providerId: null,
        },
        kind: "CREATE_REFERRAL",
        command: normalizedCommand,
      });
      const data = await callWorkflowRpc(
        client,
        PORTAL_REFERRAL_SUPABASE_RPC_NAMES.create,
        {
          p_mutation_id_hash: createPortalReferralMutationIdHash(mutationId),
          p_payload_hash: payloadHash,
          p_summary: normalizedCommand.summary,
          p_region: normalizedCommand.region,
          p_service_type: normalizedCommand.serviceType,
          p_contact_name: normalizedCommand.contact.name,
          p_contact_phone: normalizedCommand.contact.phone,
          p_contact_email: normalizedCommand.contact.email,
          p_correlation_id_hash: hashPrivateIdentifier(correlationId),
        },
      );
      return parseCreateEnvelope(data);
    },

    getReferral: unsupported,
    triageReferral: unsupported,
    listProviderCandidates: unsupported,
    offerReferral: unsupported,
    listMyOffers: unsupported,
    respondToOffer: unsupported,
    recordFollowUp: unsupported,
    listAudit: unsupported,
  });
}

function parseAuthorizationEnvelope(value: unknown): PortalReferralAuthorization {
  const envelope = exactRecord(value, [
    "authorized",
    "user_id",
    "organization_id",
    "organization_type",
    "organization_status",
    "membership_role",
    "membership_status",
  ]);
  if (envelope.authorized !== true) throw invalidAdapterEnvelope();
  return parseAuthorization({
    userId: envelope.user_id,
    organizationId: envelope.organization_id,
    organizationType: envelope.organization_type,
    organizationStatus: envelope.organization_status,
    membershipRole: envelope.membership_role,
    membershipStatus: envelope.membership_status,
  });
}

function parseAuthorization(value: unknown): PortalReferralAuthorization {
  const authorization = exactRecord(value, [
    "userId",
    "organizationId",
    "organizationType",
    "organizationStatus",
    "membershipRole",
    "membershipStatus",
  ]);
  if (
    authorization.organizationType !== "REFERRAL_SOURCE" ||
    authorization.organizationStatus !== "ACTIVE" ||
    authorization.membershipRole !== "referral_source" ||
    authorization.membershipStatus !== "ACTIVE"
  ) {
    throw invalidAdapterEnvelope();
  }
  return Object.freeze({
    userId: canonicalUuid(authorization.userId),
    organizationId: canonicalUuid(authorization.organizationId),
    organizationType: "REFERRAL_SOURCE",
    organizationStatus: "ACTIVE",
    membershipRole: "referral_source",
    membershipStatus: "ACTIVE",
  });
}

function parseListEnvelope(value: unknown): PortalReferralListItem[] {
  const envelope = exactRecord(value, ["items"]);
  if (!Array.isArray(envelope.items) || envelope.items.length > 50) {
    throw invalidAdapterEnvelope();
  }
  const seen = new Set<string>();
  return envelope.items.map((entry) => {
    const item = exactRecord(entry, [
      "referral_id",
      "region",
      "service_type",
      "current_status",
      "row_version",
      "updated_at",
    ]);
    const referralId = canonicalUuid(item.referral_id);
    if (seen.has(referralId)) throw invalidAdapterEnvelope();
    seen.add(referralId);
    return Object.freeze({
      referralId,
      region: catalogValue(item.region, PORTAL_REFERRAL_PREVIEW_REGION_CODES),
      serviceType: catalogValue(
        item.service_type,
        PORTAL_REFERRAL_PREVIEW_SERVICE_TYPE_CODES,
      ),
      currentStatus: catalogValue(item.current_status, PORTAL_REFERRAL_STATUSES),
      rowVersion: safeRowVersion(item.row_version),
      updatedAt: safeTimestamp(item.updated_at),
    });
  });
}

function parseCreateEnvelope(value: unknown): PortalReferralMutationAck {
  const envelope = exactRecord(value, [
    "referral_id",
    "match_id",
    "current_status",
    "row_version",
    "updated_at",
  ]);
  if (
    envelope.match_id !== null ||
    envelope.current_status !== "SUBMITTED" ||
    envelope.row_version !== 1
  ) {
    throw invalidAdapterEnvelope();
  }
  return Object.freeze({
    referralId: canonicalUuid(envelope.referral_id),
    matchId: null,
    currentStatus: "SUBMITTED",
    rowVersion: safeRowVersion(envelope.row_version),
    updatedAt: safeTimestamp(envelope.updated_at),
  });
}

function normalizeCreateCommand(
  value: PortalReferralCreateCommand,
): PortalReferralCreateCommand {
  const command = exactRequestRecord(value, [
    "summary",
    "region",
    "serviceType",
    "contact",
  ]);
  const contact = exactRequestRecord(command.contact, ["name", "phone", "email"]);
  const normalized = Object.freeze({
    summary: requiredText(command.summary, 4_000),
    region: catalogValue(
      command.region,
      PORTAL_REFERRAL_PREVIEW_REGION_CODES,
      true,
    ),
    serviceType: catalogValue(
      command.serviceType,
      PORTAL_REFERRAL_PREVIEW_SERVICE_TYPE_CODES,
      true,
    ),
    contact: Object.freeze({
      name: requiredText(contact.name, 200),
      phone: requiredText(contact.phone, 100),
      email:
        contact.email === null ? null : requiredText(contact.email, 320),
    }),
  });
  assertSummaryDoesNotContainContact(normalized.summary, normalized.contact);
  return normalized;
}

async function callWorkflowRpc(
  client: PortalReferralSessionScopedSupabaseRpcClient,
  functionName: string,
  args: Readonly<Record<string, unknown>>,
) {
  let result: PortalReferralSupabaseRpcResult;
  try {
    result = await client.rpc(functionName, args);
  } catch {
    throw invalidAdapterEnvelope();
  }
  if (!isRpcResult(result)) throw invalidAdapterEnvelope();
  if (result.error !== null) {
    throw mapWorkflowRpcError(result.error, result.status);
  }
  if (result.data === null || result.data === undefined) {
    throw invalidAdapterEnvelope();
  }
  return result.data;
}

function authorizationError(
  error: PortalReferralSupabaseRpcError,
  status: unknown,
): Exclude<PortalReferralAuthorizationResolution, { ok: true }> {
  const message = safeErrorString(error.message);
  const code = safeErrorString(error.code);
  switch (message) {
    case "PORTAL_CAPABILITY_DISABLED":
      return { ok: false, reason: "capability_disabled" };
    case "PORTAL_AUTH_REQUIRED":
      return { ok: false, reason: "auth_required" };
    case "PORTAL_SESSION_REVOKED":
      return { ok: false, reason: "session_revoked" };
    case "PORTAL_FORBIDDEN":
      return { ok: false, reason: "forbidden" };
    default:
      if (code === "PGRST302") return { ok: false, reason: "auth_required" };
      if (code === "PGRST301" || code === "PGRST303") {
        return { ok: false, reason: "session_revoked" };
      }
      if (code === "42501" && status === 401) {
        return { ok: false, reason: "auth_required" };
      }
      return { ok: false, reason: "adapter_unavailable" };
  }
}

function mapWorkflowRpcError(
  error: PortalReferralSupabaseRpcError,
  status: unknown,
): Error {
  const message = safeErrorString(error.message);
  switch (message) {
    case "PORTAL_AUTH_REQUIRED":
      return new PortalReferralWorkflowError(
        "AUTH_REQUIRED",
        "Authentication is required",
      );
    case "PORTAL_SESSION_REVOKED":
      return new PortalReferralWorkflowError(
        "SESSION_REVOKED",
        "The authenticated session is no longer active",
      );
    case "PORTAL_CAPABILITY_DISABLED":
      return new PortalReferralWorkflowError(
        "CAPABILITY_DISABLED",
        "Portal referral intake is disabled",
      );
    case "PORTAL_FORBIDDEN":
      return new PortalReferralWorkflowError(
        "FORBIDDEN",
        "The authenticated session cannot perform this operation",
      );
    case "PORTAL_NOT_FOUND":
      return new PortalReferralWorkflowError("NOT_FOUND", "Referral was not found");
    case "PORTAL_VALIDATION_ERROR":
      return new PortalReferralWorkflowError(
        "VALIDATION_ERROR",
        "Request is invalid",
      );
    case "PORTAL_IDEMPOTENCY_CONFLICT":
      return new PortalReferralWorkflowError(
        "IDEMPOTENCY_CONFLICT",
        "Idempotency key was already used for another command",
      );
    case "PORTAL_STALE_REFERRAL":
      return new PortalReferralWorkflowError(
        "STALE_REFERRAL",
        "Referral version is stale",
      );
    case "PORTAL_INVALID_STATE_TRANSITION":
      return new PortalReferralWorkflowError(
        "INVALID_STATE_TRANSITION",
        "Referral state transition is invalid",
      );
    default:
      if (status === 401) {
        return new PortalReferralWorkflowError(
          "SESSION_REVOKED",
          "The authenticated session is no longer valid",
        );
      }
      return new PortalReferralWorkflowError(
        "ADAPTER_UNAVAILABLE",
        "Portal referral adapter is unavailable",
      );
  }
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidAdapterEnvelope();
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw invalidAdapterEnvelope();
  }
  return value as Record<string, unknown>;
}

function exactRequestRecord(
  value: unknown,
  expectedKeys: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw validationError();
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw validationError();
  }
  return value as Record<string, unknown>;
}

function isRpcResult(value: unknown): value is PortalReferralSupabaseRpcResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  const status = result.status;
  const validStatus =
    Number.isInteger(status) && (status as number) >= 0 && (status as number) <= 599;
  if (!validStatus) return false;
  const validOutcome =
    result.error === null
      ? (status as number) >= 200 && (status as number) < 300
      : typeof result.error === "object" &&
        !Array.isArray(result.error) &&
        ((status as number) === 0 || (status as number) >= 400);
  return (
    Object.prototype.hasOwnProperty.call(result, "data") &&
    Object.prototype.hasOwnProperty.call(result, "error") &&
    validOutcome
  );
}

function canonicalUuid(value: unknown) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw invalidAdapterEnvelope();
  }
  return value;
}

function safeRowVersion(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw invalidAdapterEnvelope();
  }
  return value as number;
}

function safeTimestamp(value: unknown) {
  if (typeof value !== "string") throw invalidAdapterEnvelope();
  const match = value.match(TIMESTAMP_PATTERN);
  if (!match) throw invalidAdapterEnvelope();
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = Number(match[9] ?? 0);
  const offsetMinute = Number(match[10] ?? 0);
  if (
    year < 2_000 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > new Date(Date.UTC(year, month, 0)).getUTCDate() ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 14 ||
    offsetMinute > 59 ||
    (offsetHour === 14 && offsetMinute !== 0)
  ) {
    throw invalidAdapterEnvelope();
  }
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) throw invalidAdapterEnvelope();
  return timestamp.toISOString();
}

function catalogValue<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  requestValue = false,
): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    if (requestValue) throw validationError();
    throw invalidAdapterEnvelope();
  }
  return value as T[number];
}

function requiredText(value: unknown, maxLength: number) {
  if (typeof value !== "string") throw validationError();
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) throw validationError();
  return normalized;
}

function assertMutationId(value: unknown) {
  try {
    return assertCaresLinkV1IdempotencyKey(
      typeof value === "string" ? value : "",
    );
  } catch {
    throw validationError();
  }
}

function assertServerCorrelationId(value: unknown) {
  if (typeof value !== "string" || !CORRELATION_ID_PATTERN.test(value)) {
    throw invalidAdapterEnvelope();
  }
  return value;
}

function assertSummaryDoesNotContainContact(
  summary: string,
  contact: Readonly<{ name: string; phone: string; email: string | null }>,
) {
  const normalizedSummary = summary.toLocaleLowerCase("en-AU");
  const normalizedName = contact.name.trim().toLocaleLowerCase("en-AU");
  const containsContactName = normalizedSummary.includes(normalizedName);
  if (
    /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(summary) ||
    summary.replace(/[^0-9]/g, "").length >= 8 ||
    containsContactName
  ) {
    throw validationError();
  }
}

function hashPrivateIdentifier(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeErrorString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validationError() {
  return new PortalReferralWorkflowError("VALIDATION_ERROR", "Request is invalid");
}

function invalidAdapterEnvelope() {
  return new PortalReferralWorkflowError(
    "ADAPTER_UNAVAILABLE",
    "Portal referral adapter is unavailable",
  );
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|([+-])(\d{2}):(\d{2}))$/;
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
