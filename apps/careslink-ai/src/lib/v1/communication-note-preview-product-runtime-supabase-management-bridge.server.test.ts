import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import * as bridge from "./communication-note-preview-product-runtime-supabase-management-bridge.server";

const NOW = "2026-09-01T12:00:00.000Z";
const TARGET_PROJECT_REF = "abcdefghijklmnopqrst";
const TOKEN_URL = "https://api.supabase.com/v1/oauth/token";
const BRANCHES_URL =
  "https://api.supabase.com/v1/projects/adocsnwnslxhxcjgbyee/branches";
const CLIENT_ID = "7673bde9-be72-4d75-bd5e-b0dba2c49b38";
const CLIENT_SECRET = "m1v-client-secret-value";
const REFRESH_TOKEN = "m1v-refresh-token-value";
const ROTATED_REFRESH_TOKEN = "m1v-rotated-refresh-token-value";
const ACCESS_TOKEN = "m1v-access-token-value";
const APP_SHA256 = sha256("m1v-app");
const GRANT_SHA256 = sha256("m1v-grant");
const PRINCIPAL_SHA256 = sha256("m1v-principal");
const CREDENTIAL_SHA256 = sha256("m1v-credential");
const FIXED_FAILURE = Object.freeze({
  code: "PRODUCT_API_DISABLED",
  message:
    "Communication Note preview Supabase management bridge is unavailable",
});

