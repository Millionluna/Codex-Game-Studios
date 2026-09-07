import "server-only";

import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { realpath } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { types as nodeTypes } from "node:util";
import { Client, type ClientConfig } from "pg";
import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./ndis-shadow-guard";
import {
  createCaresLinkV1CommunicationNoteJobStatusCredentialResolver,
  createCaresLinkV1CommunicationNoteJobStatusPurposeSessionLease,
  createCaresLinkV1CommunicationNoteJobStatusPreviewDatabaseTarget,
  CARESLINK_V1_COMMUNICATION_NOTE_JOB_STATUS_PURPOSE_CALLER_POLICY as POLICY,
  type CaresLinkV1CommunicationNoteJobStatusPreviewDatabaseTarget as Target,
} from "./communication-note-job-status-purpose-caller.server";
import { CARESLINK_V1_COMMUNICATION_NOTE_JOB_STATUS_POSTGRES_SQL as SQL } from "./communication-note-job-status-repository.server";

export const COMMUNICATION_NOTE_JOB_STATUS_POSTGRES_READY = false as const;
const ROLE = /^careslink_v1_job_status_runtime_[a-f0-9]{16}$/;
const SHA = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const CALLER = "careslink_v1_generation_job_status_caller";
const hash = (value: unknown) => createHash("sha256").update(stringifyCaresLinkV1CanonicalJson(value)).digest("hex");
const fail = () => new Error("Job status PostgreSQL dependency unavailable");
type Context = Readonly<{ signal: AbortSignal }>;
type Operation = "acquire" | "bind" | "fence" | "finalize";
type RecordData = Record<string, unknown>;
export type JobStatusSqlControlConnection = {
  query(sql: string, values?: unknown[]): Promise<{ rows: RecordData[] }>;
  end(): Promise<void>;
};
export type JobStatusIssuerBroker = {
  call(op: Operation, data: Readonly<RecordData>, context: Context): Promise<RecordData>;
};
export type JobStatusPhysicalSession = {
  identity: Readonly<{ pid: number; start: string; login: string; oid: string }>;
  query(sql: string, values: readonly unknown[], context: Context): Promise<{ rows: unknown[] }>;
  close(): Promise<void>;
};
export type JobStatusRuntimeOpener = (input: Readonly<{
  role: string; password: string; expiresAt: string;
}>, context: Context) => Promise<JobStatusPhysicalSession>;

/** Only fixed issuer RPC calls. The server owns a NEW, exclusively leased
 * management connection per operation, in autocommit mode (no ambient BEGIN).
 * No credential lookup, generic SQL API, product route, or cloud activation.
 */
export function createJobStatusSqlBroker(
  openControl: (context: Context) => Promise<JobStatusSqlControlConnection>,
): JobStatusIssuerBroker {
  return Object.freeze({ async call(op, data, context) {
    if (!["acquire", "bind", "fence", "finalize"].includes(op)) throw fail();
    active(context.signal);
    let connection: JobStatusSqlControlConnection | undefined;
    let stopped = false;
    const close = () => { stopped = true; void connection?.end().catch(() => {}); };
    context.signal.addEventListener("abort", close, { once: true });
    try {
      connection = await openControl(context);
      if (stopped) throw fail();
      active(context.signal);
      const result = await connection.query(
        "select careslink_job_status_issuer.call($1::text,$2::jsonb) as data", [op, JSON.stringify(data)],
      );
      active(context.signal);
      if (result.rows.length !== 1) throw fail();
      return record(result.rows[0].data);
    } finally {
      context.signal.removeEventListener("abort", close);
      await connection?.end();
    }
  } });
}

/** Real issuance/lifecycle implementation; the dedicated broker must enforce
 * durable digest serialization, a committed NOLOGIN fence, and residue checks.
 * Its LOCAL SQL implementation is deliberately not a deployable migration yet.
 */
