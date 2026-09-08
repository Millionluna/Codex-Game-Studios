/** TEST ONLY. One preallocated local admission, read through the existing
 * owner/session-checked purpose reader. No table access or task enumeration. */
import "server-only";
import { getLocalWorkspaceTaskId, readAdmissionTask } from "./communication-note-admission.fixture";
import { listSettledDrafts } from "./communication-note-saved-drafts.fixture";
import { loadCommunicationNoteGenerationJob } from "../../src/lib/communication-note-generation-job-client";
import { parseCommunicationNoteSavedDrafts } from "../../src/lib/communication-note-saved-drafts";

export async function readWorkspaceTask(request: Request) {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: {
    "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie, Authorization", "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow",
  } });
  try {
    const jobId = getLocalWorkspaceTaskId();
    if (!jobId) throw new Error("Local task entry unavailable");
    // Existing list guard validates transport and fresh cookie/session first.
    const listResponse = await listSettledDrafts(request);
    const list = parseCommunicationNoteSavedDrafts(listResponse.status, await listResponse.json());
    if (list.status !== "AVAILABLE") return reply(list, list.status === "AUTH_REQUIRED" ? 401 : 503);
    const read = await loadCommunicationNoteGenerationJob({ jobId, signal: request.signal,
      fetcher: async (path) => readAdmissionTask(new Request(new URL(String(path), request.url), {
        method: "GET", headers: request.headers, signal: request.signal,
      }), jobId),
    });
    // Reauthorization failure clears the entire surface, not just the task.
    if (read.status === "AUTH_REQUIRED") return reply({ status: "AUTH_REQUIRED" }, 401);
    if (read.status !== "AVAILABLE" && read.status !== "NOT_FOUND") throw new Error("Local task entry unavailable");
    const task = read.status === "AVAILABLE" ? { jobId: read.job.jobId, status: read.job.status,
      createdAt: read.job.createdAt, updatedAt: read.job.updatedAt } : null;
    return reply(parseCommunicationNoteSavedDrafts(200, { status: "AVAILABLE", documents: list.documents, task }, true));
  } catch { return reply({ status: "UNAVAILABLE" }, 503); }
}
