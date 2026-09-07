import "server-only";

import { createHash, createHmac } from "node:crypto";
import { performance } from "node:perf_hooks";
import { CARESLINK_PRODUCTION_SUPABASE_REF as PARENT } from "./ndis-shadow-guard";
import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import { createCaresLinkV1CommunicationNoteJobStatusPreviewDatabaseTarget } from "./communication-note-job-status-purpose-caller.server";
import { createJobStatusPgControlOpener, createJobStatusPgRuntimeOpener,
  createJobStatusPostgresCredentialResolver, createJobStatusSqlBroker } from "./communication-note-job-status-postgres.server";

export const JOB_STATUS_PREVIEW_ISSUER_READY = false as const;
const BRANCHES_URL = `https://api.supabase.com/v1/projects/${PARENT}/branches`;
const unavailable = () => new Error("Job status Preview issuer unavailable");
const sha = (value: unknown) => createHash("sha256").update(stringifyCaresLinkV1CanonicalJson(value)).digest("hex");
type Context = Readonly<{ signal: AbortSignal }>;
type Token = Readonly<{ accessToken: string; scope: "environment:read"; expiresAt: string }>;
type DatabaseCredential = Readonly<{ projectRef: string; password: string; expiresAt: string }>;

/** Server-owned composition, not an HTTP endpoint or formal reader installation.
 * Credential custody is an explicit deployment dependency. OAuth is used for
 * one fixed read-only branch listing; it never obtains database credentials.
 * Separate custody supplies the database secret only after target validation.
 * Both physical connectors derive the SAME direct hostname and pinned CA here.
 */
