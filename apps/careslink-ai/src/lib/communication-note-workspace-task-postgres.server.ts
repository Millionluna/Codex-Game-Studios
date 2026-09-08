import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { realpath } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { types } from "node:util";
import { Client, type ClientConfig } from "pg";
import { parseCommunicationNoteTaskCursor, taskListRecord } from "./communication-note-task-list";
import { COMMUNICATION_NOTE_JOB_LIST_SQL } from "./v1/communication-note-job-list-repository.server";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./v1/ndis-shadow-guard";
import type { CaresLinkV1AuthenticatedPrincipal } from "./v1/transport-contract";
import { CARESLINK_V1_CONTRACT_VERSION, CARESLINK_V1_NOTE_SCHEMA_VERSION } from "./v1/shared-contracts";
import type { CommunicationNoteWorkspaceTaskReadPort } from "./communication-note-workspace-durable.server";

const PURPOSE = "COMMUNICATION_NOTE_JOB_LIST_READ" as const;
const CALLER = "careslink_v1_generation_job_list_caller" as const;
const ROLE = /^careslink_v1_job_list_runtime_[a-f0-9]{16}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const fail = () => new Error("Task list PostgreSQL dependency unavailable");
export const COMMUNICATION_NOTE_TASK_POSTGRES_READY = false as const;
export const COMMUNICATION_NOTE_TASK_READ_TIMEOUT_MS = 10000;
const CLEANUP_TIMEOUT_MS = 4500;
type Endpoint = Pick<ClientConfig, "host" | "port" | "ssl">;
type Credential = Readonly<{ role: string; password: string; deliveryExpiresAt: string }>;
type Input = Readonly<{ projectRef: string; principal: CaresLinkV1AuthenticatedPrincipal; credential: Credential }>;
type OwnedClient = Client & { password: unknown; connectionParameters: { password: unknown };
  connection: { stream: { destroy(): void; encrypted?: boolean; authorized?: boolean } } };

/** Server-injected delivery only: no issuer, env lookup, pool, generic SQL port,
 * status-purpose credential reuse, or formal runtime activation. Delivery expiry
 * does NOT revoke the source password. A separate issuer/custody gate is required.
 */
export function createCommunicationNoteTaskPgReadPort(input: Input & Readonly<{ ca: Buffer; caSha256: string }>): CommunicationNoteWorkspaceTaskReadPort {
  const r = record(input, ["projectRef", "principal", "credential", "ca", "caSha256"]);
  if (!Buffer.isBuffer(r.ca) || r.ca.length === 0 || r.ca.length > 65536 ||
    typeof r.caSha256 !== "string" || !/^[a-f0-9]{64}$/.test(r.caSha256)) throw fail();
  const ca = Buffer.from(r.ca);
  if (createHash("sha256").update(ca).digest("hex") !== r.caSha256) throw fail();
  return createPort(r as unknown as Input, {
    host: `db.${project(r.projectRef)}.supabase.co`, port: 5432, ssl: { ca, rejectUnauthorized: true },
  }, 17);
}

/** Explicit local PG16 engine fixture, never selectable through environment or
 * a product request. The private Unix directory must belong to the test runner.
 */
export function createTestOnlyCommunicationNoteTaskUnixReadPort(input: Input & Readonly<{ socket: string; port: 15437 }>): CommunicationNoteWorkspaceTaskReadPort {
  const r = record(input, ["projectRef", "principal", "credential", "socket", "port"]);
  if (typeof r.socket !== "string" || !/^\/private\/tmp\/cl-job-browser-[a-zA-Z0-9]{6}\/pg\/socket$/.test(r.socket) || r.port !== 15437) throw fail();
  return createPort(r as unknown as Input, { host: r.socket, port: 15437, ssl: false }, 16);
}

function createPort(input: Input, endpoint: Endpoint, major: 16 | 17): CommunicationNoteWorkspaceTaskReadPort {
  const projectRef = project(input.projectRef);
  const principal = record(input.principal, ["userId", "sessionId", "transport"]);
  if (principal.transport !== "COOKIE" || !uuid(principal.userId) || !uuid(principal.sessionId)) throw fail();
  const credential = record(input.credential, ["role", "password", "deliveryExpiresAt"]);
  if (typeof credential.role !== "string" || !ROLE.test(credential.role) ||
    typeof credential.password !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(credential.password) ||
    typeof credential.deliveryExpiresAt !== "string" || !Number.isFinite(Date.parse(credential.deliveryExpiresAt)) ||
    new Date(credential.deliveryExpiresAt).toISOString() !== credential.deliveryExpiresAt) throw fail();
  const role = credential.role;
  let password = credential.password;
  const openedAt = Date.now(), expiresAt = Date.parse(credential.deliveryExpiresAt);
  const deadline = performance.now() + expiresAt - openedAt;
  if (expiresAt < openedAt + 20000 || expiresAt > openedAt + 90000) throw fail();
  const fresh = () => Date.now() >= openedAt && Date.now() < expiresAt && performance.now() < deadline;
  let used = false;
  return Object.freeze({ projectRef, purpose: PURPOSE, callerRole: CALLER,
    async execute(raw, context) {
      if (used) throw fail();
      used = true;
      try {
        const values = parameters(raw, principal);
        active(context.signal);
        if (!fresh()) throw fail();
        if (major === 16 && await realpath(endpoint.host!) !== endpoint.host) throw fail();
        active(context.signal);
        return await read({ endpoint, major, role, password, values, parent: context.signal, fresh });
      } catch (error) {
        if (revoked(error)) throw Object.assign(new Error("SESSION_REVOKED"), { code: "P0001" });
        throw fail();
      } finally { password = ""; credential.password = ""; }
    },
  });
}

