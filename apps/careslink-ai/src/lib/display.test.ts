import { describe, expect, it } from "vitest";
import {
  displayArea,
  displayFrequency,
  displayFundingType,
  displayProviderStatus,
  displayReferralStatus,
  displayService,
} from "./display";

describe("Chinese display helpers", () => {
  it("translates operational statuses and common referral fields for the UI", () => {
    expect(displayProviderStatus("approved")).toBe("已审核");
    expect(displayReferralStatus("Pending Match")).toBe("待匹配");
    expect(displayFundingType("Aged Care")).toBe("养老护理");
    expect(displayService("Support Coordination")).toBe("支持协调");
    expect(displayArea("Parramatta")).toBe("帕拉马塔");
    expect(displayFrequency("Fortnightly")).toBe("每两周");
  });
});
