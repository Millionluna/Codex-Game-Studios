import { describe, expect, it } from "vitest";
import {
  createMemoryNdisCaseNoteCompanionStore,
  createNdisCaseNoteClaim,
  createNdisCaseNoteCompanionEvent,
  createNdisCaseNoteCompanionStoreFromEnv,
} from "./ndis-case-note-companion-store";
import { NDIS_CASE_NOTE_DISCLAIMER } from "./ndis-case-note-companion";

const material = {
  englishCaseNoteDraft: "Neutral draft wording.",
  chineseReviewVersion: "中性草稿表述。",
  missingFacts: [],
  neutralWordingChecks: ["Review the stated time."],
  followUpPrompts: [],
  disclaimer: NDIS_CASE_NOTE_DISCLAIMER,
};

describe("NDIS case note companion store", () => {
  it("fails closed when persistent storage is missing in production", () => {
    expect(() =>
      createNdisCaseNoteCompanionStoreFromEnv({
        NODE_ENV: "production",
      }),
    ).toThrow("Persistent NDIS case note companion storage");

    expect(
      createNdisCaseNoteCompanionStoreFromEnv({
        NODE_ENV: "development",
      }).kind,
    ).toBe("memory");
  });

  it("retains legacy anonymous quota-scope storage compatibility", async () => {
    const store = createMemoryNdisCaseNoteCompanionStore();
    const reservation = {
      scope: "anonymous_device" as const,
      fingerprintHash: "device-hash",
      usageDate: "2026-07-23",
      limit: 1,
    };

    await expect(store.consumeQuota(reservation)).resolves.toMatchObject({
      allowed: true,
      usageCount: 1,
    });
    await expect(store.consumeQuota(reservation)).resolves.toMatchObject({
      allowed: false,
      usageCount: 1,
    });

    await store.releaseQuota(reservation);
    await expect(store.consumeQuota(reservation)).resolves.toMatchObject({
      allowed: true,
      usageCount: 1,
    });
  });

  it("uses a short-lived bearer token and enforces a single claim owner", async () => {
    const store = createMemoryNdisCaseNoteCompanionStore();
    const claim = createNdisCaseNoteClaim({
      material,
      now: new Date("2026-07-23T00:00:00.000Z"),
      ttlMs: 30_000,
    });
    await store.saveClaim(claim.record);

    await expect(
      store.consumeClaim({
        token: claim.token,
        userId: "user-a",
        now: "2026-07-23T00:00:10.000Z",
      }),
    ).resolves.toMatchObject({ claimedByUserId: "user-a" });
    await expect(
      store.consumeClaim({
        token: claim.token,
        userId: "user-b",
        now: "2026-07-23T00:00:11.000Z",
      }),
    ).resolves.toBeUndefined();

    await store.completeClaim({ token: claim.token, userId: "user-a" });
    await expect(store.getClaim(claim.token)).resolves.toBeUndefined();
  });

  it("can bind a generated claim to the authenticated provider immediately", async () => {
    const claim = createNdisCaseNoteClaim({
      material,
      claimedByUserId: "provider-a",
      token: "a".repeat(64),
      generationMeta: {
        model: "gpt-5.4-mini",
        inputTokenCount: 120,
        outputTokenCount: 80,
      },
      now: new Date("2026-07-23T00:00:00.000Z"),
    });

    expect(claim.token).toBe("a".repeat(64));
    expect(claim.record).toMatchObject({
      claimedByUserId: "provider-a",
      claimedAt: "2026-07-23T00:00:00.000Z",
      generationMeta: {
        model: "gpt-5.4-mini",
        inputTokenCount: 120,
        outputTokenCount: 80,
      },
    });
  });

  it("does not expose an expired claim", async () => {
    const store = createMemoryNdisCaseNoteCompanionStore();
    const claim = createNdisCaseNoteClaim({
      material,
      now: new Date("2026-07-23T00:00:00.000Z"),
      ttlMs: 1_000,
    });
    await store.saveClaim(claim.record);

    await expect(
      store.getClaim(claim.token, "2026-07-23T00:00:02.000Z"),
    ).resolves.toBeUndefined();

    await store.purgeExpiredClaims("2026-07-23T00:00:02.000Z");
    await expect(
      store.getClaim(claim.token, "2026-07-23T00:00:00.500Z"),
    ).resolves.toBeUndefined();
  });

  it("stores attribution-only telemetry with no input or generated content", async () => {
    const store = createMemoryNdisCaseNoteCompanionStore();
    await store.recordEvent(
      createNdisCaseNoteCompanionEvent({
        eventName: "companion_generated",
        visitorHash: "visitor-hash",
        attribution: {
          source: "ndis-case-note-download",
          resourceSlug: "ndis-case-note-template",
          utmCampaign: "ndis_case_note_ai_companion_v01",
          locale: "en",
        },
      }),
    );

    const [event] = await store.listEvents();
    const serialized = JSON.stringify(event);
    expect(serialized).toContain("companion_generated");
    expect(serialized).not.toContain("Neutral draft wording");
    expect(serialized).not.toContain("observableFacts");
  });
});
