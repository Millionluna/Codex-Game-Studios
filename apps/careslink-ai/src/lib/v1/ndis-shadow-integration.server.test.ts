import { describe, expect, it, vi } from "vitest";
import type { GeneratedMaterialDraftRecord } from "../generated-material-draft-store";
import { NDIS_CASE_NOTE_DISCLAIMER } from "../ndis-case-note-companion";
import {
  createNdisShadowIdempotencyKey,
  mirrorSavedNdisDraftToCanonicalShadow,
  tombstoneDeletedNdisShadowFromCanonical,
} from "./ndis-shadow-integration.server";
import type { NdisShadowRepository } from "./ndis-shadow-repository.server";

vi.mock("server-only", () => ({}));

const owner = "11111111-1111-4111-8111-111111111111";
const hash = "a".repeat(64);
const privacyFingerprint = "b".repeat(64);

function previewEnv(read = true) {
  return {
    VERCEL_ENV: "preview",
    CARESLINK_V1_SHADOW_ENABLED: "true",
    CARESLINK_V1_NDIS_DUAL_WRITE_ENABLED: "true",
    CARESLINK_V1_NDIS_SHADOW_READ_ENABLED: read ? "true" : "false",
    CARESLINK_V1_SHADOW_EXPECTED_SUPABASE_REF: "previewbranchref12345",
    SUPABASE_URL: "https://previewbranchref12345.supabase.co",
    CARESLINK_V1_NDIS_SHADOW_TIMEOUT_MS: "250",
  };
}

function draft(content = "The participant requested a seated break.") {
  return {
    id: "ndis-case-note-source-0001",
    userId: owner,
    feature: "ndis_case_note",
    status: "draft",
    content: {
      englishCaseNoteDraft: content,
      chineseReviewVersion: "Synthetic Chinese review.",
      missingFacts: [],
      neutralWordingChecks: [],
      followUpPrompts: [],
      disclaimer: NDIS_CASE_NOTE_DISCLAIMER,
    },
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:05:00.000Z",
  } satisfies GeneratedMaterialDraftRecord;
}

