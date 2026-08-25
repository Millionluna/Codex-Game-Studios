import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  PortalReferralAssignmentCoordinator,
  PortalReferralAssignmentQueue,
  applyPortalReferralAssignmentMutationAck,
  createPortalReferralAssignmentRequestTracker,
  loadPortalReferralAssignmentCandidates,
  loadPortalReferralAssignmentDetail,
  loadPortalReferralAssignmentQueue,
  portalReferralAssignmentActionStage,
  portalReferralAssignmentCandidateFailureInvalidatesDetail,
  portalReferralAssignmentCandidateFailureRequiresDetailRefresh,
  portalReferralAssignmentDetailAfterCandidateResult,
  portalReferralAssignmentFailureRequiresRefresh,
  portalReferralAssignmentMutationFailureRequiresDetailRefresh,
  selectPortalReferralAssignmentKeyedResult,
  submitPortalReferralAssignmentMutation,
  type PortalReferralAssignmentDetail,
} from "./portal-referral-assignment-controls";

const REFERRAL_ID = "a1111111-1111-4111-8111-111111111111";
const OTHER_REFERRAL_ID = "b1111111-1111-7111-8111-111111111111";
const ORGANIZATION_ID = "c2222222-2222-4222-8222-222222222222";
const PROVIDER_ID = "d3333333-3333-4333-8333-333333333333";
const MATCH_ID = "e4444444-4444-4444-8444-444444444444";
const CREATED_AT = "2026-08-25T01:00:00.000Z";
const UPDATED_AT = "2026-08-25T02:00:00.000Z";
const NEXT_UPDATED_AT = "2026-08-25T03:00:00.000Z";
const MUTATION_ID = "portal.assignment:test-mutation-0001";

