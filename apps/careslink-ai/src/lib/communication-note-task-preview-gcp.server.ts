import "server-only";
import { createHash, createPublicKey } from "node:crypto";
import { createRequire } from "node:module";
import { request as httpsRequest } from "node:https";
import { types } from "node:util";
import { jwtVerify } from "jose";
import { taskListRecord } from "./communication-note-task-list";
import { createTaskPreviewControlCustodyFactory, type TaskPreviewCustodyBinding, type TaskPreviewCustodyProvider } from "./communication-note-task-preview-custody.server";
import { consumeJobStatusCustodyValue as consumeValue } from "./v1/communication-note-job-status-custody-consumer.server";
import { stringifyCaresLinkV1CanonicalJson } from "./v1/canonical-json";

const crc32c = createRequire(import.meta.url)("fast-crc32c") as { calculate(value: Uint8Array): number };
const PROJECT = "careslink-m1u-security", REGION = "australia-southeast1", PURPOSE = "TASK_LIST_ISSUER_CONTROL_ONLY";
const ROOT = `projects/${PROJECT}/locations/${REGION}`;
/** Candidate task-only resources; names are a source contract, NOT evidence that
 * resources exist or permission to provision them. Old M1u identities/secrets
 * are intentionally absent. Resource/identity selection requires approval before
 * installation. All versions are numeric; no latest/alias or discovered target. */
export const TASK_PREVIEW_GCP_RESOURCES = Object.freeze({
  wifProvider: "//iam.googleapis.com/projects/288554824534/locations/global/workloadIdentityPools/task-preview-control/providers/oidc",
  serviceAccount: `careslink-task-preview-control@${PROJECT}.iam.gserviceaccount.com`,
  manifestKey: `${ROOT}/keyRings/careslink-preview-m1u/cryptoKeys/hmac-task-control-source-v1/cryptoKeyVersions/1`,
  oauthSecret: `${ROOT}/secrets/task-preview-control-oauth/versions/1`,
  databaseSecret: `${ROOT}/secrets/task-preview-control-database/versions/1`,
});
export const COMMUNICATION_NOTE_TASK_PREVIEW_GCP_READY = false as const;
const R = TASK_PREVIEW_GCP_RESOURCES, SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const STS = "https://sts.googleapis.com/v1/token";
const IAM = `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${R.serviceAccount}:generateAccessToken`;
const KMS = `https://cloudkms.googleapis.com/v1/${R.manifestKey}:macVerify`;
const secretUrl = (name: string) => `https://secretmanager.${REGION}.rep.googleapis.com/v1/${name}:access`;
const URLS = new Set([STS, IAM, KMS, secretUrl(R.oauthSecret), secretUrl(R.databaseSecret)]);
const fail = () => new Error("Task Preview GCP custody unavailable");
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const digest = (value: unknown) => sha(stringifyCaresLinkV1CanonicalJson(value));
type Context = Readonly<{ signal: AbortSignal }>;
export type TaskPreviewOidcIdentity = Readonly<{ issuer: string; audience: string; subject: string; keyId: string; publicKeyPem: string }>;
type Options = Readonly<{ binding: TaskPreviewCustodyBinding; identity: TaskPreviewOidcIdentity; manifestMac: Uint8Array;
  /** Fresh token of this workload, delivered once by its independently trusted
   * host identity source. No ambient credentials or base-token exchange fallback. */
  consumeWorkloadToken(context: Context, use: (token: string) => Promise<void>): Promise<void>;
}>;
export const TASK_PREVIEW_GCP_CREDENTIAL_POLICY_SHA256 = digest({ domain: "careslink.task-control.credentials.v1",
  purpose: PURPOSE, oauthScope: "environment:read", resources: R });

export function taskPreviewGcpIdentitySha256(identity: TaskPreviewOidcIdentity): string {
  const i = parseIdentity(identity);
  return digest({ domain: "careslink.task-control.oidc.v1", issuer: i.issuer, audience: i.audience,
    subject: i.subject, keyId: i.keyId, publicKeySha256: sha(i.publicKeyPem), wifProvider: R.wifProvider, serviceAccount: R.serviceAccount });
}
export function taskPreviewGcpManifestData(binding: TaskPreviewCustodyBinding): Buffer {
  return Buffer.from(stringifyCaresLinkV1CanonicalJson({ domain: "careslink.task-control.source-manifest.v1", binding, resources: R }));
}

/** Concrete OIDC verification + fixed Google REST provider, uninstalled. The
 * approved host must supply current issuer key provenance and a signed source
 * manifest from an independent signer. Runtime IAM must allow macVerify ONLY,
 * not macSign/key administration; this code never acquires those permissions.
 * RSA verification is local; STS/IAM and KMS are independent remote checks.
 * Signature validity is not proof that this factory is running on the approved
 * host: trustworthy token delivery and installed-host attestation remain gates.
 */
