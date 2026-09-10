import "server-only";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { checkServerIdentity } from "node:tls";
import { types } from "node:util";
import { Client, type ClientConfig } from "pg";
import { taskListRecord } from "./communication-note-task-list";
import { TASK_PREVIEW_ISSUER_SQL, type TaskPreviewControlConnection } from "./communication-note-task-preview-issuer.server";
import { consumeJobStatusCustodyValue as consumeCustodyValue } from "./v1/communication-note-job-status-custody-consumer.server";
import { CARESLINK_PRODUCTION_SUPABASE_REF as PARENT } from "./v1/ndis-shadow-guard";

export const COMMUNICATION_NOTE_TASK_PREVIEW_CONTROL_READY = false as const;
export const TASK_PREVIEW_CONTROL_APPLICATION = "careslink-task-preview-control-only";
const PURPOSE = "TASK_LIST_ISSUER_CONTROL_ONLY" as const;
const BRANCHES_URL = `https://api.supabase.com/v1/projects/${PARENT}/branches`;
const OPERATIONS = ["start", "inventory", "ready", "issue", "fence", "finalize"];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const TIMEOUT_MS = 2000; // Shares the existing broker's operation budget; no retries.
const unavailable = () => new Error("Task Preview control unavailable");
type Context = Readonly<{ signal: AbortSignal }>;
type Token = Readonly<{ accessToken: string; scope: "environment:read"; expiresAt: string }>;
type Target = Readonly<{
  projectRef: string; branchId: string; purpose: typeof PURPOSE; caSha256: string;
  observedAt: string; expiresAt: string; controlPlaneEvidenceSha256: string;
}>;
/** Delivery expiry limits handoff only. This is NOT an expiring admin LOGIN.
 * Branch deletion or password reset revokes the underlying static password. */
export type TaskPreviewControlCredential = Readonly<{
  projectRef: string; branchId: string; purpose: typeof PURPOSE; controlPlaneEvidenceSha256: string;
  password: string; deliveryExpiresAt: string;
  credentialClass: "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD";
  sourceExpiresAt: null; sourceRevocation: "BRANCH_DELETE_OR_PASSWORD_RESET";
}>;
export type TaskPreviewControlCustody = Readonly<{
  consumeAccessToken(context: Context, consumer: (token: Token) => Promise<void>): Promise<void>;
  consumeDatabaseCredential(target: Target, context: Context,
    consumer: (credential: TaskPreviewControlCredential) => Promise<void>): Promise<void>;
}>;
type Options = Readonly<{
  projectRef: string; branchId: string; ca: Buffer; caSha256: string;
  createCustody(context: Context): Promise<TaskPreviewControlCustody>;
}>;
type OwnedClient = Client & {
  password: unknown; connectionParameters: { password: unknown; replication: unknown; binary: unknown };
  connection: { on(event: string, callback: (message: { status: string }) => void): void;
    stream: { destroy(): void; encrypted?: boolean; authorized?: boolean } };
};

/** Dedicated issuer-service connection, never a product/read-session capability.
 * Each call re-reads the fixed branch-list endpoint BEFORE asking separate
 * custody for a task-control password. No env/DSN/pool/local connector exists.
 * Only the exactly-once handoff utility is shared with job status, not its
 * credential, target, SQL broker or issuer. Custody/workload trust, CA provenance
 * and an independent recovery supervisor still require a hosted installation.
 */
