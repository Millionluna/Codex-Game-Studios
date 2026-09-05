import { NextResponse } from "next/server";
import {
  getAccountCreditStore,
  type AccountCreditDecision,
  type AccountCreditStore,
} from "@/lib/account-credit-store";
import { getGuidedAiRateLimiter } from "@/lib/guided-ai-rate-limit";
import {
  createNdisCaseNoteClaim,
  createNdisCaseNoteCompanionEvent,
  getNdisCaseNoteCompanionStore,
  hashCompanionToken,
  type NdisCaseNoteCompanionClaimRecord,
  type NdisCaseNoteCompanionEventName,
  type NdisCaseNoteCompanionStore,
  type NdisCaseNoteQuotaScope,
} from "@/lib/ndis-case-note-companion-store";
import {
  createNdisCaseNoteIdempotentClaimToken,
  getNdisCaseNoteCompanionAttribution,
  getNdisCaseNoteRequestIdentity,
  getNdisCaseNoteUsageDate,
  hashAuthenticatedCompanionUser,
  NDIS_CASE_NOTE_COMPANION_SESSION_COOKIE,
} from "@/lib/ndis-case-note-companion-request";
import {
  validateNdisCaseNoteCompanionInput,
  validateNdisCaseNotePrivacyAttestation,
} from "@/lib/ndis-case-note-companion";
import { generateNdisCaseNoteDraft } from "@/lib/openai-ndis-case-note";
import { isCaresLinkV1PointsUiEnabled } from "@/lib/points-ui-feature.server";
import { resolveWorkspaceAccountFromSupabaseSession } from "@/lib/referral-workspace-session";
import { createCareslinkServerSupabaseClient } from "@/lib/supabase-server";

type NdisCaseNotePostBody = {
  input?: unknown;
  privacyReview?: unknown;
};

type ReservedQuota = {
  scope: NdisCaseNoteQuotaScope;
  fingerprintHash: string;
  usageDate: string;
};

type GenerationMeta = {
  model: string;
  inputTokenCount: number;
  outputTokenCount: number;
};

