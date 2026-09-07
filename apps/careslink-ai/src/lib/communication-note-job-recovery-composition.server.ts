import "server-only";

import { types as nodeTypes } from "node:util";
import { createCommunicationNoteGenerationPrincipalResolver } from "./communication-note-generation-principal.server";
import type { CommunicationNoteGenerationAuthenticatedClient } from "./communication-note-generation-current-session.server";
import { createCommunicationNoteGenerationJobRecoveryHandler } from "./communication-note-generation-job-recovery.server";
import { createCareslinkServerSupabaseClient } from "./supabase-server";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./v1/ndis-shadow-guard";
import type { CaresLinkV1ProductApiEnv } from "./v1/product-api-auth.server";
import {
  createCaresLinkV1CommunicationNoteJobStatusPurposeCallerAdapter,
  type CaresLinkV1CommunicationNoteJobStatusCredentialResolver,
  type CaresLinkV1CommunicationNoteJobStatusPreviewDatabaseTarget,
} from "./v1/communication-note-job-status-purpose-caller.server";

export const COMMUNICATION_NOTE_JOB_RECOVERY_COMPOSITION_READY = false as const;
export const COMMUNICATION_NOTE_JOB_RECOVERY_REQUEST_TIMEOUT_MS = 30_000;
export type CommunicationNoteJobRecoveryEnv = CaresLinkV1ProductApiEnv &
  Readonly<{
    CARESLINK_COMMUNICATION_NOTE_JOB_RECOVERY_ENABLED?: string;
    CARESLINK_COMMUNICATION_NOTE_JOB_RECOVERY_EXPECTED_SUPABASE_REF?: string;
    CARESLINK_COMMUNICATION_NOTE_JOB_RECOVERY_EXPECTED_VERCEL_PROJECT_ID?: string;
    VERCEL?: string;
    VERCEL_ENV?: string;
    VERCEL_TARGET_ENV?: string;
    VERCEL_PROJECT_ID?: string;
  }>;
type Configuration = Readonly<{
  projectRef: string;
  url: string;
  key: string;
  vercelProjectId: string;
}>;
export type CommunicationNoteJobRecoveryDatabaseDependencies = Readonly<{
  projectRef: string;
  databaseTarget: CaresLinkV1CommunicationNoteJobStatusPreviewDatabaseTarget;
  credentialResolver: CaresLinkV1CommunicationNoteJobStatusCredentialResolver;
  clock: Readonly<{ now(): string }>;
}>;
type Options = Readonly<{
  env: CommunicationNoteJobRecoveryEnv;
  /** Server-owned issuer/target port, never populated from request fields. */
  resolveDatabase(
    input: Readonly<{ projectRef: string; signal: AbortSignal }>,
  ): Promise<CommunicationNoteJobRecoveryDatabaseDependencies | undefined>;
  createCookieAuthClient?: (
    input: Readonly<{ env: CaresLinkV1ProductApiEnv; responseHeaders: Headers }>,
  ) => Promise<CommunicationNoteGenerationAuthenticatedClient | undefined>;
}>;

/**
 * Actual principal -> purpose adapter -> fixed repository composition. No
 * module-load IO, ambient credential lookup, generation/Points gate or write
 * port. The credential issuer/physical transport remains a required server
 * dependency; no test-probe credentials or invented cleanup receipts are used.
 */
