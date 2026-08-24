import { beforeEach, describe, expect, it, vi } from "vitest";

const handlers = vi.hoisted(() => ({
  audit: vi.fn(),
  candidates: vi.fn(),
  collection: vi.fn(),
  followUp: vi.fn(),
  get: vi.fn(),
  offer: vi.fn(),
  offers: vi.fn(),
  response: vi.fn(),
  triage: vi.fn(),
}));

vi.mock("@/lib/portal-referral-route.server", () => ({
  handlePortalReferralAudit: handlers.audit,
  handlePortalReferralCandidates: handlers.candidates,
  handlePortalReferralCollection: handlers.collection,
  handlePortalReferralFollowUp: handlers.followUp,
  handlePortalReferralGet: handlers.get,
  handlePortalReferralOffer: handlers.offer,
  handlePortalReferralOffers: handlers.offers,
  handlePortalReferralResponse: handlers.response,
  handlePortalReferralTriage: handlers.triage,
}));

import * as offersRoute from "../app/api/portal/referral-offers/route";
import * as responseRoute from "../app/api/portal/referral-offers/[matchId]/response/route";
import * as referralsRoute from "../app/api/portal/referrals/route";
import * as auditRoute from "../app/api/portal/referrals/[referralId]/audit/route";
import * as candidatesRoute from "../app/api/portal/referrals/[referralId]/candidates/route";
import * as followUpsRoute from "../app/api/portal/referrals/[referralId]/follow-ups/route";
import * as offersForReferralRoute from "../app/api/portal/referrals/[referralId]/offers/route";
import * as referralRoute from "../app/api/portal/referrals/[referralId]/route";
import * as triageRoute from "../app/api/portal/referrals/[referralId]/triage/route";

const REFERRAL_ID = "70000000-0000-4000-8000-000000000001";
const MATCH_ID = "70000000-0000-4000-8000-000000000002";

describe("Portal referral Next route wrappers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const handler of Object.values(handlers)) {
      handler.mockResolvedValue(new Response(null, { status: 204 }));
    }
  });

  it.each([
    ["referral list", referralsRoute.GET, handlers.collection, "GET"],
    ["referral create", referralsRoute.POST, handlers.collection, "POST"],
    ["provider offers", offersRoute.GET, handlers.offers, "GET"],
  ])("passes only the request through the %s wrapper", async (_, route, handler, method) => {
    const request = new Request(
      "https://preview.careslink.test/api/portal/referrals",
      { method },
    );
    await route(request);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(request);
  });

  it.each([
    ["detail", referralRoute.GET, handlers.get],
    ["triage", triageRoute.POST, handlers.triage],
    ["candidates", candidatesRoute.GET, handlers.candidates],
    ["offer", offersForReferralRoute.POST, handlers.offer],
    ["follow-up", followUpsRoute.POST, handlers.followUp],
    ["audit", auditRoute.GET, handlers.audit],
  ])("passes the awaited referralId through the %s wrapper", async (_, route, handler) => {
    const request = new Request(
      `https://preview.careslink.test/api/portal/referrals/${REFERRAL_ID}`,
    );
    await route(request, { params: Promise.resolve({ referralId: REFERRAL_ID }) });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(request, REFERRAL_ID);
  });

  it("passes the awaited matchId through the response wrapper", async () => {
    const request = new Request(
      `https://preview.careslink.test/api/portal/referral-offers/${MATCH_ID}/response`,
      { method: "POST" },
    );
    await responseRoute.POST(request, {
      params: Promise.resolve({ matchId: MATCH_ID }),
    });

    expect(handlers.response).toHaveBeenCalledOnce();
    expect(handlers.response).toHaveBeenCalledWith(request, MATCH_ID);
  });
});
