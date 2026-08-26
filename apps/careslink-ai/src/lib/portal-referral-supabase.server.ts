import "server-only";

import { createHash } from "node:crypto";

import type {
  PortalReferralApi,
  PortalReferralApiMutationMetadata,
  PortalReferralCreateCommand,
  PortalReferralSourceDetail,
} from "./portal-referral-adapter.server";
import { canonicalPortalReferralUuid } from "./portal-referral-id";
import {
  PORTAL_REFERRAL_PREVIEW_REGION_CODES,
  PORTAL_REFERRAL_PREVIEW_SERVICE_TYPE_CODES,
  PORTAL_REFERRAL_STATUSES,
  PortalReferralWorkflowError,
  createPortalReferralMutationIdHash,
  createPortalReferralMutationPayloadHash,
  type PortalReferralAssignmentDetail,
  type PortalReferralAssignmentQueueItem,
  type PortalReferralListItem,
  type PortalReferralMutationAck,
  type PortalReferralOfferListItem,
  type PortalReferralProviderCandidate,
} from "./portal-referral-workflow";
import { assertCaresLinkV1IdempotencyKey } from "./v1/shared-contracts";

export const PORTAL_REFERRAL_SUPABASE_RPC_NAMES = Object.freeze({
  authorize: "portal_referral_intake_authorize",
  sourceDetailAuthorize: "portal_referral_source_detail_authorize",
  assignmentAuthorize: "portal_referral_assignment_authorize",
  list: "portal_referral_intake_list",
  create: "portal_referral_intake_create",
  sourceDetail: "portal_referral_source_detail",
  assignmentQueue: "portal_referral_assignment_queue",
  assignmentDetail: "portal_referral_assignment_detail",
  assignmentTriage: "portal_referral_assignment_triage",
  assignmentCandidates: "portal_referral_assignment_candidates",
  assignmentOffer: "portal_referral_assignment_offer",
  providerResponseAuthorize: "portal_referral_provider_response_authorize",
  providerResponseOffers: "portal_referral_provider_response_offers",
  providerResponseRespond: "portal_referral_provider_response_respond",
} as const);

export type PortalReferralAuthorizationScope =
  | "INTAKE"
  | "SOURCE_DETAIL"
  | "ASSIGNMENT"
  | "PROVIDER_RESPONSE";

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

type PortalReferralSourceAuthorization = Readonly<{
  userId: string;
  organizationId: string;
  organizationType: "REFERRAL_SOURCE";
  organizationStatus: "ACTIVE";
  membershipRole: "referral_source";
  membershipStatus: "ACTIVE";
}>;

type PortalReferralAssignmentAuthorization =
  | Readonly<{
      userId: string;
      organizationId: string;
      organizationType: "PLATFORM";
      organizationStatus: "ACTIVE";
      membershipRole: "platform_admin";
      membershipStatus: "ACTIVE";
    }>
  | Readonly<{
      userId: string;
      organizationId: string;
      organizationType: "REFERRAL_SOURCE";
      organizationStatus: "ACTIVE";
      membershipRole: "partner_operator";
      membershipStatus: "ACTIVE";
    }>;

type PortalReferralProviderResponseAuthorization = Readonly<{
  userId: string;
  organizationId: string;
  organizationType: "PROVIDER";
  organizationStatus: "ACTIVE";
  membershipRole: "provider_member";
  membershipStatus: "ACTIVE";
  providerId: string;
  providerReviewStatus: "APPROVED";
}>;

export type PortalReferralAuthorization =
  | PortalReferralSourceAuthorization
  | PortalReferralAssignmentAuthorization
  | PortalReferralProviderResponseAuthorization;

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
  scope: PortalReferralAuthorizationScope,
): Promise<PortalReferralAuthorizationResolution> {
  const rpcName = authorizationRpcName(scope);
  if (!rpcName) return { ok: false, reason: "adapter_unavailable" };

  let result: PortalReferralSupabaseRpcResult;
  try {
    result = await client.rpc(rpcName);
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
      authorization: parseAuthorizationEnvelope(result.data, scope),
    };
  } catch {
    return { ok: false, reason: "adapter_unavailable" };
  }
}

