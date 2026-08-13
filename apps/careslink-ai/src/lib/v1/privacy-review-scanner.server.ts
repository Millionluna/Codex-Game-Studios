import "server-only";

import { createHash } from "node:crypto";

import {
  compareCaresLinkV1Utf8,
  stringifyCaresLinkV1CanonicalJson,
} from "./canonical-json";
import {
  CARESLINK_V1_PRIVACY_FINDING_TYPES,
  CARESLINK_V1_PRIVACY_FIELD_CODE_MAX_LENGTH,
  CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION,
  CaresLinkV1ContractError,
  type CaresLinkV1JsonObject,
  type CaresLinkV1JsonValue,
  type CaresLinkV1PrivacyFindingDecision,
  type CaresLinkV1PrivacyFindingLocator,
  type CaresLinkV1PrivacyFindingType,
} from "./shared-contracts";

export const CARESLINK_V1_CLEANED_FACTS_MAX_CANONICAL_BYTES = 64 * 1024;
export const CARESLINK_V1_CLEANED_FACTS_MAX_DEPTH = 32;
export const CARESLINK_V1_CLEANED_FACTS_MAX_NODES = 4096;

export type CaresLinkV1PrivacyScanResult = Readonly<{
  cleanedFactsHash: string;
  findings: readonly CaresLinkV1PrivacyFindingLocator[];
  scannerPolicyVersion: typeof CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION;
}>;

type ScannerPattern = Readonly<{
  findingType: CaresLinkV1PrivacyFindingType;
  createExpression(): RegExp;
  normalizeMatchLength?(value: string): number;
  validateMatch?(value: string): boolean;
}>;

const SCANNER_PATTERNS: readonly ScannerPattern[] = [
  {
    findingType: "email",
    createExpression: () =>
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/gi,
  },
  {
    findingType: "phone",
    createExpression: () =>
      /(?:\+?61[\s().-]*|0)(?:\d[\s().-]*){8,10}/g,
    validateMatch: (value) => {
      const digits = value.replace(/\D/g, "");
      return digits.length >= 9 && digits.length <= 11;
    },
  },
  {
    findingType: "postal_address",
    createExpression: () =>
      /\b\d{1,5}\s+(?:[\p{L}0-9'-]+\s+){0,6}(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Lane|Ln|Court|Ct|Boulevard|Blvd|Parade|Pde|Highway|Hwy|Close|Crescent|Cres|Place|Pl|Way)\b(?:\s*,?\s*[\p{L}][\p{L}' -]{1,40})?(?:\s+(?:VIC|NSW|QLD|SA|WA|TAS|NT|ACT)\s+\d{4})?/giu,
  },
  {
    findingType: "titled_person",
    createExpression: () =>
      /\b(?:Mr|Mrs|Ms|Miss|Dr|Prof(?:essor)?|Mx)\.?\s+[\p{Lu}][\p{L}'-]+(?:\s+[\p{Lu}][\p{L}'-]+){0,2}\b/gu,
  },
  {
    findingType: "organisation_identifier",
    createExpression: () =>
      /\b(?:ABN|ACN|NDIS\s+(?:provider|registration)\s*(?:number|no\.?|#))\s*[:#-]?\s*[A-Z0-9](?:[A-Z0-9 -]{4,22}[A-Z0-9])\b/gi,
  },
  {
    findingType: "labelled_identifier",
    createExpression: () =>
      /\b(?:participant|client|patient|member|reference|case|record|claim|medicare|NDIS)\s*(?:ID|number|no\.?|#)\s*[:#-]?\s*[A-Z0-9][A-Z0-9._\/-]{2,63}\b/gi,
  },
  {
    findingType: "url",
    createExpression: () => /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi,
    normalizeMatchLength: (value) => value.replace(/[),.;:!?\]}]+$/g, "").length,
  },
] as const;

if (
  SCANNER_PATTERNS.some(
    ({ findingType }) =>
      !(CARESLINK_V1_PRIVACY_FINDING_TYPES as readonly string[]).includes(
        findingType,
      ),
  )
) {
  throw new Error("Privacy scanner finding vocabulary is inconsistent");
}

/**
 * Deterministic Preview policy for obvious identifier patterns. It is an
 * authoritative upload gate for this contract, but it is explicitly not a
 * guarantee that the structured facts are completely de-identified.
 */
export function scanCaresLinkV1CleanedFacts(
  cleanedFacts: CaresLinkV1JsonObject,
): CaresLinkV1PrivacyScanResult {
  validateJsonBounds(cleanedFacts);

  let canonicalJson: string;
  try {
    canonicalJson = stringifyCaresLinkV1CanonicalJson(cleanedFacts);
  } catch {
    throw validation("cleanedFacts must be canonical JSON data");
  }

  if (
    new TextEncoder().encode(canonicalJson).byteLength >
    CARESLINK_V1_CLEANED_FACTS_MAX_CANONICAL_BYTES
  ) {
    throw validation("cleanedFacts exceeds the canonical payload limit");
  }

  const findings: CaresLinkV1PrivacyFindingLocator[] = [];
  visitStrings(cleanedFacts, "", (fieldCode, value) => {
    if (fieldCode.length > CARESLINK_V1_PRIVACY_FIELD_CODE_MAX_LENGTH) {
      throw validation("cleanedFacts field path exceeds the locator limit");
    }
    for (const pattern of SCANNER_PATTERNS) {
      const expression = pattern.createExpression();
      for (const match of value.matchAll(expression)) {
        const startOffset = match.index;
        const matchedValue = match[0];
        if (
          startOffset === undefined ||
          !matchedValue ||
          (pattern.validateMatch && !pattern.validateMatch(matchedValue))
        ) {
          continue;
        }
        const matchLength =
          pattern.normalizeMatchLength?.(matchedValue) ?? matchedValue.length;
        if (matchLength < 1) continue;
        findings.push({
          findingType: pattern.findingType,
          fieldCode,
          startOffset,
          endOffset: startOffset + matchLength,
        });
      }
    }
  });

  return {
    cleanedFactsHash: createHash("sha256").update(canonicalJson).digest("hex"),
    findings: deduplicateAndSort(findings),
    scannerPolicyVersion: CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION,
  };
}

