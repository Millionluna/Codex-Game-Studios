import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

describe("V1 shadow runtime boundary", () => {
  it("is imported only by audited NDIS routes and the default-off Product API", () => {
    const runtimeFiles = ["src/app", "src/components"].flatMap(walkSourceFiles);
    const allowedRuntimeImporters = new Map([
      [
        join(
          process.cwd(),
          "src/app/api/template-companion/ndis-case-note/save/route.ts",
        ),
        "mirrorSavedNdisDraftToCanonicalShadow",
      ],
      [
        join(
          process.cwd(),
          "src/app/api/template-companion/ndis-case-note/drafts/[draftId]/route.ts",
        ),
        "tombstoneDeletedNdisShadowFromCanonical",
      ],
    ]);

    expect(runtimeFiles.length).toBeGreaterThan(0);
    for (const file of runtimeFiles) {
      const source = readFileSync(file, "utf8");
      const importsV1Runtime =
        /(?:@\/lib\/v1|lib\/v1\/|CARESLINK_V1_SHADOW_ENABLED)/.test(source);
      const expectedIntegration = allowedRuntimeImporters.get(file);
      const isProductApiRoute =
        file.startsWith(join(process.cwd(), "src/app/v1")) &&
        file.endsWith("route.ts");
      const isNativeAuthBoundaryRoute = file.startsWith(
        join(process.cwd(), "src/app/v1/auth"),
      );

      if (expectedIntegration) {
        expect(source).toContain(
          "@/lib/v1/ndis-shadow-integration.server",
        );
        expect(source).toContain(expectedIntegration);
      } else if (isNativeAuthBoundaryRoute) {
        expect(source).toContain("@/lib/v1/native-auth-boundary.server");
        expect(source).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|service_role/i);
      } else if (isProductApiRoute) {
        expect(source).toContain("@/lib/v1/product-api-route.server");
        expect(source).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|service_role/i);
      } else {
        expect(importsV1Runtime, file).toBe(false);
      }
    }

    for (const allowedRuntimeImporter of allowedRuntimeImporters.keys()) {
      expect(runtimeFiles).toContain(allowedRuntimeImporter);
    }
  });

  it("marks privileged and Product API runtime modules as server-only", () => {
    for (const relativePath of [
      "src/lib/v1/ndis-shadow-integration.server.ts",
      "src/lib/v1/ndis-shadow-repository.server.ts",
      "src/lib/v1/communication-note-fact-parity.ts",
      "src/lib/v1/communication-note-golden.ts",
      "src/lib/v1/communication-note-openai-request-template.ts",
      "src/lib/v1/communication-note-openai-request-wire.ts",
      "src/lib/v1/communication-note-preview-evaluation-manifest.ts",
      "src/lib/v1/communication-note-preview-evaluation-policy.ts",
      "src/lib/v1/communication-note-preview-request-body-pin.ts",
      "src/lib/v1/communication-note-preview-evaluation-runner.server.ts",
      "src/lib/v1/communication-note-preview-execution-authority.server.ts",
      "src/lib/v1/communication-note-preview-key-custody.server.ts",
      "src/lib/v1/communication-note-preview-activation-preflight.server.ts",
      "src/lib/v1/communication-note-preview-reserve-before-dispatch-coordinator.server.ts",
      "src/lib/v1/native-auth-boundary.server.ts",
      "src/lib/v1/openai-communication-note-provider.server.ts",
      "src/lib/v1/communication-note-provider-policy.ts",
      "src/lib/v1/privacy-review-scanner.server.ts",
      "src/lib/v1/product-api-auth.server.ts",
      "src/lib/v1/product-api-route.server.ts",
      "src/lib/v1/product-api-runtime.server.ts",
      "src/lib/v1/product-api-session-status.server.ts",
      "src/lib/v1/product-api-supabase.server.ts",
    ]) {
      expect(readFileSync(join(process.cwd(), relativePath), "utf8")).toMatch(
        /^import "server-only";/,
      );
    }
  });

  it("isolates the Communication provider adapter to the source-only evaluation runner", () => {
    const runner = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-evaluation-runner.server.ts",
    );
    const importers = walkSourceFiles("src").filter((file) =>
      readFileSync(file, "utf8").includes(
        "openai-communication-note-provider.server",
      ),
    );
    expect(importers).toEqual([runner]);
    expect(readFileSync(runner, "utf8")).toContain(
      "MOCKED_CONTRACT_TEST_ONLY",
    );

    const runnerImporters = walkSourceFiles("src").filter(
      (file) =>
        file !== runner &&
        readFileSync(file, "utf8").includes(
          "communication-note-preview-evaluation-runner",
        ),
    );
    expect(runnerImporters).toEqual([]);
  });

  it("keeps the M1g-a wire serializer and literal body pins inside the audited server-only chain", () => {
    const provider = join(
      process.cwd(),
      "src/lib/v1/openai-communication-note-provider.server.ts",
    );
    const runner = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-evaluation-runner.server.ts",
    );
    const bodyPins = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-request-body-pin.ts",
    );
    const wireImporters = walkSourceFiles("src").filter((file) =>
      readFileSync(file, "utf8").includes(
        "communication-note-openai-request-wire",
      ),
    );
    const bodyPinImporters = walkSourceFiles("src").filter(
      (file) =>
        file !== bodyPins &&
        readFileSync(file, "utf8").includes(
          "communication-note-preview-request-body-pin",
        ),
    );

    expect(wireImporters).toEqual([bodyPins, provider]);
    expect(bodyPinImporters).toEqual([runner, provider].sort());
  });

  it("keeps the M1g-b execution authority module outside every product runtime", () => {
    const authorityTest = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-execution-authority.server.test.ts",
    );
    const keyCustodyModule = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-key-custody.server.ts",
    );
    const keyCustodyTest = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-key-custody.server.test.ts",
    );
    const activationPreflightModule = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-activation-preflight.server.ts",
    );
    const activationPreflightTest = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-activation-preflight.server.test.ts",
    );
    const coordinatorModule = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-reserve-before-dispatch-coordinator.server.ts",
    );
    const coordinatorTest = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-reserve-before-dispatch-coordinator.server.test.ts",
    );
    const migrationContractTest = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-execution-authority-migration-contract.test.ts",
    );
    const importPattern =
      /(?:from\s+|import\s*\(|require\s*\()\s*["'][^"']*communication-note-preview-execution-authority\.server(?:\.(?:[cm]?[jt]s|[jt]sx))?["']/;
    const importers = walkAllScriptFiles("src").filter((file) =>
      importPattern.test(readFileSync(file, "utf8")),
    );

    expect(importers).toEqual([
      migrationContractTest,
      activationPreflightModule,
      activationPreflightTest,
      authorityTest,
      coordinatorModule,
      coordinatorTest,
      keyCustodyModule,
      keyCustodyTest,
    ].sort());
    expect(walkSourceFiles("src").filter((file) =>
      importPattern.test(readFileSync(file, "utf8")),
    )).toEqual([
      activationPreflightModule,
      coordinatorModule,
      keyCustodyModule,
    ].sort());
  });

  it("quarantines M1g-c custody metadata from every controlled script and runtime importer", () => {
    const custodyModule = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-key-custody.server.ts",
    );
    const custodyTest = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-key-custody.server.test.ts",
    );
    const activationPreflightModule = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-activation-preflight.server.ts",
    );
    const activationPreflightTest = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-activation-preflight.server.test.ts",
    );
    const coordinatorModule = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-reserve-before-dispatch-coordinator.server.ts",
    );
    const coordinatorTest = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-reserve-before-dispatch-coordinator.server.test.ts",
    );
    const importPattern =
      /(?:from\s+|import\s*\(|require\s*\()\s*["'][^"']*communication-note-preview-key-custody\.server(?:\.(?:[cm]?[jt]s|[jt]sx))?["']/;
    const importers = walkControlledScriptFiles().filter((file) =>
      importPattern.test(readFileSync(file, "utf8")),
    );
    const source = readFileSync(custodyModule, "utf8");

    expect(importers).toEqual([
      activationPreflightModule,
      activationPreflightTest,
      coordinatorModule,
      coordinatorTest,
      custodyTest,
    ].sort());
    expect(walkSourceFiles("src/app").filter((file) =>
      importPattern.test(readFileSync(file, "utf8")),
    )).toEqual([]);
    expect(walkSourceFiles("src/components").filter((file) =>
      importPattern.test(readFileSync(file, "utf8")),
    )).toEqual([]);
    expect(source).not.toMatch(/process\.env|fetch\s*\(|from\s+["']openai["']/);
  });

  it("quarantines the M1g-d activation preflight to the M1g-e source-only chain and tests", () => {
    const preflightModule = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-activation-preflight.server.ts",
    );
    const preflightTest = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-activation-preflight.server.test.ts",
    );
    const coordinatorModule = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-reserve-before-dispatch-coordinator.server.ts",
    );
    const coordinatorTest = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-reserve-before-dispatch-coordinator.server.test.ts",
    );
    const importPattern =
      /(?:from\s+|import\s*\(|require\s*\()\s*["'][^"']*communication-note-preview-activation-preflight\.server(?:\.(?:[cm]?[jt]s|[jt]sx))?["']/;
    const importers = walkControlledScriptFiles().filter((file) =>
      importPattern.test(readFileSync(file, "utf8")),
    );
    const source = readFileSync(preflightModule, "utf8");

    expect(importers).toEqual([
      coordinatorModule,
      coordinatorTest,
      preflightTest,
    ].sort());
    expect(walkSourceFiles("src/app").filter((file) =>
      importPattern.test(readFileSync(file, "utf8")),
    )).toEqual([]);
    expect(walkSourceFiles("src/components").filter((file) =>
      importPattern.test(readFileSync(file, "utf8")),
    )).toEqual([]);
    expect(source).not.toMatch(
      /process\.env|fetch\s*\(|from\s+["'](?:openai|@supabase\/)[^"']*["']|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_/,
    );
    expect(source).toContain("activationReady: false");
    expect(source).toContain(
      "Communication Note preview activation preflight is unavailable",
    );
  });

  it("quarantines the M1g-e coordinator transcript validator to its own test", () => {
    const coordinatorModule = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-reserve-before-dispatch-coordinator.server.ts",
    );
    const coordinatorTest = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-reserve-before-dispatch-coordinator.server.test.ts",
    );
    const importPattern =
      /(?:from\s+|import\s*\(|require\s*\()\s*["'][^"']*communication-note-preview-reserve-before-dispatch-coordinator\.server(?:\.(?:[cm]?[jt]s|[jt]sx))?["']/;
    const importers = walkControlledScriptFiles().filter((file) =>
      importPattern.test(readFileSync(file, "utf8")),
    );
    const source = readFileSync(coordinatorModule, "utf8");

    expect(importers).toEqual([coordinatorTest]);
    expect(walkSourceFiles("src/app").filter((file) =>
      importPattern.test(readFileSync(file, "utf8")),
    )).toEqual([]);
    expect(walkSourceFiles("src/components").filter((file) =>
      importPattern.test(readFileSync(file, "utf8")),
    )).toEqual([]);
    expect(source).not.toMatch(
      /process\.env|fetch\s*\(|from\s+["'](?:openai|@supabase\/|node:(?:http|https|net|tls))[^"']*["']|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_/,
    );
    expect(source).not.toMatch(/callback|claimToken\s*:\s*(?:string|unknown)/i);
    expect(source).toContain("coordinatorReady: false");
    expect(source).toContain('dispatchCapability: "ABSENT"');
    expect(source).toContain(
      "Communication Note preview reserve-before-dispatch coordinator is unavailable",
    );
  });

  it("exposes the privacy review as a physical POST-only route", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/v1/privacy-reviews/route.ts"),
      "utf8",
    );
    expect(source).toContain("export async function POST");
    expect(source).not.toMatch(/export async function (?:DELETE|GET|PATCH|PUT)/);
  });

  it("keeps service-role repositories outside the client component tree", () => {
    const componentFiles = walkSourceFiles("src/components");

    for (const file of componentFiles) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(
        /ndis-shadow|SUPABASE_SERVICE_ROLE_KEY|project_ndis_legacy_shadow/,
      );
    }
  });
});