function authorizationRpcName(scope: PortalReferralAuthorizationScope) {
  switch (scope) {
    case "INTAKE":
      return PORTAL_REFERRAL_SUPABASE_RPC_NAMES.authorize;
    case "SOURCE_DETAIL":
      return PORTAL_REFERRAL_SUPABASE_RPC_NAMES.sourceDetailAuthorize;
    case "ASSIGNMENT":
      return PORTAL_REFERRAL_SUPABASE_RPC_NAMES.assignmentAuthorize;
    case "PROVIDER_RESPONSE":
      return PORTAL_REFERRAL_SUPABASE_RPC_NAMES.providerResponseAuthorize;
    default:
      return undefined;
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
      assertSourceAuthorization(trustedAuthorization);
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
      assertSourceAuthorization(trustedAuthorization);
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

    async getReferral(referralId: string) {
      assertSourceAuthorization(trustedAuthorization);
      const requestedReferralId = requestUuid(referralId);
      const data = await callWorkflowRpc(
        client,
        PORTAL_REFERRAL_SUPABASE_RPC_NAMES.sourceDetail,
        { p_referral_id: requestedReferralId },
      );
      const detail = parseSourceDetailEnvelope(data);
      if (detail.referralId !== requestedReferralId) {
        throw invalidAdapterEnvelope();
      }
      return detail;
    },

    async listAssignmentReferrals() {
      assertAssignmentAuthorization(trustedAuthorization);
      const data = await callWorkflowRpc(
        client,
        PORTAL_REFERRAL_SUPABASE_RPC_NAMES.assignmentQueue,
        {
          p_limit: 50,
          p_before_updated_at: null,
          p_before_id: null,
        },
      );
      const items = parseAssignmentQueueEnvelope(data);
      for (const item of items) {
        assertAssignmentProjectionTenant(
          trustedAuthorization,
          item.sourceOrganizationId,
        );
      }
      return items;
    },

    async getAssignmentReferral(referralId: string) {
      assertAssignmentAuthorization(trustedAuthorization);
      const requestedReferralId = requestUuid(referralId);
      const data = await callWorkflowRpc(
        client,
        PORTAL_REFERRAL_SUPABASE_RPC_NAMES.assignmentDetail,
        { p_referral_id: requestedReferralId },
      );
      const detail = parseAssignmentDetailEnvelope(data);
      if (detail.referralId !== requestedReferralId) {
        throw invalidAdapterEnvelope();
      }
      assertAssignmentProjectionTenant(
        trustedAuthorization,
        detail.sourceOrganizationId,
      );
      return detail;
    },

    async triageReferral(referralId, expectedVersion, mutation) {
      assertAssignmentAuthorization(trustedAuthorization);
      const requestedReferralId = requestUuid(referralId);
      const version = requestRowVersion(expectedVersion);
      const command = Object.freeze({
        referralId: requestedReferralId,
        expectedVersion: version,
      });
      const hashes = createMutationRpcHashes(
        trustedAuthorization,
        "TRIAGE_REFERRAL",
        command,
        mutation,
      );
      const data = await callWorkflowRpc(
        client,
        PORTAL_REFERRAL_SUPABASE_RPC_NAMES.assignmentTriage,
        {
          p_referral_id: requestedReferralId,
          p_expected_version: version,
          ...hashes,
        },
      );
      return parseAssignmentMutationEnvelope(data, {
        referralId: requestedReferralId,
        expectedVersion: version,
        currentStatus: "TRIAGED",
        match: "NULL",
      });
    },

    async listProviderCandidates(referralId: string) {
      assertAssignmentAuthorization(trustedAuthorization);
      const requestedReferralId = requestUuid(referralId);
      const data = await callWorkflowRpc(
        client,
        PORTAL_REFERRAL_SUPABASE_RPC_NAMES.assignmentCandidates,
        { p_referral_id: requestedReferralId, p_limit: 50 },
      );
      return parseProviderCandidatesEnvelope(data);
    },

    async offerReferral(referralId, command, mutation) {
      assertAssignmentAuthorization(trustedAuthorization);
      const requestedReferralId = requestUuid(referralId);
      const normalizedCommandRecord = exactRequestRecord(command, [
        "providerId",
        "expectedVersion",
      ]);
      const normalizedCommand = Object.freeze({
        referralId: requestedReferralId,
        providerId: requestUuid(normalizedCommandRecord.providerId),
        expectedVersion: requestRowVersion(
          normalizedCommandRecord.expectedVersion,
        ),
      });
      const hashes = createMutationRpcHashes(
        trustedAuthorization,
        "OFFER_REFERRAL",
        normalizedCommand,
        mutation,
      );
      const data = await callWorkflowRpc(
        client,
        PORTAL_REFERRAL_SUPABASE_RPC_NAMES.assignmentOffer,
        {
          p_referral_id: normalizedCommand.referralId,
          p_provider_id: normalizedCommand.providerId,
          p_expected_version: normalizedCommand.expectedVersion,
          ...hashes,
        },
      );
      return parseAssignmentMutationEnvelope(data, {
        referralId: requestedReferralId,
        expectedVersion: normalizedCommand.expectedVersion,
        currentStatus: "OFFERED",
        match: "NON_NULL",
      });
    },
    async listMyOffers() {
      assertProviderResponseAuthorization(trustedAuthorization);
      const data = await callWorkflowRpc(
        client,
        PORTAL_REFERRAL_SUPABASE_RPC_NAMES.providerResponseOffers,
        { p_limit: 50, p_after_match_id: null },
      );
      return parseProviderResponseOffersEnvelope(data);
    },

    async respondToOffer(matchId, command, mutation) {
      assertProviderResponseAuthorization(trustedAuthorization);
      const requestedMatchId = requestUuid(matchId);
      const normalizedCommandRecord = exactRequestRecord(command, [
        "expectedVersion",
        "decision",
      ]);
      const decision = normalizedCommandRecord.decision;
      if (decision !== "ACCEPT" && decision !== "DECLINE") {
        throw validationError();
      }
      const normalizedCommand = Object.freeze({
        matchId: requestedMatchId,
        expectedVersion: requestRowVersion(
          normalizedCommandRecord.expectedVersion,
        ),
        decision,
      });
      const hashes = createMutationRpcHashes(
        trustedAuthorization,
        "RESPOND_TO_OFFER",
        normalizedCommand,
        mutation,
      );
      const data = await callWorkflowRpc(
        client,
        PORTAL_REFERRAL_SUPABASE_RPC_NAMES.providerResponseRespond,
        {
          p_match_id: normalizedCommand.matchId,
          p_expected_version: normalizedCommand.expectedVersion,
          p_decision: normalizedCommand.decision,
          ...hashes,
        },
      );
      return parseProviderResponseMutationEnvelope(data, normalizedCommand);
    },
    recordFollowUp: unsupported,
    listAudit: unsupported,
  });
}

