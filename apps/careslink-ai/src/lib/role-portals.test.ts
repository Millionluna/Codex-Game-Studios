import { describe, expect, it } from "vitest";
import { getRolePortal, getRolePortals } from "./role-portals";

describe("role portal definitions", () => {
  it("defines three separate role pages for the platform", () => {
    expect(getRolePortals().map((portal) => portal.id)).toEqual([
      "platform_admin",
      "referral_source",
      "referral_receiver",
    ]);
  });

  it("separates providers who send referrals from providers or individuals who receive referrals", () => {
    const sender = getRolePortal("referral_source");
    const receiver = getRolePortal("referral_receiver");

    expect(sender).toMatchObject({
      path: "/referral-source-portal",
      canSendReferrals: true,
      canReceiveReferrals: false,
      surfaces: ["web", "app"],
    });
    expect(receiver).toMatchObject({
      path: "/provider-portal",
      canSendReferrals: false,
      canReceiveReferrals: true,
      surfaces: ["web", "app"],
    });
  });

  it("keeps the platform admin as a governance console instead of a provider portal", () => {
    expect(getRolePortal("platform_admin")).toMatchObject({
      path: "/admin",
      canSendReferrals: false,
      canReceiveReferrals: false,
      surfaces: ["web"],
    });
  });
});
