import { isAbsolute } from "node:path";

export const POINTS_PREVIEW_PLATFORM_CONTRACT = Object.freeze({
  version: "2026-09-06.points-preview-platform.1",
  vercelCliVersion: "59.5.0",
  failureCode: "POINTS_PREVIEW_PLATFORM_CONTRACT_INVALID",
});

function reject() {
  throw new Error(POINTS_PREVIEW_PLATFORM_CONTRACT.failureCode);
}

/** Pure argv assembly. The caller supplies env values privately, never in argv. */
export function createPointsPreviewDeployArguments({
  projectId, teamSlug, stagingDirectory, runMarker, environmentNames, dryRun,
}) {
  if (typeof projectId !== "string" || !/^prj_[a-zA-Z0-9]+$/.test(projectId) ||
      typeof teamSlug !== "string" || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(teamSlug) ||
      typeof stagingDirectory !== "string" || !isAbsolute(stagingDirectory) ||
      /[\u0000-\u001f\u007f]/.test(stagingDirectory) ||
      typeof runMarker !== "string" || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(runMarker) ||
      typeof dryRun !== "boolean" || !Array.isArray(environmentNames) ||
      environmentNames.length === 0 || environmentNames.length > 128 ||
      new Set(environmentNames).size !== environmentNames.length ||
      environmentNames.some((key) => typeof key !== "string" ||
        !/^[A-Z][A-Z0-9_]{0,127}$/.test(key) || /^(?:VERCEL_|NODE_|PG)/.test(key))) {
    reject();
  }
  // --skip-domain is production-only in 59.5.0. Never switch to --prod to make
  // that flag work. No promote, alias mutation, bypass token or project-env write.
  return Object.freeze([
    "deploy", stagingDirectory, "--project", projectId, "--scope", teamSlug,
    "--target", "preview", "--no-wait", "--yes", "--json",
    "--meta", `careslinkPointsRun=${runMarker}`,
    ...[...environmentNames].sort().flatMap((key) => ["--env", key, "--build-env", key]),
    ...(dryRun ? ["--dry"] : []),
  ]);
}

/**
 * CLI 59.5.0 getDeploymentOutputJson: top-level id/url/readyState/target.
 * This descriptor is private recovery input, NOT safe report output and NOT
 * proof of ownership. Re-attest project/team/run/time/protection through REST
 * before any business request or deletion. JSON/error/shape failures never retry
 * deployment creation; the lifecycle owner must discover and clean up once.
 */
export function parsePointsPreviewDeploymentOutput(input) {
  try {
    if (typeof input !== "string" || Buffer.byteLength(input) > 65536) reject();
    const value = JSON.parse(input);
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        typeof value.id !== "string" || !/^dpl_[a-zA-Z0-9]+$/.test(value.id) ||
        typeof value.url !== "string" ||
        !/^https:\/\/[a-z0-9][a-z0-9-]*\.vercel\.app$/.test(value.url) ||
        !["QUEUED", "INITIALIZING", "BUILDING", "READY"].includes(value.readyState) ||
        !Object.hasOwn(value, "target") ||
        (value.target !== null && value.target !== "preview") ||
        Object.hasOwn(value, "error")) {
      reject();
    }
    return Object.freeze({ id: value.id, url: value.url,
      readyState: value.readyState, target: value.target });
  } catch {
    reject();
  }
}
