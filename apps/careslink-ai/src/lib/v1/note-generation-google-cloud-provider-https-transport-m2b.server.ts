import "server-only";

import {
  lookup as nodeDnsLookup,
  type LookupAddress,
  type LookupOptions,
} from "node:dns";
import { request as nodeHttpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { checkServerIdentity } from "node:tls";
import type { TLSSocket } from "node:tls";
import { types as nodeTypes } from "node:util";

const REQUEST_TIMEOUT_MS = 5_000 as const;
const REQUEST_BODY_MAXIMUM_BYTES = 96 * 1_024;
const TOKEN_RESPONSE_MAXIMUM_BYTES = 16 * 1_024;
const KMS_RESPONSE_MAXIMUM_BYTES = 64 * 1_024;
const AUTHORIZATION_MAXIMUM_BYTES = 16 * 1_024;

const VERCEL_TOKEN_EXCHANGE_URL = "https://oidc.vercel.com/~token" as const;
const STS_TOKEN_EXCHANGE_URL = "https://sts.googleapis.com/v1/token" as const;
const RUNTIME_SERVICE_ACCOUNT =
  "careslink-preview-runtime@careslink-m1u-security.iam.gserviceaccount.com" as const;
const IAM_CREDENTIALS_URL =
  `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${RUNTIME_SERVICE_ACCOUNT}:generateAccessToken` as const;
const KMS_ORIGIN = "https://cloudkms.googleapis.com" as const;
const KMS_CRYPTO_KEY_PATH =
  /^\/v1\/projects\/careslink-m1u-security\/locations\/australia-southeast1\/keyRings\/[A-Za-z0-9_-]{1,63}\/cryptoKeys\/[A-Za-z0-9_-]{1,63}$/;
const KMS_CRYPTO_KEY_VERSION_PATH =
  /^\/v1\/projects\/careslink-m1u-security\/locations\/australia-southeast1\/keyRings\/[A-Za-z0-9_-]{1,63}\/cryptoKeys\/[A-Za-z0-9_-]{1,63}\/cryptoKeyVersions\/[1-9][0-9]{0,18}$/;
const KMS_RAW_ENCRYPT_PATH =
  /^\/v1\/projects\/careslink-m1u-security\/locations\/australia-southeast1\/keyRings\/[A-Za-z0-9_-]{1,63}\/cryptoKeys\/[A-Za-z0-9_-]{1,63}\/cryptoKeyVersions\/[1-9][0-9]{0,18}:rawEncrypt$/;
const BEARER_PATTERN = /^Bearer [A-Za-z0-9][A-Za-z0-9._~+\/-]{15,16383}={0,2}$/;
const CONTENT_LENGTH_PATTERN = /^(0|[1-9][0-9]{0,15})$/;

type Ipv6Prefix = Readonly<{
  network: bigint;
  prefixLength: number;
}>;

// Snapshot of the ALLOCATED rows in the IANA IPv6 Global Unicast Address
// Space registry, reviewed 2026-09-04. The partially allocated 2001::/23 and
// transition-only 2002::/16 rows are conservatively absent even though some
// narrower special-purpose entries are globally reachable. Unlisted and newly
// allocated space therefore fails closed until this auditable list is
// deliberately reviewed and updated.
// https://www.iana.org/assignments/ipv6-unicast-address-assignments/
const IANA_ALLOCATED_IPV6_GLOBAL_UNICAST_PREFIXES = Object.freeze([
  defineIpv6Prefix("2001:200::/23"),
  defineIpv6Prefix("2001:400::/23"),
  defineIpv6Prefix("2001:600::/23"),
  defineIpv6Prefix("2001:800::/22"),
  defineIpv6Prefix("2001:c00::/23"),
  defineIpv6Prefix("2001:e00::/23"),
  defineIpv6Prefix("2001:1200::/23"),
  defineIpv6Prefix("2001:1400::/22"),
  defineIpv6Prefix("2001:1800::/23"),
  defineIpv6Prefix("2001:1a00::/23"),
  defineIpv6Prefix("2001:1c00::/22"),
  defineIpv6Prefix("2001:2000::/19"),
  defineIpv6Prefix("2001:4000::/23"),
  defineIpv6Prefix("2001:4200::/23"),
  defineIpv6Prefix("2001:4400::/23"),
  defineIpv6Prefix("2001:4600::/23"),
  defineIpv6Prefix("2001:4800::/23"),
  defineIpv6Prefix("2001:4a00::/23"),
  defineIpv6Prefix("2001:4c00::/23"),
  defineIpv6Prefix("2001:5000::/20"),
  defineIpv6Prefix("2001:8000::/19"),
  defineIpv6Prefix("2001:a000::/20"),
  defineIpv6Prefix("2001:b000::/20"),
  defineIpv6Prefix("2003::/18"),
  defineIpv6Prefix("2400::/12"),
  defineIpv6Prefix("2410::/12"),
  defineIpv6Prefix("2600::/12"),
  defineIpv6Prefix("2610::/23"),
  defineIpv6Prefix("2620::/23"),
  defineIpv6Prefix("2630::/12"),
  defineIpv6Prefix("2800::/12"),
  defineIpv6Prefix("2a00::/12"),
  defineIpv6Prefix("2a10::/12"),
  defineIpv6Prefix("2c00::/12"),
]);

// Documentation space sits inside the otherwise allocated 2001:c00::/23.
// Keep that registry exception explicit instead of widening the allowlist.
const IPV6_SPECIAL_PURPOSE_DENY_PREFIXES = Object.freeze([
  defineIpv6Prefix("2001:db8::/32"),
]);

export const CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_PROVIDER_HTTPS_TRANSPORT_M2B_VERSION =
  "provider-https-transport.communication-note.2026-09-03.m2b.v1" as const;
export const CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_PROVIDER_HTTPS_TRANSPORT_M2B_READY =
  false as const;

export type CaresLinkV1NoteGenerationGoogleCloudProviderHttpsRequestM2b =
  Readonly<{
    method: "GET" | "POST";
    url: string;
    headers: Readonly<Record<string, string>>;
    body: Uint8Array;
    redirect: "ERROR";
    automaticRetries: 0;
    timeoutMs: typeof REQUEST_TIMEOUT_MS;
    maximumResponseBytes: number;
    signal: AbortSignal;
  }>;

export type CaresLinkV1NoteGenerationGoogleCloudProviderHttpsResponseM2b =
  Readonly<{
    status: number;
    contentType: string;
    responseUrl: string;
    redirected: false;
    body: Uint8Array;
  }>;

export type CaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b =
  Readonly<{
    request(
      request: CaresLinkV1NoteGenerationGoogleCloudProviderHttpsRequestM2b,
    ): Promise<CaresLinkV1NoteGenerationGoogleCloudProviderHttpsResponseM2b>;
  }>;

export const CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_PROVIDER_HTTPS_TRANSPORT_M2B_SOURCE_POLICY =
  deepFreeze({
    version:
      CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_PROVIDER_HTTPS_TRANSPORT_M2B_VERSION,
    status: "SOURCE_TRANSPORT_NOT_COMPOSED",
    ready: false,
    sourceOnly: true,
    serverOnly: true,
    nodeHttpsOwned: true,
    globalFetchAllowed: false,
    credentialDiscoveryPerformedByTransport: false,
    applicationDefaultCredentialsAllowed: false,
    serviceAccountJsonAllowed: false,
    customAgentAllowed: false,
    proxyAllowed: false,
    redirectsAllowed: false,
    automaticRetries: 0,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    requestBodyMaximumBytes: REQUEST_BODY_MAXIMUM_BYTES,
    responseByteCapsRequired: true,
    tlsCertificateVerificationRequired: true,
    tlsServerNameVerificationRequired: true,
    dnsAllAddressesPreflightRequired: true,
    dnsResolutionPinnedToRequest: true,
    publicRemoteAddressRequired: true,
    ipv6IanaAllocatedGlobalUnicastOnly: true,
    formalTransportEnabled: false,
    liveNetworkEvidencePresent: false,
    deploymentApproved: false,
    activationApproved: false,
  } as const);

/** Default-off: importing this module installs no network transport. */
export const CARESLINK_V1_NOTE_GENERATION_FORMAL_GOOGLE_CLOUD_PROVIDER_HTTPS_TRANSPORT_M2B =
  undefined as
    | CaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b
    | undefined;

/**
 * Creates the explicit Node HTTPS transport used by the M2b provider-trust
 * source. Construction performs no I/O. Each request is independently bounded
 * and must match one of the closed provider endpoint/header profiles below.
 */
export function createCaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b(): CaresLinkV1NoteGenerationGoogleCloudProviderHttpsTransportM2b {
  return Object.freeze({ request: performRequest });
}

type EndpointProfile = Readonly<{
  responseMaximumBytes: number;
  requiredHeaders: Readonly<Record<string, string>>;
  authorizationRequired: boolean;
  userAgentAllowed: boolean;
  bodyRequired: boolean;
}>;

type ParsedRequest = Readonly<{
  method: "GET" | "POST";
  url: URL;
  urlText: string;
  headers: Readonly<Record<string, string>>;
  body: Uint8Array;
  maximumResponseBytes: number;
  signal: AbortSignal;
}>;

type PinnedPublicDnsResolution = Readonly<{
  lookup: LookupFunction;
  addressKeys: readonly string[];
}>;

async function performRequest(
  value: CaresLinkV1NoteGenerationGoogleCloudProviderHttpsRequestM2b,
): Promise<CaresLinkV1NoteGenerationGoogleCloudProviderHttpsResponseM2b> {
  let parsed: ParsedRequest | undefined;
  try {
    parsed = parseRequest(value);
    return await dispatch(parsed);
  } catch {
    throw unavailable();
  } finally {
    parsed?.body.fill(0);
  }
}

function parseRequest(value: unknown): ParsedRequest {
  const request = exactDataRecord(value, [
    "method",
    "url",
    "headers",
    "body",
    "redirect",
    "automaticRetries",
    "timeoutMs",
    "maximumResponseBytes",
    "signal",
  ]);
  if (
    (request.method !== "GET" && request.method !== "POST") ||
    typeof request.url !== "string" ||
    request.redirect !== "ERROR" ||
    request.automaticRetries !== 0 ||
    request.timeoutMs !== REQUEST_TIMEOUT_MS ||
    !Number.isInteger(request.maximumResponseBytes) ||
    (request.maximumResponseBytes as number) < 1 ||
    (request.maximumResponseBytes as number) > KMS_RESPONSE_MAXIMUM_BYTES ||
    nodeTypes.isProxy(request.signal) ||
    !(request.signal instanceof AbortSignal) ||
    request.signal.aborted
  ) {
    throw unavailable();
  }
  const url = new URL(request.url);
  if (
    url.protocol !== "https:" ||
    url.href !== request.url ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== "" ||
    url.port !== "" ||
    url.search !== ""
  ) {
    throw unavailable();
  }
  const profile = endpointProfile(request.method, url);
  if ((request.maximumResponseBytes as number) > profile.responseMaximumBytes) {
    throw unavailable();
  }
  const headers = parseHeaders(request.headers, profile);
  const body = requireBytes(request.body, REQUEST_BODY_MAXIMUM_BYTES, true);
  if (
    (profile.bodyRequired && body.byteLength === 0) ||
    (!profile.bodyRequired && body.byteLength !== 0)
  ) {
    body.fill(0);
    throw unavailable();
  }
  return Object.freeze({
    method: request.method,
    url,
    urlText: request.url,
    headers,
    body,
    maximumResponseBytes: request.maximumResponseBytes as number,
    signal: request.signal,
  });
}

function endpointProfile(method: unknown, url: URL): EndpointProfile {
  if (method === "POST" && url.href === VERCEL_TOKEN_EXCHANGE_URL) {
    return Object.freeze({
      responseMaximumBytes: TOKEN_RESPONSE_MAXIMUM_BYTES,
      requiredHeaders: Object.freeze({
        accept: "application/json",
        "content-type": "application/json",
      }),
      authorizationRequired: false,
      userAgentAllowed: true,
      bodyRequired: true,
    });
  }
  if (method === "POST" && url.href === STS_TOKEN_EXCHANGE_URL) {
    return Object.freeze({
      responseMaximumBytes: TOKEN_RESPONSE_MAXIMUM_BYTES,
      requiredHeaders: Object.freeze({
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      }),
      authorizationRequired: false,
      userAgentAllowed: false,
      bodyRequired: true,
    });
  }
  if (method === "POST" && url.href === IAM_CREDENTIALS_URL) {
    return bearerProfile("application/json", TOKEN_RESPONSE_MAXIMUM_BYTES, true);
  }
  if (
    method === "GET" &&
    url.origin === KMS_ORIGIN &&
    (KMS_CRYPTO_KEY_PATH.test(url.pathname) ||
      KMS_CRYPTO_KEY_VERSION_PATH.test(url.pathname))
  ) {
    return bearerProfile(undefined, KMS_RESPONSE_MAXIMUM_BYTES, false);
  }
  if (
    method === "POST" &&
    url.origin === KMS_ORIGIN &&
    KMS_RAW_ENCRYPT_PATH.test(url.pathname)
  ) {
    return bearerProfile("application/json", KMS_RESPONSE_MAXIMUM_BYTES, true);
  }
  throw unavailable();
}

function bearerProfile(
  contentType: string | undefined,
  responseMaximumBytes: number,
  bodyRequired: boolean,
): EndpointProfile {
  return Object.freeze({
    responseMaximumBytes,
    requiredHeaders: Object.freeze({
      accept: "application/json",
      ...(contentType === undefined ? {} : { "content-type": contentType }),
    }),
    authorizationRequired: true,
    userAgentAllowed: false,
    bodyRequired,
  });
}

function parseHeaders(value: unknown, profile: EndpointProfile) {
  const headers = exactStringRecord(value);
  const requiredKeys = Object.keys(profile.requiredHeaders);
  const allowedKeys = [
    ...requiredKeys,
    ...(profile.authorizationRequired ? ["authorization"] : []),
    ...(profile.userAgentAllowed ? ["user-agent"] : []),
  ];
  const actualKeys = Object.keys(headers);
  if (
    requiredKeys.some(
      (key) => headers[key] !== profile.requiredHeaders[key],
    ) ||
    actualKeys.some((key) => !allowedKeys.includes(key)) ||
    (profile.authorizationRequired !==
      Object.hasOwn(headers, "authorization")) ||
    (Object.hasOwn(headers, "authorization") &&
      (Buffer.byteLength(headers.authorization, "utf8") >
        AUTHORIZATION_MAXIMUM_BYTES ||
        !BEARER_PATTERN.test(headers.authorization))) ||
    (Object.hasOwn(headers, "user-agent") &&
      (!/^[A-Za-z0-9][A-Za-z0-9 ._\/-]{0,127}$/.test(headers["user-agent"]) ||
        /[\r\n\0]/.test(headers["user-agent"])))
  ) {
    throw unavailable();
  }
  return Object.freeze({ ...headers });
}

function dispatch(
  request: ParsedRequest,
): Promise<CaresLinkV1NoteGenerationGoogleCloudProviderHttpsResponseM2b> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let responseStarted = false;
    let dnsSettled = false;
    let requestCommitted = false;
    let clientRequest: ReturnType<typeof nodeHttpsRequest> | undefined;
    let requestBodyCopy: Buffer | undefined;
    let responseChunks: Buffer[] = [];
    let responseBody: Uint8Array | undefined;
    let responseMessage:
      | Parameters<NonNullable<Parameters<typeof nodeHttpsRequest>[2]>>[0]
      | undefined;

    const scrubResponseChunks = () => {
      for (const chunk of responseChunks) chunk.fill(0);
      responseChunks = [];
    };
    const cleanup = () => {
      clearTimeout(deadline);
      request.signal.removeEventListener("abort", onAbort);
      requestBodyCopy?.fill(0);
      requestBodyCopy = undefined;
      scrubResponseChunks();
    };
    const finish = (
      error: unknown,
      response?: CaresLinkV1NoteGenerationGoogleCloudProviderHttpsResponseM2b,
    ) => {
      if (settled) {
        response?.body.fill(0);
        return;
      }
      settled = true;
      cleanup();
      if (error !== undefined || response === undefined) {
        responseBody?.fill(0);
        reject(unavailable());
      } else {
        resolve(response);
      }
    };
    const fail = () => {
      try {
        if (responseMessage) discardLateResponse(responseMessage);
      } catch {
        // Continue to destroy the request and settle with the fixed failure.
      }
      try {
        clientRequest?.destroy();
      } catch {
        // Destruction is best effort after the boundary has failed closed.
      }
      finish(unavailable());
    };
    const onAbort = () => fail();
    const deadline = setTimeout(fail, REQUEST_TIMEOUT_MS);
    deadline.unref?.();
    request.signal.addEventListener("abort", onAbort, { once: true });

    const startHttps = (resolution: PinnedPublicDnsResolution) => {
      if (settled) return;
      try {
        requestBodyCopy = Buffer.from(request.body);
        clientRequest = nodeHttpsRequest(
          {
            protocol: "https:",
            hostname: request.url.hostname,
            port: 443,
            path: `${request.url.pathname}${request.url.search}`,
            method: request.method,
            headers: request.headers,
            signal: request.signal,
            timeout: REQUEST_TIMEOUT_MS,
            agent: false,
            rejectUnauthorized: true,
            servername: request.url.hostname,
            minVersion: "TLSv1.2",
            checkServerIdentity,
            lookup: resolution.lookup,
          },
          (response) => {
          if (settled || responseStarted || !requestCommitted) {
            discardLateResponse(response);
            fail();
            return;
          }
          responseStarted = true;
          responseMessage = response;
          if (
            !isAuthorizedPinnedTlsSocket(
              response.socket as TLSSocket,
              request.url.hostname,
              resolution.addressKeys,
            )
          ) {
            fail();
            return;
          }
          const status = response.statusCode;
          const contentType = response.headers["content-type"];
          const contentLength = response.headers["content-length"];
          const contentEncoding = response.headers["content-encoding"];
          if (
            status !== 200 ||
            typeof contentType !== "string" ||
            contentType.length > 256 ||
            !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType) ||
            contentEncoding !== undefined ||
            Array.isArray(contentLength) ||
            (contentLength !== undefined &&
              (!CONTENT_LENGTH_PATTERN.test(contentLength) ||
                Number(contentLength) > request.maximumResponseBytes))
          ) {
            fail();
            return;
          }
          let responseByteLength = 0;
          response.on("data", (value: Buffer | Uint8Array | string) => {
            let chunk: Buffer | undefined;
            try {
              if (
                typeof value === "string" ||
                nodeTypes.isProxy(value) ||
                !(value instanceof Uint8Array)
              ) {
                fail();
                return;
              }
              chunk = Buffer.from(value);
              scrubIncomingChunk(value);
              if (settled) {
                chunk.fill(0);
                return;
              }
              responseByteLength += chunk.byteLength;
              if (responseByteLength > request.maximumResponseBytes) {
                chunk.fill(0);
                fail();
                return;
              }
              responseChunks.push(chunk);
              chunk = undefined;
            } catch {
              chunk?.fill(0);
              fail();
            }
          });
          response.once("aborted", fail);
          response.once("error", fail);
          response.once("end", () => {
            if (settled) return;
            if (
              response.aborted ||
              response.complete !== true ||
              (contentLength !== undefined &&
                Number(contentLength) !== responseByteLength)
            ) {
              fail();
              return;
            }
            const combined = Buffer.concat(responseChunks, responseByteLength);
            try {
              responseBody = Uint8Array.from(combined);
            } finally {
              combined.fill(0);
              scrubResponseChunks();
            }
            const result = Object.freeze({
              status: status as number,
              contentType,
              responseUrl: request.urlText,
              redirected: false as const,
              body: responseBody,
            });
            responseBody = undefined;
            finish(undefined, result);
          });
          },
        );
        clientRequest.once("timeout", fail);
        clientRequest.once("error", fail);
        clientRequest.once("abort", fail);
        clientRequest.once("information", fail);
        clientRequest.once("upgrade", fail);
        clientRequest.once("connect", fail);
        clientRequest.once("socket", (socket) => {
          const tlsSocket = socket as TLSSocket;
          tlsSocket.once("secureConnect", () => {
            if (settled || requestCommitted) return;
            if (
              !isAuthorizedPinnedTlsSocket(
                tlsSocket,
                request.url.hostname,
                resolution.addressKeys,
              )
            ) {
              fail();
              return;
            }
            try {
              requestCommitted = true;
              clientRequest?.end(requestBodyCopy);
            } catch {
              fail();
            }
          });
        });
        if (request.signal.aborted) {
          fail();
          return;
        }
      } catch {
        fail();
      }
    };

    try {
      if (request.signal.aborted) {
        fail();
        return;
      }
      nodeDnsLookup(
        request.url.hostname,
        { all: true, verbatim: true },
        (error, addresses) => {
          if (settled || dnsSettled) return;
          dnsSettled = true;
          if (error !== null) {
            fail();
            return;
          }
          try {
            startHttps(createPinnedPublicLookup(request.url.hostname, addresses));
          } catch {
            fail();
          }
        },
      );
    } catch {
      fail();
    }
  });
}

