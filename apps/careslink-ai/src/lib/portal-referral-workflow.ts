import { createHash } from "node:crypto";

import { stringifyCaresLinkV1CanonicalJson } from "./v1/canonical-json";
import { assertCaresLinkV1IdempotencyKey } from "./v1/shared-contracts";

export const PORTAL_REFERRAL_WORKFLOW_IMPLEMENTATION_STATUS =
  "LOCAL_CONTRACT_ONLY_DEFAULT_DISABLED" as const;

export const PORTAL_MEMBERSHIP_ROLES = [
  "platform_admin",
  "partner_operator",
  "referral_source",
  "provider_member",
] as const;
export type PortalMembershipRole = (typeof PORTAL_MEMBERSHIP_ROLES)[number];

export const PORTAL_ORGANIZATION_TYPES = [
  "PLATFORM",
  "PARTNER",
  "REFERRAL_SOURCE",
  "PROVIDER",
] as const;
export type PortalOrganizationType =
  (typeof PORTAL_ORGANIZATION_TYPES)[number];

export const PORTAL_REFERRAL_PREVIEW_REGION_CODES = [
  "VIC_MELBOURNE",
  "VIC_GEELONG",
  "VIC_REGIONAL",
] as const;
export const PORTAL_REFERRAL_PREVIEW_SERVICE_TYPE_CODES = [
  "SUPPORT_COORDINATION",
  "DAILY_LIVING_SUPPORT",
  "COMMUNITY_PARTICIPATION",
] as const;

export const PORTAL_REFERRAL_STATUSES = [
  "SUBMITTED",
  "TRIAGED",
  "OFFERED",
  "ACCEPTED",
  "IN_PROGRESS",
  "NOTE_LINKED",
  "EXPORTED",
  "COMPLETED",
  "CLOSED",
] as const;
export type PortalReferralStatus = (typeof PORTAL_REFERRAL_STATUSES)[number];

export const PORTAL_REFERRAL_MATCH_STATUSES = [
  "CANDIDATE",
  "OFFERED",
  "ACCEPTED",
  "DECLINED",
  "WITHDRAWN",
  "EXPIRED",
] as const;
export type PortalReferralMatchStatus =
  (typeof PORTAL_REFERRAL_MATCH_STATUSES)[number];

export const PORTAL_REFERRAL_FOLLOW_UP_OUTCOME_CODES = [
  "CONTACT_CONFIRMED",
  "INFORMATION_REQUESTED",
  "FOLLOW_UP_SCHEDULED",
  "SERVICE_COMMENCED",
  "NO_RESPONSE",
] as const;
export type PortalReferralFollowUpOutcomeCode =
  (typeof PORTAL_REFERRAL_FOLLOW_UP_OUTCOME_CODES)[number];

export const PORTAL_REFERRAL_MUTATION_KINDS = [
  "CREATE_REFERRAL",
  "TRIAGE_REFERRAL",
  "OFFER_REFERRAL",
  "RESPOND_TO_OFFER",
  "RECORD_FOLLOW_UP",
  "LINK_DOCUMENT",
  "RECORD_EXPORT",
  "COMPLETE_REFERRAL",
] as const;
export type PortalReferralMutationKind =
  (typeof PORTAL_REFERRAL_MUTATION_KINDS)[number];

/**
 * Server-resolved authorization context. A served adapter must construct this
 * from the verified session and current database membership; none of these
 * fields may be accepted from a request body.
 */
export type PortalReferralActor = Readonly<{
  userId: string;
  organizationId: string;
  organizationType: PortalOrganizationType;
  organizationStatus: "active" | "suspended" | "closed";
  role: PortalMembershipRole;
  membershipStatus: "active" | "pending" | "suspended" | "revoked";
  providerId?: string;
  providerReviewStatus?: "approved" | "pending" | "rejected" | "suspended";
}>;

type ApprovedPortalProviderActor = PortalReferralActor &
  Readonly<{
    role: "provider_member";
    organizationType: "PROVIDER";
    providerId: string;
    providerReviewStatus: "approved";
  }>;

export type PortalReferralContact = Readonly<{
  name: string;
  phone: string;
  email: string | null;
}>;

