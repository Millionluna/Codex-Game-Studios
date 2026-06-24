import { describe, expect, it } from "vitest";
import {
  REQUIRED_REFERRAL_PROFILE_BOUNDARY,
  getUnsafeClaimReason,
  isSafeReferralProfileCopy,
} from "./referral-profile-safe-copy";

describe("referral profile safe copy", () => {
  it.each([
    "certified",
    "approved provider",
    "verified provider quality",
    "quality checked",
    "compliant provider",
    "guaranteed referral",
    "guaranteed service",
    "recommended provider",
    "clinically suitable",
    "best provider",
    "meets requirements",
    "ensures compliance",
  ])("rejects the required blocked claim: %s", (claim) => {
    expect(isSafeReferralProfileCopy(`Provider is ${claim}`)).toBe(false);
  });

  it.each([
    "quality-checked",
    "provider quality verified",
    "meets all requirements",
    "ensure compliance",
    "certified provider",
    "approved care provider",
  ])("rejects obvious blocked claim variants: %s", (claim) => {
    expect(isSafeReferralProfileCopy(`Provider is ${claim}`)).toBe(false);
  });

  it("allows profile completeness and referral communication readiness language", () => {
    expect(isSafeReferralProfileCopy("Referral Profile Health")).toBe(true);
    expect(isSafeReferralProfileCopy("Profile completeness")).toBe(true);
    expect(isSafeReferralProfileCopy("Referral communication readiness")).toBe(true);
    expect(isSafeReferralProfileCopy("Based on self-submitted information")).toBe(true);
  });

  it("returns a useful unsafe reason", () => {
    expect(getUnsafeClaimReason("This is a certified provider")).toContain("certified");
    expect(getUnsafeClaimReason("Profile completeness checked")).toBe(null);
  });

  it("keeps the required boundary copy explicit", () => {
    expect(REQUIRED_REFERRAL_PROFILE_BOUNDARY).toContain("self-submitted information");
    expect(REQUIRED_REFERRAL_PROFILE_BOUNDARY).toContain("does not assess provider quality");
    expect(REQUIRED_REFERRAL_PROFILE_BOUNDARY).toContain("clinical suitability");
    expect(REQUIRED_REFERRAL_PROFILE_BOUNDARY).toContain("compliance status");
    expect(REQUIRED_REFERRAL_PROFILE_BOUNDARY).toContain("service outcomes");
    expect(REQUIRED_REFERRAL_PROFILE_BOUNDARY).toContain("not legal, clinical, medical, compliance, financial, or professional advice");
  });
});
