import "server-only";

import { createHash } from "node:crypto";
import { types as nodeTypes } from "node:util";

const MANAGEMENT_API_ORIGIN = "https://api.supabase.com" as const;
const TOKEN_URL = `${MANAGEMENT_API_ORIGIN}/v1/oauth/token` as const;
const BRANCHES_URL =
  `${MANAGEMENT_API_ORIGIN}/v1/projects/adocsnwnslxhxcjgbyee/branches` as const;
const PRODUCTION_PROJECT_REF = "adocsnwnslxhxcjgbyee" as const;
const MANAGEMENT_TIMEOUT_MS = 5_000;
const MAXIMUM_TOKEN_RESPONSE_BYTES = 32 * 1_024;
const MAXIMUM_BRANCH_RESPONSE_BYTES = 128 * 1_024;
const MAXIMUM_ATTESTED_REMAINING_MS = 5 * 60 * 1_000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const UUID_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_SUPABASE_MANAGEMENT_BRIDGE_VERSION =
  "supabase-management-bridge.communication.openai.synthetic-preview.2026-09-01.m1v.v1" as const;
export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_SUPABASE_MANAGEMENT_BRIDGE_READY =
  false as const;

const POLICY_CORE = deepFreeze({
  version:
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_SUPABASE_MANAGEMENT_BRIDGE_VERSION,
  status: "SOURCE_SUPABASE_MANAGEMENT_BRIDGE_NOT_ACTIVATED",
  ready: false,
  sourceOnly: true,
  productionAllowed: false,
  oauthAuthorizationModel: "SUPABASE_OAUTH_APP_SCOPE",
  oauthScope: "environment:read",
  oauthTokenUrl: TOKEN_URL,
  oauthRefreshBeforeManagementRequest: true,
  oauthRefreshMaximumCallsPerBundle: 1,
  oauthRefreshTokenRotationPersisted: false,
  oauthResponseScopeExactWhenPresent: "environment:read",
  oauthClientIdFormat: "UUID",
  oauthReferencesVerifiedBeforeTokenRequest: true,
  managementApiOrigin: MANAGEMENT_API_ORIGIN,
  managementBranchesUrl: BRANCHES_URL,
  managementRequestMaximumCallsPerInvocation: 1,
  unauthorizedRefreshAndReplayAllowed: false,
  redirectsAllowed: false,
  retriesAllowed: false,
  automaticRetries: 0,
  requestTimeoutMs: MANAGEMENT_TIMEOUT_MS,
  tokenResponseMaximumBytes: MAXIMUM_TOKEN_RESPONSE_BYTES,
  branchResponseMaximumBytes: MAXIMUM_BRANCH_RESPONSE_BYTES,
  attestedCredentialMaximumRemainingMs:
    MAXIMUM_ATTESTED_REMAINING_MS,
  sameRootAbortSignalRequired: true,
  accessTokenActiveOnlyDuringCredentialCallback: true,
  rawCredentialMaterialReturned: false,
  liveEvidencePresent: false,
  deploymentApproved: false,
  activationApproved: false,
} as const);

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_SUPABASE_MANAGEMENT_BRIDGE_POLICY_DIGEST =
  "2c4c87bb7a15f3b101fd78c4438f44ed8b2e6dd28f782a615b92f87029e43c68" as const;

if (
  canonicalSha256(POLICY_CORE) !==
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_SUPABASE_MANAGEMENT_BRIDGE_POLICY_DIGEST
) {
  throw unavailable();
}

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_SUPABASE_MANAGEMENT_BRIDGE_POLICY =
  deepFreeze({
    ...POLICY_CORE,
    policyDigest:
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_SUPABASE_MANAGEMENT_BRIDGE_POLICY_DIGEST,
  });

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_SUPABASE_MANAGEMENT_BRIDGE =
  undefined as SupabaseManagementBridge | undefined;

