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
const DEFAULT_AUTHENTICATED_DAILY_LIMIT = 3;
const DEFAULT_AUTHENTICATED_IP_DAILY_LIMIT = 20;

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

  const rateLimitKey = `ndis-case-note:user:${account.id}`;
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
      accountId: account.id,
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

  try {
    const generated = await generateNdisCaseNoteDraft({
      input: validation.input,
      apiKey,
      model,
    });
    const claim = createNdisCaseNoteClaim({
      material: generated.material,
      claimedByUserId: account.id,
    });

    await store.saveClaim(claim.record);
    await recordCompanionEventSafely({
      store,
      eventName: "companion_generated",
      userId: account.id,
      visitorHash: identity.visitorHash,
      request,
    });

    return withCompanionSessionCookie(
      NextResponse.json({
        ok: true,
        feature: "ndis_case_note",
        material: generated.material,
        claimToken: claim.token,
        signedIn: true,
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
