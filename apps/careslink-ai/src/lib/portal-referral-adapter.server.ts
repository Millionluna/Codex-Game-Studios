import "server-only";

import type {
  PortalReferralActor,
  PortalReferralAssignmentActiveOffer as WorkflowPortalReferralAssignmentActiveOffer,
  PortalReferralAssignmentDetail as WorkflowPortalReferralAssignmentDetail,
  PortalReferralAssignmentQueueItem as WorkflowPortalReferralAssignmentQueueItem,
  PortalReferralContact,
  PortalReferralFollowUpOutcomeCode,
  PortalReferralMutationMetadata,
  PortalReferralStatus,
  PortalReferralWorkflowPort,
} from "./portal-referral-workflow";

export type PortalReferralAssignmentQueueItem =
  WorkflowPortalReferralAssignmentQueueItem;
export type PortalReferralAssignmentDetail =
  WorkflowPortalReferralAssignmentDetail;
export type PortalReferralAssignmentActiveOffer =
  WorkflowPortalReferralAssignmentActiveOffer;

export type MaybePromise<T> = T | Promise<T>;

export type PortalReferralApiMutationMetadata =
  PortalReferralMutationMetadata &
    Readonly<{
      /** Server-created correlation id. Durable adapters hash it before RPC. */
      correlationId: string;
    }>;

export type PortalReferralCreateCommand = Readonly<{
  summary: string;
  region: string;
  serviceType: string;
  contact: PortalReferralContact;
}>;

export type PortalReferralOfferCommand = Readonly<{
  providerId: string;
  expectedVersion: number;
}>;

export type PortalReferralResponseCommand = Readonly<{
  expectedVersion: number;
  decision: "ACCEPT" | "DECLINE";
}>;

export type PortalReferralFollowUpCommand = Readonly<{
  expectedVersion: number;
  outcomeCode: PortalReferralFollowUpOutcomeCode;
}>;

/**
 * Exact referral-source detail projection. It deliberately excludes tenant,
 * assignment, document, export and audit fields that the source detail RPC does
 * not authorize.
 */
export type PortalReferralSourceDetail = Readonly<{
  referralId: string;
  summary: string;
  region: string;
  serviceType: string;
  currentStatus: PortalReferralStatus;
  rowVersion: number;
  contact: PortalReferralContact;
  createdAt: string;
  updatedAt: string;
}>;

/** Exact accepted-referral projection for the independently gated provider slice. */
export type PortalReferralProviderFollowUpDetail = Readonly<{
  referralId: string;
  summary: string;
  region: string;
  serviceType: string;
  currentStatus: "ACCEPTED" | "IN_PROGRESS";
  rowVersion: number;
  contact: PortalReferralContact;
  createdAt: string;
  updatedAt: string;
}>;

export type PortalReferralApi = Readonly<{
  listReferrals(): MaybePromise<
    ReturnType<PortalReferralWorkflowPort["listReferrals"]>
  >;
  createReferral(
    command: PortalReferralCreateCommand,
    mutation: PortalReferralApiMutationMetadata,
  ): MaybePromise<ReturnType<PortalReferralWorkflowPort["createReferral"]>>;
  getReferral(
    referralId: string,
  ): MaybePromise<
    PortalReferralSourceDetail |
      ReturnType<PortalReferralWorkflowPort["getReferral"]>
  >;
  listAssignmentReferrals(): MaybePromise<
    readonly PortalReferralAssignmentQueueItem[]
  >;
  getAssignmentReferral(
    referralId: string,
  ): MaybePromise<PortalReferralAssignmentDetail>;
  triageReferral(
    referralId: string,
    expectedVersion: number,
    mutation: PortalReferralApiMutationMetadata,
  ): MaybePromise<ReturnType<PortalReferralWorkflowPort["triageReferral"]>>;
  listProviderCandidates(
    referralId: string,
  ): MaybePromise<
    ReturnType<PortalReferralWorkflowPort["listProviderCandidates"]>
  >;
  offerReferral(
    referralId: string,
    command: PortalReferralOfferCommand,
    mutation: PortalReferralApiMutationMetadata,
  ): MaybePromise<ReturnType<PortalReferralWorkflowPort["offerReferral"]>>;
  listMyOffers(): MaybePromise<
    ReturnType<PortalReferralWorkflowPort["listMyOffers"]>
  >;
  respondToOffer(
    matchId: string,
    command: PortalReferralResponseCommand,
    mutation: PortalReferralApiMutationMetadata,
  ): MaybePromise<ReturnType<PortalReferralWorkflowPort["respondToOffer"]>>;
  getProviderFollowUpReferral(
    referralId: string,
  ): MaybePromise<
    | PortalReferralProviderFollowUpDetail
    | ReturnType<PortalReferralWorkflowPort["getReferral"]>
  >;
  recordFollowUp(
    referralId: string,
    command: PortalReferralFollowUpCommand,
    mutation: PortalReferralApiMutationMetadata,
  ): MaybePromise<ReturnType<PortalReferralWorkflowPort["recordFollowUp"]>>;
  listAudit(
    referralId: string,
  ): MaybePromise<ReturnType<PortalReferralWorkflowPort["getAudit"]>>;
}>;

/**
 * Binds the server-derived actor once. Request bodies never carry actor,
 * organization, role, owner, session or provider identity fields.
 */
export function createActorBoundPortalReferralApi(
  workflow: PortalReferralWorkflowPort,
  actor: PortalReferralActor,
): PortalReferralApi {
  return Object.freeze({
    listReferrals: () => workflow.listReferrals(actor),
    createReferral: (command, mutation) =>
      workflow.createReferral(actor, command, mutation),
    getReferral: (referralId) => workflow.getReferral(actor, referralId),
    listAssignmentReferrals: () => workflow.listAssignmentReferrals(actor),
    getAssignmentReferral: (referralId) =>
      workflow.getAssignmentReferral(actor, referralId),
    triageReferral: (referralId, expectedVersion, mutation) =>
      workflow.triageReferral(actor, referralId, expectedVersion, mutation),
    listProviderCandidates: (referralId) =>
      workflow.listProviderCandidates(actor, referralId),
    offerReferral: (referralId, command, mutation) =>
      workflow.offerReferral(
        actor,
        {
          referralId,
          providerId: command.providerId,
          expectedVersion: command.expectedVersion,
        },
        mutation,
      ),
    listMyOffers: () => workflow.listMyOffers(actor),
    respondToOffer: (matchId, command, mutation) =>
      workflow.respondToOffer(
        actor,
        {
          matchId,
          expectedVersion: command.expectedVersion,
          decision: command.decision,
        },
        mutation,
      ),
    getProviderFollowUpReferral: (referralId) =>
      workflow.getReferral(actor, referralId),
    recordFollowUp: (referralId, command, mutation) =>
      workflow.recordFollowUp(
        actor,
        {
          referralId,
          expectedVersion: command.expectedVersion,
          outcomeCode: command.outcomeCode,
        },
        mutation,
      ),
    listAudit: (referralId) => workflow.getAudit(actor, referralId),
  });
}