function parseAuthorizationEnvelope(
  value: unknown,
  scope: PortalReferralAuthorizationScope,
): PortalReferralAuthorization {
  const envelope = exactRecord(
    value,
    scope === "PROVIDER_RESPONSE"
      ? [
          "authorized",
          "user_id",
          "organization_id",
          "organization_type",
          "organization_status",
          "membership_role",
          "membership_status",
          "provider_id",
          "provider_review_status",
        ]
      : [
          "authorized",
          "user_id",
          "organization_id",
          "organization_type",
          "organization_status",
          "membership_role",
          "membership_status",
        ],
  );
  if (envelope.authorized !== true) throw invalidAdapterEnvelope();
  return parseAuthorization(
    {
      userId: envelope.user_id,
      organizationId: envelope.organization_id,
      organizationType: envelope.organization_type,
      organizationStatus: envelope.organization_status,
      membershipRole: envelope.membership_role,
      membershipStatus: envelope.membership_status,
      ...(scope === "PROVIDER_RESPONSE"
        ? {
            providerId: envelope.provider_id,
            providerReviewStatus: envelope.provider_review_status,
          }
        : {}),
    },
    scope,
  );
}

function parseAuthorization(
  value: unknown,
  scope?: PortalReferralAuthorizationScope,
): PortalReferralAuthorization {
  const providerShape = Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (Object.prototype.hasOwnProperty.call(value, "providerId") ||
        Object.prototype.hasOwnProperty.call(value, "providerReviewStatus")),
  );
  const authorization = exactRecord(
    value,
    providerShape
      ? [
          "userId",
          "organizationId",
          "organizationType",
          "organizationStatus",
          "membershipRole",
          "membershipStatus",
          "providerId",
          "providerReviewStatus",
        ]
      : [
          "userId",
          "organizationId",
          "organizationType",
          "organizationStatus",
          "membershipRole",
          "membershipStatus",
        ],
  );
  if (
    authorization.organizationStatus !== "ACTIVE" ||
    authorization.membershipStatus !== "ACTIVE"
  ) {
    throw invalidAdapterEnvelope();
  }
  const base = {
    userId: canonicalUuid(authorization.userId),
    organizationId: canonicalUuid(authorization.organizationId),
    organizationStatus: "ACTIVE" as const,
    membershipStatus: "ACTIVE" as const,
  };
  if (
    authorization.organizationType === "PROVIDER" &&
    authorization.membershipRole === "provider_member" &&
    authorization.providerReviewStatus === "APPROVED" &&
    (scope === undefined || scope === "PROVIDER_RESPONSE")
  ) {
    return Object.freeze({
      ...base,
      organizationType: "PROVIDER",
      membershipRole: "provider_member",
      providerId: canonicalUuid(authorization.providerId),
      providerReviewStatus: "APPROVED",
    });
  }
  if (
    authorization.organizationType === "REFERRAL_SOURCE" &&
    authorization.membershipRole === "referral_source" &&
    (scope === undefined || scope === "INTAKE" || scope === "SOURCE_DETAIL")
  ) {
    return Object.freeze({
      ...base,
      organizationType: "REFERRAL_SOURCE",
      membershipRole: "referral_source",
    });
  }
  if (
    authorization.organizationType === "PLATFORM" &&
    authorization.membershipRole === "platform_admin" &&
    (scope === undefined || scope === "ASSIGNMENT")
  ) {
    return Object.freeze({
      ...base,
      organizationType: "PLATFORM",
      membershipRole: "platform_admin",
    });
  }
  if (
    authorization.organizationType === "REFERRAL_SOURCE" &&
    authorization.membershipRole === "partner_operator" &&
    (scope === undefined || scope === "ASSIGNMENT")
  ) {
    return Object.freeze({
      ...base,
      organizationType: "REFERRAL_SOURCE",
      membershipRole: "partner_operator",
    });
  }
  throw invalidAdapterEnvelope();
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