function repository(overrides: Partial<NdisShadowRepository> = {}) {
  return {
    kind: "supabase-shadow",
    project: vi.fn().mockResolvedValue({
      status: "PROJECTED",
      documentId: "22222222-2222-4222-8222-222222222222",
      revisionId: "33333333-3333-4333-8333-333333333333",
      revisionNumber: 1,
      sourceContentHash: hash,
    }),
    compare: vi.fn().mockResolvedValue({
      status: "MATCH",
      expectedContentHash: hash,
      actualContentHash: hash,
    }),
    tombstoneDeleted: vi.fn().mockResolvedValue({
      status: "TOMBSTONED",
      tombstonedCount: 1,
    }),
    listReconciliation: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as NdisShadowRepository;
}

function logger() {
  return { info: vi.fn(), warn: vi.fn() };
}

function mutationKey({
  contentHash = hash,
  sourceCreatedAt = "2026-08-09T00:00:00.000Z",
  sourceStatus = "draft",
  sourceUpdatedAt = "2026-08-09T00:05:00.000Z",
}: {
  contentHash?: string;
  sourceCreatedAt?: string;
  sourceStatus?: GeneratedMaterialDraftRecord["status"];
  sourceUpdatedAt?: string;
} = {}) {
  return createNdisShadowIdempotencyKey({
    ownerUserId: owner,
    sourceDraftId: draft().id,
    sourceCreatedAt,
    sourceStatus,
    sourceUpdatedAt,
    contentHash,
  });
}

describe("NDIS legacy-to-canonical shadow integration", () => {
  it("does nothing when the Preview guard is off", async () => {
    const store = repository();
    const audit = logger();

    await expect(
      mirrorSavedNdisDraftToCanonicalShadow({
        legacyDraft: draft(),
        privacyFingerprint,
        env: { ...previewEnv(), VERCEL_ENV: "production" },
        repository: store,
        logger: audit,
        correlationId: "44444444-4444-4444-8444-444444444444",
      }),
    ).resolves.toMatchObject({
      enabled: false,
      guardReason: "production_environment",
    });
    expect(store.project).not.toHaveBeenCalled();
    expect(audit.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "ndis_shadow_write",
        status: "DISABLED",
        failureCode: "GUARD_PRODUCTION_ENVIRONMENT",
      }),
    );
    const logs = JSON.stringify(audit.info.mock.calls);
    expect(logs).not.toContain("ndis-case-note-source-0001");
    expect(logs).not.toContain(owner);
  });

  it("projects after legacy save and compares hashes without returning canonical content", async () => {
    const store = repository();
    const result = await mirrorSavedNdisDraftToCanonicalShadow({
      legacyDraft: draft(),
      privacyFingerprint,
      env: previewEnv(),
      repository: store,
      logger: logger(),
      correlationId: "44444444-4444-4444-8444-444444444444",
    });

    expect(result).toEqual({
      enabled: true,
      guardReason: "enabled",
      correlationId: "44444444-4444-4444-8444-444444444444",
      writeStatus: "PROJECTED",
      readStatus: "MATCH",
    });
    expect(JSON.stringify(result)).not.toContain("seated break");
    expect(store.project).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: owner,
        sourceDraftId: "ndis-case-note-source-0001",
        privacyFingerprint,
        idempotencyKey: expect.stringMatching(/^ndis\.shadow\.[a-f0-9]{64}$/),
      }),
    );
  });

  it("uses the same mutation key only for the exact same source snapshot", () => {
    const first = mutationKey();
    const replay = mutationKey();
    const edit = mutationKey({ contentHash: "c".repeat(64) });

    expect(replay).toBe(first);
    expect(edit).not.toBe(first);
  });

  it("assigns distinct identities to an A-to-B-to-A content sequence", () => {
    const firstA = mutationKey({
      sourceUpdatedAt: "2026-08-09T00:05:00.000Z",
    });
    const editB = mutationKey({
      contentHash: "c".repeat(64),
      sourceUpdatedAt: "2026-08-09T00:06:00.000Z",
    });
    const restoredA = mutationKey({
      sourceUpdatedAt: "2026-08-09T00:07:00.000Z",
    });

    expect(new Set([firstA, editB, restoredA]).size).toBe(3);
  });

  it("changes identity for a new generation, status or update time", () => {
    const draftSnapshot = mutationKey();
    const newGeneration = mutationKey({
      sourceCreatedAt: "2026-08-10T00:00:00.000Z",
    });
    const reviewedSnapshot = mutationKey({ sourceStatus: "reviewed" });
    const laterDraftSnapshot = mutationKey({
      sourceUpdatedAt: "2026-08-09T00:08:00.000Z",
    });

    expect(newGeneration).not.toBe(draftSnapshot);
    expect(reviewedSnapshot).not.toBe(draftSnapshot);
    expect(laterDraftSnapshot).not.toBe(draftSnapshot);
  });

  it("does not run shadow-read when it is disabled", async () => {
    const store = repository();

    await expect(
      mirrorSavedNdisDraftToCanonicalShadow({
        legacyDraft: draft(),
        privacyFingerprint,
        env: previewEnv(false),
        repository: store,
        logger: logger(),
      }),
    ).resolves.toMatchObject({
      writeStatus: "PROJECTED",
      readStatus: "DISABLED",
    });
    expect(store.compare).not.toHaveBeenCalled();
  });

  it.each(["MISMATCH", "MISSING", "ERROR"] as const)(
    "records %s without changing the legacy result",
    async (status) => {
      const audit = logger();
      const store = repository({
        compare: vi.fn().mockResolvedValue({
          status,
          expectedContentHash: hash,
          failureCode: status === "ERROR" ? "SHADOW_READ_FAILED" : undefined,
        }),
      });

      await expect(
        mirrorSavedNdisDraftToCanonicalShadow({
          legacyDraft: draft(),
          privacyFingerprint,
          env: previewEnv(),
          repository: store,
          logger: audit,
        }),
      ).resolves.toMatchObject({ readStatus: status });
      expect(audit.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: "ndis_shadow_read", status }),
      );
    },
  );

  it("captures repository failure as metadata-only evidence and never throws", async () => {
    const audit = logger();
    const store = repository({
      project: vi.fn().mockRejectedValue(new Error("private database detail")),
    });

    const result = await mirrorSavedNdisDraftToCanonicalShadow({
      legacyDraft: draft(),
      privacyFingerprint,
      env: previewEnv(),
      repository: store,
      logger: audit,
    });

    expect(result).toMatchObject({
      writeStatus: "ERROR",
      readStatus: "MISSING",
    });
    const logs = JSON.stringify(audit.warn.mock.calls);
    expect(logs).toContain("SHADOW_WRITE_ERROR");
    expect(logs).not.toContain("private database detail");
    expect(logs).not.toContain("seated break");
    expect(logs).not.toContain(owner);
  });

  it("captures projection failure as metadata-only evidence and never calls the repository", async () => {
    const audit = logger();
    const store = repository();
    const invalidDraft: GeneratedMaterialDraftRecord = {
      ...draft(),
      content: {
        ...(draft().content as Record<string, unknown>),
        neutralWordingChecks: ["Review the diagnosis statement."],
      },
    };

    const result = await mirrorSavedNdisDraftToCanonicalShadow({
      legacyDraft: invalidDraft,
      privacyFingerprint,
      env: previewEnv(),
      repository: store,
      logger: audit,
      correlationId: "44444444-4444-4444-8444-444444444444",
    });

    expect(result).toEqual({
      enabled: true,
      guardReason: "enabled",
      correlationId: "44444444-4444-4444-8444-444444444444",
      writeStatus: "ERROR",
      readStatus: "MISSING",
    });
    expect(store.project).not.toHaveBeenCalled();
    expect(store.compare).not.toHaveBeenCalled();
    expect(audit.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "ndis_shadow_write",
        status: "ERROR",
        failureCode: "PROJECTION_ERROR",
      }),
    );
    const logs = JSON.stringify(audit.warn.mock.calls);
    expect(logs).not.toContain("diagnosis");
    expect(logs).not.toContain("ndis-case-note-source-0001");
    expect(logs).not.toContain(owner);
  });

  it("emits a searchable content-free default log for projection failures", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let serialized = "";
    const invalidDraft: GeneratedMaterialDraftRecord = {
      ...draft(),
      content: {
        ...(draft().content as Record<string, unknown>),
        neutralWordingChecks: ["Review the diagnosis statement."],
      },
    };

    try {
      await expect(
        mirrorSavedNdisDraftToCanonicalShadow({
          legacyDraft: invalidDraft,
          privacyFingerprint,
          env: previewEnv(),
          repository: repository(),
          correlationId: "44444444-4444-4444-8444-444444444444",
        }),
      ).resolves.toMatchObject({
        writeStatus: "ERROR",
        readStatus: "MISSING",
      });
      serialized = String(warn.mock.calls[0]?.[0]);
    } finally {
      warn.mockRestore();
    }

    expect(serialized).toContain('"component":"careslink_ndis_shadow"');
    expect(serialized).toContain('"failureCode":"PROJECTION_ERROR"');
    expect(serialized).not.toContain("diagnosis");
    expect(serialized).not.toContain("ndis-case-note-source-0001");
    expect(serialized).not.toContain(owner);
  });

  it("times out without throwing or attempting a shadow-read", async () => {
    const store = repository({
      project: vi.fn().mockImplementation(() => new Promise(() => undefined)),
    });

    await expect(
      mirrorSavedNdisDraftToCanonicalShadow({
        legacyDraft: draft(),
        privacyFingerprint,
        env: previewEnv(),
        repository: store,
        logger: logger(),
      }),
    ).resolves.toMatchObject({
      writeStatus: "TIMEOUT",
      readStatus: "MISSING",
    });
    expect(store.compare).not.toHaveBeenCalled();
  });
});

