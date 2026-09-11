import "server-only";
import { types } from "node:util";
import { taskPreviewWireRecord as record } from "./communication-note-task-preview-protocol.server";
import { createTaskPreviewHttpCustody, snapshotTaskPreviewClientBinding,
  type TaskPreviewClientBinding } from "./communication-note-task-preview-client.server";
import { createTaskPreviewAssertionProvider, type TaskPreviewSignerOptions } from "./communication-note-task-preview-signer.server";
import { createCommunicationNoteWorkspacePreviewRuntime,
  type CommunicationNoteWorkspacePreviewBinding } from "./communication-note-workspace-preview.server";
import type { CommunicationNoteWorkspaceDurableEnv } from "./communication-note-workspace-durable.server";
import type { CommunicationNoteWorkspaceRuntime } from "./communication-note-workspace.server";

export const COMMUNICATION_NOTE_WORKSPACE_TASK_CLIENT_READY = false as const;
export type CommunicationNoteWorkspaceTaskClientBinding = Readonly<
  Omit<CommunicationNoteWorkspacePreviewBinding, "custody"> & TaskPreviewClientBinding & {
    consumeSignature: TaskPreviewSignerOptions["consumeSignature"];
  }
>;
type Options = Readonly<{ env: CommunicationNoteWorkspaceDurableEnv; binding?: CommunicationNoteWorkspaceTaskClientBinding }>;

/** Uninstalled request-local assembly. Public configuration is snapshotted at
 * construction; no principal, client, signature or IO is created then. Only the
 * existing durable Cookie/current-session resolver can reach createCustody.
 * Each authenticated read gets a fresh one-use signer and client. The public
 * runtime exposes readers, never a caller-supplied-principal signing endpoint.
 *
 * An injected signing dependency and pinned CA/key/instance are NOT evidence of
 * real key custody or host provenance. Hosted installation, verified external
 * Auth/TLS/database and independent recovery remain separate activation gates.
 * No product binding, key discovery, global registration or environment fallback.
 */
export function createCommunicationNoteWorkspaceTaskClientRuntime(options: Options): CommunicationNoteWorkspaceRuntime | undefined {
  try {
    if (!options || typeof options !== "object" || types.isProxy(options)) return undefined;
    const installed = Object.getOwnPropertyDescriptor(options, "binding");
    if (!installed || !("value" in installed) || installed.value === undefined) return undefined;
    const fields = record(options, ["env", "binding"]);
    const b = record(fields.binding, ["projectRef", "vercelProjectId", "ca", "caSha256", "identity", "instanceId",
      "serviceCa", "serviceCaSha256", "serviceSpkiSha256", "consumeSignature"]);
    if (types.isProxy(b.consumeSignature) || typeof b.consumeSignature !== "function") return undefined;
    const consumeSignature = b.consumeSignature as TaskPreviewSignerOptions["consumeSignature"];
    const host = snapshotTaskPreviewClientBinding({ projectRef: b.projectRef, identity: b.identity, instanceId: b.instanceId,
      serviceCa: b.serviceCa, serviceCaSha256: b.serviceCaSha256, serviceSpkiSha256: b.serviceSpkiSha256 } as TaskPreviewClientBinding);
    return createCommunicationNoteWorkspacePreviewRuntime({ env: fields.env as CommunicationNoteWorkspaceDurableEnv, binding: {
      projectRef: host.projectRef, vercelProjectId: b.vercelProjectId as string, ca: b.ca as Buffer, caSha256: b.caSha256 as string,
      createCustody(principal) {
        const signer = createTaskPreviewAssertionProvider({ projectRef: host.projectRef, identity: host.identity,
          instanceId: host.instanceId, principal, consumeSignature });
        return createTaskPreviewHttpCustody({ ...host, principal, consumeAssertion: signer.consumeAssertion });
      },
    } });
  } catch { return undefined; }
}
