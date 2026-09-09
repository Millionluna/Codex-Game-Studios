import type { CommunicationNoteDocumentLocale } from "./communication-note-document-i18n";

/** Navigation context only: never accept a return URL, owner, or document ID. */
export function resolveCommunicationNotePointsLocale(
  value: string | string[] | undefined,
): CommunicationNoteDocumentLocale | undefined {
  return value === "en" || value === "zh-Hans" || value === "zh-Hant"
    ? value : undefined;
}

export function buildCommunicationNotePointsHref(locale: CommunicationNoteDocumentLocale) {
  return `/plan-and-usage?lang=${locale}&communicationLang=${locale}`;
}

export const COMMUNICATION_NOTE_POINTS_ENTRY = {
  en: "View Points",
  "zh-Hans": "查看 Points",
  "zh-Hant": "查看 Points",
} as const;
