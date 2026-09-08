/** TEST ONLY. Real PostgreSQL RPCs, synthetic Auth/JWT issuance. Copied only
 * into an owned loopback app; never imported by the formal product routes. */
import "server-only";
import { cookies } from "next/headers";
import { realpath } from "node:fs/promises";
import { Client } from "pg";
import { createCommunicationNoteDurableSelfReviewWriter } from "../../src/lib/communication-note-self-review-durable.server";
import { handleCommunicationNoteSelfReview } from "../../src/lib/communication-note-self-review.server";
import { handleCommunicationNoteDocumentRead } from "../../src/lib/communication-note-document.server";
import { resolveCaresLinkV1ProductApiAuth } from "../../src/lib/v1/product-api-auth.server";
import { createCommunicationNoteGenerationCurrentSessionStatusResolver } from "../../src/lib/communication-note-generation-current-session.server";
import { createSupabaseCaresLinkV1ProductApi, type CaresLinkV1SupabaseRpcResult } from "../../src/lib/v1/product-api-supabase.server";
import { createCommunicationNoteDurableEditWriter } from "../../src/lib/communication-note-edit-durable.server";
import { handleCommunicationNoteEdit } from "../../src/lib/communication-note-edit.server";
import { createCommunicationNoteDurableExportHistory } from "../../src/lib/communication-note-export-history-durable.server";
import { handleExportHistory } from "../../src/lib/communication-note-export-history.server";
import { CaresLinkV1ContractError } from "../../src/lib/v1/shared-contracts";
import type { CaresLinkV1ListDocumentsRequest } from "../../src/lib/v1/transport-contract";

export const REVIEW_DOC = "11111111-1111-4111-8111-111111111111";
const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", SESSION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const FOREIGN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", FOREIGN_SESSION = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const env = { CARESLINK_COMMUNICATION_NOTE_SELF_REVIEW_ENABLED: "true", CARESLINK_V1_PRODUCT_API_ENABLED: "true",
  CARESLINK_V1_PRODUCT_API_DURABLE_ADAPTER_ENABLED: "true", CARESLINK_V1_PRODUCT_API_EXPECTED_SUPABASE_REF: "syntheticpreviewref",
  SUPABASE_URL: "https://syntheticpreviewref.supabase.co", VERCEL_ENV: "preview" };

export function assertReviewDatabaseFixture() {
  const root = process.cwd();
  if (!/^\/private\/tmp\/cl-job-browser-[a-zA-Z0-9]{6}$/.test(root) || process.env.VERCEL ||
      process.env.CARESLINK_LOCAL_BROWSER_FIXTURE !== "SYNTHETIC_LOOPBACK_ONLY" ||
      process.env.CARESLINK_LOCAL_REVIEW_DATABASE !== "OWNED_UNIX_SOCKET_ONLY" ||
      !/^[a-f0-9]{64}$/.test(process.env.CARESLINK_LOCAL_REVIEW_PASSWORD ?? "")) throw new Error("Local database fixture unavailable");
  return root;
}

/** Only these parameterized RPCs are reachable through the synthetic
 * adapter. SQL names, owners, claims, socket and role are never request inputs. */
export function reviewFixtureRpcCommand(name: string, args?: Readonly<Record<string, unknown>>) {
  const definitions: Record<string, { sql: string; keys: string[] }> = {
    resolve_v1_current_session_status: { sql: "select public.resolve_v1_current_session_status() as data", keys: [] },
    get_v1_shadow_document: { sql: "select public.get_v1_shadow_document($1) as data", keys: ["p_document_id"] },
    confirm_communication_note_self_review: { sql: "select public.confirm_communication_note_self_review($1,$2,$3,$4,$5,$6) as data",
      keys: ["p_document_id", "p_revision_id", "p_mutation_id", "p_facts_confirmed", "p_wording_confirmed", "p_missing_facts_reviewed"] },
  };
  if (process.env.CARESLINK_LOCAL_ADMISSION_DATABASE === "OWNED_UNIX_SOCKET_ONLY") {
    assertReviewDatabaseFixture();
    definitions.get_v1_communication_note_points_preview = { sql: "select public.get_v1_communication_note_points_preview() as data", keys: [] };
  }
  if (process.env.CARESLINK_LOCAL_SETTLED_LIST === "EXACT_SETTLED_DOCUMENT_ONLY") {
    assertReviewDatabaseFixture();
    definitions.list_v1_shadow_documents = { sql: "select public.list_v1_shadow_documents($1,$2) as data", keys: ["p_after_document_id", "p_limit"] };
  }
  if (process.env.CARESLINK_LOCAL_EDIT_DATABASE === "OWNED_UNIX_SOCKET_ONLY") {
    assertReviewDatabaseFixture();
    definitions.save_communication_note_wording = { sql: "select public.save_communication_note_wording($1,$2,$3::jsonb) as data",
      keys: ["p_document_id", "p_mutation_id", "p_command"] };
  }
  if (process.env.CARESLINK_LOCAL_HISTORY_DATABASE === "OWNED_UNIX_SOCKET_ONLY") {
    assertReviewDatabaseFixture();
    definitions.record_communication_note_export_report = { sql: "select public.record_communication_note_export_report($1,$2,$3::jsonb) as data",
      keys: ["p_document_id", "p_attempt_id", "p_report"] };
    definitions.list_communication_note_export_reports = { sql: "select public.list_communication_note_export_reports($1,$2) as data",
      keys: ["p_document_id", "p_revision_id"] };
  }
  const def = Object.hasOwn(definitions, name) ? definitions[name] : undefined;
  if (!def || (args !== undefined && (!args || typeof args !== "object" || Array.isArray(args))) ||
      Object.keys(args ?? {}).length !== def.keys.length || !def.keys.every(k => Object.hasOwn(args ?? {}, k))) throw new Error("Fixture RPC denied");
  return { sql: def.sql, parameters: def.keys.map(k => args![k]) };
}

export async function createReviewDatabaseAuthClient() {
  const root = assertReviewDatabaseFixture();
  if (await realpath(root) !== root || await realpath(root + "/pg/socket") !== root + "/pg/socket") throw new Error("Fixture path denied");
  const mode = (await cookies()).get("cl_browser_fixture")?.value;
  const userId = mode === "foreign" ? FOREIGN : OWNER;
  const sessionId = mode === "foreign" ? FOREIGN_SESSION : SESSION;
  const claims = { sub: userId, session_id: sessionId, role: "authenticated", is_anonymous: false, exp: Math.floor(Date.now() / 1000) + 3600 };
  return {
    auth: {
      getClaims: async () => ({ data: { claims: mode === "anonymous" ? null : claims }, error: null }),
      getUser: async () => ({ data: { user: mode === "anonymous" ? null : { id: userId, email: "synthetic@example.invalid", app_metadata: { role: "provider" } } }, error: null }),
    },
    rpc: async (name: string, args?: Readonly<Record<string, unknown>>): Promise<CaresLinkV1SupabaseRpcResult> => {
      assertReviewDatabaseFixture();
      const command = reviewFixtureRpcCommand(name, args);
      const client = new Client({ host: root + "/pg/socket", port: 15437, database: "postgres", user: "cl_review_browser_runtime",
        password: process.env.CARESLINK_LOCAL_REVIEW_PASSWORD, ssl: false, connectionTimeoutMillis: 1000, query_timeout: 7000,
        options: "-c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=10000" });
      client.on("error", () => {});
      let checkpoint = "connect";
      try {
        await client.connect();
        checkpoint = "target";
        // The socket is already fixed/realpath-checked above and attested by
        // the bootstrap operator. Do not grant pg_read_all_settings merely to
        // let this unprivileged LOGIN read unix_socket_directories (42501).
        const state = (await client.query(`select current_user as role,inet_server_addr() is null as unix_only,
          current_setting('cluster_name') as cluster`)).rows[0];
        if (state.role !== "cl_review_browser_runtime" || state.unix_only !== true || state.cluster !== "careslink-review-browser-pg16") throw new Error("Fixture target denied");
        checkpoint = "claims";
        await client.query("begin"); await client.query("set local role authenticated");
        // This substitutes only GoTrue/PostgREST's verified claim installation.
        // Auth metadata/session existence, RLS and all write checks are real SQL.
        await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(claims)]);
        checkpoint = "rpc";
        const data = (await client.query(command.sql, command.parameters)).rows[0].data;
        await client.query("commit");
        console.log(JSON.stringify({ fixture: "review-postgres-rpc", operation: name,
          committed: true, storage: "POSTGRESQL", status: name === "get_v1_shadow_document" ? data.selfReviewStatus : typeof data === "string" ? data : data.status }));
        return { data, error: null };
      } catch (error) {
        await client.query("rollback").catch(() => {});
        const e = error as { code?: string; message?: string };
        const message = e.code === "P0001" && ["AUTH_REQUIRED", "SESSION_REVOKED", "NOT_FOUND", "STALE_REVISION", "INVALID_REQUEST", "PRIVACY_REVIEW_REQUIRED", "REVIEW_REQUIRED"].includes(e.message ?? "") ? e.message! : "UNAVAILABLE";
        console.log(JSON.stringify({ fixture: "review-postgres-rpc", operation: name, committed: false, status: message, checkpoint,
          errorCode: /^[A-Z0-9]{5}$/.test(e.code ?? "") ? e.code : "UNCLASSIFIED" }));
        return { data: null, error: { code: "P0001", message } };
      } finally { await client.end(); }
    },
  };
}

export async function readReviewDatabaseDocument(request: Request, documentId: string) {
  assertReviewDatabaseFixture();
  const client = await createReviewDatabaseAuthClient();
  return handleCommunicationNoteDocumentRead(request, documentId, {
    resolveAuth: async r => resolveCaresLinkV1ProductApiAuth(r, { env, createCookieAuthClient: async () => client,
      resolveSessionStatus: createCommunicationNoteGenerationCurrentSessionStatusResolver(client) }),
    getProductApi: async principal => createSupabaseCaresLinkV1ProductApi({ client, principal }),
  });
}

