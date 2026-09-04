import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CARESLINK_V1_POINTS_UI_FEATURE_FLAG,
  isCaresLinkV1PointsUiEnabled,
  resolveCaresLinkV1PointsPageData,
} from "./points-page-data.server";
import type { CaresLinkV1ProductApiRuntime } from "./product-api-runtime.server";
import { CARESLINK_V1_CONTRACT_VERSION } from "./shared-contracts";
import type {
  CaresLinkV1AuthenticatedPrincipal,
  CaresLinkV1ProductApi,
} from "./transport-contract";

vi.mock("server-only", () => ({}));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SERVER_TIME = "2026-08-11T01:00:00.000Z";
const ENABLED_ENV = { CARESLINK_V1_POINTS_UI_ENABLED: "true" } as const;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("CaresLink V1 Points page data", () => {
  it("keeps the independent UI feature flag exact-true and default-off", () => {
    expect(CARESLINK_V1_POINTS_UI_FEATURE_FLAG).toBe(
      "CARESLINK_V1_POINTS_UI_ENABLED",
    );
    expect(isCaresLinkV1PointsUiEnabled({})).toBe(false);
    for (const value of ["", "false", "TRUE", " true", "true ", "1"]) {
      expect(
        isCaresLinkV1PointsUiEnabled({
          [CARESLINK_V1_POINTS_UI_FEATURE_FLAG]: value,
        }),
      ).toBe(false);
    }
    expect(isCaresLinkV1PointsUiEnabled(ENABLED_ENV)).toBe(true);
  });

  it("does not touch the Product API runtime while the UI flag is disabled", async () => {
    const resolveAuth = vi.fn(async () => {
      throw new Error("must not resolve auth");
    });
    const getProductApi = vi.fn(async () => {
      throw new Error("must not construct an adapter");
    });
    const runtime: CaresLinkV1ProductApiRuntime = {
      resolveAuth,
      getProductApi,
    };

    await expect(
      resolveCaresLinkV1PointsPageData({ runtime, env: {} }),
    ).resolves.toEqual({ status: "UNAVAILABLE", unit: "POINTS" });
    expect(resolveAuth).not.toHaveBeenCalled();
    expect(getProductApi).not.toHaveBeenCalled();
  });

  it("resolves an exact AVAILABLE summary through cookie runtime context", async () => {
    const rawResponse = {
      status: "AVAILABLE",
      unit: "POINTS",
      serverTime: SERVER_TIME,
      contractVersion: CARESLINK_V1_CONTRACT_VERSION,
      availablePoints: 250,
      reservedPoints: 50,
    };
    const getPoints = vi.fn(async () => rawResponse);
    const api = { getPoints } as unknown as CaresLinkV1ProductApi;
    const resolveAuth = vi.fn(async (request: Request) => {
      void request;
      return cookieAuth();
    });
    const getProductApi = vi.fn(
      async (
        principal: CaresLinkV1AuthenticatedPrincipal,
        request: Request,
      ) => {
        void principal;
        void request;
        return api;
      },
    );
    const runtime: CaresLinkV1ProductApiRuntime = {
      resolveAuth,
      getProductApi,
    };

    const result = await resolveCaresLinkV1PointsPageData({
      runtime,
      env: ENABLED_ENV,
    });

    expect(result).toEqual(rawResponse);
    expect(result).not.toBe(rawResponse);
    const request = resolveAuth.mock.calls[0]?.[0];
    expect(request).toBeInstanceOf(Request);
    expect(request.method).toBe("GET");
    expect(new URL(request.url).pathname).toBe("/v1/points");
    expect(request.headers.has("authorization")).toBe(false);
    expect(getProductApi).toHaveBeenCalledWith(
      {
        userId: USER_ID,
        sessionId: SESSION_ID,
        transport: "COOKIE",
      },
      request,
    );
    expect(getPoints).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toMatch(
      /(?:owner|user|session|wallet|ledger|error|detail)/i,
    );
  });

  it("preserves an exact owner-free NOT_READY summary", async () => {
    const response = {
      status: "NOT_READY",
      unit: "POINTS",
      serverTime: SERVER_TIME,
      contractVersion: CARESLINK_V1_CONTRACT_VERSION,
    };
    const { runtime } = runtimeReturning(response);

    await expect(
      resolveCaresLinkV1PointsPageData({ runtime, env: ENABLED_ENV }),
    ).resolves.toEqual(response);
  });

  it("maps only authentication failures to AUTH_REQUIRED without constructing an API", async () => {
    const cases = [
      ["auth_required", "AUTH_REQUIRED"],
      ["invalid_session", "AUTH_REQUIRED"],
      ["session_revoked", "AUTH_REQUIRED"],
      ["feature_disabled", "UNAVAILABLE"],
      ["auth_unavailable", "UNAVAILABLE"],
      ["session_validation_unavailable", "UNAVAILABLE"],
    ] as const;

    for (const [reason, expectedStatus] of cases) {
      const getProductApi = vi.fn();
      const runtime: CaresLinkV1ProductApiRuntime = {
        resolveAuth: vi.fn(async () => ({
          ok: false as const,
          reason,
          status:
            expectedStatus === "AUTH_REQUIRED"
              ? (401 as const)
              : (503 as const),
        })),
        getProductApi,
      };

      await expect(
        resolveCaresLinkV1PointsPageData({ runtime, env: ENABLED_ENV }),
      ).resolves.toEqual({ status: expectedStatus, unit: "POINTS" });
      expect(getProductApi).not.toHaveBeenCalled();
    }
  });

  it("rejects non-cookie and malformed verified identities before principal construction", async () => {
    const invalidIdentities = [
      { userId: USER_ID, sessionId: SESSION_ID, source: "bearer" },
      { userId: "not-a-user", sessionId: SESSION_ID, source: "cookie" },
      { userId: USER_ID, sessionId: "not-a-session", source: "cookie" },
    ] as const;

    for (const identity of invalidIdentities) {
      const getProductApi = vi.fn();
      const runtime = {
        resolveAuth: vi.fn(async () => ({ ok: true as const, identity })),
        getProductApi,
      } as unknown as CaresLinkV1ProductApiRuntime;

      await expect(
        resolveCaresLinkV1PointsPageData({ runtime, env: ENABLED_ENV }),
      ).resolves.toEqual({ status: "UNAVAILABLE", unit: "POINTS" });
      expect(getProductApi).not.toHaveBeenCalled();
    }
  });

  it("fails closed when auth, adapter construction, or the Points read throws", async () => {
    const authThrowRuntime = {
      resolveAuth: vi.fn(async () => {
        throw new Error("sensitive auth detail");
      }),
      getProductApi: vi.fn(),
    } as unknown as CaresLinkV1ProductApiRuntime;
    const adapterThrowRuntime = {
      resolveAuth: vi.fn(async () => cookieAuth()),
      getProductApi: vi.fn(async () => {
        throw new Error("sensitive adapter detail");
      }),
    } as unknown as CaresLinkV1ProductApiRuntime;
    const pointsThrowRuntime = runtimeReturning(undefined, {
      getPointsError: new Error("sensitive RPC detail"),
    }).runtime;

    for (const runtime of [
      authThrowRuntime,
      adapterThrowRuntime,
      pointsThrowRuntime,
    ]) {
      const result = await resolveCaresLinkV1PointsPageData({
        runtime,
        env: ENABLED_ENV,
      });
      expect(result).toEqual({ status: "UNAVAILABLE", unit: "POINTS" });
      expect(JSON.stringify(result)).not.toContain("sensitive");
    }
  });

  it("fails closed when the durable Product API adapter is unavailable", async () => {
    const runtime: CaresLinkV1ProductApiRuntime = {
      resolveAuth: vi.fn(async () => cookieAuth()),
      getProductApi: vi.fn(async () => undefined),
    };

    await expect(
      resolveCaresLinkV1PointsPageData({ runtime, env: ENABLED_ENV }),
    ).resolves.toEqual({ status: "UNAVAILABLE", unit: "POINTS" });
  });

  it("strictly rejects response drift, identifiers, unsafe balances, and invalid timestamps", async () => {
    const valid = {
      status: "AVAILABLE",
      unit: "POINTS",
      serverTime: SERVER_TIME,
      contractVersion: CARESLINK_V1_CONTRACT_VERSION,
      availablePoints: 250,
      reservedPoints: 50,
    };
    const invalidResponses: unknown[] = [
      null,
      [],
      { ...valid, ownerUserId: USER_ID },
      { ...valid, walletId: USER_ID },
      { ...valid, unit: "CREDITS" },
      { ...valid, contractVersion: "future-contract" },
      { ...valid, serverTime: "not-a-time" },
      { ...valid, serverTime: "2026-08-11T01:00:00Z" },
      { ...valid, serverTime: "2026-08-11T01:00:00.000+00:00" },
      { ...valid, serverTime: "2026-02-30T01:00:00.000Z" },
      { ...valid, availablePoints: -1 },
      { ...valid, availablePoints: 1.5 },
      { ...valid, availablePoints: "250" },
      { ...valid, reservedPoints: Number.MAX_SAFE_INTEGER + 1 },
      { ...valid, reservedPoints: Number.NaN },
      {
        status: "AVAILABLE",
        unit: "POINTS",
        serverTime: SERVER_TIME,
        contractVersion: CARESLINK_V1_CONTRACT_VERSION,
        availablePoints: 250,
      },
      {
        status: "NOT_READY",
        unit: "POINTS",
        serverTime: SERVER_TIME,
        contractVersion: CARESLINK_V1_CONTRACT_VERSION,
        availablePoints: 0,
      },
      {
        status: "UNKNOWN",
        unit: "POINTS",
        serverTime: SERVER_TIME,
        contractVersion: CARESLINK_V1_CONTRACT_VERSION,
      },
    ];

    for (const response of invalidResponses) {
      const { runtime } = runtimeReturning(response);
      await expect(
        resolveCaresLinkV1PointsPageData({ runtime, env: ENABLED_ENV }),
      ).resolves.toEqual({ status: "UNAVAILABLE", unit: "POINTS" });
    }
  });
});

function cookieAuth() {
  return {
    ok: true as const,
    identity: {
      userId: USER_ID,
      sessionId: SESSION_ID,
      source: "cookie" as const,
    },
  };
}

function runtimeReturning(
  response: unknown,
  options: { getPointsError?: Error } = {},
) {
  const getPoints = options.getPointsError
    ? vi.fn(async () => {
        throw options.getPointsError;
      })
    : vi.fn(async () => response);
  const api = { getPoints } as unknown as CaresLinkV1ProductApi;
  const runtime: CaresLinkV1ProductApiRuntime = {
    resolveAuth: vi.fn(async () => cookieAuth()),
    getProductApi: vi.fn(async () => api),
  };
  return { runtime, getPoints };
}
