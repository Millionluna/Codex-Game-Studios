// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./ui", async () => {
  const React = await import("react");
  return {
    Card: ({ children }: { children: React.ReactNode }) =>
      React.createElement("section", null, children),
  };
});

import { PortalReferralAssignmentCoordinator } from "./portal-referral-assignment-controls";

const REFERRAL_A = "a1111111-1111-4111-8111-111111111111";
const REFERRAL_B = "b1111111-1111-7111-8111-111111111111";
const ORGANIZATION_ID = "c2222222-2222-4222-8222-222222222222";
const PROVIDER_ID = "d3333333-3333-4333-8333-333333333333";
const MATCH_ID = "e4444444-4444-4444-8444-444444444444";
const CREATED_AT = "2026-08-25T01:00:00.000Z";
const UPDATED_AT = "2026-08-25T02:00:00.000Z";
const TRIAGED_AT = "2026-08-25T03:00:00.000Z";
const OFFERED_AT = "2026-08-25T04:00:00.000Z";

type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve: (value: T) => void;
}>;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("Portal referral assignment coordinator browser state", () => {
  it("executes the mounted SUBMITTED → TRIAGED → OFFERED flow", async () => {
    const triageResponse = deferred<Response>();
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === assignmentDetailUrl(REFERRAL_A) && init?.method === "GET") {
        return jsonResponse({ referral: assignmentDetail(REFERRAL_A, "SUBMITTED") });
      }
      if (url === triageUrl(REFERRAL_A) && init?.method === "POST") {
        return triageResponse.promise;
      }
      if (url === candidatesUrl(REFERRAL_A) && init?.method === "GET") {
        return jsonResponse({
          items: [{ providerId: PROVIDER_ID, displayName: "Provider One" }],
        });
      }
      if (url === offerUrl(REFERRAL_A) && init?.method === "POST") {
        return jsonResponse({
          referralId: REFERRAL_A,
          matchId: MATCH_ID,
          currentStatus: "OFFERED",
          rowVersion: 3,
          updatedAt: OFFERED_AT,
        });
      }
      throw new Error(`Unexpected request: ${init?.method} ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator(REFERRAL_A);
    await waitForText("Private summary A");
    expect(text()).toContain("Version 1");

    await clickButton("Triage referral");
    await waitForText("Triaging…");
    await clickButton("Triaging…");
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    await act(async () => {
      triageResponse.resolve(
        jsonResponse({
          referralId: REFERRAL_A,
          matchId: null,
          currentStatus: "TRIAGED",
          rowVersion: 2,
          updatedAt: TRIAGED_AT,
        }),
      );
      await triageResponse.promise;
    });
    await waitForText("Provider One");
    expect(text()).toContain("Version 2");

    await clickButton("Offer / 发出邀约");
    await waitForText("Active offer");
    expect(text()).toContain("Provider One");
    expect(text()).toContain("Version 3");
    expect(fetcher.mock.calls.map(([input]) => String(input))).toEqual([
      assignmentDetailUrl(REFERRAL_A),
      triageUrl(REFERRAL_A),
      candidatesUrl(REFERRAL_A),
      offerUrl(REFERRAL_A),
    ]);
    for (const [, init] of fetcher.mock.calls.filter(
      ([, requestInit]) => requestInit?.method === "POST",
    )) {
      expect(new Headers(init?.headers).get("idempotency-key")).toMatch(
        /^portal\.assignment\.(?:triage|offer):/,
      );
    }
  });

  it.each([
    ["a triage conflict", () => jsonResponse({ error: { code: "STALE_REFERRAL" } }, 409)],
    [
      "a malformed success ACK",
      () =>
        jsonResponse({
          referralId: REFERRAL_A,
          matchId: null,
          currentStatus: "TRIAGED",
          rowVersion: 9,
          updatedAt: TRIAGED_AT,
        }),
    ],
  ])("refreshes authoritative detail and candidates after %s", async (_label, triageResult) => {
    let detailReads = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === assignmentDetailUrl(REFERRAL_A) && init?.method === "GET") {
        detailReads += 1;
        return jsonResponse({
          referral: assignmentDetail(
            REFERRAL_A,
            detailReads === 1 ? "SUBMITTED" : "TRIAGED",
          ),
        });
      }
      if (url === triageUrl(REFERRAL_A) && init?.method === "POST") {
        return triageResult();
      }
      if (url === candidatesUrl(REFERRAL_A) && init?.method === "GET") {
        return jsonResponse({
          items: [{ providerId: PROVIDER_ID, displayName: "Provider One" }],
        });
      }
      throw new Error(`Unexpected request: ${init?.method} ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator(REFERRAL_A);
    await waitForText("Triage referral");
    await clickButton("Triage referral");
    await waitForText("Provider One");

    expect(detailReads).toBe(2);
    expect(text()).toContain("Version 2");
    if (_label === "a triage conflict") {
      expect(text()).toContain("The referral changed");
    }
  });

  it("removes already-rendered private detail after candidate authorization fails", async () => {
    const candidateResponse = deferred<Response>();
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === assignmentDetailUrl(REFERRAL_A) && init?.method === "GET") {
        return jsonResponse({ referral: assignmentDetail(REFERRAL_A, "TRIAGED") });
      }
      if (url === candidatesUrl(REFERRAL_A) && init?.method === "GET") {
        return candidateResponse.promise;
      }
      throw new Error(`Unexpected request: ${init?.method} ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator(REFERRAL_A);
    await waitForText("Private summary A");
    expect(text()).toContain("0400000001");

    await act(async () => {
      candidateResponse.resolve(
        jsonResponse({ error: { code: "FORBIDDEN" } }, 403),
      );
      await candidateResponse.promise;
    });
    await waitForText("not available to the current account");

    expect(text()).not.toContain("Private summary A");
    expect(text()).not.toContain("0400000001");
  });

  it("ignores a late candidate response across A → B → A", async () => {
    const staleCandidates = deferred<Response>();
    let aDetailReads = 0;
    let aCandidateReads = 0;
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === assignmentDetailUrl(REFERRAL_A) && init?.method === "GET") {
          aDetailReads += 1;
          return jsonResponse({
            referral: assignmentDetail(
              REFERRAL_A,
              "TRIAGED",
              aDetailReads === 1
                ? "Candidate source A"
                : "Current candidate A",
            ),
          });
        }
        if (url === candidatesUrl(REFERRAL_A) && init?.method === "GET") {
          aCandidateReads += 1;
          return aCandidateReads === 1
            ? staleCandidates.promise
            : jsonResponse({
                items: [
                  {
                    providerId: PROVIDER_ID,
                    displayName: "Current Provider",
                  },
                ],
              });
        }
        if (url === assignmentDetailUrl(REFERRAL_B) && init?.method === "GET") {
          return jsonResponse({
            referral: assignmentDetail(
              REFERRAL_B,
              "SUBMITTED",
              "Middle candidate B",
            ),
          });
        }
        throw new Error(`Unexpected request: ${init?.method} ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator(REFERRAL_A);
    await waitForCallCount(fetcher, 2);
    expect(text()).toContain("Candidate source A");

    await renderCoordinator(REFERRAL_B);
    await waitForText("Middle candidate B");
    await renderCoordinator(REFERRAL_A);
    await waitForText("Current Provider");

    await act(async () => {
      staleCandidates.resolve(
        jsonResponse({
          items: [{ providerId: PROVIDER_ID, displayName: "Stale Provider" }],
        }),
      );
      await staleCandidates.promise;
    });
    await flush();

    expect(text()).toContain("Current candidate A");
    expect(text()).toContain("Current Provider");
    expect(text()).not.toContain("Candidate source A");
    expect(text()).not.toContain("Middle candidate B");
    expect(text()).not.toContain("Stale Provider");
    expect(text()).toContain("Offer / 发出邀约");
  });

  it("ignores a late offer ACK across A → B → A", async () => {
    const staleOffer = deferred<Response>();
    let aDetailReads = 0;
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === assignmentDetailUrl(REFERRAL_A) && init?.method === "GET") {
          aDetailReads += 1;
          return jsonResponse({
            referral: assignmentDetail(
              REFERRAL_A,
              aDetailReads === 1 ? "TRIAGED" : "SUBMITTED",
              aDetailReads === 1 ? "Offer source A" : "Current offer A",
            ),
          });
        }
        if (url === candidatesUrl(REFERRAL_A) && init?.method === "GET") {
          return jsonResponse({
            items: [{ providerId: PROVIDER_ID, displayName: "Stale Provider" }],
          });
        }
        if (url === offerUrl(REFERRAL_A) && init?.method === "POST") {
          return staleOffer.promise;
        }
        if (url === assignmentDetailUrl(REFERRAL_B) && init?.method === "GET") {
          return jsonResponse({
            referral: assignmentDetail(
              REFERRAL_B,
              "SUBMITTED",
              "Middle offer B",
            ),
          });
        }
        throw new Error(`Unexpected request: ${init?.method} ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator(REFERRAL_A);
    await waitForText("Stale Provider");
    await clickButton("Offer / 发出邀约");
    await waitForCallCount(fetcher, 3);

    await renderCoordinator(REFERRAL_B);
    await waitForText("Middle offer B");
    await renderCoordinator(REFERRAL_A);
    await waitForText("Current offer A");

    await act(async () => {
      staleOffer.resolve(
        jsonResponse({
          referralId: REFERRAL_A,
          matchId: MATCH_ID,
          currentStatus: "OFFERED",
          rowVersion: 3,
          updatedAt: OFFERED_AT,
        }),
      );
      await staleOffer.promise;
    });
    await flush();

    expect(text()).toContain("Current offer A");
    expect(text()).not.toContain("Offer source A");
    expect(text()).not.toContain("Middle offer B");
    expect(text()).not.toContain("Stale Provider");
    expect(text()).not.toContain("Active offer");
    expect(text()).not.toContain("Assignment updated");
  });

  it("ignores late A and B detail responses across A → B → A", async () => {
    const firstA = deferred<Response>();
    const middleB = deferred<Response>();
    const currentA = deferred<Response>();
    let aReads = 0;
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method !== "GET") {
        return Promise.reject(new Error(`Unexpected request: ${init?.method} ${url}`));
      }
      if (url === assignmentDetailUrl(REFERRAL_A)) {
        aReads += 1;
        return aReads === 1 ? firstA.promise : currentA.promise;
      }
      if (url === assignmentDetailUrl(REFERRAL_B)) return middleB.promise;
      return Promise.reject(new Error(`Unexpected request: ${init?.method} ${url}`));
    });
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator(REFERRAL_A);
    await waitForCallCount(fetcher, 1);
    await renderCoordinator(REFERRAL_B);
    await waitForCallCount(fetcher, 2);
    await renderCoordinator(REFERRAL_A);
    await waitForCallCount(fetcher, 3);

    await act(async () => {
      currentA.resolve(
        jsonResponse({
          referral: assignmentDetail(
            REFERRAL_A,
            "SUBMITTED",
            "Current summary A",
          ),
        }),
      );
      await currentA.promise;
    });
    await waitForText("Current summary A");

    await act(async () => {
      middleB.resolve(
        jsonResponse({
          referral: assignmentDetail(REFERRAL_B, "SUBMITTED", "Stale summary B"),
        }),
      );
      firstA.resolve(
        jsonResponse({
          referral: assignmentDetail(REFERRAL_A, "SUBMITTED", "Stale summary A"),
        }),
      );
      await Promise.all([middleB.promise, firstA.promise]);
    });
    await flush();

    expect(text()).toContain("Current summary A");
    expect(text()).not.toContain("Stale summary A");
    expect(text()).not.toContain("Stale summary B");
  });
});

async function renderCoordinator(referralId: string) {
  await act(async () => {
    root.render(
      <PortalReferralAssignmentCoordinator
        enabled
        referralId={referralId}
      />,
    );
  });
}

async function clickButton(label: string) {
  const button = [...container.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.includes(label),
  );
  if (!button) throw new Error(`Button not found: ${label}\n${text()}`);
  await act(async () => {
    button.click();
  });
}

async function waitForText(expected: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (text().includes(expected)) return;
    await flush();
  }
  throw new Error(`Text not found: ${expected}\n${text()}`);
}

async function waitForCallCount(fetcher: ReturnType<typeof vi.fn>, count: number) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (fetcher.mock.calls.length === count) return;
    await flush();
  }
  throw new Error(`Expected ${count} requests, saw ${fetcher.mock.calls.length}`);
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function text() {
  return container.textContent ?? "";
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function assignmentDetail(
  referralId: string,
  status: "SUBMITTED" | "TRIAGED",
  summary = referralId === REFERRAL_A ? "Private summary A" : "Private summary B",
) {
  return {
    referralId,
    sourceOrganizationId: ORGANIZATION_ID,
    sourceOrganizationName: "Source Organization",
    summary,
    region: "VIC_MELBOURNE",
    serviceType: "SUPPORT_COORDINATION",
    currentStatus: status,
    rowVersion: status === "SUBMITTED" ? 1 : 2,
    contact: {
      name: referralId === REFERRAL_A ? "Contact A" : "Contact B",
      phone: referralId === REFERRAL_A ? "0400000001" : "0400000002",
      email: null,
    },
    activeOffer: null,
    createdAt: CREATED_AT,
    updatedAt: status === "SUBMITTED" ? UPDATED_AT : TRIAGED_AT,
  };
}

function assignmentDetailUrl(referralId: string) {
  return `/api/portal/referral-assignments/${referralId}`;
}

function triageUrl(referralId: string) {
  return `/api/portal/referrals/${referralId}/triage`;
}

function candidatesUrl(referralId: string) {
  return `/api/portal/referrals/${referralId}/candidates`;
}

function offerUrl(referralId: string) {
  return `/api/portal/referrals/${referralId}/offers`;
}
