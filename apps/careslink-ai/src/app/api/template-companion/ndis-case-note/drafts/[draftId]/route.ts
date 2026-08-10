import { NextResponse } from "next/server";
import { getGeneratedMaterialDraftStore } from "@/lib/generated-material-draft-store";
import { resolveWorkspaceAccountFromSupabaseSession } from "@/lib/referral-workspace-session";
import { createCareslinkServerSupabaseClient } from "@/lib/supabase-server";
import { tombstoneDeletedNdisShadowFromCanonical } from "@/lib/v1/ndis-shadow-integration.server";

const NDIS_CASE_NOTE_DRAFT_ID_PATTERN = /^ndis-case-note-[a-f0-9]{32}$/;
const DELETE_INTENT = "delete-generated-draft";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const supabase = await createCareslinkServerSupabaseClient();
  const account = await resolveWorkspaceAccountFromSupabaseSession(supabase);

  if (!account) {
    return json(
      { ok: false, code: "login_required", error: "Login required" },
      401,
    );
  }

  if (account.role !== "provider") {
    return json(
      {
        ok: false,
        code: "provider_account_required",
        error: "Only provider accounts can delete saved case note drafts.",
      },
      403,
    );
  }

  if (request.headers.get("x-careslink-intent") !== DELETE_INTENT) {
    return json(
      {
        ok: false,
        code: "delete_confirmation_required",
        error: "Delete confirmation is required.",
      },
      400,
    );
  }

  const { draftId } = await params;

  if (!NDIS_CASE_NOTE_DRAFT_ID_PATTERN.test(draftId)) {
    return json(
      { ok: false, code: "draft_not_found", error: "Draft not found." },
      404,
    );
  }

  try {
    const deleted = await getGeneratedMaterialDraftStore()
      .deleteGeneratedMaterialDraftByUser({
        draftId,
        userId: account.id,
        feature: "ndis_case_note",
      });

    if (!deleted) {
      return json(
        { ok: false, code: "draft_not_found", error: "Draft not found." },
        404,
      );
    }

    await tombstoneDeletedShadowSafely({
      ownerUserId: account.id,
      sourceDraftId: draftId,
      sourceCreatedAt: deleted.createdAt,
    });

    return json({ ok: true, draftId }, 200);
  } catch {
    return json(
      {
        ok: false,
        code: "service_unavailable",
        error: "Draft deletion is temporarily unavailable.",
      },
      503,
    );
  }
}

async function tombstoneDeletedShadowSafely(input: {
  ownerUserId: string;
  sourceDraftId: string;
  sourceCreatedAt: string;
}) {
  try {
    await tombstoneDeletedNdisShadowFromCanonical(input);
  } catch {
    // The legacy delete remains authoritative and must survive shadow cleanup.
  }
}

function json(payload: Record<string, unknown>, status: number) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
