import "server-only";

import { createHash } from "node:crypto";
import {
  lookup as nodeDnsLookup,
  type LookupAddress,
  type LookupOptions,
} from "node:dns";
import { request as nodeHttpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { createRequire } from "node:module";
import { checkServerIdentity } from "node:tls";
import type { TLSSocket } from "node:tls";
import { types as nodeTypes } from "node:util";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";

const crc32c = createRequire(import.meta.url)("fast-crc32c") as Readonly<{
  calculate(data: Uint8Array): number;
}>;

const GCS_ORIGIN = "https://storage.googleapis.com" as const;
const REQUEST_TIMEOUT_MS = 5_000 as const;
const METADATA_RESPONSE_MAXIMUM_BYTES = 32 * 1_024;
const PRIVATE_OBJECT_MAXIMUM_BYTES = 256 * 1_024;
const TOMBSTONE_MAXIMUM_BYTES = 4 * 1_024;
const MULTIPART_OVERHEAD_MAXIMUM_BYTES = 8 * 1_024;
const MULTIPART_REQUEST_MAXIMUM_BYTES =
  PRIVATE_OBJECT_MAXIMUM_BYTES + MULTIPART_OVERHEAD_MAXIMUM_BYTES;
const AUTHORIZATION_MAXIMUM_BYTES = 16 * 1_024;
const MULTIPART_BOUNDARY =
  "===============careslink_m2a_gcs_private_object==" as const;
const MULTIPART_CONTENT_TYPE =
  `multipart/related; boundary="${MULTIPART_BOUNDARY}"` as const;
const OBJECT_FIELDS =
  "bucket,name,generation,metageneration,size,crc32c,contentType,cacheControl,metadata,temporaryHold,eventBasedHold" as const;
const ENCODED_OBJECT_FIELDS = encodeURIComponent(OBJECT_FIELDS);
const BACKUP_DISPOSITION_VERSION =
  "no-soft-delete.2026-09-03.v1" as const;
const LOCATOR_BINDING_PURPOSE =
  "CARESLINK_V1_COMMUNICATION_NOTE_GCS_PRIVATE_OBJECT_LOCATOR" as const;

const BUCKET_PATTERN =
  /^(?=.{3,63}$)[a-z0-9](?:[a-z0-9._-]*[a-z0-9])$/;
const OBJECT_PREFIX_PATTERN =
  /^[a-z0-9](?:[a-z0-9._-]{0,62})(?:\/[a-z0-9](?:[a-z0-9._-]{0,62}))*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CONTENT_LENGTH_PATTERN = /^(0|[1-9][0-9]{0,15})$/;
const CRC32C_BASE64_PATTERN = /^[A-Za-z0-9+/]{6}==$/;
const BEARER_PATTERN =
  /^Bearer [A-Za-z0-9][A-Za-z0-9._~+/\-]{15,16383}={0,2}$/;
const GOOGLE_PUBLIC_IP_RANGES_SOURCE =
  "https://www.gstatic.com/ipranges/goog.json" as const;
const GOOGLE_PUBLIC_IP_RANGES_SYNC_TOKEN = "1788465834692" as const;
const GOOGLE_PUBLIC_IP_RANGES_CREATION_TIME =
  "2026-09-03T13:03:54.692807" as const;
const GOOGLE_PUBLIC_IPV6_PREFIXES = Object.freeze([
  Object.freeze([[0x2001, 0x4860], 32] as const),
  Object.freeze([[0x2404, 0x6800], 32] as const),
  Object.freeze([[0x2404, 0xf340], 32] as const),
  Object.freeze([[0x2600, 0x1900], 28] as const),
  Object.freeze([[0x2605, 0xef80], 32] as const),
  Object.freeze([[0x2606, 0x0040], 32] as const),
  Object.freeze([[0x2606, 0x73c0], 32] as const),
  Object.freeze([[0x2607, 0x01c0, 0x0241, 0x0040], 60] as const),
  Object.freeze([[0x2607, 0x01c0, 0x0300], 40] as const),
  Object.freeze([[0x2607, 0xf8b0], 32] as const),
  Object.freeze([[0x2620, 0x011a, 0xa000], 40] as const),
  Object.freeze([[0x2620, 0x0120, 0xe000], 40] as const),
  Object.freeze([[0x2800, 0x03f0], 32] as const),
  Object.freeze([[0x2a00, 0x1450], 32] as const),
  Object.freeze([[0x2c0f, 0xfb50], 32] as const),
] as const);

export const CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_GCS_HTTPS_TRANSPORT_M2D_VERSION =
  "google-cloud-gcs-https-transport.communication-note.2026-09-04.m2d.v1" as const;
export const CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_GCS_HTTPS_TRANSPORT_M2D_READY =
  false as const;

export type CaresLinkV1NoteGenerationGoogleCloudGcsHttpsTransportOptionsM2d =
  Readonly<{
    bucket: string;
    objectPrefix: string;
  }>;

export type CaresLinkV1NoteGenerationGoogleCloudGcsHttpsRequestM2d =
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

export type CaresLinkV1NoteGenerationGoogleCloudGcsHttpsResponseM2d =
  Readonly<{
    status: number;
    contentType: string;
    responseUrl: string;
    redirected: false;
    body: Uint8Array;
  }>;

export type CaresLinkV1NoteGenerationGoogleCloudGcsHttpsTransportM2d =
  Readonly<{
    request(
      request: CaresLinkV1NoteGenerationGoogleCloudGcsHttpsRequestM2d,
    ): Promise<CaresLinkV1NoteGenerationGoogleCloudGcsHttpsResponseM2d>;
  }>;

export const CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_GCS_HTTPS_TRANSPORT_M2D_SOURCE_POLICY =
  deepFreeze({
    version:
      CARESLINK_V1_NOTE_GENERATION_GOOGLE_CLOUD_GCS_HTTPS_TRANSPORT_M2D_VERSION,
    status: "SOURCE_GCS_HTTPS_TRANSPORT_NOT_COMPOSED",
    ready: false,
    sourceOnly: true,
    serverOnly: true,
    nodeHttpsOwned: true,
    globalFetchAllowed: false,
    ambientCredentialDiscoveryAllowed: false,
    customAgentAllowed: false,
    proxyAllowed: false,
    redirectsAllowed: false,
    automaticRetries: 0,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    exactBucketPerInstance: true,
    exactObjectPrefixPerInstance: true,
    exactStorageOrigin: GCS_ORIGIN,
    exactRequestProfiles: Object.freeze([
      "OBJECT_METADATA_GET",
      "PINNED_OBJECT_MEDIA_GET",
      "CONDITIONAL_MULTIPART_POST",
    ] as const),
    requestAuthorizationHeaderRequired: true,
    acceptEncodingIdentityRequired: true,
    responseCompressionAllowed: false,
    responseByteCapsRequired: true,
    tlsCertificateVerificationRequired: true,
    tlsServerNameVerificationRequired: true,
    tlsBeforeRequestCommitRequired: true,
    dnsAllAddressesPreflightRequired: true,
    dnsResolutionPinnedToRequest: true,
    publicRemoteAddressRequired: true,
    googlePublishedIpv6PrefixesPinned: true,
    googlePublicIpRangesSource: GOOGLE_PUBLIC_IP_RANGES_SOURCE,
    googlePublicIpRangesSyncToken: GOOGLE_PUBLIC_IP_RANGES_SYNC_TOKEN,
    googlePublicIpRangesCreationTime: GOOGLE_PUBLIC_IP_RANGES_CREATION_TIME,
    requestAndResponseMutableBytesScrubbed: true,
    formalTransportEnabled: false,
    liveNetworkEvidencePresent: false,
    deploymentApproved: false,
    activationApproved: false,
  } as const);

/** Default-off: importing this module installs no network transport. */
export const CARESLINK_V1_NOTE_GENERATION_FORMAL_GOOGLE_CLOUD_GCS_HTTPS_TRANSPORT_M2D =
  undefined as
    | CaresLinkV1NoteGenerationGoogleCloudGcsHttpsTransportM2d
    | undefined;

/**
 * Creates a source-only Node HTTPS transport for one exact GCS bucket and
 * Communication Note object namespace. Construction performs no I/O. The
 * private authority owns this port and injects the bearer header before use.
 */
export function createCaresLinkV1NoteGenerationGoogleCloudGcsHttpsTransportM2d(
  value: unknown,
): CaresLinkV1NoteGenerationGoogleCloudGcsHttpsTransportM2d {
  const options = parseOptions(value);
  return Object.freeze({
    request(
      request: CaresLinkV1NoteGenerationGoogleCloudGcsHttpsRequestM2d,
    ) {
      return performRequest(options, request);
    },
  });
}

type ParsedOptions = Readonly<{
  bucket: string;
  encodedBucket: string;
  objectPrefix: string;
}>;

type EndpointProfile = Readonly<{
  kind:
    | "OBJECT_METADATA_GET"
    | "PINNED_OBJECT_MEDIA_GET"
    | "CONDITIONAL_MULTIPART_POST";
  allowedStatuses: readonly number[];
  allowedMaximumResponseBytes: readonly number[];
  objectName?: string;
}>;

type ParsedRequest = Readonly<{
  method: "GET" | "POST";
  url: URL;
  urlText: string;
  headers: Readonly<Record<string, string>>;
  body: Uint8Array;
  maximumResponseBytes: number;
  signal: AbortSignal;
  profile: EndpointProfile;
}>;

type PinnedPublicDnsResolution = Readonly<{
  lookup: LookupFunction;
  addressKeys: readonly string[];
}>;

function parseOptions(value: unknown): ParsedOptions {
  const options = exactDataRecord(value, ["bucket", "objectPrefix"]);
  if (
    !Object.isFrozen(options) ||
    typeof options.bucket !== "string" ||
    !BUCKET_PATTERN.test(options.bucket) ||
    typeof options.objectPrefix !== "string" ||
    options.objectPrefix.length > 255 ||
    !OBJECT_PREFIX_PATTERN.test(options.objectPrefix)
  ) {
    throw unavailable();
  }
  return Object.freeze({
    bucket: options.bucket,
    encodedBucket: encodeURIComponent(options.bucket),
    objectPrefix: options.objectPrefix,
  });
}

async function performRequest(
  options: ParsedOptions,
  value: CaresLinkV1NoteGenerationGoogleCloudGcsHttpsRequestM2d,
): Promise<CaresLinkV1NoteGenerationGoogleCloudGcsHttpsResponseM2d> {
  let parsed: ParsedRequest | undefined;
  try {
    parsed = parseRequest(options, value);
    return await dispatch(parsed);
  } catch {
    throw unavailable();
  } finally {
    parsed?.body.fill(0);
  }
}

function parseRequest(options: ParsedOptions, value: unknown): ParsedRequest {
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
    nodeTypes.isProxy(request.signal) ||
    !(request.signal instanceof AbortSignal) ||
    request.signal.aborted
  ) {
    throw unavailable();
  }
  const url = new URL(request.url);
  if (
    url.protocol !== "https:" ||
    url.origin !== GCS_ORIGIN ||
    url.hostname !== "storage.googleapis.com" ||
    url.href !== request.url ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== "" ||
    url.port !== ""
  ) {
    throw unavailable();
  }
  const profile = endpointProfile(options, request.method, url);
  if (
    !profile.allowedMaximumResponseBytes.includes(
      request.maximumResponseBytes as number,
    )
  ) {
    throw unavailable();
  }
  let body: Uint8Array | undefined;
  try {
    body = requireBytes(
      request.body,
      request.method === "POST" ? MULTIPART_REQUEST_MAXIMUM_BYTES : 0,
      request.method === "GET",
    );
    if (
      (request.method === "GET" && body.byteLength !== 0) ||
      (request.method === "POST" && body.byteLength === 0)
    ) {
      throw unavailable();
    }
    const headers = parseHeaders(request.headers, request.method, body);
    if (profile.kind === "CONDITIONAL_MULTIPART_POST") {
      validateMultipartBody(options, body);
    }
    return Object.freeze({
      method: request.method,
      url,
      urlText: request.url,
      headers,
      body,
      maximumResponseBytes: request.maximumResponseBytes as number,
      signal: request.signal,
      profile,
    });
  } catch {
    body?.fill(0);
    throw unavailable();
  }
}

