import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import type { LookupAddress } from "node:dns";
import type { LookupFunction } from "node:net";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const networkMocks = vi.hoisted(() => ({
  dnsLookup: vi.fn(),
  httpsRequest: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("node:dns", () => ({ lookup: networkMocks.dnsLookup }));
vi.mock("node:https", () => ({ request: networkMocks.httpsRequest }));

import {
  CARESLINK_V1_NOTE_GENERATION_FORMAL_GOOGLE_CLOUD_PROVIDER_HTTPS_TRANSPORT_M2B,
  CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_PROVIDER_HTTPS_TRANSPORT_M2B_READY,
  CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_PROVIDER_HTTPS_TRANSPORT_M2B_SOURCE_POLICY,
  createCaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b,
  type CaresLinkV1NoteGenerationGoogleCloudProviderHttpsRequestM2b,
} from "./note-generation-google-cloud-provider-https-transport-m2b.server";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ACCESS_TOKEN = "test-only-bearer-token-000000000000";
const KMS_KEY =
  "projects/careslink-m1u-security/locations/australia-southeast1/keyRings/careslink-preview/cryptoKeys/payload-envelope";
const KMS_VERSION = `${KMS_KEY}/cryptoKeyVersions/7`;
const IAM_URL =
  "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/careslink-preview-runtime@careslink-m1u-security.iam.gserviceaccount.com:generateAccessToken";
const FIXED_FAILURE = Object.freeze({
  code: "GENERATION_FAILED",
  message: "Google Cloud provider HTTPS transport is unavailable",
});
const PROVIDER_IDENTITY_PROFILES = ["Vercel", "STS", "IAM"] as const;
const REJECTED_IPV6_ADDRESSES = Object.freeze([
  "0:0:0:0:0:0:0:1",
  "0:0:0:0:0:ffff:7f00:1",
  "64:ff9b::1",
  "64:ff9b:1::1",
  "100::1",
  "100:0:0:1::1",
  "2001::1",
  "2001:2::1",
  "2001:10::1",
  "2001:20::1",
  "2001:1ff:ffff:ffff:ffff:ffff:ffff:ffff",
  "2001:db8::1",
  "2001:db8:ffff:ffff:ffff:ffff:ffff:ffff",
  "2001:1000::1",
  "2001:11ff:ffff:ffff:ffff:ffff:ffff:ffff",
  "2002::1",
  "2003:4000::1",
  "2420::1",
  "2610:200::1",
  "2620:200::1",
  "2640::1",
  "2c10::1",
  "2d00::1",
  "2e00::1",
  "3000::1",
  "3800::1",
  "3c00::1",
  "3e00::1",
  "3f00::1",
  "3f80::1",
  "3fc0::1",
  "3fe0::1",
  "3ff0::1",
  "3ff8::1",
  "3ffc::1",
  "3ffe::1",
  "3fff::1",
  "4000::1",
  "5f00::1",
  "fc00::1",
  "fe80::1",
  "ff00::1",
]);
const ALLOCATED_IPV6_BOUNDARIES = Object.freeze([
  "2001:200::1",
  "2001:3ff:ffff:ffff:ffff:ffff:ffff:ffff",
  "2001:db7:ffff:ffff:ffff:ffff:ffff:ffff",
  "2001:db9::1",
  "2001:dff:ffff:ffff:ffff:ffff:ffff:ffff",
  "2001:fff:ffff:ffff:ffff:ffff:ffff:ffff",
  "2001:1200::1",
  "2001:4860::1",
  "2003:3fff:ffff:ffff:ffff:ffff:ffff:ffff",
  "2400::1",
  "2404:6800::1",
  "241f:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
  "260f:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
  "2610::1",
  "2610:1ff:ffff:ffff:ffff:ffff:ffff:ffff",
  "2620::1",
  "2620:1ff:ffff:ffff:ffff:ffff:ffff:ffff",
  "2630::1",
  "263f:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
  "2c00::1",
  "2c0f:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
]);

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

describe("Communication Note Google Cloud provider HTTPS transport M2b", () => {
  it("is server-only, explicit and default-off without ambient discovery", async () => {
    vi.useFakeTimers();
    vi.resetModules();
    await import(
      "./note-generation-google-cloud-provider-https-transport-m2b.server"
    );
    expect(
      CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_PROVIDER_HTTPS_TRANSPORT_M2B_READY,
    ).toBe(false);
    expect(
      CARESLINK_V1_NOTE_GENERATION_FORMAL_GOOGLE_CLOUD_PROVIDER_HTTPS_TRANSPORT_M2B,
    ).toBeUndefined();
    expect(
      CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_PROVIDER_HTTPS_TRANSPORT_M2B_SOURCE_POLICY,
    ).toMatchObject({
      ready: false,
      sourceOnly: true,
      nodeHttpsOwned: true,
      globalFetchAllowed: false,
      credentialDiscoveryPerformedByTransport: false,
      customAgentAllowed: false,
      proxyAllowed: false,
      redirectsAllowed: false,
      automaticRetries: 0,
      requestTimeoutMs: 5_000,
      dnsAllAddressesPreflightRequired: true,
      dnsResolutionPinnedToRequest: true,
      publicRemoteAddressRequired: true,
      ipv6IanaAllocatedGlobalUnicastOnly: true,
      liveNetworkEvidencePresent: false,
      deploymentApproved: false,
      activationApproved: false,
    });

    createCaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b();
    expect(networkMocks.dnsLookup).not.toHaveBeenCalled();
    expect(networkMocks.httpsRequest).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    const source = readFileSync(
      new URL(
        "./note-generation-google-cloud-provider-https-transport-m2b.server.ts",
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

  it("sends one exact TLS request and scrubs request copies and provider chunks", async () => {
    const providerChunk = Buffer.from('{"access_token":"redacted"}');
    const network = installNetworkResponse({
      chunks: [providerChunk],
      deferSecureConnect: true,
    });
    const controller = new AbortController();
    const request = requestFor("https://sts.googleapis.com/v1/token", {
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: encoder.encode("grant_type=test-only"),
      signal: controller.signal,
      maximumResponseBytes: 16 * 1_024,
    });
    const originalBody = Uint8Array.from(request.body);

    const operation = createCaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b().request(
      request,
    );
    await flushMicrotasks();
    expect(network.writtenBodies).toHaveLength(0);
    network.releaseSecureConnect();
    const response = await operation;

    expect(decoder.decode(response.body)).toBe(
      '{"access_token":"redacted"}',
    );
    expect(request.body).toEqual(originalBody);
    expect(providerChunk.every((value) => value === 0)).toBe(true);
    expect(network.writtenBodies).toHaveLength(1);
    expect(network.writtenBodies[0].every((value) => value === 0)).toBe(true);
    expect(network.options).toMatchObject({
      protocol: "https:",
      hostname: "sts.googleapis.com",
      port: 443,
      path: "/v1/token",
      method: "POST",
      signal: controller.signal,
      timeout: 5_000,
      agent: false,
      rejectUnauthorized: true,
      servername: "sts.googleapis.com",
      minVersion: "TLSv1.2",
      lookup: expect.any(Function),
    });
    expect(network.options?.checkServerIdentity).toEqual(expect.any(Function));
    expect(response).toMatchObject({
      status: 200,
      contentType: "application/json",
      responseUrl: "https://sts.googleapis.com/v1/token",
      redirected: false,
    });
  });

  it("admits only the six exact endpoint/method profiles", async () => {
    const allowed = [
      requestFor("https://oidc.vercel.com/~token", {
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "user-agent": "careslink-ai-m2b-test",
        },
      }),
      requestFor("https://sts.googleapis.com/v1/token", {
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
        maximumResponseBytes: 16 * 1_024,
      }),
      bearerRequest(IAM_URL),
      bearerRequest(`https://cloudkms.googleapis.com/v1/${KMS_KEY}`, {
        method: "GET",
        body: new Uint8Array(),
        headers: bearerGetHeaders(),
      }),
      bearerRequest(`https://cloudkms.googleapis.com/v1/${KMS_VERSION}`, {
        method: "GET",
        body: new Uint8Array(),
        headers: bearerGetHeaders(),
      }),
      bearerRequest(
        `https://cloudkms.googleapis.com/v1/${KMS_VERSION}:rawEncrypt`,
      ),
    ];

    for (const request of allowed) {
      installNetworkResponse();
      await expect(
        createCaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b().request(
          request,
        ),
      ).resolves.toMatchObject({ status: 200, responseUrl: request.url });
    }
    expect(networkMocks.dnsLookup).toHaveBeenCalledTimes(allowed.length);
    expect(networkMocks.httpsRequest).toHaveBeenCalledTimes(allowed.length);
  });

  it("rejects SSRF, aliases, URL ambiguity and wrong header classes before I/O", async () => {
    const invalid = [
      requestFor("http://sts.googleapis.com/v1/token"),
      requestFor("https://sts.googleapis.com.evil.test/v1/token"),
      requestFor("https://user@sts.googleapis.com/v1/token"),
      requestFor("https://sts.googleapis.com:444/v1/token"),
      requestFor("https://sts.googleapis.com:443/v1/token"),
      requestFor("https://sts.googleapis.com/v1/token?next=1"),
      requestFor("https://sts.googleapis.com/v1/token#fragment"),
      bearerRequest(
        `https://cloudkms.googleapis.com/v1/${KMS_VERSION.replace(
          "australia-southeast1",
          "us-central1",
        )}`,
        { method: "GET", body: new Uint8Array() },
      ),
      bearerRequest(
        `https://cloudkms.googleapis.com/v1/${KMS_KEY}/cryptoKeyVersions/primary`,
        { method: "GET", body: new Uint8Array() },
      ),
      bearerRequest(
        `https://cloudkms.googleapis.com/v1/${KMS_VERSION}:rawEncrypt`,
        { method: "GET", body: new Uint8Array() },
      ),
      requestFor("https://sts.googleapis.com/v1/token", {
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
          authorization: `Bearer ${ACCESS_TOKEN}`,
        },
      }),
      bearerRequest(IAM_URL, {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${ACCESS_TOKEN}`,
          "content-type": "application/json",
          host: "attacker.invalid",
        },
      }),
    ];

    const transport =
      createCaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b();
    for (const request of invalid) {
      await expect(transport.request(request)).rejects.toEqual(FIXED_FAILURE);
    }
    expect(networkMocks.dnsLookup).not.toHaveBeenCalled();
    expect(networkMocks.httpsRequest).not.toHaveBeenCalled();
  });

  it("rejects a mixed public/private DNS answer before HTTPS or credential write", async () => {
    networkMocks.dnsLookup.mockImplementationOnce(
      (_hostname, _options, callback) =>
        callback(null, [
          { address: "142.250.72.202", family: 4 },
          { address: "169.254.169.254", family: 4 },
        ]),
    );

    await expect(
      createCaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b().request(
        bearerRequest(IAM_URL),
      ),
    ).rejects.toEqual(FIXED_FAILURE);

    expect(networkMocks.dnsLookup).toHaveBeenCalledTimes(1);
    expect(networkMocks.httpsRequest).not.toHaveBeenCalled();
  });

  it.each(PROVIDER_IDENTITY_PROFILES)(
    "rejects IANA special, reserved and unallocated IPv6 for the %s profile before HTTPS",
    async (profile) => {
      const transport =
        createCaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b();
      for (const address of REJECTED_IPV6_ADDRESSES) {
        networkMocks.dnsLookup.mockImplementationOnce(
          (_hostname, _options, callback) =>
            callback(null, [{ address, family: 6 }]),
        );
        await expect(
          transport.request(providerIdentityRequest(profile)),
        ).rejects.toEqual(FIXED_FAILURE);
      }

      expect(networkMocks.dnsLookup).toHaveBeenCalledTimes(
        REJECTED_IPV6_ADDRESSES.length,
      );
      expect(networkMocks.httpsRequest).not.toHaveBeenCalled();
    },
  );

  it.each(PROVIDER_IDENTITY_PROFILES)(
    "accepts only allocated global-unicast IPv6 boundaries for the %s profile",
    async (profile) => {
      const transport =
        createCaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b();
      for (const address of ALLOCATED_IPV6_BOUNDARIES) {
        networkMocks.dnsLookup.mockImplementationOnce(
          (_hostname, _options, callback) =>
            callback(null, [{ address, family: 6 }]),
        );
        const network = installNetworkResponse({ remoteAddress: address });
        await expect(
          transport.request(providerIdentityRequest(profile)),
        ).resolves.toMatchObject({ status: 200 });
        expect(network.writtenBodies).toHaveLength(1);
      }

      expect(networkMocks.dnsLookup).toHaveBeenCalledTimes(
        ALLOCATED_IPV6_BOUNDARIES.length,
      );
      expect(networkMocks.httpsRequest).toHaveBeenCalledTimes(
        ALLOCATED_IPV6_BOUNDARIES.length,
      );
    },
  );

  it("pins every public DNS result into the request lookup and rejects lookup drift", async () => {
    const dnsAddresses = [
      { address: "142.250.72.202", family: 4 as const },
      { address: "2607:f8b0:4007:80d::200a", family: 6 as const },
    ];
    networkMocks.dnsLookup.mockImplementationOnce(
      (_hostname, _options, callback) => callback(null, dnsAddresses),
    );
    const network = installNetworkResponse({ deferSecureConnect: true });
    const operation =
      createCaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b().request(
        bearerRequest(IAM_URL),
      );
    await flushMicrotasks();
    const lookup = network.options?.lookup as LookupFunction;

    await expect(
      lookupAll(lookup, "iamcredentials.googleapis.com"),
    ).resolves.toEqual(dnsAddresses);
    await expect(
      lookupOne(lookup, "iamcredentials.googleapis.com", 4),
    ).resolves.toEqual(dnsAddresses[0]);
    await expect(
      lookupOne(lookup, "iamcredentials.googleapis.com", 6),
    ).resolves.toEqual(dnsAddresses[1]);
    await expect(lookupAll(lookup, "attacker.invalid")).rejects.toMatchObject({
      code: "ENOTFOUND",
    });

    network.releaseSecureConnect();
    await expect(operation).resolves.toMatchObject({ status: 200 });
  });

  it("rejects redirect and unsafe TLS peers with content-free failures", async () => {
    const redirectChunk = Buffer.from("provider-secret-redirect-body");
    installNetworkResponse({ status: 302, chunks: [redirectChunk] });
    const transport =
      createCaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b();
    await expect(
      transport.request(
        requestFor("https://sts.googleapis.com/v1/token", {
          headers: {
            accept: "application/json",
            "content-type": "application/x-www-form-urlencoded",
          },
          maximumResponseBytes: 16 * 1_024,
        }),
      ),
    ).rejects.toEqual(FIXED_FAILURE);
    await flushMicrotasks();
    expect(redirectChunk.every((value) => value === 0)).toBe(true);

    for (const plan of [
      { remoteAddress: "127.0.0.1" },
      { remoteAddress: "8.8.8.8" },
      { authorized: false, authorizationError: "CERT_REJECTED" },
      { servername: "attacker.invalid" },
    ] satisfies ResponsePlan[]) {
      const unsafeNetwork = installNetworkResponse(plan);
      await expect(
        transport.request(bearerRequest(IAM_URL)),
      ).rejects.toEqual(FIXED_FAILURE);
      expect(unsafeNetwork.writtenBodies).toHaveLength(0);
      expect(unsafeNetwork.requests[0].destroyed).toBe(true);
    }
  });

  it("rejects non-200, compressed and non-JSON provider responses", async () => {
    const transport =
      createCaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b();
    const plans: ResponsePlan[] = [
      { status: 401 },
      { status: 429 },
      { status: 500 },
      { headers: { "content-type": "text/plain" } },
      {
        headers: {
          "content-type": "application/json",
          "content-encoding": "gzip",
        },
      },
    ];
    for (const plan of plans) {
      installNetworkResponse(plan);
      await expect(transport.request(bearerRequest(IAM_URL))).rejects.toEqual(
        FIXED_FAILURE,
      );
    }
    expect(networkMocks.httpsRequest).toHaveBeenCalledTimes(5);
  });

  it("fails closed on declared and streamed response overflow and scrubs chunks", async () => {
    installNetworkResponse({
      headers: {
        "content-type": "application/json",
        "content-length": String(16 * 1_024 + 1),
      },
    });
    const transport =
      createCaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b();
    await expect(
      transport.request(bearerRequest(IAM_URL)),
    ).rejects.toEqual(FIXED_FAILURE);

    const first = Buffer.alloc(10_000, 1);
    const second = Buffer.alloc(10_000, 2);
    installNetworkResponse({ chunks: [first, second] });
    await expect(
      transport.request(bearerRequest(IAM_URL)),
    ).rejects.toEqual(FIXED_FAILURE);
    await flushMicrotasks();
    expect(first.every((value) => value === 0)).toBe(true);
    expect(second.every((value) => value === 0)).toBe(true);
  });

  it("enforces the absolute deadline, destroys I/O and scrubs the request copy", async () => {
    vi.useFakeTimers();
    const network = installNetworkResponse({ neverRespond: true });
    const operation =
      createCaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b().request(
        bearerRequest(IAM_URL),
      );
    const assertion = expect(operation).rejects.toEqual(FIXED_FAILURE);

    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;

    expect(network.requests[0].destroyed).toBe(true);
    expect(network.writtenBodies[0].every((value) => value === 0)).toBe(true);
  });

  it("does not commit credentials when TLS does not become secure before the deadline", async () => {
    vi.useFakeTimers();
    const network = installNetworkResponse({ neverSecureConnect: true });
    const operation =
      createCaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b().request(
        bearerRequest(IAM_URL),
      );
    const assertion = expect(operation).rejects.toEqual(FIXED_FAILURE);

    await flushMicrotasks();
    expect(network.writtenBodies).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;

    expect(network.requests[0].destroyed).toBe(true);
    expect(network.writtenBodies).toHaveLength(0);
  });

  it("includes DNS resolution in the deadline and ignores a late DNS answer", async () => {
    vi.useFakeTimers();
    let releaseDns: (() => void) | undefined;
    networkMocks.dnsLookup.mockImplementationOnce(
      (_hostname, _options, callback) => {
        releaseDns = () =>
          callback(null, [{ address: "142.250.72.202", family: 4 }]);
      },
    );
    const operation =
      createCaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b().request(
        bearerRequest(IAM_URL),
      );
    const assertion = expect(operation).rejects.toEqual(FIXED_FAILURE);

    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
    releaseDns?.();
    await flushMicrotasks();

    expect(networkMocks.httpsRequest).not.toHaveBeenCalled();
  });

  it("uses the exact caller AbortSignal and scrubs late responses after abort", async () => {
    const lateChunk = Buffer.from("late-provider-secret");
    const network = installNetworkResponse({
      neverRespond: true,
      deferredResponse: { chunks: [lateChunk] },
    });
    const controller = new AbortController();
    const operation =
      createCaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b().request(
        bearerRequest(IAM_URL, { signal: controller.signal }),
      );
    const assertion = expect(operation).rejects.toEqual(FIXED_FAILURE);

    await flushMicrotasks();
    controller.abort();
    await assertion;
    network.releaseDeferredResponse();
    await flushMicrotasks();

    expect(network.options?.signal).toBe(controller.signal);
    expect(network.requests[0].destroyed).toBe(true);
    expect(lateChunk.every((value) => value === 0)).toBe(true);
  });

  it("rejects oversized requests and malformed input without mutating caller bytes", async () => {
    const oversized = Buffer.alloc(96 * 1_024 + 1, 7);
    const transport =
      createCaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b();
    await expect(
      transport.request(bearerRequest(IAM_URL, { body: oversized })),
    ).rejects.toEqual(FIXED_FAILURE);
    expect(oversized.every((value) => value === 7)).toBe(true);

    const aborted = new AbortController();
    aborted.abort();
    await expect(
      transport.request(bearerRequest(IAM_URL, { signal: aborted.signal })),
    ).rejects.toEqual(FIXED_FAILURE);
    expect(networkMocks.httpsRequest).not.toHaveBeenCalled();
  });
});

type ResponsePlan = Readonly<{
  status?: number;
  headers?: Readonly<Record<string, string>>;
  chunks?: readonly Buffer[];
  remoteAddress?: string;
  authorized?: boolean;
  authorizationError?: string | null;
  servername?: string;
  neverRespond?: boolean;
  deferSecureConnect?: boolean;
  neverSecureConnect?: boolean;
  deferredResponse?: Readonly<{
    chunks?: readonly Buffer[];
  }>;
}>;

class FakeClientRequest extends EventEmitter {
  destroyed = false;
  readonly writtenBodies: Buffer[];
  readonly onEnd: () => void;

  constructor(writtenBodies: Buffer[], onEnd: () => void) {
    super();
    this.writtenBodies = writtenBodies;
    this.onEnd = onEnd;
  }

  end(body?: Uint8Array) {
    if (body) this.writtenBodies.push(body as Buffer);
    this.onEnd();
    return this;
  }

  destroy() {
    this.destroyed = true;
    return this;
  }
}

class FakeTlsSocket extends EventEmitter {
  readonly encrypted = true;
  readonly authorized: boolean;
  readonly authorizationError: string | null;
  readonly remoteAddress: string;
  readonly servername: string;

  constructor(plan: ResponsePlan) {
    super();
    this.authorized = plan.authorized ?? true;
    this.authorizationError = plan.authorizationError ?? null;
    this.remoteAddress = plan.remoteAddress ?? "142.250.72.202";
    this.servername = plan.servername ?? "sts.googleapis.com";
  }
}

class FakeIncomingMessage extends EventEmitter {
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string>>;
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
  const requests: FakeClientRequest[] = [];
  let options: Record<string, unknown> | undefined;
  let releaseDeferred: (() => void) | undefined;
  let releaseSecureConnect: (() => void) | undefined;

  networkMocks.httpsRequest.mockImplementationOnce(
    (requestOptions: unknown, responseCallback: unknown) => {
      options = requestOptions as Record<string, unknown>;
      const callback = responseCallback as (response: FakeIncomingMessage) => void;
      const socket = new FakeTlsSocket({
        ...plan,
        servername:
          plan.servername ??
          String((requestOptions as { servername?: unknown }).servername),
      });
      const emitResponse = (responsePlan: ResponsePlan) => {
        const response = new FakeIncomingMessage(responsePlan, socket);
        callback(response);
        for (const chunk of responsePlan.chunks ?? []) {
          response.emit("data", chunk);
        }
        response.emit("end");
      };
      const request = new FakeClientRequest(writtenBodies, () => {
        if (plan.deferredResponse) {
          releaseDeferred = () => emitResponse(plan.deferredResponse ?? {});
        }
        if (!plan.neverRespond) queueMicrotask(() => emitResponse(plan));
      });
      requests.push(request);
      queueMicrotask(() => {
        request.emit("socket", socket);
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
    requests,
    writtenBodies,
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

function requestFor(
  url: string,
  overrides: Partial<CaresLinkV1NoteGenerationGoogleCloudProviderHttpsRequestM2b> = {},
): CaresLinkV1NoteGenerationGoogleCloudProviderHttpsRequestM2b {
  const controller = new AbortController();
  return {
    method: "POST",
    url,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: encoder.encode('{"test":"only"}'),
    redirect: "ERROR",
    automaticRetries: 0,
    timeoutMs: 5_000,
    maximumResponseBytes: 16 * 1_024,
    signal: controller.signal,
    ...overrides,
  };
}

function bearerRequest(
  url: string,
  overrides: Partial<CaresLinkV1NoteGenerationGoogleCloudProviderHttpsRequestM2b> = {},
): CaresLinkV1NoteGenerationGoogleCloudProviderHttpsRequestM2b {
  return requestFor(url, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${ACCESS_TOKEN}`,
      "content-type": "application/json",
    },
    ...overrides,
  });
}

function bearerGetHeaders() {
  return {
    accept: "application/json",
    authorization: `Bearer ${ACCESS_TOKEN}`,
  };
}

function providerIdentityRequest(
  profile: (typeof PROVIDER_IDENTITY_PROFILES)[number],
): CaresLinkV1NoteGenerationGoogleCloudProviderHttpsRequestM2b {
  if (profile === "Vercel") {
    return requestFor("https://oidc.vercel.com/~token", {
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": "careslink-ai-m2b-test",
      },
    });
  }
  if (profile === "STS") {
    return requestFor("https://sts.googleapis.com/v1/token", {
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
    });
  }
  return bearerRequest(IAM_URL);
}

async function flushMicrotasks() {
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