export function createJobStatusPreviewIssuerService(input: {
  projectRef: string; ca: Buffer; expectedCaSha256: string; projectRefHmacKey: Buffer;
  loadAccessToken(context: Context): Promise<Token>;
  loadDatabaseCredential(request: Readonly<{ projectRef: string; purpose: "JOB_STATUS_ISSUER_CONTROL_ONLY" }>, context: Context): Promise<DatabaseCredential>;
}) {
  const { projectRef, expectedCaSha256, loadAccessToken, loadDatabaseCredential } = input;
  const ca = Buffer.from(input.ca), hmacKey = Buffer.from(input.projectRefHmacKey);
  if (!/^[a-z0-9]{20}$/.test(projectRef) || projectRef === PARENT ||
      ca.length === 0 || ca.length > 65536 || !/^[a-f0-9]{64}$/.test(expectedCaSha256) ||
      createHash("sha256").update(ca).digest("hex") !== expectedCaSha256 ||
      hmacKey.length !== 32 || hmacKey.every(byte => byte === 0)) throw unavailable();
  const refHmac = (ref: string) => createHmac("sha256",hmacKey)
    .update(`careslink:job-status:project-ref:v1:${ref}`).digest("hex");
  const credentialRequest = Object.freeze({ projectRef, purpose: "JOB_STATUS_ISSUER_CONTROL_ONLY" as const });
  return Object.freeze({ async resolve(context: Context) {
    active(context.signal);
    const started = Date.now(), startedMono = performance.now();
    const signal = AbortSignal.any([context.signal, AbortSignal.timeout(5000)]);
    const fresh = () => {
      active(signal);
      if (Date.now() < started || Date.now() - started > 5000 || performance.now() - startedMono > 5000) throw unavailable();
    };
    try {
      const token = await bounded(loadAccessToken({ signal }), signal);
      fresh();
      if (token.scope !== "environment:read" || typeof token.accessToken !== "string" ||
          !/^[A-Za-z0-9_.+\/=:-]{20,4096}$/.test(token.accessToken) ||
          !timestamp(token.expiresAt) || Date.parse(token.expiresAt) <= Date.now() + 5000) throw unavailable();
      const response = await bounded(fetch(BRANCHES_URL, { method:"GET", redirect:"error", cache:"no-store",
        credentials:"omit", headers:{ authorization:`Bearer ${token.accessToken}`, accept:"application/json" }, signal }), signal);
      fresh();
      if (response.status !== 200 || response.redirected || response.url !== BRANCHES_URL ||
          !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) {
        await response.body?.cancel(); throw unavailable();
      }
      const rows: unknown = JSON.parse(await readBoundedBody(response,signal));
      fresh();
      if (!Array.isArray(rows) || rows.length > 1000) throw unavailable();
      const matches = rows.filter(row => row && typeof row === "object" && row.project_ref === projectRef);
      if (matches.length !== 1) throw unavailable();
      const branch = matches[0];
      if (branch.parent_project_ref !== PARENT || branch.is_default !== false || branch.persistent !== false ||
          branch.with_data !== false || branch.status !== "FUNCTIONS_DEPLOYED" ||
          branch.preview_project_status !== "ACTIVE_HEALTHY" || branch.deletion_scheduled_at != null ||
          typeof branch.id !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(branch.id)) throw unavailable();
      const observedAt = new Date(started).toISOString();
      const expiresAt = new Date(started + 60000).toISOString();
      // Only selected, content-free metadata is hashed. No raw branch response,
      // project secret or OAuth credential is returned, persisted or logged.
      const evidence = { branchId:branch.id, projectRef, parentProjectRef:PARENT,
        isDefault:false, persistent:false, withData:false, status:branch.status,
        projectStatus:branch.preview_project_status, observedAt, expiresAt, caSha256:expectedCaSha256 };
      const databaseTarget = createCaresLinkV1CommunicationNoteJobStatusPreviewDatabaseTarget({
        status:"VALIDATED_DISPOSABLE_PREVIEW_TARGET_NOT_APPROVED", deploymentEnvironment:"PREVIEW",
        targetClass:"DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW", targetProjectRefHmac:refHmac(projectRef),
        productionProjectRefHmac:refHmac(PARENT), controlPlaneEvidenceSha256:sha(evidence),
        databaseName:"postgres", postgresMajor:17, projectStatus:"ACTIVE_HEALTHY", connectionMode:"DIRECT", port:5432,
        tlsMode:"VERIFY_FULL_PINNED_CA", tlsRootCertificateSha256:expectedCaSha256, observedAt, expiresAt,
        defaultBranch:false, persistent:false, withData:false, productionExcluded:true, rawCredentialMaterialPresent:false });
      // PG17 is a required target contract, independently checked by BOTH real
      // connections before any issuer RPC or product query can execute.
      const broker = createJobStatusSqlBroker(createJobStatusPgControlOpener({ projectRef, ca,
        loadCredential: async callContext => bounded(loadDatabaseCredential(credentialRequest,callContext),callContext.signal) }));
      const credentialResolver = createJobStatusPostgresCredentialResolver({ target:databaseTarget, broker,
        openRuntime:createJobStatusPgRuntimeOpener({projectRef,ca,target:databaseTarget}) });
      fresh();
      return Object.freeze({ projectRef, databaseTarget, credentialResolver,
        clock:Object.freeze({ now:()=>new Date().toISOString() }) });
    } catch { throw unavailable(); }
  } });
}

async function readBoundedBody(response: Response, signal: AbortSignal) {
  const length=response.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length)>131072)) {
    await response.body?.cancel(); throw unavailable();
  }
  const reader=response.body?.getReader();
  if (!reader) throw unavailable();
  const chunks:Uint8Array[]=[]; let total=0;
  try {
    for (;;) {
      const next=await bounded(reader.read(),signal);
      if(next.done)break;
      total+=next.value.byteLength;
      if(total>131072)throw unavailable();
      chunks.push(next.value);
    }
    return new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks));
  } finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
}
function active(signal: AbortSignal) { if (!(signal instanceof AbortSignal) || signal.aborted) throw unavailable(); }
function timestamp(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
async function bounded<T>(promise:Promise<T>, signal:AbortSignal):Promise<T> {
  // A custody operation may settle after cancellation; observe its rejection.
  void promise.catch(()=>{});
  active(signal);
  let stop:()=>void=()=>{};
  try { return await Promise.race([promise,new Promise<never>((_,reject)=>{
    stop=()=>reject(unavailable()); signal.addEventListener("abort",stop,{once:true});
  })]); } finally { signal.removeEventListener("abort",stop); }
}