describe("Portal referral assignment controls", () => {
  it("renders request-free closed boundaries without private assignment data", () => {
    const queue = renderToStaticMarkup(<PortalReferralAssignmentQueue />);
    const detail = renderToStaticMarkup(
      <PortalReferralAssignmentCoordinator referralId={REFERRAL_ID} />,
    );

    expect(queue).toContain("No queue request is sent");
    expect(queue).not.toContain("Loading authorized assignment queue");
    expect(detail).toContain("No assignment request is");
    expect(detail).not.toContain("Loading authorized assignment detail");
    expect(detail).not.toContain(validDetail().summary);
    expect(detail).not.toContain(validDetail().contact.phone);
  });

  it("makes zero requests while disabled and rejects invalid resource ids before fetch", async () => {
    const fetcher = vi.fn();

    await expect(
      loadPortalReferralAssignmentQueue({ fetcher }),
    ).resolves.toEqual({ ok: false, code: "CAPABILITY_DISABLED" });
    await expect(
      loadPortalReferralAssignmentDetail({
        referralId: REFERRAL_ID,
        fetcher,
      }),
    ).resolves.toEqual({ ok: false, code: "CAPABILITY_DISABLED" });
    await expect(
      loadPortalReferralAssignmentCandidates({
        referralId: REFERRAL_ID,
        fetcher,
      }),
    ).resolves.toEqual({ ok: false, code: "CAPABILITY_DISABLED" });
    await expect(
      submitPortalReferralAssignmentMutation({
        mutation: {
          kind: "TRIAGE_REFERRAL",
          referralId: REFERRAL_ID,
          expectedVersion: 1,
        },
        idempotencyKey: MUTATION_ID,
        fetcher,
      }),
    ).resolves.toEqual({ ok: false, code: "CAPABILITY_DISABLED" });
    await expect(
      loadPortalReferralAssignmentDetail({
        enabled: true,
        referralId: "mock-referral-id",
        fetcher,
      }),
    ).resolves.toEqual({ ok: false, code: "REQUEST_FAILED" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("loads an exact metadata-only assignment queue with same-origin no-store", async () => {
    const item = validQueueItem();
    const fetcher = vi.fn(async () => okJson({ items: [item] }));

    await expect(
      loadPortalReferralAssignmentQueue({ enabled: true, fetcher }),
    ).resolves.toEqual({ ok: true, items: [item] });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/portal/referral-assignments",
      {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { accept: "application/json" },
      },
    );
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain("summary");
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain("contact");
  });

  it.each([
    { items: [validQueueItem()], extra: "unsafe" },
    { items: [{ ...validQueueItem(), extra: "unsafe" }] },
    {
      items: [
        { ...validQueueItem(), referralId: REFERRAL_ID.toUpperCase() },
      ],
    },
    { items: [validQueueItem(), validQueueItem()] },
    { items: [{ ...validQueueItem(), currentStatus: "ACCEPTED" }] },
    { items: [{ ...validQueueItem(), rowVersion: 0 }] },
    { items: [{ ...validQueueItem(), updatedAt: "2026-08-25T12:00:00+10:00" }] },
    {
      items: Array.from({ length: 51 }, (_, index) => ({
        ...validQueueItem(),
        referralId: `50000000-0000-4000-8000-${index
          .toString(16)
          .padStart(12, "0")}`,
      })),
    },
  ])("fails closed on unsafe queue envelope %#", async (body) => {
    const result = await loadPortalReferralAssignmentQueue({
      enabled: true,
      fetcher: vi.fn(async () => okJson(body)),
    });

    expect(result).toEqual({ ok: false, code: "REQUEST_FAILED" });
  });

  it("loads one exact assignment detail bound to the requested referral", async () => {
    const detail = validDetail();
    const fetcher = vi.fn(async () => okJson({ referral: detail }));

    await expect(
      loadPortalReferralAssignmentDetail({
        enabled: true,
        referralId: REFERRAL_ID,
        fetcher,
      }),
    ).resolves.toEqual({ ok: true, detail });
    expect(fetcher).toHaveBeenCalledWith(
      `/api/portal/referral-assignments/${REFERRAL_ID}`,
      {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { accept: "application/json" },
      },
    );
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain(detail.summary);
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain(detail.contact.phone);
  });

  it.each([
    { referral: validDetail(), extra: "unsafe" },
    { referral: { ...validDetail(), extra: "unsafe" } },
    {
      referral: {
        ...validDetail(),
        contact: { ...validDetail().contact, extra: "unsafe" },
      },
    },
    { referral: { ...validDetail(), referralId: OTHER_REFERRAL_ID } },
    { referral: { ...validDetail(), referralId: REFERRAL_ID.toUpperCase() } },
    { referral: { ...validDetail(), summary: ` ${validDetail().summary}` } },
    { referral: { ...validDetail(), rowVersion: 0 } },
    { referral: { ...validDetail(), currentStatus: "ACCEPTED" } },
    {
      referral: {
        ...validDetail(),
        createdAt: NEXT_UPDATED_AT,
        updatedAt: UPDATED_AT,
      },
    },
    {
      referral: { ...validDetail(), currentStatus: "OFFERED", activeOffer: null },
    },
    {
      referral: {
        ...validDetail(),
        activeOffer: validActiveOffer(),
      },
    },
    {
      referral: {
        ...validDetail("OFFERED"),
        activeOffer: { ...validActiveOffer(), extra: "unsafe" },
      },
    },
    {
      referral: {
        ...validDetail("OFFERED"),
        activeOffer: { ...validActiveOffer(), offeredAt: CREATED_AT },
        createdAt: UPDATED_AT,
      },
    },
  ])("fails closed on unsafe detail envelope %#", async (body) => {
    const result = await loadPortalReferralAssignmentDetail({
      enabled: true,
      referralId: REFERRAL_ID,
      fetcher: vi.fn(async () => okJson(body)),
    });

    expect(result).toEqual({ ok: false, code: "REQUEST_FAILED" });
    expect(JSON.stringify(result)).not.toContain(validDetail().contact.phone);
  });

  it("loads candidates containing only unique provider ids and display names", async () => {
    const candidate = { providerId: PROVIDER_ID, displayName: "Provider A" };
    const fetcher = vi.fn(async () => okJson({ items: [candidate] }));

    await expect(
      loadPortalReferralAssignmentCandidates({
        enabled: true,
        referralId: REFERRAL_ID,
        fetcher,
      }),
    ).resolves.toEqual({ ok: true, items: [candidate] });
    expect(fetcher).toHaveBeenCalledWith(
      `/api/portal/referrals/${REFERRAL_ID}/candidates`,
      {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { accept: "application/json" },
      },
    );
    expect(JSON.stringify(await fetcher.mock.results[0]?.value)).not.toContain(
      "score",
    );
  });

  it.each([
    {
      items: [
        { providerId: PROVIDER_ID, displayName: "Provider A", score: 100 },
      ],
    },
    {
      items: [
        { providerId: PROVIDER_ID, displayName: "Provider A" },
        { providerId: PROVIDER_ID, displayName: "Provider B" },
      ],
    },
    {
      items: [
        { providerId: PROVIDER_ID.toUpperCase(), displayName: "Provider A" },
      ],
    },
    {
      items: [{ providerId: PROVIDER_ID, displayName: " Provider A" }],
    },
    {
      items: Array.from({ length: 51 }, (_, index) => ({
        providerId: `60000000-0000-4000-8000-${index
          .toString(16)
          .padStart(12, "0")}`,
        displayName: `Provider ${index}`,
      })),
    },
  ])("rejects unsafe candidate envelope %#", async (body) => {
    const result = await loadPortalReferralAssignmentCandidates({
      enabled: true,
      referralId: REFERRAL_ID,
      fetcher: vi.fn(async () => okJson(body)),
    });

    expect(result).toEqual({ ok: false, code: "REQUEST_FAILED" });
  });

  it("never parses error response bodies for queue, detail, candidates or mutations", async () => {
    const json = vi.fn(async () => ({ privateContact: "0400999999" }));
    const fetcher = vi.fn(async () => ({ ok: false, status: 403, json }));

    await expect(
      loadPortalReferralAssignmentQueue({ enabled: true, fetcher }),
    ).resolves.toEqual({ ok: false, code: "FORBIDDEN" });
    await expect(
      loadPortalReferralAssignmentDetail({
        enabled: true,
        referralId: REFERRAL_ID,
        fetcher,
      }),
    ).resolves.toEqual({ ok: false, code: "FORBIDDEN" });
    await expect(
      loadPortalReferralAssignmentCandidates({
        enabled: true,
        referralId: REFERRAL_ID,
        fetcher,
      }),
    ).resolves.toEqual({ ok: false, code: "FORBIDDEN" });
    await expect(
      submitPortalReferralAssignmentMutation({
        enabled: true,
        mutation: {
          kind: "TRIAGE_REFERRAL",
          referralId: REFERRAL_ID,
          expectedVersion: 1,
        },
        idempotencyKey: MUTATION_ID,
        fetcher,
      }),
    ).resolves.toEqual({ ok: false, code: "FORBIDDEN" });
    expect(json).not.toHaveBeenCalled();
  });

  it("submits exact triage and offer requests and accepts only expected+1 ACKs", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        okJson({
          referralId: REFERRAL_ID,
          matchId: null,
          currentStatus: "TRIAGED",
          rowVersion: 2,
          updatedAt: NEXT_UPDATED_AT,
        }),
      )
      .mockResolvedValueOnce(
        okJson({
          referralId: REFERRAL_ID,
          matchId: MATCH_ID,
          currentStatus: "OFFERED",
          rowVersion: 3,
          updatedAt: "2026-08-25T04:00:00.000Z",
        }),
      );

    const triage = await submitPortalReferralAssignmentMutation({
      enabled: true,
      mutation: {
        kind: "TRIAGE_REFERRAL",
        referralId: REFERRAL_ID,
        expectedVersion: 1,
      },
      idempotencyKey: MUTATION_ID,
      fetcher,
    });
    const offer = await submitPortalReferralAssignmentMutation({
      enabled: true,
      mutation: {
        kind: "OFFER_REFERRAL",
        referralId: REFERRAL_ID,
        providerId: PROVIDER_ID,
        expectedVersion: 2,
      },
      idempotencyKey: `${MUTATION_ID}:offer`,
      fetcher,
    });

    expect(triage).toMatchObject({
      ok: true,
      ack: { currentStatus: "TRIAGED", rowVersion: 2, matchId: null },
    });
    expect(offer).toMatchObject({
      ok: true,
      ack: { currentStatus: "OFFERED", rowVersion: 3, matchId: MATCH_ID },
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      `/api/portal/referrals/${REFERRAL_ID}/triage`,
    );
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      `/api/portal/referrals/${REFERRAL_ID}/offers`,
    );
    for (const call of fetcher.mock.calls) {
      expect(call[1]).toMatchObject({
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
    }
    expect(JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string)).toEqual({
      expectedVersion: 1,
    });
    expect(JSON.parse(fetcher.mock.calls[1]?.[1]?.body as string)).toEqual({
      providerId: PROVIDER_ID,
      expectedVersion: 2,
    });
  });

  it("accepts a terminal max-safe response version but never sends it as an expected version", async () => {
    const terminalQueue = validQueueItem();
    const queueResult = await loadPortalReferralAssignmentQueue({
      enabled: true,
      fetcher: vi.fn(async () =>
        okJson({
          items: [
            { ...terminalQueue, rowVersion: Number.MAX_SAFE_INTEGER },
          ],
        }),
      ),
    });
    expect(queueResult).toMatchObject({
      ok: true,
      items: [{ rowVersion: Number.MAX_SAFE_INTEGER }],
    });

    const terminalFetcher = vi.fn(async () =>
      okJson({
        referralId: REFERRAL_ID,
        matchId: null,
        currentStatus: "TRIAGED",
        rowVersion: Number.MAX_SAFE_INTEGER,
        updatedAt: NEXT_UPDATED_AT,
      }),
    );
    await expect(
      submitPortalReferralAssignmentMutation({
        enabled: true,
        mutation: {
          kind: "TRIAGE_REFERRAL",
          referralId: REFERRAL_ID,
          expectedVersion: Number.MAX_SAFE_INTEGER - 1,
        },
        idempotencyKey: `${MUTATION_ID}:terminal`,
        fetcher: terminalFetcher,
      }),
    ).resolves.toMatchObject({
      ok: true,
      ack: { rowVersion: Number.MAX_SAFE_INTEGER },
    });

    const rejectedFetcher = vi.fn();
    await expect(
      submitPortalReferralAssignmentMutation({
        enabled: true,
        mutation: {
          kind: "TRIAGE_REFERRAL",
          referralId: REFERRAL_ID,
          expectedVersion: Number.MAX_SAFE_INTEGER,
        },
        idempotencyKey: `${MUTATION_ID}:overflow`,
        fetcher: rejectedFetcher,
      }),
    ).resolves.toEqual({ ok: false, code: "REQUEST_FAILED" });
    expect(rejectedFetcher).not.toHaveBeenCalled();
  });

  it.each([
    {
      referralId: REFERRAL_ID,
      matchId: null,
      currentStatus: "TRIAGED",
      rowVersion: 2,
      updatedAt: NEXT_UPDATED_AT,
      extra: "unsafe",
    },
    {
      referralId: OTHER_REFERRAL_ID,
      matchId: null,
      currentStatus: "TRIAGED",
      rowVersion: 2,
      updatedAt: NEXT_UPDATED_AT,
    },
    {
      referralId: REFERRAL_ID,
      matchId: MATCH_ID,
      currentStatus: "TRIAGED",
      rowVersion: 2,
      updatedAt: NEXT_UPDATED_AT,
    },
    {
      referralId: REFERRAL_ID,
      matchId: null,
      currentStatus: "OFFERED",
      rowVersion: 2,
      updatedAt: NEXT_UPDATED_AT,
    },
    {
      referralId: REFERRAL_ID,
      matchId: null,
      currentStatus: "TRIAGED",
      rowVersion: 3,
      updatedAt: NEXT_UPDATED_AT,
    },
    {
      referralId: REFERRAL_ID,
      matchId: null,
      currentStatus: "TRIAGED",
      rowVersion: 2,
      updatedAt: "2026-08-25T13:00:00+10:00",
    },
  ])("rejects an unsafe mutation ACK %#", async (body) => {
    const result = await submitPortalReferralAssignmentMutation({
      enabled: true,
      mutation: {
        kind: "TRIAGE_REFERRAL",
        referralId: REFERRAL_ID,
        expectedVersion: 1,
      },
      idempotencyKey: MUTATION_ID,
      fetcher: vi.fn(async () => okJson(body)),
    });

    expect(result).toEqual({ ok: false, code: "REQUEST_FAILED" });
  });

  it("applies the consecutive triage and offer ACK versions to one detail state", () => {
    const submitted = validDetail("SUBMITTED");
    const triageMutation = {
      kind: "TRIAGE_REFERRAL",
      referralId: REFERRAL_ID,
      expectedVersion: 1,
    } as const;
    const triaged = applyPortalReferralAssignmentMutationAck({
      detail: submitted,
      mutation: triageMutation,
      result: {
        ok: true,
        ack: {
          referralId: REFERRAL_ID,
          matchId: null,
          currentStatus: "TRIAGED",
          rowVersion: 2,
          updatedAt: NEXT_UPDATED_AT,
        },
      },
    });
    expect(triaged).toMatchObject({
      currentStatus: "TRIAGED",
      rowVersion: 2,
      activeOffer: null,
    });
    expect(triaged && portalReferralAssignmentActionStage(triaged)).toBe(
      "CANDIDATES",
    );

    const candidate = { providerId: PROVIDER_ID, displayName: "Provider A" };
    const offered = applyPortalReferralAssignmentMutationAck({
      detail: triaged!,
      mutation: {
        kind: "OFFER_REFERRAL",
        referralId: REFERRAL_ID,
        providerId: PROVIDER_ID,
        expectedVersion: 2,
      },
      candidate,
      result: {
        ok: true,
        ack: {
          referralId: REFERRAL_ID,
          matchId: MATCH_ID,
          currentStatus: "OFFERED",
          rowVersion: 3,
          updatedAt: "2026-08-25T04:00:00.000Z",
        },
      },
    });
    expect(offered).toMatchObject({
      currentStatus: "OFFERED",
      rowVersion: 3,
      activeOffer: {
        matchId: MATCH_ID,
        providerId: PROVIDER_ID,
        displayName: "Provider A",
      },
    });
    expect(offered && portalReferralAssignmentActionStage(offered)).toBe(
      "ACTIVE_OFFER",
    );
    expect(portalReferralAssignmentActionStage(submitted)).toBe("TRIAGE");
  });

  it("refreshes safely after conflicts/request failures but clears authorization failures", () => {
    for (const code of ["CONFLICT", "REQUEST_FAILED"] as const) {
      expect(
        portalReferralAssignmentFailureRequiresRefresh({ ok: false, code }),
      ).toBe(true);
    }
    for (const code of [
      "AUTH_REQUIRED",
      "FORBIDDEN",
      "NOT_FOUND",
      "CAPABILITY_DISABLED",
    ] as const) {
      expect(
        portalReferralAssignmentFailureRequiresRefresh({ ok: false, code }),
      ).toBe(false);
    }

    for (const code of ["CONFLICT", "REQUEST_FAILED", "NOT_FOUND"] as const) {
      expect(
        portalReferralAssignmentMutationFailureRequiresDetailRefresh(
          { kind: "OFFER_REFERRAL" },
          { ok: false, code },
        ),
      ).toBe(true);
    }
    for (const code of [
      "AUTH_REQUIRED",
      "FORBIDDEN",
      "CAPABILITY_DISABLED",
    ] as const) {
      expect(
        portalReferralAssignmentMutationFailureRequiresDetailRefresh(
          { kind: "OFFER_REFERRAL" },
          { ok: false, code },
        ),
      ).toBe(false);
    }
    expect(
      portalReferralAssignmentMutationFailureRequiresDetailRefresh(
        { kind: "TRIAGE_REFERRAL" },
        { ok: false, code: "NOT_FOUND" },
      ),
    ).toBe(false);
  });

  it("routes a candidate 409 retry to authoritative detail refresh", () => {
    expect(
      portalReferralAssignmentCandidateFailureRequiresDetailRefresh({
        ok: false,
        code: "CONFLICT",
      }),
    ).toBe(true);
    for (const result of [
      { ok: false, code: "REQUEST_FAILED" },
      { ok: false, code: "FORBIDDEN" },
      { ok: true, items: [] },
    ] as const) {
      expect(
        portalReferralAssignmentCandidateFailureRequiresDetailRefresh(result),
      ).toBe(false);
    }
  });

  it("removes private detail after candidate authorization-boundary failures", () => {
    const privateDetail = { ok: true, detail: validDetail("TRIAGED") } as const;
    for (const code of [
      "AUTH_REQUIRED",
      "FORBIDDEN",
      "NOT_FOUND",
      "CAPABILITY_DISABLED",
    ] as const) {
      const candidates = { ok: false, code } as const;
      expect(
        portalReferralAssignmentCandidateFailureInvalidatesDetail(candidates),
      ).toBe(true);
      const nextDetail = portalReferralAssignmentDetailAfterCandidateResult(
        privateDetail,
        candidates,
      );
      expect(nextDetail).toEqual({ ok: false, code });
      expect(JSON.stringify(nextDetail)).not.toContain(
        validDetail().contact.phone,
      );
      expect(JSON.stringify(nextDetail)).not.toContain(validDetail().summary);
    }
    for (const code of ["CONFLICT", "REQUEST_FAILED"] as const) {
      expect(
        portalReferralAssignmentCandidateFailureInvalidatesDetail({
          ok: false,
          code,
        }),
      ).toBe(false);
    }
  });

  it("hides A immediately on B and ignores late A responses across A→B→A", () => {
    const privateResult = {
      ok: true,
      detail: validDetail(),
    } as const;
    const firstAIdentity = { referralId: REFERRAL_ID, enabled: true } as const;
    const bIdentity = {
      referralId: OTHER_REFERRAL_ID,
      enabled: true,
    } as const;
    const secondAIdentity = { referralId: REFERRAL_ID, enabled: true } as const;
    const keyed = {
      identity: firstAIdentity,
      result: privateResult,
    };
    expect(
      selectPortalReferralAssignmentKeyedResult(keyed, bIdentity),
    ).toBeUndefined();
    expect(
      selectPortalReferralAssignmentKeyedResult(keyed, secondAIdentity),
    ).toBeUndefined();
    expect(
      JSON.stringify(
        selectPortalReferralAssignmentKeyedResult(keyed, bIdentity),
      ) ?? "",
    ).not.toContain(validDetail().contact.phone);

    const tracker = createPortalReferralAssignmentRequestTracker();
    const firstA = tracker.begin(REFERRAL_ID);
    const b = tracker.begin(OTHER_REFERRAL_ID);
    const secondA = tracker.begin(REFERRAL_ID);
    expect(tracker.isCurrent(firstA)).toBe(false);
    expect(tracker.isCurrent(b)).toBe(false);
    expect(tracker.isCurrent(secondA)).toBe(true);
    tracker.invalidate();
    expect(tracker.isCurrent(secondA)).toBe(false);
  });

  it("contains no legacy scoring, reasons or gaps in the durable coordinator", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/portal-referral-assignment-controls.tsx"),
      "utf8",
    );

    expect(source).not.toContain("match.score");
    expect(source).not.toContain("match.reasons");
    expect(source).not.toContain("match.gaps");
    expect(source).not.toContain("mock-data");
    expect(source).not.toContain("referral-matching");
  });
});

