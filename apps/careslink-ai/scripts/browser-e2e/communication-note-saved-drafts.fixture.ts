/** TEST ONLY. Metadata list for the single new local result; no content RPC. */
import "server-only";
import { assertAdmissionFixture } from "./communication-note-admission.fixture";
import { readSettlementResultBinding } from "./communication-note-settlement.fixture";
import { readReviewDatabaseList } from "./communication-note-self-review.fixture";
import { parseCommunicationNoteSavedDrafts, COMMUNICATION_NOTE_SAVED_DRAFTS_API } from "../../src/lib/communication-note-saved-drafts";
import { CaresLinkV1ContractError } from "../../src/lib/v1/shared-contracts";
import { CaresLinkV1ProductApiError } from "../../src/lib/v1/product-api-memory";

export async function listSettledDrafts(request: Request) {
  const root = assertAdmissionFixture();
  if (process.env.CARESLINK_LOCAL_SETTLED_LIST !== "EXACT_SETTLED_DOCUMENT_ONLY" ||
      process.env.CARESLINK_LOCAL_SETTLED_EDIT !== "EXACT_SETTLED_DOCUMENT_ONLY" ||
      process.env.CARESLINK_LOCAL_SETTLEMENT_DATABASE !== "OWNED_UNIX_SOCKET_ONLY") throw new Error("Local list unavailable");
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: {
    "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie, Authorization", "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow",
  } });
  const unavailable = () => reply({ status: "UNAVAILABLE" }, 503);
  const url = new URL(request.url);
  if (request.method !== "GET" || url.pathname !== COMMUNICATION_NOTE_SAVED_DRAFTS_API || url.search ||
      request.headers.get("host") !== "127.0.0.1:3395" || request.headers.get("sec-fetch-site") !== "same-origin" ||
      request.headers.has("authorization") || (request.headers.has("origin") && request.headers.get("origin") !== "http://127.0.0.1:3395")) return unavailable();
  try {
    // Fresh cookie principal and SQL session/owner validation precede binding lookup.
    const page = await readReviewDatabaseList(request);
    if (page.hasMore || page.nextCursor !== null) return unavailable(); // Never silently truncate the fixed local fixture.
    let canonicalId: string;
    try { canonicalId = (await readSettlementResultBinding(root)).canonicalId; }
    catch (error) {
      if ((error as { code?: string }).code === "ENOENT") return reply({ status: "AVAILABLE", documents: [] });
      throw error;
    }
    const matching = page.documents.filter(d => d.canonicalId === canonicalId);
    if (matching.length > 1) return unavailable();
    const documents = matching.filter(d => d.noteType === "communication" && d.deletedAt === null &&
      !["TOMBSTONED", "PURGED"].includes(d.lifecycleStatus) && d.currentRevisionId !== null).map(d => ({
        canonicalId: d.canonicalId, revisionNumber: d.currentRevisionNumber, sourceLocale: d.sourceLocale, updatedAt: d.updatedAt,
      }));
    return reply(parseCommunicationNoteSavedDrafts(200, { status: "AVAILABLE", documents }));
  } catch (error) {
    if ((error instanceof CaresLinkV1ContractError || error instanceof CaresLinkV1ProductApiError) &&
        ["AUTH_REQUIRED", "SESSION_REVOKED"].includes(error.code)) return reply({ status: "AUTH_REQUIRED" }, 401);
    return unavailable();
  }
}
