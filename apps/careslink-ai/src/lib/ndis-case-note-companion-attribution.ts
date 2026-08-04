export const NDIS_CASE_NOTE_COMPANION_SOURCE = "ndis-case-note-download";
export const NDIS_CASE_NOTE_RESOURCE_SLUG = "ndis-case-note-template";
export const NDIS_CASE_NOTE_UTM_SOURCE = "careslink";
export const NDIS_CASE_NOTE_UTM_CAMPAIGN =
  "ndis_case_note_ai_companion_v01";

export type NdisCaseNoteCompanionSurface =
  | "core_product_landing"
  | "core_download_success";

export type NdisCaseNoteCompanionMedium =
  | "product_landing"
  | "post_download";

export function getSafeNdisCaseNoteAttributionPair(
  surface: string | null | undefined,
  medium: string | null | undefined,
): {
  surface?: NdisCaseNoteCompanionSurface;
  utmMedium?: NdisCaseNoteCompanionMedium;
} {
  if (
    surface === "core_product_landing" &&
    medium === "product_landing"
  ) {
    return { surface, utmMedium: medium };
  }

  if (
    surface === "core_download_success" &&
    medium === "post_download"
  ) {
    return { surface, utmMedium: medium };
  }

  return {};
}
