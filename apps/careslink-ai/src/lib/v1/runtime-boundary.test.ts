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
      "src/lib/v1/communication-note-preview-runner-terminal-policy.server.ts",
      "src/lib/v1/communication-note-preview-runner-terminal-trust-composition.server.ts",
      "src/lib/v1/communication-note-preview-runner-terminal-trust-test-fixtures.ts",
      "src/lib/v1/communication-note-preview-signed-runner-terminal-runtime-port.server.ts",
      "src/lib/v1/communication-note-preview-runner-terminal-postgres.server.ts",
      "src/lib/v1/communication-note-preview-runner-terminal-resolved-runtime-binding.server.ts",
      "src/lib/v1/communication-note-preview-durable-caller-credential-resolver.server.ts",
      "src/lib/v1/communication-note-preview-approved-runtime-target.server.ts",
      "src/lib/v1/communication-note-preview-approved-runtime-management-session.server.ts",
      "src/lib/v1/communication-note-preview-approved-runtime-broker.server.ts",
      "src/lib/v1/communication-note-preview-approved-runtime-postgres-session.server.ts",
      "src/lib/v1/communication-note-preview-approved-runtime-adapters.server.ts",
      "src/lib/v1/communication-note-preview-product-runtime-composition.server.ts",
      "src/lib/v1/communication-note-preview-product-runtime-identities.server.ts",
      "src/lib/v1/communication-note-preview-product-runtime-platform-adapters.server.ts",
      "src/lib/v1/communication-note-preview-product-runtime-gcp-adapters.server.ts",
      "src/lib/v1/communication-note-preview-product-runtime-gcp-rest-bridge.server.ts",
      "src/lib/v1/communication-note-preview-product-runtime-supabase-management-bridge.server.ts",
      "src/lib/v1/native-auth-boundary.server.ts",
      "src/lib/v1/openai-communication-note-provider.server.ts",
      "src/lib/v1/communication-note-provider-policy.ts",
      "src/lib/v1/privacy-review-scanner.server.ts",
      "src/lib/v1/product-api-auth.server.ts",
      "src/lib/v1/product-api-route.server.ts",
      "src/lib/v1/product-api-runtime.server.ts",
      "src/lib/v1/product-api-session-status.server.ts",
      "src/lib/v1/product-api-supabase.server.ts",
      "src/lib/communication-note-generation-principal.server.ts",
      "src/lib/communication-note-generation-principal-composition.server.ts",
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
    const trustCompositionModule = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-runner-terminal-trust-composition.server.ts",
    );
    const trustTestFixtures = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-runner-terminal-trust-test-fixtures.ts",
    );
    const resolvedRuntimeBindingModule = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-runner-terminal-resolved-runtime-binding.server.ts",
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
      resolvedRuntimeBindingModule,
      trustCompositionModule,
      trustTestFixtures,
    ].sort());
    expect(walkSourceFiles("src").filter((file) =>
      importPattern.test(readFileSync(file, "utf8")),
    )).toEqual([
      activationPreflightModule,
      coordinatorModule,
      keyCustodyModule,
      resolvedRuntimeBindingModule,
      trustCompositionModule,
      trustTestFixtures,
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
    const trustCompositionModule = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-runner-terminal-trust-composition.server.ts",
    );
    const trustTestFixtures = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-runner-terminal-trust-test-fixtures.ts",
    );
    const resolvedRuntimeBindingModule = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-runner-terminal-resolved-runtime-binding.server.ts",
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
      resolvedRuntimeBindingModule,
      trustCompositionModule,
      trustTestFixtures,
      join(
        process.cwd(),
        "src/lib/v1/communication-note-preview-runner-terminal-postgres.server.test.ts",
      ),
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

  it("quarantines the M1g-h runner-terminal trust composition and ports to exact source importers", () => {
    const policyModule = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-runner-terminal-policy.server.ts",
    );
    const policyTest = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-runner-terminal-policy.server.test.ts",
    );
    const policyImportPattern =
      /(?:from\s+|import\s*\(|require\s*\()\s*["'][^"']*communication-note-preview-runner-terminal-policy\.server(?:\.(?:[cm]?[jt]s|[jt]sx))?["']/;
    const policyImporters = walkControlledScriptFiles().filter((file) =>
      policyImportPattern.test(readFileSync(file, "utf8")),
    );
    const trustCompositionModule = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-runner-terminal-trust-composition.server.ts",
    );
    const trustCompositionTest = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-runner-terminal-trust-composition.server.test.ts",
    );
    const trustTestFixtures = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-runner-terminal-trust-test-fixtures.ts",
    );
    const trustCompositionImportPattern =
      /(?:from\s+|import\s*\(|require\s*\()\s*["'][^"']*communication-note-preview-runner-terminal-trust-composition\.server(?:\.(?:[cm]?[jt]s|[jt]sx))?["']/;
    const trustCompositionImporters = walkControlledScriptFiles().filter(
      (file) => trustCompositionImportPattern.test(readFileSync(file, "utf8")),
    );
    const trustTestFixtureImportPattern =
      /(?:from\s+|import\s*\(|require\s*\()\s*["'][^"']*communication-note-preview-runner-terminal-trust-test-fixtures(?:\.(?:[cm]?[jt]s|[jt]sx))?["']/;
    const trustTestFixtureImporters = walkControlledScriptFiles().filter(
      (file) => trustTestFixtureImportPattern.test(readFileSync(file, "utf8")),
    );
    const signedRuntimeModule = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-signed-runner-terminal-runtime-port.server.ts",
    );
    const signedRuntimeTest = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-signed-runner-terminal-runtime-port.server.test.ts",
    );
    const signedRuntimeImportPattern =
      /(?:from\s+|import\s*\(|require\s*\()\s*["'][^"']*communication-note-preview-signed-runner-terminal-runtime-port\.server(?:\.(?:[cm]?[jt]s|[jt]sx))?["']/;
    const signedRuntimeImporters = walkControlledScriptFiles().filter((file) =>
      signedRuntimeImportPattern.test(readFileSync(file, "utf8")),
    );
    const postgresModule = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-runner-terminal-postgres.server.ts",
    );
    const postgresTest = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-runner-terminal-postgres.server.test.ts",
    );
    const postgresImportPattern =
      /(?:from\s+|import\s*\(|require\s*\()\s*["'][^"']*communication-note-preview-runner-terminal-postgres\.server(?:\.(?:[cm]?[jt]s|[jt]sx))?["']/;
    const postgresImporters = walkControlledScriptFiles().filter((file) =>
      postgresImportPattern.test(readFileSync(file, "utf8")),
    );
    const hostedLiveModule = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-runner-terminal-hosted-live.server.ts",
    );
    const hostedLiveTest = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-runner-terminal-hosted.live.test.ts",
    );
    const runtimeBrokerHostedLiveTest = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-runtime-credential-broker-hosted.live.test.ts",
    );
    const approvedRuntimeAdaptersHostedLiveTest = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-approved-runtime-adapters-hosted.live.test.ts",
    );
    const hostedLiveImportPattern =
      /(?:from\s+|import\s*\(|require\s*\()\s*["'][^"']*communication-note-preview-runner-terminal-hosted-live\.server(?:\.(?:[cm]?[jt]s|[jt]sx))?["']/;
    const hostedLiveImporters = walkControlledScriptFiles().filter((file) =>
      hostedLiveImportPattern.test(readFileSync(file, "utf8")),
    );
    const resolvedRuntimeBindingModule = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-runner-terminal-resolved-runtime-binding.server.ts",
    );
    const resolvedRuntimeBindingTest = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-runner-terminal-resolved-runtime-binding.server.test.ts",
    );
    const resolvedRuntimeBindingImportPattern =
      /(?:from\s+|import\s*\(|require\s*\()\s*["'][^"']*communication-note-preview-runner-terminal-resolved-runtime-binding\.server(?:\.(?:[cm]?[jt]s|[jt]sx))?["']/;
    const resolvedRuntimeBindingImporters = walkControlledScriptFiles().filter(
      (file) =>
        resolvedRuntimeBindingImportPattern.test(readFileSync(file, "utf8")),
    );
    const durableCredentialResolverModule = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-durable-caller-credential-resolver.server.ts",
    );
    const durableCredentialResolverTest = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-durable-caller-credential-resolver.server.test.ts",
    );
    const durableCredentialResolverImportPattern =
      /(?:from\s+|import\s*\(|require\s*\()\s*["'][^"']*communication-note-preview-durable-caller-credential-resolver\.server(?:\.(?:[cm]?[jt]s|[jt]sx))?["']/;
    const durableCredentialResolverImporters = walkControlledScriptFiles().filter(
      (file) =>
        durableCredentialResolverImportPattern.test(readFileSync(file, "utf8")),
    );

    expect(policyImporters).toEqual([
      join(
        process.cwd(),
        "src/lib/v1/communication-note-preview-activation-preflight.server.ts",
      ),
      join(
        process.cwd(),
        "src/lib/v1/communication-note-preview-key-custody.server.ts",
      ),
      join(
        process.cwd(),
        "src/lib/v1/communication-note-preview-reserve-before-dispatch-coordinator.server.ts",
      ),
      join(
        process.cwd(),
        "src/lib/v1/communication-note-preview-reserve-before-dispatch-coordinator.server.test.ts",
      ),
      hostedLiveTest,
      postgresModule,
      postgresTest,
      resolvedRuntimeBindingModule,
      resolvedRuntimeBindingTest,
      signedRuntimeModule,
      signedRuntimeTest,
      policyTest,
      trustCompositionModule,
      trustTestFixtures,
    ].sort());
    expect(signedRuntimeImporters).toEqual([
      hostedLiveModule,
      resolvedRuntimeBindingModule,
      signedRuntimeTest,
    ].sort());
    expect(postgresImporters).toEqual([
      join(
        process.cwd(),
        "src/lib/v1/communication-note-preview-approved-runtime-broker.server.test.ts",
      ),
      join(
        process.cwd(),
        "src/lib/v1/communication-note-preview-approved-runtime-broker.server.ts",
      ),
      durableCredentialResolverModule,
      hostedLiveModule,
      postgresTest,
      resolvedRuntimeBindingModule,
      resolvedRuntimeBindingTest,
      signedRuntimeModule,
      signedRuntimeTest,
    ].sort());
    expect(trustCompositionImporters).toEqual([
      approvedRuntimeAdaptersHostedLiveTest,
      hostedLiveModule,
      postgresModule,
      postgresTest,
      resolvedRuntimeBindingModule,
      resolvedRuntimeBindingTest,
      signedRuntimeModule,
      trustCompositionTest,
      trustTestFixtures,
    ].sort());
    expect(trustTestFixtureImporters).toEqual([
      approvedRuntimeAdaptersHostedLiveTest,
      join(
        process.cwd(),
        "src/lib/v1/communication-note-preview-approved-runtime-adapters.server.test.ts",
      ),
      hostedLiveModule,
      hostedLiveTest,
      postgresTest,
      resolvedRuntimeBindingTest,
      signedRuntimeTest,
      trustCompositionTest,
    ].sort());
    expect(hostedLiveImporters).toEqual([
      hostedLiveTest,
      runtimeBrokerHostedLiveTest,
    ].sort());
    expect(resolvedRuntimeBindingImporters).toEqual([
      approvedRuntimeAdaptersHostedLiveTest,
      join(
        process.cwd(),
        "src/lib/v1/communication-note-preview-approved-runtime-adapters.server.test.ts",
      ),
      join(
        process.cwd(),
        "src/lib/v1/communication-note-preview-approved-runtime-adapters.server.ts",
      ),
      join(
        process.cwd(),
        "src/lib/v1/communication-note-preview-approved-runtime-target.server.test.ts",
      ),
      join(
        process.cwd(),
        "src/lib/v1/communication-note-preview-approved-runtime-target.server.ts",
      ),
      join(
        process.cwd(),
        "src/lib/v1/communication-note-preview-product-runtime-identities.server.test.ts",
      ),
      join(
        process.cwd(),
        "src/lib/v1/communication-note-preview-product-runtime-platform-adapters.server.test.ts",
      ),
      join(
        process.cwd(),
        "src/lib/v1/communication-note-preview-product-runtime-provider-bridges-m1v.server.test.ts",
      ),
      durableCredentialResolverModule,
      durableCredentialResolverTest,
      resolvedRuntimeBindingTest,
    ].sort());
    expect(durableCredentialResolverImporters).toEqual([
      approvedRuntimeAdaptersHostedLiveTest,
      join(
        process.cwd(),
        "src/lib/v1/communication-note-preview-approved-runtime-adapters.server.test.ts",
      ),
      join(
        process.cwd(),
        "src/lib/v1/communication-note-preview-approved-runtime-adapters.server.ts",
      ),
      join(
        process.cwd(),
        "src/lib/v1/communication-note-preview-approved-runtime-broker.server.test.ts",
      ),
      join(
        process.cwd(),
        "src/lib/v1/communication-note-preview-approved-runtime-broker.server.ts",
      ),
      join(
        process.cwd(),
        "src/lib/v1/communication-note-preview-approved-runtime-management-session.server.ts",
      ),
      join(
        process.cwd(),
        "src/lib/v1/communication-note-preview-approved-runtime-postgres-session.server.ts",
      ),
      durableCredentialResolverTest,
    ].sort());

    for (const pattern of [
      policyImportPattern,
      trustCompositionImportPattern,
      trustTestFixtureImportPattern,
      signedRuntimeImportPattern,
      postgresImportPattern,
      hostedLiveImportPattern,
      resolvedRuntimeBindingImportPattern,
      durableCredentialResolverImportPattern,
    ]) {
      expect(walkSourceFiles("src/app").filter((file) =>
        pattern.test(readFileSync(file, "utf8")),
      )).toEqual([]);
      expect(walkSourceFiles("src/components").filter((file) =>
        pattern.test(readFileSync(file, "utf8")),
      )).toEqual([]);
    }
    for (const modulePath of [
      policyModule,
      trustCompositionModule,
      trustTestFixtures,
      signedRuntimeModule,
      postgresModule,
      hostedLiveModule,
      resolvedRuntimeBindingModule,
      durableCredentialResolverModule,
    ]) {
      expect(readFileSync(modulePath, "utf8")).not.toMatch(
        /process\.env|fetch\s*\(|from\s+["'](?:openai|@supabase\/|node:(?:http|https|net|tls))[^"']*["']|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_/,
      );
    }
    expect(readFileSync(policyModule, "utf8")).toContain(
      "SOURCE_CONTRACT_ONLY_SIGNED_CALLER_NOT_PROVISIONED",
    );
    expect(readFileSync(policyModule, "utf8")).toContain(
      "Communication Note preview runner terminal persistence is unavailable",
    );
    expect(readFileSync(resolvedRuntimeBindingModule, "utf8")).toContain(
      "SOURCE_CONTRACT_WITH_UNAPPLIED_INHERITED_CALLER_BINDING_NOT_APPROVED",
    );
    expect(readFileSync(resolvedRuntimeBindingModule, "utf8")).toContain(
      "RESOLVED_RUNTIME_BINDING_READY =\n  false",
    );
    expect(readFileSync(durableCredentialResolverModule, "utf8")).toContain(
      "SOURCE_CONTRACT_WITH_UNAPPLIED_DURABLE_BROKER_NOT_APPROVED",
    );
    expect(readFileSync(durableCredentialResolverModule, "utf8")).toContain(
      "DURABLE_CALLER_CREDENTIAL_RESOLVER_READY =\n  false",
    );
  });

  it("quarantines the M1m approved runtime adapters to exact audited source-only importers", () => {
    const modules = [
      {
        relativePath:
          "src/lib/v1/communication-note-preview-approved-runtime-target.server.ts",
        expectedImporterPaths: [
          "src/lib/v1/communication-note-preview-approved-runtime-adapters-hosted.live.test.ts",
          "src/lib/v1/communication-note-preview-approved-runtime-adapters.server.test.ts",
          "src/lib/v1/communication-note-preview-approved-runtime-adapters.server.ts",
          "src/lib/v1/communication-note-preview-approved-runtime-target.server.test.ts",
          "src/lib/v1/communication-note-preview-product-runtime-identities.server.test.ts",
          "src/lib/v1/communication-note-preview-product-runtime-identities.server.ts",
        ],
      },
      {
        relativePath:
          "src/lib/v1/communication-note-preview-approved-runtime-management-session.server.ts",
        expectedImporterPaths: [
          "src/lib/v1/communication-note-preview-approved-runtime-adapters-hosted.live.test.ts",
          "src/lib/v1/communication-note-preview-approved-runtime-adapters.server.test.ts",
          "src/lib/v1/communication-note-preview-approved-runtime-adapters.server.ts",
          "src/lib/v1/communication-note-preview-approved-runtime-management-session.server.test.ts",
        ],
      },
      {
        relativePath:
          "src/lib/v1/communication-note-preview-approved-runtime-broker.server.ts",
        expectedImporterPaths: [
          "src/lib/v1/communication-note-preview-approved-runtime-adapters-hosted.live.test.ts",
          "src/lib/v1/communication-note-preview-approved-runtime-adapters.server.ts",
          "src/lib/v1/communication-note-preview-approved-runtime-broker.server.test.ts",
          "src/lib/v1/communication-note-preview-approved-runtime-management-session.server.test.ts",
          "src/lib/v1/communication-note-preview-approved-runtime-management-session.server.ts",
        ],
      },
      {
        relativePath:
          "src/lib/v1/communication-note-preview-approved-runtime-postgres-session.server.ts",
        expectedImporterPaths: [
          "src/lib/v1/communication-note-preview-approved-runtime-adapters-hosted.live.test.ts",
          "src/lib/v1/communication-note-preview-approved-runtime-adapters.server.test.ts",
          "src/lib/v1/communication-note-preview-approved-runtime-adapters.server.ts",
          "src/lib/v1/communication-note-preview-approved-runtime-postgres-session.server.test.ts",
        ],
      },
      {
        relativePath:
          "src/lib/v1/communication-note-preview-approved-runtime-adapters.server.ts",
        expectedImporterPaths: [
          "src/lib/v1/communication-note-preview-approved-runtime-adapters-hosted.live.test.ts",
          "src/lib/v1/communication-note-preview-approved-runtime-adapters.server.test.ts",
          "src/lib/v1/communication-note-preview-product-runtime-composition.server.test.ts",
          "src/lib/v1/communication-note-preview-product-runtime-composition.server.ts",
        ],
      },
    ] as const;

    for (const { relativePath, expectedImporterPaths } of modules) {
      const modulePath = join(process.cwd(), relativePath);
      const importStem = relativePath
        .split("/")
        .at(-1)
        ?.replace(/\.ts$/, "");
      expect(importStem).toBeDefined();
      const importPattern = new RegExp(
        `(?:from\\s+|import\\s*(?:\\(\\s*)?|require\\s*\\(\\s*)["'][^"']*${importStem?.replaceAll(".", "\\.")}(?:\\.(?:[cm]?[jt]s|[jt]sx))?["']`,
      );
      const importers = walkControlledScriptFiles().filter((file) =>
        importPattern.test(readFileSync(file, "utf8")),
      );
      const source = readFileSync(modulePath, "utf8");

      expect(importers).toEqual(
        expectedImporterPaths
          .map((path) => join(process.cwd(), path))
          .sort(),
      );
      expect(walkSourceFiles("src/app").filter((file) =>
        importPattern.test(readFileSync(file, "utf8")),
      )).toEqual([]);
      expect(walkSourceFiles("src/components").filter((file) =>
        importPattern.test(readFileSync(file, "utf8")),
      )).toEqual([]);
      expect(source).not.toMatch(
        /process\.env|fetch\s*\(|(?:from\s+|import\s*\(|require\s*\()\s*["'](?:pg|openai|@supabase\/)|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|NEXT_PUBLIC_|postgres(?:ql)?:\/\/|DATABASE_URL|connectionString\s*:|console\.(?:debug|error|info|log|warn)|\blogger\b|\blog\s*\(/i,
      );
      expect(source).not.toMatch(/_READY\s*=\s*(?:\r?\n\s*)?true\b/);
      expect(source).toMatch(/_READY\s*=\s*(?:\r?\n\s*)?false\s+as const/);
      expect(source).toContain("SOURCE_ADAPTER");
    }
  });

  it("quarantines the M1r product runtime composition and pg driver to one server-only source boundary", () => {
    const relativePath =
      "src/lib/v1/communication-note-preview-product-runtime-composition.server.ts";
    const modulePath = join(process.cwd(), relativePath);
    const importStem =
      "communication-note-preview-product-runtime-composition.server";
    const importPattern = new RegExp(
      `(?:from\\s+|import\\s*(?:\\(\\s*)?|require\\s*\\(\\s*)["'][^"']*${importStem.replaceAll(".", "\\.")}(?:\\.(?:[cm]?[jt]s|[jt]sx))?["']`,
    );
    const importers = walkControlledScriptFiles().filter((file) =>
      importPattern.test(readFileSync(file, "utf8")),
    );
    const source = readFileSync(modulePath, "utf8");

    expect(importers).toEqual([
      join(
        process.cwd(),
        "src/lib/v1/communication-note-preview-product-runtime-composition.server.test.ts",
      ),
      join(
        process.cwd(),
        "src/lib/v1/communication-note-preview-product-runtime-identities.server.test.ts",
      ),
      join(
        process.cwd(),
        "src/lib/v1/communication-note-preview-product-runtime-identities.server.ts",
      ),
    ]);
    expect(
      walkSourceFiles("src/app").filter((file) =>
        importPattern.test(readFileSync(file, "utf8")),
      ),
    ).toEqual([]);
    expect(
      walkSourceFiles("src/components").filter((file) =>
        importPattern.test(readFileSync(file, "utf8")),
      ),
    ).toEqual([]);
    expect(
      walkAllScriptFiles("src").filter(
        (file) =>
          !/\.test\.(?:[cm]?[jt]s|[jt]sx)$/.test(file) &&
          /(?:from\s+|import\s*(?:\(\s*)?|require\s*\(\s*)["']pg(?:\/[^"']*)?["']/.test(
            readFileSync(file, "utf8"),
          ),
      ),
    ).toEqual([modulePath]);
    expect(source).toMatch(/^import "server-only";/);
    expect(source).toContain('import { Client as PgClient } from "pg";');
    expect(source).not.toMatch(
      /process\.env|import\.meta\.env|Deno\.env|Bun\.env|fetch\s*\(|node:(?:http|https|net|tls)|@supabase\/|postgres(?:ql)?:\/\/|DATABASE_URL|connectionString\s*:|SUPABASE_|OPENAI_|NEXT_PUBLIC_|console\.|\blogger\b|new\s+PgClient/i,
    );
    expect(source).not.toMatch(/_READY\s*=\s*(?:\r?\n\s*)?true\b/);
    expect(source).toMatch(
      /_READY\s*=\s*(?:\r?\n\s*)?false\s+as const/,
    );
    expect(source).toContain(
      "SOURCE_PRODUCT_RUNTIME_COMPOSITION_NOT_ACTIVATED",
    );
  });

  it("quarantines the M1s Product runtime identities to its own test and forbids ambient authority", () => {
    const relativePath =
      "src/lib/v1/communication-note-preview-product-runtime-identities.server.ts";
    const modulePath = join(process.cwd(), relativePath);
    const testPath = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-product-runtime-identities.server.test.ts",
    );
    const importStem =
      "communication-note-preview-product-runtime-identities.server";
    const importPattern = new RegExp(
      `(?:from\\s+|import\\s*(?:\\(\\s*)?|require\\s*\\(\\s*)["'][^"']*${importStem.replaceAll(".", "\\.")}(?:\\.(?:[cm]?[jt]s|[jt]sx))?["']`,
    );
    const importers = walkControlledScriptFiles().filter((file) =>
      importPattern.test(readFileSync(file, "utf8")),
    );
    const source = readFileSync(modulePath, "utf8");

    expect(importers).toEqual([
      testPath,
      join(
        process.cwd(),
        "src/lib/v1/communication-note-preview-product-runtime-platform-adapters.server.test.ts",
      ),
      join(
        process.cwd(),
        "src/lib/v1/communication-note-preview-product-runtime-platform-adapters.server.ts",
      ),
    ]);
    expect(
      walkSourceFiles("src/app").filter((file) =>
        importPattern.test(readFileSync(file, "utf8")),
      ),
    ).toEqual([]);
    expect(
      walkSourceFiles("src/components").filter((file) =>
        importPattern.test(readFileSync(file, "utf8")),
      ),
    ).toEqual([]);
    expect(source).toMatch(/^import "server-only";/);
    expect(source).not.toMatch(
      /process\.env|import\.meta\.env|Deno\.env|Bun\.env|fetch\s*\(|(?:from\s+|import\s*\(|require\s*\()\s*["'](?:pg|openai|@supabase\/)|node:(?:http|https|net|tls)|postgres(?:ql)?:\/\/|DATABASE_URL|connectionString\s*:|SUPABASE_(?:ACCESS_TOKEN|SECRET_KEY|SERVICE_ROLE_KEY)|NEXT_PUBLIC_|console\.(?:debug|error|info|log|warn)|\blogger\b|\blog\s*\(/i,
    );
    expect(source).not.toMatch(/_READY\s*=\s*(?:\r?\n\s*)?true\b/);
    expect(source).toMatch(
      /_READY\s*=\s*(?:\r?\n\s*)?false\s+as const/,
    );
    expect(source).toContain("SOURCE_PRODUCT_RUNTIME_IDENTITIES_NOT_ACTIVATED");
  });

  it("quarantines the M1t Product runtime platform adapters to its own test and forbids ambient authority", () => {
    const relativePath =
      "src/lib/v1/communication-note-preview-product-runtime-platform-adapters.server.ts";
    const modulePath = join(process.cwd(), relativePath);
    const testPath = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-product-runtime-platform-adapters.server.test.ts",
    );
    const importStem =
      "communication-note-preview-product-runtime-platform-adapters.server";
    const importPattern = new RegExp(
      `(?:from\\s+|import\\s*(?:\\(\\s*)?|require\\s*\\(\\s*)["'][^"']*${importStem.replaceAll(".", "\\.")}(?:\\.(?:[cm]?[jt]s|[jt]sx))?["']`,
    );
    const importers = walkControlledScriptFiles().filter((file) =>
      importPattern.test(readFileSync(file, "utf8")),
    );
    const source = readFileSync(modulePath, "utf8");

    expect(importers).toEqual([
      testPath,
      join(
        process.cwd(),
        "src/lib/v1/communication-note-preview-product-runtime-provider-bridges-m1v.server.test.ts",
      ),
    ].sort());
    expect(
      walkSourceFiles("src/app").filter((file) =>
        importPattern.test(readFileSync(file, "utf8")),
      ),
    ).toEqual([]);
    expect(
      walkSourceFiles("src/components").filter((file) =>
        importPattern.test(readFileSync(file, "utf8")),
      ),
    ).toEqual([]);
    expect(source).toMatch(/^import "server-only";/);
    expect(source).not.toMatch(
      /process\.env|import\.meta\.env|Deno\.env|Bun\.env|fetch\s*\(|(?:from\s+|import\s*\(|require\s*\()\s*["'](?:pg|openai|@supabase\/)|node:(?:http|https|net|tls)|postgres(?:ql)?:\/\/|DATABASE_URL|connectionString\s*:|SUPABASE_(?:SECRET_KEY|SERVICE_ROLE_KEY)|NEXT_PUBLIC_|console\.(?:debug|error|info|log|warn)|\blogger\b|\blog\s*\(/i,
    );
    expect(source).not.toContain("/v1/branches/");
    expect(source).not.toMatch(/_READY\s*=\s*(?:\r?\n\s*)?true\b/);
    expect(source).toMatch(
      /_READY\s*=\s*(?:\r?\n\s*)?false\s+as const/,
    );
    expect(source).toContain(
      "SOURCE_PRODUCT_RUNTIME_PLATFORM_ADAPTERS_NOT_ACTIVATED",
    );
    expect(source).toContain(
      "/v1/projects/{production_ref}/branches",
    );
    expect(source).toContain(
      "/v1/projects/${CARESLINK_PRODUCTION_SUPABASE_REF}/branches",
    );
  });

  it("quarantines the M1u GCP provider adapters to its own test and forbids ambient cloud authority", () => {
    const relativePath =
      "src/lib/v1/communication-note-preview-product-runtime-gcp-adapters.server.ts";
    const modulePath = join(process.cwd(), relativePath);
    const testPath = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-product-runtime-gcp-adapters.server.test.ts",
    );
    const importStem =
      "communication-note-preview-product-runtime-gcp-adapters.server";
    const importPattern = new RegExp(
      `(?:from\\s+|import\\s*(?:\\(\\s*)?|require\\s*\\(\\s*)["'][^"']*${importStem.replaceAll(".", "\\.")}(?:\\.(?:[cm]?[jt]s|[jt]sx))?["']`,
    );
    const importers = walkControlledScriptFiles().filter((file) =>
      importPattern.test(readFileSync(file, "utf8")),
    );
    const source = readFileSync(modulePath, "utf8");

    expect(importers).toEqual([
      testPath,
      join(
        process.cwd(),
        "src/lib/v1/communication-note-preview-product-runtime-provider-bridges-m1v.server.test.ts",
      ),
    ].sort());
    expect(
      walkSourceFiles("src/app").filter((file) =>
        importPattern.test(readFileSync(file, "utf8")),
      ),
    ).toEqual([]);
    expect(
      walkSourceFiles("src/components").filter((file) =>
        importPattern.test(readFileSync(file, "utf8")),
      ),
    ).toEqual([]);
    expect(source).toMatch(/^import "server-only";/);
    expect(source).not.toMatch(
      /process\.env|import\.meta\.env|Deno\.env|Bun\.env|GOOGLE_APPLICATION_CREDENTIALS|private_key|client_email|fetch\s*\(|node:(?:http|https|net|tls)|postgres(?:ql)?:\/\/|DATABASE_URL|connectionString\s*:|SUPABASE_(?:SECRET_KEY|SERVICE_ROLE_KEY)|NEXT_PUBLIC_|console\.(?:debug|error|info|log|warn)|\blogger\b|\blog\s*\(/i,
    );
    expect(source).not.toMatch(/_READY\s*=\s*(?:\r?\n\s*)?true\b/);
    expect(source).toMatch(
      /_READY\s*=\s*(?:\r?\n\s*)?false\s+as const/,
    );
    expect(source).toContain("SOURCE_GCP_PROVIDER_ADAPTERS_NOT_ACTIVATED");
    expect(source).toContain("applicationDefaultCredentialsAllowed: false");
    expect(source).toContain("serviceAccountJsonAllowed: false");
    expect(source).toContain("concreteGoogleSdkClientsWired: false");
    expect(source).not.toContain("/versions/latest");
  });

  it("quarantines both M1v provider bridges to their own tests and the single audited integration importer", () => {
    const integrationTest = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-product-runtime-provider-bridges-m1v.server.test.ts",
    );
    const modules = [
      {
        relativePath:
          "src/lib/v1/communication-note-preview-product-runtime-gcp-rest-bridge.server.ts",
        ownTest:
          "src/lib/v1/communication-note-preview-product-runtime-gcp-rest-bridge.server.test.ts",
        status: "SOURCE_GCP_REST_BRIDGE_NOT_ACTIVATED",
      },
      {
        relativePath:
          "src/lib/v1/communication-note-preview-product-runtime-supabase-management-bridge.server.ts",
        ownTest:
          "src/lib/v1/communication-note-preview-product-runtime-supabase-management-bridge.server.test.ts",
        status: "SOURCE_SUPABASE_MANAGEMENT_BRIDGE_NOT_ACTIVATED",
      },
    ] as const;

    for (const { relativePath, ownTest, status } of modules) {
      const modulePath = join(process.cwd(), relativePath);
      const importStem = relativePath
        .split("/")
        .at(-1)
        ?.replace(/\.ts$/, "");
      expect(importStem).toBeDefined();
      const importPattern = new RegExp(
        `(?:from\\s+|import\\s*(?:\\(\\s*)?|require\\s*\\(\\s*)["'][^"']*${importStem?.replaceAll(".", "\\.")}(?:\\.(?:[cm]?[jt]s|[jt]sx))?["']`,
      );
      const importers = walkControlledScriptFiles().filter((file) =>
        importPattern.test(readFileSync(file, "utf8")),
      );
      const source = readFileSync(modulePath, "utf8");

      expect(importers).toEqual([
        join(process.cwd(), ownTest),
        integrationTest,
      ].sort());
      expect(
        walkSourceFiles("src/app").filter((file) =>
          importPattern.test(readFileSync(file, "utf8")),
        ),
      ).toEqual([]);
      expect(
        walkSourceFiles("src/components").filter((file) =>
          importPattern.test(readFileSync(file, "utf8")),
        ),
      ).toEqual([]);
      expect(source).toMatch(/^import "server-only";/);
      expect(source).not.toMatch(/_READY\s*=\s*(?:\r?\n\s*)?true\b/);
      expect(source).toMatch(
        /_READY\s*=\s*(?:\r?\n\s*)?false\s+as const/,
      );
      expect(source).toContain(status);
      expect(source).not.toMatch(
        /process\.env|import\.meta\.env|Deno\.env|Bun\.env|SUPABASE_(?:SECRET_KEY|SERVICE_ROLE_KEY)|GOOGLE_APPLICATION_CREDENTIALS|private_key|client_email|NEXT_PUBLIC_|console\.(?:debug|error|info|log|warn)|\blogger\b|\blog\s*\(/i,
      );
    }
  });

  it("exposes the privacy review as a physical POST-only route", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/v1/privacy-reviews/route.ts"),
      "utf8",
    );
    expect(source).toContain("export async function POST");
    expect(source).not.toMatch(/export async function (?:DELETE|GET|PATCH|PUT)/);
  });

  it("keeps the M1x Communication Note generation route POST-only and outside provider runtimes", () => {
    const handlerPath = join(
      process.cwd(),
      "src/lib/communication-note-generation-route.server.ts",
    );
    const handlerTestPath = join(
      process.cwd(),
      "src/lib/communication-note-generation-route.server.test.ts",
    );
    const boundaryTestPath = join(
      process.cwd(),
      "src/lib/v1/runtime-boundary.test.ts",
    );
    const principalCompositionPath = join(
      process.cwd(),
      "src/lib/communication-note-generation-principal-composition.server.ts",
    );
    const principalCompositionTestPath = join(
      process.cwd(),
      "src/lib/communication-note-generation-principal-composition.server.test.ts",
    );
    const sessionStatusPath = join(
      process.cwd(),
      "src/lib/v1/product-api-session-status.server.ts",
    );
    const routeSource = readFileSync(
      join(
        process.cwd(),
        "src/app/api/ai-documents/communication-note/generate/route.ts",
      ),
      "utf8",
    );
    const handlerSource = readFileSync(
      handlerPath,
      "utf8",
    );
    const testOnlyFactoryImporters = walkControlledScriptFiles().filter(
      (file) =>
        file !== handlerPath &&
        file !== boundaryTestPath &&
        readFileSync(file, "utf8").includes(
          "createTestOnlyCommunicationNoteGenerationHandler",
        ),
    );
    const principalCompositionImporters = walkControlledScriptFiles().filter(
      (file) =>
        file !== principalCompositionPath &&
        file !== boundaryTestPath &&
        readFileSync(file, "utf8").includes(
          "communication-note-generation-principal-composition",
        ),
    );
    const principalCompositionSource = readFileSync(
      principalCompositionPath,
      "utf8",
    );
    const privilegedClientFactoryImporters =
      walkControlledScriptFiles().filter(
        (file) =>
          file !== sessionStatusPath &&
          file !== boundaryTestPath &&
          readFileSync(file, "utf8").includes(
            "createCaresLinkV1SessionStatusRpcClient",
          ),
      );

    expect(routeSource).toContain("export async function POST");
    expect(routeSource).not.toMatch(
      /export async function (?:DELETE|GET|PATCH|PUT)/,
    );
    expect(routeSource).toContain('export const runtime = "nodejs"');
    expect(routeSource).toContain(
      "@/lib/communication-note-generation-route.server",
    );
    expect(routeSource).not.toContain(
      "communication-note-generation-principal-composition",
    );
    expect(routeSource).not.toMatch(/@\/lib\/v1|SUPABASE_SERVICE_ROLE_KEY|service_role/i);
    expect(handlerSource).toMatch(/^import "server-only";/);
    expect(handlerSource).not.toMatch(
      /openai-communication-note-provider|communication-note-preview-product-runtime|note-generation-owner-repository|account-credit-store|@vercel\/oidc|google-auth-library/,
    );
    expect(handlerSource).toContain(
      "COMMUNICATION_NOTE_GENERATION_SUBMITTER = undefined",
    );
    expect(handlerSource).not.toContain(
      "communication-note-generation-principal-composition",
    );
    expect(testOnlyFactoryImporters).toEqual([handlerTestPath]);
    expect(principalCompositionImporters).toEqual([
      principalCompositionTestPath,
    ]);
    expect(privilegedClientFactoryImporters).toEqual([
      principalCompositionPath,
    ]);
    expect(principalCompositionSource).toMatch(/^import "server-only";/);
    expect(principalCompositionSource).toContain(
      "COMMUNICATION_NOTE_GENERATION_FORMAL_PRINCIPAL_COMPOSITION =\n  undefined",
    );
    expect(principalCompositionSource).not.toContain(
      "createCaresLinkV1SessionStatusResolverFromEnv",
    );
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
