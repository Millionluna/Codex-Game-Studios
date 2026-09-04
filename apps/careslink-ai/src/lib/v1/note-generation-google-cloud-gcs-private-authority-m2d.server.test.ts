import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authorityMocks = vi.hoisted(() => ({
  createGcsTransport: vi.fn(),
  createProviderTransport: vi.fn(),
  getVercelOidcTokenSync: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@vercel/oidc", () => ({
  getVercelOidcTokenSync: authorityMocks.getVercelOidcTokenSync,
}));
vi.mock(
  "./note-generation-google-cloud-provider-https-transport-m2b.server",
  () => ({
    createCaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b:
      authorityMocks.createProviderTransport,
  }),
);
vi.mock(
  "./note-generation-google-cloud-gcs-https-transport-m2d.server",
  () => ({
    createCaresLinkV1NoteGenerationGoogleCloudGcsHttpsTransportM2d:
      authorityMocks.createGcsTransport,
  }),
);

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import type {
  CaresLinkV1NoteGenerationGcsAuthorizedHttpsPort,
  CaresLinkV1NoteGenerationGcsAuthorizedOperation,
  CaresLinkV1NoteGenerationGcsAuthorizedOperationPort,
  CaresLinkV1NoteGenerationGcsAuthorizedOperationRequest,
} from "./note-generation-encrypted-payload-gcs-private-object-store.server";
import {
  createCaresLinkV1NoteGenerationGcsPrivateObjectStore,
} from "./note-generation-encrypted-payload-gcs-private-object-store.server";
import type { CaresLinkV1NoteGenerationEncryptedPayloadPrivateObject } from "./note-generation-encrypted-payload-stager.server";
import type {
  CaresLinkV1NoteGenerationGoogleCloudGcsHttpsRequestM2d,
  CaresLinkV1NoteGenerationGoogleCloudGcsHttpsResponseM2d,
} from "./note-generation-google-cloud-gcs-https-transport-m2d.server";
import type { CaresLinkV1NoteGenerationGoogleCloudProviderHttpsRequestM2b } from "./note-generation-google-cloud-provider-https-transport-m2b.server";
import {
  CARESLINK_V1_NOTE_GENERATION_FORMAL_GOOGLE_CLOUD_GCS_PRIVATE_AUTHORITY_M2D,
  CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_GCS_PRIVATE_AUTHORITY_M2D_READY,
  CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_GCS_PRIVATE_AUTHORITY_M2D_SOURCE_POLICY,
  CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_GCS_PRIVATE_AUTHORITY_M2D_VERSION,
  createCaresLinkV1NoteGenerationGoogleCloudGcsAuthorizedOperationPortM2d,
  discardCaresLinkV1NoteGenerationGoogleCloudGcsPrivateAuthorityM2d,
  prepareCaresLinkV1NoteGenerationGoogleCloudGcsPrivateAuthorityM2d,
  prepareTestOnlyCaresLinkV1NoteGenerationGoogleCloudGcsPrivateAuthorityM2d,
  type CaresLinkV1NoteGenerationGoogleCloudGcsPrivateAuthorityM2d,
} from "./note-generation-google-cloud-gcs-private-authority-m2d.server";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const NOW = new Date("2026-09-04T00:00:00.000Z");
const NOW_SECONDS = Math.floor(NOW.getTime() / 1_000);
const PROJECT_ID = "careslink-m1u-security";
const LOCATION = "australia-southeast1";
const RUNTIME_PRINCIPAL =
  "careslink-preview-runtime@careslink-m1u-security.iam.gserviceaccount.com";
const VERCEL_ISSUER = "https://oidc.vercel.com/millionlunas-projects";
const VERCEL_DEFAULT_AUDIENCE =
  "https://vercel.com/millionlunas-projects";
const WIF_AUDIENCE =
  "https://iam.googleapis.com/projects/288554824534/locations/global/workloadIdentityPools/vercel-careslink-preview/providers/vercel-team-preview";
const WIF_PROVIDER_RESOURCE = `//iam.googleapis.com/projects/288554824534/locations/global/workloadIdentityPools/vercel-careslink-preview/providers/vercel-team-preview`;
const VERCEL_SUBJECT =
  "owner:millionlunas-projects:project:careslink-ai:environment:preview";
const GCS_AUDIENCE = "https://storage.googleapis.com/";
const GCS_SCOPE =
  "https://www.googleapis.com/auth/devstorage.read_write";
const CLOUD_PLATFORM_SCOPE =
  "https://www.googleapis.com/auth/cloud-platform";
const GCS_ACCESS_TOKEN = "gcs-operation-access-token-0000000001";
const FEDERATED_ACCESS_TOKEN = "federated-access-token-0000000001";
const BUCKET = "careslink-preview-private-notes";
const OBJECT_PREFIX = "communication-notes/v1";
const BACKUP_DISPOSITION_VERSION = "no-soft-delete.2026-09-03.v1";
const LIFECYCLE_POLICY_VERSION = "payload-expiry-maintenance.2026-09-03.v1";
const LIFECYCLE_RULES_HASH = sha256("m2d-lifecycle-rules-v1");
const OWNER_HASH = sha256("m2d-owner-1");
const IDEMPOTENCY_HASH = sha256("m2d-idempotency-1");
const DELETE_BINDING_HASH = sha256("m2d-delete-binding-1");
const FIXED_FAILURE = Object.freeze({
  code: "PRODUCT_API_DISABLED",
  message:
    "Communication Note Google Cloud GCS private authority is unavailable",
});
const MULTIPART_CONTENT_TYPE =
  'multipart/related; boundary="===============careslink_m2a_gcs_private_object=="';