export function createTaskPreviewGcpCustodyFactory(input: Options) {
  const o = record(input, ["binding", "identity", "manifestMac", "consumeWorkloadToken"]);
  const binding = Object.freeze(record(o.binding, ["projectRef", "branchId", "caSha256", "sourceRevisionSha256", "sourceManifestSha256",
    "workloadIdentitySha256", "credentialPolicySha256", "oauthAppReferenceSha256", "oauthGrantReferenceSha256"])) as TaskPreviewCustodyBinding;
  const identity = parseIdentity(o.identity), publicKey = createPublicKey(identity.publicKeyPem);
  if (types.isProxy(o.manifestMac) || !(o.manifestMac instanceof Uint8Array) || o.manifestMac.byteLength !== 32 ||
      types.isProxy(o.consumeWorkloadToken) || typeof o.consumeWorkloadToken !== "function" ||
      binding.workloadIdentitySha256 !== taskPreviewGcpIdentitySha256(identity) ||
      binding.credentialPolicySha256 !== TASK_PREVIEW_GCP_CREDENTIAL_POLICY_SHA256) throw fail();
  const mac = Buffer.from(o.manifestMac), manifest = taskPreviewGcpManifestData(binding);
  const consumeToken = o.consumeWorkloadToken as Options["consumeWorkloadToken"];
  // Validate the complete binding before any token/HTTP IO or returned factory.
  createTaskPreviewControlCustodyFactory({ binding, provider: { verifyWorkload: async () => {}, consumeOAuth: async () => {}, consumeDatabase: async () => {} } });
  return (original: Context) => {
    let credential = "", credentialExpires = 0, proof = "", nonce: unknown, signal: AbortSignal | undefined;
    let stage: "NEW" | "VERIFIED" | "OAUTH" | "DATABASE" | "CLOSED" = "NEW";
    const close = () => { stage = "CLOSED"; credential = ""; credentialExpires = 0; signal?.removeEventListener("abort", close); };
    const active = (context: Context) => {
      if (stage === "CLOSED" || context.signal !== signal || context.signal.aborted) throw fail();
    };
    const authorized = async (url: string, context: Context, body?: string) => {
      active(context); if (!credential || Date.now() >= credentialExpires) throw fail();
      const result = await json(url, context.signal, body, credential); active(context);
      if (Date.now() >= credentialExpires) throw fail(); return result;
    };
    const secret = async (name: string, context: Context) => {
      const result = record(await authorized(secretUrl(name), context), ["name", "payload"]);
      if (result.name !== name) throw fail();
      const payload = record(result.payload, ["data", "dataCrc32c"]), bytes = base64(payload.data, 8192);
      try {
        if (!/^\d{1,10}$/.test(String(payload.dataCrc32c)) || Number(payload.dataCrc32c) !== crc32c.calculate(bytes)) throw fail();
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
      } finally { bytes.fill(0); payload.data = ""; }
    };
    const same = (request: Readonly<Record<string, unknown>>, context: Context) => {
      active(context);
      if (request.nonce !== nonce || request.workloadEvidenceSha256 !== proof || request.purpose !== PURPOSE ||
          Object.entries(binding).some(([k,v]) => request[k] !== v)) throw fail();
    };
    const provider: TaskPreviewCustodyProvider = Object.freeze({
      async verifyWorkload(request, context) {
        try {
          if (stage !== "NEW") throw fail(); signal = context.signal; signal.addEventListener("abort", close, { once: true });
          active(context); nonce = request.nonce;
          const jwtEvidence = await consumeValue<string, string>({ signal, consume: use => consumeToken(context, use), use: async token => {
            if (typeof token !== "string" || token.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw fail();
            const { payload, protectedHeader } = await jwtVerify(token, publicKey, { algorithms: ["RS256"], issuer: identity.issuer,
              audience: identity.audience, subject: identity.subject, currentDate: new Date(), clockTolerance: 0, maxTokenAge: 300,
              requiredClaims: ["iss", "aud", "sub", "iat", "nbf", "exp", "jti"] });
            active(context);
            if (protectedHeader.alg !== "RS256" || protectedHeader.kid !== identity.keyId ||
                Object.keys(protectedHeader).some(k => !["alg", "kid", "typ"].includes(k)) ||
                (protectedHeader.typ !== undefined && protectedHeader.typ !== "JWT") || payload.aud !== identity.audience ||
                !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.nbf) || !Number.isSafeInteger(payload.exp) ||
                payload.exp! * 1000 < Date.now() + 2000 || payload.exp! - payload.iat! > 3600 ||
                typeof payload.jti !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(payload.jti)) throw fail();
            const sts = record(await json(STS, signal!, new URLSearchParams({ audience: R.wifProvider,
              grant_type: "urn:ietf:params:oauth:grant-type:token-exchange", requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
              scope: SCOPE, subject_token: token, subject_token_type: "urn:ietf:params:oauth:token-type:jwt" }).toString()),
            ["access_token", "issued_token_type", "token_type", "expires_in"]);
            if (sts.issued_token_type !== "urn:ietf:params:oauth:token-type:access_token" || sts.token_type !== "Bearer" ||
                !Number.isInteger(sts.expires_in) || (sts.expires_in as number) < 2 || (sts.expires_in as number) > 3600) throw fail();
            try {
              const iam = record(await json(IAM, signal!, JSON.stringify({ scope: [SCOPE], lifetime: "600s" }), accessToken(sts.access_token)), ["accessToken", "expireTime"]);
              credential = accessToken(iam.accessToken); credentialExpires = googleTime(iam.expireTime); iam.accessToken = "";
              if (credentialExpires < Date.now() + 2000 || credentialExpires > Date.now() + 600000) throw fail();
              active(context); return digest({ issuer: payload.iss, subject: payload.sub, audience: payload.aud, jti: payload.jti, exp: payload.exp });
            } finally { sts.access_token = ""; }
          } });
          const result = record(await authorized(KMS, context, JSON.stringify({ data: manifest.toString("base64"), mac: mac.toString("base64"),
            dataCrc32c: String(crc32c.calculate(manifest)), macCrc32c: String(crc32c.calculate(mac)) })),
          ["name", "success", "verifiedDataCrc32c", "verifiedMacCrc32c", "verifiedSuccessIntegrity", "protectionLevel"]);
          if (result.name !== R.manifestKey || result.success !== true || result.verifiedDataCrc32c !== true ||
              result.verifiedMacCrc32c !== true || result.verifiedSuccessIntegrity !== true || result.protectionLevel !== "SOFTWARE") throw fail();
          active(context); stage = "VERIFIED";
          proof = digest({ domain: "careslink.task-control.gcp-proof.v1", requestSha256: digest(request), jwtEvidence,
            manifestSha256: sha(manifest), manifestMacSha256: sha(mac), principal: R.serviceAccount });
          const now = Date.now(); return { status: "VERIFIED_TASK_CONTROL_WORKLOAD", requestSha256: digest(request), workloadEvidenceSha256: proof,
            verifiedAt: new Date(now).toISOString(), expiresAt: new Date(Math.min(now + 60000, credentialExpires)).toISOString() };
        } catch { close(); throw fail(); }
      },
      async consumeOAuth(request, context, consumer) {
        try {
          same(request, context); if (stage !== "VERIFIED" || request.action !== "CONSUME_TASK_CONTROL_OAUTH") throw fail(); stage = "OAUTH";
          const value = record(await secret(R.oauthSecret, context), ["purpose", "projectRef", "branchId", "oauthScope", "oauthAppReferenceSha256",
            "oauthGrantReferenceSha256", "accessToken", "expiresAt"]);
          if (value.purpose !== PURPOSE || value.projectRef !== binding.projectRef || value.branchId !== binding.branchId ||
              value.oauthScope !== "environment:read" || value.oauthAppReferenceSha256 !== binding.oauthAppReferenceSha256 ||
              value.oauthGrantReferenceSha256 !== binding.oauthGrantReferenceSha256) throw fail();
          const delivery = { requestSha256: digest(request), credentialClass: "SUPABASE_OAUTH_ACCESS_TOKEN", oauthScope: "environment:read",
            secret: value.accessToken, expiresAt: value.expiresAt };
          try { active(context); await consumer(delivery); active(context); }
          finally { delivery.secret = ""; value.accessToken = ""; }
        } catch { close(); throw fail(); }
      },
      async consumeDatabase(request, context, consumer) {
        try {
          same(request, context); if (stage !== "OAUTH" || request.action !== "CONSUME_TASK_CONTROL_DATABASE_PASSWORD") throw fail(); stage = "DATABASE";
          const value = record(await secret(R.databaseSecret, context), ["purpose", "projectRef", "branchId", "caSha256", "password"]);
          if (value.purpose !== PURPOSE || value.projectRef !== binding.projectRef || value.branchId !== binding.branchId || value.caSha256 !== binding.caSha256) throw fail();
          const delivery = { requestSha256: digest(request), credentialClass: "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD", sourceExpiresAt: null,
            sourceRevocation: "BRANCH_DELETE_OR_PASSWORD_RESET", secret: value.password, deliveryExpiresAt: new Date(Date.now() + 60000).toISOString() };
          try { active(context); await consumer(delivery); active(context); }
          finally { delivery.secret = ""; value.password = ""; }
          close();
        } catch { close(); throw fail(); }
      },
    });
    return createTaskPreviewControlCustodyFactory({ binding, provider })(original);
  };
}

