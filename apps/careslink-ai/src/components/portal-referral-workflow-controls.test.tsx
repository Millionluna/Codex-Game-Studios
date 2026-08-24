import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  PORTAL_REFERRAL_FOLLOW_UP_OUTCOME_CODES,
  PORTAL_REFERRAL_PREVIEW_REGION_CODES,
  PORTAL_REFERRAL_PREVIEW_SERVICE_TYPE_CODES,
} from "../lib/portal-referral-workflow";
import {
  PORTAL_REFERRAL_UI_FOLLOW_UP_OUTCOME_CODES,
  PORTAL_REFERRAL_UI_REGION_CODES,
  PORTAL_REFERRAL_UI_SERVICE_TYPE_CODES,
  PortalReferralFollowUpControls,
  PortalReferralIntakeControls,
  PortalReferralOfferControls,
  PortalReferralProviderOfferCard,
  PortalReferralResponseControls,
  PortalReferralTriageControls,
  createPortalReferralMutationRequest,
  submitPortalReferralMutation,
  type PortalReferralMutation,
} from "./portal-referral-workflow-controls";

const MUTATION_ID = "portal.ui:test-mutation-0001";
const REFERRAL_ID = "11111111-1111-4111-8111-111111111111";
const PROVIDER_ID = "22222222-2222-4222-8222-222222222222";
const MATCH_ID = "33333333-3333-4333-8333-333333333333";

