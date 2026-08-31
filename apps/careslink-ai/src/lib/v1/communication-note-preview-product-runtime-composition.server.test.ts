import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";

const captured = vi.hoisted(() => {
  class FakePgClient {
    static constructed = 0;
    static connected = 0;
    static queried = 0;
    static ended = 0;

    constructor() {
      FakePgClient.constructed += 1;
    }

    async connect() {
      FakePgClient.connected += 1;
    }

    async query() {
      FakePgClient.queried += 1;
      return { rows: [] };
    }

    async end() {
      FakePgClient.ended += 1;
    }

    on() {
      return this;
    }
  }

  return {
    FakePgClient,
    adapterCalls: [] as Array<{
      value: unknown;
      context: unknown;
    }>,
    bundle: Object.freeze({
      status:
        "TEST_ONLY_M1M_APPROVED_RUNTIME_ADAPTER_BUNDLE_NOT_ACTIVATED" as const,
      databaseTarget: Object.freeze({ status: "OPAQUE_TEST_TARGET" }),
      runtimePort: Object.freeze({ status: "OPAQUE_TEST_RUNTIME_PORT" }),
    }),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("pg", () => ({ Client: captured.FakePgClient }));
vi.mock(
  "./communication-note-preview-approved-runtime-adapters.server",
  async (importOriginal) => {
    const original = await importOriginal<
      typeof import("./communication-note-preview-approved-runtime-adapters.server")
    >();
    return {
      ...original,
      async createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeAdapters(
        value: unknown,
        context: unknown,
      ) {
        captured.adapterCalls.push({ value, context });
        return captured.bundle;
      },
    };
  },
);

import * as productRuntimeComposition from "./communication-note-preview-product-runtime-composition.server";

const IMPORT_TIME_DRIVER_COUNTS = Object.freeze({
  adapterCalls: captured.adapterCalls.length,
  constructed: captured.FakePgClient.constructed,
  connected: captured.FakePgClient.connected,
  queried: captured.FakePgClient.queried,
  ended: captured.FakePgClient.ended,
});

const FIXED_FAILURE = Object.freeze({
  code: "PRODUCT_API_DISABLED",
  message:
    "Communication Note preview product runtime composition is unavailable",
});
const SECRET_SENTINEL = "M1R_SECRET_SENTINEL_MUST_NEVER_ESCAPE";

describe("Communication Note M1r product runtime composition", () => {
  beforeEach(() => {
    captured.adapterCalls.length = 0;
    captured.FakePgClient.constructed = 0;
    captured.FakePgClient.connected = 0;
    captured.FakePgClient.queried = 0;
    captured.FakePgClient.ended = 0;
  });

  it("is frozen, source-only and keeps the formal product factory fixed-off", async () => {
    expect(IMPORT_TIME_DRIVER_COUNTS).toEqual({
      adapterCalls: 0,
      constructed: 0,
      connected: 0,
      queried: 0,
      ended: 0,
    });
    expect(
      productRuntimeComposition.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_COMPOSITION_READY,
    ).toBe(false);
    expect(
      productRuntimeComposition.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_COMPOSITION,
    ).toBeUndefined();
    expect(
      productRuntimeComposition.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_COMPOSITION_VERSION,
    ).toBe(
      "composition.communication.openai.synthetic-preview.2026-09-01.m1r.v1",
    );
    expect(
      productRuntimeComposition.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_COMPOSITION_POLICY_DIGEST,
    ).toBe(
      "1227ff3dac4283749b62b8af953dea02d51da31f3edc0a9d4c3c62a9a1364af0",
    );
    expect(
      canonicalSha256(
        withoutPolicyDigest(
          productRuntimeComposition.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_COMPOSITION_POLICY,
        ),
      ),
    ).toBe(
      productRuntimeComposition.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_COMPOSITION_POLICY_DIGEST,
    );
    expect(
      productRuntimeComposition.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_COMPOSITION_POLICY,
    ).toMatchObject({
      status: "SOURCE_PRODUCT_RUNTIME_COMPOSITION_NOT_ACTIVATED",
      ready: false,
      runtimeDependencyPromoted: true,
      nodeRuntimeRequired: true,
      edgeRuntimeSupported: false,
      postgresDriverPackage: "pg",
      postgresDriverVersion: "8.23.0",
      postgresDriverImport: "STATIC_SERVER_ONLY_NAMED_IMPORT",
      sameClientConstructorForManagementAndRuntime: true,
      clientConstructorExported: false,
      constructorInstantiationAtModuleLoad: false,
      approvedTargetResolverPresent: false,
      credentialTransportPresent: false,
      deploymentIdentityPresent: false,
      productRouteImporterPresent: false,
      productionMigrationApproved: false,
      deploymentApproved: false,
      activationApproved: false,
    });
    expect(
      Object.isFrozen(
        productRuntimeComposition.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_COMPOSITION_POLICY,
      ),
    ).toBe(true);
    expect(Object.keys(productRuntimeComposition).sort()).toEqual([
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_COMPOSITION",
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_COMPOSITION_POLICY",
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_COMPOSITION_POLICY_DIGEST",
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_COMPOSITION_READY",
      "CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_COMPOSITION_VERSION",
      "createCaresLinkV1CommunicationNotePreviewProductRuntimeComposition",
      "createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeComposition",
    ]);

    let traps = 0;
    const hostile = new Proxy(
      {},
      {
        get() {
          traps += 1;
          return SECRET_SENTINEL;
        },
        getOwnPropertyDescriptor() {
          traps += 1;
          return undefined;
        },
        getPrototypeOf() {
          traps += 1;
          return Object.prototype;
        },
        ownKeys() {
          traps += 1;
          return [];
        },
      },
    );
    await expect(
      productRuntimeComposition.createCaresLinkV1CommunicationNotePreviewProductRuntimeComposition(
        hostile,
        hostile,
      ),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(traps).toBe(0);
    expect(captured.adapterCalls).toEqual([]);
    expectDriverUnused();
  });

  it("privately injects one validated pg constructor into both M1m client ports", async () => {
    const options = validOptions();
    const context = Object.freeze({
      signal: new AbortController().signal,
      secret: SECRET_SENTINEL,
    });
    const result =
      await productRuntimeComposition.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeComposition(
        options,
        context,
      );

    expect(result).toBe(captured.bundle);
    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.stringify(result)).not.toContain(SECRET_SENTINEL);
    expect(captured.adapterCalls).toHaveLength(1);
    expect(captured.adapterCalls[0]?.context).toBe(context);
    const injected = captured.adapterCalls[0]?.value as Record<
      string,
      unknown
    >;
    expect(Object.keys(injected)).toEqual([
      "capability",
      "targetResolver",
      "targetRequest",
      "verifiedAuthorization",
      "custodyResolver",
      "managementCredentialTransport",
      "ManagementClient",
      "Client",
      "clock",
      "entropy",
    ]);
    expect(injected).toMatchObject({
      capability: "TEST_ONLY_M1M_APPROVED_RUNTIME_ADAPTERS",
      targetResolver: options.targetResolver,
      targetRequest: options.targetRequest,
      verifiedAuthorization: options.verifiedAuthorization,
      custodyResolver: options.custodyResolver,
      managementCredentialTransport: options.managementCredentialTransport,
      clock: options.clock,
      entropy: options.entropy,
    });
    expect(injected.ManagementClient).toBe(captured.FakePgClient);
    expect(injected.Client).toBe(captured.FakePgClient);
    expect(injected.ManagementClient).toBe(injected.Client);
    expectDriverUnused();
  });

  it("rejects malformed, accessor and Proxy options before M1m or pg can run", async () => {
    const valid = validOptions();
    const missing = Object.fromEntries(
      Object.entries(valid).filter(([key]) => key !== "entropy"),
    );
    const extra = { ...valid, extra: SECRET_SENTINEL };
    const wrongCapability = { ...valid, capability: "WRONG" };
    const accessor = { ...valid };
    Object.defineProperty(accessor, "clock", {
      enumerable: true,
      get() {
        throw new Error(SECRET_SENTINEL);
      },
    });
    let traps = 0;
    const hostile = new Proxy(valid, {
      get() {
        traps += 1;
        return SECRET_SENTINEL;
      },
      getOwnPropertyDescriptor() {
        traps += 1;
        return undefined;
      },
      getPrototypeOf() {
        traps += 1;
        return Object.prototype;
      },
      ownKeys() {
        traps += 1;
        return [];
      },
    });

    for (const candidate of [
      missing,
      extra,
      wrongCapability,
      accessor,
      hostile,
      Object.create(null),
      null,
    ]) {
      await expect(
        productRuntimeComposition.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeComposition(
          candidate,
          Object.freeze({}),
        ),
      ).rejects.toMatchObject(FIXED_FAILURE);
    }
    expect(traps).toBe(0);
    expect(captured.adapterCalls).toEqual([]);
    expectDriverUnused();
  });

  it("pins pg as a production dependency and keeps the source boundary inert", () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(packageJson.dependencies.pg).toBe("8.23.0");
    expect(packageJson.devDependencies.pg).toBeUndefined();
    expect(packageJson.devDependencies["@types/pg"]).toBe("8.23.0");

    const lock = readFileSync(
      join(process.cwd(), "pnpm-lock.yaml"),
      "utf8",
    );
    const importer = lock.slice(0, lock.indexOf("\npackages:"));
    const dependencies = importer.slice(
      importer.indexOf("    dependencies:"),
      importer.indexOf("    devDependencies:"),
    );
    const devDependencies = importer.slice(
      importer.indexOf("    devDependencies:"),
    );
    expect(dependencies).toMatch(
      /\n      pg:\n        specifier: 8\.23\.0\n        version: 8\.23\.0/,
    );
    expect(devDependencies).not.toMatch(/\n      pg:/);
    expect(devDependencies).toMatch(
      /\n      '@types\/pg':\n        specifier: 8\.23\.0\n        version: 8\.23\.0/,
    );

    const modulePath = join(
      process.cwd(),
      "src/lib/v1/communication-note-preview-product-runtime-composition.server.ts",
    );
    const source = readFileSync(modulePath, "utf8");
    expect(source).toMatch(/^import "server-only";/);
    expect(source).toContain('import { Client as PgClient } from "pg";');
    expect(source).toContain(
      'import pgPackageJson from "pg/package.json";',
    );
    expect(source).not.toMatch(
      /process\.env|import\.meta\.env|Deno\.env|Bun\.env|fetch\s*\(|node:(?:http|https|net|tls)|(?:from\s+|import\s*\(|require\s*\()\s*["'](?:openai|@supabase\/)|postgres(?:ql)?:\/\/|DATABASE_URL|connectionString\s*:|SUPABASE_|OPENAI_|NEXT_PUBLIC_|console\.|\blogger\b|new\s+PgClient/i,
    );

    const pgImporters = walkSourceFiles(join(process.cwd(), "src")).filter(
      (file) =>
        /(?:from\s+|import\s*(?:\(\s*)?|require\s*\(\s*)["']pg(?:\/[^"']*)?["']/.test(
          readFileSync(file, "utf8"),
        ),
    );
    expect(pgImporters).toEqual([modulePath]);
  });

  it("rejects Proxy constructors and accessor methods without invoking traps", async () => {
    let proxyTraps = 0;
    const proxyClient = new Proxy(class {}, {
      get() {
        proxyTraps += 1;
        return undefined;
      },
    });
    vi.resetModules();
    vi.doMock("pg", () => ({ Client: proxyClient }));
    await expect(
      import("./communication-note-preview-product-runtime-composition.server"),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(proxyTraps).toBe(0);

    let accessorTraps = 0;
    class AccessorPgClient {
      on() {
        return this;
      }
    }
    for (const method of ["connect", "query", "end"] as const) {
      Object.defineProperty(AccessorPgClient.prototype, method, {
        configurable: true,
        get() {
          accessorTraps += 1;
          return () => undefined;
        },
      });
    }
    vi.resetModules();
    vi.doMock("pg", () => ({ Client: AccessorPgClient }));
    await expect(
      import("./communication-note-preview-product-runtime-composition.server"),
    ).rejects.toMatchObject(FIXED_FAILURE);
    expect(accessorTraps).toBe(0);
  });

  it("cold-loads the actual pinned pg named export without constructing a client", async () => {
    vi.resetModules();
    vi.doUnmock("pg");
    const actualComposition =
      await import("./communication-note-preview-product-runtime-composition.server");

    expect(
      actualComposition.CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_PRODUCT_RUNTIME_COMPOSITION_READY,
    ).toBe(false);
    const context = Object.freeze({ signal: new AbortController().signal });
    await expect(
      actualComposition.createTestOnlyCaresLinkV1CommunicationNotePreviewProductRuntimeComposition(
        validOptions(),
        context,
      ),
    ).resolves.toBe(captured.bundle);
    expect(captured.adapterCalls).toHaveLength(1);
    const injected = captured.adapterCalls[0]?.value as Record<
      string,
      unknown
    >;
    expect(typeof injected.Client).toBe("function");
    expect(injected.Client).not.toBe(captured.FakePgClient);
    expect(injected.ManagementClient).toBe(injected.Client);
    expect(captured.FakePgClient.constructed).toBe(0);
  });
});

function validOptions() {
  return {
    capability: "TEST_ONLY_M1R_PRODUCT_RUNTIME_COMPOSITION",
    targetResolver: Object.freeze({ resolve: vi.fn() }),
    targetRequest: Object.freeze({ request: "opaque" }),
    verifiedAuthorization: Object.freeze({ verify: vi.fn() }),
    custodyResolver: Object.freeze({ resolve: vi.fn() }),
    managementCredentialTransport: Object.freeze({ deliver: vi.fn() }),
    clock: Object.freeze({ now: vi.fn() }),
    entropy: Object.freeze({ bytes: vi.fn() }),
  };
}

function expectDriverUnused() {
  expect(captured.FakePgClient.constructed).toBe(0);
  expect(captured.FakePgClient.connected).toBe(0);
  expect(captured.FakePgClient.queried).toBe(0);
  expect(captured.FakePgClient.ended).toBe(0);
}

function withoutPolicyDigest(value: Readonly<Record<string, unknown>>) {
  const core = { ...value };
  delete core.policyDigest;
  return core;
}

function canonicalSha256(value: unknown) {
  return createHash("sha256")
    .update(stringifyCaresLinkV1CanonicalJson(value), "utf8")
    .digest("hex");
}

function walkSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walkSourceFiles(path);
    return [
      ".ts",
      ".tsx",
      ".mts",
      ".cts",
      ".js",
      ".jsx",
      ".mjs",
      ".cjs",
    ].includes(extname(path)) &&
      !/\.test\.(?:[cm]?[jt]s|[jt]sx)$/.test(path)
      ? [path]
      : [];
  });
}
