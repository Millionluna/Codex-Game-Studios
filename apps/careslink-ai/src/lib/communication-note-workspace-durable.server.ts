import "server-only";
import { types } from "node:util";
import { createCareslinkServerSupabaseClient } from "./supabase-server";
import { createCommunicationNoteGenerationPrincipalResolver, type CommunicationNoteGenerationProviderPrincipal } from "./communication-note-generation-principal.server";
import type { CommunicationNoteGenerationAuthenticatedClient } from "./communication-note-generation-current-session.server";
import type { CommunicationNoteWorkspaceRuntime } from "./communication-note-workspace.server";
import { isCommunicationNoteWorkspaceEnabled } from "./communication-note-workspace-feature.server";
import { parseCommunicationNoteDraftCursor } from "./communication-note-saved-drafts";
import { taskListRecord } from "./communication-note-task-list";
import { COMMUNICATION_NOTE_JOB_LIST_SQL, createCommunicationNoteJobListRepository } from "./v1/communication-note-job-list-repository.server";
import { createSupabaseCaresLinkV1ProductApi, CARESLINK_V1_SUPABASE_RPC_NAMES, type CaresLinkV1SessionScopedSupabaseRpcClient } from "./v1/product-api-supabase.server";
import type { CaresLinkV1ProductApiEnv } from "./v1/product-api-auth.server";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./v1/ndis-shadow-guard";
import { CaresLinkV1ContractError } from "./v1/shared-contracts";

export const COMMUNICATION_NOTE_WORKSPACE_TASK_PURPOSE = "COMMUNICATION_NOTE_JOB_LIST_READ" as const;
export const COMMUNICATION_NOTE_WORKSPACE_TASK_CALLER = "careslink_v1_generation_job_list_caller" as const;
export type CommunicationNoteWorkspaceCookieClient = CommunicationNoteGenerationAuthenticatedClient & CaresLinkV1SessionScopedSupabaseRpcClient;
export type CommunicationNoteWorkspaceDurableEnv = CaresLinkV1ProductApiEnv & {
  CARESLINK_COMMUNICATION_NOTE_WORKSPACE_ENABLED?: string;
  CARESLINK_COMMUNICATION_NOTE_WORKSPACE_EXPECTED_SUPABASE_REF?: string;
  CARESLINK_COMMUNICATION_NOTE_WORKSPACE_EXPECTED_VERCEL_PROJECT_ID?: string;
  VERCEL?: string; VERCEL_ENV?: string; VERCEL_TARGET_ENV?: string; VERCEL_PROJECT_ID?: string;
};
/** Server-installed purpose port, not an attestation or credential issuer.
 * execute must run only the fixed job-list statement and settle after its own
 * physical-session cleanup. No raw SQL, connection or credential is exposed.
 * The existing single-job status/Points ports are deliberately incompatible. */
export type CommunicationNoteWorkspaceTaskReadPort = Readonly<{
  projectRef: string;
  purpose: typeof COMMUNICATION_NOTE_WORKSPACE_TASK_PURPOSE;
  callerRole: typeof COMMUNICATION_NOTE_WORKSPACE_TASK_CALLER;
  execute(parameters: readonly unknown[], context: Readonly<{ signal: AbortSignal }>): PromiseLike<unknown>;
}>;
export type CommunicationNoteWorkspaceDurableOptions = Readonly<{
  env: CommunicationNoteWorkspaceDurableEnv;
  resolveTaskRead(input: Readonly<{
    projectRef: string; purpose: typeof COMMUNICATION_NOTE_WORKSPACE_TASK_PURPOSE;
    callerRole: typeof COMMUNICATION_NOTE_WORKSPACE_TASK_CALLER;
    principal: CommunicationNoteGenerationProviderPrincipal; signal: AbortSignal;
  }>): Promise<CommunicationNoteWorkspaceTaskReadPort | undefined>;
  createCookieClient?: (input: Readonly<{ env: CaresLinkV1ProductApiEnv }>) => Promise<CommunicationNoteWorkspaceCookieClient | undefined>;
}>;
const unavailable = () => new CaresLinkV1ContractError("PRODUCT_API_DISABLED", "Workspace unavailable");
function exact(value: unknown, keys: readonly string[]) {
  if (types.isProxy(value)) throw unavailable();
  return taskListRecord(value, keys);
}
function same(a: CommunicationNoteGenerationProviderPrincipal, b: CommunicationNoteGenerationProviderPrincipal) {
  return a.transport === "COOKIE" && b.transport === "COOKIE" && a.userId === b.userId && a.sessionId === b.sessionId;
}

