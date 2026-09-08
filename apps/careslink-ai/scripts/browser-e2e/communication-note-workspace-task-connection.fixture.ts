/** TEST ONLY. One parent-issued lease for one source read, then revoke before
 * releasing metadata. No fixture-lifetime DB password and no issuer in Next. */
import "server-only";
import { randomBytes } from "node:crypto";
import { assertReviewDatabaseFixture } from "./communication-note-self-review.fixture";
import { requestTaskCredential } from "./communication-note-task-credential.fixture";
import { taskListRecord } from "../../src/lib/communication-note-task-list";
import { createTestOnlyCommunicationNoteTaskUnixReadPort } from "../../src/lib/communication-note-workspace-task-postgres.server";
import type { CaresLinkV1AuthenticatedPrincipal } from "../../src/lib/v1/transport-contract";
import type { CommunicationNoteWorkspaceTaskReadPort } from "../../src/lib/communication-note-workspace-durable.server";

export function createWorkspaceTaskReadPort(principal: CaresLinkV1AuthenticatedPrincipal): CommunicationNoteWorkspaceTaskReadPort {
  const root = assertReviewDatabaseFixture(), capability = process.env.CARESLINK_LOCAL_TASK_BROKER_CAPABILITY;
  if (process.env.CARESLINK_LOCAL_TASK_ENTRY !== "OWNER_TASK_LIST" || !capability ||
    !/^[A-Za-z0-9_-]{43}$/.test(capability)) throw new Error("Local task connection unavailable");
  const identity = taskListRecord(principal, ["userId", "sessionId", "transport"]) as CaresLinkV1AuthenticatedPrincipal;
  let used = false;
  return Object.freeze({ projectRef: "abcdefghijklmnopqrst", purpose: "COMMUNICATION_NOTE_JOB_LIST_READ",
    callerRole: "careslink_v1_generation_job_list_caller",
    async execute(parameters, context) {
      if (used) throw new Error("Local task connection unavailable"); used = true;
      assertReviewDatabaseFixture();
      if (context.signal.aborted) throw new Error("Local task connection unavailable");
      const leaseId = randomBytes(16).toString("hex");
      let result, failure: unknown, revoked = false;
      try {
        const delivery = taskListRecord(await requestTaskCredential(root, capability, "issue", {
          requestId: leaseId, principal: identity, purpose: "COMMUNICATION_NOTE_JOB_LIST_READ",
        }), ["leaseId", "credential"]);
        if (delivery.leaseId !== leaseId) throw new Error("Local task connection unavailable");
        const credential = taskListRecord(delivery.credential, ["role", "password", "deliveryExpiresAt"]);
        try {
          const port = createTestOnlyCommunicationNoteTaskUnixReadPort({ projectRef: "abcdefghijklmnopqrst", principal: identity,
            socket: root + "/pg/socket", port: 15437,
            credential: credential as { role: string; password: string; deliveryExpiresAt: string } });
          result = await port.execute(parameters, context);
        } finally { credential.password = ""; }
      } catch (error) { failure = error; }
      finally {
        // Also after ambiguous/lost issuance: the known request id is enough.
        // Never abort cleanup with the browser signal or return partial success.
        try {
          const receipt = taskListRecord(await requestTaskCredential(root, capability, "revoke", { leaseId }), ["leaseId", "revoked"]);
          revoked = receipt.leaseId === leaseId && receipt.revoked === true;
        } catch { /* Withhold data; parent's absolute expiry remains armed. */ }
        console.log(JSON.stringify({ fixture: "workspace-task-physical-read", returned: revoked && !failure && !context.signal.aborted, revoked,
          aborted: context.signal.aborted, connectionOwner: "DEDICATED_LIST_PORT", modelCalled: false }));
      }
      if (!revoked || context.signal.aborted) throw new Error("Local task connection unavailable");
      if (failure) throw failure;
      return result!;
    },
  });
}
