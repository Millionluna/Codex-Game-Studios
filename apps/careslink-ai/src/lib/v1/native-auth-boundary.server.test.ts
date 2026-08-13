import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CARESLINK_V1_NATIVE_AUTH_ENDPOINT_DESIGN,
  CARESLINK_V1_NATIVE_AUTH_EXPECTED_SUPABASE_REF_FLAG,
  CARESLINK_V1_NATIVE_AUTH_FEATURE_FLAG,
  CARESLINK_V1_NATIVE_AUTH_IMPLEMENTATION_READY,
  CARESLINK_V1_NATIVE_AUTH_SECURITY_POLICY,
  CARESLINK_V1_NATIVE_AUTH_UNFROZEN_BLOCKERS,
  handleCaresLinkV1NativeAuthDisabledBoundary,
  resolveCaresLinkV1NativeAuthPreviewGuard,
  type CaresLinkV1NativePkceCallbackRequest,
  type CaresLinkV1NativeRevokeSessionResponse,
} from "./native-auth-boundary.server";
import { CARESLINK_V1_CONTRACT_VERSION } from "./shared-contracts";
import {
  CARESLINK_V1_HEADER_NAMES,
  CARESLINK_V1_MINIMUM_CLIENT_VERSION,
} from "./transport-contract";

