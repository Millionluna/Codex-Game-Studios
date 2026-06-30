"use server";

import { redirect } from "next/navigation";
import {
  approveAccessRequest,
  declineAccessRequest,
  getAccessControlStore,
} from "../../../lib/access-control-store";
import { resolveWorkspaceAccountFromSupabaseSession } from "../../../lib/referral-workspace-session";
import { createCareslinkServerSupabaseClient } from "../../../lib/supabase-server";

type ReviewDecision = "approve" | "decline";

export async function reviewAccessRequestAction(formData: FormData) {
  const requestId = getFormString(formData, "requestId");
  const decision = getReviewDecision(getFormString(formData, "decision"));
  const redirectHref = getAdminQueueRedirectHref(formData);
  const supabase = await createCareslinkServerSupabaseClient();
  const account = await resolveWorkspaceAccountFromSupabaseSession(supabase);

  if (!account || account.role !== "admin") {
    return redirect(addQueryParam(redirectHref, "review", "forbidden"));
  }

  if (!requestId || !decision) {
    return redirect(addQueryParam(redirectHref, "review", "invalid"));
  }

  const store = getAccessControlStore();

  if (decision === "approve") {
    await approveAccessRequest({
      requestId,
      store,
    });

    return redirect(addQueryParam(redirectHref, "review", "approved"));
  }

  await declineAccessRequest({
    requestId,
    store,
  });

  return redirect(addQueryParam(redirectHref, "review", "declined"));
}

function getAdminQueueRedirectHref(formData: FormData) {
  const queryParams = new URLSearchParams();
  const lang = getFormString(formData, "lang");

  if (lang) {
    queryParams.set("lang", lang);
  }

  const queryString = queryParams.toString();

  return queryString
    ? `/admin/access-requests?${queryString}`
    : "/admin/access-requests";
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

function getReviewDecision(value: string): ReviewDecision | undefined {
  if (value === "approve" || value === "decline") {
    return value;
  }

  return undefined;
}