export function createJobStatusPostgresCredentialResolver(options: {
  target: Target; broker: JobStatusIssuerBroker; openRuntime: JobStatusRuntimeOpener;
}) {
  const target = createCaresLinkV1CommunicationNoteJobStatusPreviewDatabaseTarget(options.target);
  const targetDigest = hash(target);
  const { broker, openRuntime } = options;
  const operate = async (op: Operation, data: RecordData, context: Context) => {
    const result = await broker.call(op, Object.freeze({ ...data, targetDigest }), context);
    if (result.digest !== data.digest || result.targetDigest !== targetDigest) throw fail();
    return result;
  };
  const cleanup = async (digest: string, context: Context) => {
    const fence = await operate("fence", { digest }, context);
    if (!["FENCED", "REVOKED"].includes(String(fence.state))) throw fail();
    const result = await operate("finalize", { digest }, context);
    if (result.state !== "REVOKED" || result.roleCount !== 0 || result.sessionCount !== 0 ||
        result.membershipCount !== 0) throw fail();
    return result;
  };
  return createCaresLinkV1CommunicationNoteJobStatusCredentialResolver({
    capability: "INJECTED_JOB_STATUS_CREDENTIAL_RESOLVER",
    async acquire(raw: unknown, context: Context) {
      const request = validateAcquisition(raw, target, targetDigest);
      active(context.signal);
      const role = "careslink_v1_job_status_runtime_" + randomBytes(8).toString("hex");
      const lease = hash(randomBytes(32).toString("hex"));
      const secret = credential();
      let session: JobStatusPhysicalSession | undefined;
      try {
        const issued = await operate("acquire", { digest: request.requestDigest, role, lease,
          verifier: secret.verifier, expiresAt: request.requestedExpiresAt }, context);
        if (issued.state !== "ISSUED" || issued.role !== role || issued.lease !== lease ||
            typeof issued.oid !== "string" || !/^\d+$/.test(issued.oid) ||
            !timestamp(issued.issuedAt) || !timestamp(issued.expiresAt) ||
            Date.parse(issued.issuedAt) < Date.parse(String(request.observedAt)) ||
            Date.parse(issued.expiresAt) > Date.parse(String(request.requestedExpiresAt))) throw fail();
        active(context.signal);
        session = await openRuntime({ role, password: secret.password, expiresAt: issued.expiresAt }, context);
        active(context.signal);
        if (session.identity.login !== role || session.identity.oid !== issued.oid ||
            !Number.isSafeInteger(session.identity.pid) || session.identity.pid <= 0 || !timestamp(session.identity.start)) throw fail();
        const binding = hash({ lease, ...session.identity });
        const bound = await operate("bind", { digest: request.requestDigest,
          pid: session.identity.pid, start: session.identity.start, binding }, context);
        if (bound.state !== "BOUND" || bound.role !== role || bound.lease !== lease || bound.binding !== binding) throw fail();
        active(context.signal);
        const physical = session;
        const copied = ["requestDigest", "deploymentEnvironment", "targetClass", "purpose", "callerRole", "rpcNames",
          "rpcParameterCount", "databaseTargetDigest", "targetProjectRefHmac", "productionProjectRefHmac",
          "controlPlaneEvidenceSha256", "databaseName", "postgresMajor", "projectStatus", "connectionMode", "port",
          "tlsMode", "tlsRootCertificateSha256", "roleActivationMode"];
        return createCaresLinkV1CommunicationNoteJobStatusPurposeSessionLease({
          capability: "INJECTED_JOB_STATUS_EXCLUSIVE_SESSION",
          descriptor: { ...Object.fromEntries(copied.map(key => [key, request[key]])),
            status: "ACTIVE_SINGLE_USE_PURPOSE_SESSION_NOT_APPROVED", effectiveRole: CALLER, runtimeRole: role,
            requiredConnectionMode: "ONE_PHYSICAL_SESSION_SINGLE_USE", transactionMode: "ONE_ATOMIC_STATEMENT",
            transactionPoolerUsed: false, preparedStatementsUsed: false,
            callerMembershipAdmin: false, callerMembershipInherit: false, callerMembershipSet: true,
            executorMembershipPresent: false, serviceRoleFallback: false,
            leaseReferenceSha256: lease, sessionBindingSha256: binding,
            issuedAt: issued.issuedAt, expiresAt: issued.expiresAt, revokeBy: issued.expiresAt,
            reuseAllowed: false, concurrentUseAllowed: false, rawCredentialMaterialPresent: false },
          query: (sql: string, values: readonly unknown[], callContext: Context) => physical.query(sql, values, callContext),
          async destroy(callContext: Context) {
            // Broker fencing/termination is authoritative even if TCP close fails.
            try { await physical.close(); } finally {
              const actual = await cleanup(String(request.requestDigest), callContext);
              if (actual.role !== role || actual.lease !== lease || actual.binding !== binding) throw fail();
            }
            return receipt({ status: "DESTROYED_NOT_APPROVED", leaseReferenceSha256: lease,
              sessionBindingSha256: binding, runtimeRole: role, reportedAt: new Date().toISOString(),
              sessionTerminated: true, activeStatementCount: 0, inFlightStatementDisposition: "SETTLED_OR_CANCELLED",
              reusable: false, rawCredentialMaterialPresent: false });
          },
        });
      } catch {
        // Always clean locally as well: an acquire can settle after its caller's
        // timeout. A separate cleanup signal must outlive the cancelled request.
        const cleanupContext = { signal: AbortSignal.timeout(4500) };
        try { await session?.close(); } finally { await cleanup(String(request.requestDigest), cleanupContext); }
        throw fail();
      } finally { secret.password = ""; secret.verifier = ""; }
    },
    async revoke(raw: unknown, context: Context) {
      const request = validateRevocation(raw, targetDigest);
      const result = await cleanup(String(request.acquisitionRequestDigest), context);
      if (request.bindingState === "COMPLETE" &&
          (result.role !== request.runtimeRole || result.lease !== request.leaseReferenceSha256 ||
           result.binding !== request.sessionBindingSha256)) throw fail();
      return receipt({ status: "REVOKED_AND_TOMBSTONED_NOT_APPROVED", requestDigest: request.requestDigest,
        acquisitionRequestDigest: request.acquisitionRequestDigest, leaseReferenceSha256: request.leaseReferenceSha256,
        sessionBindingSha256: request.sessionBindingSha256, runtimeRole: request.runtimeRole,
        reportedAt: new Date().toISOString(), credentialDisposition: result.role === null ? "NOT_ISSUED" : "REVOKED",
        acquisitionRequestTombstoned: true, futureIssuanceBlocked: true, lateIssuanceBlockedAtomically: true,
        activeSessionCount: 0, allIssuedSessionsTerminated: true, inFlightStatementsSettled: true,
        reusable: false, rawCredentialMaterialPresent: false });
    },
  });
}

