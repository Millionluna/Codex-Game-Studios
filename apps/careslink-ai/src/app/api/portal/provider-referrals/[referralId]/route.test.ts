import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  handlePortalReferralProviderFollowUpDetail: vi.fn(),
}));

vi.mock("@/lib/portal-referral-route.server", () => routeMocks);

import { GET } from "./route";

describe("provider follow-up detail route", () => {
  beforeEach(() => routeMocks.handlePortalReferralProviderFollowUpDetail.mockReset());

  it("forwards the request and awaited path ID to the authoritative handler", async () => {
    const response = new Response(null, { status: 204 });
    routeMocks.handlePortalReferralProviderFollowUpDetail.mockResolvedValue(response);
    const request = new Request("http://localhost/api/portal/provider-referrals/a");

    await expect(
      GET(request, { params: Promise.resolve({ referralId: "a" }) }),
    ).resolves.toBe(response);
    expect(routeMocks.handlePortalReferralProviderFollowUpDetail).toHaveBeenCalledWith(
      request,
      "a",
    );
  });
});
