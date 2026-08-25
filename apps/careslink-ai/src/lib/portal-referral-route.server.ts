import "server-only";

import { randomUUID } from "node:crypto";

import { readBoundedRequestText } from "./bounded-request-text.server";
import type {
  PortalReferralApi,
  PortalReferralSourceDetail,
} from "./portal-referral-adapter.server";
import { canonicalPortalReferralUuid } from "./portal-referral-id";
import {
  PORTAL_REFERRAL_FOLLOW_UP_OUTCOME_CODES,
  PORTAL_REFERRAL_PREVIEW_REGION_CODES,
  PORTAL_REFERRAL_PREVIEW_SERVICE_TYPE_CODES,
  PORTAL_REFERRAL_STATUSES,
  PortalReferralWorkflowError,
  type PortalReferralFollowUpOutcomeCode,
} from "./portal-referral-workflow";
import {
  resolveDefaultPortalReferralApi,
  type PortalReferralApiResolution,
  type PortalReferralApiResolver,
  type PortalReferralOperation,
} from "./portal-referral-runtime.server";
import { assertCaresLinkV1IdempotencyKey } from "./v1/shared-contracts";

const MAX_REQUEST_BYTES = 16_384;
export type PortalReferralRouteDependencies = Readonly<{
  resolveApi?: PortalReferralApiResolver;
  createCorrelationId?: () => string;
}>;

type RouteResult = Readonly<{ status?: number; body: unknown }>;

export async function handlePortalReferralCollection(
  request: Request,
  dependencies?: PortalReferralRouteDependencies,
) {
  if (request.method === "GET") {
    return withPortalReferralApi(
      request,
      "LIST_REFERRALS",
      dependencies,
      async (api) => ({ body: { items: await api.listReferrals() } }),
    );
  }
  if (request.method !== "POST") return methodNotAllowed("GET, POST");
  return withPortalReferralApi(
    request,
    "CREATE_REFERRAL",
    dependencies,
    async (api, correlationId) => {
      assertMutationTransport(request);
      const mutation = {
        ...getMutationMetadata(request),
        correlationId,
      };
      const body = await readJsonObject(request);
      assertExactKeys(body, ["summary", "region", "serviceType", "contact"]);
      const contact = requiredObject(body.contact);
      assertExactKeys(contact, ["name", "phone", "email"]);
      return {
        status: 201,
        body: await api.createReferral(
          {
            summary: body.summary as string,
            region: body.region as string,
            serviceType: body.serviceType as string,
            contact: {
              name: contact.name as string,
              phone: contact.phone as string,
              email: contact.email === null ? null : (contact.email as string),
            },
          },
          mutation,
        ),
      };
    },
  );
}

export async function handlePortalReferralGet(
  request: Request,
  referralId: string,
  dependencies?: PortalReferralRouteDependencies,
) {
  if (request.method !== "GET") return methodNotAllowed("GET");
  return withPortalReferralApi(
    request,
    "GET_REFERRAL",
    dependencies,
    async (api) => {
      const expectedReferralId = assertUuid(referralId);
      const referral = await api.getReferral(expectedReferralId);
      return {
        body: {
          referral: projectPortalReferralSourceDetail(
            expectedReferralId,
            referral,
          ),
        },
      };
    },
  );
}

export async function handlePortalReferralTriage(
  request: Request,
  referralId: string,
  dependencies?: PortalReferralRouteDependencies,
) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  return withPortalReferralApi(
    request,
    "TRIAGE_REFERRAL",
    dependencies,
    async (api) => {
      assertMutationTransport(request);
      const mutation = getMutationMetadata(request);
      const body = await readJsonObject(request);
      assertExactKeys(body, ["expectedVersion"]);
      return {
        body: await api.triageReferral(
          assertUuid(referralId),
          requiredVersion(body.expectedVersion),
          mutation,
        ),
      };
    },
  );
}

