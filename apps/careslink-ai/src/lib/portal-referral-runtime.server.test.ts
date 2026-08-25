import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const supabaseServerMock = vi.hoisted(() => ({
  createCareslinkServerSupabaseClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./supabase-server", () => supabaseServerMock);

import {
  CARESLINK_PORTAL_REFERRAL_RUNTIME_IMPLEMENTATION_READY,
  createPortalReferralApiResolver,
  isPortalReferralPreviewTargetAllowed,
  isPortalReferralRuntimeEnabled,
  resolveDefaultPortalReferralApi,
  type PortalReferralRuntimeEnv,
} from "./portal-referral-runtime.server";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./v1/ndis-shadow-guard";

const PREVIEW_REF = "abcdefghijklmnop";

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
    SUPABASE_PUBLISHABLE_KEY: "preview-publishable-key",
    ...overrides,
  };
}

describe("Portal referral runtime latch", () => {
  it("marks the implementation compiled while all runtime gates remain explicit", () => {
    expect(CARESLINK_PORTAL_REFERRAL_RUNTIME_IMPLEMENTATION_READY).toBe(true);
    expect(isPortalReferralRuntimeEnabled(enabledPreviewEnv())).toBe(true);
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

  it("fails closed when either runtime flag or target proof is absent", () => {
    for (const env of [
      enabledPreviewEnv({ CARESLINK_PORTAL_REFERRAL_API_ENABLED: "false" }),
      enabledPreviewEnv({
        CARESLINK_PORTAL_REFERRAL_DURABLE_ADAPTER_ENABLED: "false",
      }),
      enabledPreviewEnv({ CARESLINK_PORTAL_REFERRAL_INTAKE_ENABLED: "false" }),
      enabledPreviewEnv({ VERCEL_ENV: "development" }),
      enabledPreviewEnv({ SUPABASE_URL: undefined }),
      enabledPreviewEnv({
        CARESLINK_PORTAL_REFERRAL_EXPECTED_SUPABASE_REF: undefined,
      }),
    ]) {
      expect(isPortalReferralRuntimeEnabled(env)).toBe(false);
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
      env: enabledPreviewEnv(),
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

  it("uses the cookie client, authorizes first, then exposes only list/create", async () => {
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
    const resolver = createPortalReferralApiResolver({ env: enabledPreviewEnv() });
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
    expect(
      supabaseServerMock.createCareslinkServerSupabaseClient,
    ).toHaveBeenCalledWith({ env: enabledPreviewEnv() });
  });

  it("does not accept a caller bearer or construct any client for it", async () => {
    const createCookieRpcClient = vi.fn();
    const resolver = createPortalReferralApiResolver({
      env: enabledPreviewEnv(),
      createCookieRpcClient,
    });
    const request = new Request(
      "https://preview.careslink.test/api/portal/referrals",
      { headers: { authorization: "Bearer private-token" } },
    );

    await expect(resolver(request, "LIST_REFERRALS")).resolves.toEqual({
      ok: false,
      reason: "auth_required",
      status: 401,
    });
    expect(createCookieRpcClient).not.toHaveBeenCalled();
  });

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
    ["PORTAL_AUTH_REQUIRED", "auth_required", 401],
    ["PORTAL_SESSION_REVOKED", "session_revoked", 401],
    ["PORTAL_FORBIDDEN", "forbidden", 403],
    ["PORTAL_CAPABILITY_DISABLED", "capability_disabled", 503],
    ["PRIVATE_DATABASE_ERROR", "adapter_unavailable", 503],
  ] as const)("maps authorize result %s before returning an API", async (message, reason, status) => {
    const createCookieRpcClient = vi.fn(async () => ({
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: "P0001", message },
        status: 400,
      })),
    }));
    const resolver = createPortalReferralApiResolver({
      env: enabledPreviewEnv(),
      createCookieRpcClient,
    });

    await expect(
      resolver(
        new Request("https://preview.careslink.test/api/portal/referrals"),
        "LIST_REFERRALS",
      ),
    ).resolves.toEqual({ ok: false, reason, status });
  });

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
