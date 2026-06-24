import { describe, expect, it } from "vitest";
import {
  getDemoEntrypoints,
  getHushcareBridge,
  getRevenueEngines,
} from "./demo-strategy";

describe("Careslink demo strategy", () => {
  it("exposes the five pitch demo entrypoints requested for partner conversations", () => {
    expect(getDemoEntrypoints().map((entry) => entry.path)).toEqual([
      "/demo",
      "/admin",
      "/referral-source-portal",
      "/provider-portal",
      "/hushcare-provider-finder",
    ]);
  });

  it("combines Okana-style enablement with the referral operating platform", () => {
    expect(getRevenueEngines().map((engine) => engine.id)).toEqual([
      "setup",
      "subscription",
      "provider_tools",
      "training",
      "partner_share",
    ]);
  });

  it("keeps the HushCare bridge family-safe and non-marketplace-first", () => {
    expect(getHushcareBridge()).toMatchObject({
      sourceProduct: "HUSHCARE 安心小助手",
      entryPoint: "Care Hub / Provider Finder",
      privacyBoundary:
        "不展示长者小游戏分数、错误、反应速度或能力评估，只用家庭主动表达的服务需求进入 provider 查找。",
      conversionGoal: "从家庭安心场景进入可信 provider discovery，再生成 B2B referral lead。",
    });
  });
});
