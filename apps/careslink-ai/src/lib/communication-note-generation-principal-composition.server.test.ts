import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  COMMUNICATION_NOTE_GENERATION_CURRENT_SESSION_STATUS_RPC,
  type CommunicationNoteGenerationAuthenticatedClient,
} from "./communication-note-generation-current-session.server";
import {
  CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_COMPOSITION_FLAG,
  CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_COMPOSITION_TEST_CAPABILITY,
  CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_EXPECTED_SUPABASE_REF_FLAG,
  CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_EXPECTED_VERCEL_PROJECT_ID_FLAG,
  COMMUNICATION_NOTE_GENERATION_FORMAL_PRINCIPAL_COMPOSITION,
  createCommunicationNoteGenerationPrincipalComposition,
  resolveCommunicationNoteGenerationPrincipalCompositionGuard,
  type CommunicationNoteGenerationPrincipalCompositionEnv,
} from "./communication-note-generation-principal-composition.server";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./v1/ndis-shadow-guard";

vi.mock("server-only", () => ({}));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PREVIEW_REF = "abcdefghijklmnopqrst";
const PREVIEW_URL = `https://${PREVIEW_REF}.supabase.co`;
const VERCEL_PROJECT_ID = "prj_1234567890abcdef";
const PUBLISHABLE_KEY =
  "sb_publishable_1234567890abcdefghijklmnopqrstuvwxyz";
const PRIVATE_VALUE = "sb_secret_1234567890abcdefghijklmnopqrstuvwxyz";