export async function createCaresLinkV1CommunicationNotePreviewProductRuntimeSupabaseManagementBridge(
  _value: unknown,
  _context: unknown,
): Promise<never> {
  void _value;
  void _context;
  throw unavailable();
}

/**
 * Source-only OAuth and Management API protocol bridge. The formal export is
 * fixed off. This seam accepts a bounded HTTPS transport and one-use intake
 * custody port so tests can prove refresh, replay and credential boundaries
 * without creating an OAuth app, Preview branch or deployment.
 */
export async function createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeSupabaseManagementBridge(
  value: unknown,
  contextValue: unknown,
): Promise<SupabaseManagementBridge> {
  try {
    const options = exactDataRecord(value, [
      "capability",
      "httpsTransport",
      "intakeCredentialCustodyPort",
      "clock",
    ]);
    if (
      options.capability !==
      "TEST_ONLY_M1V_SUPABASE_MANAGEMENT_BRIDGE"
    ) {
      throw unavailable();
    }
    const requestHttps = validateFrozenCallablePort<HttpsTransport["request"]>(
      options.httpsTransport,
      "request",
    );
    const consumeIntake = validateFrozenCallablePort<
      IntakeCredentialCustodyPort["consume"]
    >(options.intakeCredentialCustodyPort, "consume");
    const nowSource = validateFrozenCallablePort<Clock["now"]>(
      options.clock,
      "now",
    );
    requireIndependentPorts(
      [
        options.httpsTransport,
        options.intakeCredentialCustodyPort,
        options.clock,
      ],
      [requestHttps, consumeIntake, nowSource],
    );
    const context = validateContext(contextValue);
    let previousClockMilliseconds = Number.NEGATIVE_INFINITY;
    const now = () => {
      const timestamp = requireTimestamp(nowSource());
      const milliseconds = Date.parse(timestamp);
      if (milliseconds < previousClockMilliseconds) throw unavailable();
      previousClockMilliseconds = milliseconds;
      return timestamp;
    };

    let refreshStarted = false;
    let refreshedCredentialPromise: Promise<RefreshedCredential> | undefined;
    let activeAccessToken: string | undefined;
    let accessRevoked = false;

    const obtainCredential = (
      callContext: CallContext,
      expectedReferences: Readonly<{
        oauthAppReferenceSha256: string;
        oauthGrantReferenceSha256: string;
      }>,
    ) => {
      if (refreshedCredentialPromise) return refreshedCredentialPromise;
      if (refreshStarted) throw unavailable();
      refreshStarted = true;
      const operation = refreshCredential({
        consumeIntake,
        requestHttps,
        context: callContext,
        now,
        expectedReferences,
      });
      refreshedCredentialPromise = operation;
      void operation.catch(() => undefined);
      return operation;
    };

    const supabaseManagementCredentialPort = Object.freeze({
      async consume(
        requestValue: unknown,
        callContextValue: unknown,
        consumerValue: unknown,
      ): Promise<void> {
        try {
          const callContext = requireSameContext(
            callContextValue,
            context.signal,
          );
          const request = validateCredentialRequest(requestValue);
          const consumer = requireConsumer(consumerValue);
          const credential = await obtainCredential(callContext, request);
          requireNotAborted(callContext.signal);
          if (
            accessRevoked ||
            Date.parse(credential.expiresAt) <= Date.parse(now()) ||
            credential.oauthAppReferenceSha256 !==
              request.oauthAppReferenceSha256 ||
            credential.oauthGrantReferenceSha256 !==
              request.oauthGrantReferenceSha256
          ) {
            throw unavailable();
          }
          if (activeAccessToken !== undefined) throw unavailable();
          activeAccessToken = credential.accessToken;
          let callbackOpen = true;
          let callbackCount = 0;
          let callbackViolation = false;
          const callback = (token: unknown): Promise<void> => {
            if (!callbackOpen || callbackCount !== 0) {
              callbackViolation = true;
              const denied = Promise.reject(unavailable());
              void denied.catch(() => undefined);
              return denied;
            }
            callbackCount += 1;
            if (token !== credential.accessToken) throw unavailable();
            return Promise.resolve(
              consumer(
                credential.accessToken,
                createManagementAttestation(credential),
              ),
            );
          };
          try {
            await callback(credential.accessToken);
            if (callbackViolation || callbackCount !== 1) {
              throw unavailable();
            }
            requireNotAborted(callContext.signal);
          } finally {
            callbackOpen = false;
            if (activeAccessToken === credential.accessToken) {
              activeAccessToken = undefined;
            }
          }
        } catch {
          throw unavailable();
        }
      },
    });

    const supabaseManagementHttpsPort = Object.freeze({
      async request(
        requestValue: unknown,
        accessTokenValue: unknown,
        callContextValue: unknown,
      ) {
        let authorization: string | undefined;
        try {
          const callContext = requireSameContext(
            callContextValue,
            context.signal,
          );
          validateBranchesRequest(requestValue);
          const accessToken = requireAccessToken(accessTokenValue);
          if (
            accessRevoked ||
            !activeAccessToken ||
            accessToken !== activeAccessToken
          ) {
            throw unavailable();
          }
          if (!refreshedCredentialPromise) throw unavailable();
          const credential = await refreshedCredentialPromise;
          if (
            credential.accessToken !== accessToken ||
            Date.parse(credential.expiresAt) <= Date.parse(now())
          ) {
            throw unavailable();
          }
          authorization = `Bearer ${accessToken}`;
          const response = validateHttpsResponse(
            await requestHttps(
              Object.freeze({
                method: "GET" as const,
                url: BRANCHES_URL,
                headers: Object.freeze({
                  accept: "application/json" as const,
                  authorization,
                }),
                body: undefined,
                redirect: "ERROR" as const,
                automaticRetries: 0 as const,
                timeoutMs: MANAGEMENT_TIMEOUT_MS,
                maximumResponseBytes: MAXIMUM_BRANCH_RESPONSE_BYTES,
              }),
              callContext,
            ),
            BRANCHES_URL,
            MAXIMUM_BRANCH_RESPONSE_BYTES,
          );
          requireNotAborted(callContext.signal);
          if (response.status === 401) {
            accessRevoked = true;
            activeAccessToken = undefined;
          }
          return Object.freeze({
            status: response.status,
            contentType: response.contentType,
            redirected: false as const,
            responseUrl: BRANCHES_URL,
            body: Uint8Array.from(response.body),
            rawCredentialMaterialPresent: false as const,
          });
        } catch {
          throw unavailable();
        } finally {
          authorization = undefined;
        }
      },
    });

    return Object.freeze({
      status: "TEST_ONLY_SUPABASE_MANAGEMENT_BRIDGE_NOT_APPROVED" as const,
      supabaseManagementCredentialPort,
      supabaseManagementHttpsPort,
      rawCredentialMaterialPresent: false as const,
    });
  } catch {
    throw unavailable();
  }
}