export async function readReviewDatabaseList(request: Request, page?: CaresLinkV1ListDocumentsRequest) {
  assertReviewDatabaseFixture();
  if (process.env.CARESLINK_LOCAL_SETTLED_LIST !== "EXACT_SETTLED_DOCUMENT_ONLY") throw new Error("Local list unavailable");
  if (page && process.env.CARESLINK_LOCAL_TASK_ENTRY !== "OWNER_TASK_LIST") throw new Error("Local catalog unavailable");
  const client = await createReviewDatabaseAuthClient();
  const auth = await resolveCaresLinkV1ProductApiAuth(new Request("https://careslink.internal/v1/documents", {
    headers: request.headers, signal: request.signal,
  }), { env, createCookieAuthClient: async () => client,
    resolveSessionStatus: createCommunicationNoteGenerationCurrentSessionStatusResolver(client) });
  if (!auth.ok) {
    if (["auth_required", "invalid_session", "session_revoked"].includes(auth.reason))
      throw new CaresLinkV1ContractError("AUTH_REQUIRED", "Local session unavailable");
    throw new Error("Local list unavailable");
  }
  if (auth.identity.source !== "cookie") throw new CaresLinkV1ContractError("AUTH_REQUIRED", "Cookie required");
  const api = createSupabaseCaresLinkV1ProductApi({ client, principal: {
    userId: auth.identity.userId, sessionId: auth.identity.sessionId, transport: "COOKIE",
  } });
  return api.listDocuments(page ?? { limit: 100 });
}

export async function confirmReviewDatabaseDocument(request: Request, documentId: string) {
  assertReviewDatabaseFixture();
  if (request.headers.get("host") !== "127.0.0.1:3395") return new Response(null, { status: 400 });
  const incoming = new URL(request.url);
  const local = new Request(new URL(incoming.pathname + incoming.search, "http://127.0.0.1:3395"), request);
  const response = await handleCommunicationNoteSelfReview(local, documentId, {
    localFixtureOrigin: "http://127.0.0.1:3395",
    write: createCommunicationNoteDurableSelfReviewWriter({ env, createCookieClient: createReviewDatabaseAuthClient }),
  });
  console.log(JSON.stringify({ fixture: "review-postgres-http", status: response.status }));
  return response;
}

export async function saveEditDatabaseDocument(request: Request, documentId: string) {
  assertReviewDatabaseFixture();
  if (process.env.CARESLINK_LOCAL_EDIT_DATABASE !== "OWNED_UNIX_SOCKET_ONLY") return new Response(null, { status: 503 });
  if (request.headers.get("host") !== "127.0.0.1:3395") return new Response(null, { status: 400 });
  const incoming = new URL(request.url);
  const local = new Request(new URL(incoming.pathname + incoming.search, "http://127.0.0.1:3395"), request);
  const client = await createReviewDatabaseAuthClient();
  const editEnv = { ...env, CARESLINK_COMMUNICATION_NOTE_EDIT_ENABLED: "true", CARESLINK_V1_PRODUCT_API_DOCUMENT_WRITE_ENABLED: "true" };
  const response = await handleCommunicationNoteEdit(local, documentId, {
    localFixtureOrigin: "http://127.0.0.1:3395",
    runtime: {
      resolveAuth: async r => resolveCaresLinkV1ProductApiAuth(r, { env: editEnv, createCookieAuthClient: async () => client,
        resolveSessionStatus: createCommunicationNoteGenerationCurrentSessionStatusResolver(client) }),
      getProductApi: async principal => createSupabaseCaresLinkV1ProductApi({ client, principal }),
    },
    write: createCommunicationNoteDurableEditWriter({ env: editEnv, createCookieClient: async () => client }),
  });
  console.log(JSON.stringify({ fixture: "edit-postgres-http", status: response.status }));
  return response;
}

export async function handleDatabaseExportHistory(request: Request, documentId: string) {
  assertReviewDatabaseFixture();
  if (process.env.CARESLINK_LOCAL_HISTORY_DATABASE !== "OWNED_UNIX_SOCKET_ONLY") return new Response(null, { status: 503 });
  if (request.headers.get("host") !== "127.0.0.1:3395") return new Response(null, { status: 400 });
  const incoming = new URL(request.url);
  const local = new Request(new URL(incoming.pathname + incoming.search, "http://127.0.0.1:3395"), request);
  const response = await handleExportHistory(local, documentId, {
    ...createCommunicationNoteDurableExportHistory({
      env: { ...env, CARESLINK_COMMUNICATION_NOTE_EXPORT_HISTORY_ENABLED: "true" },
      createCookieClient: createReviewDatabaseAuthClient,
    }),
    localFixtureOrigin: "http://127.0.0.1:3395",
  });
  console.log(JSON.stringify({ fixture: "export-history-postgres-http", method: request.method, status: response.status }));
  return response;
}
