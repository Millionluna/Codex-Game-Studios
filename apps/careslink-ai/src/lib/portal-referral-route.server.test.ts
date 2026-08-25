import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createActorBoundPortalReferralApi,
  type PortalReferralApi,
} from "./portal-referral-adapter.server";
import {
  handlePortalReferralAudit,
  handlePortalReferralAssignmentCollection,
  handlePortalReferralAssignmentGet,
  handlePortalReferralCandidates,
  handlePortalReferralCollection,
  handlePortalReferralFollowUp,
  handlePortalReferralGet,
  handlePortalReferralOffer,
  handlePortalReferralOffers,
  handlePortalReferralResponse,
  handlePortalReferralTriage,
  type PortalReferralRouteDependencies,
} from "./portal-referral-route.server";
import type {
  PortalReferralApiResolution,
  PortalReferralApiResolver,
} from "./portal-referral-runtime.server";
import {
  PortalReferralWorkflowError,
  createMemoryPortalReferralWorkflow,
  type PortalReferralActor,
  type PortalReferralAuditEvent,
  type PortalReferralListItem,
  type PortalReferralMutationAck,
  type PortalReferralOfferListItem,
  type PortalReferralProviderCandidate,
} from "./portal-referral-workflow";

const ORIGIN = "https://preview.careslink.test";
const SERVER_CORRELATION_ID = "server-correlation-0001";
const CLIENT_CORRELATION_ID = "client-correlation-private-0001";
const ACCESS_TOKEN = "portal-private-access-token";
const SUMMARY = "Adult participant needs community participation support";
const CONTACT = {
  name: "Private Contact",
  phone: "0400000099",
  email: "private-contact@example.invalid",
} as const;

const IDS = {
  sourceAUser: "10000000-0000-4000-8000-000000000001",
  sourceBUser: "10000000-0000-4000-8000-000000000002",
  operatorAUser: "10000000-0000-4000-8000-000000000003",
  providerAUser: "10000000-0000-4000-8000-000000000004",
  providerBUser: "10000000-0000-4000-8000-000000000005",
  sourceAOrg: "20000000-0000-4000-8000-000000000001",
  sourceBOrg: "20000000-0000-4000-8000-000000000002",
  providerAOrg: "20000000-0000-4000-8000-000000000003",
  providerBOrg: "20000000-0000-4000-8000-000000000004",
  providerA: "30000000-0000-4000-8000-000000000001",
  providerB: "30000000-0000-4000-8000-000000000002",
} as const;

const SOURCE_A = actor({
  userId: IDS.sourceAUser,
  organizationId: IDS.sourceAOrg,
  organizationType: "REFERRAL_SOURCE",
  role: "referral_source",
});
const SOURCE_B = actor({
  userId: IDS.sourceBUser,
  organizationId: IDS.sourceBOrg,
  organizationType: "REFERRAL_SOURCE",
  role: "referral_source",
});
const OPERATOR_A = actor({
  userId: IDS.operatorAUser,
  organizationId: IDS.sourceAOrg,
  organizationType: "REFERRAL_SOURCE",
  role: "partner_operator",
});
const PROVIDER_A = actor({
  userId: IDS.providerAUser,
  organizationId: IDS.providerAOrg,
  organizationType: "PROVIDER",
  role: "provider_member",
  providerId: IDS.providerA,
  providerReviewStatus: "approved",
});
const PROVIDER_B = actor({
  userId: IDS.providerBUser,
  organizationId: IDS.providerBOrg,
  organizationType: "PROVIDER",
  role: "provider_member",
  providerId: IDS.providerB,
  providerReviewStatus: "approved",
});

type ActorName = "source-a" | "source-b" | "operator-a" | "provider-a" | "provider-b";