/** Strict real pg.Client opener, direct PG17/TLS only. No DSN, ambient PG*
 * defaults, pool, insecure SSL fallback or dependency on privileged credentials.
 */
export function createJobStatusPgRuntimeOpener(input: { projectRef: string; ca: Buffer; target: Target }): JobStatusRuntimeOpener {
  const { projectRef } = input;
  const target = createCaresLinkV1CommunicationNoteJobStatusPreviewDatabaseTarget(input.target);
  const ca = Buffer.from(input.ca);
  if (!/^[a-z0-9]{20}$/.test(projectRef) || projectRef === CARESLINK_PRODUCTION_SUPABASE_REF ||
      target.connectionMode !== "DIRECT" || target.port !== 5432 || target.postgresMajor !== 17 ||
      target.tlsMode !== "VERIFY_FULL_PINNED_CA" || ca.length === 0 || ca.length > 65536 ||
      createHash("sha256").update(ca).digest("hex") !== target.tlsRootCertificateSha256) throw fail();
  return (request, context) => openPhysical(request, context, {
    host: `db.${projectRef}.supabase.co`, port: 5432, ssl: { ca, rejectUnauthorized: true },
  }, 17);
}

/** Local engine evidence only; never selectable from env or the formal route. */
export function createTestOnlyJobStatusUnixRuntimeOpener(input: { socket: string; port: 15437 }): JobStatusRuntimeOpener {
  if (!/^\/private\/tmp\/cl-job-status-[a-zA-Z0-9]{6}\/socket$/.test(input.socket) || input.port !== 15437) throw fail();
  const socket = input.socket;
  return async (request, context) => {
    if (await realpath(socket) !== socket) throw fail();
    return openPhysical(request, context, { host: socket, port: 15437, ssl: false }, 16);
  };
}

