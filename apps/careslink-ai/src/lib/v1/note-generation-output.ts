import { createHash } from "node:crypto";
import {
  parseNdisCaseNoteMaterial,
  type NdisCaseNoteMaterial,
} from "../ndis-case-note-companion";
import { stringifyCaresLinkV1CanonicalJson } from "./canonical-json";
import { scanCaresLinkV1CleanedFacts } from "./privacy-review-scanner.server";
import {
  CaresLinkV1ContractError,
  getCaresLinkV1NoteType,
  validateCaresLinkV1CleanedFacts,
  type CaresLinkV1CleanedFactsByNoteType,
  type CaresLinkV1NoteContent,
  type CaresLinkV1NoteTypeCode,
  type CaresLinkV1ReviewVersions,
} from "./shared-contracts";

/**
 * Server-owned wording shared by all five V1 Note types. Providers cannot
 * supply or override this value.
 */
export const CARESLINK_V1_NOTE_DRAFT_DISCLAIMER =
  "User-reviewed draft wording based only on the details entered. It is not a completed record or clinical, legal, compliance, regulatory, care, or professional advice. General documentation support only." as const;

/**
 * The only shape a Note generation provider may return. Cleaned facts and the
 * disclaimer are deliberately absent because both are server-owned inputs to
 * the canonical revision.
 */
export type CaresLinkV1NoteProviderCandidate = {
  englishDraft: string;
  reviewVersions: CaresLinkV1ReviewVersions;
  missingFacts: string[];
  neutralWordingChecks: string[];
  followUpPrompts: string[];
};

type CaresLinkV1CanonicalNoteOutput<T extends CaresLinkV1NoteTypeCode> = {
  content: CaresLinkV1NoteContent<CaresLinkV1CleanedFactsByNoteType[T]>;
  contentHash: string;
};

const PROVIDER_CANDIDATE_KEYS = [
  "englishDraft",
  "reviewVersions",
  "missingFacts",
  "neutralWordingChecks",
  "followUpPrompts",
] as const;

const REVIEW_LOCALES = ["zh-Hans", "zh-Hant"] as const;

const NOTE_CONTENT_BOUNDS = {
  draftLength: 100_000,
  reviewLength: 100_000,
  listItems: 256,
  listItemLength: 2_000,
} as const;

// The privacy scanner enforces a 64 KiB canonical-payload limit. Scan bounded
// windows so an otherwise contract-valid 100,000-character generated field is
// checked without weakening that scanner's cleaned-facts upload limit.
const OUTPUT_SCAN_WINDOW_LENGTH = 8_000;
const OUTPUT_SCAN_WINDOW_OVERLAP = 512;

/**
 * Validates the exact provider boundary frozen by NoteContent in the V1
 * OpenAPI contract. Messages are metadata-only and never echo provider text.
 */
export function validateCaresLinkV1NoteProviderCandidate(
  value: unknown,
): CaresLinkV1NoteProviderCandidate {
  if (!isPlainObject(value)) {
    throw invalidProviderCandidate("Provider candidate must be an object");
  }
  assertExactKeys(value, PROVIDER_CANDIDATE_KEYS, "Provider candidate");

  if (!isPlainObject(value.reviewVersions)) {
    throw invalidProviderCandidate("reviewVersions must be an object");
  }
  assertAllowedKeys(value.reviewVersions, REVIEW_LOCALES, "reviewVersions");

  const reviewVersions: CaresLinkV1ReviewVersions = {};
  for (const locale of REVIEW_LOCALES) {
    if (Object.hasOwn(value.reviewVersions, locale)) {
      reviewVersions[locale] = validateBoundedString(
        value.reviewVersions[locale],
        `reviewVersions.${locale}`,
        NOTE_CONTENT_BOUNDS.reviewLength,
      );
    }
  }

  return {
    englishDraft: validateBoundedString(
      value.englishDraft,
      "englishDraft",
      NOTE_CONTENT_BOUNDS.draftLength,
    ),
    reviewVersions,
    missingFacts: validateBoundedStringArray(
      value.missingFacts,
      "missingFacts",
    ),
    neutralWordingChecks: validateBoundedStringArray(
      value.neutralWordingChecks,
      "neutralWordingChecks",
    ),
    followUpPrompts: validateBoundedStringArray(
      value.followUpPrompts,
      "followUpPrompts",
    ),
  };
}

/**
 * Builds the exact content that may be persisted as a canonical revision. The
 * server re-validates the cleaned facts for the adjacent Note type, injects
 * the shared disclaimer, then hashes UTF-8 canonical JSON.
 */
export function buildCaresLinkV1CanonicalNoteContent<
  T extends CaresLinkV1NoteTypeCode,