const DEFAULT_MODEL = "gpt-5.4-mini";
const DEFAULT_AUTHENTICATED_DAILY_LIMIT = 3;
const DEFAULT_AUTHENTICATED_IP_DAILY_LIMIT = 20;
const CREDIT_FEATURE = "ndis_case_note";
const CREDIT_ACTION = "generate";
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export async function POST(request: Request) {
  const supabase = await createCareslinkServerSupabaseClient();
  const account = await resolveWorkspaceAccountFromSupabaseSession(supabase);

  if (!account) {
    return NextResponse.json(
      { ok: false, code: "login_required", error: "Login required" },
      { status: 401 },
    );
  }

  if (account.role !== "provider") {
    return NextResponse.json(
      {
        ok: false,
        code: "provider_account_required",
        error: "Use a provider account to generate case note drafts.",
      },
      { status: 403 },
    );
  }

  if (isCaresLinkV1PointsUiEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        code: "service_unavailable",
        error: "The case note companion is temporarily unavailable.",
      },
      {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }

  let body: NdisCaseNotePostBody;

  try {
    body = (await request.json()) as NdisCaseNotePostBody;
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid_json", error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!validateNdisCaseNotePrivacyAttestation(body.privacyReview)) {
    return NextResponse.json(
      {
        ok: false,
        code: "privacy_review_required",
        error:
          "Complete the privacy review and both confirmations before generating.",
      },
      { status: 422 },
    );
  }

  const validation = validateNdisCaseNoteCompanionInput(body.input);

  if (!validation.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: "input_review_required",
        error:
          "Review the highlighted fields and remove obvious identifying information.",
        issues: validation.issues,
      },
      { status: 422 },
    );
  }

  const idempotencyKey = request.headers.get("idempotency-key")?.trim();

  if (!idempotencyKey || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    return NextResponse.json(
      {
        ok: false,
        code: "idempotency_key_required",
        error: "A valid idempotency key is required.",
      },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        code: "not_configured",
        error: "The case note companion is not configured.",
      },
      { status: 503 },
    );
  }

  let identity: ReturnType<typeof getNdisCaseNoteRequestIdentity>;
  let companionStore: NdisCaseNoteCompanionStore;
  let creditStore: AccountCreditStore;

  try {
    identity = getNdisCaseNoteRequestIdentity(request);
    companionStore = getNdisCaseNoteCompanionStore();
    creditStore = getAccountCreditStore();
    await companionStore.purgeExpiredClaims();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        code: "service_unavailable",
        error: "The case note companion is temporarily unavailable.",
      },
      { status: 503 },
    );
  }

  let credit: AccountCreditDecision;

  try {
    credit = await creditStore.reserveCredit({
      userId: account.id,
      feature: CREDIT_FEATURE,
      action: CREDIT_ACTION,
      idempotencyKey,
    });
  } catch {
    return withCompanionSessionCookie(
      NextResponse.json(
        {
          ok: false,
          code: "credits_unavailable",
          error: "Credit availability could not be confirmed.",
        },
        { status: 503 },
      ),
      identity.sessionId,
    );
  }

  const replay = await resolveExistingReservation({
    credit,
    creditStore,
    companionStore,
    userId: account.id,
    sessionId: identity.sessionId,
  });

  if (replay) {
    return replay;
  }

  if (credit.reservationStatus === "exhausted") {
    await recordCompanionEventSafely({
      store: companionStore,
      eventName: "companion_credit_exhausted",
      userId: account.id,
      visitorHash: identity.visitorHash,
      request,
    });

    return withCompanionSessionCookie(
      NextResponse.json(
        {
          ok: false,
          code: "credit_exhausted",
          error: "No case note generation credits remain in this period.",
          credits: toCreditSummary(credit),
        },
        { status: 429 },
      ),
      identity.sessionId,
    );
  }

  if (
    credit.reservationStatus !== "reserved" ||
    !credit.isNew ||
    !credit.reservationId
  ) {
    return withCompanionSessionCookie(
      NextResponse.json(
        {
          ok: false,
          code: "credits_unavailable",
          error: "A generation credit could not be reserved.",
        },
        { status: 503 },
      ),
      identity.sessionId,
    );
  }

  const reservationId = credit.reservationId;
  const rateLimitKey = `ndis-case-note:user:${account.id}`;
  const rateLimit = getGuidedAiRateLimiter().check(rateLimitKey);

  if (!rateLimit.allowed) {
    await releaseCreditSafely({
      creditStore,
      userId: account.id,
      reservationId,
      reasonCode: "rate_limited",
    });

    return withCompanionSessionCookie(
      NextResponse.json(
        {
          ok: false,
          code: "rate_limited",
          error: "Too many requests. Please wait before trying again.",
          retryAfterSeconds: rateLimit.retryAfterSeconds,
          resetAt: rateLimit.resetAt,
        },
        { status: 429 },
      ),
      identity.sessionId,
    );
  }

  let quota: Awaited<ReturnType<typeof reserveCompanionQuota>>;

  try {
    quota = await reserveCompanionQuota({
      store: companionStore,
      accountId: account.id,
      ipHash: identity.ipHash,
    });
  } catch {
    await releaseCreditSafely({
      creditStore,
      userId: account.id,
      reservationId,
      reasonCode: "abuse_quota_unavailable",
    });

    return withCompanionSessionCookie(
      NextResponse.json(
        {
          ok: false,
          code: "service_unavailable",
          error: "The case note companion is temporarily unavailable.",
        },
        { status: 503 },
      ),
      identity.sessionId,
    );
  }

  if (!quota.allowed) {
    await releaseCreditSafely({
      creditStore,
      userId: account.id,
      reservationId,
      reasonCode: "daily_limit_reached",
    });

    return withCompanionSessionCookie(
      NextResponse.json(
        {
          ok: false,
          code: "daily_limit_reached",
          error: "Your case note draft limit has been reached for today.",
        },
        { status: 429 },
      ),
      identity.sessionId,
    );
  }

  const model =
    process.env.OPENAI_NDIS_CASE_NOTE_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    DEFAULT_MODEL;
  let generated: Awaited<ReturnType<typeof generateNdisCaseNoteDraft>>;

  try {
    generated = await generateNdisCaseNoteDraft({
      input: validation.input,
      apiKey,
      model,
    });
  } catch {
    await releaseCreditSafely({
      creditStore,
      userId: account.id,
      reservationId,
      reasonCode: "generation_failed",
    });

    return generationFailedResponse(identity.sessionId);
  }

  const claimToken = createNdisCaseNoteIdempotentClaimToken({
    userId: account.id,
    reservationId,
  });
  const generationMeta = {
    model,
    inputTokenCount: generated.inputTokenCount,
    outputTokenCount: generated.outputTokenCount,
  } satisfies GenerationMeta;
  const claim = createNdisCaseNoteClaim({
    token: claimToken,
    material: generated.material,
    generationMeta,
    claimedByUserId: account.id,
  });

  try {
    await companionStore.saveClaim(claim.record);
  } catch {
    await releaseCreditSafely({
      creditStore,
      userId: account.id,
      reservationId,
      reasonCode: "claim_persistence_failed",
    });

    return generationFailedResponse(identity.sessionId);
  }

  let committed: AccountCreditDecision;

  try {
    committed = await creditStore.commitCredit({
      userId: account.id,
      reservationId,
      resultRef: claim.record.tokenHash,
      ...generationMeta,
    });
  } catch {
    await releaseCreditSafely({
      creditStore,
      userId: account.id,
      reservationId,
      reasonCode: "credit_commit_failed",
    });

    return withCompanionSessionCookie(
      NextResponse.json(
        {
          ok: false,
          code: "service_unavailable",
          error: "The generation result could not be finalised.",
        },
        { status: 503 },
      ),
      identity.sessionId,
    );
  }

  if (committed.reservationStatus !== "completed") {
    await releaseCreditSafely({
      creditStore,
      userId: account.id,
      reservationId,
      reasonCode: "credit_commit_rejected",
    });

    return withCompanionSessionCookie(
      NextResponse.json(
        {
          ok: false,
          code: "service_unavailable",
          error: "The generation result could not be finalised.",
        },
        { status: 503 },
      ),
      identity.sessionId,
    );
  }

  await recordCompanionEventSafely({
    store: companionStore,
    eventName: "companion_generated",
    userId: account.id,
    visitorHash: identity.visitorHash,
    request,
  });

  return createSuccessResponse({
    claimToken,
    claim: claim.record,
    generationMeta,
    credit: committed,
    sessionId: identity.sessionId,
  });
}