async function read(input: { endpoint: Endpoint; major: 16 | 17; role: string; password: string;
  values: unknown[]; parent: AbortSignal; fresh(): boolean }) {
  const nonce = randomBytes(16).toString("hex");
  const application = `cl-task-read-${nonce}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COMMUNICATION_NOTE_TASK_READ_TIMEOUT_MS);
  const signal = AbortSignal.any([input.parent, controller.signal]);
  const observer = connection(input, `cl-task-clean-${nonce}`, true);
  let reader: ReturnType<typeof connection> | undefined;
  let identity: { pid: number; start: string } | undefined;
  let observerReady = false, result: { rows: unknown[] } | undefined, error: unknown;
  const stopRead = () => { void reader?.close().catch(() => {}); };
  signal.addEventListener("abort", stopRead, { once: true });
  const check = () => { active(signal); if (!input.fresh()) throw fail(); };
  try {
    check();
    // Establish the independent, SAME least-privilege LOGIN first. It retains
    // session_user and does not SET ROLE or receive pg_signal_backend/admin.
    await observer.client.connect();
    check();
    await attest(observer.client, input);
    observerReady = true;
    check();
    reader = connection(input, application, false);
    await reader.client.connect();
    check();
    identity = await attest(reader.client, input);
    check();
    await reader.client.query(`set role ${CALLER}`);
    check();
    const role = await reader.client.query("select current_user::text as role");
    if (role.rows.length !== 1 || role.rows[0].role !== CALLER) throw fail();
    check();
    // Autocommit, not READ ONLY: fresh_session_is_active takes auth row locks.
    // The fixed purpose function supplies the metadata-only/RLS boundary.
    result = { rows: (await reader.client.query(COMMUNICATION_NOTE_JOB_LIST_SQL, input.values)).rows };
    check();
  } catch (caught) { error = caught; }
  finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", stopRead);
    // Independent deadline: an aborted HTTP request must not abort its cleanup.
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        (async () => {
          await reader?.close();
          if (reader) {
            if (!observerReady) throw fail();
            const args = [input.role, application, identity?.pid ?? null, identity?.start ?? null];
            const terminated = await observer.client.query(TERMINATE_SQL, args);
            if (terminated.rows.some(row => row.terminated !== true)) throw fail();
            const remaining = await observer.client.query(RESIDUE_SQL, args);
            if (remaining.rows.length !== 1 || remaining.rows[0].remaining !== 0) throw fail();
          }
          await observer.close();
        })(),
        new Promise<never>((_, reject) => { cleanupTimer = setTimeout(() => {
          stopRead(); void observer.close().catch(() => {}); reject(fail());
        }, CLEANUP_TIMEOUT_MS); }),
      ]);
    } catch { error = fail(); }
    finally {
      clearTimeout(cleanupTimer);
      // Idempotent close also covers failures before observer attestation.
      void reader?.close().catch(() => {}); void observer.close().catch(() => {});
      observer.erase(); reader?.erase(); input.password = "";
    }
  }
  // Never release a late or partially cleaned result (including late abort).
  if (signal.aborted || !input.fresh()) throw fail();
  if (error) throw error;
  if (!result) throw fail();
  return result;
}

function connection(input: { endpoint: Endpoint; role: string; password: string }, application: string, observer: boolean) {
  const config: ClientConfig = { ...input.endpoint, database: "postgres", user: input.role, password: input.password,
    application_name: application, fallback_application_name: "", client_encoding: "UTF8", keepAlive: false,
    connectionTimeoutMillis: 1500, query_timeout: observer ? 2500 : 5500,
    statement_timeout: observer ? 2000 : 5000, lock_timeout: 1000, idle_in_transaction_session_timeout: 5000,
    options: "-c search_path= -c idle_session_timeout=15000" };
  const client = new Client(config) as OwnedClient;
  let closing: Promise<void> | undefined;
  const close = () => {
    if (!closing) {
      client.connection.stream.destroy();
      closing = client.end();
    }
    return closing;
  };
  client.on("error", () => { void close().catch(() => {}); });
  return { client, close, erase() {
    config.password = undefined; client.password = undefined; client.connectionParameters.password = undefined;
  } };
}

async function attest(client: OwnedClient, input: { role: string; major: 16 | 17 }) {
  if (input.major === 17 && (!client.connection.stream.encrypted || !client.connection.stream.authorized)) throw fail();
  const result = await client.query(IDENTITY_SQL);
  const r = result.rows[0];
  if (result.rows.length !== 1 || !r || r.login !== input.role || r.current !== input.role || r.major !== input.major ||
    r.database !== "postgres" || r.safe !== true || !Number.isSafeInteger(r.pid) || r.pid <= 0 ||
    typeof r.start !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(r.start) ||
    (input.major === 16 && (r.unix_only !== true || r.cluster !== "careslink-review-browser-pg16"))) throw fail();
  return { pid: r.pid as number, start: r.start as string };
}

const IDENTITY_SQL = `select a.pid,
  pg_catalog.to_char(a.backend_start at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as start,
  session_user::text as login,current_user::text as current,
  pg_catalog.current_setting('server_version_num')::int/10000 as major,
  pg_catalog.current_database() as database,pg_catalog.current_setting('cluster_name') as cluster,
  pg_catalog.inet_server_addr() is null as unix_only,
  (r.rolcanlogin and not r.rolsuper and not r.rolinherit and not r.rolcreatedb and not r.rolcreaterole
    and not r.rolreplication and not r.rolbypassrls and r.rolconnlimit=2
    and (select count(*) from pg_catalog.pg_auth_members m where m.member=r.oid)=1
    and exists(select 1 from pg_catalog.pg_auth_members m join pg_catalog.pg_roles c on c.oid=m.roleid
      where m.member=r.oid and c.rolname='${CALLER}' and not m.admin_option and not m.inherit_option and m.set_option
        and not c.rolcanlogin and not c.rolsuper and not c.rolinherit and not c.rolcreatedb and not c.rolcreaterole
        and not c.rolreplication and not c.rolbypassrls
        and not exists(select 1 from pg_catalog.pg_auth_members cm where cm.member=c.oid))) as safe
  from pg_catalog.pg_stat_activity a join pg_catalog.pg_roles r on r.oid=a.usesysid
  where a.pid=pg_catalog.pg_backend_pid()`;
// Exact per-invocation random name + login/database; after attestation also bind
// PID AND microsecond backend_start. No PID-only or broad same-user termination.
const TARGET = `usename=$1 and usename=session_user and datname=pg_catalog.current_database()
  and application_name=$2 and pid<>pg_catalog.pg_backend_pid()
  and ($3::int is null or (pid=$3 and backend_start=$4::timestamptz))`;
const TERMINATE_SQL = `select pg_catalog.pg_terminate_backend(pid,1000) as terminated
  from pg_catalog.pg_stat_activity where ${TARGET}`;
const RESIDUE_SQL = `select count(*)::int as remaining from pg_catalog.pg_stat_activity where ${TARGET}`;

function parameters(raw: readonly unknown[], principal: Record<string, unknown>): unknown[] {
  if (!Array.isArray(raw) || types.isProxy(raw) || raw.length !== 7 || Reflect.ownKeys(raw).length !== 8) throw fail();
  const values = Array.from({ length: 7 }, (_, i) => {
    const d = Object.getOwnPropertyDescriptor(raw, String(i));
    if (!d?.enumerable || !("value" in d)) throw fail();
    return d.value;
  });
  if (values[0] !== principal.userId || values[1] !== principal.sessionId || values[4] !== 20 ||
    values[5] !== CARESLINK_V1_CONTRACT_VERSION || values[6] !== CARESLINK_V1_NOTE_SCHEMA_VERSION) throw fail();
  parseCommunicationNoteTaskCursor(values[2] === null && values[3] === null ? null : { createdAt: values[2], jobId: values[3] });
  return values;
}
function project(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9]{20}$/.test(value) || value === CARESLINK_PRODUCTION_SUPABASE_REF) throw fail();
  return value;
}
function uuid(value: unknown) { return typeof value === "string" && UUID.test(value); }
function record(value: unknown, keys: readonly string[]) {
  if (types.isProxy(value)) throw fail();
  try { return taskListRecord(value, keys); } catch { throw fail(); }
}
function active(signal: AbortSignal) { if (signal.aborted) throw fail(); }
function revoked(error: unknown) {
  return !!error && typeof error === "object" && !types.isProxy(error) &&
    Object.getOwnPropertyDescriptor(error, "code")?.value === "P0001" &&
    Object.getOwnPropertyDescriptor(error, "message")?.value === "SESSION_REVOKED";
}