function validQueueItem() {
  return {
    referralId: REFERRAL_ID,
    sourceOrganizationId: ORGANIZATION_ID,
    sourceOrganizationName: "Source Organization",
    region: "VIC_MELBOURNE",
    serviceType: "SUPPORT_COORDINATION",
    currentStatus: "SUBMITTED",
    rowVersion: 1,
    updatedAt: UPDATED_AT,
  } as const;
}

function validActiveOffer() {
  return {
    matchId: MATCH_ID,
    providerId: PROVIDER_ID,
    displayName: "Provider A",
    offeredAt: UPDATED_AT,
  } as const;
}

function validDetail(
  currentStatus: "SUBMITTED" | "TRIAGED" | "OFFERED" = "SUBMITTED",
): PortalReferralAssignmentDetail {
  return {
    referralId: REFERRAL_ID,
    sourceOrganizationId: ORGANIZATION_ID,
    sourceOrganizationName: "Source Organization",
    summary: "Private referral summary",
    region: "VIC_MELBOURNE",
    serviceType: "SUPPORT_COORDINATION",
    currentStatus,
    rowVersion: currentStatus === "SUBMITTED" ? 1 : currentStatus === "TRIAGED" ? 2 : 3,
    contact: {
      name: "Private Contact",
      phone: "0400000099",
      email: "private@example.invalid",
    },
    activeOffer: currentStatus === "OFFERED" ? validActiveOffer() : null,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  };
}

function okJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}