async function resolveExistingReservation({
  credit,
  creditStore,
  companionStore,
  userId,
  sessionId,
}: {
  credit: AccountCreditDecision;
  creditStore: AccountCreditStore;
  companionStore: NdisCaseNoteCompanionStore;
  userId: string;
  sessionId: string;
}) {
  if (
    credit.reservationStatus !== "completed" &&
    !(credit.reservationStatus === "reserved" && !credit.isNew)
  ) {
    if (credit.reservationStatus === "released") {
      return withCompanionSessionCookie(
        NextResponse.json(
          {
            ok: false,
            code: "generation_not_completed",
            error: "This generation attempt did not complete.",
          },
          { status: 409 },
        ),
        sessionId,
      );
    }

    return undefined;
  }

  if (!credit.reservationId) {
    return idempotencyResultUnavailable(sessionId);
  }

  const claimToken = createNdisCaseNoteIdempotentClaimToken({
    userId,
    reservationId: credit.reservationId,
  });
  const resultRef = hashCompanionToken(claimToken);

  if (
    credit.reservationStatus === "completed" &&
    credit.resultRef !== resultRef
  ) {
    return idempotencyResultUnavailable(sessionId);
  }

  let claim: NdisCaseNoteCompanionClaimRecord | undefined;

  try {
    claim = await companionStore.getClaim(claimToken);
  } catch {
    return idempotencyResultUnavailable(sessionId);
  }

  if (!claim || claim.claimedByUserId !== userId || !claim.generationMeta) {
    if (credit.reservationStatus === "reserved") {
      return withCompanionSessionCookie(
        NextResponse.json(
          {
            ok: false,
            code: "generation_in_progress",
            error: "This generation request is still being processed.",
            retryAfterSeconds: 2,
          },
          { status: 409 },
        ),
        sessionId,
      );
    }

    return idempotencyResultUnavailable(sessionId);
  }

  let completed = credit;

  if (credit.reservationStatus === "reserved") {
    try {
      completed = await creditStore.commitCredit({
        userId,
        reservationId: credit.reservationId,
        resultRef,
        ...claim.generationMeta,
      });
    } catch {
      return idempotencyResultUnavailable(sessionId);
    }
  }

  if (completed.reservationStatus !== "completed") {
    return idempotencyResultUnavailable(sessionId);
  }

  return createSuccessResponse({
    claimToken,
    claim,
    generationMeta: claim.generationMeta,
    credit: completed,
    sessionId,
  });
}