export function createTaskPreviewPgControlOpener(input: Options): (context: Context) => Promise<TaskPreviewControlConnection> {
  const r = record(input, ["projectRef", "branchId", "ca", "caSha256", "createCustody"]);
  const { projectRef, branchId, caSha256 } = r;
  if (typeof projectRef !== "string" || projectRef.length !== 20 || !/^[a-z0-9]{20}$/.test(projectRef) || projectRef === PARENT ||
      typeof branchId !== "string" || branchId.length !== 36 || !UUID.test(branchId) ||
      types.isProxy(r.ca) || !Buffer.isBuffer(r.ca) || r.ca.length === 0 || r.ca.length > 65536 ||
      typeof caSha256 !== "string" || !/^[a-f0-9]{64}$/.test(caSha256)) throw unavailable();
  callable(r.createCustody);
  const createCustody = r.createCustody as Options["createCustody"], ca = Buffer.from(r.ca);
  if (hash(ca) !== caSha256) throw unavailable();
  return async parent => {
    active(parent.signal);
    const deadline = new AbortController(), signal = AbortSignal.any([parent.signal, deadline.signal]);
    const timer = setTimeout(() => deadline.abort(), TIMEOUT_MS);
    const started = Date.now(), monotonic = performance.now();
    const check = () => {
      active(signal);
      if (Date.now() < started || Date.now() - started >= TIMEOUT_MS || performance.now() - monotonic >= TIMEOUT_MS) throw unavailable();
    };
    let connection: TaskPreviewControlConnection | undefined;
    try {
      const context = { signal };
      const custody = record(await wait(createCustody(context), signal), ["consumeAccessToken", "consumeDatabaseCredential"]);
      callable(custody.consumeAccessToken); callable(custody.consumeDatabaseCredential);
      check();
      const rows = await consumeCustodyValue<Token, unknown>({ signal,
        consume: consumer => (custody.consumeAccessToken as TaskPreviewControlCustody["consumeAccessToken"])(context, consumer),
        use: async raw => {
          check();
          const token = record(raw, ["accessToken", "scope", "expiresAt"]);
          if (token.scope !== "environment:read" || typeof token.accessToken !== "string" ||
              !/^[A-Za-z0-9_.+\/=:-]{20,4096}$/.test(token.accessToken) || !timestamp(token.expiresAt) ||
              Date.parse(token.expiresAt) <= started + TIMEOUT_MS) throw unavailable();
          const pending = fetch(BRANCHES_URL, { method: "GET", redirect: "error", cache: "no-store", credentials: "omit",
            headers: { authorization: `Bearer ${token.accessToken}`, accept: "application/json" }, signal });
          void pending.then(response => { if (signal.aborted) void response.body?.cancel().catch(() => {}); }, () => {});
          const response = await wait(pending, signal);
          check();
          if (response.status !== 200 || response.redirected || response.url !== BRANCHES_URL ||
              !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) {
            void response.body?.cancel().catch(() => {}); throw unavailable();
          }
          return JSON.parse(await body(response, signal)) as unknown;
        },
      });
      check();
      // JSON came from the fixed authenticated endpoint; unrelated fields are
      // ignored and never hashed, returned or retained as target evidence.
      if (!Array.isArray(rows) || rows.length > 1000) throw unavailable();
      const matches = rows.filter(row => row && typeof row === "object" && row.project_ref === projectRef);
      if (matches.length !== 1) throw unavailable();
      const b = matches[0];
      if (b.id !== branchId || b.parent_project_ref !== PARENT || b.is_default !== false || b.persistent !== false ||
          b.with_data !== false || b.status !== "FUNCTIONS_DEPLOYED" || b.preview_project_status !== "ACTIVE_HEALTHY" ||
          b.deletion_scheduled_at != null) throw unavailable();
      const core = { projectRef, branchId, purpose: PURPOSE, caSha256,
        observedAt: new Date(started).toISOString(), expiresAt: new Date(started + TIMEOUT_MS).toISOString() };
      const target: Target = Object.freeze({ ...core, controlPlaneEvidenceSha256: hash(JSON.stringify({ ...core,
        parentProjectRef: PARENT, defaultBranch: false, persistent: false, withData: false, status: "ACTIVE_HEALTHY" })) });
      connection = await consumeCustodyValue<TaskPreviewControlCredential, TaskPreviewControlConnection>({ signal,
        consume: consumer => (custody.consumeDatabaseCredential as TaskPreviewControlCustody["consumeDatabaseCredential"])(target, context, consumer),
        dispose: value => value.close(),
        use: async secret => {
          check();
          return physical(secret, target, ca, signal, check);
        },
      });
      check();
      const owned = connection;
      return Object.freeze({ query: owned.query, close: async () => {
        clearTimeout(timer);
        try { await owned.close(); } finally { deadline.abort(); }
      } });
    } catch {
      clearTimeout(timer); deadline.abort();
      try { await connection?.close(); } catch { /* no result escapes a failed close */ }
      throw unavailable();
    }
  };
}