type CallContext = Readonly<{ signal: AbortSignal }>;
type Clock = Readonly<{ now(): string }>;
type HttpsTransport = Readonly<{
  request(
    request: Readonly<Record<string, unknown>>,
    context: CallContext,
  ): PromiseLike<unknown>;
}>;
type IntakeCredentialCustodyPort = Readonly<{
  consume(
    context: CallContext,
    consumer: (credential: unknown) => PromiseLike<void>,
  ): PromiseLike<unknown>;
}>;
type IntakeCredential = Readonly<{
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  oauthAppReferenceSha256: string;
  oauthGrantReferenceSha256: string;
  principalReferenceSha256: string;
  credentialReferenceSha256: string;
}>;
type RefreshedCredential = Readonly<{
  accessToken: string;
  oauthAppReferenceSha256: string;
  oauthGrantReferenceSha256: string;
  principalReferenceSha256: string;
  credentialReferenceSha256: string;
  observedAt: string;
  expiresAt: string;
}>;
type SupabaseManagementBridge = Readonly<{
  status: "TEST_ONLY_SUPABASE_MANAGEMENT_BRIDGE_NOT_APPROVED";
  supabaseManagementCredentialPort: Readonly<{
    consume(
      request: unknown,
      context: unknown,
      consumer: unknown,
    ): Promise<void>;
  }>;
  supabaseManagementHttpsPort: Readonly<{
    request(
      request: unknown,
      accessToken: unknown,
      context: unknown,
    ): Promise<unknown>;
  }>;
  rawCredentialMaterialPresent: false;
}>;

