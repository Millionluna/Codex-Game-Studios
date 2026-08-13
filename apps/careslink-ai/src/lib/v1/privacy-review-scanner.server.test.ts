import { describe, expect, it, vi } from "vitest";

import {
  CARESLINK_V1_CLEANED_FACTS_MAX_CANONICAL_BYTES,
  CARESLINK_V1_CLEANED_FACTS_MAX_DEPTH,
  CARESLINK_V1_CLEANED_FACTS_MAX_NODES,
  findUnresolvedCaresLinkV1PrivacyFindings,
  normalizeCaresLinkV1PrivacyFindingDecisions,
  scanCaresLinkV1CleanedFacts,
} from "./privacy-review-scanner.server";
import {
  CARESLINK_V1_PRIVACY_FIELD_CODE_MAX_LENGTH,
  CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION,
} from "./shared-contracts";

vi.mock("server-only", () => ({}));

describe("CaresLink V1 deterministic cleaned-facts privacy scanner", () => {
  it.each([
    ["email", "worker@example.test"],
    ["phone", "0412 345 678"],
    ["postal_address", "12 Smith Street Melbourne VIC 3000"],
    ["titled_person", "Dr Jane Smith"],
    ["organisation_identifier", "ABN 12 345 678 901"],
    ["labelled_identifier", "participant ID: ABC-123"],
    ["url", "https://example.test/private?id=1"],
  ] as const)("finds %s without returning an excerpt", (findingType, value) => {
    const result = scanCaresLinkV1CleanedFacts({ detail: value });
    const finding = result.findings.find(
      (candidate) => candidate.findingType === findingType,
    );

    expect(finding).toMatchObject({
      findingType,
      fieldCode: "/detail",
      startOffset: 0,
    });
    expect(finding?.endOffset).toBeGreaterThan(0);
    expect(Object.keys(finding ?? {})).toEqual([
      "findingType",
      "fieldCode",
      "startOffset",
      "endOffset",
    ]);
    expect(JSON.stringify(finding)).not.toContain(value);
    expect(result.scannerPolicyVersion).toBe(
      CARESLINK_V1_PRIVACY_SCANNER_POLICY_VERSION,
    );
  });

  it("uses RFC 6901 pointers and UTF-16 offsets", () => {
    const value = "😀 worker@example.test";
    const result = scanCaresLinkV1CleanedFacts({
      "contact/details": [{ "~value": value }],
    });
    const email = result.findings.find(({ findingType }) => findingType === "email");

    expect(email).toEqual({
      findingType: "email",
      fieldCode: "/contact~1details/0/~0value",
      startOffset: value.indexOf("worker@example.test"),
      endOffset: value.length,
    });
  });

  it("hashes canonical JSON independent of object insertion order", () => {
    const first = scanCaresLinkV1CleanedFacts({ b: 2, a: [true, "safe"] });
    const second = scanCaresLinkV1CleanedFacts({ a: [true, "safe"], b: 2 });

    expect(first.cleanedFactsHash).toBe(second.cleanedFactsHash);
    expect(first.cleanedFactsHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("requires exact retained locators and an explicit retention purpose", () => {
    const [finding] = scanCaresLinkV1CleanedFacts({
      contact: "worker@example.test",
    }).findings;

    expect(findUnresolvedCaresLinkV1PrivacyFindings([finding], [])).toEqual([
      finding,
    ]);
    expect(
      findUnresolvedCaresLinkV1PrivacyFindings([finding], [
        { ...finding, decision: "REMOVED" },
      ]),
    ).toEqual([finding]);
    expect(
      findUnresolvedCaresLinkV1PrivacyFindings([finding], [
        {
          ...finding,
          decision: "RETAINED_CONFIRMED",
          retentionPurposeConfirmed: true,
        },
      ]),
    ).toEqual([]);
    expect(() =>
      findUnresolvedCaresLinkV1PrivacyFindings([finding], [
        { ...finding, decision: "REMOVED" },
        { ...finding, decision: "REPLACED" },
      ]),
    ).toThrow("duplicate locator");
    expect(() =>
      findUnresolvedCaresLinkV1PrivacyFindings([], [
        {
          ...finding,
          decision: "RETAINED_CONFIRMED",
          retentionPurposeConfirmed: true,
        },
      ]),
    ).toThrow("invalid retained locator");
  });

  it("normalizes decision order by the safe exact locator", () => {
    expect(
      normalizeCaresLinkV1PrivacyFindingDecisions([
        {
          findingType: "phone",
          fieldCode: "/z",
          startOffset: 2,
          endOffset: 4,
          decision: "REMOVED",
        },
        {
          findingType: "email",
          fieldCode: "/a",
          startOffset: 8,
          endOffset: 12,
          decision: "REPLACED",
        },
      ]),
    ).toEqual([
      expect.objectContaining({ fieldCode: "/a" }),
      expect.objectContaining({ fieldCode: "/z" }),
    ]);
  });

  it("uses UTF-8 byte ordering for non-ASCII locator segments", () => {
    expect(
      normalizeCaresLinkV1PrivacyFindingDecisions([
        {
          findingType: "email",
          fieldCode: "/\u{10000}",
          startOffset: 0,
          endOffset: 1,
          decision: "REMOVED",
        },
        {
          findingType: "email",
          fieldCode: "/\uE000",
          startOffset: 0,
          endOffset: 1,
          decision: "REMOVED",
        },
      ]).map(({ fieldCode }) => fieldCode),
    ).toEqual(["/\uE000", "/\u{10000}"]);
  });

  it("fails closed on canonical byte, depth and node limits", () => {
    expect(() =>
      scanCaresLinkV1CleanedFacts({
        value: "x".repeat(CARESLINK_V1_CLEANED_FACTS_MAX_CANONICAL_BYTES),
      }),
    ).toThrow("canonical payload limit");

    let nested: Record<string, unknown> = { value: "safe" };
    for (let depth = 0; depth <= CARESLINK_V1_CLEANED_FACTS_MAX_DEPTH; depth += 1) {
      nested = { child: nested };
    }
    expect(() => scanCaresLinkV1CleanedFacts(nested as never)).toThrow(
      "nesting limit",
    );

    expect(() =>
      scanCaresLinkV1CleanedFacts({
        values: Array.from(
          { length: CARESLINK_V1_CLEANED_FACTS_MAX_NODES },
          () => null,
        ),
      }),
    ).toThrow("node limit");

    expect(() =>
      scanCaresLinkV1CleanedFacts({
        ["x".repeat(CARESLINK_V1_PRIVACY_FIELD_CODE_MAX_LENGTH + 1)]:
          "worker@example.test",
      }),
    ).toThrow("locator limit");
  });
});