describe("Portal referral route adapter", () => {
  it("runs the actor-bound local vertical slice without leaking private inputs", async () => {
    const harness = createHarness();
    const createKey = "portal-create-private-0001";
    const triageKey = "portal-triage-private-001";
    const offerKey = "portal-offer-private-00001";
    const acceptKey = "portal-accept-private-0001";
    const followUpKey = "portal-followup-private-01";

    const createResponse = await handlePortalReferralCollection(
      mutationRequest("/api/portal/referrals", "source-a", createKey, {
        summary: SUMMARY,
        region: "VIC_MELBOURNE",
        serviceType: "COMMUNITY_PARTICIPATION",
        contact: CONTACT,
      }),
      harness.dependencies,
    );
    expect(createResponse.status).toBe(201);
    const created = await responseJson<PortalReferralMutationAck>(createResponse);
    expect(Object.keys(created).sort()).toEqual([
      "currentStatus",
      "matchId",
      "referralId",
      "rowVersion",
      "updatedAt",
    ]);
    expect(created).toMatchObject({
      currentStatus: "SUBMITTED",
      matchId: null,
      rowVersion: 1,
    });
    expectRedacted(created, createKey);

    const sourceListResponse = await handlePortalReferralCollection(
      getRequest("/api/portal/referrals", "source-a", "bearer"),
      harness.dependencies,
    );
    const sourceList = await responseJson<{ items: PortalReferralListItem[] }>(
      sourceListResponse,
    );
    expect(sourceList.items).toHaveLength(1);
    expect(sourceList.items[0]).toMatchObject({
      referralId: created.referralId,
      currentStatus: "SUBMITTED",
    });
    expectRedacted(sourceList, createKey);

    const triageResponse = await handlePortalReferralTriage(
      mutationRequest(
        `/api/portal/referrals/${created.referralId}/triage`,
        "operator-a",
        triageKey,
        { expectedVersion: 1 },
      ),
      created.referralId,
      harness.dependencies,
    );
    expect(triageResponse.status).toBe(200);

    const candidatesResponse = await handlePortalReferralCandidates(
      getRequest(
        `/api/portal/referrals/${created.referralId}/candidates`,
        "operator-a",
      ),
      created.referralId,
      harness.dependencies,
    );
    const candidates = await responseJson<{
      items: PortalReferralProviderCandidate[];
    }>(candidatesResponse);
    expect(candidates.items).toEqual([
      { providerId: IDS.providerA, displayName: "Provider A Preview" },
      { providerId: IDS.providerB, displayName: "Provider B Preview" },
    ]);
    expectRedacted(candidates);

    const offerResponse = await handlePortalReferralOffer(
      mutationRequest(
        `/api/portal/referrals/${created.referralId}/offers`,
        "operator-a",
        offerKey,
        { providerId: IDS.providerA, expectedVersion: 2 },
      ),
      created.referralId,
      harness.dependencies,
    );
    const offered = await responseJson<PortalReferralMutationAck>(offerResponse);
    expect(offered).toMatchObject({
      currentStatus: "OFFERED",
      rowVersion: 3,
    });
    expect(offered.matchId).toMatch(UUID_PATTERN);
    expectRedacted(offered, offerKey);

    const offersResponse = await handlePortalReferralOffers(
      getRequest("/api/portal/referral-offers", "provider-a"),
      harness.dependencies,
    );
    const offers = await responseJson<{ items: PortalReferralOfferListItem[] }>(
      offersResponse,
    );
    expect(offers.items).toEqual([
      {
        matchId: offered.matchId,
        referralId: created.referralId,
        region: "VIC_MELBOURNE",
        serviceType: "COMMUNITY_PARTICIPATION",
        matchStatus: "OFFERED",
        currentStatus: "OFFERED",
        rowVersion: 3,
      },
    ]);
    expectRedacted(offers, offerKey);

    const preAcceptDetailResponse = await handlePortalReferralGet(
      getRequest(
        `/api/portal/referrals/${created.referralId}`,
        "provider-a",
      ),
      created.referralId,
      harness.dependencies,
    );
    expect(preAcceptDetailResponse.status).toBe(404);
    expect(await responseJson(preAcceptDetailResponse)).toEqual({
      error: { code: "NOT_FOUND" },
      correlationId: SERVER_CORRELATION_ID,
    });

    const acceptResponse = await handlePortalReferralResponse(
      mutationRequest(
        `/api/portal/referral-offers/${offered.matchId}/response`,
        "provider-a",
        acceptKey,
        { decision: "ACCEPT", expectedVersion: 3 },
      ),
      offered.matchId!,
      harness.dependencies,
    );
    const accepted = await responseJson<PortalReferralMutationAck>(acceptResponse);
    expect(accepted).toMatchObject({
      currentStatus: "ACCEPTED",
      rowVersion: 4,
    });
    expectRedacted(accepted, acceptKey);

    const followUpResponse = await handlePortalReferralFollowUp(
      mutationRequest(
        `/api/portal/referrals/${created.referralId}/follow-ups`,
        "provider-a",
        followUpKey,
        { outcomeCode: "CONTACT_CONFIRMED", expectedVersion: 4 },
      ),
      created.referralId,
      harness.dependencies,
    );
    const followedUp = await responseJson<PortalReferralMutationAck>(
      followUpResponse,
    );
    expect(followedUp).toMatchObject({
      currentStatus: "IN_PROGRESS",
      rowVersion: 5,
    });
    expectRedacted(followedUp, followUpKey);

    const auditResponse = await handlePortalReferralAudit(
      getRequest(
        `/api/portal/referrals/${created.referralId}/audit`,
        "operator-a",
      ),
      created.referralId,
      harness.dependencies,
    );
    const audit = await responseJson<{ items: PortalReferralAuditEvent[] }>(
      auditResponse,
    );
    expect(audit.items.map((event) => event.mutationKind)).toEqual([
      "CREATE_REFERRAL",
      "TRIAGE_REFERRAL",
      "OFFER_REFERRAL",
      "RESPOND_TO_OFFER",
      "RECORD_FOLLOW_UP",
    ]);
    expect(audit.items.every((event) => HEX_64.test(event.mutationIdHash))).toBe(
      true,
    );
    expectRedacted(
      audit,
      createKey,
      triageKey,
      offerKey,
      acceptKey,
      followUpKey,
    );

    for (const actorName of ["source-b", "provider-b"] as const) {
      const response = await handlePortalReferralGet(
        getRequest(
          `/api/portal/referrals/${created.referralId}`,
          actorName,
        ),
        created.referralId,
        harness.dependencies,
      );
      expect(response.status).toBe(404);
      expect(await responseJson(response)).toEqual({
        error: { code: "NOT_FOUND" },
        correlationId: SERVER_CORRELATION_ID,
      });
    }
  });

  it("keeps same-key replay stable and maps changed payload to a redacted 409", async () => {
    const harness = createHarness();
    const mutationId = "portal-replay-private-001";
    const body = {
      summary: SUMMARY,
      region: "VIC_GEELONG",
      serviceType: "SUPPORT_COORDINATION",
      contact: CONTACT,
    };

    const first = await handlePortalReferralCollection(
      mutationRequest("/api/portal/referrals", "source-a", mutationId, body),
      harness.dependencies,
    );
    const firstBody = await responseJson<PortalReferralMutationAck>(first);
    const replay = await handlePortalReferralCollection(
      mutationRequest("/api/portal/referrals", "source-a", mutationId, body),
      harness.dependencies,
    );
    expect(replay.status).toBe(201);
    expect(await responseJson(replay)).toEqual(firstBody);

    const conflict = await handlePortalReferralCollection(
      mutationRequest("/api/portal/referrals", "source-a", mutationId, {
        ...body,
        summary: "Different de-identified support request",
      }),
      harness.dependencies,
    );
    expect(conflict.status).toBe(409);
    const conflictBody = await responseJson(conflict);
    expect(conflictBody).toEqual({
      error: { code: "IDEMPOTENCY_CONFLICT" },
      correlationId: SERVER_CORRELATION_ID,
    });
    expectRedacted(conflictBody, mutationId, "Different de-identified support request");

    const audit = harness.workflow.getAudit(
      OPERATOR_A,
      firstBody.referralId,
    );
    expect(audit).toHaveLength(1);
  });

  it("returns only allowlisted stale details and never echoes invalid path input", async () => {
    const harness = createHarness();
    const createResponse = await handlePortalReferralCollection(
      mutationRequest(
        "/api/portal/referrals",
        "source-a",
        "portal-stale-create-0001",
        {
          summary: SUMMARY,
          region: "VIC_MELBOURNE",
          serviceType: "SUPPORT_COORDINATION",
          contact: CONTACT,
        },
      ),
      harness.dependencies,
    );
    const created = await responseJson<PortalReferralMutationAck>(createResponse);
    await handlePortalReferralTriage(
      mutationRequest(
        `/api/portal/referrals/${created.referralId}/triage`,
        "operator-a",
        "portal-stale-triage-001",
        { expectedVersion: 1 },
      ),
      created.referralId,
      harness.dependencies,
    );

    const stale = await handlePortalReferralOffer(
      mutationRequest(
        `/api/portal/referrals/${created.referralId}/offers`,
        "operator-a",
        "portal-stale-offer-00001",
        { providerId: IDS.providerA, expectedVersion: 1 },
      ),
      created.referralId,
      harness.dependencies,
    );
    expect(stale.status).toBe(409);
    expect(await responseJson(stale)).toEqual({
      error: { code: "STALE_REFERRAL", details: { currentVersion: 2 } },
      correlationId: SERVER_CORRELATION_ID,
    });

    const invalidPath = "private-contact-path-id";
    const invalid = await handlePortalReferralGet(
      getRequest(`/api/portal/referrals/${invalidPath}`, "source-a"),
      invalidPath,
      harness.dependencies,
    );
    expect(invalid.status).toBe(400);
    const invalidBody = await responseJson(invalid);
    expect(invalidBody).toEqual({
      error: { code: "VALIDATION_ERROR" },
      correlationId: SERVER_CORRELATION_ID,
    });
    expect(JSON.stringify(invalidBody)).not.toContain(invalidPath);
  });

  it("allows only one of two different-key competing offer decisions", async () => {
    const harness = createHarness();
    const offered = await createOfferedReferral(harness);
    const acceptKey = "portal-race-accept-0001";
    const declineKey = "portal-race-decline-001";

    const [acceptResponse, declineResponse] = await Promise.all([
      handlePortalReferralResponse(
        mutationRequest(
          `/api/portal/referral-offers/${offered.matchId}/response`,
          "provider-a",
          acceptKey,
          { decision: "ACCEPT", expectedVersion: 3 },
        ),
        offered.matchId,
        harness.dependencies,
      ),
      handlePortalReferralResponse(
        mutationRequest(
          `/api/portal/referral-offers/${offered.matchId}/response`,
          "provider-a",
          declineKey,
          { decision: "DECLINE", expectedVersion: 3 },
        ),
        offered.matchId,
        harness.dependencies,
      ),
    ]);

    expect([acceptResponse.status, declineResponse.status].sort()).toEqual([
      200, 409,
    ]);
    const audit = harness.workflow.getAudit(OPERATOR_A, offered.referralId);
    expect(
      audit.filter((event) => event.mutationKind === "RESPOND_TO_OFFER"),
    ).toHaveLength(1);
    expectRedacted(await responseJson(acceptResponse), acceptKey, declineKey);
    expectRedacted(await responseJson(declineResponse), acceptKey, declineKey);
  });

  it("removes a declined provider from list/detail while preserving exact replay ACK", async () => {
    const harness = createHarness();
    const offered = await createOfferedReferral(harness);
    const declineKey = "portal-decline-private-001";
    const declineBody = { decision: "DECLINE", expectedVersion: 3 } as const;

    const declinedResponse = await handlePortalReferralResponse(
      mutationRequest(
        `/api/portal/referral-offers/${offered.matchId}/response`,
        "provider-a",
        declineKey,
        declineBody,
      ),
      offered.matchId,
      harness.dependencies,
    );
    const declined = await responseJson<PortalReferralMutationAck>(
      declinedResponse,
    );
    expect(declined.currentStatus).toBe("TRIAGED");

    const replayResponse = await handlePortalReferralResponse(
      mutationRequest(
        `/api/portal/referral-offers/${offered.matchId}/response`,
        "provider-a",
        declineKey,
        declineBody,
      ),
      offered.matchId,
      harness.dependencies,
    );
    expect(await responseJson(replayResponse)).toEqual(declined);

    const listResponse = await handlePortalReferralOffers(
      getRequest("/api/portal/referral-offers", "provider-a"),
      harness.dependencies,
    );
    expect(await responseJson(listResponse)).toEqual({ items: [] });

    const detailResponse = await handlePortalReferralGet(
      getRequest(`/api/portal/referrals/${offered.referralId}`, "provider-a"),
      offered.referralId,
      harness.dependencies,
    );
    expect(detailResponse.status).toBe(404);
    expectRedacted(await responseJson(detailResponse), declineKey);
  });

  it("rejects disabled, revoked and suspended requests before reading bodies", async () => {
    const cases: Array<{
      expectedCode: string;
      expectedStatus: number;
      dependencies?: PortalReferralRouteDependencies;
    }> = [
      {
        expectedCode: "CAPABILITY_DISABLED",
        expectedStatus: 503,
      },
      {
        expectedCode: "SESSION_REVOKED",
        expectedStatus: 401,
        dependencies: dependenciesForFailure("session_revoked", 401),
      },
      {
        expectedCode: "FORBIDDEN",
        expectedStatus: 403,
        dependencies: dependenciesForFailure("forbidden", 403),
      },
    ];

    for (const testCase of cases) {
      const request = mutationRequest(
        "/api/portal/referrals",
        "source-a",
        "portal-opaque-body-0001",
        { contact: CONTACT, summary: SUMMARY },
      );
      const bodyAccess = vi.fn(() => {
        throw new Error("body must not be parsed");
      });
      Object.defineProperty(request, "body", { get: bodyAccess });

      const response = await handlePortalReferralCollection(
        request,
        testCase.dependencies,
      );
      expect(response.status).toBe(testCase.expectedStatus);
      expect(bodyAccess).not.toHaveBeenCalled();
      const body = await responseJson(response);
      expect(body).toMatchObject({ error: { code: testCase.expectedCode } });
      expectRedacted(body, "portal-opaque-body-0001");
    }
  });

  it("stops reading an oversized streamed body before running a mutation", async () => {
    const harness = createHarness();
    const request = mutationRequest(
      "/api/portal/referrals",
      "source-a",
      "portal-oversized-body-001",
      {
        summary: "x".repeat(20_000),
        region: "VIC_MELBOURNE",
        serviceType: "SUPPORT_COORDINATION",
        contact: CONTACT,
      },
    );
    request.headers.delete("content-length");

    const response = await handlePortalReferralCollection(
      request,
      harness.dependencies,
    );

    expect(response.status).toBe(400);
    expect(await responseJson(response)).toEqual({
      error: { code: "VALIDATION_ERROR" },
      correlationId: SERVER_CORRELATION_ID,
    });
    expect(harness.workflow.listReferrals(SOURCE_A)).toEqual([]);
  });

  it("rolls back a failed mutation and permits one clean retry", async () => {
    let calls = 0;
    const workflow = createMemoryPortalReferralWorkflow({
      createId: () => {
        calls += 1;
        if (calls === 2) throw new Error("audit storage unavailable");
        return generatedUuid(calls);
      },
      now: () => "2026-08-16T00:00:00.000Z",
      providerCandidates: providerCandidates(),
    });
    const harness = createHarness(workflow);
    const mutationId = "portal-rollback-private01";
    const input = {
      summary: SUMMARY,
      region: "VIC_REGIONAL",
      serviceType: "DAILY_LIVING_SUPPORT",
      contact: CONTACT,
    };

    const failed = await handlePortalReferralCollection(
      mutationRequest("/api/portal/referrals", "source-a", mutationId, input),
      harness.dependencies,
    );
    expect(failed.status).toBe(500);
    expectRedacted(await responseJson(failed), mutationId);
    expect(workflow.listReferrals(SOURCE_A)).toEqual([]);

    const retried = await handlePortalReferralCollection(
      mutationRequest("/api/portal/referrals", "source-a", mutationId, input),
      harness.dependencies,
    );
    expect(retried.status).toBe(201);
    const retriedBody = await responseJson<PortalReferralMutationAck>(retried);
    expect(workflow.listReferrals(SOURCE_A)).toHaveLength(1);
    expect(workflow.getAudit(OPERATOR_A, retriedBody.referralId)).toHaveLength(
      1,
    );
  });

  it("maps cookie and Bearer fixtures to the same actor through distinct checks", async () => {
    const workflow = createWorkflow();
    const sourceApi = createActorBoundPortalReferralApi(workflow, SOURCE_A);
    const resolveApi: PortalReferralApiResolver = async (request) => {
      const bearerMatches =
        request.headers.get("authorization") === `Bearer ${ACCESS_TOKEN}`;
      const cookieMatches = request.headers
        .get("cookie")
        ?.split(";")
        .map((value) => value.trim())
        .includes("portal_session=opaque-session");
      return bearerMatches || cookieMatches
        ? { ok: true, api: sourceApi }
        : { ok: false, reason: "auth_required", status: 401 };
    };
    const dependencies = {
      resolveApi,
      createCorrelationId: () => SERVER_CORRELATION_ID,
    } satisfies PortalReferralRouteDependencies;
    await handlePortalReferralCollection(
      mutationRequest(
        "/api/portal/referrals",
        "source-a",
        "portal-parity-create-001",
        {
          summary: SUMMARY,
          region: "VIC_MELBOURNE",
          serviceType: "SUPPORT_COORDINATION",
          contact: CONTACT,
        },
      ),
      dependencies,
    );

    const bearer = await handlePortalReferralCollection(
      getRequest("/api/portal/referrals", "source-a", "bearer"),
      dependencies,
    );
    const cookie = await handlePortalReferralCollection(
      getRequest("/api/portal/referrals", "source-a", "cookie"),
      dependencies,
    );
    expect(await responseJson(cookie)).toEqual(await responseJson(bearer));
  });

  it("serves an operator-scoped assignment queue and exact private detail", async () => {
    const harness = createHarness();
    const sourceA = harness.workflow.createReferral(
      SOURCE_A,
      {
        summary: SUMMARY,
        region: "VIC_MELBOURNE",
        serviceType: "SUPPORT_COORDINATION",
        contact: CONTACT,
      },
      { mutationId: "assignment-route-create-a" },
    );
    const sourceB = harness.workflow.createReferral(
      SOURCE_B,
      {
        summary: SUMMARY,
        region: "VIC_GEELONG",
        serviceType: "COMMUNITY_PARTICIPATION",
        contact: CONTACT,
      },
      { mutationId: "assignment-route-create-b" },
    );

    const queueResponse = await handlePortalReferralAssignmentCollection(
      getRequest("/api/portal/referral-assignments", "operator-a"),
      harness.dependencies,
    );
    const queue = await responseJson<{ items: Record<string, unknown>[] }>(
      queueResponse,
    );
    expect(queueResponse.status).toBe(200);
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]).toMatchObject({
      referralId: sourceA.referralId,
      sourceOrganizationId: IDS.sourceAOrg,
      currentStatus: "SUBMITTED",
      rowVersion: 1,
    });
    expect(Object.keys(queue.items[0] ?? {}).sort()).toEqual(
      [
        "referralId",
        "sourceOrganizationId",
        "sourceOrganizationName",
        "region",
        "serviceType",
        "currentStatus",
        "rowVersion",
        "updatedAt",
      ].sort(),
    );
    expect(JSON.stringify(queue)).not.toContain(CONTACT.phone);
    expect(JSON.stringify(queue)).not.toContain(SUMMARY);

    const detailResponse = await handlePortalReferralAssignmentGet(
      getRequest(
        `/api/portal/referral-assignments/${sourceA.referralId}`,
        "operator-a",
      ),
      sourceA.referralId,
      harness.dependencies,
    );
    expect(await responseJson(detailResponse)).toEqual({
      referral: expect.objectContaining({
        referralId: sourceA.referralId,
        summary: SUMMARY,
        contact: CONTACT,
        activeOffer: null,
      }),
    });

    const crossTenant = await handlePortalReferralAssignmentGet(
      getRequest(
        `/api/portal/referral-assignments/${sourceB.referralId}`,
        "operator-a",
      ),
      sourceB.referralId,
      harness.dependencies,
    );
    expect(crossTenant.status).toBe(404);
    expect(await responseJson(crossTenant)).toEqual({
      error: { code: "NOT_FOUND" },
      correlationId: SERVER_CORRELATION_ID,
    });
  });

  it("projects candidates and fails closed on an unbound assignment ACK", async () => {
    const workflow = createWorkflow();
    const created = workflow.createReferral(
      SOURCE_A,
      {
        summary: SUMMARY,
        region: "VIC_MELBOURNE",
        serviceType: "SUPPORT_COORDINATION",
        contact: CONTACT,
      },
      { mutationId: "assignment-project-create" },
    );
    workflow.triageReferral(
      OPERATOR_A,
      created.referralId,
      1,
      { mutationId: "assignment-project-triage" },
    );
    const baseApi = createActorBoundPortalReferralApi(workflow, OPERATOR_A);
    const api = {
      ...baseApi,
      listProviderCandidates: async () => [
        {
          providerId: IDS.providerA,
          displayName: "Provider A Preview",
          privateScore: 99,
        },
      ],
      triageReferral: async () => ({
        referralId: "70000000-0000-4000-8000-000000000999",
        matchId: null,
        currentStatus: "TRIAGED" as const,
        rowVersion: 2,
        updatedAt: "2026-08-16T00:00:00.000Z",
      }),
    } satisfies PortalReferralApi;
    const dependencies = {
      resolveApi: async () => ({ ok: true as const, api }),
      createCorrelationId: () => SERVER_CORRELATION_ID,
    };

    const candidatesResponse = await handlePortalReferralCandidates(
      getRequest(
        `/api/portal/referrals/${created.referralId}/candidates`,
        "operator-a",
      ),
      created.referralId,
      dependencies,
    );
    expect(await responseJson(candidatesResponse)).toEqual({
      items: [
        { providerId: IDS.providerA, displayName: "Provider A Preview" },
      ],
    });

    const triageResponse = await handlePortalReferralTriage(
      mutationRequest(
        `/api/portal/referrals/${created.referralId}/triage`,
        "operator-a",
        "assignment-unbound-ack",
        { expectedVersion: 1 },
      ),
      created.referralId,
      dependencies,
    );
    expect(triageResponse.status).toBe(503);
    expect(await responseJson(triageResponse)).toEqual({
      error: { code: "ADAPTER_UNAVAILABLE" },
      correlationId: SERVER_CORRELATION_ID,
    });
  });

  it("rejects unsupported methods before resolving an adapter", async () => {
    const resolveApi = vi.fn<PortalReferralApiResolver>();
    const response = await handlePortalReferralCollection(
      new Request(`${ORIGIN}/api/portal/referrals`, { method: "DELETE" }),
      { resolveApi },
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, POST");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(resolveApi).not.toHaveBeenCalled();
  });

  it("awaits every API method so durable promises never serialize as empty objects", async () => {
    const referralId = "70000000-0000-4000-8000-000000000901";
    const matchId = "70000000-0000-4000-8000-000000000902";
    const updatedAt = "2026-08-24T00:00:00.000Z";
    const ack = {
      referralId,
      matchId: null,
      currentStatus: "SUBMITTED",
      rowVersion: 1,
      updatedAt,
    } as const;
    const triageAck = {
      ...ack,
      currentStatus: "TRIAGED" as const,
      rowVersion: 2,
    };
    const offerAck = {
      ...ack,
      matchId,
      currentStatus: "OFFERED" as const,
      rowVersion: 2,
    };
    const assignmentDetail = {
      referralId,
      sourceOrganizationId: IDS.sourceAOrg,
      sourceOrganizationName: "Source A",
      summary: SUMMARY,
      region: "VIC_MELBOURNE",
      serviceType: "SUPPORT_COORDINATION",
      currentStatus: "SUBMITTED" as const,
      rowVersion: 1,
      contact: CONTACT,
      activeOffer: null,
      createdAt: updatedAt,
      updatedAt,
    } as const;
    const api = {
      listReferrals: vi.fn(async () => []),
      createReferral: vi.fn(async () => ack),
      getReferral: vi.fn(async () => ({
        referralId,
        sourceOrganizationId: IDS.sourceAOrg,
        summary: SUMMARY,
        region: "VIC_MELBOURNE",
        serviceType: "SUPPORT_COORDINATION",
        currentStatus: "SUBMITTED" as const,
        assignedProviderId: null,
        rowVersion: 1,
        contact: CONTACT,
        canonicalDocumentId: null,
        exportJobId: null,
        createdAt: updatedAt,
        updatedAt,
      })),
      listAssignmentReferrals: vi.fn(async () => []),
      getAssignmentReferral: vi.fn(async () => assignmentDetail),
      triageReferral: vi.fn(async () => triageAck),
      listProviderCandidates: vi.fn(async () => []),
      offerReferral: vi.fn(async () => offerAck),
      listMyOffers: vi.fn(async () => []),
      respondToOffer: vi.fn(async () => ({ ...ack, matchId })),
      recordFollowUp: vi.fn(async () => ack),
      listAudit: vi.fn(async () => []),
    } satisfies PortalReferralApi;
    const dependencies = {
      resolveApi: async () => ({ ok: true as const, api }),
      createCorrelationId: () => SERVER_CORRELATION_ID,
    };

    const responses = [
      await handlePortalReferralCollection(
        getRequest("/api/portal/referrals", "source-a"),
        dependencies,
      ),
      await handlePortalReferralCollection(
        mutationRequest(
          "/api/portal/referrals",
          "source-a",
          "portal-async-create-0001",
          {
            summary: SUMMARY,
            region: "VIC_MELBOURNE",
            serviceType: "SUPPORT_COORDINATION",
            contact: CONTACT,
          },
        ),
        dependencies,
      ),
      await handlePortalReferralGet(
        getRequest(`/api/portal/referrals/${referralId}`, "source-a"),
        referralId,
        dependencies,
      ),
      await handlePortalReferralAssignmentCollection(
        getRequest("/api/portal/referral-assignments", "operator-a"),
        dependencies,
      ),
      await handlePortalReferralAssignmentGet(
        getRequest(
          `/api/portal/referral-assignments/${referralId}`,
          "operator-a",
        ),
        referralId,
        dependencies,
      ),
      await handlePortalReferralTriage(
        mutationRequest(
          `/api/portal/referrals/${referralId}/triage`,
          "operator-a",
          "portal-async-triage-001",
          { expectedVersion: 1 },
        ),
        referralId,
        dependencies,
      ),
      await handlePortalReferralCandidates(
        getRequest(`/api/portal/referrals/${referralId}/candidates`, "operator-a"),
        referralId,
        dependencies,
      ),
      await handlePortalReferralOffer(
        mutationRequest(
          `/api/portal/referrals/${referralId}/offers`,
          "operator-a",
          "portal-async-offer-00001",
          { providerId: IDS.providerA, expectedVersion: 1 },
        ),
        referralId,
        dependencies,
      ),
      await handlePortalReferralOffers(
        getRequest("/api/portal/referral-offers", "provider-a"),
        dependencies,
      ),
      await handlePortalReferralResponse(
        mutationRequest(
          `/api/portal/referral-offers/${matchId}/response`,
          "provider-a",
          "portal-async-response-001",
          { decision: "ACCEPT", expectedVersion: 1 },
        ),
        matchId,
        dependencies,
      ),
      await handlePortalReferralFollowUp(
        mutationRequest(
          `/api/portal/referrals/${referralId}/follow-ups`,
          "provider-a",
          "portal-async-followup-001",
          { outcomeCode: "CONTACT_CONFIRMED", expectedVersion: 1 },
        ),
        referralId,
        dependencies,
      ),
      await handlePortalReferralAudit(
        getRequest(`/api/portal/referrals/${referralId}/audit`, "operator-a"),
        referralId,
        dependencies,
      ),
    ];
    const bodies = await Promise.all(responses.map((response) => responseJson(response)));

    expect(bodies).toEqual([
      { items: [] },
      ack,
      {
        referral: {
          referralId,
          summary: SUMMARY,
          region: "VIC_MELBOURNE",
          serviceType: "SUPPORT_COORDINATION",
          currentStatus: "SUBMITTED",
          rowVersion: 1,
          contact: CONTACT,
          createdAt: updatedAt,
          updatedAt,
        },
      },
      { items: [] },
      { referral: assignmentDetail },
      triageAck,
      { items: [] },
      offerAck,
      { items: [] },
      { ...ack, matchId },
      ack,
      { items: [] },
    ]);
    for (const method of Object.values(api)) expect(method).toHaveBeenCalledOnce();
    expect(api.createReferral).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ correlationId: SERVER_CORRELATION_ID }),
    );
    expect(api.triageReferral).toHaveBeenCalledWith(
      referralId,
      1,
      expect.objectContaining({ correlationId: SERVER_CORRELATION_ID }),
    );
    expect(api.offerReferral).toHaveBeenCalledWith(
      referralId,
      expect.anything(),
      expect.objectContaining({ correlationId: SERVER_CORRELATION_ID }),
    );
  });

  it("rejects a valid detail response bound to another referral id", async () => {
    const requestedId = "70000000-0000-7000-8000-000000000901";
    const returnedId = "70000000-0000-7000-8000-000000000902";
    const baseApi = createActorBoundPortalReferralApi(createWorkflow(), SOURCE_A);
    const response = await handlePortalReferralGet(
      getRequest(`/api/portal/referrals/${requestedId}`, "source-a"),
      requestedId,
      {
        resolveApi: async () => ({
          ok: true,
          api: {
            ...baseApi,
            getReferral: async () => ({
              referralId: returnedId,
              summary: SUMMARY,
              region: "VIC_MELBOURNE",
              serviceType: "SUPPORT_COORDINATION",
              currentStatus: "SUBMITTED",
              rowVersion: 1,
              contact: CONTACT,
              createdAt: "2026-08-24T00:00:00.000Z",
              updatedAt: "2026-08-24T00:00:00.000Z",
            }),
          },
        }),
        createCorrelationId: () => SERVER_CORRELATION_ID,
      },
    );

    expect(response.status).toBe(503);
    expect(await responseJson(response)).toEqual({
      error: { code: "ADAPTER_UNAVAILABLE" },
      correlationId: SERVER_CORRELATION_ID,
    });
  });

  it.each([null, undefined])(
    "maps a missing source-detail adapter envelope to a redacted 503 (%s)",
    async (adapterValue) => {
      const requestedId = "70000000-0000-7000-8000-000000000901";
      const baseApi = createActorBoundPortalReferralApi(createWorkflow(), SOURCE_A);
      const response = await handlePortalReferralGet(
        getRequest(`/api/portal/referrals/${requestedId}`, "source-a"),
        requestedId,
        {
          resolveApi: async () => ({
            ok: true,
            api: {
              ...baseApi,
              getReferral: async () =>
                adapterValue as unknown as Awaited<
                  ReturnType<PortalReferralApi["getReferral"]>
                >,
            },
          }),
          createCorrelationId: () => SERVER_CORRELATION_ID,
        },
      );

      expect(response.status).toBe(503);
      expect(await responseJson(response)).toEqual({
        error: { code: "ADAPTER_UNAVAILABLE" },
        correlationId: SERVER_CORRELATION_ID,
      });
    },
  );

  it.each([
    ["SESSION_REVOKED", 401],
    ["CAPABILITY_DISABLED", 503],
  ] as const)("maps a post-authorize %s race without leaking adapter text", async (code, status) => {
    const baseApi = createActorBoundPortalReferralApi(createWorkflow(), SOURCE_A);
    const api = {
      ...baseApi,
      listReferrals: async () => {
        throw new PortalReferralWorkflowError(code, CONTACT.phone, {
          privateContact: CONTACT.email,
        });
      },
    };
    const response = await handlePortalReferralCollection(
      getRequest("/api/portal/referrals", "source-a"),
      {
        resolveApi: async () => ({ ok: true, api }),
        createCorrelationId: () => SERVER_CORRELATION_ID,
      },
    );

    expect(response.status).toBe(status);
    const body = await responseJson(response);
    expect(body).toEqual({
      error: { code },
      correlationId: SERVER_CORRELATION_ID,
    });
    expectRedacted(body, CONTACT.phone, CONTACT.email);
  });
});

