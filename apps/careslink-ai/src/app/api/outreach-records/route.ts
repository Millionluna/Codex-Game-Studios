import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getGeneratedMaterialDraftStore } from "@/lib/generated-material-draft-store";
import {
  createOutreachRecord,
  getOutreachStore,
  type OutreachChannel,
  type OutreachRecord,
  type OutreachRecipientRole,
  type OutreachStatus,
} from "@/lib/outreach-store";
import { resolveWorkspaceAccountFromSupabaseSession } from "@/lib/referral-workspace-session";
import { createCareslinkServerSupabaseClient } from "@/lib/supabase-server";

const MATERIAL_DRAFT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,180}$/;
const PROVIDER_DRAFT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,180}$/;
const OUTREACH_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,220}$/;

export async function POST(request: Request) {
  const formData = await request.formData();
  const redirectHref = getOutreachRedirectHref(formData);
  const supabase = await createCareslinkServerSupabaseClient();
  const account = await resolveWorkspaceAccountFromSupabaseSession(supabase);

  if (!account || account.role !== "provider") {
    return redirectToStatus(request, redirectHref, "login-required");
  }

  if (getFormString(formData, "mode") === "update") {
    return updateOutreachRecord({
      request,
      formData,
      redirectHref,
      userId: account.id,
    });
  }

  const generatedMaterialDraftId = getMaterialDraftId(
    getFormString(formData, "generatedMaterialDraftId"),
  );
  const submittedProviderDraftId = getProviderDraftId(
    getFormString(formData, "providerDraftId"),
  );
  const recipientName = getFormString(formData, "recipientName");

  if (!recipientName) {
    return redirectToStatus(request, redirectHref, "missing-recipient");
  }

  let providerDraftId = submittedProviderDraftId;

  if (generatedMaterialDraftId) {
    const materialDraft =
      await getGeneratedMaterialDraftStore().getGeneratedMaterialDraft(
        generatedMaterialDraftId,
      );

    if (!materialDraft || materialDraft.userId !== account.id) {
      return redirectToStatus(request, redirectHref, "not-found");
    }

    providerDraftId = materialDraft.providerDraftId ?? providerDraftId;
  }

  await getOutreachStore().saveOutreach(
    createOutreachRecord({
      userId: account.id,
      providerDraftId,
      generatedMaterialDraftId,
      recipientName,
      organisation: getFormString(formData, "organisation"),
      roleType: getRoleType(getFormString(formData, "roleType")),
      channel: getChannel(getFormString(formData, "channel")),
      status: getStatus(getFormString(formData, "status")),
      lastContactedAt: getFormString(formData, "lastContactedAt"),
      nextFollowUpAt: getFormString(formData, "nextFollowUpAt"),
      notes: getFormString(formData, "notes"),
    }),
  );

  revalidatePath("/referral-workspace");
  revalidatePath("/referral-workspace/referral-pack");
  revalidatePath("/referral-workspace/outreach");

  return redirectToStatus(request, redirectHref, "saved");
}

async function updateOutreachRecord({
  request,
  formData,
  redirectHref,
  userId,
}: {
  request: Request;
  formData: FormData;
  redirectHref: string;
  userId: string;
}) {
  const outreachRecordId = getOutreachId(
    getFormString(formData, "outreachRecordId"),
  );

  if (!outreachRecordId) {
    return redirectToStatus(request, redirectHref, "not-found");
  }

  const existing = await getOutreachStore().getOutreach(outreachRecordId);

  if (!existing || existing.userId !== userId) {
    return redirectToStatus(request, redirectHref, "not-found");
  }

  await getOutreachStore().saveOutreach(
    mergeOutreachUpdate(existing, formData),
  );

  revalidatePath("/referral-workspace");
  revalidatePath("/referral-workspace/referral-pack");
  revalidatePath("/referral-workspace/outreach");

  return redirectToStatus(request, redirectHref, "updated");
}

function redirectToStatus(request: Request, href: string, status: string) {
  return NextResponse.redirect(
    new URL(addQueryParam(href, "outreachStatus", status), request.url),
    303,
  );
}

function getOutreachRedirectHref(formData: FormData) {
  const fallbackPath =
    getFormString(formData, "redirectTo") || "/referral-workspace/outreach";
  const parsed = new URL(fallbackPath, "https://careslink.local");
  const lang = getFormString(formData, "lang");
  const source = getFormString(formData, "source");
  const draftId = getFormString(formData, "draftId");

  if (lang) {
    parsed.searchParams.set("lang", lang);
  }

  if (source) {
    parsed.searchParams.set("source", source);
  }

  if (draftId) {
    parsed.searchParams.set("draftId", draftId);
  }

  return `${parsed.pathname}${parsed.search}`;
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

function getProviderDraftId(value: string) {
  return PROVIDER_DRAFT_ID_PATTERN.test(value) ? value : undefined;
}

function getOutreachId(value: string) {
  return OUTREACH_ID_PATTERN.test(value) ? value : undefined;
}

function mergeOutreachUpdate(
  existing: OutreachRecord,
  formData: FormData,
): OutreachRecord {
  const now = new Date().toISOString();

  return {
    ...existing,
    status: getStatus(getFormString(formData, "status")),
    lastContactedAt: getFormString(formData, "lastContactedAt"),
    nextFollowUpAt: getFormString(formData, "nextFollowUpAt"),
    notes: getFormString(formData, "notes"),
    updatedAt: now,
  };
}

function getRoleType(value: string): OutreachRecipientRole {
  if (
    value === "support_coordinator" ||
    value === "provider" ||
    value === "community_group" ||
    value === "case_manager" ||
    value === "family_contact"
  ) {
    return value;
  }

  return "other";
}

function getChannel(value: string): OutreachChannel {
  if (
    value === "wechat" ||
    value === "whatsapp" ||
    value === "email" ||
    value === "phone" ||
    value === "in_person"
  ) {
    return value;
  }

  return "other";
}

function getStatus(value: string): OutreachStatus {
  if (
    value === "to_send" ||
    value === "replied" ||
    value === "follow_up" ||
    value === "not_suitable"
  ) {
    return value;
  }

  return "sent";
}
