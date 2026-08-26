import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  PORTAL_REFERRAL_SUPABASE_RPC_NAMES,
  authorizePortalReferralSupabaseClient,
  createSupabasePortalReferralApi,
  type PortalReferralAuthorization,
  type PortalReferralAuthorizationScope,
  type PortalReferralSessionScopedSupabaseRpcClient,
  type PortalReferralSupabaseRpcResult,
} from "./portal-referral-supabase.server";
import type { PortalReferralSourceDetail } from "./portal-referral-adapter.server";
import {
  PortalReferralWorkflowError,
  createPortalReferralMutationPayloadHash,
} from "./portal-referral-workflow";

const IDS = {
  user: "a0000000-0000-4000-8000-000000000001",
  organization: "20000000-0000-4000-8000-000000000001",
  sourceOrganization: "20000000-0000-4000-8000-000000000002",
  referral: "b0000000-0000-4000-8000-000000000001",
  otherReferral: "b0000000-0000-4000-8000-000000000002",
  provider: "c0000000-0000-4000-8000-000000000001",
  match: "d0000000-0000-4000-8000-000000000001",
  otherMatch: "d0000000-0000-4000-8000-000000000002",
} as const;
const MUTATION_ID = "portal-create-private-0001";
const CORRELATION_ID = "server-correlation-0001";
const CONTACT = {
  name: "Private Contact",
  phone: "0400000099",
  email: "private-contact@example.invalid",
} as const;