async function createOfferedReferral(harness: ReturnType<typeof createHarness>) {
  const createdResponse = await handlePortalReferralCollection(
    mutationRequest(
      "/api/portal/referrals",
      "source-a",
      "portal-setup-create-0001",
      {
        summary: SUMMARY,
        region: "VIC_MELBOURNE",
        serviceType: "SUPPORT_COORDINATION",
        contact: CONTACT,
      },
    ),
    harness.dependencies,
  );
  const created = await responseJson<PortalReferralMutationAck>(createdResponse);
  await handlePortalReferralTriage(
    mutationRequest(
      `/api/portal/referrals/${created.referralId}/triage`,
      "operator-a",
      "portal-setup-triage-001",
      { expectedVersion: 1 },
    ),
    created.referralId,
    harness.dependencies,
  );
  const offerResponse = await handlePortalReferralOffer(
    mutationRequest(
      `/api/portal/referrals/${created.referralId}/offers`,
      "operator-a",
      "portal-setup-offer-00001",
      { providerId: IDS.providerA, expectedVersion: 2 },
    ),
    created.referralId,
    harness.dependencies,
  );
  const offered = await responseJson<PortalReferralMutationAck>(offerResponse);
  if (!offered.matchId) throw new Error("Expected an offered match");
  return {
    referralId: created.referralId,
    matchId: offered.matchId,
  };
}

