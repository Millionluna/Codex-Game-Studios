import { NextResponse } from "next/server";
import { getGuidedAiRateLimiter } from "@/lib/guided-ai-rate-limit";
import {
  createNdisCaseNoteCompanionEvent,
  getNdisCaseNoteCompanionStore,
  type NdisCaseNoteCompanionEventName,
} from "@/lib/ndis-case-note-companion-store";
import {
  getNdisCaseNoteCompanionAttribution,
  getNdisCaseNoteRequestIdentity,
  NDIS_CASE_NOTE_COMPANION_SESSION_COOKIE,
} from "@/lib/ndis-case-note-companion-request";
import { resolveWorkspaceAccountFromSupabaseSession } from "@/lib/referral-workspace-session";
import { createCareslinkServerSupabaseClient } from "@/lib/supabase-server";

type CompanionEventPostBody = {
  eventName?: unknown;
};

const CLIENT_EVENT_NAMES = new Set<NdisCaseNoteCompanionEventName>([
  "companion_viewed",
  "companion_started",
]);

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
        error: "Only provider accounts can record companion activity.",
      },
      { status: 403 },
    );
  }

  let body: CompanionEventPostBody;

  try {
    body = (await request.json()) as CompanionEventPostBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const eventName = getClientEventName(body.eventName);

  if (!eventName) {
    return NextResponse.json(
      { ok: false, error: "Invalid companion event" },
      { status: 400 },
    );
  }

  let identity: ReturnType<typeof getNdisCaseNoteRequestIdentity>;

  try {
    identity = getNdisCaseNoteRequestIdentity(request);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Companion telemetry is unavailable" },
      { status: 503 },
    );
  }
  const rateLimit = getGuidedAiRateLimiter().check(
    `ndis-case-note-event:user:${account.id}`,
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many companion events" },
      { status: 429 },
    );
  }

  try {
    await getNdisCaseNoteCompanionStore().recordEvent(
      createNdisCaseNoteCompanionEvent({
        eventName,
        userId: account.id,
        visitorHash: identity.visitorHash,
        attribution: getNdisCaseNoteCompanionAttribution(request.url),
      }),
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "Companion telemetry is unavailable" },
      { status: 503 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    NDIS_CASE_NOTE_COMPANION_SESSION_COOKIE,
    identity.sessionId,
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

function getClientEventName(value: unknown) {
  return typeof value === "string" &&
    CLIENT_EVENT_NAMES.has(value as NdisCaseNoteCompanionEventName)
    ? (value as NdisCaseNoteCompanionEventName)
    : undefined;
}
