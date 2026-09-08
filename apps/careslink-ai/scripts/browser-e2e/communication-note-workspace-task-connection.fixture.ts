/** TEST ONLY. Bind the real default-off lifecycle to owned parent IPC and PG16.
 * No operator in Next, hosted attestation or fixture-lifetime DB password. */
import "server-only";
import { assertReviewDatabaseFixture } from "./communication-note-self-review.fixture";
import { requestTaskCredential } from "./communication-note-task-credential.fixture";
import { taskListRecord } from "../../src/lib/communication-note-task-list";
import { createCommunicationNoteTaskLeaseReadPort, type CommunicationNoteTaskLeaseCredential } from "../../src/lib/communication-note-workspace-task-lease.server";
import { createTestOnlyCommunicationNoteTaskUnixReadPort } from "../../src/lib/communication-note-workspace-task-postgres.server";
import type { CaresLinkV1AuthenticatedPrincipal } from "../../src/lib/v1/transport-contract";
import type { CommunicationNoteWorkspaceTaskReadPort } from "../../src/lib/communication-note-workspace-durable.server";

export function createWorkspaceTaskReadPort(principal: CaresLinkV1AuthenticatedPrincipal): CommunicationNoteWorkspaceTaskReadPort {
  const root = assertReviewDatabaseFixture(), capability = process.env.CARESLINK_LOCAL_TASK_BROKER_CAPABILITY;
  if (process.env.CARESLINK_LOCAL_TASK_ENTRY !== "OWNER_TASK_LIST" || !capability || capability.length !== 43 ||
    !/^[A-Za-z0-9_-]{43}$/.test(capability)) throw new Error("Local task connection unavailable");
  let revoked = false, used = false;
  const port = createCommunicationNoteTaskLeaseReadPort({ enabled: true, projectRef: "abcdefghijklmnopqrst", principal,
    custody: {
      async issue(scope) {
        const delivery = taskListRecord(await requestTaskCredential(root, capability, "issue", {
          requestId: scope.requestId, principal: scope.principal, purpose: scope.purpose,
        }), ["leaseId", "credential"]);
        if (delivery.leaseId !== scope.requestId) throw new Error("Local task connection unavailable");
        // Test-only envelope translation: parent verifies the stored scope.
        // IPC has its own 8s bound; lifecycle cancellation never cancels revoke.
        return { ...scope, credential: delivery.credential as CommunicationNoteTaskLeaseCredential };
      },
      async revoke(scope) {
        const receipt = taskListRecord(await requestTaskCredential(root, capability, "revoke", { leaseId: scope.requestId }), ["leaseId", "revoked"]);
        if (receipt.leaseId !== scope.requestId || receipt.revoked !== true) throw new Error("Local task connection unavailable");
        revoked = true;
        return { ...scope, status: "REVOKED" };
      },
    },
    open: input => createTestOnlyCommunicationNoteTaskUnixReadPort({ ...input, socket: root + "/pg/socket", port: 15437 }),
  })!;
  return Object.freeze({ projectRef: port.projectRef, purpose: port.purpose, callerRole: port.callerRole,
    async execute(parameters, context) {
      if (used) throw new Error("Local task connection unavailable"); used = true;
      assertReviewDatabaseFixture();
      let returned = false;
      try { const result = await port.execute(parameters, context); returned = true; return result; }
      finally {
        console.log(JSON.stringify({ fixture: "workspace-task-physical-read", returned, revoked,
          aborted: context.signal.aborted, connectionOwner: "DEDICATED_LIST_PORT", modelCalled: false }));
      }
    },
  });
}