function createHarness(workflow = createWorkflow()) {
  const apis = {
    "source-a": createActorBoundPortalReferralApi(workflow, SOURCE_A),
    "source-b": createActorBoundPortalReferralApi(workflow, SOURCE_B),
    "operator-a": createActorBoundPortalReferralApi(workflow, OPERATOR_A),
    "provider-a": createActorBoundPortalReferralApi(workflow, PROVIDER_A),
    "provider-b": createActorBoundPortalReferralApi(workflow, PROVIDER_B),
  } as const;
  const resolveApi: PortalReferralApiResolver = async (request) => {
    const actorName = request.headers.get("x-test-actor") as ActorName | null;
    const api = actorName ? apis[actorName] : undefined;
    return api
      ? { ok: true, api }
      : { ok: false, reason: "auth_required", status: 401 };
  };
  return {
    workflow,
    dependencies: {
      resolveApi,
      createCorrelationId: () => SERVER_CORRELATION_ID,
    } satisfies PortalReferralRouteDependencies,
  };
}

function createWorkflow() {
  let nextId = 1;
  return createMemoryPortalReferralWorkflow({
    createId: () => generatedUuid(nextId++),
    now: () => "2026-08-16T00:00:00.000Z",
    providerCandidates: providerCandidates(),
  });
}

