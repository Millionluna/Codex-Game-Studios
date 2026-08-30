import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNTIME_TARGET_RESOLVER,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_ADAPTER_ACCESS,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_POLICY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_POLICY_DIGEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_READY,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_VERSION,
  createCaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetResolver,
  createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetResolver,
  readCaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetForAdapter,
  resolveTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeTarget,
} from "./communication-note-preview-approved-runtime-target.server";
import {
  createTestOnlyCaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget,
} from "./communication-note-preview-runner-terminal-resolved-runtime-binding.server";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./ndis-shadow-guard";

vi.mock("server-only", () => ({}));

const NOW = "2026-08-31T12:00:00.000Z";
const TARGET_REF = "abcdefghijklmnopqrst";
const CA_BYTES = new TextEncoder().encode(
  "-----BEGIN CERTIFICATE-----\nMIIB-test-only-pinned-root\n-----END CERTIFICATE-----\n",
);
const CA_SHA256 = sha256(CA_BYTES);
const TARGET_HMAC = "1".repeat(64);
const PRODUCTION_HMAC = "2".repeat(64);
const HMAC_KEY_REFERENCE = "3".repeat(64);
const CONTROL_PLANE_EVIDENCE = "4".repeat(64);

describe("Communication Note M1m approved runtime target resolver", () => {
  it("is source-only, default-off and keeps the public factory fail closed", () => {
    expect(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_READY)
      .toBe(false);
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_POLICY,
    ).toEqual({
      version:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_VERSION,
      status: "SOURCE_ADAPTER_NOT_ACTIVATED",
      ready: false,
      targetClass: "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW",
      productionTargetAllowed: false,
      defaultBranchAllowed: false,
      persistentAllowed: false,
      withDataAllowed: false,
      database: "postgres",
      postgresMajor: 17,
      allowedConnectionModes: ["DIRECT", "SUPAVISOR_SESSION"],
      port: 5432,
      tlsMode: "VERIFY_FULL_PINNED_CA",
      maximumControlPlaneAgeMs: 5 * 60 * 1_000,
      maximumControlPlaneRemainingMs: 5 * 60 * 1_000,
      rawCredentialMaterialPresent: false,
      targetDescriptorBinding: "CANONICAL_SHA256_SEALED_WEAKMAP",
      caBinding: "AUTHENTICATED_CONTROL_PLANE_SHA256_AND_PINNED_BYTES",
      clockBinding: "INJECTED_MONOTONIC_RESOLVER_CLOCK",
      policyDigest:
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_POLICY_DIGEST,
    });
    expect(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_POLICY_DIGEST,
    ).toMatch(/^[a-f0-9]{64}$/);
    expect(
      Object.isFrozen(
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_POLICY,
      ),
    ).toBe(true);
    expect(
      Object.isFrozen(
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_POLICY
          .allowedConnectionModes,
      ),
    ).toBe(true);
    expect(CARESLINK_V1_COMMUNICATION_NOTE_APPROVED_RUNTIME_TARGET_RESOLVER)
      .toBeUndefined();
    expect(() =>
      createCaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetResolver({}),
    ).toThrowError(expect.objectContaining({
      code: "PRODUCT_API_DISABLED",
      message: "Communication Note preview approved runtime target is unavailable",
    }));
  });

  it("resolves an exact direct PG17 Preview observation to an M1l-compatible content-free descriptor", async () => {
    const harness = createHarness();

    const resolution = await resolveTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeTarget(
      harness.resolver,
      request(),
      context(),
    );

    expect(resolution.descriptor).toEqual({
      status: "VALIDATED_DISPOSABLE_PREVIEW_TARGET_NOT_APPROVED",
      targetClass: "DISPOSABLE_NO_DATA_NON_PRODUCTION_PREVIEW",
      targetProjectRefHmac: TARGET_HMAC,
      productionProjectRefHmac: PRODUCTION_HMAC,
      controlPlaneEvidenceSha256: CONTROL_PLANE_EVIDENCE,
      databaseName: "postgres",
      postgresMajor: 17,
      projectStatus: "ACTIVE_HEALTHY",
      tlsMode: "VERIFY_FULL_PINNED_CA",
      tlsRootCertificateSha256: CA_SHA256,
      observedAt: "2026-08-31T11:58:00.000Z",
      expiresAt: "2026-08-31T12:04:00.000Z",
      defaultBranch: false,
      persistent: false,
      withData: false,
      productionExcluded: true,
      rawCredentialMaterialPresent: false,
    });
    expect(Object.isFrozen(resolution)).toBe(true);
    expect(Object.isFrozen(resolution.descriptor)).toBe(true);
    expect(
      createTestOnlyCaresLinkV1CommunicationNotePreviewResolvedRuntimeDatabaseTarget(
        resolution.descriptor,
      ),
    ).toEqual(resolution.descriptor);
    expect(Object.keys(resolution.capability)).toEqual([
      "status",
      "rawCredentialMaterialPresent",
    ]);
    const serialized = JSON.stringify(resolution);
    expect(serialized).not.toContain(TARGET_REF);
    expect(serialized).not.toContain(CARESLINK_PRODUCTION_SUPABASE_REF);
    expect(serialized).not.toContain("db.");
    expect(serialized).not.toContain("CERTIFICATE");

    expect(harness.observe).toHaveBeenCalledWith(
      {
        source: "SUPABASE_CONTROL_PLANE",
        targetProjectRef: TARGET_REF,
      },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(harness.hmac.mock.calls.map(([value]) => value)).toEqual([
      {
        purpose: "SUPABASE_PROJECT_REF_BINDING",
        projectRef: TARGET_REF,
      },
      {
        purpose: "SUPABASE_PROJECT_REF_BINDING",
        projectRef: CARESLINK_PRODUCTION_SUPABASE_REF,
      },
    ]);
    expect(harness.load).toHaveBeenCalledWith(
      { tlsRootCertificateSha256: CA_SHA256 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    const access = readCaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetForAdapter(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_ADAPTER_ACCESS,
      resolution.capability,
      resolution.descriptor,
    );
    expect(access).toMatchObject({
      targetProjectRef: TARGET_REF,
      productionProjectRef: CARESLINK_PRODUCTION_SUPABASE_REF,
      endpoint: {
        connectionMode: "DIRECT",
        hostname: `db.${TARGET_REF}.supabase.co`,
        port: 5432,
        database: "postgres",
        usernameProjectRefSuffix: null,
      },
      tlsRootCertificateSha256: CA_SHA256,
      rawCredentialMaterialPresent: false,
    });
    expect(access.tlsRootCertificate).toEqual(CA_BYTES);
    access.tlsRootCertificate[0] = 0;
    expect(
      readCaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetForAdapter(
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_ADAPTER_ACCESS,
        resolution.capability,
        resolution.descriptor,
      ).tlsRootCertificate,
    ).toEqual(CA_BYTES);
  });

  it("accepts only a 5432 Supavisor session endpoint bound to the target ref", async () => {
    const harness = createHarness({
      endpoint: {
        connectionMode: "SUPAVISOR_SESSION",
        hostname: "aws-0-ap-southeast-2.pooler.supabase.com",
        port: 5432,
        database: "postgres",
        usernameProjectRefSuffix: TARGET_REF,
      },
    });
    const resolution = await harness.resolver.resolve(request(), context());

    expect(
      readCaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetForAdapter(
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_ADAPTER_ACCESS,
        resolution.capability,
        resolution.descriptor,
      ).endpoint,
    ).toEqual({
      connectionMode: "SUPAVISOR_SESSION",
      hostname: "aws-0-ap-southeast-2.pooler.supabase.com",
      port: 5432,
      database: "postgres",
      usernameProjectRefSuffix: TARGET_REF,
    });
  });

  it.each([
    ["Production target", { targetProjectRef: CARESLINK_PRODUCTION_SUPABASE_REF }],
    ["wrong parent", { parentProjectRef: "zyxwvutsrqponmlkjihg" }],
    ["default branch", { defaultBranch: true }],
    ["persistent branch", { persistent: true }],
    ["data copy", { withData: true }],
    ["wrong PG major", { postgresMajor: 16 }],
    ["unhealthy project", { projectStatus: "INACTIVE" }],
    ["stale observation", { observedAt: "2026-08-31T11:54:59.999Z" }],
    ["long expiry", { expiresAt: "2026-08-31T12:05:00.001Z" }],
  ])("rejects %s control-plane evidence", async (_name, mutation) => {
    const targetProjectRef = "targetProjectRef" in mutation
      ? mutation.targetProjectRef
      : TARGET_REF;
    const harness = createHarness({
      observation: {
        ...observation(),
        targetProjectRef,
        endpoint: {
          ...observation().endpoint,
          hostname: `db.${targetProjectRef}.supabase.co`,
        },
        ...mutation,
      },
    });

    await expect(
      harness.resolver.resolve(
        request({ targetProjectRef }),
        context(),
      ),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
  });

  it.each([
    ["direct host", { hostname: "db.attacker.example" }],
    ["direct port", { port: 6543 }],
    ["database", { database: "template1" }],
    ["direct suffix", { usernameProjectRefSuffix: TARGET_REF }],
    ["transaction pooler", {
      connectionMode: "SUPAVISOR_SESSION",
      hostname: "aws-0-ap-southeast-2.pooler.supabase.com",
      port: 6543,
      database: "postgres",
      usernameProjectRefSuffix: TARGET_REF,
    }],
    ["pooler suffix", {
      connectionMode: "SUPAVISOR_SESSION",
      hostname: "aws-0-ap-southeast-2.pooler.supabase.com",
      port: 5432,
      database: "postgres",
      usernameProjectRefSuffix: "zyxwvutsrqponmlkjihg",
    }],
  ])("rejects the %s endpoint", async (_name, mutation) => {
    const harness = createHarness({
      endpoint: { ...observation().endpoint, ...mutation },
    });
    await expect(harness.resolver.resolve(request(), context()))
      .rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
  });

  it("rejects extra keys, accessors, proxies and non-independent ports", async () => {
    expect(() => createHarness({ factoryExtra: true })).toThrowError(
      expect.objectContaining({ code: "PRODUCT_API_DISABLED" }),
    );
    expect(() => createHarness({ proxyObservationPort: true })).toThrowError(
      expect.objectContaining({ code: "PRODUCT_API_DISABLED" }),
    );
    expect(() => createHarness({ sharedPortFunction: true })).toThrowError(
      expect.objectContaining({ code: "PRODUCT_API_DISABLED" }),
    );
    const getterObservation = observation();
    Object.defineProperty(getterObservation, "projectStatus", {
      enumerable: true,
      get: () => "ACTIVE_HEALTHY",
    });
    const harness = createHarness({ observation: getterObservation });
    await expect(harness.resolver.resolve(request(), context()))
      .rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
  });

  it("requires pairwise-distinct same-key HMACs and exact pinned CA bytes", async () => {
    await expect(
      createHarness({ productionHmac: TARGET_HMAC }).resolver.resolve(
        request(),
        context(),
      ),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
    await expect(
      createHarness({ productionKeyReference: "5".repeat(64) })
        .resolver.resolve(request(), context()),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
    await expect(
      createHarness({ caBytes: new Uint8Array(64 * 1024 + 1) })
        .resolver.resolve(request({ tlsRootCertificateSha256: sha256(
          new Uint8Array(64 * 1024 + 1),
        ) }), context()),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
    await expect(
      createHarness({ caBytes: new TextEncoder().encode("wrong") })
        .resolver.resolve(request(), context()),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
  });

  it("rejects target or CA substitution across request and control-plane evidence", async () => {
    await expect(
      createHarness({
        observation: {
          ...observation(),
          tlsRootCertificateSha256: "5".repeat(64),
        },
      }).resolver.resolve(request(), context()),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
    await expect(
      createHarness({
        observation: {
          ...observation(),
          targetProjectRef: "zyxwvutsrqponmlkjihg",
          endpoint: {
            ...observation().endpoint,
            hostname: "db.zyxwvutsrqponmlkjihg.supabase.co",
          },
        },
      }).resolver.resolve(request(), context()),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
  });

  it("rechecks freshness after slow ports with a monotonic clock", async () => {
    await expect(
      createHarness({
        clockValues: [NOW, "2026-08-31T12:04:00.000Z"],
      }).resolver.resolve(request(), context()),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
    await expect(
      createHarness({
        clockValues: [NOW, "2026-08-31T11:59:59.999Z"],
      }).resolver.resolve(request(), context()),
    ).rejects.toMatchObject({ code: "PRODUCT_API_DISABLED" });
  });

  it("requires the exact symbol and a genuine sealed capability", async () => {
    const harness = createHarness();
    const resolution = await harness.resolver.resolve(request(), context());
    for (const [token, capability] of [
      [Symbol.for("approved-runtime-target"), resolution.capability],
      [CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_ADAPTER_ACCESS, {
        ...resolution.capability,
      }],
      [CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_ADAPTER_ACCESS, new Proxy(
        resolution.capability,
        {},
      )],
    ] as const) {
      expect(() =>
        readCaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetForAdapter(
          token,
          capability,
          resolution.descriptor,
        ),
      ).toThrowError(expect.objectContaining({ code: "PRODUCT_API_DISABLED" }));
    }
  });

  it("binds every capability to its same-resolution descriptor", async () => {
    const first = await createHarness().resolver.resolve(request(), context());
    const secondTargetRef = "zyxwvutsrqponmlkjihg";
    const second = await createHarness({
      targetHmac: "6".repeat(64),
      observation: {
        ...observation(),
        targetProjectRef: secondTargetRef,
        controlPlaneEvidenceSha256: "7".repeat(64),
        endpoint: {
          ...observation().endpoint,
          hostname: `db.${secondTargetRef}.supabase.co`,
        },
      },
    }).resolver.resolve(
      request({ targetProjectRef: secondTargetRef }),
      context(),
    );

    for (const [capability, descriptor] of [
      [first.capability, second.descriptor],
      [second.capability, first.descriptor],
    ] as const) {
      expect(() =>
        readCaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetForAdapter(
          CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_ADAPTER_ACCESS,
          capability,
          descriptor,
        ),
      ).toThrowError(expect.objectContaining({ code: "PRODUCT_API_DISABLED" }));
    }
  });

  it("uses the resolver clock for every read and rejects expiry or clock rollback", async () => {
    const expiryHarness = createHarness({
      clockValues: [NOW, NOW, "2026-08-31T12:04:00.000Z"],
    });
    const expired = await expiryHarness.resolver.resolve(request(), context());
    expect(() =>
      readCaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetForAdapter(
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_ADAPTER_ACCESS,
        expired.capability,
        expired.descriptor,
      ),
    ).toThrowError(expect.objectContaining({ code: "PRODUCT_API_DISABLED" }));

    const rollbackHarness = createHarness({
      clockValues: [NOW, NOW, NOW, "2026-08-31T11:59:59.999Z"],
    });
    const rollback = await rollbackHarness.resolver.resolve(
      request(),
      context(),
    );
    expect(() =>
      readCaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetForAdapter(
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_ADAPTER_ACCESS,
        rollback.capability,
        rollback.descriptor,
      ),
    ).not.toThrow();
    expect(() =>
      readCaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetForAdapter(
        CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_APPROVED_RUNTIME_TARGET_ADAPTER_ACCESS,
        rollback.capability,
        rollback.descriptor,
      ),
    ).toThrowError(expect.objectContaining({ code: "PRODUCT_API_DISABLED" }));
  });

  it("folds all hostile transport details to one fixed content-free error", async () => {
    const secret = "postgres://runtime:must-not-leak@example.test/postgres";
    const harness = createHarness({ observeError: new Error(secret) });
    const error = await harness.resolver.resolve(request(), context()).catch(
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({
      code: "PRODUCT_API_DISABLED",
      message: "Communication Note preview approved runtime target is unavailable",
    });
    expect(String(error)).not.toContain(secret);
  });
});

function createHarness(options: {
  observation?: Record<string, unknown>;
  endpoint?: Record<string, unknown>;
  caBytes?: Uint8Array;
  productionHmac?: string;
  targetHmac?: string;
  productionKeyReference?: string;
  observeError?: Error;
  factoryExtra?: boolean;
  proxyObservationPort?: boolean;
  sharedPortFunction?: boolean;
  clockValues?: readonly string[];
} = {}) {
  const observed = options.observation ?? {
    ...observation(),
    endpoint: options.endpoint ?? observation().endpoint,
  };
  const observe = vi.fn(async () => {
    if (options.observeError) throw options.observeError;
    return observed;
  });
  const hmac = vi.fn(async ({ projectRef }: { projectRef: string }) => ({
    projectRefHmac:
      projectRef === CARESLINK_PRODUCTION_SUPABASE_REF
        ? options.productionHmac ?? PRODUCTION_HMAC
        : options.targetHmac ?? TARGET_HMAC,
    keyReferenceSha256:
      projectRef === CARESLINK_PRODUCTION_SUPABASE_REF
        ? options.productionKeyReference ?? HMAC_KEY_REFERENCE
        : HMAC_KEY_REFERENCE,
    rawKeyMaterialPresent: false,
  }));
  const load = options.sharedPortFunction
    ? hmac
    : vi.fn(async () => ({
        tlsRootCertificate: options.caBytes ?? CA_BYTES,
        rawCredentialMaterialPresent: false,
      }));
  const observationPort = { observe };
  let clockIndex = 0;
  const now = vi.fn(() =>
    options.clockValues?.[
      Math.min(clockIndex++, options.clockValues.length - 1)
    ] ?? NOW,
  );
  const factoryValue: Record<string, unknown> = {
    capability: "TEST_ONLY_APPROVED_RUNTIME_TARGET_RESOLVER",
    controlPlaneObservationPort: options.proxyObservationPort
      ? new Proxy(observationPort, {})
      : observationPort,
    projectRefHmacPort: { hmac },
    pinnedCaLoader: { load },
    clock: { now },
  };
  if (options.factoryExtra) factoryValue.extra = true;
  return {
    resolver:
      createTestOnlyCaresLinkV1CommunicationNotePreviewApprovedRuntimeTargetResolver(
        factoryValue,
      ),
    observe,
    hmac,
    load,
  };
}

function request(mutation: Record<string, unknown> = {}) {
  return {
    targetProjectRef: TARGET_REF,
    tlsRootCertificateSha256: CA_SHA256,
    ...mutation,
  };
}

function context() {
  return { signal: new AbortController().signal };
}

function observation() {
  return {
    source: "SUPABASE_CONTROL_PLANE",
    targetProjectRef: TARGET_REF,
    parentProjectRef: CARESLINK_PRODUCTION_SUPABASE_REF,
    defaultBranch: false,
    persistent: false,
    withData: false,
    postgresMajor: 17,
    projectStatus: "ACTIVE_HEALTHY",
    observedAt: "2026-08-31T11:58:00.000Z",
    expiresAt: "2026-08-31T12:04:00.000Z",
    controlPlaneEvidenceSha256: CONTROL_PLANE_EVIDENCE,
    tlsRootCertificateSha256: CA_SHA256,
    endpoint: {
      connectionMode: "DIRECT",
      hostname: `db.${TARGET_REF}.supabase.co`,
      port: 5432,
      database: "postgres",
      usernameProjectRefSuffix: null,
    },
    rawCredentialMaterialPresent: false,
  };
}

function sha256(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}