async function physical(raw: TaskPreviewControlCredential, target: Target, ca: Buffer,
  signal: AbortSignal, checkTarget: () => void): Promise<TaskPreviewControlConnection> {
  const secret = record(raw, ["projectRef", "branchId", "purpose", "controlPlaneEvidenceSha256", "password",
    "deliveryExpiresAt", "credentialClass", "sourceExpiresAt", "sourceRevocation"]);
  const issued = Date.now();
  if (secret.projectRef !== target.projectRef || secret.branchId !== target.branchId || secret.purpose !== PURPOSE ||
      secret.controlPlaneEvidenceSha256 !== target.controlPlaneEvidenceSha256 || typeof secret.password !== "string" ||
      secret.password.length < 16 || secret.password.length > 256 || /[\u0000-\u001f\u007f]/.test(secret.password) ||
      secret.credentialClass !== "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD" || secret.sourceExpiresAt !== null ||
      secret.sourceRevocation !== "BRANCH_DELETE_OR_PASSWORD_RESET" || !timestamp(secret.deliveryExpiresAt) ||
      Date.parse(secret.deliveryExpiresAt) < issued + TIMEOUT_MS || Date.parse(secret.deliveryExpiresAt) > issued + 60000) throw unavailable();
  const expires = Date.parse(secret.deliveryExpiresAt), host = `db.${target.projectRef}.supabase.co`;
  // pg 8.23.0 implements channel binding; its @types package omits this option.
  const config: ClientConfig & { enableChannelBinding: true } = { host, port: 5432, database: "postgres", user: "postgres", password: secret.password,
    ssl: { ca: Buffer.from(ca), rejectUnauthorized: true, servername: host, minVersion: "TLSv1.2", checkServerIdentity },
    sslnegotiation: "postgres", enableChannelBinding: true, application_name: TASK_PREVIEW_CONTROL_APPLICATION,
    fallback_application_name: TASK_PREVIEW_CONTROL_APPLICATION, client_encoding: "UTF8", keepAlive: false,
    connectionTimeoutMillis: 750, query_timeout: 1750, statement_timeout: 1500, lock_timeout: 500,
    idle_in_transaction_session_timeout: 1000,
    options: "-c search_path= -c idle_session_timeout=2000 -c default_transaction_isolation=read\\ committed -c default_transaction_read_only=off" };
  let client: OwnedClient;
  try { client = new Client(config) as OwnedClient; } catch { config.password = undefined; secret.password = ""; throw unavailable(); }
  // pg's falsy-option fallback consults PGREPLICATION/PGBINARY. These internal
  // startup fields are pinned explicitly for pg 8.23.0 before connect().
  client.connectionParameters.replication = false; client.connectionParameters.binary = false;
  let closed = false, used = false, closing: Promise<void> | undefined, transactionStatus: string | undefined;
  const erase = () => { config.password = undefined; client.password = undefined; client.connectionParameters.password = undefined; secret.password = ""; };
  const close = () => {
    closed = true; erase(); signal.removeEventListener("abort", abort);
    // Repeat destroy on late connect: the driver may have replaced its stream.
    client.connection.stream.destroy();
    return closing ??= settleClose(Promise.resolve().then(() => client.end()));
  };
  const abort = () => { void close().catch(() => {}); };
  const check = () => {
    checkTarget();
    if (closed || Date.now() < issued || Date.now() >= expires ||
        client.connection.stream.encrypted !== true || client.connection.stream.authorized !== true || transactionStatus !== "I") throw unavailable();
  };
  client.on("error", abort);
  client.connection.on("readyForQuery", message => { transactionStatus = message.status; });
  signal.addEventListener("abort", abort, { once: true });
  try {
    checkTarget();
    const connecting = client.connect();
    void connecting.then(() => { if (closed || signal.aborted) abort(); }, () => {});
    await wait(connecting, signal); check();
    const identity = await wait(client.query(TASK_PREVIEW_CONTROL_IDENTITY_SQL), signal);
    check();
    if (!Array.isArray(identity.rows) || identity.rows.length !== 1) throw unavailable();
    const i = record(identity.rows[0], ["login", "current", "database", "major", "prepared", "operator", "isolation", "readOnly", "searchPath"]);
    if (i.login !== "postgres" || i.current !== "postgres" || i.database !== "postgres" || i.major !== 17 ||
        i.prepared !== 0 || i.operator !== true || i.isolation !== "read committed" || i.readOnly !== "off" || i.searchPath !== "") throw unavailable();
    return Object.freeze({ close, async query(sql, values) {
      // Consume the port even on malformed/repeated/concurrent attempts.
      const reused = used; used = true;
      try {
        check();
        if (reused || sql !== TASK_PREVIEW_ISSUER_SQL || types.isProxy(values) || !Array.isArray(values) || values.length !== 2 ||
            Reflect.ownKeys(values).length !== 3) throw unavailable();
        const fields = [0, 1].map(index => Object.getOwnPropertyDescriptor(values, index));
        if (fields.some(field => !field?.enumerable || !("value" in field))) throw unavailable();
        const [op, json] = fields.map(field => field!.value);
        if (typeof op !== "string" || !OPERATIONS.includes(op) || typeof json !== "string" || Buffer.byteLength(json) > 8192) throw unavailable();
        const data = JSON.parse(json);
        if ((["start", "inventory", "ready"].includes(op) ? data?.projectRef : data?.scope?.projectRef) !== target.projectRef) throw unavailable();
        const result = await wait(client.query(sql, [op, json]), signal);
        check();
        // Preserve the broker's exact row-shape validation; do not release a
        // successful RPC until this physical connection has closed as well.
        await close();
        checkTarget();
        return { rows: result.rows };
      } catch { try { await close(); } catch { /* fixed sanitized failure */ } throw unavailable(); }
    } });
  } catch { try { await close(); } catch { /* fixed sanitized failure */ } throw unavailable(); }
  finally { erase(); }
}