>(
  noteType: T,
  cleanedFacts: unknown,
  providerCandidate: unknown,
): CaresLinkV1CanonicalNoteOutput<T> {
  const candidate = validateCaresLinkV1NoteProviderCandidate(providerCandidate);
  assertProviderCandidateSafeForNoteType(noteType, candidate);
  const content: CaresLinkV1NoteContent<
    CaresLinkV1CleanedFactsByNoteType[T]
  > = {
    ...candidate,
    factsSummary: validateCaresLinkV1CleanedFacts(noteType, cleanedFacts),
    disclaimer: CARESLINK_V1_NOTE_DRAFT_DISCLAIMER,
  };

  return {
    content,
    contentHash: createHash("sha256")
      .update(stringifyCaresLinkV1CanonicalJson(content), "utf8")
      .digest("hex"),
  };
}

/**
 * Pure compatibility projection for legacy NDIS material. It re-runs the
 * legacy parser because a structural TypeScript type is not runtime proof of
 * validation, and carries no legacy setting, facts summary, disclaimer, model
 * or runtime authority into the shared V1 generation boundary.
 */
export function adaptLegacyNdisMaterialToProviderCandidate(
  material: NdisCaseNoteMaterial,
): CaresLinkV1NoteProviderCandidate {
  let validatedMaterial: NdisCaseNoteMaterial;
  try {
    validatedMaterial = parseNdisCaseNoteMaterial(JSON.stringify(material));
  } catch {
    throw unsafeProviderCandidate();
  }

  return validateCaresLinkV1NoteProviderCandidate({
    englishDraft: validatedMaterial.englishCaseNoteDraft,
    reviewVersions: { "zh-Hans": validatedMaterial.chineseReviewVersion },
    missingFacts: validatedMaterial.missingFacts,
    neutralWordingChecks: validatedMaterial.neutralWordingChecks,
    followUpPrompts: validatedMaterial.followUpPrompts,
  });
}

function assertProviderCandidateSafeForNoteType(
  noteType: CaresLinkV1NoteTypeCode,
  candidate: CaresLinkV1NoteProviderCandidate,
) {
  const generatedStrings = [
    candidate.englishDraft,
    ...Object.values(candidate.reviewVersions),
    ...candidate.missingFacts,
    ...candidate.neutralWordingChecks,
    ...candidate.followUpPrompts,
  ];

  for (const value of generatedStrings) {
    for (const window of outputScanWindows(value)) {
      if (scanCaresLinkV1CleanedFacts({ generatedText: window }).findings.length) {
        throw unsafeProviderCandidate();
      }
    }
  }

  const normalizedOutput = generatedStrings
    .join("\n")
    .normalize("NFKC")
    .toLocaleLowerCase("en");
  if (
    getCaresLinkV1NoteType(noteType).prohibitedDecisions.some((decision) =>
      normalizedOutput.includes(
        decision.normalize("NFKC").toLocaleLowerCase("en"),
      ),
    )
  ) {
    throw unsafeProviderCandidate();
  }
}

function outputScanWindows(value: string) {
  const windows: string[] = [];
  const step = OUTPUT_SCAN_WINDOW_LENGTH - OUTPUT_SCAN_WINDOW_OVERLAP;
  for (let start = 0; start < value.length; start += step) {
    windows.push(value.slice(start, start + OUTPUT_SCAN_WINDOW_LENGTH));
  }
  return windows;
}

function validateBoundedString(
  value: unknown,
  field: string,
  maximumLength: number,
) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maximumLength
  ) {
    throw invalidProviderCandidate(`${field} must be a bounded non-empty string`);
  }
  return value.trim();
}

function validateBoundedStringArray(value: unknown, field: string) {
  if (!Array.isArray(value) || value.length > NOTE_CONTENT_BOUNDS.listItems) {
    throw invalidProviderCandidate(`${field} must be a bounded string array`);
  }

  return value.map((entry) =>
    validateBoundedString(entry, field, NOTE_CONTENT_BOUNDS.listItemLength),
  );
}

function assertExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  field: string,
) {
  const actualKeys = Object.keys(value);
  if (
    actualKeys.length !== expectedKeys.length ||
    expectedKeys.some((key) => !Object.hasOwn(value, key)) ||
    actualKeys.some((key) => !expectedKeys.includes(key))
  ) {
    throw invalidProviderCandidate(`${field} shape is invalid`);
  }
}

function assertAllowedKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  field: string,
) {
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throw invalidProviderCandidate(`${field} contains an unsupported locale`);
  }
}

function invalidProviderCandidate(message: string) {
  return new CaresLinkV1ContractError("VALIDATION_ERROR", message);
}

function unsafeProviderCandidate() {
  return new CaresLinkV1ContractError(
    "GENERATION_FAILED",
    "Generated Note output did not pass server validation",
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
