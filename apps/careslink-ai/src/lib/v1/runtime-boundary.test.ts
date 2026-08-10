import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

describe("V1 shadow runtime boundary", () => {
  it("is imported only by the two audited NDIS server routes", () => {
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

      if (expectedIntegration) {
        expect(source).toContain(
          "@/lib/v1/ndis-shadow-integration.server",
        );
        expect(source).toContain(expectedIntegration);
      } else {
        expect(importsV1Runtime, file).toBe(false);
      }
    }

    for (const allowedRuntimeImporter of allowedRuntimeImporters.keys()) {
      expect(runtimeFiles).toContain(allowedRuntimeImporter);
    }
  });

  it("marks both service-role runtime modules as server-only", () => {
    for (const relativePath of [
      "src/lib/v1/ndis-shadow-integration.server.ts",
      "src/lib/v1/ndis-shadow-repository.server.ts",
    ]) {
      expect(readFileSync(join(process.cwd(), relativePath), "utf8")).toMatch(
        /^import "server-only";/,
      );
    }
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

function walkAbsoluteSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return walkAbsoluteSourceFiles(path);
    }
    return isSourceFile(path) ? [path] : [];
  });
}

function isSourceFile(path: string) {
  return (
    [".ts", ".tsx"].includes(extname(path)) &&
    !/\.test\.(?:ts|tsx)$/.test(path)
  );
}