function parseSourceDetailEnvelope(value: unknown): PortalReferralSourceDetail {
  const envelope = exactRecord(value, [
    "referral_id",
    "summary",
    "region",
    "service_type",
    "current_status",
    "row_version",
    "contact",
    "created_at",
    "updated_at",
  ]);
  const contact = exactRecord(envelope.contact, ["name", "phone", "email"]);
  const createdAt = safeTimestamp(envelope.created_at);
  const updatedAt = safeTimestamp(envelope.updated_at);
  if (Date.parse(createdAt) > Date.parse(updatedAt)) {
    throw invalidAdapterEnvelope();
  }

  return Object.freeze({
    referralId: canonicalUuid(envelope.referral_id),
    summary: safeResponseText(envelope.summary, 4_000),
    region: catalogValue(envelope.region, PORTAL_REFERRAL_PREVIEW_REGION_CODES),
    serviceType: catalogValue(
      envelope.service_type,
      PORTAL_REFERRAL_PREVIEW_SERVICE_TYPE_CODES,
    ),
    currentStatus: catalogValue(envelope.current_status, PORTAL_REFERRAL_STATUSES),
    rowVersion: safeRowVersion(envelope.row_version),
    contact: Object.freeze({
      name: safeResponseText(contact.name, 200),
      phone: safeResponseText(contact.phone, 100),
      email:
        contact.email === null ? null : safeResponseText(contact.email, 320),
    }),
    createdAt,
    updatedAt,
  });
}

const PORTAL_REFERRAL_ASSIGNMENT_STATUSES = [
  "SUBMITTED",
  "TRIAGED",
  "OFFERED",
] as const;