export const TASK_PREVIEW_CONTROL_IDENTITY_SQL = `select session_user::text as login,current_user::text as current,
  current_database() as database,current_setting('server_version_num')::int/10000 as major,
  current_setting('max_prepared_transactions')::int as prepared,
  (rolcanlogin and not rolsuper and rolcreaterole and rolbypassrls
    and pg_catalog.pg_has_role(current_user,'pg_read_all_stats','USAGE')
    and pg_catalog.pg_has_role(current_user,'pg_signal_backend','USAGE')) as operator,
  current_setting('transaction_isolation') as isolation,current_setting('transaction_read_only') as "readOnly",
  current_setting('search_path') as "searchPath"
  from pg_catalog.pg_roles where rolname=current_user`;

async function body(response: Response, signal: AbortSignal): Promise<string> {
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 131072)) {
    void response.body?.cancel().catch(() => {}); throw unavailable();
  }
  const reader = response.body?.getReader();
  if (!reader) throw unavailable();
  let size = 0; const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const next = await wait(reader.read(), signal);
      if (next.done) break;
      size += next.value.byteLength; if (size > 131072) throw unavailable();
      chunks.push(next.value);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
}
async function wait<T>(promise: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  let stop = () => {};
  const work = Promise.resolve(promise); void work.catch(() => {});
  try {
    active(signal);
    const result = await Promise.race([work, new Promise<never>((_, reject) => {
      stop = () => reject(unavailable()); signal.addEventListener("abort", stop, { once: true });
      if (signal.aborted) stop();
    })]);
    active(signal); return result;
  } finally { signal.removeEventListener("abort", stop); }
}
async function settleClose(promise: Promise<void>) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 500);
  try { await wait(promise, controller.signal); } catch { throw unavailable(); } finally { clearTimeout(timer); }
}
function record(value: unknown, keys: readonly string[]) {
  try { if (types.isProxy(value)) throw unavailable(); return taskListRecord(value, keys); } catch { throw unavailable(); }
}
function callable(value: unknown) { if (typeof value !== "function" || types.isProxy(value)) throw unavailable(); }
function active(signal: AbortSignal) { if (!(signal instanceof AbortSignal) || signal.aborted) throw unavailable(); }
function timestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function hash(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }
