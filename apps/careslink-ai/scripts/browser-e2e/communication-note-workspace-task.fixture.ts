/** TEST ONLY. Installs narrow local read ports in an owned copy, never in
 * the formal source runtime. The actual app handler owns the HTTP contract. */
import "server-only";
import { assertReviewDatabaseFixture, createReviewDatabaseAuthClient } from "./communication-note-self-review.fixture";
import { createWorkspaceTaskReadPort } from "./communication-note-workspace-task-connection.fixture";
import { createCommunicationNoteWorkspaceHandler, type CommunicationNoteWorkspaceRuntime } from "../../src/lib/communication-note-workspace.server";
import { createCommunicationNoteWorkspaceDurableRuntime } from "../../src/lib/communication-note-workspace-durable.server";

function guard(request: Request) {
  assertReviewDatabaseFixture();
  if (process.env.CARESLINK_LOCAL_TASK_ENTRY !== "OWNER_TASK_LIST" || process.env.CARESLINK_LOCAL_TASK_ENTRY_JOB_ID !== undefined ||
    request.headers.get("host") !== "127.0.0.1:3395") throw new Error("Local workspace unavailable");
}
// Synthetic configuration tests the real guard; it is not Hosted evidence and
// is not written into process.env. Physical access stays in the owned fixture.
const REF = "abcdefghijklmnopqrst";
const durable = createCommunicationNoteWorkspaceDurableRuntime({
  env: { CARESLINK_COMMUNICATION_NOTE_WORKSPACE_ENABLED: "true", CARESLINK_V1_PRODUCT_API_ENABLED: "true",
    CARESLINK_COMMUNICATION_NOTE_WORKSPACE_EXPECTED_SUPABASE_REF: REF,
    CARESLINK_COMMUNICATION_NOTE_WORKSPACE_EXPECTED_VERCEL_PROJECT_ID: "prj_1234567890abcdef",
    VERCEL: "1", VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "preview", VERCEL_PROJECT_ID: "prj_1234567890abcdef",
    SUPABASE_URL: `https://${REF}.supabase.co`, NEXT_PUBLIC_SUPABASE_URL: `https://${REF}.supabase.co`,
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_1234567890abcdef", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_1234567890abcdef" },
  createCookieClient: async () => { assertReviewDatabaseFixture(); return createReviewDatabaseAuthClient(); },
  resolveTaskRead: async ({ principal }) => createWorkspaceTaskReadPort(principal),
})!;
export const workspaceFixtureRuntime: CommunicationNoteWorkspaceRuntime = Object.freeze({
  resolvePrincipal: async request => { guard(request); return durable.resolvePrincipal(request); },
  createReaders: input => { guard(input.request); return durable.createReaders(input); },
});
// Historical test import; the browser now copies the actual formal GET route.
export const readWorkspaceTask = createCommunicationNoteWorkspaceHandler({ enabled: () => true, runtime: workspaceFixtureRuntime });
