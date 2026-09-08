import "server-only";
import { types } from "node:util";
import { readCommunicationNoteDraftCatalog } from "./communication-note-draft-catalog.server";
import { decodeCommunicationNoteTaskCursor, taskListRecord, type CommunicationNoteTaskCursor } from "./communication-note-task-list";
import { COMMUNICATION_NOTE_SAVED_DRAFTS_API, parseCommunicationNoteDraftCursor, parseCommunicationNoteSavedDrafts } from "./communication-note-saved-drafts";
import type { CommunicationNoteGenerationPrincipalResolver, CommunicationNoteGenerationProviderPrincipal } from "./communication-note-generation-principal.server";
import type { CaresLinkV1ListDocumentsRequest, CaresLinkV1ListDocumentsResponse } from "./v1/transport-contract";
import { CaresLinkV1ContractError } from "./v1/shared-contracts";
import { CaresLinkV1ProductApiError } from "./v1/product-api-memory";
import { isCommunicationNoteWorkspaceEnabled } from "./communication-note-workspace-feature.server";
import { COMMUNICATION_NOTE_WORKSPACE_FORMAL_RUNTIME } from "./communication-note-workspace-runtime.server";

type Readers = Readonly<{
  listTasks(before: CommunicationNoteTaskCursor | null): PromiseLike<unknown>;
  listDocuments(page: CaresLinkV1ListDocumentsRequest): Promise<CaresLinkV1ListDocumentsResponse>;
}>;
export type CommunicationNoteWorkspaceRuntime = Readonly<{
  resolvePrincipal: CommunicationNoteGenerationPrincipalResolver;
  createReaders(input: Readonly<{ principal: CommunicationNoteGenerationProviderPrincipal; request: Request }>): Readers | Promise<Readers>;
}>;
const unavailable = () => new Error("Workspace unavailable");
function exact(value: unknown, keys: readonly string[]) {
  if (types.isProxy(value)) throw unavailable();
  return taskListRecord(value, keys);
}
function principal(value: unknown): CommunicationNoteGenerationProviderPrincipal {
  const p = exact(value, ["userId", "sessionId", "transport"]);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  if (p.transport !== "COOKIE" || typeof p.userId !== "string" || !uuid.test(p.userId) ||
    typeof p.sessionId !== "string" || !uuid.test(p.sessionId)) throw unavailable();
  return Object.freeze({ userId: p.userId, sessionId: p.sessionId, transport: "COOKIE" });
}
function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: {
    "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie, Authorization", "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow",
  } });
}

/** Shared read-only composition. The app and owned fixture use the same
 * transport/auth/cursor/metadata boundary; no mutable registration hook. */
export function createCommunicationNoteWorkspaceHandler(options: Readonly<{
  enabled(): boolean; runtime?: CommunicationNoteWorkspaceRuntime;
}>) {
  return async (request: Request) => {
    try {
      // Disabled or unbound means no request parsing, auth, connection or IO.
      if (options.enabled() !== true || !options.runtime) throw unavailable();
      const runtime = exact(options.runtime, ["resolvePrincipal", "createReaders"]);
      if (typeof runtime.resolvePrincipal !== "function" || types.isProxy(runtime.resolvePrincipal) ||
        typeof runtime.createReaders !== "function" || types.isProxy(runtime.createReaders)) throw unavailable();
      const url = new URL(request.url);
      if (request.method !== "GET" || url.pathname !== COMMUNICATION_NOTE_SAVED_DRAFTS_API ||
        request.headers.get("sec-fetch-site") !== "same-origin" || request.headers.has("authorization") ||
        (request.headers.has("origin") && request.headers.get("origin") !== url.origin)) throw unavailable();
      const resolution = await (runtime.resolvePrincipal as CommunicationNoteGenerationPrincipalResolver)(request);
      if (types.isProxy(resolution)) throw unavailable();
      const flag = Object.getOwnPropertyDescriptor(resolution, "ok");
      if (!flag || !("value" in flag)) throw unavailable();
      if (flag.value === false) {
        const failure = exact(resolution, ["ok", "reason", "status"]);
        if (failure.status === 401 && typeof failure.reason === "string" && ["auth_required", "session_revoked"].includes(failure.reason))
          return response({ status: "AUTH_REQUIRED" }, 401);
        throw unavailable();
      }
      if (flag.value !== true) throw unavailable();
      const identity = principal(exact(resolution, ["ok", "principal"]).principal);
      if (url.hash || [...url.searchParams.keys()].some(k => !["before", "draftAfter"].includes(k)) ||
        ["before", "draftAfter"].some(k => url.searchParams.getAll(k).length > 1)) throw unavailable();
      const before = url.searchParams.has("before") ? decodeCommunicationNoteTaskCursor(url.searchParams.get("before")!) : null;
      const draftAfter = parseCommunicationNoteDraftCursor(url.searchParams.get("draftAfter"));
      if (request.signal.aborted) throw unavailable();
      const readers = exact(await (runtime.createReaders as CommunicationNoteWorkspaceRuntime["createReaders"])(
        Object.freeze({ principal: identity, request })), ["listTasks", "listDocuments"]);
      if (typeof readers.listTasks !== "function" || types.isProxy(readers.listTasks) ||
        typeof readers.listDocuments !== "function" || types.isProxy(readers.listDocuments) || request.signal.aborted) throw unavailable();
      const drafts = await readCommunicationNoteDraftCatalog(readers.listDocuments as Readers["listDocuments"], draftAfter);
      if (request.signal.aborted) throw unavailable();
      const taskPage = await (readers.listTasks as Readers["listTasks"])(before);
      if (request.signal.aborted) throw unavailable();
      return response(parseCommunicationNoteSavedDrafts(200, { status: "AVAILABLE", ...drafts, taskPage }, "MULTI", before, draftAfter));
    } catch (error) {
      if ((error instanceof CaresLinkV1ContractError || error instanceof CaresLinkV1ProductApiError) &&
        ["AUTH_REQUIRED", "SESSION_REVOKED"].includes(error.code)) return response({ status: "AUTH_REQUIRED" }, 401);
      return response({ status: "UNAVAILABLE" }, 503);
    }
  };
}

/** Source-installed route, intentionally unbound to any hosted database. */
export function handleCommunicationNoteWorkspaceRequest(request: Request) {
  return createCommunicationNoteWorkspaceHandler({ enabled: isCommunicationNoteWorkspaceEnabled,
    runtime: COMMUNICATION_NOTE_WORKSPACE_FORMAL_RUNTIME })(request);
}
