import type {
  CaresLinkV1CleanedFactsByNoteType,
  CaresLinkV1Locale,
  CaresLinkV1NoteContent,
  CaresLinkV1SelfReviewStatus,
} from "./v1/shared-contracts";

export const COMMUNICATION_NOTE_DOCUMENT_API_PATH =
  "/api/ai-documents/communication-note/documents" as const;
export const COMMUNICATION_NOTE_DOCUMENT_PAGE_PATH =
  "/ai-documents/communication-note/documents" as const;

export type CommunicationNoteDocumentContent = CaresLinkV1NoteContent<
  CaresLinkV1CleanedFactsByNoteType["communication"]
>;

type CommunicationNoteAvailableDocumentBase = {
  status: "AVAILABLE";
  canonicalId: string;
  noteType: "communication";
  sourceLocale: CaresLinkV1Locale;
  currentRevisionId: string;
  revision: Readonly<{
    revisionId: string;
    revisionNumber: number;
    contentHash: string;
    createdAt: string;
    content: CommunicationNoteDocumentContent;
  }>;
  versions: ReadonlyArray<Readonly<{
    revisionId: string;
    revisionNumber: number;
    createdAt: string;
  }>>;
  draftNotice: "Draft – review required";
  saveState: "SERVER_ACKNOWLEDGED";
};

/** Historical revisions can never inherit a current revision's self-review. */
export type CommunicationNoteAvailableDocument = Readonly<
  CommunicationNoteAvailableDocumentBase &
    (
      | Readonly<{
          isCurrentRevision: true;
          selfReviewStatus: CaresLinkV1SelfReviewStatus;
        }>
      | Readonly<{
          isCurrentRevision: false;
          selfReviewStatus: "UNKNOWN";
        }>
    )
>;

export type CommunicationNoteDocumentResult =
  | CommunicationNoteAvailableDocument
  | Readonly<{ status: "EMPTY"; canonicalId: string; sourceLocale: CaresLinkV1Locale }>
  | Readonly<{ status: "AUTH_REQUIRED" }>
  | Readonly<{ status: "NOT_FOUND" }>
  | Readonly<{ status: "UNAVAILABLE" }>;

export function buildCommunicationNoteDocumentHref(input: Readonly<{
  canonicalId: string;
  locale: CaresLinkV1Locale;
  revisionId?: string;
}>) {
  const query = new URLSearchParams({ lang: input.locale });
  if (input.revisionId) query.set("revisionId", input.revisionId);
  return `${COMMUNICATION_NOTE_DOCUMENT_PAGE_PATH}/${encodeURIComponent(input.canonicalId)}?${query}`;
}

export function buildCommunicationNoteDocumentApiHref(input: Readonly<{
  canonicalId: string;
  revisionId?: string;
}>) {
  const path = `${COMMUNICATION_NOTE_DOCUMENT_API_PATH}/${encodeURIComponent(input.canonicalId)}`;
  return input.revisionId
    ? `${path}?revisionId=${encodeURIComponent(input.revisionId)}`
    : path;
}
