/** TEST ONLY. Real owner-scoped metadata list, no preallocated job locator.
 * Hosted route and caller activation remain absent. */
import "server-only";
import { assertAdmissionFixture, principal, queryAdmissionFixture } from "./communication-note-admission.fixture";
import { readReviewDatabaseList } from "./communication-note-self-review.fixture";
import { readCommunicationNoteDraftCatalog } from "../../src/lib/communication-note-draft-catalog.server";
import { createCommunicationNoteJobListRepository } from "../../src/lib/v1/communication-note-job-list-repository.server";
import { decodeCommunicationNoteTaskCursor } from "../../src/lib/communication-note-task-list";
import { parseCommunicationNoteDraftCursor, parseCommunicationNoteSavedDrafts } from "../../src/lib/communication-note-saved-drafts";
import { CaresLinkV1ContractError } from "../../src/lib/v1/shared-contracts";
import { CaresLinkV1ProductApiError } from "../../src/lib/v1/product-api-memory";

export async function readWorkspaceTask(request: Request) {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: {
    "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie, Authorization", "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow",
  } });
  try {
    assertAdmissionFixture();
    if (process.env.CARESLINK_LOCAL_TASK_ENTRY !== "OWNER_TASK_LIST" || process.env.CARESLINK_LOCAL_TASK_ENTRY_JOB_ID !== undefined)
      throw new Error("Local task list unavailable");
    const url = new URL(request.url);
    if (request.method !== "GET" || url.pathname !== "/api/ai-documents/communication-note/documents" ||
      request.headers.get("host") !== "127.0.0.1:3395" || request.headers.get("sec-fetch-site") !== "same-origin" ||
      request.headers.has("authorization") || (request.headers.has("origin") && request.headers.get("origin") !== "http://127.0.0.1:3395"))
      throw new Error("Local catalog transport unavailable");
    // Authenticate before parsing either cursor. Each SQL reader also checks
    // the current session; neither cursor can select another identity.
    const identity = await principal()(request);
    if (!identity.ok) return reply({ status: identity.status === 401 ? "AUTH_REQUIRED" : "UNAVAILABLE" }, identity.status === 401 ? 401 : 503);
    if (url.hash || [...url.searchParams.keys()].some(k => !["before", "draftAfter"].includes(k)) ||
      ["before", "draftAfter"].some(k => url.searchParams.getAll(k).length > 1))
      throw new Error("Invalid list position");
    const before = url.searchParams.has("before") ? decodeCommunicationNoteTaskCursor(url.searchParams.get("before")!) : null;
    const draftAfter = parseCommunicationNoteDraftCursor(url.searchParams.get("draftAfter"));
    if (request.signal.aborted) throw new Error("Aborted");
    const list = await readCommunicationNoteDraftCatalog(page => readReviewDatabaseList(request, page), draftAfter);
    if (request.signal.aborted) throw new Error("Aborted");
    const taskPage = await createCommunicationNoteJobListRepository({ principal: identity.principal, query: queryAdmissionFixture }).list(before);
    if (request.signal.aborted) throw new Error("Aborted");
    return reply(parseCommunicationNoteSavedDrafts(200, { status: "AVAILABLE", ...list, taskPage }, "MULTI", before, draftAfter));
  } catch (error) {
    if ((error instanceof CaresLinkV1ContractError || error instanceof CaresLinkV1ProductApiError) &&
      ["AUTH_REQUIRED", "SESSION_REVOKED"].includes(error.code)) return reply({ status: "AUTH_REQUIRED" }, 401);
    return reply({ status: "UNAVAILABLE" }, 503);
  }
}
