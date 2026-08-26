import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const supabaseServerMock = vi.hoisted(() => ({
  createCareslinkServerSupabaseClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./supabase-server", () => supabaseServerMock);

import {
  CARESLINK_PORTAL_REFERRAL_ASSIGNMENT_FLAG,
  CARESLINK_PORTAL_REFERRAL_FOLLOW_UP_FLAG,
  CARESLINK_PORTAL_REFERRAL_PROVIDER_RESPONSE_FLAG,
  CARESLINK_PORTAL_REFERRAL_SOURCE_DETAIL_FLAG,
  CARESLINK_PORTAL_REFERRAL_RUNTIME_IMPLEMENTATION_READY,
  createPortalReferralApiResolver,
  isPortalReferralAssignmentRuntimeEnabled,
  isPortalReferralBaseRuntimeEnabled,
  isPortalReferralFollowUpRuntimeEnabled,
  isPortalReferralOperationEnabled,
  isPortalReferralPreviewTargetAllowed,
  isPortalReferralProviderResponseRuntimeEnabled,
  isPortalReferralRuntimeEnabled,
  isPortalReferralSourceDetailRuntimeEnabled,
  resolveDefaultPortalReferralApi,
  type PortalReferralOperation,
  type PortalReferralRuntimeEnv,
} from "./portal-referral-runtime.server";
import * as portalReferralSupabase from "./portal-referral-supabase.server";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./v1/ndis-shadow-guard";

const PREVIEW_REF = "abcdefghijklmnop";

afterEach(() => {
  vi.restoreAllMocks();
});

function enabledPreviewEnv(
  overrides: Partial<PortalReferralRuntimeEnv> = {},
): PortalReferralRuntimeEnv {
  return {
    VERCEL_ENV: "preview",
    SUPABASE_URL: `https://${PREVIEW_REF}.supabase.co`,
    CARESLINK_PORTAL_REFERRAL_EXPECTED_SUPABASE_REF: PREVIEW_REF,
    CARESLINK_PORTAL_REFERRAL_API_ENABLED: "true",
    CARESLINK_PORTAL_REFERRAL_DURABLE_ADAPTER_ENABLED: "true",
    CARESLINK_PORTAL_REFERRAL_INTAKE_ENABLED: "true",
    CARESLINK_PORTAL_REFERRAL_SOURCE_DETAIL_ENABLED: "true",
    CARESLINK_PORTAL_REFERRAL_ASSIGNMENT_ENABLED: "true",
    CARESLINK_PORTAL_REFERRAL_PROVIDER_RESPONSE_ENABLED: "true",
    CARESLINK_PORTAL_REFERRAL_FOLLOW_UP_ENABLED: "true",
    SUPABASE_PUBLISHABLE_KEY: "preview-publishable-key",
    ...overrides,
  };
}

describe("Portal referral runtime latch", () => {
  it("marks the implementation compiled while all runtime gates remain explicit", () => {
    expect(CARESLINK_PORTAL_REFERRAL_RUNTIME_IMPLEMENTATION_READY).toBe(true);
    expect(CARESLINK_PORTAL_REFERRAL_SOURCE_DETAIL_FLAG).toBe(
      "CARESLINK_PORTAL_REFERRAL_SOURCE_DETAIL_ENABLED",
    );
    expect(CARESLINK_PORTAL_REFERRAL_ASSIGNMENT_FLAG).toBe(
      "CARESLINK_PORTAL_REFERRAL_ASSIGNMENT_ENABLED",
    );
    expect(CARESLINK_PORTAL_REFERRAL_PROVIDER_RESPONSE_FLAG).toBe(
      "CARESLINK_PORTAL_REFERRAL_PROVIDER_RESPONSE_ENABLED",
    );
    expect(CARESLINK_PORTAL_REFERRAL_FOLLOW_UP_FLAG).toBe(
      "CARESLINK_PORTAL_REFERRAL_FOLLOW_UP_ENABLED",
    );
    expect(isPortalReferralBaseRuntimeEnabled(enabledPreviewEnv())).toBe(true);
    expect(isPortalReferralRuntimeEnabled(enabledPreviewEnv())).toBe(true);
    expect(isPortalReferralSourceDetailRuntimeEnabled(enabledPreviewEnv())).toBe(
      true,
    );
    expect(isPortalReferralAssignmentRuntimeEnabled(enabledPreviewEnv())).toBe(
      false,
    );
    expect(
      isPortalReferralProviderResponseRuntimeEnabled(enabledPreviewEnv()),
    ).toBe(true);
    expect(isPortalReferralFollowUpRuntimeEnabled(enabledPreviewEnv())).toBe(true);
    expect(
      isPortalReferralOperationEnabled(
        "LIST_ASSIGNMENT_REFERRALS",
        enabledPreviewEnv(),
      ),
    ).toBe(true);
  });

  it("requires an exact non-Production Preview target", () => {
    expect(isPortalReferralPreviewTargetAllowed(enabledPreviewEnv())).toBe(true);
    expect(
      isPortalReferralPreviewTargetAllowed(
        enabledPreviewEnv({
          CARESLINK_PORTAL_REFERRAL_EXPECTED_SUPABASE_REF: "differentpreviewref",
        }),
      ),
    ).toBe(false);
    expect(
      isPortalReferralPreviewTargetAllowed(
        enabledPreviewEnv({ VERCEL_ENV: "production" }),
      ),
    ).toBe(false);
    expect(
      isPortalReferralPreviewTargetAllowed(
        enabledPreviewEnv({
          SUPABASE_URL: `https://${CARESLINK_PRODUCTION_SUPABASE_REF}.supabase.co`,
          CARESLINK_PORTAL_REFERRAL_EXPECTED_SUPABASE_REF:
            CARESLINK_PRODUCTION_SUPABASE_REF,
        }),
      ),
    ).toBe(false);
  });

  it("fails closed when either base runtime flag or target proof is absent", () => {
    for (const env of [
      enabledPreviewEnv({ CARESLINK_PORTAL_REFERRAL_API_ENABLED: "false" }),
      enabledPreviewEnv({
        CARESLINK_PORTAL_REFERRAL_DURABLE_ADAPTER_ENABLED: "false",
      }),
      enabledPreviewEnv({ VERCEL_ENV: "development" }),
      enabledPreviewEnv({ SUPABASE_URL: undefined }),
      enabledPreviewEnv({
        CARESLINK_PORTAL_REFERRAL_EXPECTED_SUPABASE_REF: undefined,
      }),
    ]) {
      expect(isPortalReferralBaseRuntimeEnabled(env)).toBe(false);
      expect(isPortalReferralAssignmentRuntimeEnabled(env)).toBe(false);
      expect(isPortalReferralProviderResponseRuntimeEnabled(env)).toBe(false);
    }
  });

  it("separates exact-true intake, source-detail, assignment, provider-response and follow-up gates", () => {
    const detailOnly = enabledPreviewEnv({
      CARESLINK_PORTAL_REFERRAL_INTAKE_ENABLED: "false",
    });
    expect(isPortalReferralBaseRuntimeEnabled(detailOnly)).toBe(true);
    expect(isPortalReferralRuntimeEnabled(detailOnly)).toBe(false);
    expect(isPortalReferralSourceDetailRuntimeEnabled(detailOnly)).toBe(true);
    expect(isPortalReferralOperationEnabled("GET_REFERRAL", detailOnly)).toBe(true);
    expect(isPortalReferralOperationEnabled("LIST_REFERRALS", detailOnly)).toBe(
      false,
    );
    expect(isPortalReferralOperationEnabled("CREATE_REFERRAL", detailOnly)).toBe(
      false,
    );

    const intakeOnly = enabledPreviewEnv({
      CARESLINK_PORTAL_REFERRAL_SOURCE_DETAIL_ENABLED: "false",
    });
    expect(isPortalReferralRuntimeEnabled(intakeOnly)).toBe(true);
    expect(isPortalReferralSourceDetailRuntimeEnabled(intakeOnly)).toBe(false);
    expect(isPortalReferralOperationEnabled("LIST_REFERRALS", intakeOnly)).toBe(
      true,
    );
    expect(isPortalReferralOperationEnabled("CREATE_REFERRAL", intakeOnly)).toBe(
      true,
    );
    expect(isPortalReferralOperationEnabled("GET_REFERRAL", intakeOnly)).toBe(
      false,
    );

    const wrongCase = enabledPreviewEnv({
      CARESLINK_PORTAL_REFERRAL_SOURCE_DETAIL_ENABLED: "TRUE",
    });
    expect(isPortalReferralOperationEnabled("GET_REFERRAL", wrongCase)).toBe(false);

    const assignmentOperations = [
      "LIST_ASSIGNMENT_REFERRALS",
      "GET_ASSIGNMENT_REFERRAL",
      "TRIAGE_REFERRAL",
      "LIST_PROVIDER_CANDIDATES",
      "OFFER_REFERRAL",
    ] satisfies PortalReferralOperation[];
    const assignmentOnly = enabledPreviewEnv({
      CARESLINK_PORTAL_REFERRAL_INTAKE_ENABLED: "false",
      CARESLINK_PORTAL_REFERRAL_SOURCE_DETAIL_ENABLED: "false",
    });
    expect(isPortalReferralAssignmentRuntimeEnabled(assignmentOnly)).toBe(true);
    expect(isPortalReferralRuntimeEnabled(assignmentOnly)).toBe(false);
    expect(isPortalReferralSourceDetailRuntimeEnabled(assignmentOnly)).toBe(false);
    for (const operation of assignmentOperations) {
      expect(isPortalReferralOperationEnabled(operation, assignmentOnly)).toBe(
        true,
      );
    }

    for (const sourceSurfaceConflict of [
      enabledPreviewEnv({
        CARESLINK_PORTAL_REFERRAL_INTAKE_ENABLED: "true",
        CARESLINK_PORTAL_REFERRAL_SOURCE_DETAIL_ENABLED: "false",
      }),
      enabledPreviewEnv({
        CARESLINK_PORTAL_REFERRAL_INTAKE_ENABLED: "false",
        CARESLINK_PORTAL_REFERRAL_SOURCE_DETAIL_ENABLED: "true",
      }),
      enabledPreviewEnv(),
    ]) {
      expect(
        isPortalReferralAssignmentRuntimeEnabled(sourceSurfaceConflict),
      ).toBe(false);
      for (const operation of assignmentOperations) {
        expect(
          isPortalReferralOperationEnabled(operation, sourceSurfaceConflict),
        ).toBe(true);
      }
    }

    for (const assignmentFlag of [undefined, "false", "TRUE", " true"]) {
      const assignmentOff = enabledPreviewEnv({
        CARESLINK_PORTAL_REFERRAL_ASSIGNMENT_ENABLED: assignmentFlag,
      });
      expect(isPortalReferralAssignmentRuntimeEnabled(assignmentOff)).toBe(false);
      expect(isPortalReferralRuntimeEnabled(assignmentOff)).toBe(true);
      expect(isPortalReferralSourceDetailRuntimeEnabled(assignmentOff)).toBe(true);
      for (const operation of assignmentOperations) {
        expect(isPortalReferralOperationEnabled(operation, assignmentOff)).toBe(
          false,
        );
      }
    }

    for (const operation of [
      "LIST_MY_OFFERS",
      "RESPOND_TO_OFFER",
    ] satisfies PortalReferralOperation[]) {
      expect(isPortalReferralOperationEnabled(operation, enabledPreviewEnv())).toBe(
        true,
      );
    }
    expect(
      isPortalReferralProviderResponseRuntimeEnabled(enabledPreviewEnv()),
    ).toBe(true);

    for (const providerResponseFlag of [undefined, "false", "TRUE", " true"]) {
      const providerResponseOff = enabledPreviewEnv({
        CARESLINK_PORTAL_REFERRAL_PROVIDER_RESPONSE_ENABLED:
          providerResponseFlag,
      });
      expect(
        isPortalReferralProviderResponseRuntimeEnabled(providerResponseOff),
      ).toBe(false);
      expect(
        isPortalReferralOperationEnabled("LIST_MY_OFFERS", providerResponseOff),
      ).toBe(false);
      expect(
        isPortalReferralOperationEnabled(
          "RESPOND_TO_OFFER",
          providerResponseOff,
        ),
      ).toBe(false);
    }

    for (const operation of [
      "GET_PROVIDER_FOLLOW_UP_REFERRAL",
      "RECORD_FOLLOW_UP",
    ] satisfies PortalReferralOperation[]) {
      expect(isPortalReferralOperationEnabled(operation, enabledPreviewEnv())).toBe(
        true,
      );
    }
    expect(isPortalReferralFollowUpRuntimeEnabled(enabledPreviewEnv())).toBe(true);

    for (const followUpFlag of [undefined, "false", "TRUE", " true"]) {
      const followUpOff = enabledPreviewEnv({
        CARESLINK_PORTAL_REFERRAL_FOLLOW_UP_ENABLED: followUpFlag,
      });
      expect(isPortalReferralFollowUpRuntimeEnabled(followUpOff)).toBe(false);
      expect(
        isPortalReferralOperationEnabled(
          "GET_PROVIDER_FOLLOW_UP_REFERRAL",
          followUpOff,
        ),
      ).toBe(false);
      expect(isPortalReferralOperationEnabled("RECORD_FOLLOW_UP", followUpOff)).toBe(
        false,
      );
    }

    for (const operation of ["LIST_AUDIT"] satisfies PortalReferralOperation[]) {
      expect(isPortalReferralOperationEnabled(operation, enabledPreviewEnv())).toBe(
        false,
      );
    }
  });

  it("returns disabled without inspecting request content", async () => {
    supabaseServerMock.createCareslinkServerSupabaseClient.mockReset();
    const text = () => {
      throw new Error("request body must stay opaque");
    };
    const request = {
      method: "POST",
      text,
    } as unknown as Request;

    await expect(
      resolveDefaultPortalReferralApi(request, "CREATE_REFERRAL"),
    ).resolves.toEqual({
      ok: false,
      reason: "capability_disabled",
      status: 503,
    });
    expect(supabaseServerMock.createCareslinkServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("rejects unopened operations before creating a client or reading a body", async () => {
    const createCookieRpcClient = vi.fn();
    const resolver = createPortalReferralApiResolver({
      env: enabledPreviewEnv({
        CARESLINK_PORTAL_REFERRAL_ASSIGNMENT_ENABLED: "false",
      }),
      createCookieRpcClient,
    });
    const bodyAccess = vi.fn(() => {
      throw new Error("body must stay opaque");
    });
    const request = new Request("https://preview.careslink.test/api/portal/x", {
      method: "POST",
    });
    Object.defineProperty(request, "body", { get: bodyAccess });

    await expect(resolver(request, "TRIAGE_REFERRAL")).resolves.toEqual({
      ok: false,
      reason: "capability_disabled",
      status: 503,
    });
    expect(createCookieRpcClient).not.toHaveBeenCalled();
    expect(bodyAccess).not.toHaveBeenCalled();
  });

  it.each([
    "LIST_ASSIGNMENT_REFERRALS",
    "GET_ASSIGNMENT_REFERRAL",
    "TRIAGE_REFERRAL",
    "LIST_PROVIDER_CANDIDATES",
    "OFFER_REFERRAL",
  ] as const)(
    "maps %s to the ASSIGNMENT authorization scope",
    async (operation) => {
      const client = { rpc: vi.fn() };
      const api = {};
      const authorization = {
        userId: "10000000-0000-4000-8000-000000000001",
        organizationId: "20000000-0000-4000-8000-000000000001",
        organizationType: "PLATFORM",
        organizationStatus: "ACTIVE",
        membershipRole: "platform_admin",
        membershipStatus: "ACTIVE",
      } as const;
      const authorize = vi
        .spyOn(portalReferralSupabase, "authorizePortalReferralSupabaseClient")
        .mockResolvedValue({ ok: true, authorization });
      const createApi = vi
        .spyOn(portalReferralSupabase, "createSupabasePortalReferralApi")
        .mockReturnValue(api as never);
      const resolver = createPortalReferralApiResolver({
        env: enabledPreviewEnv(),
        createCookieRpcClient: vi.fn(async () => client),
      });

      await expect(
        resolver(
          new Request(
            "https://preview.careslink.test/api/portal/referral-assignments",
          ),
          operation,
        ),
      ).resolves.toEqual({ ok: true, api });
      expect(authorize).toHaveBeenCalledWith(client, "ASSIGNMENT");
      expect(createApi).toHaveBeenCalledWith(client, authorization);
    },
  );

  it.each(["LIST_MY_OFFERS", "RESPOND_TO_OFFER"] as const)(
    "maps %s only to the PROVIDER_RESPONSE authorization scope",
    async (operation) => {
      const client = { rpc: vi.fn() };
      const api = {};
      const authorization = {
        userId: "10000000-0000-4000-8000-000000000001",
        organizationId: "20000000-0000-4000-8000-000000000001",
        organizationType: "PROVIDER",
        organizationStatus: "ACTIVE",
        membershipRole: "provider_member",
        membershipStatus: "ACTIVE",
        providerId: "30000000-0000-4000-8000-000000000001",
        providerReviewStatus: "APPROVED",
      } as const;
      const authorize = vi
        .spyOn(portalReferralSupabase, "authorizePortalReferralSupabaseClient")
        .mockResolvedValue({ ok: true, authorization });
      const createApi = vi
        .spyOn(portalReferralSupabase, "createSupabasePortalReferralApi")
        .mockReturnValue(api as never);
      const resolver = createPortalReferralApiResolver({
        env: enabledPreviewEnv(),
        createCookieRpcClient: vi.fn(async () => client),
      });

      await expect(
        resolver(
          new Request(
            "https://preview.careslink.test/api/portal/referral-offers",
          ),
          operation,
        ),
      ).resolves.toEqual({ ok: true, api });
      expect(authorize).toHaveBeenCalledWith(client, "PROVIDER_RESPONSE");
      expect(createApi).toHaveBeenCalledWith(client, authorization);
    },
  );

  it.each([
    "GET_PROVIDER_FOLLOW_UP_REFERRAL",
    "RECORD_FOLLOW_UP",
  ] as const)("maps %s only to the FOLLOW_UP authorization scope", async (operation) => {
    const client = { rpc: vi.fn() };
    const api = {};
    const authorization = {
      userId: "10000000-0000-4000-8000-000000000001",
      organizationId: "20000000-0000-4000-8000-000000000001",
      organizationType: "PROVIDER",
      organizationStatus: "ACTIVE",
      membershipRole: "provider_member",
      membershipStatus: "ACTIVE",
      providerId: "30000000-0000-4000-8000-000000000001",
      providerReviewStatus: "APPROVED",
    } as const;
    const authorize = vi
      .spyOn(portalReferralSupabase, "authorizePortalReferralSupabaseClient")
      .mockResolvedValue({ ok: true, authorization });
    const createApi = vi
      .spyOn(portalReferralSupabase, "createSupabasePortalReferralApi")
      .mockReturnValue(api as never);
    const resolver = createPortalReferralApiResolver({
      env: enabledPreviewEnv(),
      createCookieRpcClient: vi.fn(async () => client),
    });

    await expect(
      resolver(
        new Request(
          "https://preview.careslink.test/api/portal/referrals/id/follow-ups",
        ),
        operation,
      ),
    ).resolves.toEqual({ ok: true, api });
    expect(authorize).toHaveBeenCalledWith(client, "FOLLOW_UP");
    expect(createApi).toHaveBeenCalledWith(client, authorization);
  });

  it("uses the cookie client, authorizes first, then exposes only list/create", async () => {
    const env = enabledPreviewEnv({
      CARESLINK_PORTAL_REFERRAL_SOURCE_DETAIL_ENABLED: "false",
    });
    const calls: string[] = [];
    const rpc = vi.fn(async (name: string) => {
      calls.push(name);
      if (name === "portal_referral_intake_authorize") {
        return {
          data: {
            authorized: true,
            user_id: "10000000-0000-4000-8000-000000000001",
            organization_id: "20000000-0000-4000-8000-000000000001",
            organization_type: "REFERRAL_SOURCE",
            organization_status: "ACTIVE",
            membership_role: "referral_source",
            membership_status: "ACTIVE",
          },
          error: null,
          status: 200,
        };
      }
      return { data: { items: [] }, error: null, status: 200 };
    });
    supabaseServerMock.createCareslinkServerSupabaseClient.mockReset();
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue({ rpc });
    const resolver = createPortalReferralApiResolver({ env });
    const request = new Request(
      "https://preview.careslink.test/api/portal/referrals",
      { headers: { cookie: "sb-preview-auth-token=opaque" } },
    );

    const resolution = await resolver(request, "LIST_REFERRALS");
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) throw new Error("expected a resolved adapter");
    await expect(resolution.api.listReferrals()).resolves.toEqual([]);
    expect(calls).toEqual([
      "portal_referral_intake_authorize",
      "portal_referral_intake_list",
    ]);
    expect(rpc).not.toHaveBeenCalledWith(
      "portal_referral_source_detail_authorize",
    );
    expect(
      supabaseServerMock.createCareslinkServerSupabaseClient,
    ).toHaveBeenCalledWith({ env });
  });

  it("authorizes first, then exposes source detail independently from intake", async () => {
    const referralId = "b0000000-0000-4000-8000-000000000001";
    const calls: string[] = [];
    const rpc = vi.fn(async (name: string) => {
      calls.push(name);
      if (name === "portal_referral_source_detail_authorize") {
        return {
          data: {
            authorized: true,
            user_id: "10000000-0000-4000-8000-000000000001",
            organization_id: "20000000-0000-4000-8000-000000000001",
            organization_type: "REFERRAL_SOURCE",
            organization_status: "ACTIVE",
            membership_role: "referral_source",
            membership_status: "ACTIVE",
          },
          error: null,
          status: 200,
        };
      }
      return {
        data: {
          referral_id: referralId,
          summary: "Adult participant needs community participation support",
          region: "VIC_MELBOURNE",
          service_type: "SUPPORT_COORDINATION",
          current_status: "SUBMITTED",
          row_version: 1,
          contact: {
            name: "Private Contact",
            phone: "0400000099",
            email: null,
          },
          created_at: "2026-08-24T10:00:00.000+10:00",
          updated_at: "2026-08-24T11:02:03.456+10:00",
        },
        error: null,
        status: 200,
      };
    });
    const createCookieRpcClient = vi.fn(async () => ({ rpc }));
    const resolver = createPortalReferralApiResolver({
      env: enabledPreviewEnv({
        CARESLINK_PORTAL_REFERRAL_INTAKE_ENABLED: "false",
      }),
      createCookieRpcClient,
    });
    const resolution = await resolver(
      new Request(`https://preview.careslink.test/api/portal/referrals/${referralId}`, {
        headers: { cookie: "sb-preview-auth-token=opaque" },
      }),
      "GET_REFERRAL",
    );

    expect(resolution.ok).toBe(true);
    if (!resolution.ok) throw new Error("expected a resolved detail adapter");
    await expect(resolution.api.getReferral(referralId)).resolves.toMatchObject({
      referralId,
      currentStatus: "SUBMITTED",
      contact: { name: "Private Contact", phone: "0400000099", email: null },
    });
    expect(calls).toEqual([
      "portal_referral_source_detail_authorize",
      "portal_referral_source_detail",
    ]);
    expect(rpc).not.toHaveBeenCalledWith("portal_referral_intake_authorize");
  });

  it("keeps source detail disabled with zero client construction when its flag is off", async () => {
    const createCookieRpcClient = vi.fn();
    const resolver = createPortalReferralApiResolver({
      env: enabledPreviewEnv({
        CARESLINK_PORTAL_REFERRAL_SOURCE_DETAIL_ENABLED: "false",
      }),
      createCookieRpcClient,
    });

    await expect(
      resolver(
        new Request("https://preview.careslink.test/api/portal/referrals/id"),
        "GET_REFERRAL",
      ),
    ).resolves.toEqual({
      ok: false,
      reason: "capability_disabled",
      status: 503,
    });
    expect(createCookieRpcClient).not.toHaveBeenCalled();
  });

  it.each([
    "LIST_REFERRALS",
    "GET_REFERRAL",
    "LIST_ASSIGNMENT_REFERRALS",
    "LIST_MY_OFFERS",
    "GET_PROVIDER_FOLLOW_UP_REFERRAL",
  ] as const)(
    "does not accept a caller bearer for %s or construct any client for it",
    async (operation) => {
      const createCookieRpcClient = vi.fn();
      const resolver = createPortalReferralApiResolver({
        env: enabledPreviewEnv(),
        createCookieRpcClient,
      });
      const request = new Request(
        "https://preview.careslink.test/api/portal/referrals",
        { headers: { authorization: "Bearer private-token" } },
      );

      await expect(resolver(request, operation)).resolves.toEqual({
        ok: false,
        reason: "auth_required",
        status: 401,
      });
      expect(createCookieRpcClient).not.toHaveBeenCalled();
    },
  );

  it("creates a fresh cookie-authenticated client for every request", async () => {
    const clients: Array<{ rpc: ReturnType<typeof vi.fn> }> = [];
    const createCookieRpcClient = vi.fn(async () => {
      const client = {
        rpc: vi.fn(async () => ({
          data: {
            authorized: true,
            user_id: "10000000-0000-4000-8000-000000000001",
            organization_id: "20000000-0000-4000-8000-000000000001",
            organization_type: "REFERRAL_SOURCE",
            organization_status: "ACTIVE",
            membership_role: "referral_source",
            membership_status: "ACTIVE",
          },
          error: null,
          status: 200,
        })),
      };
      clients.push(client);
      return client;
    });
    const resolver = createPortalReferralApiResolver({
      env: enabledPreviewEnv(),
      createCookieRpcClient,
    });

    await Promise.all([
      resolver(
        new Request("https://preview.careslink.test/api/portal/referrals"),
        "LIST_REFERRALS",
      ),
      resolver(
        new Request("https://preview.careslink.test/api/portal/referrals"),
        "LIST_REFERRALS",
      ),
    ]);

    expect(createCookieRpcClient).toHaveBeenCalledTimes(2);
    expect(clients).toHaveLength(2);
    expect(clients[0]).not.toBe(clients[1]);
    expect(clients[0]?.rpc).toHaveBeenCalledOnce();
    expect(clients[1]?.rpc).toHaveBeenCalledOnce();
  });

  it.each([
    ["LIST_REFERRALS", "portal_referral_intake_authorize"],
    ["GET_REFERRAL", "portal_referral_source_detail_authorize"],
    ["TRIAGE_REFERRAL", "portal_referral_assignment_authorize"],
    [
      "LIST_MY_OFFERS",
      "portal_referral_provider_response_authorize",
    ],
    [
      "GET_PROVIDER_FOLLOW_UP_REFERRAL",
      "portal_referral_follow_up_authorize",
    ],
  ] as const)(
    "maps identical authorize results for %s before returning an API",
    async (operation, expectedRpcName) => {
      for (const [message, reason, status] of [
        ["PORTAL_AUTH_REQUIRED", "auth_required", 401],
        ["PORTAL_SESSION_REVOKED", "session_revoked", 401],
        ["PORTAL_FORBIDDEN", "forbidden", 403],
        ["PORTAL_CAPABILITY_DISABLED", "capability_disabled", 503],
        ["PRIVATE_DATABASE_ERROR", "adapter_unavailable", 503],
      ] as const) {
        const rpc = vi.fn(async () => ({
          data: null,
          error: { code: "P0001", message },
          status: 400,
        }));
        const resolver = createPortalReferralApiResolver({
          env: enabledPreviewEnv(),
          createCookieRpcClient: vi.fn(async () => ({ rpc })),
        });

        await expect(
          resolver(
            new Request("https://preview.careslink.test/api/portal/referrals"),
            operation,
          ),
        ).resolves.toEqual({ ok: false, reason, status });
        expect(rpc).toHaveBeenCalledWith(expectedRpcName);
      }
    },
  );

  it("does not register a memory or mock runtime fallback", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/portal-referral-runtime.server.ts"),
      "utf8",
    );

    expect(source).not.toContain("createMemoryPortalReferralWorkflow");
    expect(source).not.toContain("mock-data");
    expect(source).not.toContain("memory-contract-only");
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(source).not.toContain("createClient as createSupabaseClient");
    expect(source).toContain("createCareslinkServerSupabaseClient");
  });
});