const PREVIEW_REF = "nativepreview123";
const PRODUCTION_REF = "adocsnwnslxhxcjgbyee";
const CORRELATION_ID = "native-auth-correlation-0001";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CaresLink V1 native-auth Preview boundary", () => {
  it("freezes all four capabilities as disabled design-only endpoints", () => {
    expect(CARESLINK_V1_NATIVE_AUTH_IMPLEMENTATION_READY).toBe(false);
    expect(CARESLINK_V1_NATIVE_AUTH_FEATURE_FLAG).toBe(
      "CARESLINK_V1_NATIVE_AUTH_ENABLED",
    );
    expect(CARESLINK_V1_NATIVE_AUTH_EXPECTED_SUPABASE_REF_FLAG).toBe(
      "CARESLINK_V1_NATIVE_AUTH_EXPECTED_SUPABASE_REF",
    );
    expect(CARESLINK_V1_NATIVE_AUTH_ENDPOINT_DESIGN).toMatchObject({
      nativePkceCallback: {
        path: "/v1/auth/native/callback",
        method: "POST",
        response: "NOT_IMPLEMENTED_ERROR_ENVELOPE_ONLY",
        successResponse: "UNFROZEN_NO_TOKEN_BODY_ALLOWED",
        capability: false,
      },
      sessions: {
        path: "/v1/auth/sessions",
        method: "GET",
        authentication: "BEARER_HEADER_ONLY",
        capability: false,
      },
      devices: {
        path: "/v1/auth/devices",
        method: "GET",
        authentication: "BEARER_HEADER_ONLY",
        capability: false,
      },
      revokeSession: {
        path: "/v1/auth/sessions/{sessionId}/revoke",
        method: "POST",
        request: "SESSION_ID_PATH_ONLY_NO_BODY",
        capability: false,
      },
    });
    expect(
      Object.values(CARESLINK_V1_NATIVE_AUTH_ENDPOINT_DESIGN).every(
        (endpoint) => endpoint.capability === false,
      ),
    ).toBe(true);
  });

  it("keeps every physical 501 boundary documented as an unserved capability", () => {
    const openApi = readFileSync(
      join(process.cwd(), "contracts/careslink-v1-shadow.openapi.yaml"),
      "utf8",
    );
    for (const endpoint of Object.values(
      CARESLINK_V1_NATIVE_AUTH_ENDPOINT_DESIGN,
    )) {
      const pathBlock = getOpenApiPathBlock(openApi, endpoint.path);
      expect(pathBlock).toContain(
        "x-careslink-availability: not-implemented",
      );
      expect(pathBlock).toContain("x-careslink-served: false");
      expect(pathBlock).toContain('"501":');
      expect(pathBlock).not.toMatch(/x-careslink-served: true/);
    }
  });

  it("distinguishes the single-use PKCE code from access and refresh tokens", () => {
    const callback: CaresLinkV1NativePkceCallbackRequest = {
      authorizationCode: "single-use-code",
      codeVerifier: "memory-only-verifier",
      redirectUri: "careslink://auth/callback",
      state: "state-bound-to-native-attempt",
      platform: "ios",
    };

    expect(callback).not.toHaveProperty("accessToken");
    expect(callback).not.toHaveProperty("refreshToken");
    expect(CARESLINK_V1_NATIVE_AUTH_SECURITY_POLICY).toEqual({
      accessTokenTransport: "AUTHORIZATION_BEARER_HEADER_ONLY",
      refreshTokenTransport: "NOT_SUPPORTED_BY_THIS_CONTRACT",
      authorizationCodeReceipt: "NATIVE_DEEP_LINK_CALLBACK_MEMORY_ONLY",
      authorizationCodeForwarding: "EPHEMERAL_JSON_BODY_ONLY",
      authorizationCodeUse: "SINGLE_USE",
      codeVerifierTransport: "EPHEMERAL_JSON_BODY_ONLY",
      accessOrRefreshTokenInUrl: "FORBIDDEN",
      accessOrRefreshTokenInBody: "FORBIDDEN",
      credentialLoggingOrAnalytics: "FORBIDDEN",
      credentialDraftOrOutboxPersistence: "FORBIDDEN",
      credentialErrorReflection: "FORBIDDEN",
      revokeCleanup: "CURRENT_SESSION_ONLY_SIGN_OUT_WIPE_REBUILD",
    });
  });

  it("keeps unresolved PKCE security decisions as explicit enablement blockers", () => {
    expect(CARESLINK_V1_NATIVE_AUTH_UNFROZEN_BLOCKERS).toEqual({
      stateValidation: "UNFROZEN",
      redirectUriAllowlist: "UNFROZEN",
      pkceS256Verification: "UNFROZEN",
      authorizationCodeReplayStorage: "UNFROZEN",
      tokenHandoff: "UNFROZEN_ACCESS_REFRESH_TOKEN_BODY_FORBIDDEN",
    });
    expect(
      Object.values(CARESLINK_V1_NATIVE_AUTH_UNFROZEN_BLOCKERS).every((value) =>
        value.startsWith("UNFROZEN"),
      ),
    ).toBe(true);
    expect(CARESLINK_V1_NATIVE_AUTH_IMPLEMENTATION_READY).toBe(false);
  });

  it("wipes local runtime only when the revoked session is current", () => {
    const currentSession: CaresLinkV1NativeRevokeSessionResponse = {
      sessionId: "current-session",
      status: "REVOKED",
      revokedAt: "2026-08-11T00:00:00.000Z",
      revokedCurrentSession: true,
      clientCleanup: "SIGN_OUT_WIPE_REBUILD",
    };
    const remoteSession: CaresLinkV1NativeRevokeSessionResponse = {
      sessionId: "remote-session",
      status: "REVOKED",
      revokedAt: "2026-08-11T00:00:00.000Z",
      revokedCurrentSession: false,
      clientCleanup: "NONE",
    };

    for (const response of [currentSession, remoteSession]) {
      expect(response.clientCleanup).toBe(
        response.revokedCurrentSession ? "SIGN_OUT_WIPE_REBUILD" : "NONE",
      );
    }
  });

  it.each([
    [{}, "non_preview_environment"],
    [
      {
        ...configuredPreviewEnv(),
        VERCEL_ENV: "production",
      },
      "production_environment",
    ],
    [
      {
        ...configuredPreviewEnv(),
        CARESLINK_V1_NATIVE_AUTH_ENABLED: undefined,
      },
      "feature_disabled",
    ],
    [
      {
        ...configuredPreviewEnv(),
        CARESLINK_V1_NATIVE_AUTH_ENABLED: "TRUE",
      },
      "feature_disabled",
    ],
    [
      {
        ...configuredPreviewEnv(),
        CARESLINK_V1_NATIVE_AUTH_EXPECTED_SUPABASE_REF: "anotherpreview123",
      },
      "target_unverified",
    ],
    [
      {
        ...configuredPreviewEnv(),
        SUPABASE_URL: "http://nativepreview123.supabase.co",
      },
      "target_unverified",
    ],
    [
      {
        ...configuredPreviewEnv(),
        CARESLINK_V1_NATIVE_AUTH_EXPECTED_SUPABASE_REF: PRODUCTION_REF,
        SUPABASE_URL: `https://${PRODUCTION_REF}.supabase.co`,
      },
      "production_target_denied",
    ],
  ] as const)("fails closed for %j", (env, reason) => {
    expect(resolveCaresLinkV1NativeAuthPreviewGuard(env)).toMatchObject({
      enabled: false,
      configurationReady: false,
      reason,
    });
  });

  it("stops a fully matched Preview configuration at implementation_not_ready", () => {
    expect(
      resolveCaresLinkV1NativeAuthPreviewGuard(configuredPreviewEnv()),
    ).toEqual({
      enabled: false,
      configurationReady: true,
      targetSupabaseRef: PREVIEW_REF,
      reason: "implementation_not_ready",
    });
  });

  it("returns a fixed 501 envelope without reading or reflecting request secrets", async () => {
    const consoleSpies = [
      vi.spyOn(console, "debug").mockImplementation(() => undefined),
      vi.spyOn(console, "info").mockImplementation(() => undefined),
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];
    const secrets = {
      accessToken: "access-token-must-not-leak-0001",
      refreshToken: "refresh-token-must-not-leak-0001",
      authorizationCode: "single-use-code-must-not-leak-0001",
      codeVerifier: "pkce-verifier-must-not-leak-0001",
      incomingCorrelationId: "incoming-correlation-must-not-be-reflected",
    };
    const request = new Request(
      `https://preview.example.test/v1/auth/native/callback?code=${secrets.authorizationCode}&access_token=${secrets.accessToken}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${secrets.accessToken}`,
          cookie: `refresh_token=${secrets.refreshToken}`,
          "content-type": "application/json",
          [CARESLINK_V1_HEADER_NAMES.correlationId]:
            secrets.incomingCorrelationId,
        },
        body: JSON.stringify({
          authorizationCode: secrets.authorizationCode,
          codeVerifier: secrets.codeVerifier,
          accessToken: secrets.accessToken,
          refreshToken: secrets.refreshToken,
        }),
      },
    );

    const response = handleCaresLinkV1NativeAuthDisabledBoundary(request, {
      createCorrelationId: () => CORRELATION_ID,
    });
    const text = await response.text();

    expect(response.status).toBe(501);
    expect(JSON.parse(text)).toEqual({
      error: {
        code: "NOT_IMPLEMENTED",
        message: "Native authentication management is not implemented",
        correlationId: CORRELATION_ID,
      },
    });
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get(CARESLINK_V1_HEADER_NAMES.contractVersion)).toBe(
      CARESLINK_V1_CONTRACT_VERSION,
    );
    expect(
      response.headers.get(CARESLINK_V1_HEADER_NAMES.minimumClientVersion),
    ).toBe(CARESLINK_V1_MINIMUM_CLIENT_VERSION);
    expect(response.headers.get(CARESLINK_V1_HEADER_NAMES.correlationId)).toBe(
      CORRELATION_ID,
    );
    for (const secret of Object.values(secrets)) {
      expect(text).not.toContain(secret);
      expect([...response.headers.values()].join(" ")).not.toContain(secret);
    }
    for (const consoleSpy of consoleSpies) {
      expect(consoleSpy).not.toHaveBeenCalled();
    }
  });

  it("keeps routes as opaque adapters with no auth, body or URL processing", () => {
    for (const [relativePath, method] of [
      ["src/app/v1/auth/native/callback/route.ts", "POST"],
      ["src/app/v1/auth/sessions/route.ts", "GET"],
      ["src/app/v1/auth/devices/route.ts", "GET"],
      ["src/app/v1/auth/sessions/[sessionId]/revoke/route.ts", "POST"],
    ] as const) {
      const source = readFileSync(join(process.cwd(), relativePath), "utf8");
      expect(source).toContain("handleCaresLinkV1NativeAuthDisabledBoundary");
      expect(source).toContain(`export function ${method}(request: Request)`);
      expect(source).not.toMatch(
        /request\.(?:json|text|formData)|new URL\(|authorization|cookie|params/,
      );
    }

    const implementation = readFileSync(
      join(process.cwd(), "src/lib/v1/native-auth-boundary.server.ts"),
      "utf8",
    );
    const handlerStart = implementation.indexOf(
      "export function handleCaresLinkV1NativeAuthDisabledBoundary",
    );
    const handlerEnd = implementation.indexOf(
      "\nfunction disabledGuard",
      handlerStart,
    );
    expect(handlerStart).toBeGreaterThanOrEqual(0);
    expect(handlerEnd).toBeGreaterThan(handlerStart);
    const handlerSource = implementation.slice(handlerStart, handlerEnd);
    expect(handlerSource).not.toMatch(
      /request\.(?:url|headers|json|text|formData)\b|console\.|logger|analytics|telemetry/i,
    );
    expect(implementation).not.toMatch(
      /exchangeCodeForSession|setSession|signOut|auth\.admin|\.rpc\(|fetch\(/,
    );
  });
});

function configuredPreviewEnv() {
  return {
    VERCEL_ENV: "preview",
    CARESLINK_V1_NATIVE_AUTH_ENABLED: "true",
    CARESLINK_V1_NATIVE_AUTH_EXPECTED_SUPABASE_REF: PREVIEW_REF,
    SUPABASE_URL: `https://${PREVIEW_REF}.supabase.co`,
  } as const;
}

function getOpenApiPathBlock(openApi: string, path: string) {
  const marker = `  ${path}:\n`;
  const start = openApi.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const remainder = openApi.slice(start + marker.length);
  const nextPath = remainder.search(/^  \/v1\//m);
  return nextPath === -1
    ? openApi.slice(start)
    : openApi.slice(start, start + marker.length + nextPath);
}
