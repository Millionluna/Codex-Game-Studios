import { describe, expect, it, vi } from "vitest";
import {
  CARESLINK_V1_PRODUCT_API_DURABLE_ADAPTER_FLAG,
  CARESLINK_V1_PRODUCT_API_EXPECTED_SUPABASE_REF_FLAG,
  createCaresLinkV1ProductApiRuntime,
  isCaresLinkV1DurableProductApiEnabled,
  isCaresLinkV1ProductApiPreviewTargetAllowed,
} from "./product-api-runtime.server";
import type {
  CaresLinkV1ServiceOnlyPrivacyReviewRpcClient,
  CaresLinkV1SessionScopedSupabaseRpcClient,
} from "./product-api-supabase.server";

vi.mock("server-only", () => ({}));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACCESS_TOKEN = "header-only-sensitive.jwt.value";
const principal = {
  userId: USER_ID,
  sessionId: SESSION_ID,
  transport: "BEARER" as const,
};

describe("CaresLink V1 Product API runtime", () => {
  it("keeps the durable adapter behind an independent exact-true flag", async () => {
    expect(isCaresLinkV1DurableProductApiEnabled({})).toBe(false);
    expect(
      isCaresLinkV1DurableProductApiEnabled({
        CARESLINK_V1_PRODUCT_API_DURABLE_ADAPTER_ENABLED: "TRUE",
      }),
    ).toBe(false);
    expect(
      isCaresLinkV1DurableProductApiEnabled({
        CARESLINK_V1_PRODUCT_API_DURABLE_ADAPTER_ENABLED: "true",
      }),
    ).toBe(true);

    const createSessionStatusResolver = vi.fn();
    const createBearerRpcClient = vi.fn();
    const runtime = createCaresLinkV1ProductApiRuntime({
      env: {},
      createSessionStatusResolver,
      createBearerRpcClient,
    });
    await expect(
      runtime.resolveAuth(requestWithBearer()),
    ).resolves.toEqual({
      ok: false,
      reason: "feature_disabled",
      status: 503,
    });
    await expect(
      runtime.getProductApi(principal, requestWithBearer()),
    ).resolves.toBeUndefined();
    expect(createSessionStatusResolver).not.toHaveBeenCalled();
    expect(createBearerRpcClient).not.toHaveBeenCalled();
  });

  it("creates a bearer RPC client with the credential confined to its header", async () => {
    const client = rpcClient();
    const createBearerRpcClient = vi.fn(() => client);
    const runtime = createCaresLinkV1ProductApiRuntime({
      env: enabledEnv(),
      createBearerRpcClient,
    });

    const api = await runtime.getProductApi(principal, requestWithBearer());

    expect(api).toBeDefined();
    expect(createBearerRpcClient).toHaveBeenCalledWith(
      "https://previewproject.supabase.co",
      "publishable-key",
      ACCESS_TOKEN,
    );
    const me = await api!.getMe();
    expect(me).toMatchObject({ userId: USER_ID, sessionId: SESSION_ID });
    expect(JSON.stringify(me)).not.toContain(ACCESS_TOKEN);
  });

  it("creates the dedicated service-only privacy client only for the exact Preview target", async () => {
    const createPrivacyReviewRpcClient = vi.fn(() => privacyRpcClient());
    const runtime = createCaresLinkV1ProductApiRuntime({
      env: {
        ...enabledEnv(),
        CARESLINK_V1_PRIVACY_REVIEW_PREVIEW_SERVICE_ROLE_KEY:
          "dedicated-preview-privacy-key",
      },
      createBearerRpcClient: () => rpcClient(),
      createPrivacyReviewRpcClient,
    });

    await expect(
      runtime.getProductApi(principal, requestWithBearer()),
    ).resolves.toBeDefined();
    expect(createPrivacyReviewRpcClient).not.toHaveBeenCalled();
    await expect(
      runtime.getProductApi(
        principal,
        requestWithBearer("/v1/privacy-reviews"),
      ),
    ).resolves.toBeDefined();
    expect(createPrivacyReviewRpcClient).toHaveBeenCalledWith(
      "https://previewproject.supabase.co",
      "dedicated-preview-privacy-key",
    );
  });

  it("does not fall back to a generic service-role key for privacy proof issuance", async () => {
    const createPrivacyReviewRpcClient = vi.fn(() => privacyRpcClient());
    const runtime = createCaresLinkV1ProductApiRuntime({
      env: {
        ...enabledEnv(),
        SUPABASE_SERVICE_ROLE_KEY: "must-not-be-used",
      },
      createBearerRpcClient: () => rpcClient(),
      createPrivacyReviewRpcClient,
    });

    await expect(
      runtime.getProductApi(
        principal,
        requestWithBearer("/v1/privacy-reviews"),
      ),
    ).resolves.toBeDefined();
    expect(createPrivacyReviewRpcClient).not.toHaveBeenCalled();
  });

  it("denies non-Preview, mismatched, invalid and Production database targets before client creation", async () => {
    const deniedEnvironments = [
      { ...enabledEnv(), VERCEL_ENV: "production" },
      {
        ...enabledEnv(),
        [CARESLINK_V1_PRODUCT_API_EXPECTED_SUPABASE_REF_FLAG]: undefined,
      },
      {
        ...enabledEnv(),
        [CARESLINK_V1_PRODUCT_API_EXPECTED_SUPABASE_REF_FLAG]: "anotherproject",
      },
      {
        ...enabledEnv(),
        NEXT_PUBLIC_SUPABASE_URL: "http://previewproject.supabase.co",
      },
      {
        ...enabledEnv(),
        NEXT_PUBLIC_SUPABASE_URL: "https://database.example.test",
      },
      {
        ...enabledEnv(),
        NEXT_PUBLIC_SUPABASE_URL: "https://adocsnwnslxhxcjgbyee.supabase.co",
        [CARESLINK_V1_PRODUCT_API_EXPECTED_SUPABASE_REF_FLAG]:
          "adocsnwnslxhxcjgbyee",
      },
    ];

    for (const env of deniedEnvironments) {
      const createSessionStatusResolver = vi.fn();
      const createBearerRpcClient = vi.fn();
      const createPrivacyReviewRpcClient = vi.fn(() => privacyRpcClient());
      const runtime = createCaresLinkV1ProductApiRuntime({
        env,
        createSessionStatusResolver,
        createBearerRpcClient,
        createPrivacyReviewRpcClient,
      });

      expect(isCaresLinkV1ProductApiPreviewTargetAllowed(env)).toBe(false);
      await expect(runtime.resolveAuth(requestWithBearer())).resolves.toEqual({
        ok: false,
        reason: "feature_disabled",
        status: 503,
      });
      await expect(
        runtime.getProductApi(
          principal,
          requestWithBearer("/v1/privacy-reviews"),
        ),
      ).resolves.toBeUndefined();
      expect(createSessionStatusResolver).not.toHaveBeenCalled();
      expect(createBearerRpcClient).not.toHaveBeenCalled();
      expect(createPrivacyReviewRpcClient).not.toHaveBeenCalled();
    }
  });

  it("requires the service-backed active-session resolver before auth succeeds", async () => {
    const resolveSessionStatus = vi.fn(async () => "ACTIVE" as const);
    const createSessionStatusResolver = vi.fn(() => resolveSessionStatus);
    const runtime = createCaresLinkV1ProductApiRuntime({
      env: enabledEnv(),
      createSessionStatusResolver,
      createBearerAuthClient: () => ({
        auth: {
          getUser: vi.fn(async () => ({
            data: { user: { id: USER_ID } },
            error: null,
          })),
          getClaims: vi.fn(async () => ({
            data: { claims: { sub: USER_ID, session_id: SESSION_ID } },
            error: null,
          })),
        },
      }),
    });

    await expect(runtime.resolveAuth(requestWithBearer())).resolves.toEqual({
      ok: true,
      identity: {
        userId: USER_ID,
        sessionId: SESSION_ID,
        source: "bearer",
      },
    });
    expect(createSessionStatusResolver).toHaveBeenCalledOnce();
    expect(resolveSessionStatus).toHaveBeenCalledWith({
      userId: USER_ID,
      sessionId: SESSION_ID,
      source: "bearer",
    });
  });

  it("creates cookie and bearer APIs through the same durable port", async () => {
    const cookieClient = rpcClient();
    const createCookieRpcClient = vi.fn(async () => cookieClient);
    const createBearerRpcClient = vi.fn(() => rpcClient());
    const runtime = createCaresLinkV1ProductApiRuntime({
      env: enabledEnv(),
      createCookieRpcClient,
      createBearerRpcClient,
    });

    const cookieApi = await runtime.getProductApi(
      { ...principal, transport: "COOKIE" },
      new Request("https://portal.example.test/v1/me"),
    );
    const bearerApi = await runtime.getProductApi(
      principal,
      requestWithBearer(),
    );

    expect((await cookieApi!.getMe()).authTransport).toBe("COOKIE");
    expect((await bearerApi!.getMe()).authTransport).toBe("BEARER");
    await expect(
      runtime.getProductApi(principal, new Request("https://portal.example.test/v1/me")),
    ).resolves.toBeUndefined();
    await expect(
      runtime.getProductApi(
        { ...principal, transport: "COOKIE" },
        requestWithBearer(),
      ),
    ).resolves.toBeUndefined();
    expect(createCookieRpcClient).toHaveBeenCalledOnce();
    expect(createBearerRpcClient).toHaveBeenCalledOnce();
  });

  it("fails closed when request-scoped client configuration is unavailable", async () => {
    const runtime = createCaresLinkV1ProductApiRuntime({
      env: {
        [CARESLINK_V1_PRODUCT_API_DURABLE_ADAPTER_FLAG]: "true",
      },
      createCookieRpcClient: async () => undefined,
    });

    await expect(
      runtime.getProductApi(principal, requestWithBearer()),
    ).resolves.toBeUndefined();
    await expect(
      runtime.getProductApi(
        { ...principal, transport: "COOKIE" },
        new Request("https://portal.example.test/v1/me"),
      ),
    ).resolves.toBeUndefined();
  });

  it("does not echo malformed bearer credentials through an error", async () => {
    const sensitive = "malformed-sensitive-token";
    const runtime = createCaresLinkV1ProductApiRuntime({
      env: enabledEnv(),
      createBearerRpcClient: () => {
        throw new Error(sensitive);
      },
    });

    const result = await runtime.getProductApi(
      principal,
      new Request("https://portal.example.test/v1/me", {
        headers: { authorization: `Bearer ${sensitive}` },
      }),
    );
    expect(result).toBeUndefined();
    expect(String(result)).not.toContain(sensitive);
  });
});

function enabledEnv() {
  return {
    CARESLINK_V1_PRODUCT_API_ENABLED: "true",
    CARESLINK_V1_PRODUCT_API_DURABLE_ADAPTER_ENABLED: "true",
    CARESLINK_V1_PRODUCT_API_EXPECTED_SUPABASE_REF: "previewproject",
    NEXT_PUBLIC_SUPABASE_URL: "https://previewproject.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
    VERCEL_ENV: "preview",
  };
}

function requestWithBearer(path = "/v1/me") {
  return new Request(`https://portal.example.test${path}`, {
    headers: { authorization: `Bearer ${ACCESS_TOKEN}` },
  });
}

function rpcClient(): CaresLinkV1SessionScopedSupabaseRpcClient {
  return {
    rpc: vi.fn(async () => ({ data: null, error: null })),
  };
}

function privacyRpcClient(): CaresLinkV1ServiceOnlyPrivacyReviewRpcClient {
  return {
    rpc: vi.fn(async () => ({ data: null, error: null })),
  };
}
