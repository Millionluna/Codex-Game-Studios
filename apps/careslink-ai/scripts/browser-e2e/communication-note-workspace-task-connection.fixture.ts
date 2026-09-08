/** TEST ONLY. Private credential delivery inside a freshly owned Unix fixture.
 * The source port owns physical cancellation; this adapter never grants roles. */
import "server-only";
import { assertReviewDatabaseFixture } from "./communication-note-self-review.fixture";
import { createTestOnlyCommunicationNoteTaskUnixReadPort } from "../../src/lib/communication-note-workspace-task-postgres.server";
import type { CaresLinkV1AuthenticatedPrincipal } from "../../src/lib/v1/transport-contract";
import type { CommunicationNoteWorkspaceTaskReadPort } from "../../src/lib/communication-note-workspace-durable.server";

export function createWorkspaceTaskReadPort(principal: CaresLinkV1AuthenticatedPrincipal): CommunicationNoteWorkspaceTaskReadPort {
  const root = assertReviewDatabaseFixture();
  const role = process.env.CARESLINK_LOCAL_TASK_READ_ROLE, password = process.env.CARESLINK_LOCAL_TASK_READ_PASSWORD;
  if (process.env.CARESLINK_LOCAL_TASK_ENTRY !== "OWNER_TASK_LIST" || !role || !password ||
    !/^careslink_v1_job_list_runtime_[a-f0-9]{16}$/.test(role) || !/^[A-Za-z0-9_-]{43}$/.test(password)) throw new Error("Local task connection unavailable");
  // This delivery expires, not its fixture-lifetime source password. The parent
  // removes the role and whole owned DB; no Hosted issuer/custody claim is made.
  const port = createTestOnlyCommunicationNoteTaskUnixReadPort({ projectRef: "abcdefghijklmnopqrst", principal,
    socket: root + "/pg/socket", port: 15437,
    credential: { role, password, deliveryExpiresAt: new Date(Date.now() + 60000).toISOString() } });
  return Object.freeze({ projectRef: port.projectRef, purpose: port.purpose, callerRole: port.callerRole,
    async execute(parameters, context) {
      assertReviewDatabaseFixture();
      let returned = false;
      try { const result = await port.execute(parameters, context); returned = true; return result; }
      finally { console.log(JSON.stringify({ fixture: "workspace-task-physical-read", returned,
        aborted: context.signal.aborted, connectionOwner: "DEDICATED_LIST_PORT", modelCalled: false })); }
    },
  });
}
