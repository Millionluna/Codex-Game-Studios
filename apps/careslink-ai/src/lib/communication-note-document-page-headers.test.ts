import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("Communication Note document page response headers", () => {
  it("keeps the private page uncacheable, non-indexable and referrer-free", async () => {
    if (typeof nextConfig.headers !== "function") {
      throw new Error("Expected route-specific response headers");
    }
    const entries = await nextConfig.headers();
    const entry = entries.find(
      ({ source }) =>
        source === "/ai-documents/communication-note/documents/:path*",
    );
    const headers = Object.fromEntries(
      (entry?.headers ?? []).map(({ key, value }) => [key.toLowerCase(), value]),
    );

    expect(headers).toMatchObject({
      "cache-control": "private, no-store, max-age=0",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, nofollow",
    });
  });
});
