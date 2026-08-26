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
  PORTAL_REFERRAL_PROVIDER_RESPONSE_REQUEST_TIMEOUT_MS,
  PortalReferralProviderResponseCoordinator,
  createPortalReferralProviderResponseRequestTracker,
  loadPortalReferralProviderOffers,
  portalReferralProviderResponseClearsOffers,
  portalReferralProviderResponseRequiresAuthoritativeRefresh,
  submitPortalReferralProviderResponse,
  type PortalReferralProviderOffer,
} from "./portal-referral-provider-response-controls";

const MATCH_A = "a1111111-1111-4111-8111-111111111111";
const MATCH_B = "b1111111-1111-4111-8111-111111111111";
const REFERRAL_A = "c1111111-1111-4111-8111-111111111111";
const REFERRAL_B = "d1111111-1111-4111-8111-111111111111";
const MUTATION_ID = "portal.provider-response.accept:test-0001";
const UPDATED_AT = "2026-08-26T01:00:00.000Z";

describe("Portal referral provider response controls", () => {
  it("renders a request-free closed boundary and makes zero disabled requests", async () => {
    const markup = renderToStaticMarkup(
      <PortalReferralProviderResponseCoordinator />,
    );
    const fetcher = vi.fn();

    expect(markup).toContain("runtime is disabled");
    expect(markup).toContain("No offer request is sent");
    expect(markup).not.toContain("Accept / 接受");
    await expect(
      loadPortalReferralProviderOffers({ fetcher }),
    ).resolves.toEqual({ ok: false, code: "CAPABILITY_DISABLED" });
    await expect(
      submitPortalReferralProviderResponse({
        offer: validOffer(),
        decision: "ACCEPT",
        idempotencyKey: MUTATION_ID,
        fetcher,
      }),
    ).resolves.toEqual({ ok: false, code: "CAPABILITY_DISABLED" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("loads at most 50 exact seven-field offers with same-origin no-store", async () => {
    const offered = validOffer();
    const accepted = validOffer({
      matchId: MATCH_B,
      referralId: REFERRAL_B,
      matchStatus: "ACCEPTED",
      currentStatus: "IN_PROGRESS",
      rowVersion: 4,
    });
    const fetcher = vi.fn(async () => okJson({ items: [offered, accepted] }));

    await expect(
      loadPortalReferralProviderOffers({ enabled: true, fetcher }),
    ).resolves.toEqual({ ok: true, items: [offered, accepted] });
    expect(fetcher).toHaveBeenCalledWith("/api/portal/referral-offers", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: expect.anything(),
    });
    expect(Object.keys(offered).sort()).toEqual(
      [
        "matchId",
        "referralId",
        "region",
        "serviceType",
        "matchStatus",
        "currentStatus",
        "rowVersion",
      ].sort(),
    );
  });

  it("bounds both a never-resolving fetch and a never-resolving success body", async () => {
    vi.useFakeTimers();
    try {
      const transportResult = loadPortalReferralProviderOffers({
        enabled: true,
        fetcher: vi.fn(
          () =>
            new Promise<Pick<Response, "ok" | "status" | "json">>(() =>
              undefined,
            ),
        ),
      });
      const bodyResult = loadPortalReferralProviderOffers({
        enabled: true,
        fetcher: vi.fn(async () => ({
          ok: true,
          status: 200,
          json: () => new Promise<unknown>(() => undefined),
        })),
      });

      await vi.advanceTimersByTimeAsync(
        PORTAL_REFERRAL_PROVIDER_RESPONSE_REQUEST_TIMEOUT_MS,
      );
      await expect(Promise.all([transportResult, bodyResult])).resolves.toEqual([
        { ok: false, code: "REQUEST_FAILED" },
        { ok: false, code: "REQUEST_FAILED" },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    { items: [validOffer()], extra: "unsafe" },
    { items: [{ ...validOffer(), extra: "unsafe" }] },
    { items: [{ ...validOffer(), matchId: MATCH_A.toUpperCase() }] },
    { items: [validOffer(), validOffer()] },
    {
      items: [
        validOffer(),
        validOffer({ matchId: MATCH_B, referralId: REFERRAL_A }),
      ],
    },
    {
      items: [
        validOffer({ matchStatus: "OFFERED", currentStatus: "ACCEPTED" }),
      ],
    },
    { items: [validOffer({ rowVersion: 0 })] },
    { items: [validOffer({ region: "NSW_SYDNEY" as never })] },
    {
      items: Array.from({ length: 51 }, (_, index) =>
        validOffer({
          matchId: `10000000-0000-4000-8000-${index
            .toString(16)
            .padStart(12, "0")}`,
          referralId: `20000000-0000-4000-8000-${index
            .toString(16)
            .padStart(12, "0")}`,
        }),
      ),
    },
  ])("fails closed on an unsafe offer envelope %#", async (body) => {
    await expect(
      loadPortalReferralProviderOffers({
        enabled: true,
        fetcher: vi.fn(async () => okJson(body)),
      }),
    ).resolves.toEqual({ ok: false, code: "REQUEST_FAILED" });
  });

  it("never parses private error bodies and maps authorization failures", async () => {
    const json = vi.fn(async () => ({ summary: "private", phone: "0400000000" }));
    const fetcher = vi.fn(async () => ({ ok: false, status: 403, json }));

    await expect(
      loadPortalReferralProviderOffers({ enabled: true, fetcher }),
    ).resolves.toEqual({ ok: false, code: "FORBIDDEN" });
    await expect(
      submitPortalReferralProviderResponse({
        enabled: true,
        offer: validOffer(),
        decision: "ACCEPT",
        idempotencyKey: MUTATION_ID,
        fetcher,
      }),
    ).resolves.toEqual({ ok: false, code: "FORBIDDEN" });
    expect(json).not.toHaveBeenCalled();
  });

  it("submits exact accept and decline requests and accepts only expected+1 ACKs", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        okJson({
          referralId: REFERRAL_A,
          matchId: MATCH_A,
          currentStatus: "ACCEPTED",
          rowVersion: 4,
          updatedAt: UPDATED_AT,
        }),
      )
      .mockResolvedValueOnce(
        okJson({
          referralId: REFERRAL_A,
          matchId: MATCH_A,
          currentStatus: "TRIAGED",
          rowVersion: 4,
          updatedAt: UPDATED_AT,
        }),
      );

    const accepted = await submitPortalReferralProviderResponse({
      enabled: true,
      offer: validOffer(),
      decision: "ACCEPT",
      idempotencyKey: MUTATION_ID,
      fetcher,
    });
    const declined = await submitPortalReferralProviderResponse({
      enabled: true,
      offer: validOffer(),
      decision: "DECLINE",
      idempotencyKey: `${MUTATION_ID}:decline`,
      fetcher,
    });

    expect(accepted).toMatchObject({
      ok: true,
      ack: { currentStatus: "ACCEPTED", rowVersion: 4 },
    });
    expect(declined).toMatchObject({
      ok: true,
      ack: { currentStatus: "TRIAGED", rowVersion: 4 },
    });
    for (const [index, call] of fetcher.mock.calls.entries()) {
      expect(call[0]).toBe(
        `/api/portal/referral-offers/${MATCH_A}/response`,
      );
      expect(call[1]).toMatchObject({
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      expect(JSON.parse(call[1]?.body as string)).toEqual({
        decision: index === 0 ? "ACCEPT" : "DECLINE",
        expectedVersion: 3,
      });
      expect(new Headers(call[1]?.headers).get("idempotency-key")).toBe(
        index === 0 ? MUTATION_ID : `${MUTATION_ID}:decline`,
      );
    }
  });

  it.each([
    {
      referralId: REFERRAL_A,
      matchId: MATCH_A,
      currentStatus: "ACCEPTED",
      rowVersion: 4,
      updatedAt: UPDATED_AT,
      extra: "unsafe",
    },
    {
      referralId: REFERRAL_B,
      matchId: MATCH_A,
      currentStatus: "ACCEPTED",
      rowVersion: 4,
      updatedAt: UPDATED_AT,
    },
    {
      referralId: REFERRAL_A,
      matchId: MATCH_B,
      currentStatus: "ACCEPTED",
      rowVersion: 4,
      updatedAt: UPDATED_AT,
    },
    {
      referralId: REFERRAL_A,
      matchId: MATCH_A,
      currentStatus: "TRIAGED",
      rowVersion: 4,
      updatedAt: UPDATED_AT,
    },
    {
      referralId: REFERRAL_A,
      matchId: MATCH_A,
      currentStatus: "ACCEPTED",
      rowVersion: 5,
      updatedAt: UPDATED_AT,
    },
    {
      referralId: REFERRAL_A,
      matchId: MATCH_A,
      currentStatus: "ACCEPTED",
      rowVersion: 4,
      updatedAt: "2026-08-26T11:00:00+10:00",
    },
  ])("rejects an unsafe response ACK %#", async (body) => {
    await expect(
      submitPortalReferralProviderResponse({
        enabled: true,
        offer: validOffer(),
        decision: "ACCEPT",
        idempotencyKey: MUTATION_ID,
        fetcher: vi.fn(async () => okJson(body)),
      }),
    ).resolves.toEqual({ ok: false, code: "REQUEST_FAILED" });
  });

  it("does not mutate accepted offers or terminal offered versions", async () => {
    const fetcher = vi.fn();
    for (const offer of [
      validOffer({
        matchStatus: "ACCEPTED",
        currentStatus: "ACCEPTED",
        rowVersion: 4,
      }),
      validOffer({ rowVersion: Number.MAX_SAFE_INTEGER }),
    ]) {
      await expect(
        submitPortalReferralProviderResponse({
          enabled: true,
          offer,
          decision: "ACCEPT",
          idempotencyKey: MUTATION_ID,
          fetcher,
        }),
      ).resolves.toEqual({ ok: false, code: "REQUEST_FAILED" });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refreshes after success/conflict/uncertainty and clears every authorization boundary", () => {
    expect(
      portalReferralProviderResponseRequiresAuthoritativeRefresh({
        ok: true,
        ack: {
          referralId: REFERRAL_A,
          matchId: MATCH_A,
          currentStatus: "ACCEPTED",
          rowVersion: 4,
          updatedAt: UPDATED_AT,
        },
      }),
    ).toBe(true);
    for (const code of ["NOT_FOUND", "CONFLICT", "REQUEST_FAILED"] as const) {
      expect(
        portalReferralProviderResponseRequiresAuthoritativeRefresh({
          ok: false,
          code,
        }),
      ).toBe(true);
    }
    for (const code of [
      "AUTH_REQUIRED",
      "FORBIDDEN",
      "CAPABILITY_DISABLED",
    ] as const) {
      const result = { ok: false, code } as const;
      expect(portalReferralProviderResponseClearsOffers(result)).toBe(true);
      expect(
        portalReferralProviderResponseRequiresAuthoritativeRefresh(result),
      ).toBe(false);
    }
  });

  it("invalidates stale A and B tokens across A → B → A", () => {
    const tracker = createPortalReferralProviderResponseRequestTracker();
    const firstA = tracker.begin(MATCH_A);
    const middleB = tracker.begin(MATCH_B);
    const currentA = tracker.begin(MATCH_A);

    expect(tracker.isCurrent(firstA)).toBe(false);
    expect(tracker.isCurrent(middleB)).toBe(false);
    expect(tracker.isCurrent(currentA)).toBe(true);
    tracker.invalidate();
    expect(tracker.isCurrent(currentA)).toBe(false);
  });
});

function validOffer(
  overrides: Partial<PortalReferralProviderOffer> = {},
): PortalReferralProviderOffer {
  return {
    matchId: MATCH_A,
    referralId: REFERRAL_A,
    region: "VIC_MELBOURNE",
    serviceType: "SUPPORT_COORDINATION",
    matchStatus: "OFFERED",
    currentStatus: "OFFERED",
    rowVersion: 3,
    ...overrides,
  };
}

function okJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}
