import { createHash } from "node:crypto";
import { createRequire } from "node:module";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const oidcMocks = vi.hoisted(() => ({
  getVercelOidcTokenSync: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@vercel/oidc", () => ({
  getVercelOidcTokenSync: oidcMocks.getVercelOidcTokenSync,
}));

import * as gcpAdapters from "./communication-note-preview-product-runtime-gcp-adapters.server";
import * as gcpRestBridge from "./communication-note-preview-product-runtime-gcp-rest-bridge.server";
import * as platformAdapters from "./communication-note-preview-product-runtime-platform-adapters.server";
import * as supabaseManagementBridge from "./communication-note-preview-product-runtime-supabase-management-bridge.server";
import { createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalCustodyResolver } from "./communication-note-preview-runner-terminal-resolved-runtime-binding.server";

const crc32c = createRequire(import.meta.url)("fast-crc32c") as Readonly<{
  calculate(data: Uint8Array): number;
}>;

const NOW = "2026-09-01T12:00:00.000Z";
const SOURCE_REVISION_SHA256 = sha256("m1v-integration-source-revision");
const SOURCE_MANIFEST_SHA256 = sha256("m1v-integration-source-manifest");
const TARGET_PROJECT_REF = "abcdefghijklmnopqrst";
const PRODUCTION_PROJECT_REF = "adocsnwnslxhxcjgbyee";
const TEAM_ID = "team_cFWfAk6zAa0b7X5bc1ONT4SA";
const PROJECT_ID = "prj_AtdTukVr39wrGH9PYgKusfku2gvS";
const GCP_PROJECT = "careslink-m1u-security";
const GCP_PROJECT_NUMBER = "288554824534";
const LOCATION = "australia-southeast1";
const WIF_PROVIDER_RESOURCE =
  `//iam.googleapis.com/projects/${GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/vercel-careslink-preview/providers/vercel-team-preview`;
const WIF_SUBJECT_TOKEN_AUDIENCE =
  `https://iam.googleapis.com/projects/${GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/vercel-careslink-preview/providers/vercel-team-preview`;
const RUNTIME_SERVICE_ACCOUNT =
  `careslink-preview-runtime@${GCP_PROJECT}.iam.gserviceaccount.com`;
const IMPERSONATION_URL =
  `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${RUNTIME_SERVICE_ACCOUNT}:generateAccessToken`;
const TOKEN_URL = "https://api.supabase.com/v1/oauth/token";
const BRANCHES_URL =
  `https://api.supabase.com/v1/projects/${PRODUCTION_PROJECT_REF}/branches`;
const SOURCE_MANIFEST_KEY =
  `projects/${GCP_PROJECT}/locations/${LOCATION}/keyRings/careslink-preview-m1u/cryptoKeys/hmac-source-manifest-v1/cryptoKeyVersions/1`;
const CA_SECRET =
  `projects/${GCP_PROJECT}/locations/${LOCATION}/secrets/supabase-preview-pinned-ca-pem/versions/1`;
const DATABASE_SECRET =
  `projects/${GCP_PROJECT}/locations/${LOCATION}/secrets/supabase-preview-branch-admin-password/versions/1`;
const OAUTH_APP_REFERENCE_SHA256 = sha256("m1v-integration-oauth-app");
const OAUTH_GRANT_REFERENCE_SHA256 = sha256("m1v-integration-oauth-grant");
const MANAGEMENT_ACCESS_TOKEN = "m1v-integration-management-access-token";
const BASE_OIDC_TOKEN = simpleJwt("base");
const CUSTOM_OIDC_TOKEN = vercelOidcToken();
const FEDERATED_ACCESS_TOKEN = "m1v-integration-federated-access-token";
const IMPERSONATED_ACCESS_TOKEN =
  "m1v-integration-impersonated-access-token";
