import { describe, expect, it } from "vitest";
import {
  PORTAL_REFERRAL_WORKFLOW_IMPLEMENTATION_STATUS,
  PortalReferralWorkflowError,
  createMemoryPortalReferralWorkflow,
  createPortalReferralMutationPayloadHash,
  type PortalReferralActor,
} from "./portal-referral-workflow";

const SOURCE_A: PortalReferralActor = {
  userId: "11111111-1111-4111-8111-111111111111",
  organizationId: "source-org-a",
  organizationType: "REFERRAL_SOURCE",
  organizationStatus: "active",
  role: "referral_source",
  membershipStatus: "active",
};
const SOURCE_B: PortalReferralActor = {
  userId: "22222222-2222-4222-8222-222222222222",
  organizationId: "source-org-b",
  organizationType: "REFERRAL_SOURCE",
  organizationStatus: "active",
  role: "referral_source",
  membershipStatus: "active",
};
const ADMIN: PortalReferralActor = {
  userId: "33333333-3333-4333-8333-333333333333",
  organizationId: "platform",
  organizationType: "PLATFORM",
  organizationStatus: "active",
  role: "platform_admin",
  membershipStatus: "active",
};
const OPERATOR_A: PortalReferralActor = {
  userId: "66666666-6666-4666-8666-666666666666",
  organizationId: "source-org-a",
  organizationType: "REFERRAL_SOURCE",
  organizationStatus: "active",
  role: "partner_operator",
  membershipStatus: "active",
};
const PROVIDER_A: PortalReferralActor = {
  userId: "44444444-4444-4444-8444-444444444444",
  organizationId: "provider-org-a",
  organizationType: "PROVIDER",
  organizationStatus: "active",
  role: "provider_member",
  membershipStatus: "active",
  providerId: "provider-a",
  providerReviewStatus: "approved",
};
const PROVIDER_B: PortalReferralActor = {
  userId: "55555555-5555-4555-8555-555555555555",
  organizationId: "provider-org-b",
  organizationType: "PROVIDER",
  organizationStatus: "active",
  role: "provider_member",
  membershipStatus: "active",
  providerId: "provider-b",
  providerReviewStatus: "approved",
};

