import { describe, expect, it } from "vitest";
import { createMemoryGuidedAiRateLimiter } from "./guided-ai-rate-limit";

describe("guided AI rate limiter", () => {
  it("limits repeated requests for the same account within the window", () => {
    const limiter = createMemoryGuidedAiRateLimiter({
      limit: 2,
      windowMs: 60_000,
    });
    const now = 1_800_000_000_000;

    expect(limiter.check("user-1", now)).toMatchObject({
      allowed: true,
      remaining: 1,
    });
    expect(limiter.check("user-1", now + 1_000)).toMatchObject({
      allowed: true,
      remaining: 0,
    });
    expect(limiter.check("user-1", now + 2_000)).toMatchObject({
      allowed: false,
      retryAfterSeconds: 58,
      resetAt: new Date(now + 60_000).toISOString(),
    });
  });

  it("allows the same account again after the window resets", () => {
    const limiter = createMemoryGuidedAiRateLimiter({
      limit: 1,
      windowMs: 60_000,
    });
    const now = 1_800_000_000_000;

    expect(limiter.check("user-1", now)).toMatchObject({
      allowed: true,
      remaining: 0,
    });
    expect(limiter.check("user-1", now + 60_000)).toMatchObject({
      allowed: true,
      remaining: 0,
    });
  });

  it("tracks accounts independently", () => {
    const limiter = createMemoryGuidedAiRateLimiter({
      limit: 1,
      windowMs: 60_000,
    });
    const now = 1_800_000_000_000;

    expect(limiter.check("user-1", now)).toMatchObject({
      allowed: true,
      remaining: 0,
    });
    expect(limiter.check("user-2", now + 1_000)).toMatchObject({
      allowed: true,
      remaining: 0,
    });
  });
});