async function refreshCredential(input: {
  consumeIntake: IntakeCredentialCustodyPort["consume"];
  requestHttps: HttpsTransport["request"];
  context: CallContext;
  now: () => string;
  expectedReferences: Readonly<{
    oauthAppReferenceSha256: string;
    oauthGrantReferenceSha256: string;
  }>;
}): Promise<RefreshedCredential> {
  requireNotAborted(input.context.signal);
  const intake = await consumeIntakeExactlyOnce(
    input.consumeIntake,
    input.context,
  );
  if (
    intake.oauthAppReferenceSha256 !==
      input.expectedReferences.oauthAppReferenceSha256 ||
    intake.oauthGrantReferenceSha256 !==
      input.expectedReferences.oauthGrantReferenceSha256
  ) {
    throw unavailable();
  }
  let authorization: string | undefined;
  let body: Uint8Array | undefined;
  try {
    authorization = `Basic ${Buffer.from(
      `${intake.clientId}:${intake.clientSecret}`,
      "utf8",
    ).toString("base64")}`;
    body = new TextEncoder().encode(
      `grant_type=refresh_token&refresh_token=${encodeURIComponent(
        intake.refreshToken,
      )}`,
    );
    const response = validateHttpsResponse(
      await input.requestHttps(
        Object.freeze({
          method: "POST" as const,
          url: TOKEN_URL,
          headers: Object.freeze({
            accept: "application/json" as const,
            authorization,
            "content-type":
              "application/x-www-form-urlencoded" as const,
          }),
          body: Uint8Array.from(body),
          redirect: "ERROR" as const,
          automaticRetries: 0 as const,
          timeoutMs: MANAGEMENT_TIMEOUT_MS,
          maximumResponseBytes: MAXIMUM_TOKEN_RESPONSE_BYTES,
        }),
        input.context,
      ),
      TOKEN_URL,
      MAXIMUM_TOKEN_RESPONSE_BYTES,
    );
    requireNotAborted(input.context.signal);
    if (response.status < 200 || response.status >= 300) throw unavailable();
    const token = validateTokenResponse(response.body);
    const observedAt = input.now();
    const maximumExpiresAt =
      Date.parse(observedAt) + MAXIMUM_ATTESTED_REMAINING_MS;
    const providerExpiresAt =
      Date.parse(observedAt) + token.expiresIn * 1_000;
    const expiresAt = new Date(
      Math.min(maximumExpiresAt, providerExpiresAt),
    ).toISOString();
    if (Date.parse(expiresAt) <= Date.parse(observedAt)) throw unavailable();
    return Object.freeze({
      accessToken: token.accessToken,
      oauthAppReferenceSha256: intake.oauthAppReferenceSha256,
      oauthGrantReferenceSha256: intake.oauthGrantReferenceSha256,
      principalReferenceSha256: intake.principalReferenceSha256,
      credentialReferenceSha256: intake.credentialReferenceSha256,
      observedAt,
      expiresAt,
    });
  } catch {
    throw unavailable();
  } finally {
    authorization = undefined;
    body?.fill(0);
    body = undefined;
  }
}

