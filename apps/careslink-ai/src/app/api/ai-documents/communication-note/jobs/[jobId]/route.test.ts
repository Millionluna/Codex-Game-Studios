import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock(
  "@/lib/communication-note-generation-job-recovery.server",
  async () =>
    import(
      "../../../../../../lib/communication-note-generation-job-recovery.server"
    ),
);

const JOB_ID = "33333333-3333-4333-8333-333333333333";

describe("Communication Note generation job recovery route", () => {
  it("serves only a dynamic Node GET and stays closed without a formal reader", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Network not permitted"));
    try {
      const route = await import("./route");
      expect(Object.keys(route).sort()).toEqual(["GET", "dynamic", "runtime"]);
      expect(route.dynamic).toBe("force-dynamic");
      expect(route.runtime).toBe("nodejs");

      const response = await route.GET(
        new Request(
          `https://example.test/api/ai-documents/communication-note/jobs/${JOB_ID}`,
        ),
        { params: Promise.resolve({ jobId: JOB_ID }) },
      );

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ status: "UNAVAILABLE" });
      expect(response.headers.get("cache-control")).toBe(
        "private, no-store, max-age=0",
      );
      expect(response.headers.get("vary")).toBe("Cookie, Authorization");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(response.headers.has("access-control-allow-origin")).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
});
