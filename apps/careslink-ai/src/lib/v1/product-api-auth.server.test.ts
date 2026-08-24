import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  CARESLINK_V1_NATIVE_AUTH_BOUNDARY,
  type CaresLinkV1ProductApiAuthClient,
  isCaresLinkV1ProductApiEnabled,
  resolveCaresLinkV1ProductApiAuth,
} from "./product-api-auth.server";

vi.mock("server-only", () => ({}));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACCESS_TOKEN = "header-only-sensitive.jwt.value";

describe("CaresLink V1 Product API auth", () => {
  it("keeps the Product API off unless the exact server flag is true", async () => {
    expect(isCaresLinkV1ProductApiEnabled({})).toBe(false);
    expect(
      isCaresLinkV1ProductApiEnabled({
        CARESLINK_V1_PRODUCT_API_ENABLED: "TRUE",
      }),
    ).toBe(false);
    expect(
      isCaresLinkV1ProductApiEnabled({
        CARESLINK_V1_PRODUCT_API_ENABLED: "true",
      }),
    ).toBe(true);

    const createBearerAuthClient = vi.fn();
    const resolveSessionStatus = vi.fn();

    await expect(
      resolveCaresLinkV1ProductApiAuth(bearerRequest(), {
        env: {},
        createBearerAuthClient,
        resolveSessionStatus,
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "feature_disabled",
      status: 503,
    });
    expect(createBearerAuthClient).not.toHaveBeenCalled();
    expect(resolveSessionStatus).not.toHaveBeenCalled();
  });

  it("derives a Bearer owner from verified Supabase user and claims only", async () => {
    const { client, getClaims, getUser } = authClient();
    const createCookieAuthClient = vi.fn();
    const resolveSessionStatus = vi.fn(async () => "ACTIVE" as const);

    const result = await resolveCaresLinkV1ProductApiAuth(bearerRequest(), {
      env: enabledEnv(),
      createBearerAuthClient: () => client,
      createCookieAuthClient,
      resolveSessionStatus,
    });

    expect(getUser).toHaveBeenCalledWith(ACCESS_TOKEN);
    expect(getClaims).toHaveBeenCalledWith(ACCESS_TOKEN);
    expect(createCookieAuthClient).not.toHaveBeenCalled();
    expect(resolveSessionStatus).toHaveBeenCalledWith({
      userId: USER_ID,
      sessionId: SESSION_ID,
      source: "bearer",
    });
    expect(getClaims.mock.invocationCallOrder[0]).toBeLessThan(
      resolveSessionStatus.mock.invocationCallOrder[0],
    );
    expect(resolveSessionStatus.mock.invocationCallOrder[0]).toBeLessThan(
      getUser.mock.invocationCallOrder[0],
    );
    expect(result).toEqual({
      ok: true,
      identity: {
        userId: USER_ID,
        sessionId: SESSION_ID,
        source: "bearer",
      },
    });
    expect(result.ok && Object.isFrozen(result.identity)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);
  });

  it("applies the same verified identity and active-session gate to cookies", async () => {
    const { client, getClaims, getUser } = authClient();
    const createBearerAuthClient = vi.fn();
    const resolveSessionStatus = vi.fn(async () => "ACTIVE" as const);

    const result = await resolveCaresLinkV1ProductApiAuth(cookieRequest(), {
      env: enabledEnv(),
      createBearerAuthClient,
      createCookieAuthClient: async () => client,
      resolveSessionStatus,
    });

    expect(getUser).toHaveBeenCalledWith();
    expect(getClaims).toHaveBeenCalledWith();
    expect(createBearerAuthClient).not.toHaveBeenCalled();
    expect(resolveSessionStatus).toHaveBeenCalledWith({
      userId: USER_ID,
      sessionId: SESSION_ID,
      source: "cookie",
    });
    expect(result).toEqual({
      ok: true,
      identity: {
        userId: USER_ID,
        sessionId: SESSION_ID,
        source: "cookie",
      },
    });
  });

  it("ignores an ownerId in the request body and keeps server-derived ownership", async () => {
    const { client } = authClient();
    const request = new Request("https://portal.example.test/v1/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ownerId: OTHER_USER_ID }),
    });

    const result = await resolveCaresLinkV1ProductApiAuth(request, {
      env: enabledEnv(),
      createCookieAuthClient: async () => client,
      resolveSessionStatus: async () => "ACTIVE",
    });

    expect(result).toMatchObject({
      ok: true,
      identity: { userId: USER_ID },
    });
    expect(JSON.stringify(result)).not.toContain(OTHER_USER_ID);
  });

  it("rejects malformed Authorization instead of falling back to cookies", async () => {
    const createCookieAuthClient = vi.fn();

    const result = await resolveCaresLinkV1ProductApiAuth(
      new Request("https://portal.example.test/v1/me", {
        headers: { authorization: `Basic ${ACCESS_TOKEN}` },
      }),
      {
        env: enabledEnv(),
        createCookieAuthClient,
        resolveSessionStatus: async () => "ACTIVE",
      },
    );

    expect(result).toEqual({
      ok: false,
      reason: "invalid_session",
      status: 401,
    });
    expect(createCookieAuthClient).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "claim subject",
      input: { claimUserId: "not-a-uuid" },
    },
    {
      label: "session id",
      input: { sessionId: "not-a-session-uuid" },
    },
  ])("rejects an invalid $label before session lookup", async ({ input }) => {
    const { client, getUser } = authClient(input);
    const resolveSessionStatus = vi.fn(async () => "ACTIVE" as const);

    await expect(
      resolveCaresLinkV1ProductApiAuth(bearerRequest(), {
        env: enabledEnv(),
        createBearerAuthClient: () => client,
        resolveSessionStatus,
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "invalid_session",
      status: 401,
    });
    expect(resolveSessionStatus).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("fails closed before session lookup when the claims verifier rejects a token", async () => {
    const { client, getUser } = authClient({
      getClaimsError: { message: `expired or invalid ${ACCESS_TOKEN}` },
    });
    const resolveSessionStatus = vi.fn(async () => "ACTIVE" as const);

    const result = await resolveCaresLinkV1ProductApiAuth(bearerRequest(), {
      env: enabledEnv(),
      createBearerAuthClient: () => client,
      resolveSessionStatus,
    });

    expect(result).toEqual({
      ok: false,
      reason: "invalid_session",
      status: 401,
    });
    expect(resolveSessionStatus).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);
  });

  it.each([
    {
      label: "malformed authoritative user id",
      input: { userId: "not-a-uuid", claimUserId: USER_ID },
    },
    {
      label: "user and claim subject mismatch",
      input: { userId: OTHER_USER_ID, claimUserId: USER_ID },
    },
  ])("rejects an active session with $label", async ({ input }) => {
    const { client, getClaims, getUser } = authClient(input);
    const resolveSessionStatus = vi.fn(async () => "ACTIVE" as const);

    await expect(
      resolveCaresLinkV1ProductApiAuth(bearerRequest(), {
        env: enabledEnv(),
        createBearerAuthClient: () => client,
        resolveSessionStatus,
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "invalid_session",
      status: 401,
    });
    expect(resolveSessionStatus).toHaveBeenCalledWith({
      userId: USER_ID,
      sessionId: SESSION_ID,
      source: "bearer",
    });
    expect(getClaims.mock.invocationCallOrder[0]).toBeLessThan(
      resolveSessionStatus.mock.invocationCallOrder[0],
    );
    expect(resolveSessionStatus.mock.invocationCallOrder[0]).toBeLessThan(
      getUser.mock.invocationCallOrder[0],
    );
  });

  it("returns SESSION_REVOKED before getUser for a signed token removed by global logout", async () => {
    const { client, getClaims, getUser } = authClient({
      getUserError: new Error(`globally logged out ${ACCESS_TOKEN}`),
    });
    const resolveSessionStatus = vi.fn(async () => "REVOKED" as const);

    const result = await resolveCaresLinkV1ProductApiAuth(bearerRequest(), {
      env: enabledEnv(),
      createBearerAuthClient: () => client,
      resolveSessionStatus,
    });

    expect(result).toEqual({
      ok: false,
      reason: "session_revoked",
      status: 401,
    });
    expect(getClaims).toHaveBeenCalledWith(ACCESS_TOKEN);
    expect(resolveSessionStatus).toHaveBeenCalledWith({
      userId: USER_ID,
      sessionId: SESSION_ID,
      source: "bearer",
    });
    expect(getUser).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);
  });

  it("fails closed when active-session validation is absent or unavailable", async () => {
    const { client, getUser } = authClient();

    await expect(
      resolveCaresLinkV1ProductApiAuth(bearerRequest(), {
        env: enabledEnv(),
        createBearerAuthClient: () => client,
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "session_validation_unavailable",
      status: 503,
    });

    await expect(
      resolveCaresLinkV1ProductApiAuth(bearerRequest(), {
        env: enabledEnv(),
        createBearerAuthClient: () => client,
        resolveSessionStatus: async () => "UNAVAILABLE",
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "session_validation_unavailable",
      status: 503,
    });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("does not leak Bearer values through dependency failures", async () => {
    const { client } = authClient({
      getUserError: new Error(`upstream rejected ${ACCESS_TOKEN}`),
    });

    const authFailure = await resolveCaresLinkV1ProductApiAuth(
      bearerRequest(),
      {
        env: enabledEnv(),
        createBearerAuthClient: () => client,
        resolveSessionStatus: async () => "ACTIVE",
      },
    );

    expect(authFailure).toEqual({
      ok: false,
      reason: "invalid_session",
      status: 401,
    });
    expect(JSON.stringify(authFailure)).not.toContain(ACCESS_TOKEN);

    const hookFailure = await resolveCaresLinkV1ProductApiAuth(
      bearerRequest(),
      {
        env: enabledEnv(),
        createBearerAuthClient: () => authClient().client,
        resolveSessionStatus: async () => {
          throw new Error(`revocation lookup failed for ${ACCESS_TOKEN}`);
        },
      },
    );

    expect(hookFailure).toEqual({
      ok: false,
      reason: "session_validation_unavailable",
      status: 503,
    });
    expect(JSON.stringify(hookFailure)).not.toContain(ACCESS_TOKEN);
  });

  it("keeps native PKCE, session, device, and revoke endpoints unserved", () => {
    expect(CARESLINK_V1_NATIVE_AUTH_BOUNDARY).toEqual({
      nativePkceCallback: "NOT_SERVED",
      sessions: "NOT_SERVED",
      devices: "NOT_SERVED",
      revoke: "NOT_SERVED",
      revokeAll: "NOT_SERVED",
    });

    const source = readFileSync(
      join(process.cwd(), "src/lib/v1/product-api-auth.server.ts"),
      "utf8",
    );
    expect(source).toMatch(/^import "server-only";/);
    expect(source).not.toMatch(/console\.|request\.json\(|request\.url/);
  });
});

function enabledEnv() {
  return { CARESLINK_V1_PRODUCT_API_ENABLED: "true" } as const;
}

function bearerRequest() {
  return new Request("https://portal.example.test/v1/documents", {
    headers: { authorization: `Bearer ${ACCESS_TOKEN}` },
  });
}

function cookieRequest() {
  return new Request("https://portal.example.test/v1/documents");
}

type AuthClientOverrides = {
  userId?: string;
  claimUserId?: string;
  sessionId?: string;
  getClaimsError?: { message?: string };
  getUserError?: Error;
};

function authClient({
  userId = USER_ID,
  claimUserId = userId,
  sessionId = SESSION_ID,
  getClaimsError,
  getUserError,
}: AuthClientOverrides = {}) {
  const getUser = vi.fn(async () => {
    if (getUserError) {
      throw getUserError;
    }

    return {
      data: { user: { id: userId } },
      error: null,
    };
  });
  const getClaims = vi.fn(async () =>
    getClaimsError
      ? { data: null, error: getClaimsError }
      : {
          data: {
            claims: {
              sub: claimUserId,
              session_id: sessionId,
            },
          },
          error: null,
        },
  );

  return {
    client: { auth: { getUser, getClaims } } as CaresLinkV1ProductApiAuthClient,
    getClaims,
    getUser,
  };
}