async function openPhysical(request: Parameters<JobStatusRuntimeOpener>[0], context: Context,
  endpoint: Pick<ClientConfig, "host" | "port" | "ssl">, major: 16 | 17): Promise<JobStatusPhysicalSession> {
  active(context.signal);
  if (!ROLE.test(request.role) || !/^[A-Za-z0-9_-]{43}$/.test(request.password) || !timestamp(request.expiresAt)) throw fail();
  const expires = Date.parse(request.expiresAt);
  const openedAt = Date.now(), monotonicDeadline = performance.now() + expires - openedAt;
  const fresh = () => Date.now() >= openedAt && Date.now() < expires && performance.now() < monotonicDeadline;
  if (!fresh() || expires > openedAt + 90000) throw fail();
  const config: ClientConfig = { ...endpoint, database: "postgres", user: request.role, password: request.password,
    application_name: "careslink-job-status-single-use", fallback_application_name: "", client_encoding: "UTF8",
    connectionTimeoutMillis: 3000, query_timeout: 6000, statement_timeout: 5000, lock_timeout: 1000,
    idle_in_transaction_session_timeout: 5000,
    options: "-c search_path= -c idle_session_timeout=10000", keepAlive: false };
  const client = new Client(config);
  const owned = client as Client & { password: unknown; connectionParameters: { password: unknown };
    connection: { stream: { destroy(): void; encrypted?: boolean; authorized?: boolean } } };
  let closed = false, used = false;
  const close = async () => { if (!closed) { closed = true; owned.connection.stream.destroy(); await client.end(); } };
  const abort = () => { void close().catch(() => {}); };
  client.on("error", abort);
  context.signal.addEventListener("abort", abort, { once: true });
  try {
    await client.connect();
    active(context.signal);
    if (major === 17 && (!owned.connection.stream.encrypted || !owned.connection.stream.authorized)) throw fail();
    const identity = (await client.query(`select pg_catalog.pg_backend_pid() as pid,
      to_char(backend_start at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as start,
      session_user::text as login, current_user::text as current, usesysid::text as oid,
      current_setting('server_version_num')::int/10000 as major, current_database() as database,
      current_setting('cluster_name') as cluster, inet_server_addr() is null as unix_only
      from pg_catalog.pg_stat_activity where pid=pg_catalog.pg_backend_pid()`)).rows[0];
    if (!identity || identity.login !== request.role || identity.current !== request.role || identity.major !== major ||
        identity.database !== "postgres" || (major === 16 && (!identity.unix_only || identity.cluster !== "careslink-job-status-local-pg16"))) throw fail();
    await client.query(`set role ${CALLER}`);
    if ((await client.query("select current_user::text as role")).rows[0].role !== CALLER) throw fail();
    active(context.signal);
    if (closed || !fresh()) throw fail();
    return Object.freeze({ identity: Object.freeze({ pid: identity.pid, start: identity.start, login: identity.login, oid: identity.oid }),
      close,
      async query(sql: string, values: readonly unknown[], callContext: Context) {
        active(callContext.signal);
        if (closed || used || !fresh() || sql !== SQL || !Array.isArray(values) || values.length !== 5 ||
            !values.slice(0,3).every(v => typeof v === "string" && UUID.test(v)) ||
            values[3] !== "1.0.0-shadow.1" || values[4] !== "2026-08-09.v1-shadow") throw fail();
        used = true;
        callContext.signal.addEventListener("abort", abort, { once: true });
        try {
          const result = await client.query(sql, [...values]);
          active(callContext.signal);
          if (closed || !fresh()) throw fail();
          return { rows: result.rows };
        } finally { callContext.signal.removeEventListener("abort", abort); }
      },
    });
  } catch { await close(); throw fail(); }
  finally {
    context.signal.removeEventListener("abort", abort);
    config.password = undefined; owned.password = undefined; owned.connectionParameters.password = undefined;
  }
}