export async function handlePortalReferralCandidates(
  request: Request,
  referralId: string,
  dependencies?: PortalReferralRouteDependencies,
) {
  if (request.method !== "GET") return methodNotAllowed("GET");
  return withPortalReferralApi(
    request,
    "LIST_PROVIDER_CANDIDATES",
    dependencies,
    async (api) => ({
      body: {
        items: await api.listProviderCandidates(assertUuid(referralId)),
      },
    }),
  );
}

export async function handlePortalReferralOffer(
  request: Request,
  referralId: string,
  dependencies?: PortalReferralRouteDependencies,
) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  return withPortalReferralApi(
    request,
    "OFFER_REFERRAL",
    dependencies,
    async (api) => {
      assertMutationTransport(request);
      const mutation = getMutationMetadata(request);
      const body = await readJsonObject(request);
      assertExactKeys(body, ["providerId", "expectedVersion"]);
      return {
        body: await api.offerReferral(
          assertUuid(referralId),
          {
            providerId: assertUuid(body.providerId),
            expectedVersion: requiredVersion(body.expectedVersion),
          },
          mutation,
        ),
      };
    },
  );
}

export async function handlePortalReferralOffers(
  request: Request,
  dependencies?: PortalReferralRouteDependencies,
) {
  if (request.method !== "GET") return methodNotAllowed("GET");
  return withPortalReferralApi(
    request,
    "LIST_MY_OFFERS",
    dependencies,
    async (api) => ({ body: { items: await api.listMyOffers() } }),
  );
}

export async function handlePortalReferralResponse(
  request: Request,
  matchId: string,
  dependencies?: PortalReferralRouteDependencies,
) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  return withPortalReferralApi(
    request,
    "RESPOND_TO_OFFER",
    dependencies,
    async (api) => {
      assertMutationTransport(request);
      const mutation = getMutationMetadata(request);
      const body = await readJsonObject(request);
      assertExactKeys(body, ["decision", "expectedVersion"]);
      const decision = body.decision;
      if (decision !== "ACCEPT" && decision !== "DECLINE") {
        throw validationError();
      }
      return {
        body: await api.respondToOffer(
          assertUuid(matchId),
          {
            decision,
            expectedVersion: requiredVersion(body.expectedVersion),
          },
          mutation,
        ),
      };
    },
  );
}

export async function handlePortalReferralFollowUp(
  request: Request,
  referralId: string,
  dependencies?: PortalReferralRouteDependencies,
) {
  if (request.method !== "POST") return methodNotAllowed("POST");
  return withPortalReferralApi(
    request,
    "RECORD_FOLLOW_UP",
    dependencies,
    async (api) => {
      assertMutationTransport(request);
      const mutation = getMutationMetadata(request);
      const body = await readJsonObject(request);
      assertExactKeys(body, ["outcomeCode", "expectedVersion"]);
      const outcomeCode = requiredOutcomeCode(body.outcomeCode);
      return {
        body: await api.recordFollowUp(
          assertUuid(referralId),
          {
            outcomeCode,
            expectedVersion: requiredVersion(body.expectedVersion),
          },
          mutation,
        ),
      };
    },
  );
}

export async function handlePortalReferralAudit(
  request: Request,
  referralId: string,
  dependencies?: PortalReferralRouteDependencies,
) {
  if (request.method !== "GET") return methodNotAllowed("GET");
  return withPortalReferralApi(
    request,
    "LIST_AUDIT",
    dependencies,
    async (api) => ({
      body: { items: await api.listAudit(assertUuid(referralId)) },
    }),
  );
}