describe("Portal referral workflow controls", () => {
  it("keeps the client catalogs identical to the reviewed workflow catalogs", () => {
    expect(PORTAL_REFERRAL_UI_REGION_CODES).toEqual(
      PORTAL_REFERRAL_PREVIEW_REGION_CODES,
    );
    expect(PORTAL_REFERRAL_UI_SERVICE_TYPE_CODES).toEqual(
      PORTAL_REFERRAL_PREVIEW_SERVICE_TYPE_CODES,
    );
    expect(PORTAL_REFERRAL_UI_FOLLOW_UP_OUTCOME_CODES).toEqual(
      PORTAL_REFERRAL_FOLLOW_UP_OUTCOME_CODES,
    );
  });

  it("renders intake with only reviewed catalog, contact, and summary fields and stays disabled", () => {
    const markup = renderToStaticMarkup(<PortalReferralIntakeControls />);

    for (const code of [
      ...PORTAL_REFERRAL_UI_REGION_CODES,
      ...PORTAL_REFERRAL_UI_SERVICE_TYPE_CODES,
    ]) {
      expect(markup).toContain(`value="${code}"`);
    }
    for (const field of [
      "region",
      "serviceType",
      "contactName",
      "contactPhone",
      "contactEmail",
      "summary",
    ]) {
      expect(markup).toContain(`name="${field}"`);
    }
    for (const unsupported of [
      "languageRequirements",
      "frequency",
      "fundingType",
      "urgent",
      "sourceGroupName",
      "followUpDate",
      "notes",
      "ownerId",
      "actorUserId",
    ]) {
      expect(markup).not.toContain(`name="${unsupported}"`);
    }
    expect(markup).toContain("<fieldset");
    expect(markup).toContain("disabled");
    expect(markup).toContain("No data will be submitted");
  });

  it("renders every mutation control disabled unless capability and row version are explicit", () => {
    const markup = renderToStaticMarkup(
      <>
        <PortalReferralTriageControls referralId={REFERRAL_ID} />
        <PortalReferralOfferControls
          referralId={REFERRAL_ID}
          providerId={PROVIDER_ID}
        />
        <PortalReferralResponseControls matchId={MATCH_ID} />
        <PortalReferralFollowUpControls referralId={REFERRAL_ID} />
      </>,
    );

    expect(markup.match(/disabled/g)?.length).toBeGreaterThanOrEqual(5);
    expect(markup).toContain("Accept / 接受");
    expect(markup).toContain("Decline / 拒绝");
    expect(markup).not.toContain("需要更多资料");
    expect(markup).not.toContain("需资料");
  });

  it("uses fixed outcome codes and exposes no free-text follow-up field", () => {
    const markup = renderToStaticMarkup(
      <PortalReferralFollowUpControls
        referralId={REFERRAL_ID}
        expectedVersion={4}
      />,
    );

    for (const code of PORTAL_REFERRAL_UI_FOLLOW_UP_OUTCOME_CODES) {
      expect(markup).toContain(`value="${code}"`);
    }
    expect(markup).not.toContain("<textarea");
    expect(markup).not.toContain('type="text"');
  });

  it("withholds private provider details before acceptance", () => {
    const privateSummary = "Private participant circumstances";
    const privatePhone = "0400000000";
    const preAccept = renderToStaticMarkup(
      <PortalReferralProviderOfferCard
        access="pre-accept"
        referralId={REFERRAL_ID}
        matchId={MATCH_ID}
        region="VIC_MELBOURNE"
        serviceType="SUPPORT_COORDINATION"
        expectedVersion={3}
      />,
    );
    const accepted = renderToStaticMarkup(
      <PortalReferralProviderOfferCard
        access="accepted"
        referralId={REFERRAL_ID}
        matchId={MATCH_ID}
        region="VIC_MELBOURNE"
        serviceType="SUPPORT_COORDINATION"
        summary={privateSummary}
        contact={{ name: "Person A", phone: privatePhone, email: null }}
      />,
    );

    expect(preAccept).not.toContain("VIC_MELBOURNE");
    expect(preAccept).toContain("Melbourne / 墨尔本");
    expect(preAccept).not.toContain(privateSummary);
    expect(preAccept).not.toContain(privatePhone);
    expect(preAccept).toContain("Private summary and contact stay hidden");
    expect(accepted).toContain(privateSummary);
    expect(accepted).toContain(privatePhone);
  });

  it.each<{
    mutation: PortalReferralMutation;
    url: string;
    body: unknown;
  }>([
    {
      mutation: {
        kind: "CREATE_REFERRAL",
        region: "VIC_MELBOURNE",
        serviceType: "SUPPORT_COORDINATION",
        summary: "Needs support coordination.",
        contact: { name: "Person A", phone: "0400000000", email: null },
      },
      url: "/api/portal/referrals",
      body: {
        region: "VIC_MELBOURNE",
        serviceType: "SUPPORT_COORDINATION",
        summary: "Needs support coordination.",
        contact: { name: "Person A", phone: "0400000000", email: null },
      },
    },
    {
      mutation: {
        kind: "TRIAGE_REFERRAL",
        referralId: REFERRAL_ID,
        expectedVersion: 1,
      },
      url: `/api/portal/referrals/${REFERRAL_ID}/triage`,
      body: { expectedVersion: 1 },
    },
    {
      mutation: {
        kind: "OFFER_REFERRAL",
        referralId: REFERRAL_ID,
        providerId: PROVIDER_ID,
        expectedVersion: 2,
      },
      url: `/api/portal/referrals/${REFERRAL_ID}/offers`,
      body: { providerId: PROVIDER_ID, expectedVersion: 2 },
    },
    {
      mutation: {
        kind: "RESPOND_TO_OFFER",
        matchId: MATCH_ID,
        expectedVersion: 3,
        decision: "ACCEPT",
      },
      url: `/api/portal/referral-offers/${MATCH_ID}/response`,
      body: { decision: "ACCEPT", expectedVersion: 3 },
    },
    {
      mutation: {
        kind: "RECORD_FOLLOW_UP",
        referralId: REFERRAL_ID,
        expectedVersion: 4,
        outcomeCode: "CONTACT_CONFIRMED",
      },
      url: `/api/portal/referrals/${REFERRAL_ID}/follow-ups`,
      body: { outcomeCode: "CONTACT_CONFIRMED", expectedVersion: 4 },
    },
  ])("builds the reviewed $mutation.kind request", ({ mutation, url, body }) => {
    const request = createPortalReferralMutationRequest(mutation, MUTATION_ID);
    const headers = new Headers(request.init.headers);

    expect(request.url).toBe(url);
    expect(request.init.method).toBe("POST");
    expect(request.init.credentials).toBe("same-origin");
    expect(request.init.cache).toBe("no-store");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("idempotency-key")).toBe(MUTATION_ID);
    expect(JSON.parse(request.init.body as string)).toEqual(body);
    expect(request.init.body).not.toContain("ownerId");
    expect(request.init.body).not.toContain("actorUserId");
  });

  it("fails before fetch while disabled", async () => {
    const fetcher = vi.fn();
    const result = await submitPortalReferralMutation({
      mutation: {
        kind: "TRIAGE_REFERRAL",
        referralId: REFERRAL_ID,
        expectedVersion: 1,
      },
      idempotencyKey: MUTATION_ID,
      fetcher,
    });

    expect(result).toEqual({ ok: false, code: "CAPABILITY_DISABLED" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not parse or reflect server error messages", async () => {
    const serverSecret = "private-contact-and-token";
    const json = vi.fn(async () => ({
      error: { message: serverSecret },
    }));
    const result = await submitPortalReferralMutation({
      enabled: true,
      mutation: {
        kind: "TRIAGE_REFERRAL",
        referralId: REFERRAL_ID,
        expectedVersion: 1,
      },
      idempotencyKey: MUTATION_ID,
      fetcher: vi.fn(async () => ({ ok: false, status: 409, json })),
    });

    expect(result).toEqual({ ok: false, code: "CONFLICT" });
    expect(JSON.stringify(result)).not.toContain(serverSecret);
    expect(json).not.toHaveBeenCalled();
  });

  it("whitelists metadata-only fields from a successful ACK", async () => {
    const serverSecret = "private-summary-from-server";
    const result = await submitPortalReferralMutation({
      enabled: true,
      mutation: {
        kind: "TRIAGE_REFERRAL",
        referralId: REFERRAL_ID,
        expectedVersion: 1,
      },
      idempotencyKey: MUTATION_ID,
      fetcher: vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          referralId: REFERRAL_ID,
          matchId: null,
          currentStatus: "TRIAGED",
          rowVersion: 2,
          updatedAt: "2026-08-16T00:00:00.000Z",
          summary: serverSecret,
        }),
      })),
    });

    expect(result).toEqual({
      ok: true,
      ack: {
        referralId: REFERRAL_ID,
        matchId: null,
        currentStatus: "TRIAGED",
        rowVersion: 2,
        updatedAt: "2026-08-16T00:00:00.000Z",
      },
    });
    expect(JSON.stringify(result)).not.toContain(serverSecret);
  });
});