export type PortalReferralView = Readonly<{
  referralId: string;
  sourceOrganizationId: string;
  summary: string | null;
  region: string;
  serviceType: string;
  currentStatus: PortalReferralStatus;
  assignedProviderId: string | null;
  rowVersion: number;
  contact: PortalReferralContact | null;
  canonicalDocumentId: string | null;
  exportJobId: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type PortalReferralListItem = Readonly<{
  referralId: string;
  region: string;
  serviceType: string;
  currentStatus: PortalReferralStatus;
  rowVersion: number;
  updatedAt: string;
}>;

export type PortalReferralAssignmentStatus = Extract<
  PortalReferralStatus,
  "SUBMITTED" | "TRIAGED" | "OFFERED"
>;

export type PortalReferralAssignmentQueueItem = Readonly<{
  referralId: string;
  sourceOrganizationId: string;
  sourceOrganizationName: string;
  region: string;
  serviceType: string;
  currentStatus: PortalReferralAssignmentStatus;
  rowVersion: number;
  updatedAt: string;
}>;

export type PortalReferralAssignmentActiveOffer = Readonly<{
  matchId: string;
  providerId: string;
  displayName: string;
  offeredAt: string;
}>;

export type PortalReferralAssignmentDetail = Readonly<{
  referralId: string;
  sourceOrganizationId: string;
  sourceOrganizationName: string;
  summary: string;
  region: string;
  serviceType: string;
  currentStatus: PortalReferralAssignmentStatus;
  rowVersion: number;
  contact: PortalReferralContact;
  activeOffer: PortalReferralAssignmentActiveOffer | null;
  createdAt: string;
  updatedAt: string;
}>;

export type PortalReferralOfferListItem = Readonly<{
  matchId: string;
  referralId: string;
  region: string;
  serviceType: string;
  matchStatus: "OFFERED" | "ACCEPTED";
  currentStatus: PortalReferralStatus;
  rowVersion: number;
}>;

export type PortalReferralProviderCandidate = Readonly<{
  providerId: string;
  displayName: string;
}>;

export type PortalReferralMutationAck = Readonly<{
  referralId: string;
  matchId: string | null;
  currentStatus: PortalReferralStatus;
  rowVersion: number;
  updatedAt: string;
}>;

export type PortalReferralAuditEvent = Readonly<{
  auditEventId: string;
  referralId: string;
  actorUserId: string;
  actorRole: PortalMembershipRole;
  mutationKind: PortalReferralMutationKind;
  fromStatus: PortalReferralStatus | null;
  toStatus: PortalReferralStatus;
  mutationIdHash: string;
  occurredAt: string;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type PortalReferralWorkflowErrorCode =
  | "AUTH_REQUIRED"
  | "SESSION_REVOKED"
  | "CAPABILITY_DISABLED"
  | "ADAPTER_UNAVAILABLE"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "STALE_REFERRAL"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_STATE_TRANSITION";

export class PortalReferralWorkflowError extends Error {
  constructor(
    readonly code: PortalReferralWorkflowErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "PortalReferralWorkflowError";
  }
}

type StoredReferral = {
  referralId: string;
  sourceOrganizationId: string;
  sourceUserId: string;
  summary: string;
  region: string;
  serviceType: string;
  currentStatus: PortalReferralStatus;
  assignedProviderId: string | null;
  rowVersion: number;
  contact: PortalReferralContact;
  canonicalDocumentId: string | null;
  exportJobId: string | null;
  createdAt: string;
  updatedAt: string;
};

type StoredMatch = {
  matchId: string;
  referralId: string;
  providerId: string;
  status: PortalReferralMatchStatus;
  offeredAt: string;
};

type MutationReceipt = {
  payloadHash: string;
  response: PortalReferralMutationAck;
};

export type PortalReferralWorkflowOptions = Readonly<{
  createId?: () => string;
  now?: () => string;
  isProviderEligible?: (providerId: string) => boolean;
  providerCandidates?: readonly PortalReferralProviderCandidate[];
  sourceOrganizationNames?: Readonly<Record<string, string>>;
}>;

export type PortalReferralMutationMetadata = Readonly<{
  mutationId: string;
}>;

export function createMemoryPortalReferralWorkflow(
  options: PortalReferralWorkflowOptions = {},
) {
  const referrals = new Map<string, StoredReferral>();
  const matches = new Map<string, StoredMatch>();
  const audits: PortalReferralAuditEvent[] = [];
  const receipts = new Map<string, MutationReceipt>();
  const createId = options.createId ?? (() => globalThis.crypto.randomUUID());
  const now = options.now ?? (() => new Date().toISOString());
  const providerCandidates = (options.providerCandidates ?? []).map(
    (candidate) =>
      Object.freeze({
        providerId: requiredId(candidate.providerId, "providerId"),
        displayName: requiredText(candidate.displayName, "displayName", 200),
      }),
  );
  const sourceOrganizationNames = Object.fromEntries(
    Object.entries(options.sourceOrganizationNames ?? {}).map(([id, name]) => [
      requiredId(id, "sourceOrganizationId"),
      requiredText(name, "sourceOrganizationName", 200),
    ]),
  );
  const isProviderEligible =
    options.isProviderEligible ??
    ((providerId: string) =>
      providerCandidates.some((candidate) => candidate.providerId === providerId));

  function createReferral(
    actor: PortalReferralActor,
    request: Readonly<{
      summary: string;
      region: string;
      serviceType: string;
      contact: PortalReferralContact;
    }>,
    mutation: PortalReferralMutationMetadata,
  ) {
    assertActiveActor(actor, ["referral_source"]);
    assertAllowedKeys(request, ["summary", "region", "serviceType", "contact"]);
    const normalized = {
      summary: requiredText(request.summary, "summary", 4000),
      region: requiredCatalogCode(
        request.region,
        "region",
        PORTAL_REFERRAL_PREVIEW_REGION_CODES,
      ),
      serviceType: requiredCatalogCode(
        request.serviceType,
        "serviceType",
        PORTAL_REFERRAL_PREVIEW_SERVICE_TYPE_CODES,
      ),
      contact: normalizeContact(request.contact),
    };
    assertPrivateSummaryDoesNotRepeatContact(
      normalized.summary,
      normalized.contact,
    );
    return replayOrRun(actor, mutation, "CREATE_REFERRAL", normalized, () => {
      const timestamp = now();
      const referral: StoredReferral = {
        referralId: createId(),
        sourceOrganizationId: actor.organizationId,
        sourceUserId: actor.userId,
        ...normalized,
        currentStatus: "SUBMITTED",
        assignedProviderId: null,
        rowVersion: 1,
        canonicalDocumentId: null,
        exportJobId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      referrals.set(referral.referralId, referral);
      appendAudit(actor, referral, "CREATE_REFERRAL", null, mutation.mutationId);
      return mutationAck(referral);
    }, () => undefined);
  }

  function triageReferral(
    actor: PortalReferralActor,
    referralId: string,
    expectedVersion: number,
    mutation: PortalReferralMutationMetadata,
  ) {
    assertOperator(actor);
    ownedReferralForOperator(actor, referralId);
    return transition(
      actor,
      referralId,
      expectedVersion,
      mutation,
      "TRIAGE_REFERRAL",
      ["SUBMITTED"],
      "TRIAGED",
    );
  }

  function offerReferral(
    actor: PortalReferralActor,
    request: Readonly<{
      referralId: string;
      providerId: string;
      expectedVersion: number;
    }>,
    mutation: PortalReferralMutationMetadata,
  ) {
    assertOperator(actor);
    assertAllowedKeys(request, ["referralId", "providerId", "expectedVersion"]);
    const command = {
      referralId: requiredId(request.referralId, "referralId"),
      providerId: requiredId(request.providerId, "providerId"),
      expectedVersion: requiredVersion(request.expectedVersion),
    };
    return replayOrRun(actor, mutation, "OFFER_REFERRAL", command, () => {
      const referral = ownedReferralForOperator(actor, command.referralId);
      assertVersion(referral, command.expectedVersion);
      assertTransition(referral, ["TRIAGED"]);
      if (
        [...matches.values()].some(
          (match) =>
            match.referralId === referral.referralId &&
            match.status === "OFFERED",
        )
      ) {
        throw new PortalReferralWorkflowError(
          "INVALID_STATE_TRANSITION",
          "Referral already has an active offer",
        );
      }
      if (!isProviderEligible(command.providerId)) {
        throw new PortalReferralWorkflowError(
          "NOT_FOUND",
          "Eligible provider was not found",
        );
      }
      applyStatus(referral, "OFFERED");
      const match: StoredMatch = {
        matchId: createId(),
        referralId: referral.referralId,
        providerId: command.providerId,
        status: "OFFERED",
        offeredAt: referral.updatedAt,
      };
      matches.set(match.matchId, match);
      appendAudit(actor, referral, "OFFER_REFERRAL", "TRIAGED", mutation.mutationId, {
        matchId: match.matchId,
        providerId: match.providerId,
      });
      return mutationAck(referral, match.matchId);
    }, () => ownedReferralForOperator(actor, command.referralId));
  }

  function respondToOffer(
    actor: PortalReferralActor,
    request: Readonly<{
      matchId: string;
      expectedVersion: number;
      decision: "ACCEPT" | "DECLINE";
    }>,
    mutation: PortalReferralMutationMetadata,
  ) {
    assertActiveActor(actor, ["provider_member"]);
    if (!actor.providerId) {
      throw new PortalReferralWorkflowError(
        "FORBIDDEN",
        "Provider membership is not bound to a provider",
      );
    }
    assertAllowedKeys(request, ["matchId", "expectedVersion", "decision"]);
    const command = {
      matchId: requiredId(request.matchId, "matchId"),
      expectedVersion: requiredVersion(request.expectedVersion),
      decision: request.decision,
    };
    if (command.decision !== "ACCEPT" && command.decision !== "DECLINE") {
      throw new PortalReferralWorkflowError(
        "VALIDATION_ERROR",
        "decision is invalid",
      );
    }
    return replayOrRun(actor, mutation, "RESPOND_TO_OFFER", command, () => {
      const match = matches.get(command.matchId);
      if (!match || match.providerId !== actor.providerId) {
        throw new PortalReferralWorkflowError("NOT_FOUND", "Offer was not found");
      }
      if (match.status !== "OFFERED") {
        throw new PortalReferralWorkflowError(
          "INVALID_STATE_TRANSITION",
          "Offer is no longer pending",
        );
      }
      const referral = requiredReferral(match.referralId);
      assertVersion(referral, command.expectedVersion);
      assertTransition(referral, ["OFFERED"]);
      const fromStatus = referral.currentStatus;
      if (command.decision === "ACCEPT") {
        match.status = "ACCEPTED";
        referral.assignedProviderId = actor.providerId;
        applyStatus(referral, "ACCEPTED");
      } else {
        match.status = "DECLINED";
        applyStatus(referral, "TRIAGED");
      }
      appendAudit(
        actor,
        referral,
        "RESPOND_TO_OFFER",
        fromStatus,
        mutation.mutationId,
        { matchId: match.matchId, decision: command.decision },
      );
      return mutationAck(referral, match.matchId);
    }, () => {
      const match = matches.get(command.matchId);
      if (!match || match.providerId !== actor.providerId) {
        throw new PortalReferralWorkflowError("NOT_FOUND", "Offer was not found");
      }
    });
  }

  function recordFollowUp(
    actor: PortalReferralActor,
    request: Readonly<{
      referralId: string;
      expectedVersion: number;
      outcomeCode: PortalReferralFollowUpOutcomeCode;
    }>,
    mutation: PortalReferralMutationMetadata,
  ) {
    assertAllowedKeys(request, ["referralId", "expectedVersion", "outcomeCode"]);
    const command = {
      referralId: requiredId(request.referralId, "referralId"),
      expectedVersion: requiredVersion(request.expectedVersion),
      outcomeCode: assertFollowUpOutcomeCode(request.outcomeCode),
    };
    assertCanWorkReferral(actor, command.referralId);
    return replayOrRun(actor, mutation, "RECORD_FOLLOW_UP", command, () => {
      const referral = requiredReferral(command.referralId);
      assertVersion(referral, command.expectedVersion);
      assertTransition(referral, ["ACCEPTED", "IN_PROGRESS"]);
      const previous = referral.currentStatus;
      applyStatus(referral, "IN_PROGRESS");
      appendAudit(
        actor,
        referral,
        "RECORD_FOLLOW_UP",
        previous,
        mutation.mutationId,
        { outcomeCode: command.outcomeCode },
      );
      return mutationAck(referral);
    }, () => assertCanWorkReferral(actor, command.referralId));
  }

  function linkDocument(
    actor: PortalReferralActor,
    request: Readonly<{
      referralId: string;
      canonicalDocumentId: string;
      expectedVersion: number;
    }>,
    mutation: PortalReferralMutationMetadata,
  ) {
    assertAllowedKeys(request, [
      "referralId",
      "canonicalDocumentId",
      "expectedVersion",
    ]);
    const command = {
      referralId: requiredId(request.referralId, "referralId"),
      canonicalDocumentId: requiredId(
        request.canonicalDocumentId,
        "canonicalDocumentId",
      ),
      expectedVersion: requiredVersion(request.expectedVersion),
    };
    assertCanWorkReferral(actor, command.referralId);
    return replayOrRun(actor, mutation, "LINK_DOCUMENT", command, () => {
      const referral = requiredReferral(command.referralId);
      assertVersion(referral, command.expectedVersion);
      assertTransition(referral, ["IN_PROGRESS"]);
      referral.canonicalDocumentId = command.canonicalDocumentId;
      applyStatus(referral, "NOTE_LINKED");
      appendAudit(actor, referral, "LINK_DOCUMENT", "IN_PROGRESS", mutation.mutationId, {
        canonicalDocumentId: command.canonicalDocumentId,
      });
      return mutationAck(referral);
    }, () => assertCanWorkReferral(actor, command.referralId));
  }

  function recordExport(
    actor: PortalReferralActor,
    request: Readonly<{
      referralId: string;
      exportJobId: string;
      expectedVersion: number;
    }>,
    mutation: PortalReferralMutationMetadata,
  ) {
    assertAllowedKeys(request, ["referralId", "exportJobId", "expectedVersion"]);
    const command = {
      referralId: requiredId(request.referralId, "referralId"),
      exportJobId: requiredId(request.exportJobId, "exportJobId"),
      expectedVersion: requiredVersion(request.expectedVersion),
    };
    assertCanWorkReferral(actor, command.referralId);
    return replayOrRun(actor, mutation, "RECORD_EXPORT", command, () => {
      const referral = requiredReferral(command.referralId);
      assertVersion(referral, command.expectedVersion);
      assertTransition(referral, ["NOTE_LINKED"]);
      referral.exportJobId = command.exportJobId;
      applyStatus(referral, "EXPORTED");
      appendAudit(actor, referral, "RECORD_EXPORT", "NOTE_LINKED", mutation.mutationId, {
        exportJobId: command.exportJobId,
      });
      return mutationAck(referral);
    }, () => assertCanWorkReferral(actor, command.referralId));
  }

  function completeReferral(
    actor: PortalReferralActor,
    referralId: string,
    expectedVersion: number,
    mutation: PortalReferralMutationMetadata,
  ) {
    assertCanWorkReferral(actor, referralId);
    return transition(
      actor,
      referralId,
      expectedVersion,
      mutation,
      "COMPLETE_REFERRAL",
      ["EXPORTED"],
      "COMPLETED",
    );
  }

  function getReferral(actor: PortalReferralActor, referralId: string) {
    assertActiveActor(actor, PORTAL_MEMBERSHIP_ROLES);
    return viewReferral(actor, requiredReferral(referralId));
  }

  function listReferrals(actor: PortalReferralActor) {
    assertActiveActor(actor, PORTAL_MEMBERSHIP_ROLES);
    const items: PortalReferralListItem[] = [];
    for (const referral of referrals.values()) {
      try {
        const view = viewReferral(actor, referral);
        items.push(
          Object.freeze({
            referralId: view.referralId,
            region: view.region,
            serviceType: view.serviceType,
            currentStatus: view.currentStatus,
            rowVersion: view.rowVersion,
            updatedAt: view.updatedAt,
          }),
        );
      } catch (error) {
        if (
          error instanceof PortalReferralWorkflowError &&
          error.code === "NOT_FOUND"
        ) {
          continue;
        }
        throw error;
      }
    }
    return items.sort((left, right) =>
      left.referralId.localeCompare(right.referralId),
    );
  }

  function listAssignmentReferrals(actor: PortalReferralActor) {
    assertOperator(actor);
    const items: PortalReferralAssignmentQueueItem[] = [];
    for (const referral of referrals.values()) {
      if (!isAssignmentStatus(referral.currentStatus)) continue;
      if (
        actor.role === "partner_operator" &&
        actor.organizationId !== referral.sourceOrganizationId
      ) {
        continue;
      }
      items.push(
        Object.freeze({
          referralId: referral.referralId,
          sourceOrganizationId: referral.sourceOrganizationId,
          sourceOrganizationName:
            sourceOrganizationNames[referral.sourceOrganizationId] ??
            referral.sourceOrganizationId,
          region: referral.region,
          serviceType: referral.serviceType,
          currentStatus: referral.currentStatus,
          rowVersion: referral.rowVersion,
          updatedAt: referral.updatedAt,
        }),
      );
    }
    return items
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) ||
          right.referralId.localeCompare(left.referralId),
      )
      .slice(0, 50);
  }

  function getAssignmentReferral(
    actor: PortalReferralActor,
    referralId: string,
  ): PortalReferralAssignmentDetail {
    assertOperator(actor);
    const referral = ownedReferralForOperator(
      actor,
      requiredId(referralId, "referralId"),
    );
    if (!isAssignmentStatus(referral.currentStatus)) {
      throw new PortalReferralWorkflowError("NOT_FOUND", "Referral was not found");
    }
    const activeMatch = [...matches.values()].find(
      (match) =>
        match.referralId === referral.referralId && match.status === "OFFERED",
    );
    if (
      (referral.currentStatus === "OFFERED") !== Boolean(activeMatch)
    ) {
      throw new PortalReferralWorkflowError(
        "INVALID_STATE_TRANSITION",
        "Assignment offer state is inconsistent",
      );
    }
    const activeCandidate = activeMatch
      ? providerCandidates.find(
          (candidate) => candidate.providerId === activeMatch.providerId,
        )
      : undefined;
    if (activeMatch && !activeCandidate) {
      throw new PortalReferralWorkflowError(
        "INVALID_STATE_TRANSITION",
        "Assignment provider is unavailable",
      );
    }
    return clone({
      referralId: referral.referralId,
      sourceOrganizationId: referral.sourceOrganizationId,
      sourceOrganizationName:
        sourceOrganizationNames[referral.sourceOrganizationId] ??
        referral.sourceOrganizationId,
      summary: referral.summary,
      region: referral.region,
      serviceType: referral.serviceType,
      currentStatus: referral.currentStatus,
      rowVersion: referral.rowVersion,
      contact: referral.contact,
      activeOffer:
        activeMatch && activeCandidate
          ? {
              matchId: activeMatch.matchId,
              providerId: activeMatch.providerId,
              displayName: activeCandidate.displayName,
              offeredAt: activeMatch.offeredAt,
            }
          : null,
      createdAt: referral.createdAt,
      updatedAt: referral.updatedAt,
    });
  }

  function listMyOffers(actor: PortalReferralActor) {
    assertActiveActor(actor, ["provider_member"]);
    if (!actor.providerId) {
      throw new PortalReferralWorkflowError(
        "FORBIDDEN",
        "Provider membership is not bound to a provider",
      );
    }
    const items: PortalReferralOfferListItem[] = [];
    for (const match of matches.values()) {
      if (
        match.providerId !== actor.providerId ||
        (match.status !== "OFFERED" && match.status !== "ACCEPTED")
      ) {
        continue;
      }
      const referral = requiredReferral(match.referralId);
      items.push(
        Object.freeze({
          matchId: match.matchId,
          referralId: referral.referralId,
          region: referral.region,
          serviceType: referral.serviceType,
          matchStatus: match.status,
          currentStatus: referral.currentStatus,
          rowVersion: referral.rowVersion,
        }),
      );
    }
    return items.sort((left, right) => left.matchId.localeCompare(right.matchId));
  }

  function listProviderCandidates(
    actor: PortalReferralActor,
    referralId: string,
  ) {
    assertOperator(actor);
    const referral = ownedReferralForOperator(
      actor,
      requiredId(referralId, "referralId"),
    );
    assertTransition(referral, ["TRIAGED"]);
    return providerCandidates
      .filter((candidate) => isProviderEligible(candidate.providerId))
      .map(clone)
      .sort((left, right) => left.providerId.localeCompare(right.providerId))
      .slice(0, 50);
  }

  function getAudit(actor: PortalReferralActor, referralId: string) {
    assertOperator(actor);
    ownedReferralForOperator(actor, referralId);
    return audits.filter((event) => event.referralId === referralId).map(clone);
  }

  function transition(
    actor: PortalReferralActor,
    referralId: string,
    expectedVersion: number,
    mutation: PortalReferralMutationMetadata,
    mutationKind: PortalReferralMutationKind,
    from: readonly PortalReferralStatus[],
    to: PortalReferralStatus,
  ) {
    const command = {
      referralId: requiredId(referralId, "referralId"),
      expectedVersion: requiredVersion(expectedVersion),
    };
    return replayOrRun(actor, mutation, mutationKind, command, () => {
      const referral = requiredReferral(command.referralId);
      assertVersion(referral, command.expectedVersion);
      assertTransition(referral, from);
      const previous = referral.currentStatus;
      applyStatus(referral, to);
      appendAudit(actor, referral, mutationKind, previous, mutation.mutationId);
      return mutationAck(referral);
    }, () => {
      if (mutationKind === "TRIAGE_REFERRAL") {
        ownedReferralForOperator(actor, command.referralId);
      } else {
        assertCanWorkReferral(actor, command.referralId);
      }
    });
  }

  function replayOrRun<T>(
    actor: PortalReferralActor,
    mutation: PortalReferralMutationMetadata,
    kind: PortalReferralMutationKind,
    command: unknown,
    run: () => T,
    assertReplayAuthorized: () => unknown,
  ): T {
    assertActiveActor(actor, PORTAL_MEMBERSHIP_ROLES);
    let mutationId: string;
    try {
      mutationId = assertCaresLinkV1IdempotencyKey(mutation.mutationId);
    } catch {
      throw new PortalReferralWorkflowError(
        "VALIDATION_ERROR",
        "mutationId must be 16-128 safe characters",
      );
    }
    const mutationIdHash = createPortalReferralMutationIdHash(mutationId);
    const key = `${actor.userId}:${mutationIdHash}`;
    const payloadHash = createPortalReferralMutationPayloadHash({
      actor: {
        organizationId: actor.organizationId,
        role: actor.role,
        providerId: actor.providerId ?? null,
      },
      kind,
      command,
    });
    const prior = receipts.get(key);
    if (prior) {
      if (prior.payloadHash !== payloadHash) {
        throw new PortalReferralWorkflowError(
          "IDEMPOTENCY_CONFLICT",
          "Mutation id was already used for a different command",
        );
      }
      assertReplayAuthorized();
      return clone(prior.response) as T;
    }
    const snapshot = snapshotState();
    try {
      const response = run();
      if (!isMutationAck(response)) {
        throw new PortalReferralWorkflowError(
          "INVALID_STATE_TRANSITION",
          "Mutation response is not a metadata-only acknowledgement",
        );
      }
      receipts.set(key, { payloadHash, response: clone(response) });
      return clone(response);
    } catch (error) {
      restoreState(snapshot);
      throw error;
    }
  }

  function snapshotState() {
    return {
      referrals: clone([...referrals.entries()]),
      matches: clone([...matches.entries()]),
      audits: clone(audits),
    };
  }

  function restoreState(snapshot: ReturnType<typeof snapshotState>) {
    referrals.clear();
    for (const [key, value] of snapshot.referrals) referrals.set(key, value);
    matches.clear();
    for (const [key, value] of snapshot.matches) matches.set(key, value);
    audits.splice(0, audits.length, ...snapshot.audits);
  }

  function appendAudit(
    actor: PortalReferralActor,
    referral: StoredReferral,
    mutationKind: PortalReferralMutationKind,
    fromStatus: PortalReferralStatus | null,
    mutationId: string,
    metadata: Readonly<Record<string, string | number | boolean | null>> = {},
  ) {
    audits.push({
      auditEventId: createId(),
      referralId: referral.referralId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      mutationKind,
      fromStatus,
      toStatus: referral.currentStatus,
      mutationIdHash: createPortalReferralMutationIdHash(mutationId),
      occurredAt: now(),
      metadata: clone(metadata),
    });
  }

  function viewReferral(actor: PortalReferralActor, referral: StoredReferral) {
    const isOperator =
      actor.role === "platform_admin" ||
      (actor.role === "partner_operator" &&
        actor.organizationId === referral.sourceOrganizationId);
    const isSource =
      actor.role === "referral_source" &&
      actor.organizationId === referral.sourceOrganizationId;
    const providerMayReadPrivateReferral =
      isApprovedProviderActor(actor) &&
      actor.providerId === referral.assignedProviderId &&
      [
        "ACCEPTED",
        "IN_PROGRESS",
        "NOTE_LINKED",
        "EXPORTED",
        "COMPLETED",
      ].includes(referral.currentStatus);
    if (!isOperator && !isSource && !providerMayReadPrivateReferral) {
      throw new PortalReferralWorkflowError("NOT_FOUND", "Referral was not found");
    }
    return clone({
      referralId: referral.referralId,
      sourceOrganizationId: referral.sourceOrganizationId,
      summary: referral.summary,
      region: referral.region,
      serviceType: referral.serviceType,
      currentStatus: referral.currentStatus,
      assignedProviderId: referral.assignedProviderId,
      rowVersion: referral.rowVersion,
      contact: referral.contact,
      canonicalDocumentId: referral.canonicalDocumentId,
      exportJobId: referral.exportJobId,
      createdAt: referral.createdAt,
      updatedAt: referral.updatedAt,
    }) satisfies PortalReferralView;
  }

  function assertCanWorkReferral(actor: PortalReferralActor, referralId: string) {
    assertActiveActor(actor, [
      "platform_admin",
      "partner_operator",
      "provider_member",
    ]);
    const referral = requiredReferral(referralId);
    if (
      actor.role === "partner_operator" &&
      actor.organizationId !== referral.sourceOrganizationId
    ) {
      throw new PortalReferralWorkflowError("NOT_FOUND", "Referral was not found");
    }
    if (
      actor.role === "provider_member" &&
      (!actor.providerId || actor.providerId !== referral.assignedProviderId)
    ) {
      throw new PortalReferralWorkflowError("NOT_FOUND", "Referral was not found");
    }
  }

  function assertOperator(actor: PortalReferralActor) {
    assertActiveActor(actor, ["platform_admin", "partner_operator"]);
  }

  function ownedReferralForOperator(
    actor: PortalReferralActor,
    referralId: string,
  ) {
    const referral = requiredReferral(referralId);
    if (
      actor.role === "partner_operator" &&
      actor.organizationId !== referral.sourceOrganizationId
    ) {
      throw new PortalReferralWorkflowError("NOT_FOUND", "Referral was not found");
    }
    return referral;
  }

  function requiredReferral(referralId: string) {
    const referral = referrals.get(referralId);
    if (!referral) {
      throw new PortalReferralWorkflowError("NOT_FOUND", "Referral was not found");
    }
    return referral;
  }

  function applyStatus(referral: StoredReferral, status: PortalReferralStatus) {
    referral.currentStatus = status;
    referral.rowVersion += 1;
    referral.updatedAt = now();
  }

  function mutationAck(
    referral: StoredReferral,
    matchId: string | null = null,
  ): PortalReferralMutationAck {
    return Object.freeze({
      referralId: referral.referralId,
      matchId,
      currentStatus: referral.currentStatus,
      rowVersion: referral.rowVersion,
      updatedAt: referral.updatedAt,
    });
  }

  return Object.freeze({
    kind: "memory-contract-only" as const,
    createReferral,
    triageReferral,
    offerReferral,
    respondToOffer,
    recordFollowUp,
    linkDocument,
    recordExport,
    completeReferral,
    listReferrals,
    listAssignmentReferrals,
    listMyOffers,
    listProviderCandidates,
    getReferral,
    getAssignmentReferral,
    getAudit,
  });
}

export type PortalReferralWorkflowPort = ReturnType<
  typeof createMemoryPortalReferralWorkflow
>;

function assertActiveActor(
  actor: PortalReferralActor,
  allowedRoles: readonly PortalMembershipRole[],
) {
  if (!actor?.userId || !actor.organizationId) {
    throw new PortalReferralWorkflowError("AUTH_REQUIRED", "Active actor required");
  }
  const roleMatchesOrganization =
    (actor.role === "platform_admin" && actor.organizationType === "PLATFORM") ||
    (actor.role === "partner_operator" &&
      actor.organizationType === "REFERRAL_SOURCE") ||
    (actor.role === "referral_source" &&
      actor.organizationType === "REFERRAL_SOURCE") ||
    (actor.role === "provider_member" &&
      actor.organizationType === "PROVIDER");
  const providerIsEligible =
    actor.role !== "provider_member" || isApprovedProviderActor(actor);
  if (
    actor.organizationStatus !== "active" ||
    actor.membershipStatus !== "active" ||
    !allowedRoles.includes(actor.role) ||
    !roleMatchesOrganization ||
    !providerIsEligible
  ) {
    throw new PortalReferralWorkflowError("FORBIDDEN", "Actor is not eligible");
  }
}

function isApprovedProviderActor(
  actor: PortalReferralActor,
): actor is ApprovedPortalProviderActor {
  return (
    actor.role === "provider_member" &&
    actor.organizationType === "PROVIDER" &&
    typeof actor.providerId === "string" &&
    actor.providerId.length > 0 &&
    actor.providerReviewStatus === "approved"
  );
}

function isAssignmentStatus(
  status: PortalReferralStatus,
): status is PortalReferralAssignmentStatus {
  return status === "SUBMITTED" || status === "TRIAGED" || status === "OFFERED";
}

function assertAllowedKeys(value: object, allowed: readonly string[]) {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) {
    throw new PortalReferralWorkflowError(
      "VALIDATION_ERROR",
      "Request contains forbidden fields",
    );
  }
}