async function consumeIntakeExactlyOnce(
  consume: IntakeCredentialCustodyPort["consume"],
  context: CallContext,
) {
  let callbackOpen = true;
  let callbackCount = 0;
  let callbackViolation = false;
  let intakePromise: Promise<IntakeCredential> | undefined;
  const consumer = (value: unknown): Promise<void> => {
    if (!callbackOpen || callbackCount !== 0) {
      callbackViolation = true;
      const denied = Promise.reject(unavailable());
      void denied.catch(() => undefined);
      return denied;
    }
    callbackCount += 1;
    const operation = Promise.resolve(validateIntakeCredential(value));
    intakePromise = operation;
    void operation.catch(() => undefined);
    return operation.then(() => undefined);
  };
  let result: unknown;
  try {
    result = await consume(context, consumer);
  } finally {
    callbackOpen = false;
  }
  if (
    callbackViolation ||
    callbackCount !== 1 ||
    result !== undefined ||
    !intakePromise
  ) {
    throw unavailable();
  }
  const intake = await intakePromise;
  if (callbackViolation || callbackCount !== 1) throw unavailable();
  requireNotAborted(context.signal);
  return intake;
}

function validateIntakeCredential(value: unknown): IntakeCredential {
  const object = exactDataRecord(value, [
    "clientId",
    "clientSecret",
    "refreshToken",
    "oauthAppReferenceSha256",
    "oauthGrantReferenceSha256",
    "principalReferenceSha256",
    "credentialReferenceSha256",
  ]);
  const clientId = requireSecretText(object.clientId, 8, 256);
  if (!UUID_PATTERN.test(clientId)) throw unavailable();
  const clientSecret = requireSecretText(object.clientSecret, 16, 1_024);
  const refreshToken = requireSecretText(object.refreshToken, 16, 8_192);
  const oauthAppReferenceSha256 = requireSha256(
    object.oauthAppReferenceSha256,
  );
  const oauthGrantReferenceSha256 = requireSha256(
    object.oauthGrantReferenceSha256,
  );
  const principalReferenceSha256 = requireSha256(
    object.principalReferenceSha256,
  );
  const credentialReferenceSha256 = requireSha256(
    object.credentialReferenceSha256,
  );
  if (
    new Set([
      oauthAppReferenceSha256,
      oauthGrantReferenceSha256,
      principalReferenceSha256,
      credentialReferenceSha256,
    ]).size !== 4
  ) {
    throw unavailable();
  }
  return Object.freeze({
    clientId,
    clientSecret,
    refreshToken,
    oauthAppReferenceSha256,
    oauthGrantReferenceSha256,
    principalReferenceSha256,
    credentialReferenceSha256,
  });
}

function validateTokenResponse(value: Uint8Array) {
  const parsed = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(value),
  ) as unknown;
  const object = allowedDataRecord(parsed, [
    "access_token",
    "token_type",
    "expires_in",
    "refresh_token",
    "scope",
  ]);
  if (
    !Object.hasOwn(object, "access_token") ||
    !Object.hasOwn(object, "token_type") ||
    !Object.hasOwn(object, "expires_in") ||
    (object.token_type !== "bearer" && object.token_type !== "Bearer") ||
    typeof object.expires_in !== "number" ||
    !Number.isSafeInteger(object.expires_in) ||
    object.expires_in <= 0 ||
    object.expires_in > 24 * 60 * 60 ||
    (object.refresh_token !== undefined &&
      typeof object.refresh_token !== "string") ||
    (object.scope !== undefined &&
      object.scope !== "environment:read")
  ) {
    throw unavailable();
  }
  return Object.freeze({
    accessToken: requireSecretText(object.access_token, 16, 8_192),
    refreshToken:
      object.refresh_token === undefined
        ? undefined
        : requireSecretText(object.refresh_token, 16, 8_192),
    expiresIn: object.expires_in,
  });
}