export function findUnresolvedCaresLinkV1PrivacyFindings(
  findings: readonly CaresLinkV1PrivacyFindingLocator[],
  decisions: readonly CaresLinkV1PrivacyFindingDecision[],
) {
  const findingKeys = new Set(findings.map(locatorKey));
  const decisionsByLocator = new Map<string, CaresLinkV1PrivacyFindingDecision>();
  for (const decision of decisions) {
    const key = locatorKey(decision);
    if (decisionsByLocator.has(key)) {
      throw validation("findingDecisions contains a duplicate locator");
    }
    if (
      decision.decision === "RETAINED_CONFIRMED" &&
      !findingKeys.has(key)
    ) {
      // Never reflect a client-supplied locator: JSON pointers are metadata but
      // an untrusted caller can still put PII in them.
      throw validation("findingDecisions contains an invalid retained locator");
    }
    decisionsByLocator.set(key, decision);
  }

  return findings.filter((finding) => {
    const decision = decisionsByLocator.get(locatorKey(finding));
    return !(
      decision?.decision === "RETAINED_CONFIRMED" &&
      decision.retentionPurposeConfirmed === true
    );
  });
}

export function normalizeCaresLinkV1PrivacyFindingDecisions(
  decisions: readonly CaresLinkV1PrivacyFindingDecision[],
) {
  return [...decisions].sort(compareLocators);
}

function validateJsonBounds(root: CaresLinkV1JsonObject) {
  if (!isPlainObject(root)) {
    throw validation("cleanedFacts must be a JSON object");
  }
  const seen = new WeakSet<object>();
  let nodeCount = 0;

  const visit = (value: unknown, depth: number): void => {
    nodeCount += 1;
    if (nodeCount > CARESLINK_V1_CLEANED_FACTS_MAX_NODES) {
      throw validation("cleanedFacts exceeds the node limit");
    }
    if (depth > CARESLINK_V1_CLEANED_FACTS_MAX_DEPTH) {
      throw validation("cleanedFacts exceeds the nesting limit");
    }
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    ) {
      return;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        throw validation("cleanedFacts contains a non-finite number");
      }
      return;
    }
    if (!Array.isArray(value) && !isPlainObject(value)) {
      throw validation("cleanedFacts must contain JSON values only");
    }
    if (seen.has(value)) {
      throw validation("cleanedFacts must not contain cycles");
    }
    seen.add(value);
    if (Array.isArray(value)) {
      for (const child of value) visit(child, depth + 1);
    } else {
      for (const child of Object.values(value)) visit(child, depth + 1);
    }
    seen.delete(value);
  };

  visit(root, 0);
}

function visitStrings(
  value: CaresLinkV1JsonValue,
  pointer: string,
  visit: (fieldCode: string, value: string) => void,
) {
  if (typeof value === "string") {
    visit(pointer, value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) =>
      visitStrings(child, `${pointer}/${index}`, visit),
    );
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      visitStrings(child, `${pointer}/${escapeJsonPointerSegment(key)}`, visit);
    }
  }
}

function escapeJsonPointerSegment(value: string) {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function deduplicateAndSort(findings: CaresLinkV1PrivacyFindingLocator[]) {
  const unique = new Map<string, CaresLinkV1PrivacyFindingLocator>();
  for (const finding of findings) unique.set(locatorKey(finding), finding);
  return [...unique.values()].sort(compareLocators);
}

function compareLocators(
  left: CaresLinkV1PrivacyFindingLocator,
  right: CaresLinkV1PrivacyFindingLocator,
) {
  if (left.fieldCode !== right.fieldCode) {
    return compareCaresLinkV1Utf8(left.fieldCode, right.fieldCode);
  }
  if (left.startOffset !== right.startOffset) {
    return left.startOffset - right.startOffset;
  }
  if (left.endOffset !== right.endOffset) {
    return left.endOffset - right.endOffset;
  }
  return compareCaresLinkV1Utf8(left.findingType, right.findingType);
}

function locatorKey(locator: {
  findingType: string;
  fieldCode: string;
  startOffset: number;
  endOffset: number;
}) {
  return `${locator.findingType}\u0000${locator.fieldCode}\u0000${locator.startOffset}\u0000${locator.endOffset}`;
}

function isPlainObject(value: unknown): value is CaresLinkV1JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validation(message: string): CaresLinkV1ContractError {
  return new CaresLinkV1ContractError("VALIDATION_ERROR", message);
}
