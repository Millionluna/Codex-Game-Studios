import { describe, expect, it } from "vitest";
import {
  REQUIRED_REFERRAL_PROFILE_BOUNDARY,
  getUnsafeClaimReason,
  isSafeReferralProfileCopy,
} from "./referral-profile-safe-copy";

describe("referral profile safe copy", () => {
  it("rejects certification, approval, quality, guarantee, clinical, and compliance claims", () => {
    expect(isSafeReferralProfileCopy("Certified by CaresLink")).toBe(false);
    expect(isSafeReferralProfileCopy("Approved provider")).toBe(false);
    expect(isSafeReferralProfileCopy("Verified provider quality")).toBe(false);
    expect(isSafeReferralProfileCopy("Guaranteed referral")).toBe(false);
    expect(isSafeReferralProfileCopy("Clinically suitable provider")).toBe(false);
    expect(isSafeReferralProfileCopy("Compliant provider")).toBe(false);
    expect(isSafeReferralProfileCopy("Ensures compliance")).toBe(false);
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
    expect(REQUIRED_REFERRAL_PROFILE_BOUNDARY).toContain("not legal, clinical, medical, compliance, financial, or professional advice");
  });
});