function validateCredentialRequest(value: unknown) {
  const object = exactDataRecord(value, [
    "purpose",
    "managementApiOrigin",
    "authorizationModel",
    "oauthScope",
    "oauthAppReferenceSha256",
    "oauthGrantReferenceSha256",
    "scopeAttestationSource",
    "endpointAllowlistEnforced",
    "productionProjectRef",
    "targetProjectRef",
    "sourceRevisionSha256",
    "deploymentIdentityEvidenceSha256",
    "sourceManifestEvidenceSha256",
  ]);
  if (
    object.purpose !==
      "CONSUME_SUPABASE_MANAGEMENT_API_OAUTH2_ACCESS_TOKEN" ||
    object.managementApiOrigin !== MANAGEMENT_API_ORIGIN ||
    object.authorizationModel !== "SUPABASE_OAUTH_APP_SCOPE" ||
    object.oauthScope !== "environment:read" ||
    object.scopeAttestationSource !==
      "PINNED_OAUTH_APP_CONFIGURATION_AND_GRANT" ||
    object.endpointAllowlistEnforced !== true ||
    object.productionProjectRef !== PRODUCTION_PROJECT_REF ||
    typeof object.targetProjectRef !== "string" ||
    !PROJECT_REF_PATTERN.test(object.targetProjectRef) ||
    object.targetProjectRef === PRODUCTION_PROJECT_REF
  ) {
    throw unavailable();
  }
  const sourceRevisionSha256 = requireSha256(
    object.sourceRevisionSha256,
  );
  const deploymentIdentityEvidenceSha256 = requireSha256(
    object.deploymentIdentityEvidenceSha256,
  );
  const sourceManifestEvidenceSha256 = requireSha256(
    object.sourceManifestEvidenceSha256,
  );
  const oauthAppReferenceSha256 = requireSha256(
    object.oauthAppReferenceSha256,
  );
  const oauthGrantReferenceSha256 = requireSha256(
    object.oauthGrantReferenceSha256,
  );
  if (
    new Set([
      sourceRevisionSha256,
      deploymentIdentityEvidenceSha256,
      sourceManifestEvidenceSha256,
      oauthAppReferenceSha256,
      oauthGrantReferenceSha256,
    ]).size !== 5
  ) {
    throw unavailable();
  }
  return Object.freeze({
    oauthAppReferenceSha256,
    oauthGrantReferenceSha256,
  });
}

function validateBranchesRequest(value: unknown) {
  const object = exactDataRecord(value, [
    "method",
    "url",
    "headers",
    "redirect",
    "timeoutMs",
    "maximumResponseBytes",
  ]);
  const headers = exactDataRecord(object.headers, ["accept"]);
  if (
    object.method !== "GET" ||
    object.url !== BRANCHES_URL ||
    headers.accept !== "application/json" ||
    object.redirect !== "ERROR" ||
    object.timeoutMs !== MANAGEMENT_TIMEOUT_MS ||
    object.maximumResponseBytes !== MAXIMUM_BRANCH_RESPONSE_BYTES
  ) {
    throw unavailable();
  }
  return object;
}

function validateHttpsResponse(
  value: unknown,
  expectedUrl: string,
  maximumBytes: number,
) {
  const object = exactDataRecord(value, [
    "status",
    "contentType",
    "redirected",
    "responseUrl",
    "body",
  ]);
  if (
    typeof object.status !== "number" ||
    !Number.isInteger(object.status) ||
    object.status < 100 ||
    object.status > 599 ||
    (object.contentType !== "application/json" &&
      object.contentType !== "application/json; charset=utf-8") ||
    object.redirected !== false ||
    object.responseUrl !== expectedUrl ||
    nodeTypes.isProxy(object.body) ||
    !(object.body instanceof Uint8Array) ||
    object.body.byteLength === 0 ||
    object.body.byteLength > maximumBytes
  ) {
    throw unavailable();
  }
  return Object.freeze({
    status: object.status,
    contentType: object.contentType,
    body: Uint8Array.from(object.body),
  });
}

