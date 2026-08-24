import "server-only";

import type {
  PortalReferralActor,
  PortalReferralContact,
  PortalReferralFollowUpOutcomeCode,
  PortalReferralMutationMetadata,
  PortalReferralWorkflowPort,
} from "./portal-referral-workflow";

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

export type PortalReferralApi = Readonly<{
  listReferrals(): ReturnType<PortalReferralWorkflowPort["listReferrals"]>;
  createReferral(
    command: PortalReferralCreateCommand,
    mutation: PortalReferralMutationMetadata,
  ): ReturnType<PortalReferralWorkflowPort["createReferral"]>;
  getReferral(
    referralId: string,
  ): ReturnType<PortalReferralWorkflowPort["getReferral"]>;
  triageReferral(
    referralId: string,
    expectedVersion: number,
    mutation: PortalReferralMutationMetadata,
  ): ReturnType<PortalReferralWorkflowPort["triageReferral"]>;
  listProviderCandidates(
    referralId: string,
  ): ReturnType<PortalReferralWorkflowPort["listProviderCandidates"]>;
  offerReferral(
    referralId: string,
    command: PortalReferralOfferCommand,
    mutation: PortalReferralMutationMetadata,
  ): ReturnType<PortalReferralWorkflowPort["offerReferral"]>;
  listMyOffers(): ReturnType<PortalReferralWorkflowPort["listMyOffers"]>;
  respondToOffer(
    matchId: string,
    command: PortalReferralResponseCommand,
    mutation: PortalReferralMutationMetadata,
  ): ReturnType<PortalReferralWorkflowPort["respondToOffer"]>;
  recordFollowUp(
    referralId: string,
    command: PortalReferralFollowUpCommand,
    mutation: PortalReferralMutationMetadata,
  ): ReturnType<PortalReferralWorkflowPort["recordFollowUp"]>;
  listAudit(
    referralId: string,
  ): ReturnType<PortalReferralWorkflowPort["getAudit"]>;
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
