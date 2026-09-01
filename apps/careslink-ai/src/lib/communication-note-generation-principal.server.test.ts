import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  COMMUNICATION_NOTE_GENERATION_PRINCIPAL_RESOLVER,
  createCommunicationNoteGenerationPrincipalResolver,
} from "./communication-note-generation-principal.server";
import type { CaresLinkV1ProductApiAuthClient } from "./v1/product-api-auth.server";

vi.mock("server-only", () => ({}));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACCESS_TOKEN = "sensitive-bearer-token";

describe("Communication Note strict provider principal", () => {
  it("keeps the formal principal port absent and the Product master gate fail-closed", async () => {
    expect(COMMUNICATION_NOTE_GENERATION_PRINCIPAL_RESOLVER).toBeUndefined();
    const createCookieAuthClient = vi.fn();
    const rpc = vi.fn();
    const resolver = createCommunicationNoteGenerationPrincipalResolver({
      env: {},
      createCookieAuthClient,
      sessionStatusClient: { rpc },
    });
    const opaqueRequest = new Proxy({} as Request, {
      get() {
        throw new Error("disabled resolver must not inspect the request");
      },
    });

    await expect(resolver(opaqueRequest)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
      status: 503,
    });
    expect(createCookieAuthClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    `Bearer ${ACCESS_TOKEN}`,
    `Basic ${ACCESS_TOKEN}`,
    "",
  ])(
    "rejects every Authorization header before cookie Auth or session RPC: %j",
    async (authorization) => {
      const createCookieAuthClient = vi.fn();
      const rpc = vi.fn();
      const resolver = createCommunicationNoteGenerationPrincipalResolver({
        env: enabledEnv(),
        createCookieAuthClient,
        sessionStatusClient: { rpc },
      });
      const request = new Request("https://careslink.example.test/generate", {
        headers: { authorization },
      });

      const result = await resolver(request);

      expect(result).toEqual({
        ok: false,
        reason: "forbidden_transport",
        status: 403,
      });
      expect(createCookieAuthClient).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);
    },
  );

  it("sequences verified claims, exact ACTIVE status lookup and authoritative user", async () => {
    const { client, getClaims, getUser } = authClient();
    const createCookieAuthClient = vi.fn(async () => client);
    const rpc = vi.fn(async () => ({ data: "ACTIVE", error: null }));
    const resolver = createCommunicationNoteGenerationPrincipalResolver({
      env: enabledEnv(),
      createCookieAuthClient,
      sessionStatusClient: { rpc },
    });

    const result = await resolver(cookieRequest());

    expect(createCookieAuthClient).toHaveBeenCalledOnce();
    expect(getClaims).toHaveBeenCalledWith();
    expect(rpc).toHaveBeenCalledWith("resolve_v1_shadow_session_status", {
      p_user_id: USER_ID,
      p_session_id: SESSION_ID,
    });
    expect(getUser).toHaveBeenCalledWith();
    expect(getClaims.mock.invocationCallOrder[0]).toBeLessThan(
      rpc.mock.invocationCallOrder[0],
    );
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(
      getUser.mock.invocationCallOrder[0],
    );
    expect(result).toEqual({
      ok: true,
      principal: {
        userId: USER_ID,
        sessionId: SESSION_ID,
        transport: "COOKIE",
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.ok && Object.isFrozen(result.principal)).toBe(true);
  });

  it.each([
    {
      name: "claims verifier error",
      overrides: { claimsError: { message: "expired" } },
    },
    { name: "missing claim subject", overrides: { claimUserId: undefined } },
    { name: "malformed session id", overrides: { sessionId: "not-a-uuid" } },
  ])("rejects $name before the session RPC and getUser", async ({ overrides }) => {
    const { client, getUser } = authClient(overrides);
    const rpc = vi.fn(async () => ({ data: "ACTIVE", error: null }));
    const resolver = createCommunicationNoteGenerationPrincipalResolver({
      env: enabledEnv(),
      createCookieAuthClient: async () => client,
      sessionStatusClient: { rpc },
    });

    await expect(resolver(cookieRequest())).resolves.toEqual({
      ok: false,
      reason: "auth_required",
      status: 401,
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("maps revoked or ineligible provider authority to SESSION_REVOKED before getUser", async () => {
    const { client, getUser } = authClient();
    const rpc = vi.fn(async () => ({ data: "REVOKED", error: null }));
    const resolver = createCommunicationNoteGenerationPrincipalResolver({
      env: enabledEnv(),
      createCookieAuthClient: async () => client,
      sessionStatusClient: { rpc },
    });

    await expect(resolver(cookieRequest())).resolves.toEqual({
      ok: false,
      reason: "session_revoked",
      status: 401,
    });
    expect(getUser).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "malformed status",
      rpc: vi.fn(async () => ({ data: "active", error: null })),
    },
    {
      name: "RPC error",
      rpc: vi.fn(async () => ({
        data: "ACTIVE",
        error: { message: "private upstream detail" },
      })),
    },
    {
      name: "RPC exception",
      rpc: vi.fn(async () => {
        throw new Error("private upstream detail");
      }),
    },
  ])("fails closed when the session $name is unavailable", async ({ rpc }) => {
    const { client, getUser } = authClient();
    const resolver = createCommunicationNoteGenerationPrincipalResolver({
      env: enabledEnv(),
      createCookieAuthClient: async () => client,
      sessionStatusClient: { rpc },
    });

    const result = await resolver(cookieRequest());

    expect(result).toEqual({
      ok: false,
      reason: "unavailable",
      status: 503,
    });
    expect(getUser).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("private upstream detail");
  });

  it.each([
    {
      name: "missing authoritative user",
      overrides: { userId: undefined },
    },
    {
      name: "claims and user mismatch",
      overrides: { userId: OTHER_USER_ID },
    },
    {
      name: "Auth server error",
      overrides: { userError: { message: "private Auth failure" } },
    },
  ])("rejects $name after an ACTIVE session", async ({ overrides }) => {
    const { client } = authClient(overrides);
    const resolver = createCommunicationNoteGenerationPrincipalResolver({
      env: enabledEnv(),
      createCookieAuthClient: async () => client,
      sessionStatusClient: {
        rpc: vi.fn(async () => ({ data: "ACTIVE", error: null })),
      },
    });

    const result = await resolver(cookieRequest());

    expect(result).toEqual({
      ok: false,
      reason: "auth_required",
      status: 401,
    });
    expect(JSON.stringify(result)).not.toContain("private Auth failure");
  });

  it("fails closed when the cookie Auth client cannot be created", async () => {
    const rpc = vi.fn();
    const resolver = createCommunicationNoteGenerationPrincipalResolver({
      env: enabledEnv(),
      createCookieAuthClient: async () => undefined,
      sessionStatusClient: { rpc },
    });

    await expect(resolver(cookieRequest())).resolves.toEqual({
      ok: false,
      reason: "unavailable",
      status: 503,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("contains no Workspace fallback, user metadata role or credential logging path", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/lib/communication-note-generation-principal.server.ts",
      ),
      "utf8",
    );

    expect(source).toMatch(/^import "server-only";/);
    expect(source).not.toMatch(
      /referral-workspace|createWorkspaceAccountFromSupabaseUser|user_metadata|raw_user_meta_data/,
    );
    expect(source).not.toMatch(/console\.|logger\.|request\.json\(|request\.url/);
    expect(source.indexOf('request.headers.has("authorization")')).toBeLessThan(
      source.indexOf("resolveCaresLinkV1ProductApiAuth(request"),
    );
  });
});

function enabledEnv() {
  return { CARESLINK_V1_PRODUCT_API_ENABLED: "true" } as const;
}

function cookieRequest() {
  return new Request("https://careslink.example.test/generate");
}

type AuthClientOverrides = {
  claimUserId?: string;
  sessionId?: string;
  userId?: string;
  claimsError?: { message?: string };
  userError?: { message?: string };
};

function authClient(overrides: AuthClientOverrides = {}) {
  const claimUserId = Object.prototype.hasOwnProperty.call(
    overrides,
    "claimUserId",
  )
    ? overrides.claimUserId
    : USER_ID;
  const sessionId = Object.prototype.hasOwnProperty.call(overrides, "sessionId")
    ? overrides.sessionId
    : SESSION_ID;
  const userId = Object.prototype.hasOwnProperty.call(overrides, "userId")
    ? overrides.userId
    : USER_ID;
  const getClaims = vi.fn(async () =>
    overrides.claimsError
      ? { data: null, error: overrides.claimsError }
      : {
          data: { claims: { sub: claimUserId, session_id: sessionId } },
          error: null,
        },
  );
  const getUser = vi.fn(async () =>
    overrides.userError
      ? { data: { user: null }, error: overrides.userError }
      : { data: { user: userId ? { id: userId } : null }, error: null },
  );

  return {
    client: { auth: { getClaims, getUser } } as CaresLinkV1ProductApiAuthClient,
    getClaims,
    getUser,
  };
}
