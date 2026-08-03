import type { NdisCaseNoteCompanionAttribution } from "./ndis-case-note-companion-store";

export const NDIS_CASE_NOTE_COMPANION_PATH =
  "/template-companion/ndis-case-note";
export const NDIS_CASE_NOTE_COMPANION_SOURCE = "ndis-case-note-download";
export const NDIS_CASE_NOTE_RESOURCE_SLUG = "ndis-case-note-template";
export const NDIS_CASE_NOTE_UTM_CAMPAIGN =
  "ndis_case_note_ai_companion_v01";

export function getNdisCaseNoteCompanionAttribution(
  url: string | URL,
): NdisCaseNoteCompanionAttribution {
  const parsed = typeof url === "string" ? new URL(url) : url;

  return {
    source: NDIS_CASE_NOTE_COMPANION_SOURCE,
    resourceSlug: NDIS_CASE_NOTE_RESOURCE_SLUG,
    utmSource:
      parsed.searchParams.get("utm_source") === "careslink"
        ? "careslink"
        : undefined,
    utmMedium:
      parsed.searchParams.get("utm_medium") === "post_download"
        ? "post_download"
        : undefined,
    utmCampaign:
      parsed.searchParams.get("utm_campaign") ===
      NDIS_CASE_NOTE_UTM_CAMPAIGN
        ? NDIS_CASE_NOTE_UTM_CAMPAIGN
        : undefined,
    locale: parsed.searchParams.get("lang") === "zh-Hans" ? "zh-Hans" : "en",
  };
}

export function buildNdisCaseNoteCompanionHref({
  attribution,
  claimToken,
  autoSave,
}: {
  attribution: NdisCaseNoteCompanionAttribution;
  claimToken?: string;
  autoSave?: boolean;
}) {
  const search = new URLSearchParams({
    source: attribution.source,
    resourceSlug: attribution.resourceSlug,
    lang: attribution.locale,
  });

  if (attribution.utmSource) {
    search.set("utm_source", attribution.utmSource);
  }

  if (attribution.utmMedium) {
    search.set("utm_medium", attribution.utmMedium);
  }

  if (attribution.utmCampaign) {
    search.set("utm_campaign", attribution.utmCampaign);
  }

  if (claimToken) {
    search.set("claimToken", claimToken);
  }

  if (autoSave) {
    search.set("save", "1");
  }

  return `${NDIS_CASE_NOTE_COMPANION_PATH}?${search.toString()}`;
}

export function buildNdisCaseNoteCompanionAuthHref(
  authPath: "/auth/login" | "/auth/register",
  attribution: NdisCaseNoteCompanionAttribution,
) {
  const returnTo = buildNdisCaseNoteCompanionHref({ attribution });
  const search = new URLSearchParams({
    next: returnTo,
    returnTo,
    source: attribution.source,
    resourceSlug: attribution.resourceSlug,
    lang: attribution.locale,
  });

  if (attribution.utmSource) {
    search.set("utm_source", attribution.utmSource);
  }

  if (attribution.utmMedium) {
    search.set("utm_medium", attribution.utmMedium);
  }

  if (attribution.utmCampaign) {
    search.set("utm_campaign", attribution.utmCampaign);
  }

  return `${authPath}?${search.toString()}`;
}