function parseIdentity(value: unknown): TaskPreviewOidcIdentity {
  const i = record(value, ["issuer", "audience", "subject", "keyId", "publicKeyPem"]);
  try {
    if (typeof i.issuer !== "string" || i.issuer.length > 2048) throw fail();
    const issuer = new URL(i.issuer as string);
    if (issuer.protocol !== "https:" || issuer.username || issuer.password || issuer.search || issuer.hash || issuer.href !== i.issuer ||
        typeof i.audience !== "string" || i.audience !== `https:${R.wifProvider}` ||
        typeof i.subject !== "string" || !/^[\x21-\x7e]{1,512}$/.test(i.subject) ||
        typeof i.keyId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(i.keyId) ||
        typeof i.publicKeyPem !== "string" || i.publicKeyPem.length > 8192 || !i.publicKeyPem.startsWith("-----BEGIN PUBLIC KEY-----\n")) throw fail();
    const key = createPublicKey(i.publicKeyPem), bits = key.asymmetricKeyDetails?.modulusLength;
    if (key.type !== "public" || key.asymmetricKeyType !== "rsa" || !bits || bits < 2048 || bits > 4096 ||
        key.export({ format: "pem", type: "spki" }) !== i.publicKeyPem) throw fail();
    return Object.freeze(i) as TaskPreviewOidcIdentity;
  } catch { throw fail(); }
}
function record(value: unknown, keys: readonly string[]) {
  try { if (types.isProxy(value)) throw fail(); return taskListRecord(value, keys); } catch { throw fail(); }
}
function accessToken(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.+\/=:-]{20,4096}$/.test(value)) throw fail(); return value;
}
function base64(value: unknown, max: number): Buffer {
  if (typeof value !== "string" || value.length > Math.ceil(max / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw fail();
  const bytes = Buffer.from(value, "base64"); if (bytes.length === 0 || bytes.length > max || bytes.toString("base64") !== value) throw fail(); return bytes;
}
function googleTime(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3}|\.\d{6}|\.\d{9})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw fail();
  if (new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19)) throw fail();
  return Date.parse(value);
}

