import { describe, expect, it, vi } from "vitest";

import {
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST,
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST_DIGEST,
  createCaresLinkV1CommunicationNotePreviewManifestDigest,
  validateCaresLinkV1CommunicationNotePreviewManifest,
} from "./communication-note-preview-evaluation-manifest";

vi.mock("server-only", () => ({}));

describe("Communication Note M1f evaluation manifest", () => {
  it("literal-pins exactly three fixtures with ordinals one and two", () => {
    const manifest = CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST;
    expect(manifest.manifestDigest).toBe(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST_DIGEST,
    );
    expect(manifest.manifestDigest).toBe(
      "aab4e65bec64ea2c3dc7da91f3544e91aee3163dc7cab9187765c1eff9581be9",
    );
    expect(manifest.slots).toHaveLength(6);
    expect(
      manifest.slots.map(({ fixtureId, runOrdinal }) =>
        `${fixtureId}#${runOrdinal}`,
      ),
    ).toEqual([
      "communication.en.phone-duration.v1#1",
      "communication.en.phone-duration.v1#2",
      "communication.zh-hans.mixed-video.v1#1",
      "communication.zh-hans.mixed-video.v1#2",
      "communication.zh-hant.in-person.v1#1",
      "communication.zh-hant.in-person.v1#2",
    ]);
    expectDeepFrozen(manifest);
  });

  it("hashes the complete core and rejects missing, duplicate or unknown slots", () => {
    const exact = clone(CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST);
    expect(validateCaresLinkV1CommunicationNotePreviewManifest(exact)).toBe(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST,
    );
    const { manifestDigest, ...core } = exact;
    expect(
      createCaresLinkV1CommunicationNotePreviewManifestDigest(core),
    ).toBe(manifestDigest);

    for (const changed of [
      mutate((value) => {
        value.slots.pop();
      }),
      mutate((value) => {
        value.slots[1] = { ...value.slots[0] };
      }),
      mutate((value) => {
        value.slots[0].fixtureId = "communication.unknown.v1";
      }),
      mutate((value) => {
        value.slots[0].runOrdinal = 0;
      }),
      mutate((value) => {
        value.requestTemplateDigest = "0".repeat(64);
      }),
      mutate((value) => {
        value.manifestDigest = "0".repeat(64);
      }),
    ]) {
      expect(() =>
        validateCaresLinkV1CommunicationNotePreviewManifest(changed),
      ).toThrow("Communication Note evaluation manifest does not match M1f");
    }
  });
});

type MutableManifest = {
  manifestDigest: string;
  requestTemplateDigest: string;
  slots: Array<{ fixtureId: string; runOrdinal: number }>;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mutate(update: (value: MutableManifest) => void) {
  const value = clone(
    CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST,
  ) as unknown as MutableManifest;
  update(value);
  return value;
}

function expectDeepFrozen(value: unknown): void {
  if (!value || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeepFrozen(child);
}