function parseAssignmentQueueEnvelope(
  value: unknown,
): PortalReferralAssignmentQueueItem[] {
  const envelope = exactRecord(value, ["items"]);
  if (!Array.isArray(envelope.items) || envelope.items.length > 50) {
    throw invalidAdapterEnvelope();
  }
  const seen = new Set<string>();
  return envelope.items.map((entry) => {
    const item = exactRecord(entry, [
      "referral_id",
      "source_organization_id",
      "source_organization_name",
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
      sourceOrganizationId: canonicalUuid(item.source_organization_id),
      sourceOrganizationName: safeResponseText(
        item.source_organization_name,
        200,
      ),
      region: catalogValue(item.region, PORTAL_REFERRAL_PREVIEW_REGION_CODES),
      serviceType: catalogValue(
        item.service_type,
        PORTAL_REFERRAL_PREVIEW_SERVICE_TYPE_CODES,
      ),
      currentStatus: catalogValue(
        item.current_status,
        PORTAL_REFERRAL_ASSIGNMENT_STATUSES,
      ),
      rowVersion: safeRowVersion(item.row_version),
      updatedAt: safeTimestamp(item.updated_at),
    });
  });
}

function parseAssignmentDetailEnvelope(
  value: unknown,
): PortalReferralAssignmentDetail {
  const envelope = exactRecord(value, [
    "referral_id",
    "source_organization_id",
    "source_organization_name",
    "summary",
    "region",
    "service_type",
    "current_status",
    "row_version",
    "contact",
    "active_offer",
    "created_at",
    "updated_at",
  ]);
  const currentStatus = catalogValue(
    envelope.current_status,
    PORTAL_REFERRAL_ASSIGNMENT_STATUSES,
  );
  const contact = exactRecord(envelope.contact, ["name", "phone", "email"]);
  const createdAt = safeTimestamp(envelope.created_at);
  const updatedAt = safeTimestamp(envelope.updated_at);
  if (Date.parse(createdAt) > Date.parse(updatedAt)) {
    throw invalidAdapterEnvelope();
  }
  let activeOffer: PortalReferralAssignmentDetail["activeOffer"] = null;
  if (envelope.active_offer !== null) {
    const offer = exactRecord(envelope.active_offer, [
      "match_id",
      "provider_id",
      "provider_display_name",
      "match_status",
      "offered_at",
    ]);
    const offeredAt = safeTimestamp(offer.offered_at);
    if (
      offer.match_status !== "OFFERED" ||
      Date.parse(offeredAt) < Date.parse(createdAt) ||
      Date.parse(offeredAt) > Date.parse(updatedAt)
    ) {
      throw invalidAdapterEnvelope();
    }
    activeOffer = Object.freeze({
      matchId: canonicalUuid(offer.match_id),
      providerId: canonicalUuid(offer.provider_id),
      displayName: safeResponseText(offer.provider_display_name, 200),
      offeredAt,
    });
  }
  if ((currentStatus === "OFFERED") !== Boolean(activeOffer)) {
    throw invalidAdapterEnvelope();
  }
  return Object.freeze({
    referralId: canonicalUuid(envelope.referral_id),
    sourceOrganizationId: canonicalUuid(envelope.source_organization_id),
    sourceOrganizationName: safeResponseText(
      envelope.source_organization_name,
      200,
    ),
    summary: safeResponseText(envelope.summary, 4_000),
    region: catalogValue(envelope.region, PORTAL_REFERRAL_PREVIEW_REGION_CODES),
    serviceType: catalogValue(
      envelope.service_type,
      PORTAL_REFERRAL_PREVIEW_SERVICE_TYPE_CODES,
    ),
    currentStatus,
    rowVersion: safeRowVersion(envelope.row_version),
    contact: Object.freeze({
      name: safeResponseText(contact.name, 200),
      phone: safeResponseText(contact.phone, 100),
      email:
        contact.email === null ? null : safeResponseText(contact.email, 320),
    }),
    activeOffer,
    createdAt,
    updatedAt,
  });
}