function endpointProfile(
  options: ParsedOptions,
  method: "GET" | "POST",
  url: URL,
): EndpointProfile {
  const metadataPrefix =
    `/storage/v1/b/${options.encodedBucket}/o/`;
  if (method === "GET" && url.pathname.startsWith(metadataPrefix)) {
    const objectName = parseEncodedObjectName(
      options,
      url.pathname.slice(metadataPrefix.length),
    );
    if (
      url.search !==
      `?projection=noAcl&fields=${ENCODED_OBJECT_FIELDS}`
    ) {
      throw unavailable();
    }
    return Object.freeze({
      kind: "OBJECT_METADATA_GET" as const,
      allowedStatuses: Object.freeze([200, 404] as const),
      allowedMaximumResponseBytes: Object.freeze([
        METADATA_RESPONSE_MAXIMUM_BYTES,
      ] as const),
      objectName,
    });
  }

  const mediaPrefix =
    `/download/storage/v1/b/${options.encodedBucket}/o/`;
  if (method === "GET" && url.pathname.startsWith(mediaPrefix)) {
    const objectName = parseEncodedObjectName(
      options,
      url.pathname.slice(mediaPrefix.length),
    );
    const match =
      /^\?alt=media&generation=([1-9][0-9]{0,19})&ifGenerationMatch=([1-9][0-9]{0,19})&ifMetagenerationMatch=([1-9][0-9]{0,19})$/.exec(
        url.search,
      );
    if (match === null || match[1] !== match[2]) throw unavailable();
    return Object.freeze({
      kind: "PINNED_OBJECT_MEDIA_GET" as const,
      allowedStatuses: Object.freeze([200, 404, 412] as const),
      allowedMaximumResponseBytes: Object.freeze([
        TOMBSTONE_MAXIMUM_BYTES,
        PRIVATE_OBJECT_MAXIMUM_BYTES,
      ] as const),
      objectName,
    });
  }

  const uploadPath =
    `/upload/storage/v1/b/${options.encodedBucket}/o`;
  if (method === "POST" && url.pathname === uploadPath) {
    const createSearch =
      `?uploadType=multipart&ifGenerationMatch=0&fields=${ENCODED_OBJECT_FIELDS}`;
    const casMatch = new RegExp(
      `^\\?uploadType=multipart&ifGenerationMatch=([1-9][0-9]{0,19})&ifMetagenerationMatch=([1-9][0-9]{0,19})&fields=${escapeRegExp(ENCODED_OBJECT_FIELDS)}$`,
    ).exec(url.search);
    if (url.search !== createSearch && casMatch === null) throw unavailable();
    return Object.freeze({
      kind: "CONDITIONAL_MULTIPART_POST" as const,
      allowedStatuses: Object.freeze([200, 412] as const),
      allowedMaximumResponseBytes: Object.freeze([
        METADATA_RESPONSE_MAXIMUM_BYTES,
      ] as const),
    });
  }

  throw unavailable();
}