/** Fixed Google endpoints, explicit TLS verification, no global fetch/proxy
 * customization, redirect, retry, pool or credential discovery. The outer
 * custody deadline bounds all calls together; each socket has its own cap. */
async function json(url: string, signal: AbortSignal, body?: string, bearer?: string): Promise<unknown> {
  if (!URLS.has(url) || signal.aborted || (body && Buffer.byteLength(body) > 32768)) throw fail();
  return new Promise((resolve, reject) => {
    let done = false, client: ReturnType<typeof httpsRequest> | undefined, timer: ReturnType<typeof setTimeout> | undefined;
    const chunks: Buffer[] = [];
    const finish = (value?: unknown, error = false) => {
      if (done) return; done = true; clearTimeout(timer); client?.destroy(); chunks.forEach(c => c.fill(0)); chunks.length = 0;
      if (error || signal.aborted) reject(fail()); else resolve(value);
    };
    try {
      client = httpsRequest(url, { method: body === undefined ? "GET" : "POST", agent: false, rejectUnauthorized: true, minVersion: "TLSv1.2",
        signal, headers: { accept: "application/json", ...(body === undefined ? {} : { "content-type": url === STS ? "application/x-www-form-urlencoded" : "application/json" }),
          ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) } }, response => {
        let size = 0;
        if (done) { response.destroy(); return; }
        if (response.statusCode !== 200 || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(String(response.headers["content-type"] ?? ""))) {
          response.destroy(); finish(undefined, true); return;
        }
        response.on("data", chunk => { if (done) return; const data = Buffer.from(chunk); size += data.length;
          if (size > 32768) { data.fill(0); response.destroy(); finish(undefined, true); } else chunks.push(data); });
        response.once("error", () => finish(undefined, true)); response.once("aborted", () => finish(undefined, true));
        response.once("end", () => { if (done) return; try {
          const bytes = Buffer.concat(chunks); try { finish(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))); }
          finally { bytes.fill(0); chunks.forEach(c => c.fill(0)); }
        } catch { finish(undefined, true); } });
      });
      client.once("error", () => finish(undefined, true)); timer = setTimeout(() => finish(undefined, true), 2000);
      client.end(body);
    } catch { finish(undefined, true); }
  });
}
