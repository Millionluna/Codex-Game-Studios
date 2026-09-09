import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/communication-note-document.server", async () =>
  import("../../../../../../lib/communication-note-document.server"),
);

describe("Communication Note document route", () => {
  it("serves only a dynamic Node GET and stays closed with the real runtime disabled", async () => {
    vi.stubEnv("CARESLINK_V1_PRODUCT_API_ENABLED", "false");
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network not permitted"));
    try {
      const route = await import("./route");
      expect(Object.keys(route).sort()).toEqual(["GET", "dynamic", "runtime"]);
      expect(route.dynamic).toBe("force-dynamic");
      expect(route.runtime).toBe("nodejs");
      const response = await route.GET(new Request("https://example.test/api/ai-documents/communication-note/documents/10000000-0000-4000-8000-000000000001"), {
        params: Promise.resolve({ documentId: "10000000-0000-4000-8000-000000000001" }),
      });
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ status: "UNAVAILABLE" });
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
      vi.unstubAllEnvs();
    }
  });
});
