import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./ui", async () => {
  const React = await import("react");
  return {
    Card: ({ children }: { children: React.ReactNode }) =>
      React.createElement("section", null, children),
  };
});

import {
  PORTAL_REFERRAL_PROVIDER_FOLLOW_UP_OUTCOME_CODES,
  PORTAL_REFERRAL_PROVIDER_FOLLOW_UP_REQUEST_TIMEOUT_MS,
  PortalReferralProviderFollowUpCoordinator,
  createPortalReferralProviderFollowUpRequestTracker,
  loadPortalReferralProviderFollowUpDetail,
  portalReferralProviderFollowUpClearsDetail,
  portalReferralProviderFollowUpRequiresAuthoritativeRefresh,
  submitPortalReferralProviderFollowUp,
  type PortalReferralProviderFollowUpDetail,
} from "./portal-referral-provider-follow-up-controls";

const REFERRAL_A = "a1111111-1111-4111-8111-111111111111";
const REFERRAL_B = "b1111111-1111-4111-8111-111111111111";
const UPDATED_AT = "2026-08-26T01:00:00.000Z";
const IDEMPOTENCY_KEY = "portal.provider-follow-up:test-0001";

describe("Portal referral provider follow-up controls", () => {
  it("renders a request-free closed boundary and makes zero disabled requests", async () => {
    const markup = renderToStaticMarkup(
      <PortalReferralProviderFollowUpCoordinator referralId={REFERRAL_A} />,
    );
    const fetcher = vi.fn();

    expect(markup).toContain("runtime is disabled");
    expect(markup).toContain("No private referral request is sent");
    await expect(
      loadPortalReferralProviderFollowUpDetail({
        referralId: REFERRAL_A,
        fetcher,
      }),
    ).resolves.toEqual({ ok: false, code: "CAPABILITY_DISABLED" });
    await expect(
      submitPortalReferralProviderFollowUp({
        detail: validDetail(),
        outcomeCode: "CONTACT_CONFIRMED",
        idempotencyKey: IDEMPOTENCY_KEY,
        fetcher,
      }),
    ).resolves.toEqual({ ok: false, code: "CAPABILITY_DISABLED" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("loads one exact private detail with same-origin no-store", async () => {
    const detail = validDetail();
    const fetcher = vi.fn(async () => okJson({ referral: detail }));

    await expect(
      loadPortalReferralProviderFollowUpDetail({
        enabled: true,
        referralId: REFERRAL_A,
        fetcher,
      }),
    ).resolves.toEqual({ ok: true, detail });
    expect(fetcher).toHaveBeenCalledWith(
      `/api/portal/provider-referrals/${REFERRAL_A}`,
      {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: expect.anything(),
      },
    );
  });

  it.each([
    { referral: validDetail(), extra: "unsafe" },
    { referral: { ...validDetail(), extra: "unsafe" } },
    { referral: { ...validDetail(), referralId: REFERRAL_A.toUpperCase() } },
    { referral: { ...validDetail(), currentStatus: "COMPLETED" } },
    { referral: { ...validDetail(), rowVersion: 0 } },
    { referral: { ...validDetail(), region: "NSW_SYDNEY" } },
    { referral: { ...validDetail(), contact: { ...validDetail().contact, fax: "x" } } },
    { referral: { ...validDetail(), updatedAt: "2026-08-26T11:00:00+10:00" } },
  ])("fails closed on an unsafe detail envelope %#", async (body) => {
    await expect(
      loadPortalReferralProviderFollowUpDetail({
        enabled: true,
        referralId: REFERRAL_A,
        fetcher: vi.fn(async () => okJson(body)),
      }),
    ).resolves.toEqual({ ok: false, code: "REQUEST_FAILED" });
  });

  it("rejects invalid or non-canonical resource IDs before fetch", async () => {
    const fetcher = vi.fn();
    for (const referralId of ["legacy-referral", REFERRAL_A.toUpperCase()]) {
      await expect(
        loadPortalReferralProviderFollowUpDetail({
          enabled: true,
          referralId,
          fetcher,
        }),
      ).resolves.toEqual({ ok: false, code: "NOT_FOUND" });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("bounds both a never-resolving fetch and success body", async () => {
    vi.useFakeTimers();
    try {
      const transportResult = loadPortalReferralProviderFollowUpDetail({
        enabled: true,
        referralId: REFERRAL_A,
        fetcher: vi.fn(
          () =>
            new Promise<Pick<Response, "ok" | "status" | "json">>(() =>
              undefined,
            ),
        ),
      });
      const bodyResult = loadPortalReferralProviderFollowUpDetail({
        enabled: true,
        referralId: REFERRAL_A,
        fetcher: vi.fn(async () => ({
          ok: true,
          status: 200,
          json: () => new Promise(() => undefined),
        })),
      });

      await vi.advanceTimersByTimeAsync(
        PORTAL_REFERRAL_PROVIDER_FOLLOW_UP_REQUEST_TIMEOUT_MS,
      );
      await expect(Promise.all([transportResult, bodyResult])).resolves.toEqual([
        { ok: false, code: "REQUEST_FAILED" },
        { ok: false, code: "REQUEST_FAILED" },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never parses private error bodies and maps response status", async () => {
    const json = vi.fn(async () => ({ summary: "private", phone: "0400000000" }));
    const fetcher = vi.fn(async () => ({ ok: false, status: 401, json }));

    await expect(
      loadPortalReferralProviderFollowUpDetail({
        enabled: true,
        referralId: REFERRAL_A,
        fetcher,
      }),
    ).resolves.toEqual({ ok: false, code: "AUTH_REQUIRED" });
    await expect(
      submitPortalReferralProviderFollowUp({
        enabled: true,
        detail: validDetail(),
        outcomeCode: "CONTACT_CONFIRMED",
        idempotencyKey: IDEMPOTENCY_KEY,
        fetcher,
      }),
    ).resolves.toEqual({ ok: false, code: "AUTH_REQUIRED" });
    expect(json).not.toHaveBeenCalled();
  });

  it.each(PORTAL_REFERRAL_PROVIDER_FOLLOW_UP_OUTCOME_CODES)(
    "submits exact %s command and accepts only the strict expected+1 ACK",
    async (outcomeCode) => {
      const fetcher = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          void input;
          void init;
          return okJson({
            referralId: REFERRAL_A,
            matchId: null,
            currentStatus: "IN_PROGRESS",
            rowVersion: 4,
            updatedAt: UPDATED_AT,
          });
        },
      );

      await expect(
        submitPortalReferralProviderFollowUp({
          enabled: true,
          detail: validDetail(),
          outcomeCode,
          idempotencyKey: IDEMPOTENCY_KEY,
          fetcher,
        }),
      ).resolves.toMatchObject({ ok: true, ack: { rowVersion: 4 } });
      const [url, init] = fetcher.mock.calls[0];
      expect(url).toBe(`/api/portal/referrals/${REFERRAL_A}/follow-ups`);
      expect(init).toMatchObject({
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      expect(JSON.parse(init?.body as string)).toEqual({
        outcomeCode,
        expectedVersion: 3,
      });
      expect(new Headers(init?.headers).get("idempotency-key")).toBe(
        IDEMPOTENCY_KEY,
      );
    },
  );

  it.each([
    { referralId: REFERRAL_A, matchId: null, currentStatus: "IN_PROGRESS", rowVersion: 4, updatedAt: UPDATED_AT, extra: "unsafe" },
    { referralId: REFERRAL_B, matchId: null, currentStatus: "IN_PROGRESS", rowVersion: 4, updatedAt: UPDATED_AT },
    { referralId: REFERRAL_A, matchId: REFERRAL_B, currentStatus: "IN_PROGRESS", rowVersion: 4, updatedAt: UPDATED_AT },
    { referralId: REFERRAL_A, matchId: null, currentStatus: "ACCEPTED", rowVersion: 4, updatedAt: UPDATED_AT },
    { referralId: REFERRAL_A, matchId: null, currentStatus: "IN_PROGRESS", rowVersion: 5, updatedAt: UPDATED_AT },
  ])("rejects an unsafe follow-up ACK %#", async (body) => {
    await expect(
      submitPortalReferralProviderFollowUp({
        enabled: true,
        detail: validDetail(),
        outcomeCode: "NO_RESPONSE",
        idempotencyKey: IDEMPOTENCY_KEY,
        fetcher: vi.fn(async () => okJson(body)),
      }),
    ).resolves.toEqual({ ok: false, code: "REQUEST_FAILED" });
  });

  it("refreshes uncertain/stale writes and clears authorization failures", () => {
    for (const code of ["NOT_FOUND", "CONFLICT", "REQUEST_FAILED"] as const) {
      expect(
        portalReferralProviderFollowUpRequiresAuthoritativeRefresh({ ok: false, code }),
      ).toBe(true);
    }
    for (const code of ["AUTH_REQUIRED", "FORBIDDEN", "CAPABILITY_DISABLED"] as const) {
      const result = { ok: false, code } as const;
      expect(portalReferralProviderFollowUpClearsDetail(result)).toBe(true);
      expect(portalReferralProviderFollowUpRequiresAuthoritativeRefresh(result)).toBe(false);
    }
  });

  it("keeps tokens resource-only and invalidates them across A → B → A", () => {
    const tracker = createPortalReferralProviderFollowUpRequestTracker();
    const firstA = tracker.begin(REFERRAL_A);
    const middleB = tracker.begin(REFERRAL_B);
    const currentA = tracker.begin(REFERRAL_A);

    expect(firstA.resourceId).toBe(REFERRAL_A);
    expect(middleB.resourceId).toBe(REFERRAL_B);
    expect(currentA.resourceId).toBe(REFERRAL_A);
    expect(Object.keys(firstA).sort()).toEqual(["generation", "resourceId"]);
    expect(tracker.isCurrent(firstA)).toBe(false);
    expect(tracker.isCurrent(middleB)).toBe(false);
    expect(tracker.isCurrent(currentA)).toBe(true);
    tracker.invalidate();
    expect(tracker.isCurrent(currentA)).toBe(false);
  });
});

function validDetail(
  overrides: Partial<PortalReferralProviderFollowUpDetail> = {},
): PortalReferralProviderFollowUpDetail {
  return {
    referralId: REFERRAL_A,
    summary: "Private participant summary",
    region: "VIC_MELBOURNE",
    serviceType: "SUPPORT_COORDINATION",
    currentStatus: "ACCEPTED",
    rowVersion: 3,
    contact: { name: "Participant A", phone: "0400 000 000", email: null },
    createdAt: "2026-08-25T01:00:00.000Z",
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function okJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}
