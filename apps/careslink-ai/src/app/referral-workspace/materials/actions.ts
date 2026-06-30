"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getGeneratedMaterialDraftStore,
  updateGeneratedMaterialDraftStatus,
  type GeneratedMaterialDraftStatus,
} from "../../../lib/generated-material-draft-store";
import {
  createGeneratedMaterialEventRecord,
  getGeneratedMaterialEventStore,
} from "../../../lib/generated-material-event-store";
import { resolveWorkspaceAccountFromSupabaseSession } from "../../../lib/referral-workspace-session";
import { createCareslinkServerSupabaseClient } from "../../../lib/supabase-server";

const MATERIAL_DRAFT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,180}$/;

export async function updateGeneratedMaterialDraftStatusAction(
  formData: FormData,
) {
  const redirectHref = getMaterialsRedirectHref(formData);
  const materialDraftId = getMaterialDraftId(
    getFormString(formData, "materialDraftId"),
  );
  const status = getGeneratedDraftStatus(getFormString(formData, "status"));
  const supabase = await createCareslinkServerSupabaseClient();
  const account = await resolveWorkspaceAccountFromSupabaseSession(supabase);

  if (!account || account.role !== "provider") {
    return redirect(addQueryParam(redirectHref, "materialStatus", "login-required"));
  }

  if (!materialDraftId || !status) {
    return redirect(addQueryParam(redirectHref, "materialStatus", "invalid"));
  }

  const updated = await updateGeneratedMaterialDraftStatus({
    draftId: materialDraftId,
    userId: account.id,
    status,
    store: getGeneratedMaterialDraftStore(),
  });

  if (!updated) {
    return redirect(addQueryParam(redirectHref, "materialStatus", "not-found"));
  }

  await getGeneratedMaterialEventStore().saveGeneratedMaterialEvent(
    createGeneratedMaterialEventRecord({
      userId: account.id,
      providerDraftId: updated.providerDraftId,
      generatedMaterialDraftId: updated.id,
      feature: updated.feature,
      eventType: status === "reviewed" ? "mark_reviewed" : "archive",
    }),
  );

  revalidatePath("/referral-workspace/materials");

  return redirect(addQueryParam(redirectHref, "materialStatus", status));
}

function getMaterialsRedirectHref(formData: FormData) {
  const queryParams = new URLSearchParams();
  const lang = getFormString(formData, "lang");
  const source = getFormString(formData, "source");
  const draftId = getFormString(formData, "draftId");

  if (lang) {
    queryParams.set("lang", lang);
  }

  if (source) {
    queryParams.set("source", source);
  }

  if (draftId) {
    queryParams.set("draftId", draftId);
  }

  const queryString = queryParams.toString();

  return queryString
    ? `/referral-workspace/materials?${queryString}`
    : "/referral-workspace/materials";
}

function addQueryParam(href: string, key: string, value: string) {
  const parsed = new URL(href, "https://careslink.local");

  parsed.searchParams.set(key, value);

  return `${parsed.pathname}${parsed.search}`;
}

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getMaterialDraftId(value: string) {
  return MATERIAL_DRAFT_ID_PATTERN.test(value) ? value : undefined;
}

function getGeneratedDraftStatus(
  value: string,
): GeneratedMaterialDraftStatus | undefined {
  if (value === "reviewed" || value === "archived") {
    return value;
  }

  return undefined;
}