const CA_BYTES = new TextEncoder().encode(
  `-----BEGIN CERTIFICATE-----
MIIDJjCCAg6gAwIBAgIJAPceARGbgTXaMA0GCSqGSIb3DQEBCwUAMEAxIDAeBgNV
BAMMF0NhcmVzbGluayBNMXUgVGVzdCBSb290MRwwGgYDVQQKDBNDYXJlc2xpbmsg
VGVzdCBPbmx5MB4XDTI2MDkwMTA0MjU1OVoXDTM2MDgyOTA0MjU1OVowQDEgMB4G
A1UEAwwXQ2FyZXNsaW5rIE0xdSBUZXN0IFJvb3QxHDAaBgNVBAoME0NhcmVzbGlu
ayBUZXN0IE9ubHkwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDCwszq
tOGFf2n8oAK6TJSAEKsM/LVHppKQWcBCmj3J9V96aNdNXMb7ZC8Mu+Mso/f8PfYt
UrGKNQgYRbwLg9kxyU2K7qzDqhy5zfhNx+ALn6maSLSbo8Yl/mGrDcmGNU0GR2XU
YHZErI5E5RPN+ynBpW5W5+jzCI72BZDvYjtfdQfLPL+OEizvntJ0Q05bJzTA9gPQ
LWvvep7gzPgXP8eXGxSJhSQUlA4+UsSGbYhnZA+8AdLLTEczNvHgQkF7jcMQZY8u
AZn427hcAAEwcezY7wtIQaXpPslg3n6ch5n/IKHvqM4pkqKfVLRNfth0CdGSK11Z
+mkCarrf579cno6vAgMBAAGjIzAhMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/
BAQDAgEGMA0GCSqGSIb3DQEBCwUAA4IBAQAT3I4MSubdEbHIevzJTvjK9hIHFJD/
i4575IaYmd91V6MfYqc5BkllmP6aLp0X7zbimoGUBr+JwuGGGcukxbvVXOPe202I
4fOzTXtq+PjuUp/1FDuOmmRTQqV1TjfxZOZmSat9RvGln6pbbWyGWjUE9grMBd+Z
f4RMFfKz5aqGlf4Z/ljV3IYF6+yf1oJEZqzKnRyYt8ej13uidy8odsQWMnO8Hj7P
Dj2FdMox6uYFcXmcpyn5M3q08EGnnIn9NE+RD54lCBU7F6/nWmRKO6Sp8looirL7
R0JUx84ZQ1gZSZMVDUzAmObHpnp/W+GSroKSeNP9CSXY3LDhgLNXKoAW
-----END CERTIFICATE-----
`,
);
const CA_SHA256 = sha256(CA_BYTES);