function parseProviderCandidatesEnvelope(
  value: unknown,
): PortalReferralProviderCandidate[] {
  const envelope = exactRecord(value, ["items"]);
  if (!Array.isArray(envelope.items) || envelope.items.length > 50) {
    throw invalidAdapterEnvelope();
  }
  const seen = new Set<string>();
  return envelope.items.map((entry) => {
    const item = exactRecord(entry, ["provider_id", "display_name"]);
    const providerId = canonicalUuid(item.provider_id);
    if (seen.has(providerId)) throw invalidAdapterEnvelope();
    seen.add(providerId);
    return Object.freeze({
      providerId,
      displayName: safeResponseText(item.display_name, 200),
    });
  });
}

const PORTAL_REFERRAL_ACCEPTED_PROVIDER_STATUSES = [
  "ACCEPTED",
  "IN_PROGRESS",
  "NOTE_LINKED",
  "EXPORTED",
  "COMPLETED",
  "CLOSED",
] as const;

function parseProviderResponseOffersEnvelope(
  value: unknown,
): PortalReferralOfferListItem[] {
  const envelope = exactRecord(value, ["items"]);
  if (!Array.isArray(envelope.items) || envelope.items.length > 50) {
    throw invalidAdapterEnvelope();
  }
  const seenMatchIds = new Set<string>();
  const seenReferralIds = new Set<string>();
  let previousMatchId: string | undefined;
  return envelope.items.map((entry) => {
    const item = exactRecord(entry, [
      "match_id",
      "referral_id",
      "region",
      "service_type",
      "match_status",
      "current_status",
      "row_version",
    ]);
    const matchId = canonicalUuid(item.match_id);
    const referralId = canonicalUuid(item.referral_id);
    if (
      seenMatchIds.has(matchId) ||
      seenReferralIds.has(referralId) ||
      (previousMatchId !== undefined && matchId <= previousMatchId)
    ) {
      throw invalidAdapterEnvelope();
    }
    seenMatchIds.add(matchId);
    seenReferralIds.add(referralId);
    previousMatchId = matchId;

    const matchStatus = catalogValue(item.match_status, [
      "OFFERED",
      "ACCEPTED",
    ] as const);
    const currentStatus = catalogValue(
      item.current_status,
      PORTAL_REFERRAL_STATUSES,
    );
    if (
      (matchStatus === "OFFERED" && currentStatus !== "OFFERED") ||
      (matchStatus === "ACCEPTED" &&
        !(
          PORTAL_REFERRAL_ACCEPTED_PROVIDER_STATUSES as readonly string[]
        ).includes(currentStatus))
    ) {
      throw invalidAdapterEnvelope();
    }

    return Object.freeze({
      matchId,
      referralId,
      region: catalogValue(item.region, PORTAL_REFERRAL_PREVIEW_REGION_CODES),
      serviceType: catalogValue(
        item.service_type,
        PORTAL_REFERRAL_PREVIEW_SERVICE_TYPE_CODES,
      ),
      matchStatus,
      currentStatus,
      rowVersion: safeRowVersion(item.row_version),
    });
  });
}

function parseAssignmentMutationEnvelope(
  value: unknown,
  expected: Readonly<{
    referralId: string;
    expectedVersion: number;
    currentStatus: "TRIAGED" | "OFFERED";
    match: "NULL" | "NON_NULL";
  }>,
): PortalReferralMutationAck {
  const envelope = exactRecord(value, [
    "referral_id",
    "match_id",
    "current_status",
    "row_version",
    "updated_at",
  ]);
  const referralId = canonicalUuid(envelope.referral_id);
  const matchId =
    envelope.match_id === null ? null : canonicalUuid(envelope.match_id);
  const rowVersion = safeRowVersion(envelope.row_version);
  if (
    referralId !== expected.referralId ||
    envelope.current_status !== expected.currentStatus ||
    rowVersion !== expected.expectedVersion + 1 ||
    (expected.match === "NULL" ? matchId !== null : matchId === null)
  ) {
    throw invalidAdapterEnvelope();
  }
  return Object.freeze({
    referralId,
    matchId,
    currentStatus: expected.currentStatus,
    rowVersion,
    updatedAt: safeTimestamp(envelope.updated_at),
  });
}