type ProviderRequest =
  CaresLinkV1NoteGenerationGoogleCloudProviderHttpsRequestM2b;
type GcsRequest = CaresLinkV1NoteGenerationGoogleCloudGcsHttpsRequestM2d;
type GcsResponse =
  CaresLinkV1NoteGenerationGoogleCloudGcsHttpsResponseM2d;
type AuthorizedSession = CaresLinkV1NoteGenerationGcsAuthorizedHttpsPort;

type HarnessOptions = Readonly<{
  baseClaimOverrides?: Readonly<Record<string, unknown>>;
  iamRemainingMs?: number;
  providerFailureUrl?: string;
  gcsImplementation?: (request: GcsRequest) => Promise<GcsResponse>;
}>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  authorityMocks.createGcsTransport.mockReset();
  authorityMocks.createProviderTransport.mockReset();
  authorityMocks.getVercelOidcTokenSync.mockReset();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("Communication Note Google Cloud GCS private authority M2d", () => {
  it("is server-only, source-only and default-off without credential or transport work", async () => {
    expect(
      CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_GCS_PRIVATE_AUTHORITY_M2D_VERSION,
    ).toBe(
      "google-cloud-gcs-private-authority.communication-note.2026-09-04.m2d.v1",
    );
    expect(
      CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_GCS_PRIVATE_AUTHORITY_M2D_READY,
    ).toBe(false);
    expect(
      CARESLINK_V1_NOTE_GENERATION_FORMAL_GOOGLE_CLOUD_GCS_PRIVATE_AUTHORITY_M2D,
    ).toBeUndefined();
    expect(
      CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_GCS_PRIVATE_AUTHORITY_M2D_SOURCE_POLICY,
    ).toMatchObject({
      status: "SOURCE_GCS_PRIVATE_AUTHORITY_NOT_COMPOSED",
      ready: false,
      sourceOnly: true,
      serverOnly: true,
      productionAllowed: false,
      exactProjectId: PROJECT_ID,
      exactLocation: LOCATION,
      exactRuntimeServiceAccount: RUNTIME_PRINCIPAL,
      exactGcsAudience: GCS_AUDIENCE,
      exactGcsScope: GCS_SCOPE,
      requestedAccessTokenLifetimeSeconds: 300,
      operationCredentialMinimumRemainingMs: 35_000,
      credentialAcquiredBeforeSynchronousHandoff: true,
      independentFromKmsOperationCredential: true,
      authorityHandoffDirectReturn: true,
      authorityOpaqueOperationInspected: false,
      rawCredentialMaterialReturned: false,
      rawAuthorizationHeaderReturned: false,
      liveEvidencePresent: false,
      activationApproved: false,
    });

    await expect(
      prepareCaresLinkV1NoteGenerationGoogleCloudGcsPrivateAuthorityM2d(
        Object.freeze({}),
      ),
    ).rejects.toEqual(FIXED_FAILURE);
    expect(authorityMocks.getVercelOidcTokenSync).not.toHaveBeenCalled();
    expect(authorityMocks.createProviderTransport).not.toHaveBeenCalled();
    expect(authorityMocks.createGcsTransport).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    const source = readFileSync(
      new URL(
        "./note-generation-google-cloud-gcs-private-authority-m2d.server.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(source.startsWith('import "server-only";')).toBe(true);
    expect(source).not.toMatch(
      /globalThis\.fetch|window\.fetch|process\.env|GOOGLE_APPLICATION_CREDENTIALS|from ["']google-auth-library|from ["']@google-cloud|console\.|\blogger\b/i,
    );
  });

  it("pre-acquires an independent 300s devstorage credential through the pinned chain", async () => {
    const root = new AbortController();
    const harness = installHarness();
    const authority = await prepareAuthority(root.signal);

    expect(harness.providerRequests.map((request) => request.url)).toEqual([
      "https://oidc.vercel.com/~token",
      "https://sts.googleapis.com/v1/token",
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${RUNTIME_PRINCIPAL}:generateAccessToken`,
    ]);
    const customExchange = JSON.parse(
      decoder.decode(harness.providerRequestSnapshots[0]?.body),
    ) as Record<string, unknown>;
    expect(customExchange).toMatchObject({
      token: harness.baseToken,
      aud: WIF_AUDIENCE,
    });
    expect(customExchange.jti).toEqual(expect.any(String));

    const sts = new URLSearchParams(
      decoder.decode(harness.providerRequestSnapshots[1]?.body),
    );
    expect(Object.fromEntries(sts.entries())).toEqual({
      audience: WIF_PROVIDER_RESOURCE,
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
      scope: CLOUD_PLATFORM_SCOPE,
      subject_token: harness.customToken,
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    });
    expect(
      JSON.parse(
        decoder.decode(harness.providerRequestSnapshots[2]?.body),
      ),
    ).toEqual({ scope: [GCS_SCOPE], lifetime: "300s" });
    expect(harness.gcsOptions).toEqual([
      Object.freeze({ bucket: BUCKET, objectPrefix: OBJECT_PREFIX }),
    ]);
    expect(authority).toMatchObject({
      version:
        "google-cloud-gcs-private-authority.communication-note.2026-09-04.m2d.v1",
      status: "PREPARED_EXACT_GCS_PRIVATE_AUTHORITY_NOT_ACTIVATED",
      projectId: PROJECT_ID,
      bucketLocation: LOCATION,
      runtimePrincipal: RUNTIME_PRINCIPAL,
      bucket: BUCKET,
      objectPrefix: OBJECT_PREFIX,
      rawCredentialMaterialPresent: false,
      rawAuthorizationHeaderPresent: false,
    });
    expect(Object.isFrozen(authority)).toBe(true);
    expect(JSON.stringify(authority)).not.toContain(GCS_ACCESS_TOKEN);
    expect(JSON.stringify(authority)).not.toContain("Bearer");
    for (const body of harness.providerRequestBodies) {
      expect([...body].every((byte) => byte === 0)).toBe(true);
    }
    for (const body of harness.providerResponseBodies) {
      expect([...body].every((byte) => byte === 0)).toBe(true);
    }

    discardCaresLinkV1NoteGenerationGoogleCloudGcsPrivateAuthorityM2d(
      authority,
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fails closed on malformed options, pinned identity drift and insufficient freshness", async () => {
    installHarness();
    const root = new AbortController();
    await expect(
      prepareTestOnlyCaresLinkV1NoteGenerationGoogleCloudGcsPrivateAuthorityM2d(
        {
          capability: "TEST_ONLY_M2D_GOOGLE_CLOUD_GCS_PRIVATE_AUTHORITY",
          bucket: BUCKET,
          objectPrefix: OBJECT_PREFIX,
          rootAbortSignal: root.signal,
        },
      ),
    ).rejects.toEqual(FIXED_FAILURE);
    expect(authorityMocks.getVercelOidcTokenSync).not.toHaveBeenCalled();

    installHarness({
      baseClaimOverrides: { project_id: "prj_wrong" },
    });
    await expect(prepareAuthority(root.signal)).rejects.toEqual(
      FIXED_FAILURE,
    );
    expect(authorityMocks.createGcsTransport).not.toHaveBeenCalled();

    const freshnessHarness = installHarness({ iamRemainingMs: 35_000 });
    await expect(prepareAuthority(root.signal)).rejects.toEqual(
      FIXED_FAILURE,
    );
    expect(freshnessHarness.providerRequests).toHaveLength(3);
    expect(authorityMocks.createGcsTransport).not.toHaveBeenCalled();
    for (const body of freshnessHarness.providerResponseBodies) {
      expect([...body].every((byte) => byte === 0)).toBe(true);
    }
  });

  it("binds the exact handle and root identity, and burns create/discard replays", async () => {
    const root = new AbortController();
    installHarness();
    const authority = await prepareAuthority(root.signal);
    const clone = Object.freeze({ ...authority });
    expectFixedFailure(() =>
      createCaresLinkV1NoteGenerationGoogleCloudGcsAuthorizedOperationPortM2d(
        Object.freeze({
          providerAuthority: clone,
          rootAbortSignal: root.signal,
        }),
      ),
    );

    const port = createPort(authority, root.signal);
    expectFixedFailure(() => createPort(authority, root.signal));
    expectFixedFailure(() =>
      discardCaresLinkV1NoteGenerationGoogleCloudGcsPrivateAuthorityM2d(
        authority,
      ),
    );

    const operation = new AbortController();
    const request = authorityRequest(authority, operation.signal);
    const opaque = opaqueOperation();
    expect(port.consumeAuthorizedOperation(request, () => opaque)).toBe(
      opaque,
    );
    operation.abort();

    installHarness();
    const second = await prepareAuthority(root.signal);
    expectFixedFailure(() => createPort(second, new AbortController().signal));
    expectFixedFailure(() => createPort(second, root.signal));
  });

  it("directly returns the opaque operation without inspecting or assimilating it", async () => {
    const root = new AbortController();
    installHarness();
    const authority = await prepareAuthority(root.signal);
    const port = createPort(authority, root.signal);
    const operation = new AbortController();
    let thenReads = 0;
    const candidate = Object.freeze(
      Object.defineProperty({}, "then", {
        configurable: false,
        enumerable: false,
        get() {
          thenReads += 1;
          throw new Error(`must-not-read-${GCS_ACCESS_TOKEN}`);
        },
      }),
    ) as CaresLinkV1NoteGenerationGcsAuthorizedOperation;
    let captured: unknown;

    const returned = port.consumeAuthorizedOperation(
      authorityRequest(authority, operation.signal),
      (session) => {
        captured = session;
        return candidate;
      },
    );

    expect(returned).toBe(candidate);
    expect(thenReads).toBe(0);
    expect(Object.isFrozen(captured)).toBe(true);
    expect(Object.getOwnPropertyNames(captured as object)).toEqual([
      "request",
    ]);
    expect(
      JSON.stringify(Object.getOwnPropertyNames(captured as object)),
    ).not.toContain("authorization");
    operation.abort();
  });

  it("privately injects exact headers for multiple requests and closes on the operation signal", async () => {
    const root = new AbortController();
    const harness = installHarness();
    const authority = await prepareAuthority(root.signal);
    const port = createPort(authority, root.signal);
    const operation = new AbortController();
    const session = captureSession(port, authority, operation.signal);

    const getBody = new Uint8Array(0);
    const getResponse = await session.request(
      gcsRequest({
        method: "GET",
        url: `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(`${OBJECT_PREFIX}/note`)}`,
        body: getBody,
      }),
    );
    expect(getResponse).toBe(harness.gcsResponses[0]);

    const postBody = Uint8Array.from([1, 2, 3, 4]);
    await session.request(
      gcsRequest({
        method: "POST",
        url: `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=multipart&name=${encodeURIComponent(`${OBJECT_PREFIX}/note`)}`,
        body: postBody,
        contentType: MULTIPART_CONTENT_TYPE,
      }),
    );

    expect(harness.gcsRequests).toHaveLength(2);
    expect(harness.gcsRequests[0]?.headers).toEqual({
      accept: "application/json",
      authorization: `Bearer ${GCS_ACCESS_TOKEN}`,
      "accept-encoding": "identity",
    });
    expect(harness.gcsRequests[1]?.headers).toEqual({
      accept: "application/json",
      authorization: `Bearer ${GCS_ACCESS_TOKEN}`,
      "accept-encoding": "identity",
      "content-type": MULTIPART_CONTENT_TYPE,
      "content-length": "4",
    });
    expect(Object.isFrozen(harness.gcsRequests[0])).toBe(true);
    expect(Object.isFrozen(harness.gcsRequests[0]?.headers)).toBe(true);
    expect(harness.gcsRequestSnapshots[1]?.body).toEqual(
      Uint8Array.from([1, 2, 3, 4]),
    );
    expect(postBody).toEqual(Uint8Array.from([1, 2, 3, 4]));
    expect(
      [...(harness.gcsRequests[1]?.body ?? [])].every(
        (byte) => byte === 0,
      ),
    ).toBe(true);

    operation.abort();
    await expect(
      session.request(
        gcsRequest({
          method: "GET",
          url: `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/note`,
          body: new Uint8Array(0),
        }),
      ),
    ).rejects.toEqual(FIXED_FAILURE);
    expect(harness.gcsRequests).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("integrates with M2c recovery and requires a fresh authority for the next top-level operation", async () => {
    const root = new AbortController();
    const storage = createResponseLossStorage();
    const harness = installHarness({
      gcsImplementation: storage.request,
    });
    const firstAuthority = await prepareAuthority(root.signal);
    const firstPort = createPort(firstAuthority, root.signal);
    const firstStore = createM2cStore(firstPort, root.signal);
    const object = privateObject();

    await expect(
      firstStore.createIfAbsent({ namespace: namespace(), object }),
    ).resolves.toEqual({ status: "EXISTS", object });
    expect(harness.gcsRequests).toHaveLength(3);
    expect(harness.gcsRequests.map((request) => request.method)).toEqual([
      "POST",
      "GET",
      "GET",
    ]);
    expect(new Set(storage.authorizationHeaders)).toEqual(
      new Set([`Bearer ${GCS_ACCESS_TOKEN}`]),
    );
    expect(storage.responseLosses).toBe(1);
    expectFixedFailure(() =>
      firstPort.consumeAuthorizedOperation(
        authorityRequest(firstAuthority, new AbortController().signal),
        () => opaqueOperation(),
      ),
    );
    await expect(firstStore.read(namespace())).rejects.toMatchObject({
      code: "GENERATION_FAILED",
      message: "Encrypted payload private storage is unavailable",
    });
    expect(harness.gcsRequests).toHaveLength(3);

    const secondAuthority = await prepareAuthority(root.signal);
    const secondPort = createPort(secondAuthority, root.signal);
    const secondStore = createM2cStore(secondPort, root.signal);
    await expect(secondStore.read(namespace())).resolves.toEqual({
      status: "FOUND",
      object,
    });
    expect(harness.providerRequests).toHaveLength(6);
    expect(harness.gcsOptions).toHaveLength(2);
    expect(harness.gcsRequests).toHaveLength(5);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("burns malformed authority requests and the one-use port before invoking a consumer", async () => {
    const root = new AbortController();
    installHarness();
    const authority = await prepareAuthority(root.signal);
    const port = createPort(authority, root.signal);
    const operation = new AbortController();
    const consumer = vi.fn(() => opaqueOperation());
    const wrongRequest = Object.freeze({
      ...authorityRequest(authority, operation.signal),
      scope: CLOUD_PLATFORM_SCOPE,
    });

    expectFixedFailure(() =>
      port.consumeAuthorizedOperation(
        wrongRequest as unknown as CaresLinkV1NoteGenerationGcsAuthorizedOperationRequest,
        consumer,
      ),
    );
    expect(consumer).not.toHaveBeenCalled();
    expectFixedFailure(() =>
      port.consumeAuthorizedOperation(
        authorityRequest(authority, operation.signal),
        consumer,
      ),
    );
    expect(consumer).not.toHaveBeenCalled();
  });

  it("redacts transport failures, clears request copies, and consumes late responses after timeout", async () => {
    const root = new AbortController();
    const harness = installHarness();
    const authority = await prepareAuthority(root.signal);
    const port = createPort(authority, root.signal);
    const operation = new AbortController();
    const session = captureSession(port, authority, operation.signal);
    const rejectedCopy: Uint8Array[] = [];
    harness.gcsRequestMock.mockImplementationOnce(async (request) => {
      rejectedCopy.push(request.body);
      throw new Error(`provider-${GCS_ACCESS_TOKEN}`);
    });
    const original = Uint8Array.from([9, 8, 7]);
    await expect(
      session.request(
        gcsRequest({
          method: "POST",
          url: `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=multipart&name=${encodeURIComponent(`${OBJECT_PREFIX}/error`)}`,
          body: original,
          contentType: MULTIPART_CONTENT_TYPE,
        }),
      ),
    ).rejects.toEqual(FIXED_FAILURE);
    expect(original).toEqual(Uint8Array.from([9, 8, 7]));
    expect(rejectedCopy[0]).toEqual(Uint8Array.from([0, 0, 0]));

    let resolveLate: ((value: GcsResponse) => void) | undefined;
    harness.gcsRequestMock.mockImplementationOnce(
      () =>
        new Promise<GcsResponse>((resolve) => {
          resolveLate = resolve;
        }),
    );
    const latePromise = session.request(
      gcsRequest({
        method: "GET",
        url: `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/late`,
        body: new Uint8Array(0),
      }),
    );
    const lateRejection = expect(latePromise).rejects.toEqual(FIXED_FAILURE);
    await vi.advanceTimersByTimeAsync(5_000);
    await lateRejection;
    const lateBody = encoder.encode(`late-${GCS_ACCESS_TOKEN}`);
    resolveLate?.(
      Object.freeze({
        status: 200,
        contentType: "application/json",
        responseUrl: `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/late`,
        redirected: false,
        body: lateBody,
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect([...lateBody].every((byte) => byte === 0)).toBe(true);
    operation.abort();
  });

  it("enforces the 30s operation plus 5s credential freshness boundary", async () => {
    const root = new AbortController();
    installHarness();
    const accepted = await prepareAuthority(root.signal);
    await vi.advanceTimersByTimeAsync(264_999);
    const port = createPort(accepted, root.signal);
    const operation = new AbortController();
    expect(
      port.consumeAuthorizedOperation(
        authorityRequest(accepted, operation.signal),
        () => opaqueOperation(),
      ),
    ).toBeDefined();
    operation.abort();

    vi.setSystemTime(NOW);
    installHarness();
    const rejected = await prepareAuthority(root.signal);
    await vi.advanceTimersByTimeAsync(265_000);
    expectFixedFailure(() => createPort(rejected, root.signal));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("expires a retained authorized session at the authority-owned 30s deadline", async () => {
    const root = new AbortController();
    const harness = installHarness();
    const authority = await prepareAuthority(root.signal);
    const port = createPort(authority, root.signal);
    const operation = new AbortController();
    const session = captureSession(port, authority, operation.signal);

    await vi.advanceTimersByTimeAsync(30_000);

    await expect(
      session.request(
        gcsRequest({
          method: "GET",
          url: `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/expired`,
          body: new Uint8Array(0),
        }),
      ),
    ).rejects.toEqual(FIXED_FAILURE);
    expect(harness.gcsRequests).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts in-flight GCS work and scrubs a late response when the consumer throws", async () => {
    const root = new AbortController();
    const harness = installHarness();
    let transportSignal: AbortSignal | undefined;
    let resolveLate: ((value: GcsResponse) => void) | undefined;
    harness.gcsRequestMock.mockImplementationOnce(
      (request) =>
        new Promise<GcsResponse>((resolve) => {
          transportSignal = request.signal;
          resolveLate = resolve;
        }),
    );
    const authority = await prepareAuthority(root.signal);
    const port = createPort(authority, root.signal);
    const operation = new AbortController();
    let pending: Promise<unknown> | undefined;

    expectFixedFailure(() =>
      port.consumeAuthorizedOperation(
        authorityRequest(authority, operation.signal),
        (session) => {
          pending = Promise.resolve(
            (session as AuthorizedSession).request(
              gcsRequest({
                method: "GET",
                url: `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/consumer-throw`,
                body: new Uint8Array(0),
              }),
            ),
          );
          throw new Error(`consumer-${GCS_ACCESS_TOKEN}`);
        },
      ),
    );

    expect(transportSignal?.aborted).toBe(true);
    expect(pending).toBeDefined();
    await expect(pending as Promise<unknown>).rejects.toEqual(FIXED_FAILURE);
    const lateBody = encoder.encode(`late-${GCS_ACCESS_TOKEN}`);
    resolveLate?.(
      Object.freeze({
        status: 200,
        contentType: "application/json",
        responseUrl: `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/consumer-throw`,
        redirected: false,
        body: lateBody,
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect([...lateBody].every((byte) => byte === 0)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("invalidates prepared and active authority state on root abort", async () => {
    const preparedRoot = new AbortController();
    installHarness();
    const prepared = await prepareAuthority(preparedRoot.signal);
    preparedRoot.abort();
    expectFixedFailure(() => createPort(prepared, preparedRoot.signal));

    const activeRoot = new AbortController();
    installHarness();
    const active = await prepareAuthority(activeRoot.signal);
    const port = createPort(active, activeRoot.signal);
    const operation = new AbortController();
    const session = captureSession(port, active, operation.signal);
    activeRoot.abort();
    await expect(
      session.request(
        gcsRequest({
          method: "GET",
          url: `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/aborted`,
          body: new Uint8Array(0),
        }),
      ),
    ).rejects.toEqual(FIXED_FAILURE);
    expect(vi.getTimerCount()).toBe(0);
  });
});

type StoredObject = Readonly<{
  name: string;
  generation: string;
  metageneration: string;
  body: Uint8Array;
  crc32c: string;
  metadata: Readonly<Record<string, string>>;
}>;

function createResponseLossStorage() {
  let stored: StoredObject | undefined;
  let loseNextSuccessfulUploadResponse = true;
  let responseLosses = 0;
  const authorizationHeaders: string[] = [];

  const request = async (requestValue: GcsRequest): Promise<GcsResponse> => {
    authorizationHeaders.push(requestValue.headers.authorization ?? "");
    const url = new URL(requestValue.url);
    if (requestValue.method === "POST") {
      const multipart = parseMultipart(requestValue);
      const metadata = multipart.metadata as Readonly<{
        name: string;
        crc32c: string;
        metadata: Readonly<Record<string, string>>;
      }>;
      stored = Object.freeze({
        name: metadata.name,
        generation: "1",
        metageneration: "1",
        body: multipart.objectBody,
        crc32c: metadata.crc32c,
        metadata: metadata.metadata,
      });
      if (loseNextSuccessfulUploadResponse) {
        loseNextSuccessfulUploadResponse = false;
        responseLosses += 1;
        throw new Error(`synthetic-response-loss-${GCS_ACCESS_TOKEN}`);
      }
      return objectMetadataResponse(requestValue.url, stored);
    }
    if (stored === undefined) {
      return gcsJsonResponse(requestValue.url, 404, {});
    }
    if (url.searchParams.get("alt") === "media") {
      return Object.freeze({
        status: 200,
        contentType: "application/json",
        responseUrl: requestValue.url,
        redirected: false,
        body: Uint8Array.from(stored.body),
      });
    }
    return objectMetadataResponse(requestValue.url, stored);
  };

  return {
    request,
    authorizationHeaders,
    get responseLosses() {
      return responseLosses;
    },
  };
}

function objectMetadataResponse(url: string, stored: StoredObject) {
  return gcsJsonResponse(url, 200, {
    bucket: BUCKET,
    name: stored.name,
    generation: stored.generation,
    metageneration: stored.metageneration,
    size: String(stored.body.byteLength),
    crc32c: stored.crc32c,
    contentType: "application/json",
    cacheControl: "no-store",
    metadata: stored.metadata,
    temporaryHold: false,
    eventBasedHold: false,
  });
}

function gcsJsonResponse(url: string, status: number, value: unknown) {
  return Object.freeze({
    status,
    contentType: "application/json; charset=utf-8",
    responseUrl: url,
    redirected: false as const,
    body: encoder.encode(JSON.stringify(value)),
  });
}

function parseMultipart(request: GcsRequest) {
  const boundary = request.headers["content-type"]?.match(
    /^multipart\/related; boundary="([^"]+)"$/,
  )?.[1];
  if (!boundary) throw new Error("missing multipart boundary");
  const parts = decoder.decode(request.body).split(`--${boundary}`);
  if (parts.length !== 4 || parts[0] !== "" || parts[3] !== "--\r\n") {
    throw new Error("invalid multipart body");
  }
  return Object.freeze({
    metadata: JSON.parse(multipartPartBody(parts[1] as string)) as unknown,
    objectBody: encoder.encode(multipartPartBody(parts[2] as string)),
  });
}

function multipartPartBody(part: string) {
  const separator = part.indexOf("\r\n\r\n");
  if (separator < 0 || !part.endsWith("\r\n")) {
    throw new Error("invalid multipart part");
  }
  return part.slice(separator + 4, -2);
}

function createM2cStore(
  authorizedOperationPort: CaresLinkV1NoteGenerationGcsAuthorizedOperationPort,
  signal: AbortSignal,
) {
  const observedAt = new Date(NOW.getTime() - 60_000).toISOString();
  const postureWithoutHash = Object.freeze({
    projectId: PROJECT_ID,
    bucket: BUCKET,
    bucketLocation: LOCATION,
    observedAt,
    expiresAt: new Date(NOW.getTime() + 4 * 60_000).toISOString(),
    uniformBucketLevelAccessEnabled: true,
    publicAccessPrevention: "enforced",
    softDeleteRetentionSeconds: 0,
    objectVersioningEnabled: false,
    protectionSettingsEffectiveAt: new Date(
      NOW.getTime() - 2 * 60_000,
    ).toISOString(),
    noncurrentObjectVersionsAbsent: true,
    softDeletedObjectVersionsAbsent: true,
    retentionPolicyPresent: false,
    defaultEventBasedHold: false,
    objectRetentionEnabled: false,
    lifecyclePolicyVersion: LIFECYCLE_POLICY_VERSION,
    lifecycleRulesHash: LIFECYCLE_RULES_HASH,
    backupDispositionVersion: BACKUP_DISPOSITION_VERSION,
  });
  const bucketPostureAttestation = Object.freeze({
    ...postureWithoutHash,
    postureEvidenceHash: canonicalSha256({
      purpose: "CARESLINK_V1_COMMUNICATION_NOTE_GCS_BUCKET_POSTURE",
      ...postureWithoutHash,
    }),
  });
  return createCaresLinkV1NoteGenerationGcsPrivateObjectStore(
    Object.freeze({
      policy: Object.freeze({
        projectId: PROJECT_ID,
        bucket: BUCKET,
        bucketLocation: LOCATION,
        objectPrefix: OBJECT_PREFIX,
        lifecyclePolicyVersion: LIFECYCLE_POLICY_VERSION,
        lifecycleRulesHash: LIFECYCLE_RULES_HASH,
        backupDispositionVersion: BACKUP_DISPOSITION_VERSION,
      }),
      bucketPostureAttestation,
      clock: () => NOW.toISOString(),
      authorizedOperationPort,
      signal,
    }),
  );
}

function privateObject(): CaresLinkV1NoteGenerationEncryptedPayloadPrivateObject {
  return {
    formatVersion: "careslink.communication-note.encrypted-payload.v1",
    createdAt: NOW.toISOString(),
    requestBindingHash: sha256("m2d-request-binding"),
    retentionSeconds: 600,
    maximumCleanedFactsCanonicalBytes: 64 * 1_024,
    receipt: {
      jobId: "11111111-1111-4111-8111-111111111111",
      payloadId: "22222222-2222-4222-8222-222222222222",
      payloadHandleHash: sha256("m2d-payload-handle"),
      payloadExpiresAt: new Date(NOW.getTime() + 600_000).toISOString(),
      payloadPolicyVersion: "payload-policy.2026-09-03.v1",
      payloadPolicySnapshotHash: sha256("m2d-policy-snapshot"),
      encryptionProfileVersion: "aes-256-gcm-envelope.2026-09-03.v1",
      kmsKeyVersionResourceHash: sha256("m2d-kms-version"),
      backupDispositionVersion: BACKUP_DISPOSITION_VERSION,
    },
    kmsKeyVersionResource:
      "projects/careslink-m1u-security/locations/australia-southeast1/keyRings/careslink-preview/cryptoKeys/payload-envelope/cryptoKeyVersions/7",
    aadCanonicalBase64url: Buffer.from("canonical-aad").toString("base64url"),
    aadSha256: sha256("canonical-aad"),
    ivBase64url: Buffer.alloc(12, 1).toString("base64url"),
    ciphertextBase64url: Buffer.from("sealed-payload").toString("base64url"),
    authenticationTagBase64url: Buffer.alloc(16, 2).toString("base64url"),
    wrappedDataEncryptionKeyBase64url: Buffer.alloc(32, 3).toString(
      "base64url",
    ),
    sealedPayloadSha256: sha256("sealed-payload"),
    deleteBindingHash: DELETE_BINDING_HASH,
  };
}

function namespace() {
  return Object.freeze({
    ownerUserIdHash: OWNER_HASH,
    idempotencyHash: IDEMPOTENCY_HASH,
  });
}

function canonicalSha256(value: unknown) {
  return createHash("sha256")
    .update(stringifyCaresLinkV1CanonicalJson(value), "utf8")
    .digest("hex");
}

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function installHarness(options: HarnessOptions = {}) {
  const providerRequests: ProviderRequest[] = [];
  const providerRequestBodies: Uint8Array[] = [];
  const providerRequestSnapshots: Array<Readonly<{ body: Uint8Array }>> = [];
  const providerResponseBodies: Uint8Array[] = [];
  const gcsRequests: GcsRequest[] = [];
  const gcsRequestSnapshots: Array<Readonly<{ body: Uint8Array }>> = [];
  const gcsResponses: GcsResponse[] = [];
  const gcsOptions: unknown[] = [];
  const baseClaims = {
    iss: VERCEL_ISSUER,
    sub: VERCEL_SUBJECT,
    aud: VERCEL_DEFAULT_AUDIENCE,
    owner_id: "team_cFWfAk6zAa0b7X5bc1ONT4SA",
    owner: "millionlunas-projects",
    project_id: "prj_AtdTukVr39wrGH9PYgKusfku2gvS",
    project: "careslink-ai",
    environment: "preview",
    iat: NOW_SECONDS - 10,
    nbf: NOW_SECONDS - 10,
    exp: NOW_SECONDS + 300,
    ...options.baseClaimOverrides,
  };
  const baseToken = jwt(baseClaims);
  let customToken = "";
  authorityMocks.getVercelOidcTokenSync.mockReturnValue(baseToken);

  const providerRequestMock = vi.fn(async (request: ProviderRequest) => {
    providerRequests.push(request);
    providerRequestBodies.push(request.body);
    const bodySnapshot = Uint8Array.from(request.body);
    providerRequestSnapshots.push(Object.freeze({ body: bodySnapshot }));
    if (request.url === options.providerFailureUrl) {
      throw new Error(`provider-failure-${GCS_ACCESS_TOKEN}`);
    }
    if (request.url === "https://oidc.vercel.com/~token") {
      const input = JSON.parse(decoder.decode(bodySnapshot)) as Readonly<{
        jti: string;
      }>;
      customToken = jwt({
        ...baseClaims,
        aud: WIF_AUDIENCE,
        jti: input.jti,
        act: {
          aud: VERCEL_DEFAULT_AUDIENCE,
          iat: baseClaims.iat,
        },
      });
      return jsonResponse(
        request,
        providerResponseBodies,
        Object.freeze({ token: customToken, expiry: baseClaims.exp }),
      );
    }
    if (request.url === "https://sts.googleapis.com/v1/token") {
      return jsonResponse(
        request,
        providerResponseBodies,
        Object.freeze({
          access_token: FEDERATED_ACCESS_TOKEN,
          issued_token_type:
            "urn:ietf:params:oauth:token-type:access_token",
          token_type: "Bearer",
          expires_in: 300,
          scope: CLOUD_PLATFORM_SCOPE,
        }),
      );
    }
    if (
      request.url ===
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${RUNTIME_PRINCIPAL}:generateAccessToken`
    ) {
      return jsonResponse(
        request,
        providerResponseBodies,
        Object.freeze({
          accessToken: GCS_ACCESS_TOKEN,
          expireTime: new Date(
            NOW.getTime() + (options.iamRemainingMs ?? 300_000),
          ).toISOString(),
        }),
      );
    }
    throw new Error("Unexpected test-only provider request");
  });
  authorityMocks.createProviderTransport.mockReturnValue(
    Object.freeze({ request: providerRequestMock }),
  );

  const gcsRequestMock = vi.fn(async (request: GcsRequest) => {
    gcsRequests.push(request);
    gcsRequestSnapshots.push(
      Object.freeze({ body: Uint8Array.from(request.body) }),
    );
    if (options.gcsImplementation) {
      return options.gcsImplementation(request);
    }
    const response = Object.freeze({
      status: 200,
      contentType: "application/json",
      responseUrl: request.url,
      redirected: false as const,
      body: encoder.encode('{"ok":true}'),
    });
    gcsResponses.push(response);
    return response;
  });
  authorityMocks.createGcsTransport.mockImplementation((value: unknown) => {
    gcsOptions.push(value);
    return Object.freeze({ request: gcsRequestMock });
  });

  return {
    baseToken,
    get customToken() {
      return customToken;
    },
    providerRequests,
    providerRequestBodies,
    providerRequestSnapshots,
    providerResponseBodies,
    gcsRequests,
    gcsRequestSnapshots,
    gcsResponses,
    gcsOptions,
    gcsRequestMock,
  };
}

function jsonResponse(
  request: ProviderRequest,
  retainedBodies: Uint8Array[],
  value: unknown,
) {
  const body = encoder.encode(JSON.stringify(value));
  retainedBodies.push(body);
  return Object.freeze({
    status: 200,
    contentType: "application/json",
    responseUrl: request.url,
    redirected: false as const,
    body,
  });
}

function prepareAuthority(rootAbortSignal: AbortSignal) {
  return prepareTestOnlyCaresLinkV1NoteGenerationGoogleCloudGcsPrivateAuthorityM2d(
    Object.freeze({
      capability: "TEST_ONLY_M2D_GOOGLE_CLOUD_GCS_PRIVATE_AUTHORITY",
      bucket: BUCKET,
      objectPrefix: OBJECT_PREFIX,
      rootAbortSignal,
    }),
  );
}

function createPort(
  authority: CaresLinkV1NoteGenerationGoogleCloudGcsPrivateAuthorityM2d,
  rootAbortSignal: AbortSignal,
) {
  return createCaresLinkV1NoteGenerationGoogleCloudGcsAuthorizedOperationPortM2d(
    Object.freeze({ providerAuthority: authority, rootAbortSignal }),
  );
}

function authorityRequest(
  authority: CaresLinkV1NoteGenerationGoogleCloudGcsPrivateAuthorityM2d,
  signal: AbortSignal,
) {
  return Object.freeze({
    purpose: "CARESLINK_V1_COMMUNICATION_NOTE_GCS_PRIVATE_OBJECT_OPERATION",
    projectId: PROJECT_ID,
    bucketLocation: LOCATION,
    runtimePrincipal: RUNTIME_PRINCIPAL,
    audience: GCS_AUDIENCE,
    scope: GCS_SCOPE,
    bucket: BUCKET,
    requiredPermissionSetHash: authority.requiredPermissionSetHash,
    operationTimeoutMs: 30_000,
    requestTimeoutMs: 5_000,
    signal,
  }) as CaresLinkV1NoteGenerationGcsAuthorizedOperationRequest;
}

function captureSession(
  port: CaresLinkV1NoteGenerationGcsAuthorizedOperationPort,
  authority: CaresLinkV1NoteGenerationGoogleCloudGcsPrivateAuthorityM2d,
  signal: AbortSignal,
) {
  let session: unknown;
  port.consumeAuthorizedOperation(authorityRequest(authority, signal), (value) => {
    session = value;
    return opaqueOperation();
  });
  return session as AuthorizedSession;
}

function gcsRequest(value: Readonly<{
  method: "GET" | "POST";
  url: string;
  body: Uint8Array;
  contentType?: string;
}>) {
  return Object.freeze({
    method: value.method,
    url: value.url,
    accept: "application/json" as const,
    ...(value.contentType === undefined
      ? {}
      : {
          contentType: value.contentType,
          contentLength: String(value.body.byteLength),
        }),
    body: value.body,
    redirect: "ERROR" as const,
    automaticRetries: 0 as const,
    timeoutMs: 5_000 as const,
    maximumResponseBytes: 32 * 1_024,
    signal: new AbortController().signal,
  });
}

function opaqueOperation() {
  return Object.freeze({}) as CaresLinkV1NoteGenerationGcsAuthorizedOperation;
}

function expectFixedFailure(operation: () => unknown) {
  let thrown: unknown;
  try {
    operation();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toEqual(FIXED_FAILURE);
}

function base64url(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function jwt(claims: Readonly<Record<string, unknown>>) {
  return `${base64url({ alg: "RS256", typ: "JWT", kid: "test-key" })}.${base64url(claims)}.${Buffer.from("test-only-signature-material").toString("base64url")}`;
}