export function createCommunicationNoteJobRecoveryComposition(options: Options) {
  const config = configuration(options.env);
  if (!config) return undefined;
  if (
    typeof options.resolveDatabase !== "function" ||
    nodeTypes.isProxy(options.resolveDatabase) ||
    (options.createCookieAuthClient !== undefined &&
      typeof options.createCookieAuthClient !== "function")
  ) {
    throw new Error("Job recovery composition unavailable");
  }
  const { env, resolveDatabase, createCookieAuthClient } = options;
  const current = () => {
    const value = configuration(env);
    return value && Object.keys(config).every(
      key => value[key as keyof Configuration] === config[key as keyof Configuration],
    );
  };
  return async (request: Request, jobId: string): Promise<Response> => {
    if (!current() || request.method !== "GET" || request.signal.aborted) return unavailable();
    const controller = new AbortController();
    const responseHeaders = new Headers();
    let timer: ReturnType<typeof setTimeout>;
    let abort!: () => void;
    const stopped = new Promise<Response>(resolve => {
      abort = () => {
        controller.abort();
        resolve(unavailable());
      };
      timer = setTimeout(abort, COMMUNICATION_NOTE_JOB_RECOVERY_REQUEST_TIMEOUT_MS);
      request.signal.addEventListener("abort", abort, { once: true });
    });
    const principal = createCommunicationNoteGenerationPrincipalResolver({
      env,
      async createCookieAuthClient() {
        if (!current() || controller.signal.aborted) return undefined;
        const authEnv = Object.freeze({
          SUPABASE_URL: config.url,
          NEXT_PUBLIC_SUPABASE_URL: config.url,
          SUPABASE_PUBLISHABLE_KEY: config.key,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.key,
        });
        return createCookieAuthClient
          ? createCookieAuthClient({ env: authEnv, responseHeaders })
          : await createCareslinkServerSupabaseClient({ env: authEnv, responseHeaders }) as unknown as
            CommunicationNoteGenerationAuthenticatedClient | undefined;
      },
      validateCurrentSessionAuthority: () => Boolean(current()) && !controller.signal.aborted,
    });
    const handle = createCommunicationNoteGenerationJobRecoveryHandler({
      resolvePrincipal: principal,
      async createRepository({ principal, signal }) {
        if (!current() || signal.aborted) return undefined;
        const dependencies = await resolveDatabase(
          Object.freeze({ projectRef: config.projectRef, signal }),
        );
        if (!current() || signal.aborted || !dependencies ||
            dependencies.projectRef !== config.projectRef) return undefined;
        return createCaresLinkV1CommunicationNoteJobStatusPurposeCallerAdapter({
          databaseTarget: dependencies.databaseTarget,
          credentialResolver: dependencies.credentialResolver,
          clock: dependencies.clock,
        }).createRepository({ principal, signal });
      },
    });
    try {
      const result = await Promise.race([
        handle(new Request(request, { signal: controller.signal }), jobId),
        stopped,
      ]);
      if (!current() || controller.signal.aborted) return unavailable();
      // Next's request-local cookie store owns Set-Cookie; only fixed cache
      // prevention from the SSR adapter may supplement the private response.
      if (responseHeaders.has("expires")) result.headers.set("Expires", "0");
      if (responseHeaders.has("pragma")) result.headers.set("Pragma", "no-cache");
      return result;
    } catch {
      return unavailable();
    } finally {
      clearTimeout(timer!);
      request.signal.removeEventListener("abort", abort);
      controller.abort();
    }
  };
}

function configuration(env: CommunicationNoteJobRecoveryEnv): Configuration | undefined {
  try {
    if (
      env.CARESLINK_COMMUNICATION_NOTE_JOB_RECOVERY_ENABLED !== "true" ||
      env.CARESLINK_V1_PRODUCT_API_ENABLED !== "true" || env.VERCEL !== "1" ||
      env.VERCEL_ENV !== "preview" || env.VERCEL_TARGET_ENV !== "preview"
    ) return undefined;
    const projectRef = env.CARESLINK_COMMUNICATION_NOTE_JOB_RECOVERY_EXPECTED_SUPABASE_REF;
    const vercelProjectId = env.CARESLINK_COMMUNICATION_NOTE_JOB_RECOVERY_EXPECTED_VERCEL_PROJECT_ID;
    const key = env.SUPABASE_PUBLISHABLE_KEY;
    if (
      !projectRef || !/^[a-z0-9]{20}$/.test(projectRef) ||
      projectRef === CARESLINK_PRODUCTION_SUPABASE_REF ||
      !vercelProjectId || !/^prj_[A-Za-z0-9]{16,64}$/.test(vercelProjectId) ||
      env.VERCEL_PROJECT_ID !== vercelProjectId ||
      !key || !/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key) ||
      key !== env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ) return undefined;
    const url = `https://${projectRef}.supabase.co`;
    if (env.SUPABASE_URL !== url || env.NEXT_PUBLIC_SUPABASE_URL !== url) return undefined;
    return Object.freeze({ projectRef, url, key, vercelProjectId });
  } catch {
    return undefined;
  }
}

function unavailable() {
  return Response.json({ status: "UNAVAILABLE" }, {
    status: 503,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      Vary: "Cookie, Authorization",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