function parseEncodedObjectName(
  options: ParsedOptions,
  encodedValue: string,
) {
  let objectName: string;
  try {
    objectName = decodeURIComponent(encodedValue);
  } catch {
    throw unavailable();
  }
  if (
    encodeURIComponent(objectName) !== encodedValue ||
    !isAllowedObjectName(options, objectName)
  ) {
    throw unavailable();
  }
  return objectName;
}

function isAllowedObjectName(options: ParsedOptions, objectName: string) {
  const pattern = new RegExp(
    `^${escapeRegExp(options.objectPrefix)}\\/payloads\\/[a-f0-9]{64}\\/[a-f0-9]{64}\\.json$`,
  );
  return objectName.length <= 512 && pattern.test(objectName);
}

function parseHeaders(
  value: unknown,
  method: "GET" | "POST",
  body: Uint8Array,
) {
  const headers = exactStringRecord(value);
  const expectedKeys =
    method === "GET"
      ? ["accept", "accept-encoding", "authorization"]
      : [
          "accept",
          "accept-encoding",
          "authorization",
          "content-length",
          "content-type",
        ];
  const actualKeys = Object.keys(headers);
  if (
    actualKeys.length !== expectedKeys.length ||
    expectedKeys.some((key) => !actualKeys.includes(key)) ||
    headers.accept !== "application/json" ||
    headers["accept-encoding"] !== "identity" ||
    Buffer.byteLength(headers.authorization ?? "", "utf8") >
      AUTHORIZATION_MAXIMUM_BYTES ||
    !BEARER_PATTERN.test(headers.authorization ?? "") ||
    (method === "POST" &&
      (headers["content-type"] !== MULTIPART_CONTENT_TYPE ||
        !CONTENT_LENGTH_PATTERN.test(headers["content-length"] ?? "") ||
        headers["content-length"] !== String(body.byteLength)))
  ) {
    throw unavailable();
  }
  return Object.freeze({ ...headers });
}

