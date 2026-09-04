import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  handleCaresLinkV1GetPoints: vi.fn(),
}));

vi.mock("@/lib/v1/product-api-route.server", () => routeMocks);

import { GET } from "./route";

describe("CaresLink V1 Points route", () => {
  beforeEach(() => routeMocks.handleCaresLinkV1GetPoints.mockReset());

  it("forwards GET requests to the audited Product API boundary", async () => {
    const response = new Response(null, { status: 204 });
    routeMocks.handleCaresLinkV1GetPoints.mockResolvedValue(response);
    const request = new Request("https://portal.example.test/v1/points");

    await expect(GET(request)).resolves.toBe(response);
    expect(routeMocks.handleCaresLinkV1GetPoints).toHaveBeenCalledWith(request);
  });
});