describe("Communication Note M1v Supabase management bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the formal bridge fixed off and publishes the exact source boundary", async () => {
    expect(Object.keys(bridge).sort()).toEqual([
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_SUPABASE_MANAGEMENT_BRIDGE",
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_SUPABASE_MANAGEMENT_BRIDGE_POLICY",
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_SUPABASE_MANAGEMENT_BRIDGE_POLICY_DIGEST",
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_SUPABASE_MANAGEMENT_BRIDGE_READY",
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_SUPABASE_MANAGEMENT_BRIDGE_VERSION",
      "createCaresLinkV1CommunicationNotePreviewProductRuntimeSupabaseManagementBridge",
      "createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeSupabaseManagementBridge",
    ]);
    expect(
      bridge.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_SUPABASE_MANAGEMENT_BRIDGE_READY,
    ).toBe(false);
    expect(
      bridge.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_SUPABASE_MANAGEMENT_BRIDGE,
    ).toBeUndefined();
    expect(
      bridge.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_SUPABASE_MANAGEMENT_BRIDGE_POLICY_DIGEST,
    ).toBe(
      "2c4c87bb7a15f3b101fd78c4438f44ed8b2e6dd28f782a615b92f87029e43c68",
    );
    expect(
      bridge.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_SUPABASE_MANAGEMENT_BRIDGE_POLICY,
    ).toMatchObject({
      status: "SOURCE_SUPABASE_MANAGEMENT_BRIDGE_NOT_ACTIVATED",
      productionAllowed: false,
      oauthScope: "environment:read",
      oauthRefreshMaximumCallsPerBundle: 1,
      oauthRefreshTokenRotationPersisted: false,
      oauthResponseScopeExactWhenPresent: "environment:read",
      oauthReferencesVerifiedBeforeTokenRequest: true,
      managementRequestMaximumCallsPerInvocation: 1,
      unauthorizedRefreshAndReplayAllowed: false,
      redirectsAllowed: false,
      retriesAllowed: false,
      automaticRetries: 0,
      requestTimeoutMs: 5_000,
      tokenResponseMaximumBytes: 32 * 1_024,
      branchResponseMaximumBytes: 128 * 1_024,
      attestedCredentialMaximumRemainingMs: 5 * 60 * 1_000,
      sameRootAbortSignalRequired: true,
      accessTokenActiveOnlyDuringCredentialCallback: true,
      liveEvidencePresent: false,
      deploymentApproved: false,
      activationApproved: false,
    });
    await expect(
      bridge.createCaresLinkV1CommunicationNotePreviewProductRuntimeSupabaseManagementBridge(
        { secret: CLIENT_SECRET },
        { secret: REFRESH_TOKEN },
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);

    const source = readFileSync(
      new URL(
        "./communication-note-preview-product-runtime-supabase-management-bridge.server.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(source).not.toMatch(
      /process\.env|import\.meta\.env|console\.|\blogger\b|versions\/latest|service[_-]?role/i,
    );
  });

  it("refreshes once before use, reuses the bounded credential, and performs one exact branch GET", async () => {
    const harness = validHarness();
    const composed = await compose(harness);
    harness.responses.push(
      response(
        200,
        BRANCHES_URL,
        JSON.stringify([
          {
            id: "11111111-1111-4111-8111-111111111111",
            project_ref: TARGET_PROJECT_REF,
          },
        ]),
      ),
    );
    let result: unknown;
    const first = vi.fn(async (accessToken: string) => {
      result = await composed.supabaseManagementHttpsPort.request(
        branchesRequest(),
        accessToken,
        harness.context,
      );
    });
    const second = vi.fn(async () => undefined);

    await composed.supabaseManagementCredentialPort.consume(
      credentialRequest(),
      harness.context,
      first,
    );
    await composed.supabaseManagementCredentialPort.consume(
      credentialRequest(),
      harness.context,
      second,
    );

    expect(harness.consumeIntake).toHaveBeenCalledTimes(1);
    expect(harness.requestHttps).toHaveBeenCalledTimes(2);
    const [tokenRequest, tokenContext] = harness.requestHttps.mock.calls[0] as [
      Record<string, unknown>,
      unknown,
    ];
    expect(tokenContext).toMatchObject({ signal: harness.context.signal });
    expect(tokenRequest).toEqual({
      method: "POST",
      url: TOKEN_URL,
      headers: {
        accept: "application/json",
        authorization: `Basic ${Buffer.from(
          `${CLIENT_ID}:${CLIENT_SECRET}`,
          "utf8",
        ).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new TextEncoder().encode(
        `grant_type=refresh_token&refresh_token=${encodeURIComponent(
          REFRESH_TOKEN,
        )}`,
      ),
      redirect: "ERROR",
      automaticRetries: 0,
      timeoutMs: 5_000,
      maximumResponseBytes: 32 * 1_024,
    });
    expect(first).toHaveBeenCalledWith(
      ACCESS_TOKEN,
      expect.objectContaining({
        status:
          "ATTESTED_SUPABASE_MANAGEMENT_API_CREDENTIAL_NOT_APPROVED",
        oauthScope: "environment:read",
        oauthAppReferenceSha256: APP_SHA256,
        oauthGrantReferenceSha256: GRANT_SHA256,
        observedAt: NOW,
        expiresAt: "2026-09-01T12:05:00.000Z",
        rawCredentialMaterialPresent: false,
      }),
    );
    expect(second).toHaveBeenCalledWith(
      ACCESS_TOKEN,
      expect.objectContaining({ expiresAt: "2026-09-01T12:05:00.000Z" }),
    );

    expect(result).toEqual({
      status: 200,
      contentType: "application/json",
      redirected: false,
      responseUrl: BRANCHES_URL,
      body: new TextEncoder().encode(
        JSON.stringify([
          {
            id: "11111111-1111-4111-8111-111111111111",
            project_ref: TARGET_PROJECT_REF,
          },
        ]),
      ),
      rawCredentialMaterialPresent: false,
    });
    expect(harness.requestHttps).toHaveBeenCalledTimes(2);
    expect(harness.requestHttps.mock.calls[1]?.[0]).toEqual({
      method: "GET",
      url: BRANCHES_URL,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      body: undefined,
      redirect: "ERROR",
      automaticRetries: 0,
      timeoutMs: 5_000,
      maximumResponseBytes: 128 * 1_024,
    });
    expect(harness.requestHttps.mock.calls[1]?.[1]).toMatchObject({
      signal: harness.context.signal,
    });
    expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);
    expect(JSON.stringify(result)).not.toContain(REFRESH_TOKEN);
    await expect(
      composed.supabaseManagementHttpsPort.request(
        branchesRequest(),
        ACCESS_TOKEN,
        harness.context,
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(harness.requestHttps).toHaveBeenCalledTimes(2);
  });

  it("returns one 401 envelope, clears the token, and never refreshes or replays in that invocation", async () => {
    const harness = validHarness();
    const composed = await compose(harness);
    harness.responses.push(response(401, BRANCHES_URL, '{"error":"revoked"}'));
    let unauthorizedResponse: unknown;
    await composed.supabaseManagementCredentialPort.consume(
      credentialRequest(),
      harness.context,
      vi.fn(async (accessToken: string) => {
        unauthorizedResponse =
          await composed.supabaseManagementHttpsPort.request(
            branchesRequest(),
            accessToken,
            harness.context,
          );
      }),
    );
    expect(unauthorizedResponse).toMatchObject({ status: 401 });
    await expect(
      composed.supabaseManagementHttpsPort.request(
        branchesRequest(),
        ACCESS_TOKEN,
        harness.context,
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    await expect(
      composed.supabaseManagementCredentialPort.consume(
        credentialRequest(),
        harness.context,
        vi.fn(async () => undefined),
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(harness.consumeIntake).toHaveBeenCalledTimes(1);
    expect(harness.requestHttps).toHaveBeenCalledTimes(2);
  });

  it("fails closed on redirect, oversized response, wrong request, swapped signal, or abort without retry", async () => {
    const redirected = validHarness();
    redirected.responses[0] = Object.freeze({
      ...response(200, TOKEN_URL, tokenJson()),
      redirected: true,
    });
    const redirectedBridge = await compose(redirected);
    await expect(
      redirectedBridge.supabaseManagementCredentialPort.consume(
        credentialRequest(),
        redirected.context,
        vi.fn(async () => undefined),
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(redirected.requestHttps).toHaveBeenCalledTimes(1);

    const oversized = validHarness();
    oversized.responses[0] = response(
      200,
      TOKEN_URL,
      "x".repeat(32 * 1_024 + 1),
    );
    const oversizedBridge = await compose(oversized);
    await expect(
      oversizedBridge.supabaseManagementCredentialPort.consume(
        credentialRequest(),
        oversized.context,
        vi.fn(async () => undefined),
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(oversized.requestHttps).toHaveBeenCalledTimes(1);

    const harness = validHarness();
    const composed = await compose(harness);
    await composed.supabaseManagementCredentialPort.consume(
      credentialRequest(),
      harness.context,
      vi.fn(async () => undefined),
    );
    await expect(
      composed.supabaseManagementHttpsPort.request(
        { ...branchesRequest(), redirect: "FOLLOW" },
        ACCESS_TOKEN,
        harness.context,
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    await expect(
      composed.supabaseManagementHttpsPort.request(
        branchesRequest(),
        ACCESS_TOKEN,
        Object.freeze({ signal: new AbortController().signal }),
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    harness.controller.abort();
    await expect(
      composed.supabaseManagementHttpsPort.request(
        branchesRequest(),
        ACCESS_TOKEN,
        harness.context,
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(harness.requestHttps).toHaveBeenCalledTimes(1);
  });

  it("rejects over-scoped OAuth tokens, non-UUID clients, and aliased evidence", async () => {
    const overScoped = validHarness();
    overScoped.responses[0] = response(
      200,
      TOKEN_URL,
      JSON.stringify({
        access_token: ACCESS_TOKEN,
        token_type: "bearer",
        expires_in: 3_600,
        scope: "environment:read projects:read",
      }),
    );
    await expect(
      (await compose(overScoped)).supabaseManagementCredentialPort.consume(
        credentialRequest(),
        overScoped.context,
        vi.fn(async () => undefined),
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(overScoped.requestHttps).toHaveBeenCalledTimes(1);

    const nonUuid = validHarness({
      consumeIntake: vi.fn(async (_context, consumer) => {
        await consumer(
          Object.freeze({
            ...intakeCredential(),
            clientId: "not-a-supabase-oauth-client-id",
          }),
        );
      }),
    });
    await expect(
      (await compose(nonUuid)).supabaseManagementCredentialPort.consume(
        credentialRequest(),
        nonUuid.context,
        vi.fn(async () => undefined),
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(nonUuid.requestHttps).not.toHaveBeenCalled();

    const mismatched = validHarness();
    const mismatchedBridge = await compose(mismatched);
    const mismatchedRequest = Object.freeze({
      ...credentialRequest(),
      oauthAppReferenceSha256: sha256("m1v-other-oauth-app"),
    });
    await expect(
      mismatchedBridge.supabaseManagementCredentialPort.consume(
        mismatchedRequest,
        mismatched.context,
        vi.fn(async () => undefined),
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    await expect(
      mismatchedBridge.supabaseManagementCredentialPort.consume(
        mismatchedRequest,
        mismatched.context,
        vi.fn(async () => undefined),
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(mismatched.consumeIntake).toHaveBeenCalledTimes(1);
    expect(mismatched.requestHttps).not.toHaveBeenCalled();

    const aliased = validHarness();
    await expect(
      (await compose(aliased)).supabaseManagementCredentialPort.consume(
        Object.freeze({
          ...credentialRequest(),
          sourceManifestEvidenceSha256: sha256("m1v-source"),
        }),
        aliased.context,
        vi.fn(async () => undefined),
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(aliased.consumeIntake).not.toHaveBeenCalled();
    expect(aliased.requestHttps).not.toHaveBeenCalled();
  });

  it("rejects a late or repeated intake callback and maps secret-bearing transport failures to the fixed error", async () => {
    let retained: ((value: unknown) => PromiseLike<void>) | undefined;
    const repeated = validHarness({
      consumeIntake: vi.fn(async (_context, consumer) => {
        retained = consumer;
        await consumer(intakeCredential());
        await consumer(intakeCredential());
      }),
    });
    const repeatedBridge = await compose(repeated);
    await expect(
      repeatedBridge.supabaseManagementCredentialPort.consume(
        credentialRequest(),
        repeated.context,
        vi.fn(async () => undefined),
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    await expect(retained?.(intakeCredential())).rejects.toMatchObject(
      FIXED_FAILURE,
    );

    const failed = validHarness({
      requestHttps: vi.fn(async () => {
        throw new Error(`${CLIENT_SECRET}:${REFRESH_TOKEN}:${ACCESS_TOKEN}`);
      }),
    });
    const failedBridge = await compose(failed);
    let caught: unknown;
    try {
      await failedBridge.supabaseManagementCredentialPort.consume(
        credentialRequest(),
        failed.context,
        vi.fn(async () => undefined),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject(FIXED_FAILURE);
    expect(JSON.stringify(caught)).not.toContain(CLIENT_SECRET);
    expect(JSON.stringify(caught)).not.toContain(REFRESH_TOKEN);
    expect(JSON.stringify(caught)).not.toContain(ACCESS_TOKEN);
    expect(failed.requestHttps).toHaveBeenCalledTimes(1);
  });
});

function validHarness(overrides: {
  requestHttps?: ReturnType<typeof vi.fn>;
  consumeIntake?: ReturnType<typeof vi.fn>;
} = {}) {
  const responses: Array<Record<string, unknown>> = [
    response(200, TOKEN_URL, tokenJson()),
  ];
  const requestHttps =
    overrides.requestHttps ??
    vi.fn(async () => {
      const next = responses.shift();
      if (!next) throw new Error("unexpected transport call");
      return next;
    });
  const consumeIntake =
    overrides.consumeIntake ??
    vi.fn(
      async (
        _context: unknown,
        consumer: (value: unknown) => PromiseLike<void>,
      ) => {
        await consumer(intakeCredential());
      },
    );
  const controller = new AbortController();
  const context = Object.freeze({ signal: controller.signal });
  return {
    options: Object.freeze({
      capability: "TEST_ONLY_M1V_SUPABASE_MANAGEMENT_BRIDGE",
      httpsTransport: Object.freeze({ request: requestHttps }),
      intakeCredentialCustodyPort: Object.freeze({ consume: consumeIntake }),
      clock: Object.freeze({ now: vi.fn(() => NOW) }),
    }),
    requestHttps,
    consumeIntake,
    responses,
    controller,
    context,
  };
}

async function compose(harness = validHarness()) {
  return bridge.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeSupabaseManagementBridge(
    harness.options,
    harness.context,
  );
}

function intakeCredential() {
  return Object.freeze({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    refreshToken: REFRESH_TOKEN,
    oauthAppReferenceSha256: APP_SHA256,
    oauthGrantReferenceSha256: GRANT_SHA256,
    principalReferenceSha256: PRINCIPAL_SHA256,
    credentialReferenceSha256: CREDENTIAL_SHA256,
  });
}

function credentialRequest() {
  return Object.freeze({
    purpose: "CONSUME_SUPABASE_MANAGEMENT_API_OAUTH2_ACCESS_TOKEN",
    managementApiOrigin: "https://api.supabase.com",
    authorizationModel: "SUPABASE_OAUTH_APP_SCOPE",
    oauthScope: "environment:read",
    oauthAppReferenceSha256: APP_SHA256,
    oauthGrantReferenceSha256: GRANT_SHA256,
    scopeAttestationSource: "PINNED_OAUTH_APP_CONFIGURATION_AND_GRANT",
    endpointAllowlistEnforced: true,
    productionProjectRef: "adocsnwnslxhxcjgbyee",
    targetProjectRef: TARGET_PROJECT_REF,
    sourceRevisionSha256: sha256("m1v-source"),
    deploymentIdentityEvidenceSha256: sha256("m1v-deployment"),
    sourceManifestEvidenceSha256: sha256("m1v-manifest"),
  });
}

function branchesRequest() {
  return Object.freeze({
    method: "GET",
    url: BRANCHES_URL,
    headers: Object.freeze({ accept: "application/json" }),
    redirect: "ERROR",
    timeoutMs: 5_000,
    maximumResponseBytes: 128 * 1_024,
  });
}

function response(status: number, responseUrl: string, body: string) {
  return Object.freeze({
    status,
    contentType: "application/json",
    redirected: false,
    responseUrl,
    body: new TextEncoder().encode(body),
  });
}

function tokenJson() {
  return JSON.stringify({
    access_token: ACCESS_TOKEN,
    token_type: "bearer",
    expires_in: 3_600,
    refresh_token: ROTATED_REFRESH_TOKEN,
    scope: "environment:read",
  });
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
