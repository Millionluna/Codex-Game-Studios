"use server";

import { redirect } from "next/navigation";
import { getAccessControlStore } from "../../../lib/access-control-store";
import type {
  AccessCodeType,
  EntityType,
  ReferralDirection,
} from "../../../lib/referral-profile-workspace";
import { resolveWorkspaceAccountFromSupabaseSession } from "../../../lib/referral-workspace-session";
import { createCareslinkServerSupabaseClient } from "../../../lib/supabase-server";

export async function submitAccessRequestAction(formData: FormData) {
  const supabase = await createCareslinkServerSupabaseClient();
  const account = await resolveWorkspaceAccountFromSupabaseSession(supabase);
  const redirectHref = getAccessPageRedirectHref(formData);

  if (!account || account.role !== "provider") {
    return redirect(addQueryParam(redirectHref, "request", "login-required"));
  }

  const store = getAccessControlStore();
  const activeCode = await store.getActiveAccessCodeByUser(account.id);

  if (activeCode) {
    return redirect(addQueryParam(redirectHref, "request", "already-active"));
  }

  const now = new Date().toISOString();
  const existingRequest = await store.getLatestAccessRequestByUser(account.id);
  const pendingRequest =
    existingRequest?.status === "queued" ? existingRequest : undefined;

  await store.saveAccessRequest({
    id: pendingRequest?.id ?? `access-request-${createRequestId()}`,
    userId: account.id,
    providerDraftId: getFormString(formData, "providerDraftId") || undefined,
    profileName: getFormString(formData, "profileName") || "Untitled provider profile",
    entityType: getEntityType(getFormString(formData, "entityType")),
    referralDirection: getReferralDirection(
      getFormString(formData, "referralDirection"),
    ),
    requestedCodeType: getAccessCodeType(
      getFormString(formData, "requestedCodeType"),
    ),
    sourceInvite: getFormString(formData, "sourceInvite") || undefined,
    expectedDailyQuota: getPositiveInteger(
      getFormString(formData, "expectedDailyQuota"),
    ),
    reason:
      getFormString(formData, "reason") ||
      "Access requested for guided materials.",
    abuseCostControlNote:
      getFormString(formData, "abuseCostControlNote") || undefined,
    status: "queued",
    createdAt: pendingRequest?.createdAt ?? now,
    updatedAt: now,
  });

  return redirect(addQueryParam(redirectHref, "request", "submitted"));
}

function getAccessPageRedirectHref(formData: FormData) {
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
    ? `/referral-workspace/access?${queryString}`
    : "/referral-workspace/access";
}

function addQueryParam(href: string, key: string, value: string) {
  const parsed = new URL(href, "https://careslink.local");

  parsed.searchParams.set(key, value);

  return `${parsed.pathname}${parsed.search}`;
}

function createRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getPositiveInteger(value: string) {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function getEntityType(value: string): EntityType {
  return value === "individual" ? "individual" : "organisation";
}

function getReferralDirection(value: string): ReferralDirection {
  if (value === "send" || value === "both") {
    return value;
  }

  return "receive";
}

function getAccessCodeType(value: string): AccessCodeType {
  if (
    value === "Referral Source Pilot" ||
    value === "Dual Role Pilot" ||
    value === "Internal Test" ||
    value === "Partner Batch"
  ) {
    return value;
  }

  return "Provider Pilot";
}
