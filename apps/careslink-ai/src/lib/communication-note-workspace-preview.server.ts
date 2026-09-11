import "server-only";
import { createHash } from "node:crypto";
import { types } from "node:util";
import { taskListRecord } from "./communication-note-task-list";
import {
  createCommunicationNoteWorkspaceDurableRuntime,
  resolveCommunicationNoteWorkspaceConfiguration,
  COMMUNICATION_NOTE_WORKSPACE_TASK_CALLER,
  COMMUNICATION_NOTE_WORKSPACE_TASK_PURPOSE,
  type CommunicationNoteWorkspaceDurableEnv,
} from "./communication-note-workspace-durable.server";
import {
  createCommunicationNoteTaskLeaseReadPort,
  type CommunicationNoteTaskLeaseCustody,
} from "./communication-note-workspace-task-lease.server";
import { createCommunicationNoteTaskPgReadPort } from "./communication-note-workspace-task-postgres.server";
import type { CommunicationNoteWorkspaceRuntime } from "./communication-note-workspace.server";
import type { CommunicationNoteGenerationProviderPrincipal as Principal } from "./communication-note-generation-principal.server";

/** Trusted server installation, NOT proof that a custody implementation is safe.
 * Its issuer, independent supervisor, terminal fence and target-specific grants
 * need separate Hosted verification/approval. No credential or arbitrary open/
 * query callback is accepted here. The CA digest pins bytes, not their provenance.
 */
export type CommunicationNoteWorkspacePreviewBinding = Readonly<{
  projectRef: string;
  vercelProjectId: string;
  ca: Buffer;
  caSha256: string;
  custody: CommunicationNoteTaskLeaseCustody;
}>;
/** Server-owned synchronous factory, invoked only inside the durable runtime's
 * authenticated read path. A new custody object is required for every read. */
export type CommunicationNoteWorkspacePreviewFactoryBinding = Readonly<
  Omit<CommunicationNoteWorkspacePreviewBinding, "custody"> & {
    createCustody(principal: Principal): CommunicationNoteTaskLeaseCustody;
  }
>;
type Options = Readonly<{
  env: CommunicationNoteWorkspaceDurableEnv;
  binding?: CommunicationNoteWorkspacePreviewBinding | CommunicationNoteWorkspacePreviewFactoryBinding;
}>;
const unavailable = () => new Error("Workspace Preview composition unavailable");

/** Joins the real Cookie reader, single-use lease and pinned-TLS PG17 reader.
 * Import/construction is IO-free. Missing installation stays unbound even with
 * every environment flag enabled. There is no global registration, credential
 * discovery, operator fallback, write path or local-Unix alternative here.
 */
export function createCommunicationNoteWorkspacePreviewRuntime(options: Options): CommunicationNoteWorkspaceRuntime | undefined {
  try {
    if (!options || typeof options !== "object" || types.isProxy(options)) return undefined;
    const installed = Object.getOwnPropertyDescriptor(options, "binding");
    // Do not even inspect env when the separately installed binding is absent.
    if (!installed || !("value" in installed) || installed.value === undefined) return undefined;
    const fields = record(options, ["env", "binding"]);
    const env = fields.env as CommunicationNoteWorkspaceDurableEnv;
    const initial = resolveCommunicationNoteWorkspaceConfiguration(env);
    if (!initial) return undefined;
    if (!fields.binding || typeof fields.binding !== "object" || types.isProxy(fields.binding)) return undefined;
    const factory = Object.hasOwn(fields.binding, "createCustody");
    const binding = record(fields.binding, ["projectRef", "vercelProjectId", "ca", "caSha256", factory ? "createCustody" : "custody"]);
    if (binding.projectRef !== initial.projectRef || binding.vercelProjectId !== initial.vercelProjectId ||
      types.isProxy(binding.ca) || !Buffer.isBuffer(binding.ca) || binding.ca.length === 0 || binding.ca.length > 65536 ||
      typeof binding.caSha256 !== "string" || !/^[a-f0-9]{64}$/.test(binding.caSha256)) return undefined;
    const ca = Buffer.from(binding.ca), caSha256 = binding.caSha256;
    if (createHash("sha256").update(ca).digest("hex") !== caSha256) return undefined;
    let resolveCustody: (principal: Principal) => CommunicationNoteTaskLeaseCustody;
    if (factory) {
      const create = binding.createCustody;
      if (typeof create !== "function" || types.isProxy(create)) return undefined;
      const used = new WeakSet<object>();
      resolveCustody = principal => {
        const owned = create(principal), custody = snapshotCustody(owned);
        if (used.has(owned)) throw unavailable();
        used.add(owned);
        return custody;
      };
    } else {
      const custody = snapshotCustody(binding.custody);
      resolveCustody = () => custody;
    }
    const active = (signal?: AbortSignal) => {
      const next = resolveCommunicationNoteWorkspaceConfiguration(env);
      if (signal?.aborted || !next || next.projectRef !== initial.projectRef || next.url !== initial.url ||
        next.key !== initial.key || next.vercelProjectId !== initial.vercelProjectId) throw unavailable();
    };
    const runtime = createCommunicationNoteWorkspaceDurableRuntime({ env,
      async resolveTaskRead(input) {
        active(input.signal);
        if (input.projectRef !== initial.projectRef || input.purpose !== COMMUNICATION_NOTE_WORKSPACE_TASK_PURPOSE ||
          input.callerRole !== COMMUNICATION_NOTE_WORKSPACE_TASK_CALLER) throw unavailable();
        const { issue, revoke } = resolveCustody(input.principal);
        active(input.signal);
        return createCommunicationNoteTaskLeaseReadPort({ enabled: true, projectRef: initial.projectRef,
          principal: input.principal,
          custody: Object.freeze({
            issue(scope, context) { active(context.signal); return issue(scope, context); },
            // Never gate cleanup on request cancellation, env drift or logout.
            revoke,
          }),
          open(delivery) {
            active(input.signal);
            return createCommunicationNoteTaskPgReadPort({ ...delivery, ca, caSha256 });
          },
        });
      },
    });
    active();
    return runtime;
  } catch { return undefined; }
}

function record(value: unknown, keys: readonly string[]) {
  if (types.isProxy(value)) throw unavailable();
  return taskListRecord(value, keys);
}
function snapshotCustody(value: unknown): CommunicationNoteTaskLeaseCustody {
  const custody = record(value, ["issue", "revoke"]);
  if (typeof custody.issue !== "function" || types.isProxy(custody.issue) ||
      typeof custody.revoke !== "function" || types.isProxy(custody.revoke)) throw unavailable();
  return Object.freeze({ issue: custody.issue as CommunicationNoteTaskLeaseCustody["issue"],
    revoke: custody.revoke as CommunicationNoteTaskLeaseCustody["revoke"] });
}