describe("Communication Note M1v provider bridge integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    oidcMocks.getVercelOidcTokenSync.mockReset();
    oidcMocks.getVercelOidcTokenSync.mockReturnValue(BASE_OIDC_TOKEN);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("composes actual M1v bridges through actual M1u, M1t, M1s, M1r and M1m without PostgreSQL custody", async () => {
    const context = Object.freeze({ signal: new AbortController().signal });
    const gcpRequests: GcpHttpsRequest[] = [];
    const gcpTransportRequest = vi.fn(async (request: GcpHttpsRequest) => {
      expect(request.signal).toBe(context.signal);
      expect(request.timeoutMs).toBe(5_000);
      expect(request.redirect).toBe("ERROR");
      expect(request.automaticRetries).toBe(0);
      gcpRequests.push(request);

      if (request.url === "https://oidc.vercel.com/~token") {
        expect(readJson(request.body)).toEqual({
          token: BASE_OIDC_TOKEN,
          aud: WIF_SUBJECT_TOKEN_AUDIENCE,
        });
        return gcpResponse(request.url, {
          token: CUSTOM_OIDC_TOKEN,
          expiry: Math.floor(Date.parse(NOW) / 1_000) + 3_600,
        });
      }
      if (request.url === "https://sts.googleapis.com/v1/token") {
        const form = new URLSearchParams(new TextDecoder().decode(request.body));
        expect(form.get("audience")).toBe(WIF_PROVIDER_RESOURCE);
        expect(form.get("subject_token")).toBe(CUSTOM_OIDC_TOKEN);
        return gcpResponse(request.url, {
          access_token: FEDERATED_ACCESS_TOKEN,
          issued_token_type:
            "urn:ietf:params:oauth:token-type:access_token",
          token_type: "Bearer",
          expires_in: 3_600,
          scope: "https://www.googleapis.com/auth/cloud-platform",
        });
      }
      if (request.url === IMPERSONATION_URL) {
        expect(request.headers.authorization).toBe(
          `Bearer ${FEDERATED_ACCESS_TOKEN}`,
        );
        return gcpResponse(request.url, {
          accessToken: IMPERSONATED_ACCESS_TOKEN,
          expireTime: "2026-09-01T13:00:00.000Z",
        });
      }
      if (request.url.endsWith(":macVerify")) {
        expect(request.headers.authorization).toBe(
          `Bearer ${IMPERSONATED_ACCESS_TOKEN}`,
        );
        const name = request.url
          .slice("https://cloudkms.googleapis.com/v1/".length)
          .replace(/:macVerify$/, "");
        return gcpResponse(request.url, {
          name,
          success: true,
          verifiedDataCrc32c: true,
          verifiedMacCrc32c: true,
          verifiedSuccessIntegrity: true,
          protectionLevel: "SOFTWARE",
        });
      }
      if (request.url.endsWith(":macSign")) {
        expect(request.headers.authorization).toBe(
          `Bearer ${IMPERSONATED_ACCESS_TOKEN}`,
        );
        const name = request.url
          .slice("https://cloudkms.googleapis.com/v1/".length)
          .replace(/:macSign$/, "");
        const body = readJson(request.body) as { data: string };
        const mac = createHash("sha256")
          .update(Buffer.from(body.data, "base64"))
          .digest();
        return gcpResponse(request.url, {
          name,
          mac: mac.toString("base64"),
          macCrc32c: String(crc32c.calculate(mac)),
          verifiedDataCrc32c: true,
          protectionLevel: "SOFTWARE",
        });
      }
      if (
        request.url ===
        `https://secretmanager.${LOCATION}.rep.googleapis.com/v1/${CA_SECRET}:access`
      ) {
        expect(request.headers.authorization).toBe(
          `Bearer ${IMPERSONATED_ACCESS_TOKEN}`,
        );
        return gcpResponse(request.url, {
          name: CA_SECRET,
          payload: {
            data: Buffer.from(CA_BYTES).toString("base64"),
            dataCrc32c: String(crc32c.calculate(CA_BYTES)),
          },
        });
      }
      throw new Error("unexpected GCP REST request");
    });

    const lowLevelGcp =
      gcpRestBridge.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeGcpRestBridge(
        Object.freeze({
          capability: "TEST_ONLY_M1V_GCP_REST_BRIDGE",
          httpsTransport: Object.freeze({ request: gcpTransportRequest }),
        }),
        context,
      );
    const gcpBundle =
      await gcpAdapters.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeGcpAdapters(
        {
          capability: "TEST_ONLY_M1U_GCP_PROVIDER_ADAPTERS",
          ...lowLevelGcp,
          sourceManifestAttestation: deepFreezeFixture({
            binding: {
              schemaVersion:
                "source-manifest.communication-note.preview.2026-09-01.m1u.v1",
              sourceRevisionSha256: SOURCE_REVISION_SHA256,
              sourceManifestSha256: SOURCE_MANIFEST_SHA256,
              targetProjectRef: TARGET_PROJECT_REF,
              tlsRootCertificateSha256: CA_SHA256,
              vercelTeamId: TEAM_ID,
              vercelProjectId: PROJECT_ID,
              vercelEnvironment: "preview",
              postgresMajor: 17,
              connectionMode: "DIRECT",
              keyVersion: SOURCE_MANIFEST_KEY,
            },
            mac: createHash("sha256")
              .update("m1v-integration-source-manifest-mac")
              .digest(),
          }),
          clock: Object.freeze({ now: vi.fn(() => NOW) }),
        },
        context,
      );

    const managementRequests: Array<Record<string, unknown>> = [];
    const managementTransport = vi.fn(
      async (requestValue: unknown, contextValue: unknown) => {
        expect((contextValue as { signal: AbortSignal }).signal).toBe(
          context.signal,
        );
        const request = requestValue as Record<string, unknown>;
        managementRequests.push(request);
        if (request.url === TOKEN_URL) {
          return managementResponse(TOKEN_URL, {
            access_token: MANAGEMENT_ACCESS_TOKEN,
            token_type: "bearer",
            expires_in: 3_600,
            refresh_token: "m1v-integration-rotated-refresh-token",
            scope: "environment:read",
          });
        }
        if (request.url === BRANCHES_URL) {
          return managementResponse(BRANCHES_URL, [
            {
              id: "11111111-1111-4111-8111-111111111111",
              name: "m1v-no-data-preview",
              project_ref: TARGET_PROJECT_REF,
              parent_project_ref: PRODUCTION_PROJECT_REF,
              is_default: false,
              persistent: false,
              with_data: false,
              preview_project_status: "ACTIVE_HEALTHY",
            },
          ]);
        }
        throw new Error("unexpected Supabase management request");
      },
    );
    const consumeIntake = vi.fn(
      async (
        contextValue: unknown,
        consumer: (value: unknown) => PromiseLike<void>,
      ) => {
        expect((contextValue as { signal: AbortSignal }).signal).toBe(
          context.signal,
        );
        await consumer(
          Object.freeze({
            clientId: "7673bde9-be72-4d75-bd5e-b0dba2c49b38",
            clientSecret: "m1v-integration-client-secret",
            refreshToken: "m1v-integration-refresh-token",
            oauthAppReferenceSha256: OAUTH_APP_REFERENCE_SHA256,
            oauthGrantReferenceSha256: OAUTH_GRANT_REFERENCE_SHA256,
            principalReferenceSha256: sha256(
              "m1v-integration-management-principal",
            ),
            credentialReferenceSha256: sha256(
              "m1v-integration-management-credential",
            ),
          }),
        );
      },
    );
    const managementBundle =
      await supabaseManagementBridge.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeSupabaseManagementBridge(
        {
          capability: "TEST_ONLY_M1V_SUPABASE_MANAGEMENT_BRIDGE",
          httpsTransport: Object.freeze({ request: managementTransport }),
          intakeCredentialCustodyPort: Object.freeze({
            consume: consumeIntake,
          }),
          clock: Object.freeze({ now: vi.fn(() => NOW) }),
        },
        context,
      );

    const custodyResolve = vi.fn();
    const custodyResolver =
      createTestOnlyCaresLinkV1CommunicationNotePreviewRunnerTerminalCustodyResolver(
        {
          capability: "TEST_ONLY_RUNNER_TERMINAL_CUSTODY_RESOLVER",
          resolve: custodyResolve,
        },
      );
    const result =
      await platformAdapters.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimePlatformAdapters(
        {
          capability: "TEST_ONLY_M1T_PRODUCT_RUNTIME_PLATFORM_ADAPTERS",
          expectedSourceRevisionSha256: SOURCE_REVISION_SHA256,
          platformRequest: Object.freeze({
            vercelTeamIdSha256: sha256(TEAM_ID),
            vercelProjectIdSha256: sha256(PROJECT_ID),
            sourceManifestSha256: SOURCE_MANIFEST_SHA256,
            vercelEnvironment: "preview" as const,
            postgresMajor: 17 as const,
            connectionMode: "DIRECT" as const,
            managementCredentialClass:
              "SUPABASE_MANAGEMENT_API_OAUTH2_ACCESS_TOKEN" as const,
            managementAuthorizationModel:
              "SUPABASE_OAUTH_APP_SCOPE" as const,
            managementOAuthScope: "environment:read" as const,
            managementOAuthAppReferenceSha256:
              OAUTH_APP_REFERENCE_SHA256,
            managementOAuthGrantReferenceSha256:
              OAUTH_GRANT_REFERENCE_SHA256,
            managementScopeAttestationSource:
              "PINNED_OAUTH_APP_CONFIGURATION_AND_GRANT" as const,
            managementEndpointAllowlistEnforced: true as const,
          }),
          targetRequest: Object.freeze({
            targetProjectRef: TARGET_PROJECT_REF,
            tlsRootCertificateSha256: CA_SHA256,
          }),
          workloadIdentityVerifierPort:
            gcpBundle.workloadIdentityVerifierPort,
          supabaseManagementCredentialPort:
            managementBundle.supabaseManagementCredentialPort,
          supabaseManagementHttpsPort:
            managementBundle.supabaseManagementHttpsPort,
          managedHmacPort: gcpBundle.managedHmacPort,
          pinnedCaCustodyPort: gcpBundle.pinnedCaCustodyPort,
          databaseCredentialCustodyPort:
            gcpBundle.databaseCredentialCustodyPort,
          verifiedAuthorization: deepFreezeFixture({
            statement: {
              runIdHash: sha256("m1v-integration-run-id"),
              expiresAt: "2026-09-01T12:04:30.000Z",
            },
            authorizationDigest: sha256("m1v-integration-authorization"),
            signature: "opaque-m1v-integration-test-signature",
            signatureSha256: sha256("m1v-integration-signature"),
            authenticity: "EXTERNAL_OWNER_ED25519_VERIFIED",
            verifiedAt: NOW,
          }),
          custodyResolver,
          clock: Object.freeze({ now: vi.fn(() => NOW) }),
          entropy: Object.freeze({
            bytes: vi.fn((length: number) => new Uint8Array(length).fill(7)),
          }),
        },
        context,
      );

    expect(result).toMatchObject({
      status: "TEST_ONLY_M1M_APPROVED_RUNTIME_ADAPTER_BUNDLE_NOT_ACTIVATED",
      databaseTarget: {
        status: "VALIDATED_DISPOSABLE_PREVIEW_TARGET_NOT_APPROVED",
        targetClass: "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW",
        productionExcluded: true,
        rawCredentialMaterialPresent: false,
      },
    });
    expect(oidcMocks.getVercelOidcTokenSync).toHaveBeenCalledTimes(1);
    expect(gcpTransportRequest).toHaveBeenCalledTimes(9);
    expect(
      gcpRequests.filter((request) => request.url.endsWith(":macVerify")),
    ).toHaveLength(1);
    expect(
      gcpRequests.filter((request) => request.url.endsWith(":macSign")),
    ).toHaveLength(4);
    const secretRequests = gcpRequests.filter((request) =>
      request.url.includes("secretmanager."),
    );
    expect(secretRequests.map((request) => request.url)).toEqual([
      `https://secretmanager.${LOCATION}.rep.googleapis.com/v1/${CA_SECRET}:access`,
    ]);
    expect(JSON.stringify(secretRequests)).not.toContain(DATABASE_SECRET);
    expect(consumeIntake).toHaveBeenCalledTimes(1);
    expect(managementTransport).toHaveBeenCalledTimes(2);
    expect(managementRequests.map((request) => request.url)).toEqual([
      TOKEN_URL,
      BRANCHES_URL,
    ]);
    expect(custodyResolve).not.toHaveBeenCalled();
  });
});

