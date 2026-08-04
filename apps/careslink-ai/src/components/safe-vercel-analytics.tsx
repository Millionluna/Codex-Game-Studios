"use client";

import {
  Analytics,
  type BeforeSendEvent,
} from "@vercel/analytics/next";

const CASE_NOTE_PATH = "/template-companion/ndis-case-note";
const CASE_NOTE_SOURCE = "ndis-case-note-download";
const CASE_NOTE_RESOURCE = "ndis-case-note-template";
const CASE_NOTE_CAMPAIGN = "ndis_case_note_ai_companion_v01";

const SAFE_SURFACE_MEDIUM_PAIRS = new Map([
  ["core_product_landing", "product_landing"],
  ["core_download_success", "post_download"],
]);

export function sanitizeVercelAnalyticsEvent(
  event: BeforeSendEvent,
): BeforeSendEvent | null {
  try {
    const input = new URL(event.url);
    const output = new URL(input.pathname, input.origin);
    const language = input.searchParams.get("lang");

    if (language === "en" || language === "zh-Hans") {
      output.searchParams.set("lang", language);
    }

    if (input.pathname === CASE_NOTE_PATH) {
      appendCaseNoteAttribution(input, output);
    }

    return {
      ...event,
      url: output.toString(),
    };
  } catch {
    return null;
  }
}

export function SafeVercelAnalytics() {
  return <Analytics beforeSend={sanitizeVercelAnalyticsEvent} />;
}

function appendCaseNoteAttribution(input: URL, output: URL) {
  if (
    input.searchParams.get("source") === CASE_NOTE_SOURCE &&
    input.searchParams.get("resourceSlug") === CASE_NOTE_RESOURCE &&
    input.searchParams.get("utm_source") === "careslink" &&
    input.searchParams.get("utm_campaign") === CASE_NOTE_CAMPAIGN
  ) {
    output.searchParams.set("source", CASE_NOTE_SOURCE);
    output.searchParams.set("resourceSlug", CASE_NOTE_RESOURCE);
    output.searchParams.set("utm_source", "careslink");
    output.searchParams.set("utm_campaign", CASE_NOTE_CAMPAIGN);
  }

  const surface = input.searchParams.get("surface");
  const medium = input.searchParams.get("utm_medium");

  if (surface && medium && SAFE_SURFACE_MEDIUM_PAIRS.get(surface) === medium) {
    output.searchParams.set("surface", surface);
    output.searchParams.set("utm_medium", medium);
  }
}
