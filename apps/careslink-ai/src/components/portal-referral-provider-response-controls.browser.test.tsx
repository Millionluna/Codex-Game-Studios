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

import {
  PORTAL_REFERRAL_PROVIDER_RESPONSE_LIFECYCLE_DEBOUNCE_MS,
  PORTAL_REFERRAL_PROVIDER_RESPONSE_REQUEST_TIMEOUT_MS,
  PortalReferralProviderResponseCoordinator,
} from "./portal-referral-provider-response-controls";

const MATCH_A = "a1111111-1111-4111-8111-111111111111";
const MATCH_B = "b1111111-1111-4111-8111-111111111111";
const REFERRAL_A = "c1111111-1111-4111-8111-111111111111";
const REFERRAL_B = "d1111111-1111-4111-8111-111111111111";
const UPDATED_AT = "2026-08-26T01:00:00.000Z";

type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
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
  vi.useRealTimers();
  vi.restoreAllMocks();
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

  it("shows detail links only for accepted, active referrals when both gates are open", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        items: [
          offer(),
          offer({
            matchId: MATCH_B,
            referralId: REFERRAL_B,
            matchStatus: "ACCEPTED",
            currentStatus: "IN_PROGRESS",
            rowVersion: 4,
          }),
          offer({
            matchId: "e1111111-1111-4111-8111-111111111111",
            referralId: "f1111111-1111-4111-8111-111111111111",
            matchStatus: "ACCEPTED",
            currentStatus: "NOTE_LINKED",
            rowVersion: 5,
          }),
        ],
      }),
    );
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator({ followUpEnabled: true });
    await waitForText("Open follow-up / 打开跟进");

    const links = [...container.querySelectorAll<HTMLAnchorElement>("a")];
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe(
      `/provider-portal/referrals/${REFERRAL_B}`,
    );

    await act(async () => {
      root.render(<PortalReferralProviderResponseCoordinator enabled />);
    });
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });

  it("gives every offered-card action a unique safe name bound to its title", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        items: [
          offer(),
          offer({
            matchId: MATCH_B,
            referralId: REFERRAL_B,
          }),
        ],
      }),
    );
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator();
    await waitForText("Accept / 接受");

    const acceptNames = buttons("Accept / 接受").map(labelledByName);
    const declineNames = buttons("Decline / 拒绝").map(labelledByName);
    expect(acceptNames).toHaveLength(2);
    expect(declineNames).toHaveLength(2);
    expect(new Set(acceptNames).size).toBe(2);
    expect(new Set(declineNames).size).toBe(2);
    expect(acceptNames[0]).toContain("Accept / 接受 offer 1 / 邀约 1");
    expect(acceptNames[1]).toContain("Accept / 接受 offer 2 / 邀约 2");
    expect(declineNames[0]).toContain("Decline / 拒绝 offer 1 / 邀约 1");
    expect(declineNames[1]).toContain("Decline / 拒绝 offer 2 / 邀约 2");

    for (const name of [...acceptNames, ...declineNames]) {
      expect(name).toContain("Melbourne / 墨尔本");
      expect(name).toContain("Support coordination / 支持协调");
      expect(name).not.toContain(MATCH_A);
      expect(name).not.toContain(MATCH_B);
      expect(name).not.toContain(REFERRAL_A);
      expect(name).not.toContain(REFERRAL_B);
    }
  });

  it("clears prior-provider metadata before a coalesced lifecycle reauthorization", async () => {
    const refreshed = deferred<Response>();
    let offerReads = 0;
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== offersUrl() || init?.method !== "GET") {
        return Promise.reject(
          new Error(`Unexpected request: ${init?.method} ${String(input)}`),
        );
      }
      offerReads += 1;
      if (offerReads === 1) {
        return Promise.resolve(jsonResponse({ items: [offer()] }));
      }
      if (offerReads === 2) return refreshed.promise;
      return Promise.reject(new Error(`Unexpected duplicate refresh ${offerReads}`));
    });
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator();
    await waitForText("Melbourne / 墨尔本");

    window.dispatchEvent(new Event("pageshow"));
    await flush();
    expect(offerReads).toBe(1);

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: "sb-preview-auth-token" }),
      );
      window.dispatchEvent(persistedPageShowEvent());
    });

    expect(text()).toContain("Loading authorized provider offers");
    expect(text()).not.toContain("Melbourne / 墨尔本");
    expect(text()).not.toContain("Support coordination / 支持协调");
    await waitForLifecycleDebounce();
    await waitForCallCount(fetcher, 2);
    expect(offerReads).toBe(2);

    await act(async () => {
      refreshed.resolve(
        jsonResponse({
          items: [
            offer({
              matchId: MATCH_B,
              referralId: REFERRAL_B,
              region: "VIC_GEELONG",
              serviceType: "DAILY_LIVING_SUPPORT",
            }),
          ],
        }),
      );
      await refreshed.promise;
    });
    await waitForText("Geelong / 吉朗");

    expect(text()).toContain("Daily living support / 日常生活支持");
    expect(text()).not.toContain("Melbourne / 墨尔本");
    expect(text()).not.toContain("Support coordination / 支持协调");

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: "sb-preview-auth-token" }),
      );
      root.render(<PortalReferralProviderResponseCoordinator />);
    });
    window.dispatchEvent(new Event("focus"));
    await waitForLifecycleDebounce();
    expect(offerReads).toBe(2);
  });

  it("waits for an in-flight decision before lifecycle reauthorization", async () => {
    const response = deferred<Response>();
    let offerReads = 0;
    const requestOrder: string[] = [];
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === offersUrl() && init?.method === "GET") {
        offerReads += 1;
        requestOrder.push(`GET-${offerReads}`);
        return Promise.resolve(
          jsonResponse({
            items: [
              offer(
                offerReads === 1
                  ? {}
                  : {
                      matchId: MATCH_B,
                      referralId: REFERRAL_B,
                      region: "VIC_GEELONG",
                      serviceType: "DAILY_LIVING_SUPPORT",
                    },
              ),
            ],
          }),
        );
      }
      if (String(input) === responseUrl(MATCH_A) && init?.method === "POST") {
        requestOrder.push("POST");
        return response.promise;
      }
      return Promise.reject(
        new Error(`Unexpected request: ${init?.method} ${String(input)}`),
      );
    });
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator();
    await waitForText("Accept / 接受");
    await clickButton("Accept / 接受");
    await waitForText("Accepting…");

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(
        new StorageEvent("storage", { key: "sb-preview-auth-token" }),
      );
    });

    expect(text()).toContain("Loading authorized provider offers");
    expect(text()).not.toContain("Melbourne / 墨尔本");
    expect(buttons("Accept / 接受")).toHaveLength(0);
    expect(buttons("Decline / 拒绝")).toHaveLength(0);
    expect((buttons("Refreshing…")[0] as HTMLButtonElement).disabled).toBe(true);
    await clickButton("Refreshing…");
    await waitForLifecycleDebounce();
    expect(requestOrder).toEqual(["GET-1", "POST"]);

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
    await waitForText("Geelong / 吉朗");

    expect(requestOrder).toEqual(["GET-1", "POST", "GET-2"]);
    expect(postCalls(fetcher)).toHaveLength(1);
    expect(text()).toContain("Daily living support / 日常生活支持");
    expect(text()).not.toContain("Melbourne / 墨尔本");
    expect(text()).not.toContain("Support coordination / 支持协调");
  });

  it("discards an in-flight uncertain command across a lifecycle principal boundary", async () => {
    const response = deferred<Response>();
    let offerReads = 0;
    let responseWrites = 0;
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === offersUrl() && init?.method === "GET") {
        offerReads += 1;
        return Promise.resolve(
          jsonResponse({
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
          }),
        );
      }
      if (String(input) === responseUrl(MATCH_A) && init?.method === "POST") {
        responseWrites += 1;
        if (responseWrites === 1) return response.promise;
        return Promise.resolve(
          jsonResponse({
            referralId: REFERRAL_A,
            matchId: MATCH_A,
            currentStatus: "ACCEPTED",
            rowVersion: 4,
            updatedAt: UPDATED_AT,
          }),
        );
      }
      return Promise.reject(
        new Error(`Unexpected request: ${init?.method} ${String(input)}`),
      );
    });
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator();
    await waitForText("Accept / 接受");
    await clickButton("Accept / 接受");
    await waitForText("Accepting…");
    const originalIdempotencyKey = new Headers(
      postCalls(fetcher)[0]?.[1]?.headers,
    ).get("idempotency-key");

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(text()).not.toContain("Melbourne / 墨尔本");
    expect((buttons("Refreshing…")[0] as HTMLButtonElement).disabled).toBe(true);
    await waitForLifecycleDebounce();
    expect(offerReads).toBe(1);

    await act(async () => {
      response.reject(new Error("network"));
      await response.promise.catch(() => undefined);
    });
    await waitForText("Accept / 接受");

    expect(offerReads).toBe(2);
    expect(responseWrites).toBe(1);
    expect(text()).not.toContain("response outcome is uncertain");
    expect(text()).not.toContain("Retry same response / 重试同一响应");
    expect((buttons("Accept / 接受")[0] as HTMLButtonElement).disabled).toBe(
      false,
    );

    await clickButton("Accept / 接受");
    await waitForText("Response is read-only");
    expect(responseWrites).toBe(2);
    expect(offerReads).toBe(3);
    expect(
      new Headers(postCalls(fetcher)[1]?.[1]?.headers).get("idempotency-key"),
    ).not.toBe(originalIdempotencyKey);
  });

  it.each([401, 403, 503])(
    "clears the private uncertain candidate after a %i list boundary",
    async (status) => {
      let offerReads = 0;
      const fetcher = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          if (String(input) === offersUrl() && init?.method === "GET") {
            offerReads += 1;
            if (offerReads === 3) return jsonResponse({}, status);
            return jsonResponse({ items: [offer()] });
          }
          if (
            String(input) === responseUrl(MATCH_A) &&
            init?.method === "POST"
          ) {
            throw new Error("network");
          }
          throw new Error(`Unexpected request: ${init?.method} ${String(input)}`);
        },
      );
      vi.stubGlobal("fetch", fetcher);

      await renderCoordinator();
      await waitForText("Accept / 接受");
      await clickButton("Accept / 接受");
      await waitForText("Retry same response / 重试同一响应");

      await act(async () => window.dispatchEvent(new Event("focus")));
      await waitForLifecycleDebounce();
      await waitForText(
        status === 401
          ? "Sign in again"
          : status === 403
            ? "not available to the current account"
            : "runtime is unavailable",
      );
      expect(offerReads).toBe(3);

      await act(async () =>
        window.dispatchEvent(
          new StorageEvent("storage", { key: "sb-preview-auth-token" }),
        ),
      );
      await waitForLifecycleDebounce();
      await waitForText("Accept / 接受");

      expect(offerReads).toBe(4);
      expect(text()).not.toContain("response outcome is uncertain");
      expect(text()).not.toContain("Retry same response / 重试同一响应");
      expect((buttons("Accept / 接受")[0] as HTMLButtonElement).disabled).toBe(
        false,
      );
      expect((buttons("Decline / 拒绝")[0] as HTMLButtonElement).disabled).toBe(
        false,
      );
    },
  );

  it("debounces focus, visibility and persisted pageshow across tasks", async () => {
    vi.useFakeTimers();
    const refreshed = deferred<Response>();
    let offerReads = 0;
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== offersUrl() || init?.method !== "GET") {
        return Promise.reject(
          new Error(`Unexpected request: ${init?.method} ${String(input)}`),
        );
      }
      offerReads += 1;
      if (offerReads === 1) {
        return Promise.resolve(jsonResponse({ items: [offer()] }));
      }
      return refreshed.promise;
    });
    vi.stubGlobal("fetch", fetcher);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");

    await renderCoordinator();
    await flushMicrotasks();
    expect(text()).toContain("Melbourne / 墨尔本");

    await act(async () => window.dispatchEvent(new Event("focus")));
    await act(async () => vi.advanceTimersByTimeAsync(10));
    await act(async () =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await act(async () => vi.advanceTimersByTimeAsync(10));
    await act(async () => window.dispatchEvent(persistedPageShowEvent()));

    expect(text()).not.toContain("Melbourne / 墨尔本");
    await act(async () =>
      vi.advanceTimersByTimeAsync(
        PORTAL_REFERRAL_PROVIDER_RESPONSE_LIFECYCLE_DEBOUNCE_MS - 1,
      ),
    );
    expect(offerReads).toBe(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(offerReads).toBe(2);

    await act(async () => {
      refreshed.resolve(
        jsonResponse({
          items: [
            offer({
              region: "VIC_GEELONG",
              serviceType: "DAILY_LIVING_SUPPORT",
            }),
          ],
        }),
      );
      await refreshed.promise;
    });
    await flushMicrotasks();
    expect(text()).toContain("Geelong / 吉朗");
    expect(offerReads).toBe(2);
  });

  it.each([
    [
      "accept",
      "Accept / 接受",
      "Decline / 拒绝",
      "Accepting…",
      "ACCEPTED",
      /^portal\.provider-response\.accept:/,
    ],
    [
      "decline",
      "Decline / 拒绝",
      "Accept / 接受",
      "Declining…",
      "TRIAGED",
      /^portal\.provider-response\.decline:/,
    ],
  ] as const)(
    "blocks duplicate %s responses, refreshes authority, and restores focus",
    async (
      _label,
      decisionButtonLabel,
      competingButtonLabel,
      pendingLabel,
      responseStatus,
      idempotencyKeyPattern,
    ) => {
      const response = deferred<Response>();
      const refreshed = deferred<Response>();
      let offerReads = 0;
      const fetcher = vi.fn(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          if (String(input) === offersUrl() && init?.method === "GET") {
            offerReads += 1;
            if (offerReads === 1) {
              return jsonResponse({ items: [offer()] });
            }
            if (offerReads === 2) return refreshed.promise;
            throw new Error(`Unexpected duplicate refresh ${offerReads}`);
          }
          if (
            String(input) === responseUrl(MATCH_A) &&
            init?.method === "POST"
          ) {
            return response.promise;
          }
          throw new Error(
            `Unexpected request: ${init?.method} ${String(input)}`,
          );
        },
      );
      vi.stubGlobal("fetch", fetcher);

      await renderCoordinator();
      await waitForText("Accept / 接受");
      const decisionButton = buttons(
        decisionButtonLabel,
      )[0] as HTMLButtonElement;
      decisionButton.focus();
      expect(document.activeElement).toBe(decisionButton);
      await clickButton(decisionButtonLabel);
      await waitForText(pendingLabel);
      await clickButton(competingButtonLabel);
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
            currentStatus: responseStatus,
            rowVersion: 4,
            updatedAt: UPDATED_AT,
          }),
        );
        await response.promise;
      });
      await waitForText("Refreshing the authorized offer list");
      const refreshingNotice = elementWithText(
        "p",
        "Response saved. Refreshing the authorized offer list.",
      );
      expect(refreshingNotice?.getAttribute("tabindex")).toBe("-1");
      expect(document.activeElement).toBe(refreshingNotice);
      const userSelectedHeading = elementWithText(
        "h2",
        "My authorized referral offers / 我的邀约",
      ) as HTMLHeadingElement;
      userSelectedHeading.focus();
      expect(document.activeElement).toBe(userSelectedHeading);

      await act(async () => {
        refreshed.resolve(
          jsonResponse({
            items:
              responseStatus === "ACCEPTED"
                ? [
                    offer({
                      matchStatus: "ACCEPTED",
                      currentStatus: "ACCEPTED",
                      rowVersion: 4,
                    }),
                  ]
                : [],
          }),
        );
        await refreshed.promise;
      });
      await waitForText(
        responseStatus === "ACCEPTED"
          ? "Response is read-only"
          : "No authorized referral offers",
      );

      expect(offerReads).toBe(2);
      expect(postCalls(fetcher)).toHaveLength(1);
      expect(buttons("Accept / 接受")).toHaveLength(0);
      expect(buttons("Decline / 拒绝")).toHaveLength(0);
      expect(text()).toContain("Response saved");
      const mutationNotice = elementWithText("p", "Response saved");
      expect(mutationNotice?.getAttribute("tabindex")).toBe("-1");
      expect(document.activeElement).toBe(userSelectedHeading);
      const postInit = postCalls(fetcher)[0]?.[1];
      expect(new Headers(postInit?.headers).get("idempotency-key")).toMatch(
        idempotencyKeyPattern,
      );
    },
  );

  it("falls back to the reconciled offer heading when the interim notice is removed", async () => {
    const refreshed = deferred<Response>();
    let offerReads = 0;
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === offersUrl() && init?.method === "GET") {
          offerReads += 1;
          if (offerReads === 1) return jsonResponse({ items: [offer()] });
          if (offerReads === 2) return refreshed.promise;
          throw new Error(`Unexpected duplicate refresh ${offerReads}`);
        }
        if (
          String(input) === responseUrl(MATCH_A) &&
          init?.method === "POST"
        ) {
          return jsonResponse({
            referralId: REFERRAL_A,
            matchId: MATCH_A,
            currentStatus: "ACCEPTED",
            rowVersion: 99,
            updatedAt: UPDATED_AT,
          });
        }
        throw new Error(`Unexpected request: ${init?.method} ${String(input)}`);
      },
    );
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator();
    await waitForText("Accept / 接受");
    const acceptButton = buttons("Accept / 接受")[0] as HTMLButtonElement;
    acceptButton.focus();
    expect(document.activeElement).toBe(acceptButton);
    await clickButton("Accept / 接受");
    await waitForText("response outcome is uncertain");
    const interimNotice = elementWithText(
      "p",
      "The response outcome is uncertain",
    );
    expect(document.activeElement).toBe(interimNotice);

    await act(async () => {
      refreshed.resolve(
        jsonResponse({
          items: [
            offer({
              matchStatus: "ACCEPTED",
              currentStatus: "ACCEPTED",
              rowVersion: 4,
            }),
          ],
        }),
      );
      await refreshed.promise;
    });
    await waitForText("Response is read-only");

    expect(offerReads).toBe(2);
    expect(
      elementWithText("p", "The response outcome is uncertain"),
    ).toBeUndefined();
    const reconciledOfferHeading = elementWithText(
      "h3",
      "Melbourne / 墨尔本 · Support coordination / 支持协调",
    );
    expect(reconciledOfferHeading?.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(reconciledOfferHeading);
  });

  it("does not steal focus moved while a provider response is still submitting", async () => {
    const response = deferred<Response>();
    const refreshed = deferred<Response>();
    let offerReads = 0;
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === offersUrl() && init?.method === "GET") {
          offerReads += 1;
          if (offerReads === 1) return jsonResponse({ items: [offer()] });
          if (offerReads === 2) return refreshed.promise;
          throw new Error(`Unexpected duplicate refresh ${offerReads}`);
        }
        if (
          String(input) === responseUrl(MATCH_A) &&
          init?.method === "POST"
        ) {
          return response.promise;
        }
        throw new Error(`Unexpected request: ${init?.method} ${String(input)}`);
      },
    );
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator();
    await waitForText("Accept / 接受");
    const acceptButton = buttons("Accept / 接受")[0] as HTMLButtonElement;
    acceptButton.focus();
    await clickButton("Accept / 接受");
    await waitForText("Accepting…");
    const userSelectedHeading = elementWithText(
      "h2",
      "My authorized referral offers / 我的邀约",
    ) as HTMLHeadingElement;
    userSelectedHeading.focus();
    expect(document.activeElement).toBe(userSelectedHeading);

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
    await waitForText("Refreshing the authorized offer list");

    expect(document.activeElement).toBe(userSelectedHeading);

    await act(async () => {
      refreshed.resolve(jsonResponse({ items: [] }));
      await refreshed.promise;
    });
    await waitForText("No authorized referral offers");
    expect(document.activeElement).toBe(userSelectedHeading);
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

  it("drops an existing uncertain command before lifecycle reauthorization", async () => {
    let offerReads = 0;
    let responseWrites = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === offersUrl() && init?.method === "GET") {
        offerReads += 1;
        return jsonResponse({
          items: [
            offer(
              offerReads < 4
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

    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(text()).not.toContain("Regional Victoria / 维州地区");
    expect(text()).not.toContain("Retry same response / 重试同一响应");
    await waitForLifecycleDebounce();
    await waitForText("Accept / 接受");
    expect(offerReads).toBe(3);
    expect(text()).not.toContain("response outcome is uncertain");
    expect(text()).not.toContain("Retry same response / 重试同一响应");

    await clickButton("Accept / 接受");
    await waitForText("Response is read-only");

    expect(offerReads).toBe(4);
    expect(responseWrites).toBe(2);
    expect(
      new Headers(postCalls(fetcher)[1]?.[1]?.headers).get("idempotency-key"),
    ).not.toBe(firstIdempotencyKey);
    expect(text()).toContain("Response saved");
  });

  it("times out a never-resolving response body and replays its exact idempotency key", async () => {
    vi.useFakeTimers();
    let offerReads = 0;
    let responseWrites = 0;
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === offersUrl() && init?.method === "GET") {
        offerReads += 1;
        return Promise.resolve(
          jsonResponse({
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
            ],
          }),
        );
      }
      if (String(input) === responseUrl(MATCH_A) && init?.method === "POST") {
        responseWrites += 1;
        if (responseWrites === 1) {
          return Promise.resolve(neverResolvingJsonResponse());
        }
        return Promise.resolve(
          jsonResponse({
            referralId: REFERRAL_A,
            matchId: MATCH_A,
            currentStatus: "ACCEPTED",
            rowVersion: 4,
            updatedAt: UPDATED_AT,
          }),
        );
      }
      return Promise.reject(
        new Error(`Unexpected request: ${init?.method} ${String(input)}`),
      );
    });
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator();
    await flushMicrotasks();
    expect(text()).toContain("Accept / 接受");
    await clickButton("Accept / 接受");
    await flushMicrotasks();
    expect(text()).toContain("Accepting…");
    const originalIdempotencyKey = new Headers(
      postCalls(fetcher)[0]?.[1]?.headers,
    ).get("idempotency-key");

    await advanceRequestTimeout();
    expect(text()).toContain("Retry same response / 重试同一响应");
    expect(text()).toContain("response outcome is uncertain");
    expect(offerReads).toBe(2);

    await clickButton("Retry same response / 重试同一响应");
    await flushMicrotasks();
    expect(text()).toContain("Response is read-only");
    expect(responseWrites).toBe(2);
    expect(
      new Headers(postCalls(fetcher)[1]?.[1]?.headers).get("idempotency-key"),
    ).toBe(originalIdempotencyKey);
  });

  it("turns a never-resolving authoritative refresh body into a retryable state", async () => {
    vi.useFakeTimers();
    let offerReads = 0;
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === offersUrl() && init?.method === "GET") {
        offerReads += 1;
        if (offerReads === 2) {
          return Promise.resolve(neverResolvingJsonResponse());
        }
        return Promise.resolve(
          jsonResponse({
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
          }),
        );
      }
      if (String(input) === responseUrl(MATCH_A) && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse({
            referralId: REFERRAL_A,
            matchId: MATCH_A,
            currentStatus: "ACCEPTED",
            rowVersion: 4,
            updatedAt: UPDATED_AT,
          }),
        );
      }
      return Promise.reject(
        new Error(`Unexpected request: ${init?.method} ${String(input)}`),
      );
    });
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator();
    await flushMicrotasks();
    await clickButton("Accept / 接受");
    await flushMicrotasks();
    expect(text()).toContain("Loading authorized provider offers");
    expect(
      (buttons("Refreshing…")[0] as HTMLButtonElement).disabled,
    ).toBe(true);

    await advanceRequestTimeout();
    expect(text()).toContain("Retry offers / 重试邀约");
    expect(text()).toContain("Response saved");
    expect(
      (buttons("Refresh offers / 刷新邀约")[0] as HTMLButtonElement).disabled,
    ).toBe(false);

    await clickButton("Retry offers / 重试邀约");
    await flushMicrotasks();
    expect(text()).toContain("Response is read-only");
    expect(offerReads).toBe(3);
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
      const declineButton = buttons("Decline / 拒绝")[0] as HTMLButtonElement;
      if (status === 401) {
        declineButton.focus();
        expect(document.activeElement).toBe(declineButton);
      }
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
      const signInLink = elementWithText("a", "Sign in again / 重新登录");
      if (status === 401) {
        expect(signInLink?.getAttribute("href")).toBe(
          "/auth/login?next=%2Fprovider-portal",
        );
        expect(document.activeElement).toBe(signInLink);
      } else {
        expect(signInLink).toBeUndefined();
      }
    },
  );

  it("disables stale actions and deduplicates a pending manual refresh", async () => {
    const refreshed = deferred<Response>();
    let reads = 0;
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== offersUrl() || init?.method !== "GET") {
        return Promise.reject(
          new Error(`Unexpected request: ${init?.method} ${String(input)}`),
        );
      }
      reads += 1;
      if (reads === 1) return Promise.resolve(jsonResponse({ items: [offer()] }));
      return refreshed.promise;
    });
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator();
    await waitForText("Melbourne / 墨尔本");
    await clickButton("Refresh offers / 刷新邀约");
    await waitForCallCount(fetcher, 2);
    const refreshButton = buttons("Refreshing…")[0] as HTMLButtonElement;
    const acceptButton = buttons("Accept / 接受")[0] as HTMLButtonElement;
    const declineButton = buttons("Decline / 拒绝")[0] as HTMLButtonElement;
    expect(refreshButton.disabled).toBe(true);
    expect(acceptButton.disabled).toBe(true);
    expect(declineButton.disabled).toBe(true);
    await act(async () => {
      refreshButton.click();
      acceptButton.click();
      declineButton.click();
    });
    expect(reads).toBe(2);
    expect(postCalls(fetcher)).toHaveLength(0);

    await act(async () => {
      refreshed.resolve(
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
      await refreshed.promise;
    });
    await waitForText("Geelong / 吉朗");

    expect(text()).toContain("Geelong / 吉朗");
    expect(text()).toContain("Response is read-only");
    expect(reads).toBe(2);
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

async function renderCoordinator(
  props: Readonly<{ followUpEnabled?: boolean }> = {},
) {
  await act(async () => {
    root.render(
      <PortalReferralProviderResponseCoordinator enabled {...props} />,
    );
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

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function waitForLifecycleDebounce() {
  await act(async () => {
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        PORTAL_REFERRAL_PROVIDER_RESPONSE_LIFECYCLE_DEBOUNCE_MS + 10,
      ),
    );
  });
}

async function advanceRequestTimeout() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(
      PORTAL_REFERRAL_PROVIDER_RESPONSE_REQUEST_TIMEOUT_MS,
    );
  });
  await flushMicrotasks();
}

function text() {
  return container.textContent ?? "";
}

function elementWithText(selector: string, expected: string) {
  return [...container.querySelectorAll(selector)].find((candidate) =>
    candidate.textContent?.includes(expected),
  );
}

function labelledByName(button: Element) {
  const labelledBy = button.getAttribute("aria-labelledby");
  if (!labelledBy) throw new Error("Expected aria-labelledby");
  return labelledBy
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((fulfill, fail) => {
    resolve = fulfill;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function neverResolvingJsonResponse() {
  return {
    ok: true,
    status: 200,
    json: () => new Promise<unknown>(() => undefined),
  };
}

function persistedPageShowEvent() {
  const event = new Event("pageshow");
  Object.defineProperty(event, "persisted", { value: true });
  return event;
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