describe("deleted NDIS shadow tombstone integration", () => {
  const sourceDraftId = "ndis-case-note-private-source-0001";
  const sourceCreatedAt = "2026-08-09T00:00:00.000Z";
  const correlationId = "55555555-5555-4555-8555-555555555555";
  const privateSourceWording =
    "The participant attended a private support appointment.";

  it("tombstones the owner-bound shadow through the guarded repository", async () => {
    const store = repository();

    const result = await tombstoneDeletedNdisShadowFromCanonical({
      ownerUserId: owner,
      sourceDraftId,
      sourceCreatedAt,
      env: previewEnv(),
      repository: store,
      logger: logger(),
      correlationId,
    });

    expect(result).toEqual({
      enabled: true,
      guardReason: "enabled",
      correlationId,
      tombstoneStatus: "TOMBSTONED",
      tombstonedCount: 1,
    });
    expect(store.tombstoneDeleted).toHaveBeenCalledWith({
      ownerUserId: owner,
      sourceDraftId,
      sourceCreatedAt,
      correlationId,
    });
    expect(JSON.stringify(result)).not.toContain(owner);
    expect(JSON.stringify(result)).not.toContain(sourceDraftId);
  });

  it("returns metadata-only error evidence when tombstoning fails", async () => {
    const audit = logger();
    const store = repository({
      tombstoneDeleted: vi
        .fn()
        .mockRejectedValue(
          new Error(`private tombstone failure: ${privateSourceWording}`),
        ),
    });

    const result = await tombstoneDeletedNdisShadowFromCanonical({
      ownerUserId: owner,
      sourceDraftId,
      sourceCreatedAt,
      env: previewEnv(),
      repository: store,
      logger: audit,
      correlationId,
    });

    expect(result).toMatchObject({
      enabled: true,
      guardReason: "enabled",
      correlationId,
      tombstoneStatus: "ERROR",
    });
    const logs = JSON.stringify(audit.warn.mock.calls);
    expect(logs).toContain("SHADOW_TOMBSTONE_ERROR");
    expect(logs).not.toContain(owner);
    expect(logs).not.toContain(sourceDraftId);
    expect(logs).not.toContain(privateSourceWording);
  });

  it("does nothing when the Preview guard is off", async () => {
    const audit = logger();
    const store = repository();

    const result = await tombstoneDeletedNdisShadowFromCanonical({
      ownerUserId: owner,
      sourceDraftId,
      sourceCreatedAt,
      env: { ...previewEnv(), VERCEL_ENV: "production" },
      repository: store,
      logger: audit,
      correlationId,
    });

    expect(result).toMatchObject({
      enabled: false,
      guardReason: "production_environment",
      correlationId,
    });
    expect(result).not.toHaveProperty("tombstoneStatus");
    expect(store.tombstoneDeleted).not.toHaveBeenCalled();
    expect(audit.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "ndis_shadow_tombstone",
        status: "DISABLED",
        failureCode: "GUARD_PRODUCTION_ENVIRONMENT",
      }),
    );
    const logs = JSON.stringify(audit.info.mock.calls);
    expect(logs).not.toContain(owner);
    expect(logs).not.toContain(sourceDraftId);
  });

  it("emits a searchable default log without owner, source ID or source wording", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let serialized = "";

    try {
      await expect(
        tombstoneDeletedNdisShadowFromCanonical({
          ownerUserId: owner,
          sourceDraftId,
          sourceCreatedAt,
          env: previewEnv(),
          repository: repository({
            tombstoneDeleted: vi
              .fn()
              .mockRejectedValue(
                new Error(`private failure: ${privateSourceWording}`),
              ),
          }),
          correlationId,
        }),
      ).resolves.toMatchObject({ tombstoneStatus: "ERROR" });
      serialized = String(warn.mock.calls[0]?.[0]);
    } finally {
      warn.mockRestore();
    }

    expect(serialized).toContain('"component":"careslink_ndis_shadow"');
    expect(serialized).toContain('"event":"ndis_shadow_tombstone"');
    expect(serialized).toContain('"failureCode":"SHADOW_TOMBSTONE_ERROR"');
    expect(serialized).not.toContain(owner);
    expect(serialized).not.toContain(sourceDraftId);
    expect(serialized).not.toContain(privateSourceWording);
  });

  it("times out without throwing", async () => {
    const store = repository({
      tombstoneDeleted: vi
        .fn()
        .mockImplementation(() => new Promise(() => undefined)),
    });

    await expect(
      tombstoneDeletedNdisShadowFromCanonical({
        ownerUserId: owner,
        sourceDraftId,
        sourceCreatedAt,
        env: previewEnv(),
        repository: store,
        logger: logger(),
        correlationId,
      }),
    ).resolves.toMatchObject({
      enabled: true,
      tombstoneStatus: "TIMEOUT",
    });
  });
});
