import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import { CARESLINK_PRODUCTION_SUPABASE_REF as PARENT } from "./ndis-shadow-guard";
import type { createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeGcpAdapters } from "./communication-note-preview-product-runtime-gcp-adapters.server";
import { createJobStatusPreviewIssuerService, type JobStatusPreviewCustody } from "./communication-note-job-status-preview-issuer.server";
import { JOB_STATUS_CONTROL_APPLICATION_NAME } from "./communication-note-job-status-postgres.server";
import { createCommunicationNoteJobRecoveryComposition } from "../communication-note-job-recovery-composition.server";

export const JOB_STATUS_CUSTODIED_RECOVERY_READY = false as const;
type Context = Readonly<{ signal: AbortSignal }>;
type Bundle = Awaited<ReturnType<typeof createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeGcpAdapters>>;
type RecoveryOptions = Parameters<typeof createCommunicationNoteJobRecoveryComposition>[0];
type Configuration = Readonly<{
  projectRef: string; expectedCaSha256: string; sourceRevisionSha256: string;
  sourceManifestSha256: string; oauthAppReferenceSha256: string; oauthGrantReferenceSha256: string;
  /** Explicit source dependency only. No ADC, env secret discovery or formal
   * GCP factory activation. Each invocation needs its own verified bundle. */
  createGcpBundle(context: Context): Promise<Bundle>;
}>;
const unavailable = () => new Error("Job status managed custody unavailable");
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const digest = (value: unknown) => sha(stringifyCaresLinkV1CanonicalJson(value));
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

/** Connects the existing M1u workload/KMS/Secret Manager protocol to the new
 * purpose-only reader. Credentials never leave their consume callback. This
 * is local source wiring, not evidence of live GCP custody or Hosted approval.
 */