function providerCandidates() {
  return [
    { providerId: IDS.providerA, displayName: "Provider A Preview" },
    { providerId: IDS.providerB, displayName: "Provider B Preview" },
  ] as const;
}

function actor(
  input: Pick<
    PortalReferralActor,
    "userId" | "organizationId" | "organizationType" | "role"
  > &
    Partial<
      Pick<PortalReferralActor, "providerId" | "providerReviewStatus">
    >,
): PortalReferralActor {
  return {
    ...input,
    organizationStatus: "active",
    membershipStatus: "active",
  };
}

function mutationRequest(
  pathname: string,
  actorName: ActorName,
  idempotencyKey: string,
  body: unknown,
) {
  return new Request(`${ORIGIN}${pathname}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${ACCESS_TOKEN}`,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
      origin: ORIGIN,
      "x-correlation-id": CLIENT_CORRELATION_ID,
      "x-test-actor": actorName,
    },
    body: JSON.stringify(body),
  });
}

function getRequest(
  pathname: string,
  actorName: ActorName,
  transport: "bearer" | "cookie" = "cookie",
) {
  const headers = new Headers({
    "x-correlation-id": CLIENT_CORRELATION_ID,
    "x-test-actor": actorName,
  });
  if (transport === "bearer") {
    headers.set("authorization", `Bearer ${ACCESS_TOKEN}`);
  } else {
    headers.set("cookie", "portal_session=opaque-session");
  }
  return new Request(`${ORIGIN}${pathname}`, { method: "GET", headers });
}

function dependenciesForFailure(
  reason: "session_revoked" | "forbidden",
  status: 401 | 403,
): PortalReferralRouteDependencies {
  const resolution: PortalReferralApiResolution = {
    ok: false,
    reason,
    status,
  };
  return {
    resolveApi: async () => resolution,
    createCorrelationId: () => SERVER_CORRELATION_ID,
  };
}

async function responseJson<T = Record<string, unknown>>(response: Response) {
  return (await response.json()) as T;
}

function expectRedacted(value: unknown, ...additionalSecrets: string[]) {
  const serialized = JSON.stringify(value);
  for (const secret of [
    SUMMARY,
    CONTACT.name,
    CONTACT.phone,
    CONTACT.email,
    ACCESS_TOKEN,
    CLIENT_CORRELATION_ID,
    ...additionalSecrets,
  ]) {
    expect(serialized).not.toContain(secret);
  }
}

function generatedUuid(value: number) {
  return `70000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_64 = /^[a-f0-9]{64}$/;
