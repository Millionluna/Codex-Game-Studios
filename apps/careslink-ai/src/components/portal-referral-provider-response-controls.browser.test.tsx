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

import { PortalReferralProviderResponseCoordinator } from "./portal-referral-provider-response-controls";

const MATCH_A = "a1111111-1111-4111-8111-111111111111";
const MATCH_B = "b1111111-1111-4111-8111-111111111111";
const REFERRAL_A = "c1111111-1111-4111-8111-111111111111";
const REFERRAL_B = "d1111111-1111-4111-8111-111111111111";
const UPDATED_AT = "2026-08-26T01:00:00.000Z";

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

describe("Portal referral provider response coordinator browser state", () => {
  it("renders only strict offer metadata and keeps accepted offers read-only", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        items: [
          offer(),
          offer({
            matchId: MATCH_B,
            referralId: REFERRAL_B,
            region: "VIC_GEELONG",
            serviceType: "DAILY_LIVING_SUPPORT",
            matchStatus: "ACCEPTED",
            currentStatus: "ACCEPTED",
            rowVersion: 4,
          }),
        ],
      }),
    );
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator();
    await waitForText("Melbourne / 墨尔本");

    expect(text()).toContain("Support coordination / 支持协调");
    expect(text()).toContain("Geelong / 吉朗");
    expect(text()).toContain("Daily living support / 日常生活支持");
    expect(text()).toContain("Status OFFERED · Version 3");
    expect(text()).toContain("Status ACCEPTED · Version 4");
    expect(text()).toContain("Response is read-only");
    expect(buttons("Accept / 接受")).toHaveLength(1);
    expect(buttons("Decline / 拒绝")).toHaveLength(1);
    for (const forbidden of [
      MATCH_A,
      REFERRAL_A,
      "Private summary",
      "0400000000",
      "Source Organization",
      "Legacy mock",
    ]) {
      expect(text()).not.toContain(forbidden);
    }
  });

  it("blocks duplicate responses and refreshes the authoritative list after success", async () => {
    const response = deferred<Response>();
    let offerReads = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === offersUrl() && init?.method === "GET") {
        offerReads += 1;
        return jsonResponse({
          items: [
            offer(
              offerReads === 1
                ? {}
                : {
                    matchStatus: "ACCEPTED",
                    currentStatus: "ACCEPTED",
                    rowVersion: 4,
                  },
            ),
          ],
        });
      }
      if (String(input) === responseUrl(MATCH_A) && init?.method === "POST") {
        return response.promise;
      }
      throw new Error(`Unexpected request: ${init?.method} ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator();
    await waitForText("Accept / 接受");
    await clickButton("Accept / 接受");
    await waitForText("Accepting…");
    await clickButton("Decline / 拒绝");
    expect(postCalls(fetcher)).toHaveLength(1);
    const refreshButton = buttons("Refresh offers / 刷新邀约")[0];
    expect(refreshButton).toBeInstanceOf(HTMLButtonElement);
    expect((refreshButton as HTMLButtonElement).disabled).toBe(true);
    await clickButton("Refresh offers / 刷新邀约");
    expect(offerReads).toBe(1);

    await act(async () => {
      response.resolve(
        jsonResponse({
          referralId: REFERRAL_A,
          matchId: MATCH_A,
          currentStatus: "ACCEPTED",
          rowVersion: 4,
          updatedAt: UPDATED_AT,
        }),
      );
      await response.promise;
    });
    await waitForText("Response is read-only");

    expect(offerReads).toBe(2);
    expect(postCalls(fetcher)).toHaveLength(1);
    expect(buttons("Accept / 接受")).toHaveLength(0);
    expect(text()).toContain("Response saved");
    const postInit = postCalls(fetcher)[0]?.[1];
    expect(new Headers(postInit?.headers).get("idempotency-key")).toMatch(
      /^portal\.provider-response\.accept:/,
    );
  });

  it.each([
    ["a 409 conflict", () => jsonResponse({ error: { code: "CONFLICT" } }, 409)],
    [
      "a malformed success ACK",
      () =>
        jsonResponse({
          referralId: REFERRAL_A,
          matchId: MATCH_A,
          currentStatus: "ACCEPTED",
          rowVersion: 99,
          updatedAt: UPDATED_AT,
        }),
    ],
  ])("refreshes authoritative offers after %s", async (_label, responseResult) => {
    let offerReads = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === offersUrl() && init?.method === "GET") {
        offerReads += 1;
        return jsonResponse({
          items:
            offerReads === 1
              ? [offer()]
              : [
                  offer({
                    matchStatus: "ACCEPTED",
                    currentStatus: "ACCEPTED",
                    rowVersion: 4,
                  }),
                ],
        });
      }
      if (String(input) === responseUrl(MATCH_A) && init?.method === "POST") {
        return responseResult();
      }
      throw new Error(`Unexpected request: ${init?.method} ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator();
    await waitForText("Accept / 接受");
    await clickButton("Accept / 接受");
    await waitForText("Response is read-only");

    expect(offerReads).toBe(2);
    expect(text()).toContain("Version 4");
    expect(text()).not.toContain("Accept / 接受");
    if (_label === "a 409 conflict") {
      expect(text()).toContain("offer changed");
    } else {
      expect(text()).not.toContain("response outcome is uncertain");
      expect(text()).not.toContain("Retry same response");
    }
  });

  it("reconciles a network-uncertain response with the same idempotency key", async () => {
    let offerReads = 0;
    let responseWrites = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === offersUrl() && init?.method === "GET") {
        offerReads += 1;
        return jsonResponse({
          items: [
            offer(
              offerReads < 3
                ? {}
                : {
                    matchStatus: "ACCEPTED",
                    currentStatus: "ACCEPTED",
                    rowVersion: 4,
                  },
            ),
            offer({
              matchId: MATCH_B,
              referralId: REFERRAL_B,
              region: "VIC_REGIONAL",
              serviceType: "COMMUNITY_PARTICIPATION",
            }),
          ],
        });
      }
      if (String(input) === responseUrl(MATCH_A) && init?.method === "POST") {
        responseWrites += 1;
        if (responseWrites === 1) throw new Error("network");
        return jsonResponse({
          referralId: REFERRAL_A,
          matchId: MATCH_A,
          currentStatus: "ACCEPTED",
          rowVersion: 4,
          updatedAt: UPDATED_AT,
        });
      }
      throw new Error(`Unexpected request: ${init?.method} ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator();
    await waitForText("Accept / 接受");
    await clickButton("Accept / 接受");
    await waitForText("Retry same response / 重试同一响应");

    expect(offerReads).toBe(2);
    expect(buttons("Accept / 接受")).toHaveLength(1);
    expect((buttons("Accept / 接受")[0] as HTMLButtonElement).disabled).toBe(
      true,
    );
    await clickButton("Decline / 拒绝");
    expect(responseWrites).toBe(1);
    expect(text()).toContain("response outcome is uncertain");
    const firstIdempotencyKey = new Headers(
      postCalls(fetcher)[0]?.[1]?.headers,
    ).get("idempotency-key");

    await clickButton("Retry same response / 重试同一响应");
    await waitForText("Response is read-only");

    expect(offerReads).toBe(3);
    expect(responseWrites).toBe(2);
    expect(
      new Headers(postCalls(fetcher)[1]?.[1]?.headers).get("idempotency-key"),
    ).toBe(firstIdempotencyKey);
    expect(text()).toContain("Response saved");
  });

  it.each([401, 403, 503])(
    "clears rendered offers after a %i response boundary",
    async (status) => {
      let offerReads = 0;
      const fetcher = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          if (String(input) === offersUrl() && init?.method === "GET") {
            offerReads += 1;
            return jsonResponse({ items: [offer()] });
          }
          if (
            String(input) === responseUrl(MATCH_A) &&
            init?.method === "POST"
          ) {
            return jsonResponse({ summary: "must-not-render" }, status);
          }
          throw new Error(`Unexpected request: ${init?.method} ${String(input)}`);
        },
      );
      vi.stubGlobal("fetch", fetcher);

      await renderCoordinator();
      await waitForText("Melbourne / 墨尔本");
      await clickButton("Decline / 拒绝");
      await waitForText(
        status === 401
          ? "Sign in again"
          : status === 503
            ? "runtime is unavailable"
            : "not available to the current account",
      );

      expect(offerReads).toBe(1);
      expect(text()).not.toContain("Melbourne / 墨尔本");
      expect(text()).not.toContain("must-not-render");
      expect(text()).not.toContain("Accept / 接受");
    },
  );

  it("ignores late list responses across A → B → A generations", async () => {
    const staleB = deferred<Response>();
    const currentA = deferred<Response>();
    let reads = 0;
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== offersUrl() || init?.method !== "GET") {
        return Promise.reject(
          new Error(`Unexpected request: ${init?.method} ${String(input)}`),
        );
      }
      reads += 1;
      if (reads === 1) return Promise.resolve(jsonResponse({ items: [offer()] }));
      if (reads === 2) return staleB.promise;
      return currentA.promise;
    });
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator();
    await waitForText("Melbourne / 墨尔本");
    await clickButton("Refresh offers / 刷新邀约");
    await waitForCallCount(fetcher, 2);
    await clickButton("Refreshing…");
    await waitForCallCount(fetcher, 3);

    await act(async () => {
      currentA.resolve(
        jsonResponse({
          items: [
            offer({
              region: "VIC_GEELONG",
              serviceType: "DAILY_LIVING_SUPPORT",
              matchStatus: "ACCEPTED",
              currentStatus: "ACCEPTED",
              rowVersion: 4,
            }),
          ],
        }),
      );
      await currentA.promise;
    });
    await waitForText("Geelong / 吉朗");

    await act(async () => {
      staleB.resolve(
        jsonResponse({
          items: [
            offer({
              matchId: MATCH_B,
              referralId: REFERRAL_B,
              region: "VIC_REGIONAL",
              serviceType: "COMMUNITY_PARTICIPATION",
            }),
          ],
        }),
      );
      await staleB.promise;
    });
    await flush();

    expect(text()).toContain("Geelong / 吉朗");
    expect(text()).toContain("Response is read-only");
    expect(text()).not.toContain("Regional Victoria / 维州地区");
    expect(text()).not.toContain("Community participation / 社区参与");
  });

  it("refreshes after a target-specific 404 and preserves other authorized offers", async () => {
    let reads = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === offersUrl() && init?.method === "GET") {
        reads += 1;
        return jsonResponse({
          items:
            reads === 1
              ? [
                  offer(),
                  offer({
                    matchId: MATCH_B,
                    referralId: REFERRAL_B,
                    region: "VIC_REGIONAL",
                    serviceType: "COMMUNITY_PARTICIPATION",
                  }),
                ]
              : [
                  offer({
                    matchId: MATCH_B,
                    referralId: REFERRAL_B,
                    region: "VIC_REGIONAL",
                    serviceType: "COMMUNITY_PARTICIPATION",
                  }),
                ],
        });
      }
      if (String(input) === responseUrl(MATCH_A) && init?.method === "POST") {
        return jsonResponse({ summary: "must-not-render" }, 404);
      }
      throw new Error(`Unexpected request: ${init?.method} ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator();
    await waitForText("Accept / 接受");
    await clickButton("Accept / 接受");
    await waitForText("Regional Victoria / 维州地区");

    expect(reads).toBe(2);
    expect(text()).not.toContain("Melbourne / 墨尔本");
    expect(text()).toContain("Community participation / 社区参与");
    expect(text()).toContain("offer is no longer available");
    expect(text()).not.toContain("must-not-render");
  });
});

async function renderCoordinator() {
  await act(async () => {
    root.render(<PortalReferralProviderResponseCoordinator enabled />);
  });
}

async function clickButton(label: string) {
  const button = buttons(label)[0];
  if (!button) throw new Error(`Button not found: ${label}\n${text()}`);
  await act(async () => button.click());
}

function buttons(label: string) {
  return [...container.querySelectorAll("button")].filter((candidate) =>
    candidate.textContent?.includes(label),
  );
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
    if (fetcher.mock.calls.length >= count) return;
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

function offer(overrides: Record<string, unknown> = {}) {
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

function postCalls(fetcher: ReturnType<typeof vi.fn>) {
  return fetcher.mock.calls.filter(([, init]) => init?.method === "POST");
}

function offersUrl() {
  return "/api/portal/referral-offers";
}

function responseUrl(matchId: string) {
  return `/api/portal/referral-offers/${matchId}/response`;
}