function normalizeContact(contact: PortalReferralContact) {
  if (!contact || typeof contact !== "object" || Array.isArray(contact)) {
    throw new PortalReferralWorkflowError(
      "VALIDATION_ERROR",
      "contact is invalid",
    );
  }
  assertAllowedKeys(contact, ["name", "phone", "email"]);
  return Object.freeze({
    name: requiredText(contact.name, "contact.name", 200),
    phone: requiredText(contact.phone, "contact.phone", 100),
    email:
      contact.email === null
        ? null
        : requiredText(contact.email, "contact.email", 320),
  });
}

function assertPrivateSummaryDoesNotRepeatContact(
  summary: string,
  contact: PortalReferralContact,
) {
  const normalizedSummary = summary.toLocaleLowerCase("en-AU");
  const normalizedName = contact.name.trim().toLocaleLowerCase("en-AU");
  const containsContactName = normalizedSummary.includes(normalizedName);
  const containsEmail = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(summary);
  const containsPhoneLikeNumber =
    summary.replace(/[^0-9]/g, "").length >= 8;
  if (
    containsEmail ||
    containsPhoneLikeNumber ||
    containsContactName
  ) {
    throw new PortalReferralWorkflowError(
      "VALIDATION_ERROR",
      "summary must not duplicate private contact details",
    );
  }
}

