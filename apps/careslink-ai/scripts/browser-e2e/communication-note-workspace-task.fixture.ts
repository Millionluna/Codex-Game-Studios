/** TEST ONLY. Real owner-scoped metadata list, no preallocated job locator.
 * Hosted route and caller activation remain absent. */
import "server-only";
import { assertAdmissionFixture, principal, queryAdmissionFixture } from "./communication-note-admission.fixture";
import { listSettledDrafts } from "./communication-note-saved-drafts.fixture";
import { createCommunicationNoteJobListRepository } from "../../src/lib/v1/communication-note-job-list-repository.server";
import { decodeCommunicationNoteTaskCursor } from "../../src/lib/communication-note-task-list";
import { parseCommunicationNoteSavedDrafts } from "../../src/lib/communication-note-saved-drafts";
import { CaresLinkV1ContractError } from "../../src/lib/v1/shared-contracts";

export async function readWorkspaceTask(request: Request) {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: {
    "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie, Authorization", "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow",
  } });
  try {
    assertAdmissionFixture();
    if (process.env.CARESLINK_LOCAL_TASK_ENTRY !== "OWNER_TASK_LIST" || process.env.CARESLINK_LOCAL_TASK_ENTRY_JOB_ID !== undefined)
      throw new Error("Local task list unavailable");
    const url = new URL(request.url), listUrl = new URL(url);
    listUrl.search = "";
    // Existing list guard checks the fixed route and same-origin transport.
    // Resolve a fresh cookie principal again for the purpose reader.
    const listResponse = await listSettledDrafts(new Request(listUrl, request));
    const list = parseCommunicationNoteSavedDrafts(listResponse.status, await listResponse.json());
    if (list.status !== "AVAILABLE") return reply(list, list.status === "AUTH_REQUIRED" ? 401 : 503);
    const identity = await principal()(request);
    if (!identity.ok) return reply({ status: identity.status === 401 ? "AUTH_REQUIRED" : "UNAVAILABLE" }, identity.status === 401 ? 401 : 503);
    if (url.hash || url.searchParams.size > 1 || [...url.searchParams.keys()].some(k => k !== "before"))
      throw new Error("Invalid list position");
    const before = url.searchParams.has("before") ? decodeCommunicationNoteTaskCursor(url.searchParams.get("before")!) : null;
    if (request.signal.aborted) throw new Error("Aborted");
    const taskPage = await createCommunicationNoteJobListRepository({ principal: identity.principal, query: queryAdmissionFixture }).list(before);
    if (request.signal.aborted) throw new Error("Aborted");
    return reply(parseCommunicationNoteSavedDrafts(200, { status: "AVAILABLE", documents: list.documents, taskPage }, "MULTI", before));
  } catch (error) {
    if (error instanceof CaresLinkV1ContractError && error.code === "SESSION_REVOKED") return reply({ status: "AUTH_REQUIRED" }, 401);
    return reply({ status: "UNAVAILABLE" }, 503);
  }
}
