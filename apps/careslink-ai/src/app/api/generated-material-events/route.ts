import { NextResponse } from "next/server";
import { getGeneratedMaterialDraftStore } from "@/lib/generated-material-draft-store";
import {
  createGeneratedMaterialEventRecord,
  getGeneratedMaterialEventStore,
  type GeneratedMaterialEventType,
} from "@/lib/generated-material-event-store";
import { resolveWorkspaceAccountFromSupabaseSession } from "@/lib/referral-workspace-session";
import { createCareslinkServerSupabaseClient } from "@/lib/supabase-server";

type GeneratedMaterialEventPostBody = {
  generatedMaterialDraftId?: unknown;
  eventType?: unknown;
  fieldKey?: unknown;
};

const MATERIAL_DRAFT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,180}$/;
const FIELD_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/;

export async function POST(request: Request) {
  let body: GeneratedMaterialEventPostBody;

  try {
    body = (await request.json()) as GeneratedMaterialEventPostBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const generatedMaterialDraftId = getMaterialDraftId(
    body.generatedMaterialDraftId,
  );
  const eventType = getCopyEventType(body.eventType);
  const fieldKey = getOptionalFieldKey(body.fieldKey);

  if (!generatedMaterialDraftId || !eventType || fieldKey === null) {
    return NextResponse.json(
      { ok: false, error: "Invalid generated material event" },
      { status: 400 },
    );
  }

  if (eventType === "copy_field" && !fieldKey) {
    return NextResponse.json(
      { ok: false, error: "fieldKey is required for copy_field events" },
      { status: 400 },
    );
  }

  const supabase = await createCareslinkServerSupabaseClient();
  const account = await resolveWorkspaceAccountFromSupabaseSession(supabase);

  if (!account) {
    return NextResponse.json(
      { ok: false, error: "Login required" },
      { status: 401 },
    );
  }

  if (account.role !== "provider") {
    return NextResponse.json(
      { ok: false, error: "Only provider accounts can record material events" },
      { status: 403 },
    );
  }

  const materialDraft =
    await getGeneratedMaterialDraftStore().getGeneratedMaterialDraft(
      generatedMaterialDraftId,
    );

  if (!materialDraft) {
    return NextResponse.json(
      { ok: false, error: "Generated material draft not found" },
      { status: 404 },
    );
  }

  if (materialDraft.userId !== account.id) {
    return NextResponse.json(
      { ok: false, error: "Generated material draft does not belong to this account" },
      { status: 403 },
    );
  }

  const event = await getGeneratedMaterialEventStore().saveGeneratedMaterialEvent(
    createGeneratedMaterialEventRecord({
      userId: account.id,
      providerDraftId: materialDraft.providerDraftId,
      generatedMaterialDraftId: materialDraft.id,
      feature: materialDraft.feature,
      eventType,
      fieldKey,
    }),
  );

  return NextResponse.json({ ok: true, eventId: event.id });
}

function getMaterialDraftId(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const draftId = value.trim();

  return MATERIAL_DRAFT_ID_PATTERN.test(draftId) ? draftId : undefined;
}

function getCopyEventType(value: unknown): GeneratedMaterialEventType | undefined {
  if (value === "copy_all" || value === "copy_field") {
    return value;
  }

  return undefined;
}

function getOptionalFieldKey(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    return null;
  }

  const fieldKey = value.trim();

  return FIELD_KEY_PATTERN.test(fieldKey) ? fieldKey : null;
}