function isMutationAck(value: unknown): value is PortalReferralMutationAck {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<PortalReferralMutationAck>;
  return (
    typeof candidate.referralId === "string" &&
    (candidate.matchId === null || typeof candidate.matchId === "string") &&
    typeof candidate.currentStatus === "string" &&
    (PORTAL_REFERRAL_STATUSES as readonly string[]).includes(
      candidate.currentStatus,
    ) &&
    Number.isSafeInteger(candidate.rowVersion) &&
    typeof candidate.updatedAt === "string"
  );
}

function requiredText(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string") {
    throw new PortalReferralWorkflowError(
      "VALIDATION_ERROR",
      `${field} is required`,
    );
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new PortalReferralWorkflowError(
      "VALIDATION_ERROR",
      `${field} is invalid`,
    );
  }
  return normalized;
}

function requiredCatalogCode(
  value: unknown,
  field: string,
  allowedCodes: readonly string[],
) {
  const code = requiredText(value, field, 64);
  if (!allowedCodes.includes(code)) {
    throw new PortalReferralWorkflowError(
      "VALIDATION_ERROR",
      `${field} must be a server catalog code`,
    );
  }
  return code;
}

function requiredId(value: unknown, field: string) {
  return requiredText(value, field, 200);
}

function requiredVersion(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new PortalReferralWorkflowError(
      "VALIDATION_ERROR",
      "expectedVersion is invalid",
    );
  }
  return value as number;
}

