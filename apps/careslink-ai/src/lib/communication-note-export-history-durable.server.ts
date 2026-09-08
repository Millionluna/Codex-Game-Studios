import "server-only";
import { createCareslinkServerSupabaseClient } from "./supabase-server";
import { createCommunicationNoteGenerationCurrentSessionStatusResolver,
  type CommunicationNoteGenerationAuthenticatedClient } from "./communication-note-generation-current-session.server";
import { parseExportHistoryList, parseExportHistoryReceipt, parseExportHistoryReport,
  type ExportHistoryFailure } from "./communication-note-export-history-contract";
import type { ExportHistoryBinding } from "./communication-note-export-history.server";
import { SELF_REVIEW_UUID as UUID } from "./communication-note-self-review-contract";
import { isCaresLinkV1ProductApiEnabled, resolveCaresLinkV1ProductApiAuth } from "./v1/product-api-auth.server";
import { isCaresLinkV1DurableProductApiEnabled, isCaresLinkV1ProductApiPreviewTargetAllowed,
  type CaresLinkV1ProductApiRuntimeEnv } from "./v1/product-api-runtime.server";
import type { CaresLinkV1SessionScopedSupabaseRpcClient } from "./v1/product-api-supabase.server";

export const EXPORT_HISTORY_RECORD_RPC = "record_communication_note_export_report";
export const EXPORT_HISTORY_LIST_RPC = "list_communication_note_export_reports";
export type ExportHistoryEnv = CaresLinkV1ProductApiRuntimeEnv & {
  CARESLINK_COMMUNICATION_NOTE_EXPORT_HISTORY_ENABLED?: string;
};
type Client = CommunicationNoteGenerationAuthenticatedClient & CaresLinkV1SessionScopedSupabaseRpcClient;
const unavailable = { status: "UNAVAILABLE" } as const;

/** Uninstalled dedicated capability: no generic document-write/read authority,
 * memory fallback, service credential, automatic retry or route activation.
 * SQL repeats authorization inside its transaction, including every replay. */
export function createCommunicationNoteDurableExportHistory(options: Readonly<{
  env?: ExportHistoryEnv; createCookieClient?: () => Promise<Client | undefined>;
}> = {}): ExportHistoryBinding {
  const env = options.env ?? process.env as ExportHistoryEnv;
  const enabled = (request: Request) => !request.signal.aborted &&
    env.CARESLINK_COMMUNICATION_NOTE_EXPORT_HISTORY_ENABLED === "true" &&
    isCaresLinkV1ProductApiEnabled(env) && isCaresLinkV1DurableProductApiEnabled(env) &&
    isCaresLinkV1ProductApiPreviewTargetAllowed(env);

  async function invoke(request: Request, name: string, args: Readonly<Record<string, unknown>>): Promise<unknown> {
    try {
      // Identity verification, active-session proof and the RPC share one
      // request-scoped Cookie client. Owner/session are never RPC arguments.
      const client = options.createCookieClient ? await options.createCookieClient()
        : await createCareslinkServerSupabaseClient({ env }) as unknown as Client | undefined;
      if (!client || request.signal.aborted) return unavailable;
      const auth = await resolveCaresLinkV1ProductApiAuth(request, { env,
        createCookieAuthClient: async () => client,
        resolveSessionStatus: createCommunicationNoteGenerationCurrentSessionStatusResolver(client) });
      if (!auth.ok) return { status: auth.status === 401 ? "AUTH_REQUIRED" : "UNAVAILABLE" };
      if (auth.identity.source !== "cookie") return { status: "AUTH_REQUIRED" };
      if (request.signal.aborted) return unavailable;
      const result = await client.rpc(name, args);
      if (request.signal.aborted || !result || typeof result !== "object") return unavailable;
      if (result.error !== null) {
        const error = result.error;
        if (error?.code === "P0001" && typeof error.message === "string" &&
          ["AUTH_REQUIRED", "NOT_FOUND", "STALE_REVISION", "REVIEW_REQUIRED", "INVALID_REQUEST"].includes(error.message))
          return { status: error.message } as ExportHistoryFailure;
        return unavailable;
      }
      return result.data;
    } catch { return unavailable; }
  }
  return {
    record: async input => {
      if (!enabled(input.request)) return unavailable;
      if (input.request.headers.has("authorization")) return { status: "AUTH_REQUIRED" };
      const report = parseExportHistoryReport(input.report);
      if (!UUID.test(input.canonicalId) || !UUID.test(input.attemptId) || !report) return { status: "INVALID_REQUEST" };
      const result = parseExportHistoryReceipt(await invoke(input.request, EXPORT_HISTORY_RECORD_RPC, {
        p_document_id: input.canonicalId, p_attempt_id: input.attemptId, p_report: report,
      }), { canonicalId: input.canonicalId, attemptId: input.attemptId, report });
      return result?.status === "RECORDED" && result.storage !== "DURABLE" ? unavailable : result ?? unavailable;
    },
    list: async input => {
      if (!enabled(input.request)) return unavailable;
      if (input.request.headers.has("authorization")) return { status: "AUTH_REQUIRED" };
      if (!UUID.test(input.canonicalId) || !UUID.test(input.revisionId)) return { status: "INVALID_REQUEST" };
      const result = parseExportHistoryList(await invoke(input.request, EXPORT_HISTORY_LIST_RPC, {
        p_document_id: input.canonicalId, p_revision_id: input.revisionId,
      }), { canonicalId: input.canonicalId, revisionId: input.revisionId });
      return result?.status === "AVAILABLE" && result.storage !== "DURABLE" ? unavailable : result ?? unavailable;
    },
  };
}
