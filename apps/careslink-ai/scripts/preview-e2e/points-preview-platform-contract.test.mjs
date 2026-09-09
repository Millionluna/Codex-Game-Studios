import { describe, expect, it } from "vitest";
import { createPointsPreviewDeployArguments as argv,
  parsePointsPreviewDeploymentOutput as parse,
  POINTS_PREVIEW_PLATFORM_CONTRACT as POLICY } from "./points-preview-platform-contract.mjs";

const opts = () => ({ projectId: "prj_synthetic", teamSlug: "synthetic-team",
  stagingDirectory: "/private/synthetic-upload", runMarker: "synthetic-points-preview",
  environmentNames: ["SUPABASE_SERVICE_ROLE_KEY", "OPENAI_API_KEY"], dryRun: true });
const response = () => ({ id: "dpl_synthetic", url: "https://synthetic-preview.vercel.app",
  inspectorUrl: null, readyState: "READY", target: null,
  deploymentApiUrl: "https://api.vercel.com/v13/deployments/dpl_synthetic" });

describe("Points Preview pinned CLI contracts, no CLI execution", () => {
  it.each([true, false])("assembles explicit Preview only, dry=%s", (dryRun) => {
    const args = argv({ ...opts(), dryRun });
    expect(args).toEqual(["deploy", "/private/synthetic-upload", "--project", "prj_synthetic",
      "--scope", "synthetic-team", "--target", "preview", "--no-wait", "--yes", "--json",
      "--meta", "careslinkPointsRun=synthetic-points-preview",
      "--env", "OPENAI_API_KEY", "--build-env", "OPENAI_API_KEY",
      "--env", "SUPABASE_SERVICE_ROLE_KEY", "--build-env", "SUPABASE_SERVICE_ROLE_KEY",
      ...(dryRun ? ["--dry"] : [])]);
    for (const forbidden of ["--skip-domain", "--prod", "production", "--temporary",
      "--token", "promote", "--force", "--bypass"]) expect(args).not.toContain(forbidden);
    expect(Object.isFrozen(args)).toBe(true);
  });
  it.each([
    { projectId: "--prod" }, { teamSlug: "a\n--prod" }, { stagingDirectory: "relative" },
    { stagingDirectory: "/private/invalid\npath" }, { runMarker: "x=y" }, { dryRun: undefined },
    { environmentNames: [] }, { environmentNames: ["A", "A"] },
    { environmentNames: ["SECRET=sentinel-value-never-log"] },
    { environmentNames: ["VERCEL_AUTOMATION_BYPASS_SECRET"] },
    { environmentNames: ["NODE_TLS_REJECT_UNAUTHORIZED"] }, { environmentNames: ["PGPASSWORD"] },
  ])("rejects malformed or authority-changing command input", (overrides) => {
    expect(() => argv({ ...opts(), ...overrides })).toThrow(POLICY.failureCode);
  });
  it.each(["QUEUED", "INITIALIZING", "BUILDING", "READY"])("parses pinned top-level %s output", (readyState) => {
    expect(parse(JSON.stringify({ ...response(), readyState }))).toEqual({
      id: response().id, url: response().url, target: null, readyState,
    });
  });
  it.each([
    { id: undefined }, { id: "sentinel-private-value" }, { url: "https://production.example.com" },
    { url: "https://synthetic-preview.vercel.app/path" }, { url: "https://synthetic-preview.vercel.app@evil.test" },
    { target: "production" }, { target: undefined }, { readyState: "ERROR" },
    { error: null }, { error: { message: "sentinel-private-value" } },
  ])("rejects unexpected create responses without suggesting a create retry", (overrides) => {
    expect(() => parse(JSON.stringify({ ...response(), ...overrides }))).toThrow(POLICY.failureCode);
  });
  it.each(["not-json-sentinel-private-value", "[]", "null", "x".repeat(65537),
    JSON.stringify({ deployment: response() })])("rejects malformed output with fixed error only", (input) => {
    try { parse(input); throw new Error("unexpected pass"); } catch (error) {
      expect(error.message).toBe(POLICY.failureCode);
      expect(`${error.stack}${JSON.stringify(error)}`).not.toContain("sentinel-private-value");
    }
  });
});