function assertFollowUpOutcomeCode(value: unknown) {
  if (
    typeof value !== "string" ||
    !(PORTAL_REFERRAL_FOLLOW_UP_OUTCOME_CODES as readonly string[]).includes(
      value,
    )
  ) {
    throw new PortalReferralWorkflowError(
      "VALIDATION_ERROR",
      "outcomeCode is invalid",
    );
  }
  return value as PortalReferralFollowUpOutcomeCode;
}

function assertVersion(referral: StoredReferral, expectedVersion: number) {
  if (referral.rowVersion !== expectedVersion) {
    throw new PortalReferralWorkflowError(
      "STALE_REFERRAL",
      "Referral version is stale",
      { currentVersion: referral.rowVersion },
    );
  }
}

function assertTransition(
  referral: StoredReferral,
  allowed: readonly PortalReferralStatus[],
) {
  if (!allowed.includes(referral.currentStatus)) {
    throw new PortalReferralWorkflowError(
      "INVALID_STATE_TRANSITION",
      "Referral state transition is invalid",
      { currentStatus: referral.currentStatus },
    );
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function createPortalReferralMutationPayloadHash(value: unknown) {
  return createHash("sha256")
    .update(stringifyCaresLinkV1CanonicalJson(value), "utf8")
    .digest("hex");
}

export function createPortalReferralMutationIdHash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