/** Lazy per-request Cookie Auth -> document RPC + owner-bound task repository.
 * Does not install itself in the formal route, connect at import/factory time,
 * read ambient credentials, or construct the broad Product API runtime. */
export function createCommunicationNoteWorkspaceDurableRuntime(options: CommunicationNoteWorkspaceDurableOptions): CommunicationNoteWorkspaceRuntime | undefined {
  const initial = configuration(options.env);
  if (!initial) return undefined;
  const input = exact(options, options.createCookieClient === undefined ? ["env", "resolveTaskRead"] : ["env", "resolveTaskRead", "createCookieClient"]);
  if (typeof input.resolveTaskRead !== "function" || types.isProxy(input.resolveTaskRead) ||
    (input.createCookieClient !== undefined && (typeof input.createCookieClient !== "function" || types.isProxy(input.createCookieClient)))) throw unavailable();
  const { env, resolveTaskRead, createCookieClient } = options;
  const current = () => {
    const next = configuration(env);
    return Boolean(next && next.projectRef === initial.projectRef && next.url === initial.url && next.key === initial.key && next.vercelProjectId === initial.vercelProjectId);
  };
  const contexts = new WeakMap<Request, { client: CommunicationNoteWorkspaceCookieClient; identity: CommunicationNoteGenerationProviderPrincipal }>();
  const used = new WeakSet<Request>();
  const assertActive = (request: Request) => { if (!current() || request.signal.aborted) throw unavailable(); };
  const resolver = (client: CommunicationNoteWorkspaceCookieClient, request: Request) => createCommunicationNoteGenerationPrincipalResolver({
    env, createCookieAuthClient: async () => client, validateCurrentSessionAuthority: () => current() && !request.signal.aborted,
  });
  const reauthorize = async (request: Request, client: CommunicationNoteWorkspaceCookieClient, identity: CommunicationNoteGenerationProviderPrincipal) => {
    assertActive(request);
    const auth = await resolver(client, request)(request);
    assertActive(request);
    if (!auth.ok) {
      if (auth.status === 401) throw new CaresLinkV1ContractError("AUTH_REQUIRED", "Current session unavailable");
      throw unavailable();
    }
    if (!same(auth.principal, identity)) throw new CaresLinkV1ContractError("AUTH_REQUIRED", "Current session changed");
  };
  return Object.freeze({
    async resolvePrincipal(request) {
      try {
        assertActive(request);
        if (used.has(request) || request.headers.has("authorization")) throw unavailable();
        used.add(request);
        const authEnv = Object.freeze({ SUPABASE_URL: initial.url, NEXT_PUBLIC_SUPABASE_URL: initial.url,
          SUPABASE_PUBLISHABLE_KEY: initial.key, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: initial.key });
        const client = createCookieClient ? await createCookieClient({ env: authEnv }) :
          await createCareslinkServerSupabaseClient({ env: authEnv }) as unknown as CommunicationNoteWorkspaceCookieClient | undefined;
        assertActive(request);
        if (!client) throw unavailable();
        const auth = await resolver(client, request)(request);
        assertActive(request);
        if (auth.ok) contexts.set(request, { client, identity: auth.principal });
        return auth;
      } catch { return { ok: false as const, reason: "unavailable" as const, status: 503 as const }; }
    },
    createReaders({ request, principal }) {
      assertActive(request);
      const context = contexts.get(request);
      contexts.delete(request);
      if (!context || !same(context.identity, principal)) throw unavailable();
      const { client, identity } = context;
      let stage: "DOCUMENTS" | "TASKS" | "CLOSED" = "DOCUMENTS";
      // Only this RPC can pass through the shared Product API parser. Its
      // write/Points methods never escape and cannot reach the Cookie client.
      const list = createSupabaseCaresLinkV1ProductApi({ principal: identity, client: {
        rpc(name, args) {
          assertActive(request);
          if (name !== CARESLINK_V1_SUPABASE_RPC_NAMES.listDocuments) throw unavailable();
          const fields = exact(args, ["p_after_document_id", "p_limit"]);
          if (fields.p_limit !== 20) throw unavailable();
          return client.rpc(name, args);
        },
      } }).listDocuments;
      return Object.freeze({
        async listDocuments(page) {
          if (stage !== "DOCUMENTS") throw unavailable();
          stage = "CLOSED";
          const fields = exact(page, Object.hasOwn(page, "cursor") ? ["limit", "cursor"] : ["limit"]);
          if (fields.limit !== 20) throw unavailable();
          const cursor = parseCommunicationNoteDraftCursor(fields.cursor === undefined ? null : fields.cursor as string);
          await reauthorize(request, client, identity);
          const result = await list({ limit: 20, ...(cursor ? { cursor } : {}) });
          assertActive(request);
          stage = "TASKS";
          return result;
        },
        async listTasks(before) {
          if (stage !== "TASKS") throw unavailable();
          stage = "CLOSED";
          await reauthorize(request, client, identity);
          const port = exact(await resolveTaskRead(Object.freeze({ projectRef: initial.projectRef,
            purpose: COMMUNICATION_NOTE_WORKSPACE_TASK_PURPOSE, callerRole: COMMUNICATION_NOTE_WORKSPACE_TASK_CALLER,
            principal: identity, signal: request.signal })), ["projectRef", "purpose", "callerRole", "execute"]);
          assertActive(request);
          if (port.projectRef !== initial.projectRef || port.purpose !== COMMUNICATION_NOTE_WORKSPACE_TASK_PURPOSE ||
            port.callerRole !== COMMUNICATION_NOTE_WORKSPACE_TASK_CALLER || typeof port.execute !== "function" || types.isProxy(port.execute)) throw unavailable();
          const tasks = createCommunicationNoteJobListRepository({ principal: identity, query(sql, values) {
            assertActive(request);
            if (sql !== COMMUNICATION_NOTE_JOB_LIST_SQL) throw unavailable();
            return (port.execute as CommunicationNoteWorkspaceTaskReadPort["execute"])(values, Object.freeze({ signal: request.signal }));
          } });
          const result = await tasks.list(before);
          // A mid-read logout or Cookie identity change suppresses both lists.
          await reauthorize(request, client, identity);
          return result;
        },
      });
    },
  });
}

