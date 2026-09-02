import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  COMMUNICATION_NOTE_GENERATION_CURRENT_SESSION_STATUS_RPC,
  type CommunicationNoteGenerationAuthenticatedClient,
} from "./communication-note-generation-current-session.server";
import {
  COMMUNICATION_NOTE_GENERATION_PRINCIPAL_RESOLVER,
  createCommunicationNoteGenerationPrincipalResolver,
} from "./communication-note-generation-principal.server";

vi.mock("server-only", () => ({}));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ACCESS_TOKEN = "sensitive-bearer-token";

describe("Communication Note strict provider principal", () => {
  it("keeps the formal principal port absent and the Product master gate fail-closed", async () => {
    expect(COMMUNICATION_NOTE_GENERATION_PRINCIPAL_RESOLVER).toBeUndefined();
    const createCookieAuthClient = vi.fn();
    const validateCurrentSessionAuthority = vi.fn();
    const resolver = createCommunicationNoteGenerationPrincipalResolver({
      env: {},
      createCookieAuthClient,
      validateCurrentSessionAuthority,
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
    expect(validateCurrentSessionAuthority).not.toHaveBeenCalled();
  });

  it.each([`Bearer ${ACCESS_TOKEN}`, `Basic ${ACCESS_TOKEN}`, "", " "])(
    "rejects every Authorization header before Cookie Auth or session RPC: %j",
    async (authorization) => {
      const createCookieAuthClient = vi.fn();
      const validateCurrentSessionAuthority = vi.fn();
      const resolver = createCommunicationNoteGenerationPrincipalResolver({
        env: enabledEnv(),
        createCookieAuthClient,
        validateCurrentSessionAuthority,
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
      expect(validateCurrentSessionAuthority).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);
    },
  );

  it("uses one exact Cookie client for claims, zero-argument status and user", async () => {
    const { client, getClaims, rpc, getUser } = authClient();
    const createCookieAuthClient = vi.fn(async () => client);
    const validateCurrentSessionAuthority = vi.fn(() => true);
    const resolver = createCommunicationNoteGenerationPrincipalResolver({
      env: enabledEnv(),
      createCookieAuthClient,
      validateCurrentSessionAuthority,
    });

    const result = await resolver(cookieRequest());

    expect(createCookieAuthClient).toHaveBeenCalledOnce();
    expect(getClaims).toHaveBeenCalledWith();
    expect(validateCurrentSessionAuthority).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      COMMUNICATION_NOTE_GENERATION_CURRENT_SESSION_STATUS_RPC,
    );
    expect(rpc.mock.calls[0]).toHaveLength(1);
    expect(getUser).toHaveBeenCalledWith();
    expect(getClaims.mock.invocationCallOrder[0]).toBeLessThan(
      validateCurrentSessionAuthority.mock.invocationCallOrder[0],
    );
    expect(validateCurrentSessionAuthority.mock.invocationCallOrder[0]).toBeLessThan(
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

  it("captures server-owned ports so a retained options object cannot replace them", async () => {
    const { client } = authClient();
    const originalCookieFactory = vi.fn(async () => client);
    const originalAuthorityValidator = vi.fn(() => true);
    const options = {
      env: enabledEnv(),
      createCookieAuthClient: originalCookieFactory,
      validateCurrentSessionAuthority: originalAuthorityValidator,
    };
    const resolver = createCommunicationNoteGenerationPrincipalResolver(options);
    const retained = options as Record<string, unknown>;
    retained.env = {};
    retained.createCookieAuthClient = vi.fn(() => {
      throw new Error("replaced Cookie port");
    });
    retained.validateCurrentSessionAuthority = vi.fn(() => false);

    await expect(resolver(cookieRequest())).resolves.toMatchObject({ ok: true });
    expect(originalCookieFactory).toHaveBeenCalledOnce();
    expect(originalAuthorityValidator).toHaveBeenCalledOnce();
  });

  it.each([
    {
      name: "claims verifier error",
      overrides: { claimsError: { message: "expired" } },
    },
    { name: "missing claim subject", overrides: { claimUserId: undefined } },
    { name: "malformed session id", overrides: { sessionId: "not-a-uuid" } },
  ])("rejects $name before authority validation, RPC and getUser", async ({ overrides }) => {
    const { client, rpc, getUser } = authClient(overrides);
    const validateCurrentSessionAuthority = vi.fn(() => true);
    const resolver = createCommunicationNoteGenerationPrincipalResolver({
      env: enabledEnv(),
      createCookieAuthClient: async () => client,
      validateCurrentSessionAuthority,
    });

    await expect(resolver(cookieRequest())).resolves.toEqual({
      ok: false,
      reason: "auth_required",
      status: 401,
    });
    expect(validateCurrentSessionAuthority).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it.each([
    { name: "false", validate: () => false },
    {
      name: "throwing",
      validate: () => {
        throw new Error("private target detail");
      },
    },
  ])("fails closed when post-claims authority validation is $name", async ({ validate }) => {
    const { client, getClaims, rpc, getUser } = authClient();
    const resolver = createCommunicationNoteGenerationPrincipalResolver({
      env: enabledEnv(),
      createCookieAuthClient: async () => client,
      validateCurrentSessionAuthority: validate,
    });

    const result = await resolver(cookieRequest());

    expect(result).toEqual({
      ok: false,
      reason: "unavailable",
      status: 503,
    });
    expect(getClaims).toHaveBeenCalledOnce();
    expect(rpc).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("private target detail");
  });

  it("fails closed when the authenticated client has no usable RPC port", async () => {
    const { client, getUser } = authClient();
    const malformed = { auth: client.auth } as never;
    const resolver = createCommunicationNoteGenerationPrincipalResolver({
      env: enabledEnv(),
      createCookieAuthClient: async () => malformed,
      validateCurrentSessionAuthority: () => true,
    });

    await expect(resolver(cookieRequest())).resolves.toEqual({
      ok: false,
      reason: "unavailable",
      status: 503,
    });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("maps revoked or ineligible provider authority before getUser", async () => {
    const { client, rpc, getUser } = authClient({ status: "REVOKED" });
    const resolver = createCommunicationNoteGenerationPrincipalResolver({
      env: enabledEnv(),
      createCookieAuthClient: async () => client,
      validateCurrentSessionAuthority: () => true,
    });

    await expect(resolver(cookieRequest())).resolves.toEqual({
      ok: false,
      reason: "session_revoked",
      status: 401,
    });
    expect(rpc).toHaveBeenCalledWith(
      COMMUNICATION_NOTE_GENERATION_CURRENT_SESSION_STATUS_RPC,
    );
    expect(getUser).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "malformed status",
      rpcResult: { data: "active", error: null },
    },
    {
      name: "RPC error",
      rpcResult: {
        data: "ACTIVE",
        error: { message: "private upstream detail" },
      },
    },
  ])("fails closed when the session $name is unavailable", async ({ rpcResult }) => {
    const { client, getUser } = authClient({ rpcResult });
    const resolver = createCommunicationNoteGenerationPrincipalResolver({
      env: enabledEnv(),
      createCookieAuthClient: async () => client,
      validateCurrentSessionAuthority: () => true,
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
    { name: "missing authoritative user", overrides: { userId: undefined } },
    {
      name: "claims and user mismatch",
      overrides: { userId: OTHER_USER_ID },
    },
    {
      name: "Auth server error",
      overrides: { userError: { message: "private Auth failure" } },
    },
  ])("rejects $name after an ACTIVE session", async ({ overrides }) => {
    const { client, rpc } = authClient(overrides);
    const resolver = createCommunicationNoteGenerationPrincipalResolver({
      env: enabledEnv(),
      createCookieAuthClient: async () => client,
      validateCurrentSessionAuthority: () => true,
    });

    const result = await resolver(cookieRequest());

    expect(result).toEqual({
      ok: false,
      reason: "auth_required",
      status: 401,
    });
    expect(rpc).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain("private Auth failure");
  });

  it("fails closed when the Cookie Auth client cannot be created", async () => {
    const validateCurrentSessionAuthority = vi.fn();
    const resolver = createCommunicationNoteGenerationPrincipalResolver({
      env: enabledEnv(),
      createCookieAuthClient: async () => undefined,
      validateCurrentSessionAuthority,
    });

    await expect(resolver(cookieRequest())).resolves.toEqual({
      ok: false,
      reason: "unavailable",
      status: 503,
    });
    expect(validateCurrentSessionAuthority).not.toHaveBeenCalled();
  });

  it("keeps interleaved requests on their own exact Cookie clients", async () => {
    const aClaimsStarted = deferred<void>();
    const releaseAClaims = deferred<void>();
    const a = authClient({
      onGetClaims: async () => {
        aClaimsStarted.resolve();
        await releaseAClaims.promise;
      },
    });
    const b = authClient();
    const createCookieAuthClient = vi
      .fn<() => Promise<CommunicationNoteGenerationAuthenticatedClient>>()
      .mockResolvedValueOnce(a.client)
      .mockResolvedValueOnce(b.client);
    const resolver = createCommunicationNoteGenerationPrincipalResolver({
      env: enabledEnv(),
      createCookieAuthClient,
      validateCurrentSessionAuthority: () => true,
    });

    const aResult = resolver(cookieRequest());
    await aClaimsStarted.promise;
    const bResult = await resolver(cookieRequest());
    expect(bResult).toMatchObject({ ok: true });
    expect(a.rpc).not.toHaveBeenCalled();
    expect(b.rpc).toHaveBeenCalledOnce();
    expect(b.getUser).toHaveBeenCalledOnce();

    releaseAClaims.resolve();
    await expect(aResult).resolves.toMatchObject({ ok: true });
    expect(a.rpc).toHaveBeenCalledOnce();
    expect(a.getUser).toHaveBeenCalledOnce();
    expect(b.rpc).toHaveBeenCalledOnce();
    expect(b.getUser).toHaveBeenCalledOnce();
    expect(createCookieAuthClient).toHaveBeenCalledTimes(2);
  });

  it("contains no legacy RPC, privileged client, metadata role or credential logging path", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/lib/communication-note-generation-principal.server.ts",
      ),
      "utf8",
    );

    expect(source).toMatch(/^import "server-only";/);
    expect(source).not.toMatch(
      /resolve_v1_shadow_session_status|createCaresLinkV1SessionStatusRpcClient|createSessionStatusClient|p_user_id|p_session_id|getSession|service_role|sb_secret_/,
    );
    expect(source).not.toMatch(
      /referral-workspace|createWorkspaceAccountFromSupabaseUser|user_metadata|raw_user_meta_data/,
    );
    expect(source).not.toMatch(/console\.|logger\.|request\.json\(|request\.url/);
    expect(source.indexOf('request.headers.has("authorization")')).toBeLessThan(
      source.indexOf("resolveCaresLinkV1ProductApiAuth(request"),
    );
    expect(source.indexOf("let requestClient")).toBeGreaterThan(
      source.indexOf("return async (request: Request)"),
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
  status?: "ACTIVE" | "REVOKED";
  rpcResult?: unknown;
  onGetClaims?: () => void | Promise<void>;
};

function authClient(overrides: AuthClientOverrides = {}) {
  const claimUserId = Object.prototype.hasOwnProperty.call(overrides, "claimUserId")
    ? overrides.claimUserId
    : USER_ID;
  const sessionId = Object.prototype.hasOwnProperty.call(overrides, "sessionId")
    ? overrides.sessionId
    : SESSION_ID;
  const userId = Object.prototype.hasOwnProperty.call(overrides, "userId")
    ? overrides.userId
    : USER_ID;
  const getClaims = vi.fn(async () => {
    await overrides.onGetClaims?.();
    return overrides.claimsError
      ? { data: null, error: overrides.claimsError }
      : {
          data: { claims: { sub: claimUserId, session_id: sessionId } },
          error: null,
        };
  });
  const getUser = vi.fn(async () =>
    overrides.userError
      ? { data: { user: null }, error: overrides.userError }
      : { data: { user: userId ? { id: userId } : null }, error: null },
  );
  const rpc = vi.fn(async () =>
    Object.prototype.hasOwnProperty.call(overrides, "rpcResult")
      ? overrides.rpcResult
      : { data: overrides.status ?? "ACTIVE", error: null },
  );

  return {
    client: {
      auth: { getClaims, getUser },
      rpc,
    } as CommunicationNoteGenerationAuthenticatedClient,
    getClaims,
    getUser,
    rpc,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}
