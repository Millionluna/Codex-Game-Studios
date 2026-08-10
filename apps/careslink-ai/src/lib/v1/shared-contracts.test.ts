import { describe, expect, it } from "vitest";
import {
  CARESLINK_V1_CONTRACT_VERSION,
  CARESLINK_V1_DOCUMENT_LIFECYCLE_STATUSES,
  CARESLINK_V1_ERROR_CODES,
  CARESLINK_V1_EXPORT_STATUSES,
  CARESLINK_V1_GENERATION_STATUSES,
  CARESLINK_V1_LOCALES,
  CARESLINK_V1_NOTE_CATALOG,
  CARESLINK_V1_RATE_CATALOG_VERSION,
  CARESLINK_V1_SELF_REVIEW_STATUSES,
  CARESLINK_V1_SHADOW_RATE_CATALOG,
  CARESLINK_V1_SYNC_STATUSES,
  CaresLinkV1ContractError,
  assertCaresLinkV1IdempotencyKey,
  canTransitionDocumentLifecycle,
  canTransitionExportStatus,
  canTransitionGenerationStatus,
  getCaresLinkV1NoteType,
  isCaresLinkV1Locale,
} from "./shared-contracts";
import { isCaresLinkV1ShadowEnabled } from "./shadow-config";

describe("CaresLink V1 shared contracts", () => {
  it("publishes an explicit shadow contract and three non-fallback locales", () => {
    expect(CARESLINK_V1_CONTRACT_VERSION).toBe("1.0.0-shadow.1");
    expect(CARESLINK_V1_LOCALES).toEqual(["en", "zh-Hans", "zh-Hant"]);
    expect(isCaresLinkV1Locale("zh-Hant")).toBe(true);
    expect(isCaresLinkV1Locale("zh-TW")).toBe(false);
    expect(isCaresLinkV1Locale("zh-Hans")).toBe(true);
  });

  it("defines exactly five versioned Note types with identifier-free fields", () => {
    expect(CARESLINK_V1_NOTE_CATALOG.map((note) => note.code)).toEqual([
      "communication",
      "handover",
      "progress",
      "ndis",
      "incident_factual",
    ]);
    expect(
      CARESLINK_V1_NOTE_CATALOG.every(
        (note) =>
          note.fields.some((field) => field.required) &&
          note.fields.every(
            (field) => field.containsParticipantIdentifier === false,
          ),
      ),
    ).toBe(true);
    expect(getCaresLinkV1NoteType("incident_factual").prohibitedDecisions).toContain(
      "reportability decision",
    );
  });

  it("matches the approved shadow rate catalog without activating it", () => {
    expect(CARESLINK_V1_RATE_CATALOG_VERSION).toBe(
      "2026-08-09.v1-shadow",
    );
    expect(
      Object.fromEntries(
        CARESLINK_V1_SHADOW_RATE_CATALOG.map((rate) => [
          rate.serviceCode,
          rate.points,
        ]),
      ),
    ).toMatchObject({
      "note.communication.generate": 20,
      "note.handover.generate": 25,
      "note.progress.generate": 35,
      "note.ndis.generate": 50,
      "note.incident_factual.generate": 60,
      "transcription.device": 0,
      "transcription.cloud": 10,
      "content.explain": 10,
      "note.rewrite.section": 10,
    });
    expect(
      CARESLINK_V1_SHADOW_RATE_CATALOG.find(
        (rate) => rate.serviceCode === "note.regenerate.full",
      ),
    ).toMatchObject({
      points: null,
      minimumPoints: 20,
      maximumPoints: 40,
      status: "SHADOW",
    });
    expect(CARESLINK_V1_SHADOW_RATE_CATALOG.every((rate) => rate.status === "SHADOW")).toBe(
      true,
    );
  });

  it("keeps lifecycle, self-review, sync and export status orthogonal", () => {
    expect(CARESLINK_V1_DOCUMENT_LIFECYCLE_STATUSES).toEqual([
      "IN_PROGRESS",
      "COMPLETED",
      "TOMBSTONED",
      "PURGED",
    ]);
    expect(CARESLINK_V1_SELF_REVIEW_STATUSES).toEqual([
      "REQUIRED",
      "CONFIRMED",
    ]);
    expect(CARESLINK_V1_SYNC_STATUSES).not.toEqual(
      expect.arrayContaining(["COMPLETED", "EXPORTED"]),
    );
    expect(CARESLINK_V1_EXPORT_STATUSES).toContain("ARTIFACT_READY");
    expect(CARESLINK_V1_DOCUMENT_LIFECYCLE_STATUSES).not.toEqual(
      expect.arrayContaining(["CONFIRMED", "EXPORTED"]),
    );
  });

  it("allows only the approved lifecycle transitions", () => {
    expect(canTransitionDocumentLifecycle("IN_PROGRESS", "COMPLETED")).toBe(
      true,
    );
    expect(canTransitionDocumentLifecycle("COMPLETED", "IN_PROGRESS")).toBe(
      true,
    );
    expect(canTransitionDocumentLifecycle("TOMBSTONED", "PURGED")).toBe(
      true,
    );
    expect(canTransitionDocumentLifecycle("PURGED", "IN_PROGRESS")).toBe(
      false,
    );
  });

  it("makes generation and export terminal states non-reversible", () => {
    expect(CARESLINK_V1_GENERATION_STATUSES).toContain("CANCELLED");
    expect(canTransitionGenerationStatus("QUEUED", "RUNNING")).toBe(true);
    expect(canTransitionGenerationStatus("RUNNING", "SUCCEEDED")).toBe(true);
    expect(canTransitionGenerationStatus("SUCCEEDED", "RUNNING")).toBe(false);
    expect(canTransitionExportStatus("REQUESTED", "RENDERING")).toBe(true);
    expect(canTransitionExportStatus("ARTIFACT_READY", "DOWNLOADED")).toBe(
      true,
    );
    expect(canTransitionExportStatus("PURGED", "ARTIFACT_READY")).toBe(false);
  });

  it("publishes the approved unified error vocabulary", () => {
    expect(CARESLINK_V1_ERROR_CODES).toEqual(
      expect.arrayContaining([
        "AUTH_REQUIRED",
        "PRIVACY_REVIEW_STALE",
        "POINTS_INSUFFICIENT",
        "POINT_QUOTE_EXPIRED",
        "STALE_REVISION",
        "GENERATION_FAILED",
        "EXPORT_EXPIRED",
        "MIN_CLIENT_VERSION",
      ]),
    );
  });

  it("accepts only bounded transport-safe idempotency keys", () => {
    expect(assertCaresLinkV1IdempotencyKey("note.generate:request-0001")).toBe(
      "note.generate:request-0001",
    );
    expect(() => assertCaresLinkV1IdempotencyKey("short")).toThrow(
      CaresLinkV1ContractError,
    );
    expect(() =>
      assertCaresLinkV1IdempotencyKey("contains private note text 中文"),
    ).toThrow(CaresLinkV1ContractError);
  });

  it("keeps the V1 runtime path off unless the exact server flag is true", () => {
    expect(isCaresLinkV1ShadowEnabled({})).toBe(false);
    expect(
      isCaresLinkV1ShadowEnabled({ CARESLINK_V1_SHADOW_ENABLED: "TRUE" }),
    ).toBe(false);
    expect(
      isCaresLinkV1ShadowEnabled({ CARESLINK_V1_SHADOW_ENABLED: "true" }),
    ).toBe(true);
  });
});
