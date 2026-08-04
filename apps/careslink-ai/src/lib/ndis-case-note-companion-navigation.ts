import type { NdisCaseNoteCompanionAttribution } from "./ndis-case-note-companion-store";
import {
  getSafeNdisCaseNoteAttributionPair,
  NDIS_CASE_NOTE_COMPANION_SOURCE,
  NDIS_CASE_NOTE_RESOURCE_SLUG,
  NDIS_CASE_NOTE_UTM_CAMPAIGN,
  NDIS_CASE_NOTE_UTM_SOURCE,
} from "./ndis-case-note-companion-attribution";

export {
  NDIS_CASE_NOTE_COMPANION_SOURCE,
  NDIS_CASE_NOTE_RESOURCE_SLUG,
  NDIS_CASE_NOTE_UTM_CAMPAIGN,
} from "./ndis-case-note-companion-attribution";

export const NDIS_CASE_NOTE_COMPANION_PATH =
  "/template-companion/ndis-case-note";

export function getNdisCaseNoteCompanionAttribution(
  url: string | URL,
): NdisCaseNoteCompanionAttribution {
  const parsed = typeof url === "string" ? new URL(url) : url;
  const attributionPair = getSafeNdisCaseNoteAttributionPair(
    parsed.searchParams.get("surface"),
    parsed.searchParams.get("utm_medium"),
  );

  return {
    source: NDIS_CASE_NOTE_COMPANION_SOURCE,
    resourceSlug: NDIS_CASE_NOTE_RESOURCE_SLUG,
    utmSource:
      parsed.searchParams.get("utm_source") === NDIS_CASE_NOTE_UTM_SOURCE
        ? NDIS_CASE_NOTE_UTM_SOURCE
        : undefined,
    surface: attributionPair.surface,
    utmMedium: attributionPair.utmMedium,
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
  const attributionPair = getSafeNdisCaseNoteAttributionPair(
    attribution.surface,
    attribution.utmMedium,
  );
  const search = new URLSearchParams({
    source: NDIS_CASE_NOTE_COMPANION_SOURCE,
    resourceSlug: NDIS_CASE_NOTE_RESOURCE_SLUG,
    lang: attribution.locale,
  });

  appendSafeAttribution(search, attribution, attributionPair);

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
  const attributionPair = getSafeNdisCaseNoteAttributionPair(
    attribution.surface,
    attribution.utmMedium,
  );
  const search = new URLSearchParams({
    next: returnTo,
    returnTo,
    source: NDIS_CASE_NOTE_COMPANION_SOURCE,
    resourceSlug: NDIS_CASE_NOTE_RESOURCE_SLUG,
    lang: attribution.locale,
  });

  appendSafeAttribution(search, attribution, attributionPair);

  return `${authPath}?${search.toString()}`;
}

export function getSafeNdisCaseNoteCompanionReturnHref(url: string | URL) {
  const parsed = typeof url === "string" ? new URL(url, "https://careslink.local") : url;
  const attribution = getNdisCaseNoteCompanionAttribution(parsed);
  const attributionPair = getSafeNdisCaseNoteAttributionPair(
    attribution.surface,
    attribution.utmMedium,
  );
  const search = new URLSearchParams({
    source: NDIS_CASE_NOTE_COMPANION_SOURCE,
    resourceSlug: NDIS_CASE_NOTE_RESOURCE_SLUG,
  });
  const locale = parsed.searchParams.get("lang");

  if (locale === "en" || locale === "zh-Hans") {
    search.set("lang", locale);
  }

  appendSafeAttribution(search, attribution, attributionPair);

  return `${NDIS_CASE_NOTE_COMPANION_PATH}?${search.toString()}`;
}

function appendSafeAttribution(
  search: URLSearchParams,
  attribution: NdisCaseNoteCompanionAttribution,
  pair: ReturnType<typeof getSafeNdisCaseNoteAttributionPair>,
) {
  if (attribution.utmSource === NDIS_CASE_NOTE_UTM_SOURCE) {
    search.set("utm_source", NDIS_CASE_NOTE_UTM_SOURCE);
  }

  if (pair.surface) {
    search.set("surface", pair.surface);
  }

  if (pair.utmMedium) {
    search.set("utm_medium", pair.utmMedium);
  }

  if (attribution.utmCampaign === NDIS_CASE_NOTE_UTM_CAMPAIGN) {
    search.set("utm_campaign", NDIS_CASE_NOTE_UTM_CAMPAIGN);
  }
}
