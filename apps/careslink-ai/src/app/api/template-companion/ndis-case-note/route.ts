import { NextResponse } from "next/server";
import { getGuidedAiRateLimiter } from "@/lib/guided-ai-rate-limit";
import {
  createNdisCaseNoteClaim,
  createNdisCaseNoteCompanionEvent,
  getNdisCaseNoteCompanionStore,
  type NdisCaseNoteCompanionStore,
  type NdisCaseNoteQuotaScope,
} from "@/lib/ndis-case-note-companion-store";
import {
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

const DEFAULT_MODEL = "gpt-5.4-mini";
const DEFAULT_ANONYMOUS_DAILY_LIMIT = 1;
const DEFAULT_ANONYMOUS_IP_DAILY_LIMIT = 5;
const DEFAULT_AUTHENTICATED_DAILY_LIMIT = 3;
const DEFAULT_AUTHENTICATED_IP_DAILY_LIMIT = 20;

export async function POST(request: Request) {
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

  const supabase = await createCareslinkServerSupabaseClient();
  const account = await resolveWorkspaceAccountFromSupabaseSession(supabase);

  if (account?.role === "admin") {
    return NextResponse.json(
      {
        ok: false,
        code: "provider_account_required",
        error: "Use a provider account for saved case note drafts.",
      },
      { status: 403 },
    );
  }

  let identity: ReturnType<typeof getNdisCaseNoteRequestIdentity>;
  let store: NdisCaseNoteCompanionStore;

  try {
    identity = getNdisCaseNoteRequestIdentity(request);
    store = getNdisCaseNoteCompanionStore();
    await store.purgeExpiredClaims();
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

  const rateLimitKey = account?.id
    ? `ndis-case-note:user:${account.id}`
    : `ndis-case-note:device:${identity.deviceHash}`;
  const rateLimit = getGuidedAiRateLimiter().check(rateLimitKey);

  if (!rateLimit.allowed) {
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
      store,
      accountId: account?.id,
      deviceHash: identity.deviceHash,
      ipHash: identity.ipHash,
    });
  } catch {
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
    return withCompanionSessionCookie(
      NextResponse.json(
        {
          ok: false,
          code: account ? "daily_limit_reached" : "free_limit_reached",
          error: account
            ? "Your case note draft limit has been reached for today."
            : "This device has used its free draft. Sign in to save and use the companion again.",
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

  try {
    const generated = await generateNdisCaseNoteDraft({
      input: validation.input,
      apiKey,
      model,
    });
    const claim = createNdisCaseNoteClaim({
      material: generated.material,
    });

    await store.saveClaim(claim.record);
    await recordCompanionEventSafely({
      store,
      eventName: "companion_generated",
      userId: account?.id,
      visitorHash: identity.visitorHash,
      request,
    });

    return withCompanionSessionCookie(
      NextResponse.json({
        ok: true,
        feature: "ndis_case_note",
        material: generated.material,
        claimToken: claim.token,
        signedIn: Boolean(account),
        meta: {
          model,
          inputTokenCount: generated.inputTokenCount,
          outputTokenCount: generated.outputTokenCount,
          expiresAt: claim.record.expiresAt,
          note:
            "User-reviewed draft wording. General documentation support only.",
        },
      }),
      identity.sessionId,
    );
  } catch {
    return withCompanionSessionCookie(
      NextResponse.json(
        {
          ok: false,
          code: "generation_failed",
          error: "The draft could not be generated safely.",
        },
        { status: 502 },
      ),
      identity.sessionId,
    );
  }
}

async function reserveCompanionQuota({
  store,
  accountId,
  deviceHash,
  ipHash,
}: {
  store: NdisCaseNoteCompanionStore;
  accountId?: string;
  deviceHash: string;
  ipHash: string;
}): Promise<
  | { allowed: true; reservations: ReservedQuota[] }
  | { allowed: false; reservations: [] }
> {
  const usageDate = getNdisCaseNoteUsageDate();
  const candidates: Array<ReservedQuota & { limit: number }> = accountId
    ? [
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
      ]
    : [
        {
          scope: "anonymous_device",
          fingerprintHash: deviceHash,
          usageDate,
          limit: getPositiveIntegerEnv(
            "NDIS_CASE_NOTE_ANON_DAILY_LIMIT",
            DEFAULT_ANONYMOUS_DAILY_LIMIT,
          ),
        },
        {
          scope: "anonymous_ip",
          fingerprintHash: ipHash,
          usageDate,
          limit: getPositiveIntegerEnv(
            "NDIS_CASE_NOTE_ANON_IP_DAILY_LIMIT",
            DEFAULT_ANONYMOUS_IP_DAILY_LIMIT,
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
  eventName: "companion_generated";
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
