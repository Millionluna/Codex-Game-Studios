import { describe, expect, it, vi } from "vitest";
import {
  NDIS_SHADOW_RPC,
  createNdisShadowRepository,
  createNdisShadowRepositoryFromEnv,
} from "./ndis-shadow-repository.server";

vi.mock("server-only", () => ({}));

const hash = "a".repeat(64);

describe("NDIS shadow Supabase repository", () => {
  it("fails closed without persistent server-only configuration", () => {
    expect(() => createNdisShadowRepositoryFromEnv({})).toThrow(
      "Persistent NDIS shadow storage is not configured",
    );
  });

  it("maps projection inputs to the service-role RPC without logging content", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        status: "PROJECTED",
        documentId: "11111111-1111-4111-8111-111111111111",
        revisionId: "22222222-2222-4222-8222-222222222222",
        revisionNumber: 1,
        sourceContentHash: hash,
      },
      error: null,
    });
    const store = createNdisShadowRepository({ rpc });
    const content = {
      englishDraft: "Synthetic observable facts.",
      reviewVersions: { "zh-Hans": "Synthetic review." },
      factsSummary: {},
      missingFacts: [],
      neutralWordingChecks: [],
      followUpPrompts: [],
      disclaimer: "Draft for review.",
    };

    await expect(
      store.project({
        ownerUserId: "33333333-3333-4333-8333-333333333333",
        sourceDraftId: "ndis-case-note-source",
        sourceStatus: "draft",
        sourceCreatedAt: "2026-08-09T00:00:00.000Z",
        sourceUpdatedAt: "2026-08-09T00:00:00.000Z",
        sourceContentHash: hash,
        privacyFingerprint: "b".repeat(64),
        idempotencyKey: "ndis.shadow.project.000000000001",
        correlationId: "44444444-4444-4444-8444-444444444444",
        content,
      }),
    ).resolves.toMatchObject({ status: "PROJECTED", revisionNumber: 1 });

    expect(rpc).toHaveBeenCalledWith(
      NDIS_SHADOW_RPC.project,
      expect.objectContaining({
        p_source_draft_id: "ndis-case-note-source",
        p_content: content,
      }),
    );
  });

  it("rejects malformed RPC output and never falls back to memory", async () => {
    const store = createNdisShadowRepository({
      rpc: vi.fn().mockResolvedValue({ data: { status: "PROJECTED" }, error: null }),
    });

    await expect(
      store.compare({
        ownerUserId: "33333333-3333-4333-8333-333333333333",
        sourceDraftId: "ndis-case-note-source",
        expectedContentHash: hash,
        correlationId: "44444444-4444-4444-8444-444444444444",
      }),
    ).rejects.toThrow("comparison response is invalid");
  });

  it.each([
    ["TOMBSTONED", 1],
    ["TOMBSTONED", 0],
    ["MISSING", 0],
  ] as const)(
    "maps a metadata-only %s tombstone result",
    async (status, tombstonedCount) => {
      const rpc = vi.fn().mockResolvedValue({
        data: { status, tombstonedCount },
        error: null,
      });
      const store = createNdisShadowRepository({ rpc });

      await expect(
        store.tombstoneDeleted({
          ownerUserId: "33333333-3333-4333-8333-333333333333",
          sourceDraftId: "ndis-case-note-source",
          sourceCreatedAt: "2026-08-09T00:00:00.000Z",
          correlationId: "44444444-4444-4444-8444-444444444444",
        }),
      ).resolves.toEqual({ status, tombstonedCount });
      expect(rpc).toHaveBeenCalledWith(NDIS_SHADOW_RPC.tombstone, {
        p_owner_user_id: "33333333-3333-4333-8333-333333333333",
        p_source_draft_id: "ndis-case-note-source",
        p_source_created_at: "2026-08-09T00:00:00.000Z",
        p_correlation_id: "44444444-4444-4444-8444-444444444444",
      });
    },
  );

  it.each([
    { status: "PURGED", tombstonedCount: 1 },
    { status: "TOMBSTONED", tombstonedCount: 2 },
    { status: "MISSING", tombstonedCount: 1 },
    { status: "MISSING", tombstonedCount: -1 },
    { status: "MISSING", tombstonedCount: 0.5 },
  ])("rejects malformed tombstone output %#", async (data) => {
    const store = createNdisShadowRepository({
      rpc: vi.fn().mockResolvedValue({ data, error: null }),
    });

    await expect(
      store.tombstoneDeleted({
        ownerUserId: "33333333-3333-4333-8333-333333333333",
        sourceDraftId: "ndis-case-note-source",
        sourceCreatedAt: "2026-08-09T00:00:00.000Z",
        correlationId: "44444444-4444-4444-8444-444444444444",
      }),
    ).rejects.toThrow("tombstone response is invalid");
  });

  it("returns metadata-only reconciliation rows", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          ownerUserId: "33333333-3333-4333-8333-333333333333",
          sourceDraftId: "ndis-case-note-source",
          sourceUpdatedAt: "2026-08-09T00:00:00.000Z",
          status: "MISSING",
          outboxStatus: "FAILED",
          failureCode: "SHADOW_WRITE_FAILED",
        },
      ],
      error: null,
    });
    const records = await createNdisShadowRepository({ rpc }).listReconciliation();

    expect(records).toHaveLength(1);
    expect(JSON.stringify(records)).not.toMatch(/englishDraft|participant|content/i);
  });
});