function parseProviderResponseMutationEnvelope(
  value: unknown,
  expected: Readonly<{
    matchId: string;
    expectedVersion: number;
    decision: "ACCEPT" | "DECLINE";
  }>,
): PortalReferralMutationAck {
  const envelope = exactRecord(value, [
    "referral_id",
    "match_id",
    "current_status",
    "row_version",
    "updated_at",
  ]);
  const referralId = canonicalUuid(envelope.referral_id);
  const matchId = canonicalUuid(envelope.match_id);
  const rowVersion = safeRowVersion(envelope.row_version);
  const currentStatus = expected.decision === "ACCEPT" ? "ACCEPTED" : "TRIAGED";
  if (
    matchId !== expected.matchId ||
    envelope.current_status !== currentStatus ||
    rowVersion !== expected.expectedVersion + 1
  ) {
    throw invalidAdapterEnvelope();
  }
  return Object.freeze({
    referralId,
    matchId,
    currentStatus,
    rowVersion,
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

function createMutationRpcHashes(
  authorization:
    | PortalReferralAssignmentAuthorization
    | PortalReferralProviderResponseAuthorization,
  kind: "TRIAGE_REFERRAL" | "OFFER_REFERRAL" | "RESPOND_TO_OFFER",
  command: Readonly<Record<string, unknown>>,
  mutation: PortalReferralApiMutationMetadata,
) {
  const mutationId = assertMutationId(mutation?.mutationId);
  const correlationId = assertServerCorrelationId(mutation?.correlationId);
  return Object.freeze({
    p_mutation_id_hash: createPortalReferralMutationIdHash(mutationId),
    p_payload_hash: createPortalReferralMutationPayloadHash({
      actor: {
        organizationId: authorization.organizationId,
        role: authorization.membershipRole,
        providerId:
          authorization.membershipRole === "provider_member"
            ? authorization.providerId
            : null,
      },
      kind,
      command,
    }),
    p_correlation_id_hash: hashPrivateIdentifier(correlationId),
  });
}

function assertSourceAuthorization(
  authorization: PortalReferralAuthorization,
): asserts authorization is PortalReferralSourceAuthorization {
  if (authorization.membershipRole !== "referral_source") {
    throw new PortalReferralWorkflowError(
      "FORBIDDEN",
      "Portal referral operation is not enabled",
    );
  }
}

function assertAssignmentAuthorization(
  authorization: PortalReferralAuthorization,
): asserts authorization is PortalReferralAssignmentAuthorization {
  if (
    authorization.membershipRole !== "platform_admin" &&
    authorization.membershipRole !== "partner_operator"
  ) {
    throw new PortalReferralWorkflowError(
      "FORBIDDEN",
      "Portal referral operation is not enabled",
    );
  }
}

function assertProviderResponseAuthorization(
  authorization: PortalReferralAuthorization,
): asserts authorization is PortalReferralProviderResponseAuthorization {
  if (
    authorization.membershipRole !== "provider_member" ||
    authorization.organizationType !== "PROVIDER" ||
    authorization.providerReviewStatus !== "APPROVED"
  ) {
    throw new PortalReferralWorkflowError(
      "FORBIDDEN",
      "Portal referral operation is not enabled",
    );
  }
}

function assertAssignmentProjectionTenant(
  authorization: PortalReferralAssignmentAuthorization,
  sourceOrganizationId: string,
) {
  if (
    authorization.membershipRole === "partner_operator" &&
    authorization.organizationId !== sourceOrganizationId
  ) {
    throw invalidAdapterEnvelope();
  }
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
  const canonical = canonicalPortalReferralUuid(value);
  if (!canonical || canonical !== value) {
    throw invalidAdapterEnvelope();
  }
  return canonical;
}

function requestUuid(value: unknown) {
  const canonical = canonicalPortalReferralUuid(value);
  if (!canonical) {
    throw validationError();
  }
  return canonical;
}

function requestRowVersion(value: unknown) {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1 ||
    (value as number) >= Number.MAX_SAFE_INTEGER
  ) {
    throw validationError();
  }
  return value as number;
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

function safeResponseText(value: unknown, maxLength: number) {
  if (typeof value !== "string") throw invalidAdapterEnvelope();
  const normalized = value.trim();
  if (!normalized || normalized !== value || value.length > maxLength) {
    throw invalidAdapterEnvelope();
  }
  return value;
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

const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|([+-])(\d{2}):(\d{2}))$/;
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
