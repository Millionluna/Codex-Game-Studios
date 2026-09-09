import "server-only";

import type {
  CommunicationNoteDocumentContent,
  CommunicationNoteDocumentResult,
} from "./communication-note-document-contract";
import { CaresLinkV1ProductApiError } from "./v1/product-api-memory";
import {
  CARESLINK_V1_DEFAULT_PRODUCT_API_RUNTIME,
  type CaresLinkV1ProductApiRuntime,
} from "./v1/product-api-runtime.server";
import {
  CaresLinkV1ContractError,
  validateCaresLinkV1CleanedFacts,
} from "./v1/shared-contracts";
import type { CaresLinkV1GetDocumentResponse } from "./v1/transport-contract";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AUTH_REQUIRED = { status: "AUTH_REQUIRED" } as const;
const NOT_FOUND = { status: "NOT_FOUND" } as const;
const UNAVAILABLE = { status: "UNAVAILABLE" } as const;

/**
 * Owner-scoped result recovery. This is a read, independent of generation and
 * Points. The existing Product API remains responsible for active-session,
 * target, document-read capability, owner/RLS and aggregate validation.
 * No facts are persisted in browser storage and no job is resubmitted.
 */
export async function readCommunicationNoteDocument(
  request: Request,
  documentId: string,
  runtime: CaresLinkV1ProductApiRuntime = CARESLINK_V1_DEFAULT_PRODUCT_API_RUNTIME,
): Promise<CommunicationNoteDocumentResult> {
  try {
    // Select the existing DOCUMENT_DETAIL capability, never a write capability.
    // Cookies still come from the real Next.js request store; the copied headers
    // preserve explicit credential precedence in the existing auth resolver.
    const apiRequest = new Request(
      `https://careslink.internal/v1/documents/${encodeURIComponent(documentId)}`,
      { method: "GET", headers: request.headers, signal: request.signal },
    );
    const auth = await runtime.resolveAuth(apiRequest);
    if (!auth.ok) {
      return ["auth_required", "invalid_session", "session_revoked"].includes(auth.reason)
        ? AUTH_REQUIRED
        : UNAVAILABLE;
    }
    if (auth.identity.source !== "cookie") return AUTH_REQUIRED;
    if (!UUID.test(auth.identity.userId) || !UUID.test(auth.identity.sessionId)) {
      return UNAVAILABLE;
    }

    // Authenticate before interpreting document/revision identifiers.
    const query = new URL(request.url).searchParams;
    const revisions = query.getAll("revisionId");
    if (
      !UUID.test(documentId) ||
      [...query.keys()].some((key) => key !== "revisionId") ||
      revisions.length > 1 ||
      (revisions.length === 1 && !UUID.test(revisions[0]))
    ) {
      return NOT_FOUND;
    }
    const canonicalId = documentId.toLowerCase();
    const revisionId = revisions[0]?.toLowerCase();
    const api = await runtime.getProductApi({
      userId: auth.identity.userId.toLowerCase(),
      sessionId: auth.identity.sessionId.toLowerCase(),
      transport: "COOKIE",
    }, apiRequest);
    if (!api) return UNAVAILABLE;

    return projectDocument(await api.getDocument(canonicalId), canonicalId, revisionId);
  } catch (error) {
    if (error instanceof CaresLinkV1ProductApiError || error instanceof CaresLinkV1ContractError) {
      if (error.code === "NOT_FOUND") return NOT_FOUND;
      if (error.code === "AUTH_REQUIRED" || error.code === "SESSION_REVOKED") return AUTH_REQUIRED;
    }
    // Never return backend details, facts, tokens or an older cached document.
    return UNAVAILABLE;
  }
}

function projectDocument(
  snapshot: CaresLinkV1GetDocumentResponse,
  canonicalId: string,
  requestedRevisionId?: string,
): CommunicationNoteDocumentResult {
  const { document, revisions } = snapshot;
  if (document.canonicalId !== canonicalId) return UNAVAILABLE;
  if (
    document.noteType !== "communication" ||
    document.deletedAt !== null ||
    document.lifecycleStatus === "TOMBSTONED" ||
    document.lifecycleStatus === "PURGED"
  ) return NOT_FOUND;

  // Defend selection/binding even with a replaced Product API implementation.
  if (
    revisions.some((revision) => revision.canonicalId !== canonicalId) ||
    new Set(revisions.map((revision) => revision.revisionId)).size !== revisions.length ||
    new Set(revisions.map((revision) => revision.revisionNumber)).size !== revisions.length
  ) return UNAVAILABLE;

  if (document.currentRevisionId === null) {
    if (revisions.length !== 0 || document.currentRevisionNumber !== 0) return UNAVAILABLE;
    return requestedRevisionId ? NOT_FOUND : {
      status: "EMPTY", canonicalId, sourceLocale: document.sourceLocale,
    };
  }
  const current = revisions.find((revision) => revision.revisionId === document.currentRevisionId);
  if (
    !current ||
    current.revisionNumber !== document.currentRevisionNumber ||
    revisions.some(
      ({ revisionNumber }) =>
        revisionNumber > document.currentRevisionNumber,
    )
  ) return UNAVAILABLE;
  const selected = requestedRevisionId
    ? revisions.find((revision) => revision.revisionId === requestedRevisionId)
    : current;
  if (!selected) return NOT_FOUND;
  const isCurrentRevision = selected.revisionId === current.revisionId;
  const content: CommunicationNoteDocumentContent = {
    ...structuredClone(selected.content),
    // A replacement Product API must not be able to project another Note
    // type's facts through this Communication-only surface.
    factsSummary: validateCaresLinkV1CleanedFacts(
      "communication",
      selected.content.factsSummary,
    ),
  };

  const reviewBinding = isCurrentRevision
    ? {
        isCurrentRevision: true as const,
        selfReviewStatus: snapshot.selfReviewStatus,
      }
    : {
        isCurrentRevision: false as const,
        selfReviewStatus: "UNKNOWN" as const,
      };

  return {
    status: "AVAILABLE",
    canonicalId,
    noteType: "communication",
    sourceLocale: document.sourceLocale,
    currentRevisionId: current.revisionId,
    revision: {
      revisionId: selected.revisionId,
      revisionNumber: selected.revisionNumber,
      contentHash: selected.contentHash,
      createdAt: selected.createdAt,
      content,
    },
    versions: [...revisions].sort((a, b) => b.revisionNumber - a.revisionNumber).map((revision) => ({
      revisionId: revision.revisionId,
      revisionNumber: revision.revisionNumber,
      createdAt: revision.createdAt,
    })),
    ...reviewBinding,
    draftNotice: "Draft – review required",
    saveState: "SERVER_ACKNOWLEDGED",
  };
}

export async function handleCommunicationNoteDocumentRead(
  request: Request,
  documentId: string,
  runtime?: CaresLinkV1ProductApiRuntime,
) {
  const result = await readCommunicationNoteDocument(request, documentId, runtime);
  const status = { AVAILABLE: 200, EMPTY: 200, AUTH_REQUIRED: 401, NOT_FOUND: 404, UNAVAILABLE: 503 }[result.status];
  return Response.json(result, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Vary": "Cookie, Authorization",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
