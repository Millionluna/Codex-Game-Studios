import { describe, expect, it } from "vitest";

import { canonicalPortalReferralUuid } from "./portal-referral-id";

describe("Portal referral UUID contract", () => {
  it.each([
    [
      "A1111111-1111-4111-8111-111111111111",
      "a1111111-1111-4111-8111-111111111111",
    ],
    [
      "71111111-1111-7111-8111-111111111111",
      "71111111-1111-7111-8111-111111111111",
    ],
    [
      "81111111-1111-8111-8111-111111111111",
      "81111111-1111-8111-8111-111111111111",
    ],
  ])("canonicalizes supported UUID versions", (value, expected) => {
    expect(canonicalPortalReferralUuid(value)).toBe(expected);
  });

  it.each([
    "not-a-uuid",
    "01111111-1111-0111-8111-111111111111",
    "91111111-1111-9111-8111-111111111111",
    "71111111-1111-7111-7111-111111111111",
    null,
  ])("rejects values outside the shared UUID contract", (value) => {
    expect(canonicalPortalReferralUuid(value)).toBeUndefined();
  });
});
