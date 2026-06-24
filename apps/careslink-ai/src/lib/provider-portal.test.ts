import { describe, expect, it } from "vitest";
import { getProviderPortalData } from "./provider-portal";

describe("getProviderPortalData", () => {
  it("returns a provider-only view with owned profile data and relevant referral opportunities", () => {
    const data = getProviderPortalData("provider-harbour");

    expect(data.provider.name).toBe("Harbour Community Support");
    expect(data.profileCompleteness).toBe(100);
    expect(data.visibleReferrals.map((referral) => referral.id)).toContain(
      "referral-001",
    );
    expect(data.visibleReferrals.every((referral) =>
      referral.assignedProviderId === "provider-harbour" ||
      referral.matchedProviderIds.includes("provider-harbour"),
    )).toBe(true);
    expect(data.actions).toEqual([
      "确认可接单",
      "需要更多资料",
      "暂时无法服务",
    ]);
  });
});