describe("Portal referral Supabase adapter", () => {
  it.each([
    ["INTAKE", PORTAL_REFERRAL_SUPABASE_RPC_NAMES.authorize],
    [
      "SOURCE_DETAIL",
      PORTAL_REFERRAL_SUPABASE_RPC_NAMES.sourceDetailAuthorize,
    ],
  ] as const)(
    "strictly authorizes one active referral-source membership for %s",
    async (scope, rpcName) => {
      const client = rpcClient(rpcSuccess(authorizationEnvelope()));

      await expect(
        authorizePortalReferralSupabaseClient(client, scope),
      ).resolves.toEqual({
        ok: true,
        authorization: authorization(),
      });
      expect(client.rpc).toHaveBeenCalledWith(rpcName);
    },
  );

  it.each(
    ["INTAKE", "SOURCE_DETAIL"] satisfies PortalReferralAuthorizationScope[],
  )(
    "maps identical authorize errors for %s without echoing details",
    async (scope) => {
      for (const [message, reason] of [
        ["PORTAL_CAPABILITY_DISABLED", "capability_disabled"],
        ["PORTAL_AUTH_REQUIRED", "auth_required"],
        ["PORTAL_SESSION_REVOKED", "session_revoked"],
        ["PORTAL_FORBIDDEN", "forbidden"],
      ] as const) {
        const client = rpcClient({
          data: { private_contact: CONTACT },
          error: {
            code: "P0001",
            message,
            details: CONTACT.phone,
          },
          status: 400,
        });

        const result = await authorizePortalReferralSupabaseClient(
          client,
          scope,
        );
        expect(result).toEqual({ ok: false, reason });
        expect(JSON.stringify(result)).not.toContain(CONTACT.phone);
      }
    },
  );

  it.each([
    [{ code: "PGRST302" }, "auth_required"],
    [{ code: "PGRST301" }, "session_revoked"],
    [{ code: "PGRST303" }, "session_revoked"],
    [{ code: "PGRST202" }, "adapter_unavailable"],
  ] as const)("maps PostgREST authorize code without trusting its message", async (error, reason) => {
    const result = await authorizePortalReferralSupabaseClient(
      rpcClient({
        data: null,
        error: { ...error, message: CONTACT.email },
        status: 400,
      }),
      "INTAKE",
    );
    expect(result).toEqual({ ok: false, reason });
    expect(JSON.stringify(result)).not.toContain(CONTACT.email);
  });

  it.each([
    [401, "auth_required"],
    [403, "adapter_unavailable"],
  ] as const)(
    "maps authorize insufficient privilege with HTTP status %s",
    async (status, reason) => {
      const result = await authorizePortalReferralSupabaseClient(
        rpcClient({
          data: null,
          error: { code: "42501", message: CONTACT.email },
          status,
        }),
        "INTAKE",
      );
      expect(result).toEqual({ ok: false, reason });
      expect(JSON.stringify(result)).not.toContain(CONTACT.email);
    },
  );

  it.each([
    { ...authorizationEnvelope(), extra: "private" },
    omit(authorizationEnvelope(), "membership_status"),
    { ...authorizationEnvelope(), authorized: false },
    { ...authorizationEnvelope(), user_id: IDS.user.toUpperCase() },
    { ...authorizationEnvelope(), organization_type: "PROVIDER" },
    { ...authorizationEnvelope(), organization_status: "SUSPENDED" },
    { ...authorizationEnvelope(), membership_role: "platform_admin" },
    { ...authorizationEnvelope(), membership_status: "REVOKED" },
  ])("fails closed on unsafe authorize envelope %#", async (data) => {
    await expect(
      authorizePortalReferralSupabaseClient(
        rpcClient(rpcSuccess(data)),
        "INTAKE",
      ),
    ).resolves.toEqual({ ok: false, reason: "adapter_unavailable" });
  });

  it.each([
    ["PLATFORM", "platform_admin"],
    ["REFERRAL_SOURCE", "partner_operator"],
  ] as const)(
    "authorizes an active %s %s assignment membership",
    async (organizationType, membershipRole) => {
      const envelope = assignmentAuthorizationEnvelope(
        organizationType,
        membershipRole,
      );
      const client = rpcClient(rpcSuccess(envelope));

      await expect(
        authorizePortalReferralSupabaseClient(client, "ASSIGNMENT"),
      ).resolves.toEqual({
        ok: true,
        authorization: assignmentAuthorization(
          organizationType,
          membershipRole,
        ),
      });
      expect(client.rpc).toHaveBeenCalledWith(
        PORTAL_REFERRAL_SUPABASE_RPC_NAMES.assignmentAuthorize,
      );
    },
  );

  it.each([
    assignmentAuthorizationEnvelope("PLATFORM", "partner_operator"),
    assignmentAuthorizationEnvelope("REFERRAL_SOURCE", "platform_admin"),
    authorizationEnvelope(),
  ])("fails closed on a mismatched assignment authorization %#", async (data) => {
    await expect(
      authorizePortalReferralSupabaseClient(
        rpcClient(rpcSuccess(data)),
        "ASSIGNMENT",
      ),
    ).resolves.toEqual({ ok: false, reason: "adapter_unavailable" });
  });

  it("strictly authorizes one approved provider membership for provider response", async () => {
    const client = rpcClient(rpcSuccess(providerAuthorizationEnvelope()));

    await expect(
      authorizePortalReferralSupabaseClient(client, "PROVIDER_RESPONSE"),
    ).resolves.toEqual({
      ok: true,
      authorization: providerAuthorization(),
    });
    expect(client.rpc).toHaveBeenCalledWith(
      PORTAL_REFERRAL_SUPABASE_RPC_NAMES.providerResponseAuthorize,
    );
  });

  it.each([
    { ...providerAuthorizationEnvelope(), private: CONTACT },
    omit(providerAuthorizationEnvelope(), "provider_id"),
    { ...providerAuthorizationEnvelope(), provider_id: IDS.provider.toUpperCase() },
    { ...providerAuthorizationEnvelope(), provider_review_status: "SUSPENDED" },
    { ...providerAuthorizationEnvelope(), organization_type: "REFERRAL_SOURCE" },
    { ...providerAuthorizationEnvelope(), membership_role: "referral_source" },
    authorizationEnvelope(),
  ])("fails closed on an unsafe provider authorization %#", async (data) => {
    await expect(
      authorizePortalReferralSupabaseClient(
        rpcClient(rpcSuccess(data)),
        "PROVIDER_RESPONSE",
      ),
    ).resolves.toEqual({ ok: false, reason: "adapter_unavailable" });
  });

  it("does not widen source and assignment authorization scopes", async () => {
    await expect(
      authorizePortalReferralSupabaseClient(
        rpcClient(
          rpcSuccess(
            assignmentAuthorizationEnvelope("PLATFORM", "platform_admin"),
          ),
        ),
        "INTAKE",
      ),
    ).resolves.toEqual({ ok: false, reason: "adapter_unavailable" });

    const sourceApi = createSupabasePortalReferralApi(
      rpcClient(rpcSuccess(assignmentQueueEnvelope())),
      authorization(),
    );
    await expect(sourceApi.listAssignmentReferrals()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const assignmentApi = createSupabasePortalReferralApi(
      rpcClient(rpcSuccess(listEnvelope())),
      assignmentAuthorization("PLATFORM", "platform_admin"),
    );
    await expect(assignmentApi.listReferrals()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    await expect(
      authorizePortalReferralSupabaseClient(
        rpcClient(rpcSuccess(providerAuthorizationEnvelope())),
        "ASSIGNMENT",
      ),
    ).resolves.toEqual({ ok: false, reason: "adapter_unavailable" });
    await expect(
      authorizePortalReferralSupabaseClient(
        rpcClient(rpcSuccess(assignmentAuthorizationEnvelope("PLATFORM", "platform_admin"))),
        "PROVIDER_RESPONSE",
      ),
    ).resolves.toEqual({ ok: false, reason: "adapter_unavailable" });

    const providerApi = createSupabasePortalReferralApi(
      rpcClient(rpcSuccess(providerOffersEnvelope())),
      providerAuthorization(),
    );
    await expect(providerApi.listReferrals()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(sourceApi.listMyOffers()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("lists a fixed bounded assignment queue with an exact projection", async () => {
    const client = rpcClient(rpcSuccess(assignmentQueueEnvelope()));
    const api = createSupabasePortalReferralApi(
      client,
      assignmentAuthorization("PLATFORM", "platform_admin"),
    );

    await expect(api.listAssignmentReferrals()).resolves.toEqual([
      {
        referralId: IDS.referral,
        sourceOrganizationId: IDS.sourceOrganization,
        sourceOrganizationName: "Source Organisation",
        region: "VIC_MELBOURNE",
        serviceType: "SUPPORT_COORDINATION",
        currentStatus: "SUBMITTED",
        rowVersion: 1,
        updatedAt: "2026-08-24T01:02:03.456Z",
      },
    ]);
    expect(client.rpc).toHaveBeenCalledWith(
      PORTAL_REFERRAL_SUPABASE_RPC_NAMES.assignmentQueue,
      { p_limit: 50, p_before_updated_at: null, p_before_id: null },
    );
  });

  it.each([
    { ...assignmentQueueEnvelope(), contact: CONTACT },
    {
      items: [
        { ...assignmentQueueItem(), source_organization_name: " Source " },
      ],
    },
    { items: [{ ...assignmentQueueItem(), current_status: "ACCEPTED" }] },
    { items: [assignmentQueueItem(), assignmentQueueItem()] },
    { items: Array.from({ length: 51 }, assignmentQueueItem) },
  ])("rejects an unsafe assignment queue envelope %#", async (data) => {
    const api = createSupabasePortalReferralApi(
      rpcClient(rpcSuccess(data)),
      assignmentAuthorization("PLATFORM", "platform_admin"),
    );
    await expect(api.listAssignmentReferrals()).rejects.toMatchObject({
      code: "ADAPTER_UNAVAILABLE",
    });
  });

  it("returns exact assignment detail and binds the requested referral id", async () => {
    const client = rpcClient(rpcSuccess(assignmentDetailEnvelope()));
    const api = createSupabasePortalReferralApi(
      client,
      assignmentAuthorization(
        "REFERRAL_SOURCE",
        "partner_operator",
        IDS.sourceOrganization,
      ),
    );

    await expect(api.getAssignmentReferral(IDS.referral)).resolves.toEqual({
      referralId: IDS.referral,
      sourceOrganizationId: IDS.sourceOrganization,
      sourceOrganizationName: "Source Organisation",
      summary: "Adult participant needs community participation support",
      region: "VIC_MELBOURNE",
      serviceType: "SUPPORT_COORDINATION",
      currentStatus: "SUBMITTED",
      rowVersion: 1,
      contact: CONTACT,
      activeOffer: null,
      createdAt: "2026-08-24T00:00:00.000Z",
      updatedAt: "2026-08-24T01:02:03.456Z",
    });
    expect(client.rpc).toHaveBeenCalledWith(
      PORTAL_REFERRAL_SUPABASE_RPC_NAMES.assignmentDetail,
      { p_referral_id: IDS.referral },
    );
  });

  it("maps the one active OFFERED match without exposing its DB status field", async () => {
    const api = createSupabasePortalReferralApi(
      rpcClient(
        rpcSuccess({
          ...assignmentDetailEnvelope(),
          current_status: "OFFERED",
          row_version: 3,
          active_offer: assignmentActiveOfferEnvelope(),
        }),
      ),
      assignmentAuthorization("PLATFORM", "platform_admin"),
    );

    const detail = await api.getAssignmentReferral(IDS.referral);
    expect(detail.activeOffer).toEqual({
      matchId: IDS.match,
      providerId: IDS.provider,
      displayName: "Provider One",
      offeredAt: "2026-08-24T00:30:00.000Z",
    });
    expect(detail.activeOffer).not.toHaveProperty("matchStatus");
  });

  it("rejects cross-tenant queue and detail projections for a partner operator", async () => {
    const authorization = assignmentAuthorization(
      "REFERRAL_SOURCE",
      "partner_operator",
    );
    const queueApi = createSupabasePortalReferralApi(
      rpcClient(rpcSuccess(assignmentQueueEnvelope())),
      authorization,
    );
    const detailApi = createSupabasePortalReferralApi(
      rpcClient(rpcSuccess(assignmentDetailEnvelope())),
      authorization,
    );

    await expect(queueApi.listAssignmentReferrals()).rejects.toMatchObject({
      code: "ADAPTER_UNAVAILABLE",
    });
    await expect(
      detailApi.getAssignmentReferral(IDS.referral),
    ).rejects.toMatchObject({ code: "ADAPTER_UNAVAILABLE" });
  });

  it.each([
    { ...assignmentDetailEnvelope(), referral_id: IDS.match },
    { ...assignmentDetailEnvelope(), current_status: "ACCEPTED" },
    {
      ...assignmentDetailEnvelope(),
      current_status: "OFFERED",
      active_offer: null,
    },
    {
      ...assignmentDetailEnvelope(),
      active_offer: assignmentActiveOfferEnvelope(),
    },
    {
      ...assignmentDetailEnvelope(),
      current_status: "OFFERED",
      active_offer: {
        ...assignmentActiveOfferEnvelope(),
        match_status: "ACCEPTED",
      },
    },
  ])("rejects an unsafe assignment detail envelope %#", async (data) => {
    const api = createSupabasePortalReferralApi(
      rpcClient(rpcSuccess(data)),
      assignmentAuthorization("PLATFORM", "platform_admin"),
    );
    await expect(api.getAssignmentReferral(IDS.referral)).rejects.toMatchObject({
      code: "ADAPTER_UNAVAILABLE",
    });
  });

  it("strictly projects at most 50 unique provider candidates", async () => {
    const client = rpcClient(rpcSuccess(providerCandidatesEnvelope()));
    const api = createSupabasePortalReferralApi(
      client,
      assignmentAuthorization("PLATFORM", "platform_admin"),
    );

    await expect(api.listProviderCandidates(IDS.referral)).resolves.toEqual([
      { providerId: IDS.provider, displayName: "Provider One" },
    ]);
    expect(client.rpc).toHaveBeenCalledWith(
      PORTAL_REFERRAL_SUPABASE_RPC_NAMES.assignmentCandidates,
      { p_referral_id: IDS.referral, p_limit: 50 },
    );

    for (const data of [
      { items: [{ ...providerCandidateEnvelope(), score: 99 }] },
      { items: [providerCandidateEnvelope(), providerCandidateEnvelope()] },
      { items: Array.from({ length: 51 }, providerCandidateEnvelope) },
    ]) {
      const unsafeApi = createSupabasePortalReferralApi(
        rpcClient(rpcSuccess(data)),
        assignmentAuthorization("PLATFORM", "platform_admin"),
      );
      await expect(
        unsafeApi.listProviderCandidates(IDS.referral),
      ).rejects.toMatchObject({ code: "ADAPTER_UNAVAILABLE" });
    }
  });

  it("hashes the canonical triage payload and strictly binds its ACK", async () => {
    const client = rpcClient(
      rpcSuccess(assignmentMutationEnvelope("TRIAGED", null, 2)),
    );
    const authorization = assignmentAuthorization("PLATFORM", "platform_admin");
    const api = createSupabasePortalReferralApi(client, authorization);

    await expect(
      api.triageReferral(IDS.referral, 1, {
        mutationId: MUTATION_ID,
        correlationId: CORRELATION_ID,
      }),
    ).resolves.toMatchObject({
      referralId: IDS.referral,
      matchId: null,
      currentStatus: "TRIAGED",
      rowVersion: 2,
    });
    expect(client.rpc).toHaveBeenCalledWith(
      PORTAL_REFERRAL_SUPABASE_RPC_NAMES.assignmentTriage,
      {
        p_referral_id: IDS.referral,
        p_expected_version: 1,
        p_mutation_id_hash: sha256(MUTATION_ID),
        p_payload_hash: createPortalReferralMutationPayloadHash({
          actor: {
            organizationId: IDS.organization,
            role: "platform_admin",
            providerId: null,
          },
          kind: "TRIAGE_REFERRAL",
          command: { referralId: IDS.referral, expectedVersion: 1 },
        }),
        p_correlation_id_hash: sha256(CORRELATION_ID),
      },
    );
  });

  it("hashes the canonical offer payload and strictly binds its ACK", async () => {
    const client = rpcClient(
      rpcSuccess(assignmentMutationEnvelope("OFFERED", IDS.match, 3)),
    );
    const api = createSupabasePortalReferralApi(
      client,
      assignmentAuthorization("REFERRAL_SOURCE", "partner_operator"),
    );

    await expect(
      api.offerReferral(
        IDS.referral,
        { providerId: IDS.provider, expectedVersion: 2 },
        { mutationId: MUTATION_ID, correlationId: CORRELATION_ID },
      ),
    ).resolves.toMatchObject({
      referralId: IDS.referral,
      matchId: IDS.match,
      currentStatus: "OFFERED",
      rowVersion: 3,
    });
    expect(client.rpc).toHaveBeenCalledWith(
      PORTAL_REFERRAL_SUPABASE_RPC_NAMES.assignmentOffer,
      {
        p_referral_id: IDS.referral,
        p_provider_id: IDS.provider,
        p_expected_version: 2,
        p_mutation_id_hash: sha256(MUTATION_ID),
        p_payload_hash: createPortalReferralMutationPayloadHash({
          actor: {
            organizationId: IDS.organization,
            role: "partner_operator",
            providerId: null,
          },
          kind: "OFFER_REFERRAL",
          command: {
            referralId: IDS.referral,
            providerId: IDS.provider,
            expectedVersion: 2,
          },
        }),
        p_correlation_id_hash: sha256(CORRELATION_ID),
      },
    );
  });

  it.each([
    assignmentMutationEnvelope("TRIAGED", IDS.match, 2),
    assignmentMutationEnvelope("OFFERED", null, 2),
    assignmentMutationEnvelope("TRIAGED", null, 3),
    {
      ...assignmentMutationEnvelope("TRIAGED", null, 2),
      referral_id: IDS.match,
    },
    { ...assignmentMutationEnvelope("TRIAGED", null, 2), private: CONTACT },
  ])("rejects an unbound assignment mutation ACK %#", async (data) => {
    const api = createSupabasePortalReferralApi(
      rpcClient(rpcSuccess(data)),
      assignmentAuthorization("PLATFORM", "platform_admin"),
    );
    await expect(
      api.triageReferral(IDS.referral, 1, {
        mutationId: MUTATION_ID,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toMatchObject({ code: "ADAPTER_UNAVAILABLE" });
  });

  it("lists only bounded provider-owned offer metadata in match-id order", async () => {
    const client = rpcClient(rpcSuccess(providerOffersEnvelope()));
    const api = createSupabasePortalReferralApi(
      client,
      providerAuthorization(),
    );

    await expect(api.listMyOffers()).resolves.toEqual([
      {
        matchId: IDS.match,
        referralId: IDS.referral,
        region: "VIC_MELBOURNE",
        serviceType: "SUPPORT_COORDINATION",
        matchStatus: "OFFERED",
        currentStatus: "OFFERED",
        rowVersion: 3,
      },
    ]);
    expect(client.rpc).toHaveBeenCalledWith(
      PORTAL_REFERRAL_SUPABASE_RPC_NAMES.providerResponseOffers,
      { p_limit: 50, p_after_match_id: null },
    );
  });

  it.each([
    "ACCEPTED",
    "IN_PROGRESS",
    "NOTE_LINKED",
    "EXPORTED",
    "COMPLETED",
    "CLOSED",
  ] as const)(
    "accepts an accepted provider offer with downstream %s referral status",
    async (currentStatus) => {
    const api = createSupabasePortalReferralApi(
      rpcClient(
        rpcSuccess({
          items: [
            providerOfferItem({
              match_status: "ACCEPTED",
              current_status: currentStatus,
              row_version: 5,
            }),
          ],
        }),
      ),
      providerAuthorization(),
    );

    await expect(api.listMyOffers()).resolves.toMatchObject([
      { matchStatus: "ACCEPTED", currentStatus, rowVersion: 5 },
    ]);
    },
  );

  it.each([
    { ...providerOffersEnvelope(), contact: CONTACT },
    { items: [{ ...providerOfferItem(), summary: "private summary" }] },
    { items: [{ ...providerOfferItem(), match_status: "DECLINED" }] },
    { items: [{ ...providerOfferItem(), current_status: "TRIAGED" }] },
    {
      items: [
        providerOfferItem({
          match_status: "ACCEPTED",
          current_status: "OFFERED",
        }),
      ],
    },
    { items: [providerOfferItem(), providerOfferItem()] },
    {
      items: [
        providerOfferItem({
          match_id: IDS.otherMatch,
          referral_id: IDS.otherReferral,
        }),
        providerOfferItem(),
      ],
    },
    { items: Array.from({ length: 51 }, () => providerOfferItem()) },
  ])("rejects an unsafe provider offers envelope %#", async (data) => {
    const api = createSupabasePortalReferralApi(
      rpcClient(rpcSuccess(data)),
      providerAuthorization(),
    );
    await expect(api.listMyOffers()).rejects.toMatchObject({
      code: "ADAPTER_UNAVAILABLE",
    });
  });

  it.each([
    ["ACCEPT", "ACCEPTED"],
    ["DECLINE", "TRIAGED"],
  ] as const)(
    "hashes the canonical provider %s response and strictly binds its ACK",
    async (decision, currentStatus) => {
      const client = rpcClient(
        rpcSuccess(providerResponseMutationEnvelope(currentStatus, 4)),
      );
      const api = createSupabasePortalReferralApi(
        client,
        providerAuthorization(),
      );

      await expect(
        api.respondToOffer(
          IDS.match,
          { decision, expectedVersion: 3 },
          { mutationId: MUTATION_ID, correlationId: CORRELATION_ID },
        ),
      ).resolves.toEqual({
        referralId: IDS.referral,
        matchId: IDS.match,
        currentStatus,
        rowVersion: 4,
        updatedAt: "2026-08-24T01:02:03.456Z",
      });
      expect(client.rpc).toHaveBeenCalledWith(
        PORTAL_REFERRAL_SUPABASE_RPC_NAMES.providerResponseRespond,
        {
          p_match_id: IDS.match,
          p_expected_version: 3,
          p_decision: decision,
          p_mutation_id_hash: sha256(MUTATION_ID),
          p_payload_hash: createPortalReferralMutationPayloadHash({
            actor: {
              organizationId: IDS.organization,
              role: "provider_member",
              providerId: IDS.provider,
            },
            kind: "RESPOND_TO_OFFER",
            command: {
              matchId: IDS.match,
              expectedVersion: 3,
              decision,
            },
          }),
          p_correlation_id_hash: sha256(CORRELATION_ID),
        },
      );
    },
  );

  it.each([
    providerResponseMutationEnvelope("OFFERED", 4),
    providerResponseMutationEnvelope("ACCEPTED", 3),
    { ...providerResponseMutationEnvelope("ACCEPTED", 4), match_id: IDS.otherMatch },
    { ...providerResponseMutationEnvelope("ACCEPTED", 4), private: CONTACT },
  ])("rejects an unbound provider response ACK %#", async (data) => {
    const api = createSupabasePortalReferralApi(
      rpcClient(rpcSuccess(data)),
      providerAuthorization(),
    );
    await expect(
      api.respondToOffer(
        IDS.match,
        { decision: "ACCEPT", expectedVersion: 3 },
        { mutationId: MUTATION_ID, correlationId: CORRELATION_ID },
      ),
    ).rejects.toMatchObject({ code: "ADAPTER_UNAVAILABLE" });
  });

  it.each([
    ["not-a-match", { decision: "ACCEPT", expectedVersion: 3 }],
    [IDS.match, { decision: "RETRY", expectedVersion: 3 }],
    [IDS.match, { decision: "ACCEPT", expectedVersion: 0 }],
    [IDS.match, { decision: "ACCEPT", expectedVersion: 3, actor: IDS.user }],
  ])("rejects an unsafe provider response command %# before RPC", async (matchId, command) => {
    const client = rpcClient(
      rpcSuccess(providerResponseMutationEnvelope("ACCEPTED", 4)),
    );
    const api = createSupabasePortalReferralApi(client, providerAuthorization());
    await expect(
      api.respondToOffer(
        matchId,
        command as never,
        { mutationId: MUTATION_ID, correlationId: CORRELATION_ID },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("lists only exact metadata fields using a fixed bounded cursor", async () => {
    const client = rpcClient(rpcSuccess(listEnvelope()));
    const api = createSupabasePortalReferralApi(client, authorization());

    await expect(api.listReferrals()).resolves.toEqual([
      {
        referralId: IDS.referral,
        region: "VIC_MELBOURNE",
        serviceType: "SUPPORT_COORDINATION",
        currentStatus: "SUBMITTED",
        rowVersion: 1,
        updatedAt: "2026-08-24T01:02:03.456Z",
      },
    ]);
    expect(client.rpc).toHaveBeenCalledWith(
      PORTAL_REFERRAL_SUPABASE_RPC_NAMES.list,
      {
        p_limit: 50,
        p_before_updated_at: null,
        p_before_id: null,
      },
    );
  });

  it.each([
    { ...listEnvelope(), private_contact: CONTACT },
    { items: [{ ...listItem(), summary: "private summary" }] },
    { items: [omit(listItem(), "updated_at")] },
    { items: [{ ...listItem(), referral_id: IDS.referral.toUpperCase() }] },
    { items: [{ ...listItem(), region: "VIC_UNKNOWN" }] },
    { items: [{ ...listItem(), service_type: "FREE_TEXT" }] },
    { items: [{ ...listItem(), current_status: "UNKNOWN" }] },
    { items: [{ ...listItem(), row_version: Number.MAX_SAFE_INTEGER + 1 }] },
    { items: [{ ...listItem(), row_version: 0 }] },
    { items: [{ ...listItem(), updated_at: "2026-02-31T00:00:00Z" }] },
    { items: [{ ...listItem(), updated_at: CONTACT.email }] },
    { items: [listItem(), listItem()] },
  ])("rejects unsafe list envelope %#", async (data) => {
    const api = createSupabasePortalReferralApi(
      rpcClient(rpcSuccess(data)),
      authorization(),
    );
    await expect(api.listReferrals()).rejects.toThrow(
      "Portal referral adapter is unavailable",
    );
  });

  it("returns only the exact referral-source detail projection", async () => {
    const client = rpcClient(rpcSuccess(sourceDetailEnvelope()));
    const api = createSupabasePortalReferralApi(client, authorization());
    const expected = {
      referralId: IDS.referral,
      summary: "Adult participant needs community participation support",
      region: "VIC_MELBOURNE",
      serviceType: "SUPPORT_COORDINATION",
      currentStatus: "SUBMITTED",
      rowVersion: 1,
      contact: CONTACT,
      createdAt: "2026-08-24T00:00:00.000Z",
      updatedAt: "2026-08-24T01:02:03.456Z",
    } satisfies PortalReferralSourceDetail;

    await expect(api.getReferral(IDS.referral)).resolves.toEqual(expected);
    expect(client.rpc).toHaveBeenCalledWith(
      PORTAL_REFERRAL_SUPABASE_RPC_NAMES.sourceDetail,
      { p_referral_id: IDS.referral },
    );
  });

  it("accepts an explicit null contact email without relaxing the contact shape", async () => {
    const data = sourceDetailEnvelope();
    const client = rpcClient(
      rpcSuccess({ ...data, contact: { ...data.contact, email: null } }),
    );
    const api = createSupabasePortalReferralApi(client, authorization());

    await expect(api.getReferral(IDS.referral)).resolves.toMatchObject({
      contact: { name: CONTACT.name, phone: CONTACT.phone, email: null },
    });
  });

  it("fails closed when source detail returns a different referral id", async () => {
    const otherReferralId = "b0000000-0000-4000-8000-000000000002";
    const client = rpcClient(
      rpcSuccess({ ...sourceDetailEnvelope(), referral_id: otherReferralId }),
    );
    const api = createSupabasePortalReferralApi(client, authorization());

    await expect(api.getReferral(IDS.referral)).rejects.toMatchObject({
      code: "ADAPTER_UNAVAILABLE",
    });
    expect(client.rpc).toHaveBeenCalledWith(
      PORTAL_REFERRAL_SUPABASE_RPC_NAMES.sourceDetail,
      { p_referral_id: IDS.referral },
    );
  });

  it.each([
    { ...sourceDetailEnvelope(), extra: "private" },
    omit(sourceDetailEnvelope(), "updated_at"),
    { ...sourceDetailEnvelope(), referral_id: IDS.referral.toUpperCase() },
    { ...sourceDetailEnvelope(), summary: "" },
    { ...sourceDetailEnvelope(), summary: " private summary " },
    { ...sourceDetailEnvelope(), region: "VIC_UNKNOWN" },
    { ...sourceDetailEnvelope(), service_type: "FREE_TEXT" },
    { ...sourceDetailEnvelope(), current_status: "UNKNOWN" },
    { ...sourceDetailEnvelope(), row_version: 0 },
    { ...sourceDetailEnvelope(), created_at: "2026-02-31T00:00:00Z" },
    {
      ...sourceDetailEnvelope(),
      created_at: "2026-08-25T00:00:00Z",
      updated_at: "2026-08-24T00:00:00Z",
    },
    { ...sourceDetailEnvelope(), contact: null },
    {
      ...sourceDetailEnvelope(),
      contact: { ...CONTACT, private_note: "private" },
    },
    { ...sourceDetailEnvelope(), contact: omit(CONTACT, "email") },
    { ...sourceDetailEnvelope(), contact: { ...CONTACT, name: null } },
    { ...sourceDetailEnvelope(), contact: { ...CONTACT, phone: "" } },
    { ...sourceDetailEnvelope(), contact: { ...CONTACT, email: 123 } },
  ])("rejects unsafe source-detail envelope %#", async (data) => {
    const api = createSupabasePortalReferralApi(
      rpcClient(rpcSuccess(data)),
      authorization(),
    );
    await expect(api.getReferral(IDS.referral)).rejects.toMatchObject({
      code: "ADAPTER_UNAVAILABLE",
    });
  });

  it("rejects a non-canonical referral id before the detail RPC", async () => {
    const client = rpcClient(rpcSuccess(sourceDetailEnvelope()));
    const api = createSupabasePortalReferralApi(client, authorization());

    await expect(api.getReferral("not-a-referral-id")).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("maps PORTAL_NOT_FOUND from source detail to the public workflow code", async () => {
    const client = rpcClient({
      data: null,
      error: {
        code: "P0001",
        message: "PORTAL_NOT_FOUND",
        details: CONTACT.phone,
      },
      status: 400,
    });
    const api = createSupabasePortalReferralApi(client, authorization());

    const error = await captureError(() => api.getReferral(IDS.referral));
    expect(error).toBeInstanceOf(PortalReferralWorkflowError);
    expect((error as PortalReferralWorkflowError).code).toBe("NOT_FOUND");
    expect(String(error)).not.toContain(CONTACT.phone);
    expect(client.rpc).toHaveBeenCalledWith(
      PORTAL_REFERRAL_SUPABASE_RPC_NAMES.sourceDetail,
      { p_referral_id: IDS.referral },
    );
  });

  it("hashes private transport ids and returns a metadata-only create ack", async () => {
    const client = rpcClient(rpcSuccess(createEnvelope()));
    const api = createSupabasePortalReferralApi(client, authorization());
    const command = {
      summary: "  Adult participant needs community participation support  ",
      region: "VIC_GEELONG",
      serviceType: "COMMUNITY_PARTICIPATION",
      contact: {
        name: `  ${CONTACT.name}  `,
        phone: `  ${CONTACT.phone}  `,
        email: `  ${CONTACT.email}  `,
      },
    } as const;

    const response = await api.createReferral(command, {
      mutationId: MUTATION_ID,
      correlationId: CORRELATION_ID,
    });
    expect(response).toEqual({
      referralId: IDS.referral,
      matchId: null,
      currentStatus: "SUBMITTED",
      rowVersion: 1,
      updatedAt: "2026-08-24T01:02:03.456Z",
    });
    expect(JSON.stringify(response)).not.toContain(CONTACT.name);
    expect(JSON.stringify(response)).not.toContain(CONTACT.phone);
    expect(JSON.stringify(response)).not.toContain(CONTACT.email);
    expect(JSON.stringify(response)).not.toContain(MUTATION_ID);
    expect(JSON.stringify(response)).not.toContain(CORRELATION_ID);

    const [, args] = vi.mocked(client.rpc).mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(Object.keys(args).sort()).toEqual(
      [
        "p_contact_email",
        "p_contact_name",
        "p_contact_phone",
        "p_correlation_id_hash",
        "p_mutation_id_hash",
        "p_payload_hash",
        "p_region",
        "p_service_type",
        "p_summary",
      ].sort(),
    );
    expect(args).toMatchObject({
      p_summary: "Adult participant needs community participation support",
      p_region: "VIC_GEELONG",
      p_service_type: "COMMUNITY_PARTICIPATION",
      p_contact_name: CONTACT.name,
      p_contact_phone: CONTACT.phone,
      p_contact_email: CONTACT.email,
      p_mutation_id_hash: sha256(MUTATION_ID),
      p_correlation_id_hash: sha256(CORRELATION_ID),
      p_payload_hash: createPortalReferralMutationPayloadHash({
        actor: {
          organizationId: IDS.organization,
          role: "referral_source",
          providerId: null,
        },
        kind: "CREATE_REFERRAL",
        command: {
          summary: "Adult participant needs community participation support",
          region: "VIC_GEELONG",
          serviceType: "COMMUNITY_PARTICIPATION",
          contact: CONTACT,
        },
      }),
    });
    expect(JSON.stringify(args)).not.toContain(MUTATION_ID);
    expect(JSON.stringify(args)).not.toContain(CORRELATION_ID);
  });

  it.each([
    {
      ...createCommand(),
      actor: { organizationId: IDS.organization, role: "referral_source" },
    },
    omit(createCommand(), "contact"),
    { ...createCommand(), contact: omit(CONTACT, "email") },
    { ...createCommand(), region: "VIC_UNKNOWN" },
    { ...createCommand(), serviceType: "FREE_TEXT" },
    { ...createCommand(), summary: `Please call ${CONTACT.phone}` },
    { ...createCommand(), summary: `Please email ${CONTACT.email}` },
    { ...createCommand(), summary: `Please contact ${CONTACT.name}` },
    {
      ...createCommand(),
      summary: "Annual support review",
      contact: { ...CONTACT, name: "Ann" },
    },
  ])("rejects untrusted create command %# before RPC", async (command) => {
    const client = rpcClient(rpcSuccess(createEnvelope()));
    const api = createSupabasePortalReferralApi(client, authorization());
    await expect(
      api.createReferral(command as ReturnType<typeof createCommand>, {
        mutationId: MUTATION_ID,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { ...createEnvelope(), contact_phone: CONTACT.phone },
    omit(createEnvelope(), "match_id"),
    { ...createEnvelope(), referral_id: IDS.referral.toUpperCase() },
    { ...createEnvelope(), match_id: IDS.referral },
    { ...createEnvelope(), current_status: "TRIAGED" },
    { ...createEnvelope(), row_version: 2 },
    { ...createEnvelope(), updated_at: "not-a-time" },
  ])("rejects unsafe create envelope %#", async (data) => {
    const api = createSupabasePortalReferralApi(
      rpcClient(rpcSuccess(data)),
      authorization(),
    );
    await expect(
      api.createReferral(createCommand(), {
        mutationId: MUTATION_ID,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow("Portal referral adapter is unavailable");
  });

  it.each([
    ["PORTAL_AUTH_REQUIRED", "AUTH_REQUIRED"],
    ["PORTAL_SESSION_REVOKED", "SESSION_REVOKED"],
    ["PORTAL_CAPABILITY_DISABLED", "CAPABILITY_DISABLED"],
    ["PORTAL_FORBIDDEN", "FORBIDDEN"],
    ["PORTAL_NOT_FOUND", "NOT_FOUND"],
    ["PORTAL_VALIDATION_ERROR", "VALIDATION_ERROR"],
    ["PORTAL_IDEMPOTENCY_CONFLICT", "IDEMPOTENCY_CONFLICT"],
    ["PORTAL_STALE_REFERRAL", "STALE_REFERRAL"],
    ["PORTAL_INVALID_STATE_TRANSITION", "INVALID_STATE_TRANSITION"],
  ] as const)("maps allowlisted workflow error %s", async (message, code) => {
    const api = createSupabasePortalReferralApi(
      rpcClient({
        data: { private_contact: CONTACT },
        error: { code: "P0001", message, details: CONTACT.phone },
        status: 400,
      }),
      authorization(),
    );
    const error = await captureError(() => api.listReferrals());
    expect(error).toBeInstanceOf(PortalReferralWorkflowError);
    expect((error as PortalReferralWorkflowError).code).toBe(code);
    expect(JSON.stringify(error)).not.toContain(CONTACT.phone);
  });

  it.each([
    ["42501", 401, "SESSION_REVOKED"],
    ["PGRST301", 401, "SESSION_REVOKED"],
    ["42501", 403, "ADAPTER_UNAVAILABLE"],
  ] as const)(
    "maps post-authorize error %s with HTTP status %s",
    async (databaseCode, status, code) => {
      const api = createSupabasePortalReferralApi(
        rpcClient({
          data: null,
          error: { code: databaseCode, message: CONTACT.email },
          status,
        }),
        authorization(),
      );
      const error = await captureError(() => api.listReferrals());
      expect(error).toBeInstanceOf(PortalReferralWorkflowError);
      expect((error as PortalReferralWorkflowError).code).toBe(code);
      expect(JSON.stringify(error)).not.toContain(CONTACT.email);
    },
  );

  it("fails closed with a typed unavailable error when an RPC result omits status", async () => {
    const client = unsafeRpcClient({ data: listEnvelope(), error: null });
    const api = createSupabasePortalReferralApi(client, authorization());

    const error = await captureError(() => api.listReferrals());
    expect(error).toBeInstanceOf(PortalReferralWorkflowError);
    expect((error as PortalReferralWorkflowError).code).toBe(
      "ADAPTER_UNAVAILABLE",
    );
  });

  it.each([401, 500])(
    "rejects successful data paired with HTTP status %s",
    async (status) => {
      const client = unsafeRpcClient({
        data: authorizationEnvelope(),
        error: null,
        status,
      });

      await expect(
        authorizePortalReferralSupabaseClient(client, "INTAKE"),
      ).resolves.toEqual({ ok: false, reason: "adapter_unavailable" });
    },
  );

  it("does not reinterpret unknown database failures or expose their text", async () => {
    const api = createSupabasePortalReferralApi(
      rpcClient({
        data: null,
        error: {
          code: "XX000",
          message: CONTACT.email,
          details: CONTACT.phone,
        },
        status: 500,
      }),
      authorization(),
    );
    const error = await captureError(() => api.listReferrals());
    expect(error).toBeInstanceOf(PortalReferralWorkflowError);
    expect((error as PortalReferralWorkflowError).code).toBe(
      "ADAPTER_UNAVAILABLE",
    );
    expect(String(error)).not.toContain(CONTACT.email);
    expect(String(error)).not.toContain(CONTACT.phone);
  });
});

function authorizationEnvelope() {
  return {
    authorized: true,
    user_id: IDS.user,
    organization_id: IDS.organization,
    organization_type: "REFERRAL_SOURCE",
    organization_status: "ACTIVE",
    membership_role: "referral_source",
    membership_status: "ACTIVE",
  } as const;
}

function assignmentAuthorizationEnvelope(
  organizationType: "PLATFORM" | "REFERRAL_SOURCE",
  membershipRole: "platform_admin" | "partner_operator",
) {
  return {
    authorized: true,
    user_id: IDS.user,
    organization_id: IDS.organization,
    organization_type: organizationType,
    organization_status: "ACTIVE",
    membership_role: membershipRole,
    membership_status: "ACTIVE",
  } as const;
}

function assignmentAuthorization(
  organizationType: "PLATFORM" | "REFERRAL_SOURCE",
  membershipRole: "platform_admin" | "partner_operator",
  organizationId: string = IDS.organization,
): PortalReferralAuthorization {
  if (
    !(
      (organizationType === "PLATFORM" && membershipRole === "platform_admin") ||
      (organizationType === "REFERRAL_SOURCE" &&
        membershipRole === "partner_operator")
    )
  ) {
    throw new Error("invalid assignment authorization fixture");
  }
  return {
    userId: IDS.user,
    organizationId,
    organizationType,
    organizationStatus: "ACTIVE",
    membershipRole,
    membershipStatus: "ACTIVE",
  } as PortalReferralAuthorization;
}

function providerAuthorizationEnvelope() {
  return {
    authorized: true,
    user_id: IDS.user,
    organization_id: IDS.organization,
    organization_type: "PROVIDER",
    organization_status: "ACTIVE",
    membership_role: "provider_member",
    membership_status: "ACTIVE",
    provider_id: IDS.provider,
    provider_review_status: "APPROVED",
  } as const;
}

function providerAuthorization(): PortalReferralAuthorization {
  return {
    userId: IDS.user,
    organizationId: IDS.organization,
    organizationType: "PROVIDER",
    organizationStatus: "ACTIVE",
    membershipRole: "provider_member",
    membershipStatus: "ACTIVE",
    providerId: IDS.provider,
    providerReviewStatus: "APPROVED",
  };
}

function authorization(): PortalReferralAuthorization {
  return {
    userId: IDS.user,
    organizationId: IDS.organization,
    organizationType: "REFERRAL_SOURCE",
    organizationStatus: "ACTIVE",
    membershipRole: "referral_source",
    membershipStatus: "ACTIVE",
  };
}

function listItem() {
  return {
    referral_id: IDS.referral,
    region: "VIC_MELBOURNE",
    service_type: "SUPPORT_COORDINATION",
    current_status: "SUBMITTED",
    row_version: 1,
    updated_at: "2026-08-24T11:02:03.456+10:00",
  } as const;
}

function listEnvelope() {
  return { items: [listItem()] };
}

function assignmentQueueItem() {
  return {
    referral_id: IDS.referral,
    source_organization_id: IDS.sourceOrganization,
    source_organization_name: "Source Organisation",
    region: "VIC_MELBOURNE",
    service_type: "SUPPORT_COORDINATION",
    current_status: "SUBMITTED",
    row_version: 1,
    updated_at: "2026-08-24T11:02:03.456+10:00",
  } as const;
}

function assignmentQueueEnvelope() {
  return { items: [assignmentQueueItem()] };
}

function assignmentActiveOfferEnvelope() {
  return {
    match_id: IDS.match,
    provider_id: IDS.provider,
    provider_display_name: "Provider One",
    match_status: "OFFERED",
    offered_at: "2026-08-24T00:30:00.000Z",
  } as const;
}

function assignmentDetailEnvelope() {
  return {
    referral_id: IDS.referral,
    source_organization_id: IDS.sourceOrganization,
    source_organization_name: "Source Organisation",
    summary: "Adult participant needs community participation support",
    region: "VIC_MELBOURNE",
    service_type: "SUPPORT_COORDINATION",
    current_status: "SUBMITTED",
    row_version: 1,
    contact: CONTACT,
    active_offer: null,
    created_at: "2026-08-24T10:00:00.000+10:00",
    updated_at: "2026-08-24T11:02:03.456+10:00",
  } as const;
}

function providerCandidateEnvelope() {
  return { provider_id: IDS.provider, display_name: "Provider One" } as const;
}

function providerCandidatesEnvelope() {
  return { items: [providerCandidateEnvelope()] };
}

function providerOfferItem(
  overrides: Partial<{
    match_id: string;
    referral_id: string;
    region: string;
    service_type: string;
    match_status: string;
    current_status: string;
    row_version: number;
  }> = {},
) {
  return {
    match_id: IDS.match,
    referral_id: IDS.referral,
    region: "VIC_MELBOURNE",
    service_type: "SUPPORT_COORDINATION",
    match_status: "OFFERED",
    current_status: "OFFERED",
    row_version: 3,
    ...overrides,
  };
}

function providerOffersEnvelope() {
  return { items: [providerOfferItem()] };
}

function providerResponseMutationEnvelope(
  currentStatus: string,
  rowVersion: number,
) {
  return {
    referral_id: IDS.referral,
    match_id: IDS.match,
    current_status: currentStatus,
    row_version: rowVersion,
    updated_at: "2026-08-24T11:02:03.456+10:00",
  };
}

function assignmentMutationEnvelope(
  currentStatus: "TRIAGED" | "OFFERED",
  matchId: string | null,
  rowVersion: number,
) {
  return {
    referral_id: IDS.referral,
    match_id: matchId,
    current_status: currentStatus,
    row_version: rowVersion,
    updated_at: "2026-08-24T11:02:03.456+10:00",
  } as const;
}

function createEnvelope() {
  return {
    referral_id: IDS.referral,
    match_id: null,
    current_status: "SUBMITTED",
    row_version: 1,
    updated_at: "2026-08-24T11:02:03.456+10:00",
  } as const;
}

function sourceDetailEnvelope() {
  return {
    referral_id: IDS.referral,
    summary: "Adult participant needs community participation support",
    region: "VIC_MELBOURNE",
    service_type: "SUPPORT_COORDINATION",
    current_status: "SUBMITTED",
    row_version: 1,
    contact: CONTACT,
    created_at: "2026-08-24T10:00:00.000+10:00",
    updated_at: "2026-08-24T11:02:03.456+10:00",
  } as const;
}

function createCommand() {
  return {
    summary: "Adult participant needs community participation support",
    region: "VIC_MELBOURNE",
    serviceType: "SUPPORT_COORDINATION",
    contact: CONTACT,
  } as const;
}

function rpcSuccess(data: unknown): PortalReferralSupabaseRpcResult {
  return { data, error: null, status: 200 };
}

function rpcClient(
  ...results: PortalReferralSupabaseRpcResult[]
): PortalReferralSessionScopedSupabaseRpcClient & { rpc: ReturnType<typeof vi.fn> } {
  const queue = [...results];
  return {
    rpc: vi.fn(async () => queue.shift() ?? rpcSuccess(null)),
  };
}

function unsafeRpcClient(
  result: unknown,
): PortalReferralSessionScopedSupabaseRpcClient & {
  rpc: ReturnType<typeof vi.fn>;
} {
  return {
    rpc: vi.fn(async () => result),
  } as unknown as PortalReferralSessionScopedSupabaseRpcClient & {
    rpc: ReturnType<typeof vi.fn>;
  };
}

function omit<T extends Record<string, unknown>, K extends keyof T>(
  value: T,
  key: K,
): Omit<T, K> {
  const clone = { ...value };
  delete clone[key];
  return clone;
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function captureError(run: () => unknown) {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("Expected operation to fail");
}