function walkSourceFiles(relativeDirectory: string): string[] {
  return walkAbsoluteSourceFiles(join(process.cwd(), relativeDirectory));
}

function walkAllScriptFiles(relativeDirectory: string): string[] {
  return walkAbsoluteScriptFiles(join(process.cwd(), relativeDirectory));
}

function walkControlledScriptFiles(): string[] {
  const rootFiles = readdirSync(process.cwd(), { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"].includes(
          extname(entry.name),
        ),
    )
    .map((entry) => join(process.cwd(), entry.name));
  return [
    ...rootFiles,
    ...["src", "scripts", "supabase/functions"].flatMap((directory) =>
      existsSync(join(process.cwd(), directory))
        ? walkAllScriptFiles(directory)
        : []
    ),
  ].sort();
}

function walkAbsoluteSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return walkAbsoluteSourceFiles(path);
    }
    return isSourceFile(path) ? [path] : [];
  });
}

function walkAbsoluteScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return walkAbsoluteScriptFiles(path);
    }
    return [
      ".ts",
      ".tsx",
      ".mts",
      ".cts",
      ".js",
      ".jsx",
      ".mjs",
      ".cjs",
    ].includes(
      extname(path),
    ) ? [path] : [];
  });
}

function isSourceFile(path: string) {
  return (
    [".ts", ".tsx"].includes(extname(path)) &&
    !/\.test\.(?:ts|tsx)$/.test(path)
  );
}
