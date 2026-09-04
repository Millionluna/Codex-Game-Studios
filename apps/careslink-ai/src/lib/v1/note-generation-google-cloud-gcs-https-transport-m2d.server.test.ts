import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { LookupAddress } from "node:dns";
import type { LookupFunction } from "node:net";
import { checkServerIdentity } from "node:tls";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";

const networkMocks = vi.hoisted(() => ({
  dnsLookup: vi.fn(),
  httpsRequest: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("node:dns", () => ({ lookup: networkMocks.dnsLookup }));
vi.mock("node:https", () => ({ request: networkMocks.httpsRequest }));

import {
  CARESLINK_V1_NOTE_GENERATION_FORMAL_GOOGLE_CLOUD_GCS_HTTPS_TRANSPORT_M2D,
  CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_GCS_HTTPS_TRANSPORT_M2D_READY,
  CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_GCS_HTTPS_TRANSPORT_M2D_SOURCE_POLICY,
  createCaresLinkV1NoteGenerationGoogleCloudGcsHttpsTransportM2d,
  type CaresLinkV1NoteGenerationGoogleCloudGcsHttpsRequestM2d,
} from "./note-generation-google-cloud-gcs-https-transport-m2d.server";

const crc32c = createRequire(import.meta.url)("fast-crc32c") as Readonly<{
  calculate(data: Uint8Array): number;
}>;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const BUCKET = "careslink-m1u-communication-note-preview";
const OBJECT_PREFIX = "communication-note/v1";
const OWNER_HASH = "a".repeat(64);
const IDEMPOTENCY_HASH = "b".repeat(64);
const OBJECT_NAME =
  `${OBJECT_PREFIX}/payloads/${OWNER_HASH}/${IDEMPOTENCY_HASH}.json`;
const ENCODED_OBJECT = encodeURIComponent(OBJECT_NAME);
const OBJECT_FIELDS =
  "bucket,name,generation,metageneration,size,crc32c,contentType,cacheControl,metadata,temporaryHold,eventBasedHold";
const ENCODED_FIELDS = encodeURIComponent(OBJECT_FIELDS);
const METADATA_URL =
  `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${ENCODED_OBJECT}?projection=noAcl&fields=${ENCODED_FIELDS}`;
const MEDIA_URL =
  `https://storage.googleapis.com/download/storage/v1/b/${BUCKET}/o/${ENCODED_OBJECT}?alt=media&generation=17&ifGenerationMatch=17&ifMetagenerationMatch=3`;
const CREATE_URL =
  `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=multipart&ifGenerationMatch=0&fields=${ENCODED_FIELDS}`;
const CAS_URL =
  `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=multipart&ifGenerationMatch=17&ifMetagenerationMatch=3&fields=${ENCODED_FIELDS}`;
const TOKEN = "test-only-gcs-bearer-token-000000000000";
const MULTIPART_BOUNDARY =
  "===============careslink_m2a_gcs_private_object==";
const MULTIPART_CONTENT_TYPE =
  `multipart/related; boundary="${MULTIPART_BOUNDARY}"`;
const FIXED_FAILURE = Object.freeze({
  code: "GENERATION_FAILED",
  message: "Google Cloud GCS HTTPS transport is unavailable",
});

beforeEach(() => {
  networkMocks.dnsLookup.mockReset();
  networkMocks.dnsLookup.mockImplementation(
    (_hostname, _options, callback) =>
      callback(null, [{ address: "142.250.72.202", family: 4 }]),
  );
  networkMocks.httpsRequest.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Communication Note Google Cloud GCS HTTPS transport M2d", () => {
  it("is server-only, explicit and default-off without ambient discovery", async () => {
    vi.useFakeTimers();
    vi.resetModules();
    await import(
      "./note-generation-google-cloud-gcs-https-transport-m2d.server"
    );

    expect(
      CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_GCS_HTTPS_TRANSPORT_M2D_READY,
    ).toBe(false);
    expect(
      CARESLINK_V1_NOTE_GENERATION_FORMAL_GOOGLE_CLOUD_GCS_HTTPS_TRANSPORT_M2D,
    ).toBeUndefined();
    expect(
      CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_GCS_HTTPS_TRANSPORT_M2D_SOURCE_POLICY,
    ).toMatchObject({
      status: "SOURCE_GCS_HTTPS_TRANSPORT_NOT_COMPOSED",
      ready: false,
      sourceOnly: true,
      nodeHttpsOwned: true,
      globalFetchAllowed: false,
      ambientCredentialDiscoveryAllowed: false,
      proxyAllowed: false,
      redirectsAllowed: false,
      automaticRetries: 0,
      requestTimeoutMs: 5_000,
      exactBucketPerInstance: true,
      exactObjectPrefixPerInstance: true,
      acceptEncodingIdentityRequired: true,
      tlsBeforeRequestCommitRequired: true,
      googlePublishedIpv6PrefixesPinned: true,
      googlePublicIpRangesSource:
        "https://www.gstatic.com/ipranges/goog.json",
      googlePublicIpRangesSyncToken: "1788465834692",
      googlePublicIpRangesCreationTime: "2026-09-03T13:03:54.692807",
      liveNetworkEvidencePresent: false,
      activationApproved: false,
    });

    transport();
    expect(networkMocks.dnsLookup).not.toHaveBeenCalled();
    expect(networkMocks.httpsRequest).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    const source = readFileSync(
      new URL(
        "./note-generation-google-cloud-gcs-https-transport-m2d.server.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(source.startsWith('import "server-only";')).toBe(true);
    expect(source).toContain('from "node:https"');
    expect(source).not.toMatch(
      /\bfetch\s*\(|process\.env|import\.meta\.env|GOOGLE_APPLICATION_CREDENTIALS|google-auth-library|@google-cloud|https?_proxy|console\.|\blogger\b/i,
    );
  });

  it("accepts only an exact frozen bucket and object-prefix factory scope", () => {
    expect(() =>
      createCaresLinkV1NoteGenerationGoogleCloudGcsHttpsTransportM2d({
        bucket: BUCKET,
        objectPrefix: OBJECT_PREFIX,
      }),
    ).toThrow(FIXED_FAILURE);
    for (const options of [
      Object.freeze({ bucket: `${BUCKET}A`, objectPrefix: OBJECT_PREFIX }),
      Object.freeze({ bucket: BUCKET, objectPrefix: "../outside" }),
      Object.freeze({ bucket: BUCKET, objectPrefix: OBJECT_PREFIX, extra: true }),
      Object.freeze({ bucket: "ab", objectPrefix: OBJECT_PREFIX }),
    ]) {
      expect(() =>
        createCaresLinkV1NoteGenerationGoogleCloudGcsHttpsTransportM2d(
          options,
        ),
      ).toThrow(FIXED_FAILURE);
    }
    expect(networkMocks.dnsLookup).not.toHaveBeenCalled();
    expect(networkMocks.httpsRequest).not.toHaveBeenCalled();
  });

  it("commits exact headers and an empty GET body only after pinned TLS", async () => {
    const providerChunk = Buffer.from("{}");
    const network = installNetworkResponse({
      chunks: [providerChunk],
      deferSecureConnect: true,
    });
    const request = metadataRequest();
    const originalBody = Uint8Array.from(request.body);

    const pending = transport().request(request);
    await flushMicrotasks();
    expect(network.endCallCount).toBe(0);
    expect(network.committedHeaders).toHaveLength(0);
    network.releaseSecureConnect();
    const response = await pending;

    expect(network.endCallCount).toBe(1);
    expect(network.committedHeaders).toEqual([bearerGetHeaders()]);
    expect(network.writtenBodies).toHaveLength(1);
    expect(network.writtenBodies[0]).toHaveLength(0);
    expect(providerChunk.every((byte) => byte === 0)).toBe(true);
    expect(request.body).toEqual(originalBody);
    expect(response).toMatchObject({
      status: 200,
      contentType: "application/json",
      responseUrl: METADATA_URL,
      redirected: false,
    });
    expect(decoder.decode(response.body)).toBe("{}");
    expect(network.options).toMatchObject({
      protocol: "https:",
      hostname: "storage.googleapis.com",
      port: 443,
      path: new URL(METADATA_URL).pathname + new URL(METADATA_URL).search,
      method: "GET",
      headers: bearerGetHeaders(),
      signal: request.signal,
      timeout: 5_000,
      agent: false,
      rejectUnauthorized: true,
      servername: "storage.googleapis.com",
      minVersion: "TLSv1.2",
      lookup: expect.any(Function),
      checkServerIdentity: expect.any(Function),
    });
    expect(network.options?.checkServerIdentity).toBe(checkServerIdentity);
  });

  it("admits only the three exact M2c profiles and their bounded statuses", async () => {
    const multipart = multipartBody();
    const allowed = [
      { request: metadataRequest(), status: 404 },
      { request: mediaRequest(), status: 200 },
      {
        request: mediaRequest({ maximumResponseBytes: 4 * 1_024 }),
        status: 200,
      },
      { request: mediaRequest(), status: 404 },
      { request: mediaRequest(), status: 412 },
      { request: uploadRequest(CREATE_URL, multipart), status: 200 },
      { request: uploadRequest(CAS_URL, multipart), status: 412 },
    ];
    for (const candidate of allowed) {
      installNetworkResponse({ status: candidate.status });
      await expect(transport().request(candidate.request)).resolves.toMatchObject(
        {
          status: candidate.status,
          responseUrl: candidate.request.url,
        },
      );
    }
    expect(networkMocks.dnsLookup).toHaveBeenCalledTimes(allowed.length);
    expect(networkMocks.httpsRequest).toHaveBeenCalledTimes(allowed.length);
  });

  it("rejects endpoint, object namespace and canonical-query drift before I/O", async () => {
    const invalidUrls = [
      "http://storage.googleapis.com/",
      METADATA_URL.replace("storage.googleapis.com", "storage.googleapis.com.evil.test"),
      METADATA_URL.replace("https://", "https://user@"),
      METADATA_URL.replace("storage.googleapis.com/", "storage.googleapis.com:443/"),
      `${METADATA_URL}#fragment`,
      METADATA_URL.replace(BUCKET, `${BUCKET}-other`),
      METADATA_URL.replace(ENCODED_OBJECT, OBJECT_NAME),
      METADATA_URL.replace(OWNER_HASH, "A".repeat(64)),
      METADATA_URL.replace("communication-note%2Fv1", "other%2Fv1"),
      METADATA_URL.replace("?projection=noAcl&fields=", "?fields=").replace(
        ENCODED_FIELDS,
        `${ENCODED_FIELDS}&projection=noAcl`,
      ),
      METADATA_URL.replace("projection=noAcl&", "projection=full&"),
      MEDIA_URL.replace("ifGenerationMatch=17", "ifGenerationMatch=18"),
      MEDIA_URL.replace("generation=17", "generation=0"),
      MEDIA_URL.replace("&ifMetagenerationMatch=3", ""),
      CREATE_URL.replace("&fields=", "&extra=1&fields="),
      CAS_URL.replace("&ifMetagenerationMatch=3", ""),
      "https://sts.googleapis.com/v1/token",
      "http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token",
    ];
    for (const url of invalidUrls) {
      await expect(
        transport().request(metadataRequest({ url })),
      ).rejects.toEqual(FIXED_FAILURE);
    }
    await expect(
      transport().request(metadataRequest({ method: "POST" })),
    ).rejects.toEqual(FIXED_FAILURE);
    expect(networkMocks.dnsLookup).not.toHaveBeenCalled();
    expect(networkMocks.httpsRequest).not.toHaveBeenCalled();
  });

  it("rejects header, cap and multipart-body drift before I/O", async () => {
    const multipart = multipartBody();
    const mismatchedBody = Uint8Array.from(multipart);
    mismatchedBody[mismatchedBody.length - 80] ^= 1;
    const wrongNameBody = multipartBody(
      `${OBJECT_PREFIX}/outside/${OWNER_HASH}/${IDEMPOTENCY_HASH}.json`,
    );
    const invalid = [
      metadataRequest({
        headers: { ...bearerGetHeaders(), cookie: "secret-cookie" },
      }),
      metadataRequest({
        headers: { ...bearerGetHeaders(), "accept-encoding": "gzip" },
      }),
      metadataRequest({
        headers: { ...bearerGetHeaders(), authorization: "Basic abcdef" },
      }),
      metadataRequest({ body: encoder.encode("not-empty") }),
      metadataRequest({ maximumResponseBytes: 32 * 1_024 - 1 }),
      mediaRequest({ maximumResponseBytes: 32 * 1_024 }),
      uploadRequest(CREATE_URL, multipart, {
        headers: {
          ...bearerPostHeaders(multipart),
          "content-length": String(multipart.byteLength + 1),
        },
      }),
      uploadRequest(CREATE_URL, multipart, {
        headers: {
          ...bearerPostHeaders(multipart),
          "content-type": "multipart/form-data",
        },
      }),
      uploadRequest(CREATE_URL, mismatchedBody),
      uploadRequest(CREATE_URL, wrongNameBody),
    ];
    for (const request of invalid) {
      await expect(transport().request(request)).rejects.toEqual(FIXED_FAILURE);
    }
    expect(networkMocks.dnsLookup).not.toHaveBeenCalled();
    expect(networkMocks.httpsRequest).not.toHaveBeenCalled();
  });

  it("rejects private, reserved and unapproved DNS answers and pins approved public results", async () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.1",
      "169.254.169.254",
      "192.168.1.2",
      "192.88.99.1",
      "::1",
      "fc00::1",
      "::ffff:169.254.169.254",
      "2001::1",
      "2001:2::1",
      "2001:10::1",
      "2001:db8::1",
      "2001:4861::1",
      "2600:1910::1",
      "2607:1c0:241:50::1",
      "2607:1c0:400::1",
      "2d00::1",
      "3000::1",
      "3f00::1",
      "3ffe::1",
      "3fff::1",
      "3fff:1000::1",
      "4000::1",
    ]) {
      networkMocks.dnsLookup.mockImplementationOnce(
        (_hostname, _options, callback) =>
          callback(null, [
            { address: "142.250.72.202", family: 4 },
            { address, family: address.includes(":") ? 6 : 4 },
          ]),
      );
      await expect(transport().request(metadataRequest())).rejects.toEqual(
        FIXED_FAILURE,
      );
    }
    expect(networkMocks.httpsRequest).not.toHaveBeenCalled();

    for (const address of [
      "2001:4860::1",
      "2404:6800::1",
      "2404:f340::1",
      "2600:1900::1",
      "2600:190f:ffff:ffff:ffff:ffff:ffff:ffff",
      "2605:ef80::1",
      "2606:40::1",
      "2606:73c0::1",
      "2607:1c0:241:40::1",
      "2607:1c0:241:4f:ffff:ffff:ffff:ffff",
      "2607:1c0:300::1",
      "2607:1c0:3ff:ffff:ffff:ffff:ffff:ffff",
      "2607:f8b0::1",
      "2620:11a:a000::1",
      "2620:120:e000::1",
      "2800:3f0::1",
      "2a00:1450::1",
      "2c0f:fb50::1",
    ]) {
      networkMocks.dnsLookup.mockImplementationOnce(
        (_hostname, _options, callback) =>
          callback(null, [{ address, family: 6 }]),
      );
      const approvedNetwork = installNetworkResponse({
        remoteAddress: address,
      });
      await transport().request(metadataRequest());
      expect(approvedNetwork.endCallCount).toBe(1);
    }

    networkMocks.dnsLookup.mockImplementationOnce(
      (_hostname, _options, callback) =>
        callback(null, [
          { address: "142.250.72.202", family: 4 },
          { address: "2607:f8b0:4006:817::200a", family: 6 },
        ]),
    );
    const network = installNetworkResponse();
    await transport().request(metadataRequest());
    const lookup = network.options?.lookup as LookupFunction;
    await expect(lookupAll(lookup, "storage.googleapis.com")).resolves.toEqual(
      [
        { address: "142.250.72.202", family: 4 },
        { address: "2607:f8b0:4006:817::200a", family: 6 },
      ],
    );
    await expect(
      lookupOne(lookup, "storage.googleapis.com.evil.test", 4),
    ).rejects.toMatchObject({ code: "ENOTFOUND" });
  });

  it("does not commit bearer headers or bodies to an unsafe TLS peer", async () => {
    const unsafePlans: ResponsePlan[] = [
      { authorized: false },
      { authorizationError: "CERT_HAS_EXPIRED" },
      { servername: "storage.googleapis.com.evil.test" },
      { remoteAddress: "127.0.0.1" },
      { remoteAddress: "142.250.72.203" },
      { encrypted: false },
      { responseBeforeSecureConnect: true },
    ];
    for (const plan of unsafePlans) {
      const network = installNetworkResponse(plan);
      await expect(transport().request(metadataRequest())).rejects.toEqual(
        FIXED_FAILURE,
      );
      expect(network.endCallCount).toBe(0);
      expect(network.committedHeaders).toHaveLength(0);
      expect(network.writtenBodies).toHaveLength(0);
    }
  });

  it("rejects redirect, retryable, compressed and wrong-profile responses without retry", async () => {
    const invalidPlans: ResponsePlan[] = [
      { status: 301, headers: { "content-type": "application/json", location: METADATA_URL } },
      { status: 401 },
      { status: 429 },
      { status: 500 },
      { headers: { "content-type": "application/json", "content-encoding": "gzip" } },
      { headers: { "content-type": "text/plain" } },
    ];
    for (const plan of invalidPlans) {
      const chunk = Buffer.from('{"secret":"provider-body"}');
      const network = installNetworkResponse({ ...plan, chunks: [chunk] });
      await expect(transport().request(metadataRequest())).rejects.toEqual(
        FIXED_FAILURE,
      );
      expect(network.endCallCount).toBe(1);
      expect(chunk.every((byte) => byte === 0)).toBe(true);
    }
    expect(networkMocks.httpsRequest).toHaveBeenCalledTimes(
      invalidPlans.length,
    );
    expect(networkMocks.dnsLookup).toHaveBeenCalledTimes(invalidPlans.length);
  });

  it("bounds declared and streamed response bytes and scrubs every chunk", async () => {
    const declared = Buffer.from("provider-secret");
    installNetworkResponse({
      headers: {
        "content-type": "application/json",
        "content-length": String(32 * 1_024 + 1),
      },
      chunks: [declared],
    });
    await expect(transport().request(metadataRequest())).rejects.toEqual(
      FIXED_FAILURE,
    );
    expect(declared.every((byte) => byte === 0)).toBe(true);

    const first = Buffer.alloc(20 * 1_024, 1);
    const second = Buffer.alloc(20 * 1_024, 2);
    installNetworkResponse({ chunks: [first, second] });
    await expect(transport().request(metadataRequest())).rejects.toEqual(
      FIXED_FAILURE,
    );
    expect(first.every((byte) => byte === 0)).toBe(true);
    expect(second.every((byte) => byte === 0)).toBe(true);
  });

  it("enforces one absolute deadline across DNS and TLS with zero pre-TLS commit", async () => {
    vi.useFakeTimers();
    let dnsCallback:
      | ((error: null, addresses: LookupAddress[]) => void)
      | undefined;
    networkMocks.dnsLookup.mockImplementationOnce(
      (_hostname, _options, callback) => {
        dnsCallback = callback;
      },
    );
    const dnsPending = transport().request(metadataRequest());
    const dnsRejection = expect(dnsPending).rejects.toEqual(FIXED_FAILURE);
    await vi.advanceTimersByTimeAsync(5_000);
    await dnsRejection;
    expect(networkMocks.httpsRequest).not.toHaveBeenCalled();
    dnsCallback?.(null, [{ address: "142.250.72.202", family: 4 }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(networkMocks.httpsRequest).not.toHaveBeenCalled();

    const multipart = multipartBody();
    const tlsNetwork = installNetworkResponse({ neverSecureConnect: true });
    const tlsPending = transport().request(uploadRequest(CREATE_URL, multipart));
    const tlsRejection = expect(tlsPending).rejects.toEqual(FIXED_FAILURE);
    await vi.advanceTimersByTimeAsync(5_000);
    await tlsRejection;
    expect(tlsNetwork.endCallCount).toBe(0);
    expect(tlsNetwork.committedHeaders).toHaveLength(0);
    expect(tlsNetwork.writtenBodies).toHaveLength(0);
    expect(tlsNetwork.requests[0]?.destroyed).toBe(true);

    const committedNetwork = installNetworkResponse({ neverRespond: true });
    const committedPending = transport().request(
      uploadRequest(CREATE_URL, multipart),
    );
    const committedRejection = expect(committedPending).rejects.toEqual(
      FIXED_FAILURE,
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(committedNetwork.endCallCount).toBe(1);
    expect(
      committedNetwork.writtenBodies[0]?.some((byte) => byte !== 0),
    ).toBe(true);
    await vi.advanceTimersByTimeAsync(5_000);
    await committedRejection;
    expect(
      committedNetwork.writtenBodies[0]?.every((byte) => byte === 0),
    ).toBe(true);
    expect(committedNetwork.requests[0]?.destroyed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses the exact AbortSignal and scrubs a response arriving after abort", async () => {
    const alreadyAborted = new AbortController();
    alreadyAborted.abort("preflight-abort-secret");
    await expect(
      transport().request(metadataRequest({ signal: alreadyAborted.signal })),
    ).rejects.toEqual(FIXED_FAILURE);
    expect(networkMocks.dnsLookup).not.toHaveBeenCalled();
    expect(networkMocks.httpsRequest).not.toHaveBeenCalled();

    const lateChunk = Buffer.from('{"access_token":"must-not-escape"}');
    const network = installNetworkResponse({
      deferredResponse: { chunks: [lateChunk] },
    });
    const controller = new AbortController();
    const request = metadataRequest({ signal: controller.signal });
    const pending = transport().request(request);
    await flushMicrotasks();
    expect(network.endCallCount).toBe(1);
    controller.abort("abort-secret-sentinel");
    const error = await pending.catch((caught: unknown) => caught);
    expect(error).toEqual(FIXED_FAILURE);
    expect(network.options?.signal).toBe(controller.signal);
    expect(network.requests[0]?.destroyed).toBe(true);

    network.releaseDeferredResponse();
    await flushMicrotasks();
    expect(lateChunk.every((byte) => byte === 0)).toBe(true);
    expect(JSON.stringify(error)).not.toMatch(
      /must-not-escape|abort-secret-sentinel|test-only-gcs-bearer/,
    );
  });
});

type ResponsePlan = Readonly<{
  status?: number;
  headers?: Readonly<Record<string, string | readonly string[]>>;
  chunks?: readonly Buffer[];
  neverRespond?: boolean;
  deferSecureConnect?: boolean;
  neverSecureConnect?: boolean;
  responseBeforeSecureConnect?: boolean;
  deferredResponse?: ResponsePlan;
  encrypted?: boolean;
  authorized?: boolean;
  authorizationError?: string | null;
  remoteAddress?: string;
  servername?: string;
}>;

class FakeClientRequest extends EventEmitter {
  destroyed = false;
  endCallCount = 0;
  readonly writtenBodies: Buffer[];
  readonly committedHeaders: Readonly<Record<string, string>>[];
  readonly requestHeaders: Readonly<Record<string, string>>;
  readonly onEnd: () => void;

  constructor(
    writtenBodies: Buffer[],
    committedHeaders: Readonly<Record<string, string>>[],
    requestHeaders: Readonly<Record<string, string>>,
    onEnd: () => void,
  ) {
    super();
    this.writtenBodies = writtenBodies;
    this.committedHeaders = committedHeaders;
    this.requestHeaders = requestHeaders;
    this.onEnd = onEnd;
  }

  end(body?: Uint8Array) {
    this.endCallCount += 1;
    this.committedHeaders.push(Object.freeze({ ...this.requestHeaders }));
    if (body !== undefined) this.writtenBodies.push(body as Buffer);
    this.onEnd();
    return this;
  }

  destroy() {
    this.destroyed = true;
    return this;
  }
}

class FakeTlsSocket extends EventEmitter {
  readonly encrypted: boolean;
  readonly authorized: boolean;
  readonly authorizationError: string | null;
  readonly remoteAddress: string;
  readonly servername: string;

  constructor(plan: ResponsePlan, expectedServername: string) {
    super();
    this.encrypted = plan.encrypted ?? true;
    this.authorized = plan.authorized ?? true;
    this.authorizationError = plan.authorizationError ?? null;
    this.remoteAddress = plan.remoteAddress ?? "142.250.72.202";
    this.servername = plan.servername ?? expectedServername;
  }
}

class FakeIncomingMessage extends EventEmitter {
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string | readonly string[]>>;
  readonly socket: FakeTlsSocket;
  aborted = false;
  complete = true;
  destroyed = false;

  constructor(plan: ResponsePlan, socket: FakeTlsSocket) {
    super();
    this.statusCode = plan.status ?? 200;
    this.headers = plan.headers ?? { "content-type": "application/json" };
    this.socket = socket;
  }

  destroy() {
    this.destroyed = true;
    return this;
  }
}

function installNetworkResponse(plan: ResponsePlan = {}) {
  const writtenBodies: Buffer[] = [];
  const committedHeaders: Readonly<Record<string, string>>[] = [];
  const requests: FakeClientRequest[] = [];
  let options: Record<string, unknown> | undefined;
  let releaseDeferred: (() => void) | undefined;
  let releaseSecureConnect: (() => void) | undefined;

  networkMocks.httpsRequest.mockImplementationOnce(
    (requestOptions: unknown, responseCallback: unknown) => {
      options = requestOptions as Record<string, unknown>;
      const callback = responseCallback as (
        response: FakeIncomingMessage,
      ) => void;
      const requestHeaders = (requestOptions as {
        headers: Readonly<Record<string, string>>;
      }).headers;
      const socket = new FakeTlsSocket(
        plan,
        String((requestOptions as { servername?: unknown }).servername),
      );
      const emitResponse = (responsePlan: ResponsePlan) => {
        const response = new FakeIncomingMessage(responsePlan, socket);
        callback(response);
        for (const chunk of responsePlan.chunks ?? [Buffer.from("{}")]) {
          response.emit("data", chunk);
        }
        response.emit("end");
      };
      const request = new FakeClientRequest(
        writtenBodies,
        committedHeaders,
        requestHeaders,
        () => {
          if (plan.deferredResponse) {
            releaseDeferred = () =>
              emitResponse(plan.deferredResponse ?? {});
          }
          if (!plan.neverRespond && !plan.deferredResponse) {
            queueMicrotask(() => emitResponse(plan));
          }
        },
      );
      requests.push(request);
      queueMicrotask(() => {
        request.emit("socket", socket);
        if (plan.responseBeforeSecureConnect) {
          emitResponse(plan);
          return;
        }
        const emitSecureConnect = () => socket.emit("secureConnect");
        if (plan.deferSecureConnect) {
          releaseSecureConnect = emitSecureConnect;
        } else if (!plan.neverSecureConnect) {
          queueMicrotask(emitSecureConnect);
        }
      });
      return request;
    },
  );

  return {
    get options() {
      return options;
    },
    get endCallCount() {
      return requests.reduce((total, request) => total + request.endCallCount, 0);
    },
    requests,
    writtenBodies,
    committedHeaders,
    releaseSecureConnect() {
      if (!releaseSecureConnect) {
        throw new Error("No deferred secureConnect event is available");
      }
      const release = releaseSecureConnect;
      releaseSecureConnect = undefined;
      release();
    },
    releaseDeferredResponse() {
      if (!releaseDeferred) throw new Error("No deferred response is available");
      const release = releaseDeferred;
      releaseDeferred = undefined;
      release();
    },
  };
}

function transport() {
  return createCaresLinkV1NoteGenerationGoogleCloudGcsHttpsTransportM2d(
    Object.freeze({ bucket: BUCKET, objectPrefix: OBJECT_PREFIX }),
  );
}

function metadataRequest(
  overrides: Partial<CaresLinkV1NoteGenerationGoogleCloudGcsHttpsRequestM2d> = {},
): CaresLinkV1NoteGenerationGoogleCloudGcsHttpsRequestM2d {
  const controller = new AbortController();
  return {
    method: "GET",
    url: METADATA_URL,
    headers: bearerGetHeaders(),
    body: new Uint8Array(),
    redirect: "ERROR",
    automaticRetries: 0,
    timeoutMs: 5_000,
    maximumResponseBytes: 32 * 1_024,
    signal: controller.signal,
    ...overrides,
  };
}

function mediaRequest(
  overrides: Partial<CaresLinkV1NoteGenerationGoogleCloudGcsHttpsRequestM2d> = {},
) {
  return metadataRequest({
    url: MEDIA_URL,
    maximumResponseBytes: 256 * 1_024,
    ...overrides,
  });
}

function uploadRequest(
  url: string,
  body: Uint8Array,
  overrides: Partial<CaresLinkV1NoteGenerationGoogleCloudGcsHttpsRequestM2d> = {},
): CaresLinkV1NoteGenerationGoogleCloudGcsHttpsRequestM2d {
  return metadataRequest({
    method: "POST",
    url,
    headers: bearerPostHeaders(body),
    body,
    maximumResponseBytes: 32 * 1_024,
    ...overrides,
  });
}

function bearerGetHeaders() {
  return {
    accept: "application/json",
    "accept-encoding": "identity",
    authorization: `Bearer ${TOKEN}`,
  };
}

function bearerPostHeaders(body: Uint8Array) {
  return {
    ...bearerGetHeaders(),
    "content-length": String(body.byteLength),
    "content-type": MULTIPART_CONTENT_TYPE,
  };
}

function multipartBody(objectName = OBJECT_NAME) {
  const objectBody = encoder.encode('{"ciphertextBase64url":"dGVzdA"}');
  const metadataText = stringifyCaresLinkV1CanonicalJson({
    name: objectName,
    contentType: "application/json",
    cacheControl: "no-store",
    crc32c: crc32cBase64(objectBody),
    metadata: {
      careslinkObjectKind: "SEALED_PAYLOAD",
      careslinkLocatorHash: sha256(
        encoder.encode(
          stringifyCaresLinkV1CanonicalJson({
            purpose:
              "CARESLINK_V1_COMMUNICATION_NOTE_GCS_PRIVATE_OBJECT_LOCATOR",
            origin: "https://storage.googleapis.com",
            bucket: BUCKET,
            objectName,
          }),
        ),
      ),
      careslinkBodySha256: sha256(objectBody),
      careslinkDeleteBindingHash: "c".repeat(64),
      careslinkBackupDispositionVersion: "no-soft-delete.2026-09-03.v1",
    },
  });
  const prefix = encoder.encode(
    `--${MULTIPART_BOUNDARY}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataText}\r\n--${MULTIPART_BOUNDARY}\r\nContent-Type: application/json\r\n\r\n`,
  );
  const suffix = encoder.encode(`\r\n--${MULTIPART_BOUNDARY}--\r\n`);
  const body = new Uint8Array(
    prefix.byteLength + objectBody.byteLength + suffix.byteLength,
  );
  body.set(prefix, 0);
  body.set(objectBody, prefix.byteLength);
  body.set(suffix, prefix.byteLength + objectBody.byteLength);
  return body;
}

function crc32cBase64(value: Uint8Array) {
  const output = Buffer.allocUnsafe(4);
  output.writeUInt32BE(crc32c.calculate(value) >>> 0);
  return output.toString("base64");
}

function sha256(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function lookupAll(lookup: LookupFunction, hostname: string) {
  return new Promise<LookupAddress[]>((resolve, reject) => {
    lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error) reject(error);
      else if (Array.isArray(addresses)) resolve(addresses);
      else reject(new Error("Expected an all-address lookup result"));
    });
  });
}

function lookupOne(
  lookup: LookupFunction,
  hostname: string,
  family: 4 | 6,
) {
  return new Promise<LookupAddress>((resolve, reject) => {
    lookup(hostname, { all: false, family }, (error, address, resultFamily) => {
      if (error) reject(error);
      else if (
        typeof address === "string" &&
        (resultFamily === 4 || resultFamily === 6)
      ) {
        resolve({ address, family: resultFamily });
      } else {
        reject(new Error("Expected a one-address lookup result"));
      }
    });
  });
}
