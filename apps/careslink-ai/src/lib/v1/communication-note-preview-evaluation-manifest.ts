import "server-only";

import { createHash } from "node:crypto";

import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import { CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES } from "./communication-note-golden";
import { CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_TEMPLATE_DIGEST } from "./communication-note-openai-request-template";
import { CaresLinkV1ContractError } from "./shared-contracts";

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST_VERSION =
  "manifest.communication.openai.synthetic-preview.2026-08-27.v1" as const;

export const CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURE_SET_DIGEST_PIN =
  "432cfda8c51e76ec517a4c4d39769c3c3a67d7a273ebe3b1662d3e4826449e17" as const;

const MANIFEST_CORE = deepFreeze({
  version: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST_VERSION,
  goldenFixtureSetDigest:
    CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURE_SET_DIGEST_PIN,
  requestTemplateDigest:
    CARESLINK_V1_COMMUNICATION_NOTE_OPENAI_REQUEST_TEMPLATE_DIGEST,
  runsPerFixture: 2,
  slots: [
    {
      fixtureId: "communication.en.phone-duration.v1",
      runOrdinal: 1,
    },
    {
      fixtureId: "communication.en.phone-duration.v1",
      runOrdinal: 2,
    },
    {
      fixtureId: "communication.zh-hans.mixed-video.v1",
      runOrdinal: 1,
    },
    {
      fixtureId: "communication.zh-hans.mixed-video.v1",
      runOrdinal: 2,
    },
    {
      fixtureId: "communication.zh-hant.in-person.v1",
      runOrdinal: 1,
    },
    {
      fixtureId: "communication.zh-hant.in-person.v1",
      runOrdinal: 2,
    },
  ],
} as const);

export type CaresLinkV1CommunicationNotePreviewManifest =
  typeof MANIFEST_CORE & Readonly<{ manifestDigest: string }>;

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST_DIGEST =
  "aab4e65bec64ea2c3dc7da91f3544e91aee3163dc7cab9187765c1eff9581be9" as const;

const computedManifestDigest = createManifestDigest(MANIFEST_CORE);
if (
  computedManifestDigest !==
  CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST_DIGEST
) {
  throw invalid(
    "Communication Note evaluation manifest changed without a reviewed digest pin",
  );
}

assertManifestFixtureCoverage();

export const CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST = deepFreeze({
  ...MANIFEST_CORE,
  manifestDigest: CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST_DIGEST,
}) satisfies CaresLinkV1CommunicationNotePreviewManifest;

export function validateCaresLinkV1CommunicationNotePreviewManifest(
  value: unknown,
): CaresLinkV1CommunicationNotePreviewManifest {
  let actual: string;
  let expected: string;
  try {
    actual = stringifyCaresLinkV1CanonicalJson(value);
    expected = stringifyCaresLinkV1CanonicalJson(
      CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST,
    );
  } catch {
    throw invalid("Communication Note evaluation manifest is invalid");
  }
  if (actual !== expected) {
    throw invalid("Communication Note evaluation manifest does not match M1f");
  }
  return CARESLINK_V1_COMMUNICATION_NOTE_PREVIEW_MANIFEST;
}

export function createCaresLinkV1CommunicationNotePreviewManifestDigest(
  value: unknown,
) {
  return createManifestDigest(value);
}

function assertManifestFixtureCoverage() {
  const fixtureIds = CARESLINK_V1_COMMUNICATION_NOTE_GOLDEN_FIXTURES.map(
    ({ id }) => id,
  );
  const manifestFixtureIds = MANIFEST_CORE.slots
    .filter(({ runOrdinal }) => runOrdinal === 1)
    .map(({ fixtureId }) => fixtureId);
  if (
    fixtureIds.length !== manifestFixtureIds.length ||
    fixtureIds.some((fixtureId, index) => fixtureId !== manifestFixtureIds[index]) ||
    MANIFEST_CORE.slots.length !== fixtureIds.length * MANIFEST_CORE.runsPerFixture
  ) {
    throw invalid("Communication Note evaluation manifest fixture coverage drifted");
  }
}

function createManifestDigest(value: unknown) {
  let canonical: string;
  try {
    canonical = stringifyCaresLinkV1CanonicalJson(value);
  } catch {
    throw invalid("Communication Note evaluation manifest is not canonical JSON");
  }
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function deepFreeze<const T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function invalid(message: string) {
  return new CaresLinkV1ContractError("VALIDATION_ERROR", message);
}