describe("Communication Note principal composition", () => {
  it("keeps the formal composition absent and constructs no client at import or factory time", () => {
    const createCookieAuthClient = vi.fn();
    const env = enabledEnv();

    expect(
      COMMUNICATION_NOTE_GENERATION_FORMAL_PRINCIPAL_COMPOSITION,
    ).toBeUndefined();
    expect(CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_COMPOSITION_FLAG).toBe(
      "CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_COMPOSITION_ENABLED",
    );
    expect(
      CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_EXPECTED_SUPABASE_REF_FLAG,
    ).toBe("CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_EXPECTED_SUPABASE_REF");
    expect(
      CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_EXPECTED_VERCEL_PROJECT_ID_FLAG,
    ).toBe(
      "CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_EXPECTED_VERCEL_PROJECT_ID",
    );
    expect(
      CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_COMPOSITION_TEST_CAPABILITY,
    ).toBe("TEST_ONLY_COMMUNICATION_NOTE_PRINCIPAL_COMPOSITION");

    const guard =
      resolveCommunicationNoteGenerationPrincipalCompositionGuard(env);
    const resolver = createCommunicationNoteGenerationPrincipalComposition({
      capability:
        CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_COMPOSITION_TEST_CAPABILITY,
      env,
      createCookieAuthClient,
    });

    expect(guard).toEqual({
      enabled: true,
      reason: "enabled",
      supabaseUrl: PREVIEW_URL,
      targetSupabaseRef: PREVIEW_REF,
      vercelProjectId: VERCEL_PROJECT_ID,
    });
    expect(Object.isFrozen(guard)).toBe(true);
    expect(resolver).toBeTypeOf("function");
    expect(createCookieAuthClient).not.toHaveBeenCalled();
    expect(JSON.stringify(guard)).not.toContain(PRIVATE_VALUE);
  });

  it.each([
    { name: "environment", options: { env: enabledEnv() } },
    {
      name: "client port",
      options: { createCookieAuthClient: vi.fn() },
    },
  ])(
    "rejects injected $name without the explicit TestOnly capability",
    ({ options }) => {
      expect(() =>
        createCommunicationNoteGenerationPrincipalComposition(options as never),
      ).toThrow("principal composition test ports are unavailable");
    },
  );

  it("captures the TestOnly client port so a retained options object cannot replace it", async () => {
    const { client } = authClient();
    const originalCookieFactory = vi.fn(async () => client);
    const options = {
      capability:
        CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_COMPOSITION_TEST_CAPABILITY,
      env: enabledEnv(),
      createCookieAuthClient: originalCookieFactory,
    } as const;
    const resolver = createCommunicationNoteGenerationPrincipalComposition(options);
    const retained = options as unknown as Record<string, unknown>;
    retained.env = {};
    retained.createCookieAuthClient = vi.fn(() => {
      throw new Error("replaced Cookie port");
    });

    await expect(resolver?.(cookieRequest())).resolves.toMatchObject({ ok: true });
    expect(originalCookieFactory).toHaveBeenCalledOnce();
  });

  it.each([
    {
      name: "composition gate",
      override: {
        CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_COMPOSITION_ENABLED: "false",
      },
      reason: "composition_disabled",
    },
    {
      name: "generation gate",
      override: {
        CARESLINK_COMMUNICATION_NOTE_GENERATION_API_ENABLED: "false",
      },
      reason: "generation_disabled",
    },
    {
      name: "Product API gate",
      override: { CARESLINK_V1_PRODUCT_API_ENABLED: "false" },
      reason: "product_api_disabled",
    },
    {
      name: "Vercel runtime",
      override: { VERCEL: "0" },
      reason: "non_vercel_runtime",
    },
    {
      name: "Vercel environment",
      override: { VERCEL_ENV: "production" },
      reason: "non_preview_environment",
    },
    {
      name: "Vercel target environment",
      override: { VERCEL_TARGET_ENV: "development" },
      reason: "non_preview_environment",
    },
    {
      name: "expected Vercel project",
      override: {
        CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_EXPECTED_VERCEL_PROJECT_ID:
          "prj_aaaaaaaaaaaaaaaa",
      },
      reason: "vercel_project_unverified",
    },
    {
      name: "actual Vercel project",
      override: { VERCEL_PROJECT_ID: "prj_bbbbbbbbbbbbbbbb" },
      reason: "vercel_project_unverified",
    },
    {
      name: "Supabase ref",
      override: {
        CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_EXPECTED_SUPABASE_REF:
          "TOO_SHORT",
      },
      reason: "supabase_target_unverified",
    },
  ])("rejects an invalid $name before any client", ({ override, reason }) => {
    const env = { ...enabledEnv(), ...override };
    const createCookieAuthClient = vi.fn();

    expect(
      resolveCommunicationNoteGenerationPrincipalCompositionGuard(env),
    ).toEqual({ enabled: false, reason });
    expect(
      createCommunicationNoteGenerationPrincipalComposition({
        capability:
          CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_COMPOSITION_TEST_CAPABILITY,
        env,
        createCookieAuthClient,
      }),
    ).toBeUndefined();
    expect(createCookieAuthClient).not.toHaveBeenCalled();
  });

  it("rejects the known Production ref before any URL or client use", () => {
    const productionUrl =
      `https://${CARESLINK_PRODUCTION_SUPABASE_REF}.supabase.co`;
    const env = {
      ...enabledEnv(),
      CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_EXPECTED_SUPABASE_REF:
        CARESLINK_PRODUCTION_SUPABASE_REF,
      SUPABASE_URL: productionUrl,
      NEXT_PUBLIC_SUPABASE_URL: productionUrl,
    };
    const createCookieAuthClient = vi.fn();

    expect(
      resolveCommunicationNoteGenerationPrincipalCompositionGuard(env),
    ).toEqual({ enabled: false, reason: "production_target_denied" });
    expect(
      createCommunicationNoteGenerationPrincipalComposition({
        capability:
          CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_COMPOSITION_TEST_CAPABILITY,
        env,
        createCookieAuthClient,
      }),
    ).toBeUndefined();
    expect(createCookieAuthClient).not.toHaveBeenCalled();
  });

  it.each([
    ["http", `http://${PREVIEW_REF}.supabase.co`],
    ["host suffix", `https://${PREVIEW_REF}.supabase.co.evil.example`],
    ["userinfo", `https://user@${PREVIEW_REF}.supabase.co`],
    ["explicit port", `https://${PREVIEW_REF}.supabase.co:443`],
    ["trailing slash", `${PREVIEW_URL}/`],
    ["path", `${PREVIEW_URL}/rest/v1`],
    ["query", `${PREVIEW_URL}?target=other`],
    ["fragment", `${PREVIEW_URL}#target`],
    ["leading whitespace", ` ${PREVIEW_URL}`],
  ])("rejects a non-canonical %s Supabase URL", (_name, invalidUrl) => {
    for (const field of ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"] as const) {
      const env = { ...enabledEnv(), [field]: invalidUrl };
      expect(
        resolveCommunicationNoteGenerationPrincipalCompositionGuard(env),
      ).toEqual({ enabled: false, reason: "supabase_target_unverified" });
    }
  });

  it.each([
    {
      name: "server publishable key missing",
      override: { SUPABASE_PUBLISHABLE_KEY: undefined },
    },
    {
      name: "public publishable key malformed",
      override: { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "anon-key" },
    },
    {
      name: "publishable keys mismatch",
      override: {
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
          "sb_publishable_abcdefghijklmnopqrstuvwxyz1234567890",
      },
    },
  ])("rejects $name without fallback", ({ override }) => {
    const env = { ...enabledEnv(), ...override };
    expect(
      resolveCommunicationNoteGenerationPrincipalCompositionGuard(env),
    ).toEqual({ enabled: false, reason: "publishable_key_unavailable" });
  });

  it("does not read or depend on any generic, dedicated or privacy service credential", () => {
    const forbidden = new Set([
      "CARESLINK_COMMUNICATION_NOTE_SESSION_STATUS_PREVIEW_SECRET_KEY",
      "CARESLINK_V1_PRIVACY_REVIEW_PREVIEW_SERVICE_ROLE_KEY",
      "SUPABASE_SECRET_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);
    const env = new Proxy(enabledEnv(), {
      get(target, property, receiver) {
        if (typeof property === "string" && forbidden.has(property)) {
          throw new Error(`forbidden credential read: ${property}`);
        }
        return Reflect.get(target, property, receiver);
      },
    });

    expect(
      resolveCommunicationNoteGenerationPrincipalCompositionGuard(env),
    ).toMatchObject({ enabled: true });
  });

  it.each([`Bearer ${PRIVATE_VALUE}`, `Basic ${PRIVATE_VALUE}`, "", " "])(
    "rejects every Authorization header before the only client factory: %j",
    async (authorization) => {
      const createCookieAuthClient = vi.fn();
      const resolver = createCommunicationNoteGenerationPrincipalComposition({
        capability:
          CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_COMPOSITION_TEST_CAPABILITY,
        env: enabledEnv(),
        createCookieAuthClient,
      });

      const result = await resolver?.(
        new Request("https://careslink.example.test/generate", {
          headers: { authorization },
        }),
      );

      expect(result).toEqual({
        ok: false,
        reason: "forbidden_transport",
        status: 403,
      });
      expect(createCookieAuthClient).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).not.toContain(PRIVATE_VALUE);
    },
  );

  it("does not call the session RPC when verified claims are invalid", async () => {
    const { client, rpc, getUser } = authClient({
      claimsError: { message: PRIVATE_VALUE },
    });
    const createCookieAuthClient = vi.fn(async () => client);
    const resolver = createCommunicationNoteGenerationPrincipalComposition({
      capability:
        CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_COMPOSITION_TEST_CAPABILITY,
      env: enabledEnv(),
      createCookieAuthClient,
    });

    const result = await resolver?.(cookieRequest());

    expect(result).toEqual({
      ok: false,
      reason: "auth_required",
      status: 401,
    });
    expect(createCookieAuthClient).toHaveBeenCalledOnce();
    expect(rpc).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(PRIVATE_VALUE);
  });

  it("uses one exact authenticated Cookie client after both target checks", async () => {
    const { client, getClaims, rpc, getUser } = authClient();
    const createCookieAuthClient = vi.fn(async () => client);
    const resolver = createCommunicationNoteGenerationPrincipalComposition({
      capability:
        CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_COMPOSITION_TEST_CAPABILITY,
      env: enabledEnv(),
      createCookieAuthClient,
    });

    const result = await resolver?.(cookieRequest());

    expect(createCookieAuthClient).toHaveBeenCalledOnce();
    expect(getClaims).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      COMMUNICATION_NOTE_GENERATION_CURRENT_SESSION_STATUS_RPC,
    );
    expect(rpc.mock.calls[0]).toHaveLength(1);
    expect(getUser).toHaveBeenCalledOnce();
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
    expect(result && Object.isFrozen(result)).toBe(true);
    expect(result?.ok && Object.isFrozen(result.principal)).toBe(true);
  });

  it("fails closed before Cookie Auth when the frozen target configuration drifts", async () => {
    const env = enabledEnv();
    const createCookieAuthClient = vi.fn();
    const resolver = createCommunicationNoteGenerationPrincipalComposition({
      capability:
        CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_COMPOSITION_TEST_CAPABILITY,
      env,
      createCookieAuthClient,
    });
    setEnv(env, "VERCEL_ENV", "production");

    await expect(resolver?.(cookieRequest())).resolves.toEqual({
      ok: false,
      reason: "unavailable",
      status: 503,
    });
    expect(createCookieAuthClient).not.toHaveBeenCalled();
  });

  it.each([
    ["composition flag", "CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_COMPOSITION_ENABLED", "false"],
    ["Vercel environment", "VERCEL_ENV", "production"],
    ["Vercel project", "VERCEL_PROJECT_ID", "prj_bbbbbbbbbbbbbbbb"],
    ["Supabase ref", "CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_EXPECTED_SUPABASE_REF", "zyxwvutsrqponmlkjihg"],
    ["Supabase URL", "SUPABASE_URL", "https://zyxwvutsrqponmlkjihg.supabase.co"],
    ["publishable key", "SUPABASE_PUBLISHABLE_KEY", "sb_publishable_zyxwvutsrqponmlkjihgfedcba0987654321"],
  ])("rejects %s snapshot drift after claims and before RPC", async (_name, key, value) => {
    const env = enabledEnv();
    const { client, getClaims, rpc, getUser } = authClient({
      onGetClaims: () => setEnv(env, key, value),
    });
    const resolver = createCommunicationNoteGenerationPrincipalComposition({
      capability:
        CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_COMPOSITION_TEST_CAPABILITY,
      env,
      createCookieAuthClient: async () => client,
    });

    await expect(resolver?.(cookieRequest())).resolves.toEqual({
      ok: false,
      reason: "unavailable",
      status: 503,
    });
    expect(getClaims).toHaveBeenCalledOnce();
    expect(rpc).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("maps an RPC exception to a fixed unavailable result without fallback", async () => {
    const { client, rpc, getUser } = authClient({ rpcThrows: true });
    const resolver = createCommunicationNoteGenerationPrincipalComposition({
      capability:
        CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_COMPOSITION_TEST_CAPABILITY,
      env: enabledEnv(),
      createCookieAuthClient: async () => client,
    });

    const result = await resolver?.(cookieRequest());

    expect(result).toEqual({
      ok: false,
      reason: "unavailable",
      status: 503,
    });
    expect(rpc).toHaveBeenCalledOnce();
    expect(getUser).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(PRIVATE_VALUE);
  });

  it("keeps the composition server-only and imports only its absent formal placeholder", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/lib/communication-note-generation-principal-composition.server.ts",
      ),
      "utf8",
    );
    const route = readFileSync(
      join(
        process.cwd(),
        "src/app/api/ai-documents/communication-note/generate/route.ts",
      ),
      "utf8",
    );
    const handler = readFileSync(
      join(
        process.cwd(),
        "src/lib/communication-note-generation-route.server.ts",
      ),
      "utf8",
    );

    expect(source).toMatch(/^import "server-only";/);
    expect(source).toContain(
      "COMMUNICATION_NOTE_GENERATION_FORMAL_PRINCIPAL_COMPOSITION =\n  undefined",
    );
    expect(source).not.toMatch(
      /CARESLINK_COMMUNICATION_NOTE_SESSION_STATUS_PREVIEW_SECRET_KEY|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|CARESLINK_V1_PRIVACY_REVIEW_PREVIEW_SERVICE_ROLE_KEY|createCaresLinkV1SessionStatusRpcClient|resolve_v1_shadow_session_status|parseDedicatedSecretKey|dedicatedPrivilegedKey|privileged_key_unavailable|credential_reuse_denied|service_role|sb_secret_/,
    );
    expect(source).not.toMatch(
      /console\.|logger\.|request\.json\(|request\.url|user_metadata|raw_user_meta_data/,
    );
    expect(route).not.toContain(
      "communication-note-generation-principal-composition",
    );
    expect(handler).toContain(
      "communication-note-generation-principal-composition",
    );
    expect(handler).toContain(
      "COMMUNICATION_NOTE_GENERATION_FORMAL_PRINCIPAL_COMPOSITION",
    );
    expect(handler).not.toContain(
      "createCommunicationNoteGenerationPrincipalComposition",
    );
  });
});