describe("Portal referral workflow contract", () => {
  it("stays local-only and completes the audited vertical state sequence", () => {
    const workflow = createWorkflow();
    expect(PORTAL_REFERRAL_WORKFLOW_IMPLEMENTATION_STATUS).toBe(
      "LOCAL_CONTRACT_ONLY_DEFAULT_DISABLED",
    );
    expect(workflow.kind).toBe("memory-contract-only");

    const created = workflow.createReferral(
      SOURCE_A,
      referralInput(),
      mutation("create-referral-0001"),
    );
    expect(created).toMatchObject({
      currentStatus: "SUBMITTED",
      rowVersion: 1,
    });
    expect(JSON.stringify(created)).not.toContain(referralInput().contact.phone);
    expect(workflow.getReferral(SOURCE_A, created.referralId).contact).toEqual(
      referralInput().contact,
    );

    const triaged = workflow.triageReferral(
      ADMIN,
      created.referralId,
      1,
      mutation("triage-referral-0001"),
    );
    expect(triaged).toMatchObject({ currentStatus: "TRIAGED", rowVersion: 2 });
    expect(workflow.listProviderCandidates(ADMIN, created.referralId)).toEqual([
      { providerId: "provider-a", displayName: "Provider A" },
      { providerId: "provider-b", displayName: "Provider B" },
    ]);

    const offered = workflow.offerReferral(
      ADMIN,
      {
        referralId: created.referralId,
        providerId: PROVIDER_A.providerId!,
        expectedVersion: 2,
      },
      mutation("offer-referral-00001"),
    );
    expect(offered).toMatchObject({
      currentStatus: "OFFERED",
      rowVersion: 3,
    });
    expectError(
      () => workflow.getReferral(PROVIDER_A, created.referralId),
      "NOT_FOUND",
    );
    const offeredList = workflow.listMyOffers(PROVIDER_A);
    expect(offeredList).toEqual([
      {
        matchId: offered.matchId,
        referralId: created.referralId,
        region: "VIC_MELBOURNE",
        serviceType: "SUPPORT_COORDINATION",
        matchStatus: "OFFERED",
        currentStatus: "OFFERED",
        rowVersion: 3,
      },
    ]);
    expect(JSON.stringify(offeredList)).not.toMatch(
      /summary|contact|phone|email|sourceOrganizationId|Person A|0400000000/,
    );

    const accepted = workflow.respondToOffer(
      PROVIDER_A,
      {
        matchId: offered.matchId!,
        expectedVersion: 3,
        decision: "ACCEPT",
      },
      mutation("respond-referral-001"),
    );
    expect(accepted).toMatchObject({
      currentStatus: "ACCEPTED",
      rowVersion: 4,
    });
    expect(workflow.getReferral(PROVIDER_A, created.referralId)).toMatchObject({
      assignedProviderId: "provider-a",
      summary: referralInput().summary,
      contact: referralInput().contact,
    });

    const followedUp = workflow.recordFollowUp(
      PROVIDER_A,
      {
        referralId: created.referralId,
        expectedVersion: 4,
        outcomeCode: "CONTACT_CONFIRMED",
      },
      mutation("follow-up-referral01"),
    );
    expect(followedUp).toMatchObject({
      currentStatus: "IN_PROGRESS",
      rowVersion: 5,
    });

    const linked = workflow.linkDocument(
      PROVIDER_A,
      {
        referralId: created.referralId,
        canonicalDocumentId: "canonical-document-a",
        expectedVersion: 5,
      },
      mutation("link-document-00001"),
    );
    expect(linked).toMatchObject({
      currentStatus: "NOTE_LINKED",
      rowVersion: 6,
    });
    expect(workflow.getReferral(PROVIDER_A, created.referralId)).toMatchObject({
      canonicalDocumentId: "canonical-document-a",
    });

    const exported = workflow.recordExport(
      PROVIDER_A,
      {
        referralId: created.referralId,
        exportJobId: "export-job-a",
        expectedVersion: 6,
      },
      mutation("record-export-00001"),
    );
    expect(exported).toMatchObject({
      currentStatus: "EXPORTED",
      rowVersion: 7,
    });
    expect(workflow.getReferral(PROVIDER_A, created.referralId)).toMatchObject({
      exportJobId: "export-job-a",
    });

    const completed = workflow.completeReferral(
      PROVIDER_A,
      created.referralId,
      7,
      mutation("complete-referral01"),
    );
    expect(completed).toMatchObject({
      currentStatus: "COMPLETED",
      rowVersion: 8,
    });

    const audit = workflow.getAudit(ADMIN, created.referralId);
    expect(audit).toHaveLength(8);
    expect(audit.map((event) => event.mutationKind)).toEqual([
      "CREATE_REFERRAL",
      "TRIAGE_REFERRAL",
      "OFFER_REFERRAL",
      "RESPOND_TO_OFFER",
      "RECORD_FOLLOW_UP",
      "LINK_DOCUMENT",
      "RECORD_EXPORT",
      "COMPLETE_REFERRAL",
    ]);
    expect(JSON.stringify(audit)).not.toContain("0400000000");
    expect(JSON.stringify(audit)).not.toContain("Person A");
    expect(JSON.stringify(audit)).not.toContain("Daily living support");
    expect(JSON.stringify(audit)).not.toContain("create-referral-0001");
    expect(audit.every((event) => /^[a-f0-9]{64}$/.test(event.mutationIdHash))).toBe(
      true,
    );

    const secondFollowUpWorkflow = createWorkflow();
    const acceptedReferral = createAcceptedReferral(secondFollowUpWorkflow);
    const firstFollowUp = secondFollowUpWorkflow.recordFollowUp(
      PROVIDER_A,
      {
        referralId: acceptedReferral.referralId,
        expectedVersion: 4,
        outcomeCode: "CONTACT_CONFIRMED",
      },
      mutation("first-followup-0001"),
    );
    const secondFollowUp = secondFollowUpWorkflow.recordFollowUp(
      PROVIDER_A,
      {
        referralId: acceptedReferral.referralId,
        expectedVersion: firstFollowUp.rowVersion,
        outcomeCode: "FOLLOW_UP_SCHEDULED",
      },
      mutation("second-followup-001"),
    );
    expect(secondFollowUp).toMatchObject({
      currentStatus: "IN_PROGRESS",
      rowVersion: 6,
    });
  });

  it("isolates source and provider A/B and withholds contact before acceptance", () => {
    const workflow = createWorkflow();
    const created = workflow.createReferral(
      SOURCE_A,
      referralInput(),
      mutation("create-isolation-01"),
    );
    workflow.triageReferral(
      ADMIN,
      created.referralId,
      1,
      mutation("triage-isolation01"),
    );
    const offer = workflow.offerReferral(
      ADMIN,
      {
        referralId: created.referralId,
        providerId: PROVIDER_A.providerId!,
        expectedVersion: 2,
      },
      mutation("offer-isolation-001"),
    );

    expectError(() => workflow.getReferral(SOURCE_B, created.referralId), "NOT_FOUND");
    expectError(
      () => workflow.getReferral(PROVIDER_B, created.referralId),
      "NOT_FOUND",
    );
    expectError(
      () => workflow.getReferral(PROVIDER_A, created.referralId),
      "NOT_FOUND",
    );
    expectError(
      () =>
        workflow.respondToOffer(
          PROVIDER_B,
          { matchId: offer.matchId!, expectedVersion: 3, decision: "ACCEPT" },
          mutation("provider-b-response01"),
        ),
      "NOT_FOUND",
    );
  });

  it("does not treat residual provider fields on other roles as provider access", () => {
    const workflow = createWorkflow();
    const accepted = createAcceptedReferral(workflow);
    const followedUp = workflow.recordFollowUp(
      PROVIDER_A,
      {
        referralId: accepted.referralId,
        expectedVersion: accepted.rowVersion,
        outcomeCode: "CONTACT_CONFIRMED",
      },
      mutation("residual-followup-01"),
    );
    const linked = workflow.linkDocument(
      PROVIDER_A,
      {
        referralId: accepted.referralId,
        canonicalDocumentId: "residual-canonical-document",
        expectedVersion: followedUp.rowVersion,
      },
      mutation("residual-link-doc-01"),
    );
    workflow.recordExport(
      PROVIDER_A,
      {
        referralId: accepted.referralId,
        exportJobId: "residual-export-job",
        expectedVersion: linked.rowVersion,
      },
      mutation("residual-export-0001"),
    );

    expect(workflow.getReferral(PROVIDER_A, accepted.referralId)).toMatchObject({
      summary: referralInput().summary,
      contact: referralInput().contact,
      canonicalDocumentId: "residual-canonical-document",
      exportJobId: "residual-export-job",
    });

    const actorsWithResidualProviderFields: PortalReferralActor[] = [
      {
        ...SOURCE_B,
        providerId: PROVIDER_A.providerId,
        providerReviewStatus: "approved",
      },
      {
        ...OPERATOR_A,
        organizationId: SOURCE_B.organizationId,
        providerId: PROVIDER_A.providerId,
        providerReviewStatus: "approved",
      },
    ];
    for (const actor of actorsWithResidualProviderFields) {
      expectError(
        () => workflow.getReferral(actor, accepted.referralId),
        "NOT_FOUND",
      );
      expect(workflow.listReferrals(actor)).toEqual([]);
    }
  });

  it("scopes a partner operator membership to one referral-source tenant", () => {
    const workflow = createWorkflow();
    const sourceAReferral = workflow.createReferral(
      SOURCE_A,
      referralInput(),
      mutation("operator-source-a-01"),
    );
    expect(
      workflow.triageReferral(
        OPERATOR_A,
        sourceAReferral.referralId,
        1,
        mutation("operator-triage-a-1"),
      ),
    ).toMatchObject({ currentStatus: "TRIAGED", rowVersion: 2 });

    const sourceBReferral = workflow.createReferral(
      SOURCE_B,
      referralInput(),
      mutation("operator-source-b-01"),
    );
    expectError(
      () =>
        workflow.triageReferral(
          OPERATOR_A,
          sourceBReferral.referralId,
          1,
          mutation("operator-triage-b-1"),
        ),
      "NOT_FOUND",
    );
    expectError(
      () =>
        workflow.triageReferral(
          { ...OPERATOR_A, organizationType: "PARTNER" },
          sourceAReferral.referralId,
          2,
          mutation("operator-wrong-org-1"),
        ),
      "FORBIDDEN",
    );
  });

  it("replays the same mutation once and rejects a changed payload", () => {
    const workflow = createWorkflow();
    const first = workflow.createReferral(
      SOURCE_A,
      referralInput(),
      mutation("create-replay-00001"),
    );
    const replay = workflow.createReferral(
      SOURCE_A,
      referralInput(),
      mutation("create-replay-00001"),
    );
    expect(replay).toEqual(first);
    expect(Object.keys(replay).sort()).toEqual([
      "currentStatus",
      "matchId",
      "referralId",
      "rowVersion",
      "updatedAt",
    ]);
    expect(JSON.stringify(replay)).not.toContain(referralInput().contact.phone);
    expect(workflow.getAudit(ADMIN, first.referralId)).toHaveLength(1);

    workflow.triageReferral(
      ADMIN,
      first.referralId,
      1,
      mutation("triage-after-replay1"),
    );
    expect(
      workflow.createReferral(
        SOURCE_A,
        referralInput(),
        mutation("create-replay-00001"),
      ),
    ).toEqual(first);

    expectError(
      () =>
        workflow.createReferral(
          SOURCE_A,
          { ...referralInput(), region: "VIC_GEELONG" },
          mutation("create-replay-00001"),
        ),
      "IDEMPOTENCY_CONFLICT",
    );
  });

  it("rejects stale versions, invalid transitions and actor fields in a body", () => {
    const workflow = createWorkflow();
    const created = workflow.createReferral(
      SOURCE_A,
      referralInput(),
      mutation("create-validation01"),
    );
    workflow.triageReferral(
      ADMIN,
      created.referralId,
      1,
      mutation("triage-validation1"),
    );

    expectError(
      () =>
        workflow.offerReferral(
          ADMIN,
          {
            referralId: created.referralId,
            providerId: "provider-a",
            expectedVersion: 1,
          },
          mutation("offer-stale-000001"),
        ),
      "STALE_REFERRAL",
    );
    expectError(
      () =>
        workflow.completeReferral(
          ADMIN,
          created.referralId,
          2,
          mutation("complete-invalid-01"),
        ),
      "INVALID_STATE_TRANSITION",
    );
    expectError(
      () =>
        workflow.createReferral(
          SOURCE_A,
          {
            ...referralInput(),
            ownerId: SOURCE_B.userId,
          } as ReturnType<typeof referralInput>,
          mutation("create-owner-field1"),
        ),
      "VALIDATION_ERROR",
    );
    expectError(
      () =>
        workflow.createReferral(
          SOURCE_A,
          referralInput(),
          mutation("short"),
        ),
      "VALIDATION_ERROR",
    );
  });

  it("returns a declined offer to triage without assigning the provider", () => {
    const workflow = createWorkflow();
    const created = workflow.createReferral(
      SOURCE_A,
      referralInput(),
      mutation("create-decline-001"),
    );
    workflow.triageReferral(
      ADMIN,
      created.referralId,
      1,
      mutation("triage-decline-01"),
    );
    const offered = workflow.offerReferral(
      ADMIN,
      {
        referralId: created.referralId,
        providerId: PROVIDER_A.providerId!,
        expectedVersion: 2,
      },
      mutation("offer-decline-0001"),
    );
    const declined = workflow.respondToOffer(
      PROVIDER_A,
      { matchId: offered.matchId!, expectedVersion: 3, decision: "DECLINE" },
      mutation("response-decline-01"),
    );
    expect(declined).toMatchObject({
      currentStatus: "TRIAGED",
      rowVersion: 4,
    });
    expect(JSON.stringify(declined)).not.toContain(referralInput().contact.phone);
    expect(
      workflow.respondToOffer(
        PROVIDER_A,
        { matchId: offered.matchId!, expectedVersion: 3, decision: "DECLINE" },
        mutation("response-decline-01"),
      ),
    ).toEqual(declined);
    expectError(
      () => workflow.getReferral(PROVIDER_A, created.referralId),
      "NOT_FOUND",
    );
  });

  it("binds replay to current membership scope and stores only resource references", () => {
    const workflow = createWorkflow();
    const first = workflow.createReferral(
      SOURCE_A,
      referralInput(),
      mutation("scope-replay-create1"),
    );
    const changedScope = {
      ...SOURCE_A,
      organizationId: SOURCE_B.organizationId,
    };
    expectError(
      () =>
        workflow.createReferral(
          changedScope,
          referralInput(),
          mutation("scope-replay-create1"),
        ),
      "IDEMPOTENCY_CONFLICT",
    );
    expect(JSON.stringify(workflow.getAudit(ADMIN, first.referralId))).not.toContain(
      referralInput().contact.phone,
    );
    const payloadHash = createPortalReferralMutationPayloadHash(referralInput());
    expect(payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(payloadHash).not.toContain(referralInput().contact.phone);
  });

  it("rejects free-text follow-up outcome codes before audit", () => {
    const workflow = createWorkflow();
    const accepted = createAcceptedReferral(workflow);
    expectError(
      () =>
        workflow.recordFollowUp(
          PROVIDER_A,
          {
            referralId: accepted.referralId,
            expectedVersion: 4,
            outcomeCode: "Person A 0400000000",
          } as unknown as Parameters<typeof workflow.recordFollowUp>[1],
          mutation("followup-pii-code01"),
        ),
      "VALIDATION_ERROR",
    );
    expect(JSON.stringify(workflow.getAudit(ADMIN, accepted.referralId))).not.toContain(
      "0400000000",
    );
  });

  it("rejects suspended memberships before any mutation", () => {
    const workflow = createWorkflow();
    expectError(
      () =>
        workflow.createReferral(
          { ...SOURCE_A, membershipStatus: "suspended" },
          referralInput(),
          mutation("suspended-create-01"),
        ),
      "FORBIDDEN",
    );

    expectError(
      () =>
        workflow.createReferral(
          { ...SOURCE_A, organizationStatus: "suspended" },
          referralInput(),
          mutation("suspended-org-0001"),
        ),
      "FORBIDDEN",
    );
    expectError(
      () =>
        workflow.createReferral(
          { ...SOURCE_A, organizationType: "PROVIDER" },
          referralInput(),
          mutation("wrong-org-role-001"),
        ),
      "FORBIDDEN",
    );
    expectError(
      () =>
        workflow.getReferral(
          { ...PROVIDER_A, providerReviewStatus: "suspended" },
          "unknown-referral",
        ),
      "FORBIDDEN",
    );
  });

  it("rejects contact details copied into the private summary", () => {
    const workflow = createWorkflow();
    for (const summary of [
      "Please call 0400000000 about supports",
      "Referral for Person A",
      "Contact person-a@example.test",
    ]) {
      expectError(
        () =>
          workflow.createReferral(
            SOURCE_A,
            { ...referralInput(), summary },
            mutation(`summary-pii-${summary.length.toString().padStart(5, "0")}`),
          ),
        "VALIDATION_ERROR",
      );
    }
    expectError(
      () =>
        workflow.createReferral(
          SOURCE_A,
          {
            ...referralInput(),
            summary: "Referral for Li",
            contact: { ...referralInput().contact, name: "Li" },
          },
          mutation("summary-short-name1"),
        ),
      "VALIDATION_ERROR",
    );
    expectError(
      () =>
        workflow.createReferral(
          SOURCE_A,
          {
            ...referralInput(),
            summary: "李雷需要服务",
            contact: { ...referralInput().contact, name: "李雷" },
          },
          mutation("summary-cjk-name001"),
        ),
      "VALIDATION_ERROR",
    );
    expectError(
      () =>
        workflow.createReferral(
          SOURCE_A,
          {
            ...referralInput(),
            summary: "Annual support review",
            contact: { ...referralInput().contact, name: "Ann" },
          },
          mutation("summary-substring-name"),
        ),
      "VALIDATION_ERROR",
    );
  });

  it("accepts only server catalog codes in pre-accept visible fields", () => {
    const workflow = createWorkflow();
    for (const input of [
      { ...referralInput(), region: "Melbourne 0400000000" },
      { ...referralInput(), serviceType: "person-a@example.test" },
      { ...referralInput(), region: "PHONE_0400000000" },
      { ...referralInput(), serviceType: "PERSON_A" },
      { ...referralInput(), region: "VIC_UNKNOWN" },
    ]) {
      expectError(
        () =>
          workflow.createReferral(
            SOURCE_A,
            input,
            mutation(`catalog-code-${input.region.length.toString().padStart(5, "0")}`),
          ),
        "VALIDATION_ERROR",
      );
    }
  });

  it("fails closed for an ineligible offer target", () => {
    const workflow = createMemoryPortalReferralWorkflow({
      createId: () => "generated-id",
      now: () => "2026-08-14T00:00:00.000Z",
    });
    const created = workflow.createReferral(
      SOURCE_A,
      referralInput(),
      mutation("target-create-0001"),
    );
    workflow.triageReferral(
      ADMIN,
      created.referralId,
      1,
      mutation("target-triage-001"),
    );
    expectError(
      () =>
        workflow.offerReferral(
          ADMIN,
          {
            referralId: created.referralId,
            providerId: "provider-a",
            expectedVersion: 2,
          },
          mutation("target-offer-00001"),
        ),
      "NOT_FOUND",
    );
  });

  it("replays a completed offer after target eligibility changes", () => {
    let id = 0;
    let eligible = true;
    const workflow = createMemoryPortalReferralWorkflow({
      createId: () => `generated-${++id}`,
      now: () => "2026-08-14T00:00:00.000Z",
      isProviderEligible: () => eligible,
    });
    const created = workflow.createReferral(
      SOURCE_A,
      referralInput(),
      mutation("target-replay-create"),
    );
    workflow.triageReferral(
      ADMIN,
      created.referralId,
      1,
      mutation("target-replay-triage"),
    );
    const request = {
      referralId: created.referralId,
      providerId: "provider-a",
      expectedVersion: 2,
    } as const;
    const first = workflow.offerReferral(
      ADMIN,
      request,
      mutation("target-replay-offer1"),
    );
    eligible = false;
    expect(
      workflow.offerReferral(
        ADMIN,
        request,
        mutation("target-replay-offer1"),
      ),
    ).toEqual(first);
  });

  it("rolls back partial state when the audit append fails", () => {
    let calls = 0;
    const workflow = createMemoryPortalReferralWorkflow({
      createId: () => {
        calls += 1;
        if (calls === 2) throw new Error("audit storage unavailable");
        return `generated-${calls}`;
      },
      now: () => "2026-08-14T00:00:00.000Z",
      isProviderEligible: () => true,
    });
    expect(() =>
      workflow.createReferral(
        SOURCE_A,
        referralInput(),
        mutation("rollback-create-001"),
      ),
    ).toThrow("audit storage unavailable");
    expectError(
      () => workflow.getReferral(SOURCE_A, "generated-1"),
      "NOT_FOUND",
    );

    const retry = workflow.createReferral(
      SOURCE_A,
      referralInput(),
      mutation("rollback-create-001"),
    );
    expect(retry.referralId).toBe("generated-3");
    expect(workflow.getAudit(ADMIN, retry.referralId)).toHaveLength(1);
  });

  it("rejects a second sequential competing offer decision", () => {
    const workflow = createWorkflow();
    const created = workflow.createReferral(
      SOURCE_A,
      referralInput(),
      mutation("race-create-00001"),
    );
    workflow.triageReferral(
      ADMIN,
      created.referralId,
      1,
      mutation("race-triage-0001"),
    );
    const offered = workflow.offerReferral(
      ADMIN,
      {
        referralId: created.referralId,
        providerId: "provider-a",
        expectedVersion: 2,
      },
      mutation("race-offer-000001"),
    );
    workflow.respondToOffer(
      PROVIDER_A,
      { matchId: offered.matchId!, expectedVersion: 3, decision: "ACCEPT" },
      mutation("race-accept-00001"),
    );
    expectError(
      () =>
        workflow.respondToOffer(
          PROVIDER_A,
          { matchId: offered.matchId!, expectedVersion: 3, decision: "DECLINE" },
          mutation("race-decline-0001"),
        ),
      "INVALID_STATE_TRANSITION",
    );
    expect(workflow.getReferral(PROVIDER_A, created.referralId)).toMatchObject({
      currentStatus: "ACCEPTED",
      assignedProviderId: "provider-a",
      rowVersion: 4,
    });
  });
});

function createWorkflow() {
  let id = 0;
  let tick = 0;
  return createMemoryPortalReferralWorkflow({
    createId: () => `generated-${++id}`,
    now: () => `2026-08-14T00:00:${String(tick++).padStart(2, "0")}.000Z`,
    isProviderEligible: (providerId) =>
      ["provider-a", "provider-b"].includes(providerId),
    providerCandidates: [
      { providerId: "provider-a", displayName: "Provider A" },
      { providerId: "provider-b", displayName: "Provider B" },
    ],
  });
}

function referralInput() {
  return {
    summary: "Daily living support",
    region: "VIC_MELBOURNE",
    serviceType: "SUPPORT_COORDINATION",
    contact: {
      name: "Person A",
      phone: "0400000000",
      email: "person-a@example.test",
    },
  } as const;
}

function createAcceptedReferral(workflow: ReturnType<typeof createWorkflow>) {
  const created = workflow.createReferral(
    SOURCE_A,
    referralInput(),
    mutation("accepted-create-001"),
  );
  workflow.triageReferral(
    ADMIN,
    created.referralId,
    1,
    mutation("accepted-triage-01"),
  );
  const offered = workflow.offerReferral(
    ADMIN,
    {
      referralId: created.referralId,
      providerId: PROVIDER_A.providerId!,
      expectedVersion: 2,
    },
    mutation("accepted-offer-001"),
  );
  return workflow.respondToOffer(
    PROVIDER_A,
    { matchId: offered.matchId!, expectedVersion: 3, decision: "ACCEPT" },
    mutation("accepted-response01"),
  );
}

function mutation(mutationId: string) {
  return { mutationId };
}

function expectError(run: () => unknown, code: string) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(PortalReferralWorkflowError);
    expect((error as PortalReferralWorkflowError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}