export function createJobStatusManagedCustodyFactory(input: Configuration) {
  const config = Object.freeze({ ...input });
  if (!/^[a-z0-9]{20}$/.test(config.projectRef) || config.projectRef === PARENT ||
      ![config.expectedCaSha256, config.sourceRevisionSha256, config.sourceManifestSha256,
        config.oauthAppReferenceSha256, config.oauthGrantReferenceSha256].every(hash) ||
      typeof config.createGcpBundle !== "function") throw unavailable();
  return async (context: Context): Promise<JobStatusPreviewCustody> => {
    const active = (callContext = context) => {
      if (callContext.signal !== context.signal || !(context.signal instanceof AbortSignal) || context.signal.aborted) throw unavailable();
    };
    active();
    const bundle = await config.createGcpBundle(context);
    active();
    if (bundle.status !== "TEST_ONLY_GCP_PROVIDER_PORT_BUNDLE_NOT_APPROVED" || bundle.rawCredentialMaterialPresent !== false) throw unavailable();
    const verified = record(await bundle.workloadIdentityVerifierPort.verify(Object.freeze({
      purpose: "VERIFY_VERCEL_PREVIEW_WORKLOAD_AND_SOURCE_MANIFEST",
      audience: "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_RUNTIME", environmentClass: "NON_PRODUCTION_PREVIEW",
      vercelEnvironment: "preview", vercelTeamIdSha256: sha("team_cFWfAk6zAa0b7X5bc1ONT4SA"),
      vercelProjectIdSha256: sha("prj_AtdTukVr39wrGH9PYgKusfku2gvS"),
      sourceRevisionSha256: config.sourceRevisionSha256, sourceManifestSha256: config.sourceManifestSha256,
      postgresMajor: 17, connectionMode: "DIRECT", targetProjectRef: config.projectRef,
      tlsRootCertificateSha256: config.expectedCaSha256,
    }), context));
    active();
    if (verified.status !== "VERIFIED_PREVIEW_WORKLOAD_AND_SOURCE_MANIFEST_NOT_APPROVED" ||
        verified.sourceRevisionSha256 !== config.sourceRevisionSha256 || verified.sourceManifestSha256 !== config.sourceManifestSha256 ||
        verified.rawIdentityCredentialMaterialPresent !== false || !hash(verified.sourceManifestEvidenceSha256)) throw unavailable();
    const deploymentIdentityEvidenceSha256 = digest(verified);
    let tokenUsed = false, caUsed = false, databaseUsed = false;
    const refs = new Set<string>();
    return Object.freeze({
      async consumeAccessToken(callContext, consumer) {
        active(callContext); if (tokenUsed) throw unavailable(); tokenUsed = true;
        await bundle.supabaseManagementCredentialPort.consume(Object.freeze({
          purpose: "CONSUME_SUPABASE_MANAGEMENT_API_OAUTH2_ACCESS_TOKEN", managementApiOrigin: "https://api.supabase.com",
          authorizationModel: "SUPABASE_OAUTH_APP_SCOPE", oauthScope: "environment:read",
          oauthAppReferenceSha256: config.oauthAppReferenceSha256, oauthGrantReferenceSha256: config.oauthGrantReferenceSha256,
          scopeAttestationSource: "PINNED_OAUTH_APP_CONFIGURATION_AND_GRANT", endpointAllowlistEnforced: true,
          productionProjectRef: PARENT, targetProjectRef: config.projectRef, sourceRevisionSha256: config.sourceRevisionSha256,
          deploymentIdentityEvidenceSha256, sourceManifestEvidenceSha256: verified.sourceManifestEvidenceSha256,
        }), context, async (accessToken: string, raw: unknown) => {
          active(); const attestation = record(raw);
          if (attestation.status !== "ATTESTED_SUPABASE_MANAGEMENT_API_CREDENTIAL_NOT_APPROVED" ||
              attestation.oauthScope !== "environment:read" || attestation.oauthAppReferenceSha256 !== config.oauthAppReferenceSha256 ||
              attestation.oauthGrantReferenceSha256 !== config.oauthGrantReferenceSha256 || typeof attestation.expiresAt !== "string" ||
              attestation.rawCredentialMaterialPresent !== false) throw unavailable();
          await consumer({ accessToken, scope: "environment:read", expiresAt: attestation.expiresAt });
        });
        active();
      },
      async loadCa(request, callContext) {
        active(callContext); if (caUsed || !hash(request.controlPlaneEvidenceSha256)) throw unavailable(); caUsed = true;
        const value = record(await bundle.pinnedCaCustodyPort.load(Object.freeze({
          purpose: "LOAD_PINNED_SUPABASE_DATABASE_ROOT_CA", tlsRootCertificateSha256: config.expectedCaSha256,
          sourceRevisionSha256: config.sourceRevisionSha256, deploymentIdentityEvidenceSha256,
          controlPlaneEvidenceSha256: request.controlPlaneEvidenceSha256,
        }), context));
        active();
        if (!(value.tlsRootCertificate instanceof Uint8Array) || value.rawCredentialMaterialPresent !== false) throw unavailable();
        return Buffer.from(value.tlsRootCertificate);
      },
      async hmacProjectRef(ref, callContext) {
        active(callContext);
        if (![config.projectRef, PARENT].includes(ref) || refs.has(ref)) throw unavailable(); refs.add(ref);
        const value = record(await bundle.managedHmacPort.hmac(Object.freeze({
          purpose: "SUPABASE_PROJECT_REF_BINDING", algorithm: "HMAC-SHA256",
          version: "mac.communication-note.preview.platform.2026-09-01.m1t.v1", sourceRevisionSha256: config.sourceRevisionSha256,
          bindingSha256: digest({ domain: "careslink:job-status:project-ref:v1", projectRef: ref }),
        }), context));
        active();
        if (value.status !== "MANAGED_HMAC_SHA256_NOT_APPROVED" || value.purpose !== "SUPABASE_PROJECT_REF_BINDING" ||
            value.rawKeyMaterialPresent !== false || !hash(value.macSha256)) throw unavailable();
        return value.macSha256;
      },
      async consumeDatabaseCredential(request, callContext, consumer) {
        active(callContext);
        if (databaseUsed || request.projectRef !== config.projectRef || request.purpose !== "JOB_STATUS_ISSUER_CONTROL_ONLY" ||
            request.databaseTarget.tlsRootCertificateSha256 !== config.expectedCaSha256) throw unavailable();
        databaseUsed = true;
        const deliveryExpiresAt = new Date(Date.now() + 60000).toISOString();
        await bundle.databaseCredentialCustodyPort.consume(Object.freeze({
          purpose: "CONSUME_STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD", targetDescriptorSha256: digest(request.databaseTarget),
          tlsRootCertificateSha256: config.expectedCaSha256, user: "postgres", applicationName: JOB_STATUS_CONTROL_APPLICATION_NAME,
          credentialClass: "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD", sourceExpiresAt: null,
          sourceRevocation: "BRANCH_DELETE_OR_PASSWORD_RESET", deliveryNonce: randomBytes(32).toString("hex"),
          deliveryExpiresNoLaterThan: deliveryExpiresAt, maximumDeliveryLifetimeMs: 60000,
          sourceRevisionSha256: config.sourceRevisionSha256, deploymentIdentityEvidenceSha256,
          controlPlaneEvidenceSha256: request.databaseTarget.controlPlaneEvidenceSha256,
          revalidatedBranchSnapshotSha256: request.databaseTarget.controlPlaneEvidenceSha256,
        }), context, async (password: string) => {
          active();
          await consumer({ projectRef: config.projectRef, password, deliveryExpiresAt,
            credentialClass: "STATIC_SUPABASE_BRANCH_ADMIN_PASSWORD", sourceExpiresAt: null,
            sourceRevocation: "BRANCH_DELETE_OR_PASSWORD_RESET" });
        });
        active();
      },
    } satisfies JobStatusPreviewCustody);
  };
}

/** Auth/session verification remains in the existing HTTP composition and runs
 * before this resolver. Formal GET intentionally does not import this factory. */
export function createJobStatusCustodiedRecoveryComposition(input: Configuration &
  Pick<RecoveryOptions, "env" | "createCookieAuthClient">) {
  const issuer = createJobStatusPreviewIssuerService({ projectRef: input.projectRef, expectedCaSha256: input.expectedCaSha256,
    createCustody: createJobStatusManagedCustodyFactory(input) });
  const projectRef = input.projectRef;
  return createCommunicationNoteJobRecoveryComposition({ env: input.env, createCookieAuthClient: input.createCookieAuthClient,
    resolveDatabase: ({ projectRef: requested, signal }) => {
      if (requested !== projectRef) throw unavailable();
      return issuer.resolve({ signal });
    } });
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw unavailable();
  return value as Record<string, unknown>;
}