type GcpHttpsRequest = Readonly<{
  method: "GET" | "POST";
  url: string;
  headers: Readonly<Record<string, string>>;
  body: Uint8Array;
  redirect: "ERROR";
  automaticRetries: 0;
  timeoutMs: 5_000;
  maximumResponseBytes: number;
  signal: AbortSignal;
}>;

function gcpResponse(url: string, value: unknown) {
  return Object.freeze({
    status: 200,
    contentType: "application/json",
    responseUrl: url,
    redirected: false as const,
    body: new TextEncoder().encode(JSON.stringify(value)),
  });
}

function managementResponse(url: string, value: unknown) {
  return Object.freeze({
    status: 200,
    contentType: "application/json" as const,
    redirected: false as const,
    responseUrl: url,
    body: new TextEncoder().encode(JSON.stringify(value)),
  });
}

function readJson(value: Uint8Array) {
  return JSON.parse(new TextDecoder().decode(value)) as unknown;
}

function vercelOidcToken() {
  const nowSeconds = Math.floor(Date.parse(NOW) / 1_000);
  return `${base64url({
    alg: "RS256",
    typ: "JWT",
    kid: "m1v-integration-kid",
  })}.${base64url({
    iss: "https://oidc.vercel.com/millionlunas-projects",
    aud: WIF_SUBJECT_TOKEN_AUDIENCE,
    sub: "owner:millionlunas-projects:project:careslink-ai:environment:preview",
    owner_id: TEAM_ID,
    owner: "millionlunas-projects",
    project_id: PROJECT_ID,
    project: "careslink-ai",
    environment: "preview",
    iat: nowSeconds - 60,
    nbf: nowSeconds - 1_800,
    exp: nowSeconds + 3_600,
    jti: "m1v-integration-jti",
  })}.${base64url("signature")}`;
}

function simpleJwt(label: string) {
  return `${base64url({ alg: "RS256" })}.${base64url({ label })}.${base64url(
    `signature-${label}`,
  )}`;
}

function base64url(value: unknown) {
  return Buffer.from(
    typeof value === "string" ? value : JSON.stringify(value),
    "utf8",
  ).toString("base64url");
}

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function deepFreezeFixture<T>(value: T): T {
  if (
    value &&
    typeof value === "object" &&
    !(value instanceof Uint8Array) &&
    !Object.isFrozen(value)
  ) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreezeFixture(child);
    }
  }
  return value;
}