function validateAcquisition(raw: unknown, target: Target, digest: string) {
  const r = signedRecord(raw);
  const expected = { version: POLICY.version, policyDigest: POLICY.policyDigest, deploymentEnvironment: "PREVIEW",
    targetClass: target.targetClass, purpose: POLICY.purpose, callerRole: CALLER, rpcNames: POLICY.rpcNames,
    rpcParameterCount: 5, databaseTargetDigest: digest, targetProjectRefHmac: target.targetProjectRefHmac,
    productionProjectRefHmac: target.productionProjectRefHmac, controlPlaneEvidenceSha256: target.controlPlaneEvidenceSha256,
    databaseName: "postgres", postgresMajor: 17, projectStatus: "ACTIVE_HEALTHY", connectionMode: target.connectionMode,
    port: 5432, tlsMode: target.tlsMode, tlsRootCertificateSha256: target.tlsRootCertificateSha256,
    roleActivationMode: POLICY.roleActivationMode, callerMembershipAdmin: false, callerMembershipInherit: false,
    callerMembershipSet: true, executorMembershipAllowed: false, transactionPoolerAllowed: false,
    serviceRoleFallbackAllowed: false, rawCredentialMaterialPresent: false };
  if (Object.keys(r).length !== Object.keys(expected).length + 4 ||
      Object.entries(expected).some(([key,value]) => hash(r[key]) !== hash(value)) ||
      typeof r.acquisitionNonceSha256 !== "string" || !SHA.test(r.acquisitionNonceSha256) ||
      !timestamp(r.observedAt) || !timestamp(r.requestedExpiresAt) ||
      Date.parse(r.observedAt) > Date.now() || Date.now() - Date.parse(r.observedAt) > 5000 ||
      Date.parse(r.requestedExpiresAt) > Date.parse(r.observedAt) + 90000 ||
      Date.parse(r.requestedExpiresAt) > Date.parse(target.expiresAt) ||
      Date.parse(r.requestedExpiresAt) - Date.now() < 25000) throw fail();
  return r;
}
function validateRevocation(raw: unknown, targetDigest: string) {
  const r = signedRecord(raw);
  const keys = ["version","policyDigest","purpose","callerRole","acquisitionRequestDigest","databaseTargetDigest",
    "bindingState","leaseReferenceSha256","sessionBindingSha256","runtimeRole","rawCredentialMaterialPresent","requestDigest"];
  if (Object.keys(r).length !== keys.length || keys.some(k => !Object.hasOwn(r,k)) || r.version !== POLICY.version ||
      r.policyDigest !== POLICY.policyDigest || r.purpose !== POLICY.purpose || r.callerRole !== CALLER ||
      r.databaseTargetDigest !== targetDigest || r.rawCredentialMaterialPresent !== false ||
      typeof r.acquisitionRequestDigest !== "string" || !SHA.test(r.acquisitionRequestDigest) ||
      !["NONE","PARTIAL","COMPLETE"].includes(String(r.bindingState))) throw fail();
  for (const key of ["leaseReferenceSha256","sessionBindingSha256","runtimeRole"]) {
    if (r[key] !== null && (typeof r[key] !== "string" || !(key === "runtimeRole" ? ROLE : SHA).test(r[key] as string))) throw fail();
    if (r.bindingState === "NONE" && r[key] !== null || r.bindingState === "COMPLETE" && r[key] === null) throw fail();
  }
  return r;
}
function record(value: unknown): RecordData {
  if (!value || typeof value !== "object" || Array.isArray(value) || nodeTypes.isProxy(value) ||
      Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).some(key => {
        const d = Object.getOwnPropertyDescriptor(value,key)!; return typeof key !== "string" || !d.enumerable || !("value" in d);
      })) throw fail();
  return value as RecordData;
}
function signedRecord(value: unknown) {
  const r = record(value); const { requestDigest, ...core } = r;
  if (typeof requestDigest !== "string" || !SHA.test(requestDigest) || hash(core) !== requestDigest) throw fail();
  return r;
}
function timestamp(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function active(signal: AbortSignal) { if (!(signal instanceof AbortSignal) || signal.aborted) throw fail(); }
function receipt(core: RecordData) { return Object.freeze({ ...core, receiptDigest: hash(core) }); }
function credential() {
  const password = randomBytes(32).toString("base64url"), salt = randomBytes(16);
  const salted = pbkdf2Sync(password,salt,4096,32,"sha256");
  const key = createHmac("sha256",salted).update("Client Key").digest();
  const stored = createHash("sha256").update(key).digest("base64");
  const server = createHmac("sha256",salted).update("Server Key").digest("base64");
  salted.fill(0); key.fill(0);
  return { password, verifier: `SCRAM-SHA-256$4096:${salt.toString("base64")}$${stored}:${server}` };
}
