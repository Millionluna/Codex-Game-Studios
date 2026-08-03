import { NextResponse } from "next/server";
import {
  getGeneratedMaterialDraftStore,
  type GeneratedMaterialDraftRecord,
} from "@/lib/generated-material-draft-store";
import {
  createNdisCaseNoteCompanionEvent,
  getNdisCaseNoteCompanionStore,
  type NdisCaseNoteCompanionClaimRecord,
} from "@/lib/ndis-case-note-companion-store";
import {
  getNdisCaseNoteCompanionAttribution,
  getNdisCaseNoteRequestIdentity,
} from "@/lib/ndis-case-note-companion-request";
import { resolveWorkspaceAccountFromSupabaseSession } from "@/lib/referral-workspace-session";
import { createCareslinkServerSupabaseClient } from "@/lib/supabase-server";

type SaveNdisCaseNotePostBody = {
  claimToken?: unknown;
};

const CLAIM_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,100}$/;

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
        error: "Only provider accounts can save case note drafts.",
      },
      { status: 403 },
    );
  }

  let body: SaveNdisCaseNotePostBody;

  try {
    body = (await request.json()) as SaveNdisCaseNotePostBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const claimToken = getClaimToken(body.claimToken);

  if (!claimToken) {
    return NextResponse.json(
      { ok: false, error: "A valid claim token is required" },
      { status: 400 },
    );
  }

  let companionStore: ReturnType<typeof getNdisCaseNoteCompanionStore>;
  let claim: NdisCaseNoteCompanionClaimRecord | undefined;
  let identity: ReturnType<typeof getNdisCaseNoteRequestIdentity>;

  try {
    identity = getNdisCaseNoteRequestIdentity(request);
    companionStore = getNdisCaseNoteCompanionStore();
    await companionStore.purgeExpiredClaims();
    claim = await companionStore.consumeClaim({
      token: claimToken,
      userId: account.id,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        code: "service_unavailable",
        error: "Draft saving is temporarily unavailable.",
      },
      { status: 503 },
    );
  }

  if (!claim) {
    return NextResponse.json(
      {
        ok: false,
        code: "claim_unavailable",
        error: "This draft link has expired or belongs to another account.",
      },
      { status: 410 },
    );
  }

  const materialStore = getGeneratedMaterialDraftStore();
  const materialDraftId = `ndis-case-note-${claim.tokenHash.slice(0, 32)}`;
  const existing = await materialStore.getGeneratedMaterialDraft(
    materialDraftId,
  );

  if (existing) {
    if (existing.userId !== account.id) {
      return NextResponse.json(
        { ok: false, error: "Saved draft does not belong to this account" },
        { status: 403 },
      );
    }

    await companionStore
      .completeClaim({ token: claimToken, userId: account.id })
      .catch(() => undefined);

    return NextResponse.json({
      ok: true,
      feature: "ndis_case_note",
      generatedMaterialDraftId: existing.id,
      material: existing.content,
      alreadySaved: true,
    });
  }

  const now = new Date().toISOString();
  const materialDraft: GeneratedMaterialDraftRecord = {
    id: materialDraftId,
    userId: account.id,
    feature: "ndis_case_note",
    status: "draft",
    content: claim.material,
    createdAt: claim.createdAt,
    updatedAt: now,
  };

  try {
    const saved =
      await materialStore.saveGeneratedMaterialDraft(materialDraft);
    await companionStore
      .completeClaim({ token: claimToken, userId: account.id })
      .catch(() => undefined);

    try {
      await companionStore.recordEvent(
        createNdisCaseNoteCompanionEvent({
          eventName: "companion_saved",
          userId: account.id,
          visitorHash: identity.visitorHash,
          attribution: getNdisCaseNoteCompanionAttribution(request.url),
        }),
      );
    } catch {
      // Saving the owner-scoped draft does not depend on telemetry availability.
    }

    return NextResponse.json({
      ok: true,
      feature: "ndis_case_note",
      generatedMaterialDraftId: saved.id,
      material: saved.content,
      alreadySaved: false,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unable to save this draft" },
      { status: 502 },
    );
  }
}

function getClaimToken(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return CLAIM_TOKEN_PATTERN.test(normalized) ? normalized : undefined;
}
