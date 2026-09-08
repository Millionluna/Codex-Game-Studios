/** TEST ONLY. Installs narrow local read ports in an owned copy, never in
 * the formal source runtime. The actual app handler owns the HTTP contract. */
import "server-only";
import { assertAdmissionFixture, principal, queryAdmissionFixture } from "./communication-note-admission.fixture";
import { readReviewDatabaseList } from "./communication-note-self-review.fixture";
import { createCommunicationNoteJobListRepository } from "../../src/lib/v1/communication-note-job-list-repository.server";
import { createCommunicationNoteWorkspaceHandler, type CommunicationNoteWorkspaceRuntime } from "../../src/lib/communication-note-workspace.server";

function guard(request: Request) {
  assertAdmissionFixture();
  if (process.env.CARESLINK_LOCAL_TASK_ENTRY !== "OWNER_TASK_LIST" || process.env.CARESLINK_LOCAL_TASK_ENTRY_JOB_ID !== undefined ||
    request.headers.get("host") !== "127.0.0.1:3395") throw new Error("Local workspace unavailable");
}
export const workspaceFixtureRuntime: CommunicationNoteWorkspaceRuntime = Object.freeze({
  resolvePrincipal: async request => { guard(request); return principal()(request); },
  createReaders: ({ principal: identity, request }) => {
    guard(request);
    const tasks = createCommunicationNoteJobListRepository({ principal: identity, query: queryAdmissionFixture });
    return Object.freeze({
      listTasks: tasks.list,
      listDocuments: page => readReviewDatabaseList(request, page, identity),
    });
  },
});
// Historical test import; the browser now copies the actual formal GET route.
export const readWorkspaceTask = createCommunicationNoteWorkspaceHandler({ enabled: () => true, runtime: workspaceFixtureRuntime });