function createManagementAttestation(credential: RefreshedCredential) {
  return Object.freeze({
    status:
      "ATTESTED_SUPABASE_MANAGEMENT_API_CREDENTIAL_NOT_APPROVED" as const,
    source: "MANAGED_SECRET_CUSTODY" as const,
    credentialClass:
      "SUPABASE_MANAGEMENT_API_OAUTH2_ACCESS_TOKEN" as const,
    authorizationModel: "SUPABASE_OAUTH_APP_SCOPE" as const,
    oauthScope: "environment:read" as const,
    oauthAppReferenceSha256: credential.oauthAppReferenceSha256,
    oauthGrantReferenceSha256: credential.oauthGrantReferenceSha256,
    scopeAttestationSource:
      "PINNED_OAUTH_APP_CONFIGURATION_AND_GRANT" as const,
    endpointAllowlistEnforced: true as const,
    principalReferenceSha256: credential.principalReferenceSha256,
    credentialReferenceSha256: credential.credentialReferenceSha256,
    observedAt: credential.observedAt,
    expiresAt: credential.expiresAt,
    rawCredentialMaterialPresent: false as const,
  });
}

function validateContext(value: unknown): CallContext {
  const object = exactDataRecord(value, ["signal"]);
  if (
    nodeTypes.isProxy(object.signal) ||
    !(object.signal instanceof AbortSignal)
  ) {
    throw unavailable();
  }
  return Object.freeze({ signal: object.signal });
}

function requireSameContext(value: unknown, signal: AbortSignal) {
  const context = validateContext(value);
  if (context.signal !== signal) throw unavailable();
  requireNotAborted(signal);
  return context;
}

function validateFrozenCallablePort<T extends (...args: never[]) => unknown>(
  value: unknown,
  method: string,
): T {
  const object = exactDataRecord(value, [method]);
  if (!Object.isFrozen(object)) throw unavailable();
  const callable = object[method];
  if (typeof callable !== "function" || nodeTypes.isProxy(callable)) {
    throw unavailable();
  }
  return callable as T;
}

function requireIndependentPorts(
  objects: readonly unknown[],
  callables: readonly unknown[],
) {
  if (
    objects.some((object) => !Object.isFrozen(object)) ||
    new Set(objects).size !== objects.length ||
    new Set(callables).size !== callables.length
  ) {
    throw unavailable();
  }
}

function requireConsumer(value: unknown) {
  if (typeof value !== "function" || nodeTypes.isProxy(value)) {
    throw unavailable();
  }
  return value as (...args: unknown[]) => PromiseLike<void>;
}

function requireAccessToken(value: unknown) {
  return requireSecretText(value, 16, 8_192);
}

function requireSecretText(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
) {
  if (
    typeof value !== "string" ||
    value.length < minimumLength ||
    value.length > maximumLength ||
    /[\r\n\0]/.test(value)
  ) {
    throw unavailable();
  }
  return value;
}

function requireSha256(value: unknown) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw unavailable();
  }
  return value;
}

function requireTimestamp(value: unknown) {
  const milliseconds = typeof value === "string" ? Date.parse(value) : NaN;
  if (
    typeof value !== "string" ||
    !TIMESTAMP_PATTERN.test(value) ||
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    throw unavailable();
  }
  return value;
}

function requireNotAborted(signal: AbortSignal) {
  if (signal.aborted) throw unavailable();
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

function allowedDataRecord(value: unknown, keys: readonly string[]) {
  const object = requirePlainDataRecord(value);
  if (Object.keys(object).some((key) => !keys.includes(key))) {
    throw unavailable();
  }
  return object;
}

function requirePlainDataRecord(value: unknown): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
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

function canonicalSha256(value: unknown) {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (
    typeof value === "object" &&
    !nodeTypes.isProxy(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  throw unavailable();
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

function unavailable() {
  return Object.freeze({
    code: "PRODUCT_API_DISABLED" as const,
    message:
      "Communication Note preview Supabase management bridge is unavailable" as const,
  });
}