function createPinnedPublicLookup(
  expectedHostname: string,
  value: readonly LookupAddress[],
): PinnedPublicDnsResolution {
  if (!Array.isArray(value) || value.length === 0 || value.length > 64) {
    throw unavailable();
  }
  const addresses = value.map((candidate) => {
    if (
      candidate === null ||
      typeof candidate !== "object" ||
      typeof candidate.address !== "string" ||
      (candidate.family !== 4 && candidate.family !== 6) ||
      isIP(candidate.address) !== candidate.family ||
      !isPublicNetworkAddress(candidate.address)
    ) {
      throw unavailable();
    }
    return Object.freeze({
      address: candidate.address,
      family: candidate.family,
    });
  });
  const lookup: LookupFunction = (hostname, options, callback) => {
    try {
      if (hostname !== expectedHostname) throw unavailable();
      const family = normalizeLookupFamily(options);
      const eligible = addresses.filter(
        (candidate) => family === 0 || candidate.family === family,
      );
      if (eligible.length === 0) throw unavailable();
      if (options.all === true) {
        callback(
          null,
          eligible.map((candidate) => ({ ...candidate })),
        );
      } else {
        callback(null, eligible[0].address, eligible[0].family);
      }
    } catch {
      const error = new Error("Pinned provider DNS lookup unavailable") as NodeJS.ErrnoException;
      error.code = "ENOTFOUND";
      callback(error, "", 0);
    }
  };
  return Object.freeze({
    lookup,
    addressKeys: Object.freeze(
      addresses.map((candidate) => requireCanonicalNetworkAddress(candidate.address)),
    ),
  });
}