function enabledEnv(): CommunicationNoteGenerationPrincipalCompositionEnv {
  return {
    CARESLINK_COMMUNICATION_NOTE_GENERATION_API_ENABLED: "true",
    CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_COMPOSITION_ENABLED: "true",
    CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_EXPECTED_SUPABASE_REF: PREVIEW_REF,
    CARESLINK_COMMUNICATION_NOTE_PRINCIPAL_EXPECTED_VERCEL_PROJECT_ID:
      VERCEL_PROJECT_ID,
    CARESLINK_V1_PRODUCT_API_ENABLED: "true",
    SUPABASE_URL: PREVIEW_URL,
    NEXT_PUBLIC_SUPABASE_URL: PREVIEW_URL,
    SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_PROJECT_ID,
    VERCEL_TARGET_ENV: "preview",
  };
}

function cookieRequest() {
  return new Request("https://careslink.example.test/generate");
}

type AuthClientOptions = Readonly<{
  claimsError?: { message?: string };
  onGetClaims?: () => void;
  rpcThrows?: boolean;
}>;

function authClient(options: AuthClientOptions = {}) {
  const getClaims = vi.fn(async () => {
    options.onGetClaims?.();
    return options.claimsError
      ? { data: null, error: options.claimsError }
      : {
          data: { claims: { sub: USER_ID, session_id: SESSION_ID } },
          error: null,
        };
  });
  const getUser = vi.fn(async () => ({
    data: { user: { id: USER_ID } },
    error: null,
  }));
  const rpc = vi.fn(async () => {
    if (options.rpcThrows) {
      throw new Error(`${PRIVATE_VALUE}: upstream detail`);
    }
    return { data: "ACTIVE", error: null };
  });
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

function setEnv(
  env: CommunicationNoteGenerationPrincipalCompositionEnv,
  key: string,
  value: string,
) {
  (env as Record<string, string | undefined>)[key] = value;
}