function validateMultipartBody(options: ParsedOptions, body: Uint8Array) {
  const firstBoundary = encodeUtf8(
    `--${MULTIPART_BOUNDARY}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
  );
  const objectBoundary = encodeUtf8(
    `\r\n--${MULTIPART_BOUNDARY}\r\nContent-Type: application/json\r\n\r\n`,
  );
  const closingBoundary = encodeUtf8(
    `\r\n--${MULTIPART_BOUNDARY}--\r\n`,
  );
  const bytes = Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  if (!bytes.subarray(0, firstBoundary.byteLength).equals(firstBoundary)) {
    throw unavailable();
  }
  const objectBoundaryOffset = bytes.indexOf(
    objectBoundary,
    firstBoundary.byteLength,
  );
  const closingBoundaryOffset = body.byteLength - closingBoundary.byteLength;
  if (
    objectBoundaryOffset <= firstBoundary.byteLength ||
    closingBoundaryOffset <= objectBoundaryOffset + objectBoundary.byteLength ||
    !bytes.subarray(closingBoundaryOffset).equals(closingBoundary) ||
    bytes.indexOf(objectBoundary, objectBoundaryOffset + 1) !== -1
  ) {
    throw unavailable();
  }
  const objectBodyStart = objectBoundaryOffset + objectBoundary.byteLength;
  const objectBody = bytes.subarray(objectBodyStart, closingBoundaryOffset);
  const overhead = body.byteLength - objectBody.byteLength;
  if (
    objectBody.byteLength < 1 ||
    objectBody.byteLength > PRIVATE_OBJECT_MAXIMUM_BYTES ||
    overhead > MULTIPART_OVERHEAD_MAXIMUM_BYTES
  ) {
    throw unavailable();
  }
  const metadataBytes = bytes.subarray(
    firstBoundary.byteLength,
    objectBoundaryOffset,
  );
  let metadataText: string;
  let metadata: Record<string, unknown>;
  try {
    metadataText = new TextDecoder("utf-8", { fatal: true }).decode(
      metadataBytes,
    );
    metadata = exactDataRecord(JSON.parse(metadataText) as unknown, [
      "cacheControl",
      "contentType",
      "crc32c",
      "metadata",
      "name",
    ]);
  } catch {
    throw unavailable();
  }
  const customMetadata = exactDataRecord(metadata.metadata, [
    "careslinkBackupDispositionVersion",
    "careslinkBodySha256",
    "careslinkDeleteBindingHash",
    "careslinkLocatorHash",
    "careslinkObjectKind",
  ]);
  if (
    stringifyCaresLinkV1CanonicalJson(metadata) !== metadataText ||
    metadata.cacheControl !== "no-store" ||
    metadata.contentType !== "application/json" ||
    typeof metadata.name !== "string" ||
    !isAllowedObjectName(options, metadata.name) ||
    typeof metadata.crc32c !== "string" ||
    !CRC32C_BASE64_PATTERN.test(metadata.crc32c) ||
    metadata.crc32c !== crc32cBase64(objectBody) ||
    customMetadata.careslinkBackupDispositionVersion !==
      BACKUP_DISPOSITION_VERSION ||
    customMetadata.careslinkObjectKind !== "SEALED_PAYLOAD" &&
      customMetadata.careslinkObjectKind !== "DELETED_TOMBSTONE" ||
    typeof customMetadata.careslinkBodySha256 !== "string" ||
    !SHA256_PATTERN.test(customMetadata.careslinkBodySha256) ||
    customMetadata.careslinkBodySha256 !== sha256(objectBody) ||
    typeof customMetadata.careslinkDeleteBindingHash !== "string" ||
    !SHA256_PATTERN.test(customMetadata.careslinkDeleteBindingHash) ||
    typeof customMetadata.careslinkLocatorHash !== "string" ||
    !SHA256_PATTERN.test(customMetadata.careslinkLocatorHash) ||
    customMetadata.careslinkLocatorHash !==
      createLocatorHash(options.bucket, metadata.name)
  ) {
    throw unavailable();
  }
}

function createLocatorHash(bucket: string, objectName: string) {
  return sha256(
    encodeUtf8(
      stringifyCaresLinkV1CanonicalJson({
        purpose: LOCATOR_BINDING_PURPOSE,
        origin: GCS_ORIGIN,
        bucket,
        objectName,
      }),
    ),
  );
}

function dispatch(
  request: ParsedRequest,
): Promise<CaresLinkV1NoteGenerationGoogleCloudGcsHttpsResponseM2d> {
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
      response?: CaresLinkV1NoteGenerationGoogleCloudGcsHttpsResponseM2d,
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
              typeof status !== "number" ||
              !request.profile.allowedStatuses.includes(status) ||
              typeof contentType !== "string" ||
              contentType.length > 256 ||
              !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
                contentType,
              ) ||
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
              const combined = Buffer.concat(
                responseChunks,
                responseByteLength,
              );
              try {
                responseBody = Uint8Array.from(combined);
              } finally {
                combined.fill(0);
                scrubResponseChunks();
              }
              const result = Object.freeze({
                status,
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
        if (request.signal.aborted) fail();
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
            startHttps(
              createPinnedPublicLookup(request.url.hostname, addresses),
            );
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
  const addressKeys = addresses.map((candidate) =>
    requireCanonicalNetworkAddress(candidate.address),
  );
  if (new Set(addressKeys).size !== addressKeys.length) throw unavailable();
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
      const error = new Error(
        "Pinned GCS DNS lookup unavailable",
      ) as NodeJS.ErrnoException;
      error.code = "ENOTFOUND";
      callback(error, "", 0);
    }
  };
  return Object.freeze({
    lookup,
    addressKeys: Object.freeze(addressKeys),
  });
}

function normalizeLookupFamily(options: LookupOptions): 0 | 4 | 6 {
  if (options.family === undefined || options.family === 0) return 0;
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
      (a === 192 && b === 88 && octets[2] === 99) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0) ||
      a >= 224
    );
  }
  if (canonical.startsWith("6:")) {
    const normalized = canonical.slice(2);
    const words = parseCanonicalIpv6Words(normalized);
    if (words === undefined) return false;
    const mapped =
      words[0] === 0 &&
      words[1] === 0 &&
      words[2] === 0 &&
      words[3] === 0 &&
      words[4] === 0 &&
      words[5] === 0xffff;
    if (mapped) {
      return isPublicNetworkAddress(
        `${words[6] >>> 8}.${words[6] & 0xff}.${words[7] >>> 8}.${words[7] & 0xff}`,
      );
    }
    return GOOGLE_PUBLIC_IPV6_PREFIXES.some(([prefixWords, prefixLength]) =>
      hasIpv6Prefix(words, prefixWords, prefixLength),
    );
  }
  return false;
}

function parseCanonicalIpv6Words(value: string): readonly number[] | undefined {
  const halves = value.split("::");
  if (halves.length > 2) return undefined;
  const parseHalf = (half: string) => {
    if (half === "") return [];
    const segments = half.split(":");
    if (segments.some((segment) => !/^[0-9a-f]{1,4}$/.test(segment))) {
      return undefined;
    }
    return segments.map((segment) => Number.parseInt(segment, 16));
  };
  const head = parseHalf(halves[0]);
  const tail = parseHalf(halves[1] ?? "");
  if (head === undefined || tail === undefined) return undefined;
  if (halves.length === 1) return head.length === 8 ? head : undefined;
  const zeroCount = 8 - head.length - tail.length;
  if (zeroCount < 1) return undefined;
  return [...head, ...Array<number>(zeroCount).fill(0), ...tail];
}

function hasIpv6Prefix(
  words: readonly number[],
  prefixWords: readonly number[],
  prefixLength: number,
) {
  if (words.length !== 8 || prefixLength < 0 || prefixLength > 128) {
    return false;
  }
  const completeWords = Math.floor(prefixLength / 16);
  for (let index = 0; index < completeWords; index += 1) {
    if (words[index] !== (prefixWords[index] ?? 0)) return false;
  }
  const remainingBits = prefixLength % 16;
  if (remainingBits === 0) return true;
  const mask = (0xffff << (16 - remainingBits)) & 0xffff;
  return (
    (words[completeWords] & mask) ===
    ((prefixWords[completeWords] ?? 0) & mask)
  );
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

function requireBytes(value: unknown, maximum: number, allowEmpty: boolean) {
  if (
    nodeTypes.isProxy(value) ||
    !(value instanceof Uint8Array) ||
    (!allowEmpty && value.byteLength === 0) ||
    value.byteLength > maximum
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

function encodeUtf8(value: string) {
  return new TextEncoder().encode(value);
}

function sha256(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function crc32cBase64(value: Uint8Array) {
  const output = Buffer.allocUnsafe(4);
  try {
    output.writeUInt32BE(crc32c.calculate(value) >>> 0);
    return output.toString("base64");
  } finally {
    output.fill(0);
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  message: "Google Cloud GCS HTTPS transport is unavailable" as const,
});

function unavailable() {
  return FIXED_FAILURE;
}