async function withPortalReferralApi(
  request: Request,
  operation: PortalReferralOperation,
  dependencies: PortalReferralRouteDependencies | undefined,
  execute: (
    api: PortalReferralApi,
    correlationId: string,
  ) => Promise<RouteResult>,
) {
  const correlationId = createServerCorrelationId(dependencies);
  const resolveApi = dependencies?.resolveApi ?? resolveDefaultPortalReferralApi;
  try {
    const resolution = await resolveApi(request, operation);
    if (!resolution.ok) {
      return resolutionError(resolution, correlationId);
    }
    const result = await execute(resolution.api, correlationId);
    return jsonResponse(result.body, result.status ?? 200, correlationId);
  } catch (error) {
    if (error instanceof PortalReferralWorkflowError) {
      return workflowError(error, correlationId);
    }
    return errorResponse("INTERNAL_ERROR", 500, correlationId);
  }
}

function resolutionError(
  resolution: Exclude<PortalReferralApiResolution, { ok: true }>,
  correlationId: string,
) {
  switch (resolution.reason) {
    case "auth_required":
      return errorResponse("AUTH_REQUIRED", 401, correlationId);
    case "session_revoked":
      return errorResponse("SESSION_REVOKED", 401, correlationId);
    case "forbidden":
      return errorResponse("FORBIDDEN", 403, correlationId);
    case "adapter_unavailable":
      return errorResponse("ADAPTER_UNAVAILABLE", 503, correlationId);
    default:
      return errorResponse("CAPABILITY_DISABLED", 503, correlationId);
  }
}

function workflowError(error: PortalReferralWorkflowError, correlationId: string) {
  const statusByCode = {
    AUTH_REQUIRED: 401,
    SESSION_REVOKED: 401,
    CAPABILITY_DISABLED: 503,
    ADAPTER_UNAVAILABLE: 503,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    VALIDATION_ERROR: 400,
    STALE_REFERRAL: 409,
    IDEMPOTENCY_CONFLICT: 409,
    INVALID_STATE_TRANSITION: 409,
  } as const;
  const details = safeConflictDetails(error);
  return errorResponse(
    error.code,
    statusByCode[error.code],
    correlationId,
    details,
  );
}

function safeConflictDetails(
  error: PortalReferralWorkflowError,
): Readonly<Record<string, string | number>> | undefined {
  if (
    error.code === "STALE_REFERRAL" &&
    Number.isSafeInteger(error.details?.currentVersion)
  ) {
    return { currentVersion: error.details?.currentVersion as number };
  }
  if (
    error.code === "INVALID_STATE_TRANSITION" &&
    typeof error.details?.currentStatus === "string" &&
    (PORTAL_REFERRAL_STATUSES as readonly string[]).includes(
      error.details.currentStatus,
    )
  ) {
    return { currentStatus: error.details.currentStatus };
  }
  return undefined;
}

function assertMutationTransport(request: Request) {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (mediaType !== "application/json") throw validationError();
  let target: URL;
  let origin: URL;
  try {
    target = new URL(request.url);
    origin = new URL(request.headers.get("origin") ?? "");
  } catch {
    throw new PortalReferralWorkflowError("FORBIDDEN", "Origin is not allowed");
  }
  if (
    target.protocol !== "https:" ||
    origin.protocol !== "https:" ||
    origin.origin !== target.origin
  ) {
    throw new PortalReferralWorkflowError("FORBIDDEN", "Origin is not allowed");
  }
}

function getMutationMetadata(request: Request) {
  const value = request.headers.get("idempotency-key");
  try {
    return { mutationId: assertCaresLinkV1IdempotencyKey(value ?? "") };
  } catch {
    throw validationError();
  }
}

async function readJsonObject(request: Request) {
  const contentLengthHeader = request.headers.get("content-length");
  if (
    contentLengthHeader &&
    (!/^\d+$/.test(contentLengthHeader) ||
      Number(contentLengthHeader) > MAX_REQUEST_BYTES)
  ) {
    throw validationError();
  }
  let raw: string;
  try {
    raw = await readBoundedRequestText(request, MAX_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof PortalReferralWorkflowError) throw error;
    throw validationError();
  }
  if (!raw) {
    throw validationError();
  }
  try {
    return requiredObject(JSON.parse(raw));
  } catch (error) {
    if (error instanceof PortalReferralWorkflowError) throw error;
    throw validationError();
  }
}

function requiredObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw validationError();
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw validationError();
  }
}

function requiredVersion(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw validationError();
  }
  return value as number;
}

function requiredOutcomeCode(value: unknown): PortalReferralFollowUpOutcomeCode {
  if (
    typeof value !== "string" ||
    !(PORTAL_REFERRAL_FOLLOW_UP_OUTCOME_CODES as readonly string[]).includes(value)
  ) {
    throw validationError();
  }
  return value as PortalReferralFollowUpOutcomeCode;
}

function assertUuid(value: unknown) {
  const canonical = canonicalPortalReferralUuid(value);
  if (!canonical) {
    throw validationError();
  }
  return canonical;
}

function projectPortalReferralSourceDetail(
  expectedReferralId: string,
  value: Awaited<ReturnType<PortalReferralApi["getReferral"]>>,
): PortalReferralSourceDetail {
  const referralId = canonicalPortalReferralUuid(value.referralId);
  const contact = value.contact;
  const createdAt = responseInstant(value.createdAt);
  const updatedAt = responseInstant(value.updatedAt);
  if (
    referralId !== expectedReferralId ||
    !contact ||
    !(PORTAL_REFERRAL_PREVIEW_REGION_CODES as readonly string[]).includes(
      value.region,
    ) ||
    !(PORTAL_REFERRAL_PREVIEW_SERVICE_TYPE_CODES as readonly string[]).includes(
      value.serviceType,
    ) ||
    !(PORTAL_REFERRAL_STATUSES as readonly string[]).includes(
      value.currentStatus,
    ) ||
    !Number.isSafeInteger(value.rowVersion) ||
    value.rowVersion < 1 ||
    Date.parse(createdAt) > Date.parse(updatedAt)
  ) {
    throw invalidAdapterResponse();
  }
  return Object.freeze({
    referralId,
    summary: responseText(value.summary, 4_000),
    region: value.region,
    serviceType: value.serviceType,
    currentStatus: value.currentStatus,
    rowVersion: value.rowVersion,
    contact: Object.freeze({
      name: responseText(contact.name, 200),
      phone: responseText(contact.phone, 100),
      email: contact.email === null ? null : responseText(contact.email, 320),
    }),
    createdAt,
    updatedAt,
  });
}

function responseText(value: unknown, maxLength: number) {
  if (typeof value !== "string") throw invalidAdapterResponse();
  const normalized = value.trim();
  if (!normalized || normalized !== value || value.length > maxLength) {
    throw invalidAdapterResponse();
  }
  return value;
}

function responseInstant(value: unknown) {
  if (typeof value !== "string") throw invalidAdapterResponse();
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString() !== value) {
    throw invalidAdapterResponse();
  }
  return value;
}

function invalidAdapterResponse() {
  return new PortalReferralWorkflowError(
    "ADAPTER_UNAVAILABLE",
    "Portal referral adapter is unavailable",
  );
}

function validationError() {
  return new PortalReferralWorkflowError("VALIDATION_ERROR", "Request is invalid");
}

function methodNotAllowed(allow: string) {
  return new Response(null, {
    status: 405,
    headers: { allow, "cache-control": "no-store" },
  });
}

function createServerCorrelationId(
  dependencies: PortalReferralRouteDependencies | undefined,
) {
  const value = (dependencies?.createCorrelationId ?? randomUUID)();
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value)
    ? value
    : randomUUID();
}

function jsonResponse(body: unknown, status: number, correlationId: string) {
  return Response.json(body, {
    status,
    headers: responseHeaders(correlationId),
  });
}

function errorResponse(
  code: string,
  status: number,
  correlationId: string,
  details?: Readonly<Record<string, string | number>>,
) {
  return jsonResponse(
    {
      error: details ? { code, details } : { code },
      correlationId,
    },
    status,
    correlationId,
  );
}

function responseHeaders(correlationId: string) {
  return {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-correlation-id": correlationId,
  };
}