function normalizeLookupFamily(options: LookupOptions): 0 | 4 | 6 {
  if (
    options.family === undefined ||
    options.family === 0
  ) {
    return 0;
  }
  if (options.family === 4 || options.family === "IPv4") return 4;
  if (options.family === 6 || options.family === "IPv6") return 6;
  throw unavailable();
}

function isAuthorizedPinnedTlsSocket(
  socket: TLSSocket,
  expectedHostname: string,
  pinnedAddressKeys: readonly string[],
) {
  const remoteAddressKey =
    typeof socket.remoteAddress === "string"
      ? canonicalNetworkAddress(socket.remoteAddress)
      : undefined;
  return (
    socket.encrypted === true &&
    socket.authorized === true &&
    (socket.authorizationError === null ||
      socket.authorizationError === undefined) &&
    socket.servername === expectedHostname &&
    remoteAddressKey !== undefined &&
    isPublicNetworkAddress(socket.remoteAddress as string) &&
    pinnedAddressKeys.includes(remoteAddressKey)
  );
}

function requireCanonicalNetworkAddress(value: string): string {
  const result = canonicalNetworkAddress(value);
  if (result === undefined) throw unavailable();
  return result;
}

function canonicalNetworkAddress(value: string): string | undefined {
  const family = isIP(value);
  if (family === 4) {
    return `4:${value.split(".").map(Number).join(".")}`;
  }
  if (family === 6) {
    try {
      const hostname = new URL(`https://[${value}]/`).hostname;
      return `6:${hostname.slice(1, -1).toLowerCase()}`;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function isPublicNetworkAddress(value: string): boolean {
  const canonical = canonicalNetworkAddress(value);
  if (canonical === undefined) return false;
  if (canonical.startsWith("4:")) {
    const octets = canonical.slice(2).split(".").map(Number);
    const [a, b] = octets;
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0) ||
      a >= 224
    );
  }
  if (canonical.startsWith("6:")) {
    const normalized = canonical.slice(2);
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
    if (mapped !== null) return isPublicNetworkAddress(mapped[1]);
    const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(
      normalized,
    );
    if (mappedHex !== null) {
      const high = Number.parseInt(mappedHex[1], 16);
      const low = Number.parseInt(mappedHex[2], 16);
      return isPublicNetworkAddress(
        `${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`,
      );
    }
    const address = parseCanonicalIpv6(normalized);
    return (
      address !== undefined &&
      !IPV6_SPECIAL_PURPOSE_DENY_PREFIXES.some((prefix) =>
        isIpv6PrefixMatch(address, prefix),
      ) &&
      IANA_ALLOCATED_IPV6_GLOBAL_UNICAST_PREFIXES.some((prefix) =>
        isIpv6PrefixMatch(address, prefix),
      )
    );
  }
  return false;
}

function defineIpv6Prefix(value: string): Ipv6Prefix {
  const match = /^([^/]+)\/([1-9][0-9]{0,2})$/.exec(value);
  if (match === null) throw new Error("Invalid static IPv6 prefix");
  const canonical = canonicalNetworkAddress(match[1]);
  const prefixLength = Number(match[2]);
  const network =
    canonical?.startsWith("6:") === true
      ? parseCanonicalIpv6(canonical.slice(2))
      : undefined;
  if (network === undefined || prefixLength > 128) {
    throw new Error("Invalid static IPv6 prefix");
  }
  const hostBitCount = BigInt(128) - BigInt(prefixLength);
  if ((network >> hostBitCount) << hostBitCount !== network) {
    throw new Error("Non-canonical static IPv6 prefix");
  }
  return Object.freeze({ network, prefixLength });
}

function parseCanonicalIpv6(value: string): bigint | undefined {
  const halves = value.split("::");
  if (halves.length > 2) return undefined;
  const left = halves[0] === "" ? [] : halves[0].split(":");
  const right =
    halves.length === 1 || halves[1] === "" ? [] : halves[1].split(":");
  const omittedHextets = 8 - left.length - right.length;
  if (
    (halves.length === 1 && omittedHextets !== 0) ||
    (halves.length === 2 && omittedHextets < 1)
  ) {
    return undefined;
  }
  const hextets = [
    ...left,
    ...Array.from({ length: omittedHextets }, () => "0"),
    ...right,
  ];
  if (
    hextets.length !== 8 ||
    hextets.some((hextet) => !/^[0-9a-f]{1,4}$/.test(hextet))
  ) {
    return undefined;
  }
  return hextets.reduce(
    (address, hextet) =>
      (address << BigInt(16)) | BigInt(Number.parseInt(hextet, 16)),
    BigInt(0),
  );
}

function isIpv6PrefixMatch(address: bigint, prefix: Ipv6Prefix): boolean {
  const hostBitCount = BigInt(128) - BigInt(prefix.prefixLength);
  return address >> hostBitCount === prefix.network >> hostBitCount;
}

function discardLateResponse(
  response: Parameters<NonNullable<Parameters<typeof nodeHttpsRequest>[2]>>[0],
) {
  try {
    response.on("data", scrubIncomingChunk);
    response.destroy();
  } catch {
    // A late response has no caller; cleanup cannot widen the public failure.
  }
}

function scrubIncomingChunk(value: unknown) {
  try {
    if (Buffer.isBuffer(value)) value.fill(0);
    else if (value instanceof Uint8Array && !nodeTypes.isProxy(value)) {
      Uint8Array.prototype.fill.call(value, 0);
    }
  } catch {
    // Provider-owned chunks are best-effort cleanup after copying or failure.
  }
}

function requireBytes(value: unknown, maximumBytes: number, allowEmpty: boolean) {
  if (
    nodeTypes.isProxy(value) ||
    !(value instanceof Uint8Array) ||
    (!allowEmpty && value.byteLength === 0) ||
    value.byteLength > maximumBytes
  ) {
    throw unavailable();
  }
  return Uint8Array.from(value);
}

function exactStringRecord(value: unknown): Record<string, string> {
  const object = requirePlainDataRecord(value);
  for (const [key, child] of Object.entries(object)) {
    if (
      key !== key.toLowerCase() ||
      !/^[a-z0-9-]+$/.test(key) ||
      typeof child !== "string" ||
      child.length === 0 ||
      /[\r\n\0]/.test(child)
    ) {
      throw unavailable();
    }
  }
  return object as Record<string, string>;
}

function exactDataRecord(value: unknown, keys: readonly string[]) {
  const object = requirePlainDataRecord(value);
  const actualKeys = Object.getOwnPropertyNames(object);
  if (
    actualKeys.length !== keys.length ||
    keys.some((key) => !actualKeys.includes(key))
  ) {
    throw unavailable();
  }
  return object;
}

function requirePlainDataRecord(value: unknown): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw unavailable();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Object.values(descriptors).some(
      (descriptor) => !descriptor.enumerable || !("value" in descriptor),
    )
  ) {
    throw unavailable();
  }
  return value as Record<string, unknown>;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const FIXED_FAILURE = Object.freeze({
  code: "GENERATION_FAILED" as const,
  message: "Google Cloud provider HTTPS transport is unavailable" as const,
});

function unavailable() {
  return FIXED_FAILURE;
}