function configuration(env: CommunicationNoteWorkspaceDurableEnv) {
  try {
    if (!isCommunicationNoteWorkspaceEnabled(env) || env.CARESLINK_V1_PRODUCT_API_ENABLED !== "true" || env.VERCEL !== "1" ||
      env.VERCEL_ENV !== "preview" || env.VERCEL_TARGET_ENV !== "preview") return undefined;
    const projectRef = env.CARESLINK_COMMUNICATION_NOTE_WORKSPACE_EXPECTED_SUPABASE_REF;
    const vercelProjectId = env.CARESLINK_COMMUNICATION_NOTE_WORKSPACE_EXPECTED_VERCEL_PROJECT_ID;
    const key = env.SUPABASE_PUBLISHABLE_KEY;
    if (!projectRef || !/^[a-z0-9]{20}$/.test(projectRef) || projectRef === CARESLINK_PRODUCTION_SUPABASE_REF ||
      !vercelProjectId || !/^prj_[A-Za-z0-9]{16,64}$/.test(vercelProjectId) || env.VERCEL_PROJECT_ID !== vercelProjectId ||
      !key || !/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key) || key !== env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return undefined;
    const url = `https://${projectRef}.supabase.co`;
    if (env.SUPABASE_URL !== url || env.NEXT_PUBLIC_SUPABASE_URL !== url) return undefined;
    return Object.freeze({ projectRef, url, key, vercelProjectId });
  } catch { return undefined; }
}