function createSuccessResponse({
  claimToken,
  claim,
  generationMeta,
  credit,
  sessionId,
}: {
  claimToken: string;
  claim: NdisCaseNoteCompanionClaimRecord;
  generationMeta: GenerationMeta;
  credit: AccountCreditDecision;
  sessionId: string;
}) {
  return withCompanionSessionCookie(
    NextResponse.json({
      ok: true,
      feature: CREDIT_FEATURE,
      material: claim.material,
      claimToken,
      signedIn: true,
      credits: toCreditSummary(credit),
      meta: {
        ...generationMeta,
        expiresAt: claim.expiresAt,
        note:
          "User-reviewed draft wording. General documentation support only.",
      },
    }),
    sessionId,
  );
}

function idempotencyResultUnavailable(sessionId: string) {
  return withCompanionSessionCookie(
    NextResponse.json(
      {
        ok: false,
        code: "idempotency_result_unavailable",
        error: "This completed attempt is no longer available to display.",
      },
      { status: 409 },
    ),
    sessionId,
  );
}

function generationFailedResponse(sessionId: string) {
  return withCompanionSessionCookie(
    NextResponse.json(
      {
        ok: false,
        code: "generation_failed",
        error: "The draft could not be generated safely.",
      },
      { status: 502 },
    ),
    sessionId,
  );
}

function toCreditSummary(credit: AccountCreditDecision) {
  return {
    planCode: credit.planCode,
    status: credit.status,
    periodStart: credit.periodStart,
    periodEnd: credit.periodEnd,
    creditLimit: credit.creditLimit,
    remainingCredits: credit.remainingCredits,
    usedCredits: credit.usedCredits,
    reservedCredits: credit.reservedCredits,
  };
}

async function releaseCreditSafely({
  creditStore,
  userId,
  reservationId,
  reasonCode,
}: {
  creditStore: AccountCreditStore;
  userId: string;
  reservationId: string;
  reasonCode: string;
}) {
  try {
    return await creditStore.releaseCredit({
      userId,
      reservationId,
      reasonCode,
    });
  } catch {
    return undefined;
  }
}

async function reserveCompanionQuota({
  store,
  accountId,
  ipHash,
}: {
  store: NdisCaseNoteCompanionStore;
  accountId: string;
  ipHash: string;
}): Promise<
  | { allowed: true; reservations: ReservedQuota[] }
  | { allowed: false; reservations: [] }
> {
  const usageDate = getNdisCaseNoteUsageDate();
  const candidates: Array<ReservedQuota & { limit: number }> = [
    {
      scope: "authenticated_user",
      fingerprintHash: hashAuthenticatedCompanionUser(accountId),
      usageDate,
      limit: getPositiveIntegerEnv(
        "NDIS_CASE_NOTE_AUTH_DAILY_LIMIT",
        DEFAULT_AUTHENTICATED_DAILY_LIMIT,
      ),
    },
    {
      scope: "authenticated_ip",
      fingerprintHash: ipHash,
      usageDate,
      limit: getPositiveIntegerEnv(
        "NDIS_CASE_NOTE_AUTH_IP_DAILY_LIMIT",
        DEFAULT_AUTHENTICATED_IP_DAILY_LIMIT,
      ),
    },
  ];
  const reservations: ReservedQuota[] = [];

  for (const candidate of candidates) {
    const decision = await store.consumeQuota(candidate);

    if (!decision.allowed) {
      await releaseCompanionQuota(store, reservations);
      return { allowed: false, reservations: [] };
    }

    reservations.push(candidate);
  }

  return { allowed: true, reservations };
}

async function releaseCompanionQuota(
  store: NdisCaseNoteCompanionStore,
  reservations: ReservedQuota[],
) {
  await Promise.all(
    reservations.map((reservation) =>
      store.releaseQuota(reservation).catch(() => undefined),
    ),
  );
}

async function recordCompanionEventSafely({
  store,
  eventName,
  userId,
  visitorHash,
  request,
}: {
  store: NdisCaseNoteCompanionStore;
  eventName: NdisCaseNoteCompanionEventName;
  userId?: string;
  visitorHash: string;
  request: Request;
}) {
  try {
    await store.recordEvent(
      createNdisCaseNoteCompanionEvent({
        eventName,
        userId,
        visitorHash,
        attribution: getNdisCaseNoteCompanionAttribution(request.url),
      }),
    );
  } catch {
    // Generation must not fail when metadata-only telemetry is unavailable.
  }
}

function withCompanionSessionCookie(
  response: NextResponse,
  sessionId: string,
) {
  response.cookies.set(
    NDIS_CASE_NOTE_COMPANION_SESSION_COOKIE,
    sessionId,
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    },
  );

  return response;
}

function getPositiveIntegerEnv(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}
