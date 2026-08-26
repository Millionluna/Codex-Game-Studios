// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./ui", async () => {
  const React = await import("react");
  return {
    Card: ({ children }: { children: React.ReactNode }) =>
      React.createElement("section", null, children),
  };
});

import {
  PORTAL_REFERRAL_PROVIDER_FOLLOW_UP_LIFECYCLE_DEBOUNCE_MS,
  PortalReferralProviderFollowUpCoordinator,
} from "./portal-referral-provider-follow-up-controls";

const REFERRAL_A = "a1111111-1111-4111-8111-111111111111";
const REFERRAL_B = "b1111111-1111-4111-8111-111111111111";
const UPDATED_AT = "2026-08-26T01:00:00.000Z";
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  container.remove();
});

describe("Portal referral provider follow-up coordinator browser state", () => {
  it("does not reuse old private detail when the runtime is disabled then re-enabled", async () => {
    const reauthorized = deferred<Response>();
    let reads = 0;
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== detailUrl() || init?.method !== "GET") {
        throw new Error(`Unexpected request: ${init?.method} ${String(input)}`);
      }
      reads += 1;
      return reads === 1
        ? Promise.resolve(jsonResponse({ referral: detail() }))
        : reauthorized.promise;
    });
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator();
    await waitForText("Private participant summary");
    await act(async () => {
      root.render(
        <PortalReferralProviderFollowUpCoordinator referralId={REFERRAL_A} />,
      );
    });
    expect(text()).toContain("runtime is disabled");
    expect(text()).not.toContain("Private participant summary");

    act(() => {
      flushSync(() => {
        root.render(
          <PortalReferralProviderFollowUpCoordinator
            enabled
            referralId={REFERRAL_A}
          />,
        );
      });
      expect(text()).toContain("Loading authorized referral detail");
      expect(text()).not.toContain("Private participant summary");
      expect(text()).not.toContain("0400 000 000");
    });

    await act(async () => {
      reauthorized.resolve(jsonResponse({ referral: detail() }));
      await reauthorized.promise;
    });
    await waitForText("Private participant summary");
    expect(reads).toBe(2);
  });

  it("never renders or submits A detail during an A → B prop change", async () => {
    const detailB = deferred<Response>();
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === detailUrl(REFERRAL_A) && init?.method === "GET") {
        return Promise.resolve(jsonResponse({ referral: detail() }));
      }
      if (String(input) === detailUrl(REFERRAL_B) && init?.method === "GET") {
        return detailB.promise;
      }
      throw new Error(`Unexpected request: ${init?.method} ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator();
    await waitForText("Private participant summary");

    flushSync(() => {
      root.render(
        <PortalReferralProviderFollowUpCoordinator
          enabled
          referralId={REFERRAL_B}
        />,
      );
    });

    expect(text()).toContain("Loading authorized referral detail");
    expect(text()).not.toContain("Private participant summary");
    expect(text()).not.toContain("0400 000 000");
    expect(text()).not.toContain("Record follow-up / 记录跟进");
    expect(
      fetcher.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(0);

    await act(async () => {
      detailB.resolve(
        jsonResponse({
          referral: detail({
            referralId: REFERRAL_B,
            summary: "Authorized B summary",
            contact: { name: "Participant B", phone: "0400 000 001", email: null },
          }),
        }),
      );
      await detailB.promise;
    });
    await waitForText("Authorized B summary");
  });

  it("lets B submit while A is stale and keeps A completion from clearing B pending", async () => {
    const writeA = deferred<Response>();
    const writeB = deferred<Response>();
    let aReads = 0;
    let bReads = 0;
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === detailUrl(REFERRAL_A) && init?.method === "GET") {
        aReads += 1;
        return Promise.resolve(
          jsonResponse({
            referral: detail(
              aReads < 3
                ? {}
                : { currentStatus: "IN_PROGRESS", rowVersion: 4 },
            ),
          }),
        );
      }
      if (String(input) === detailUrl(REFERRAL_B) && init?.method === "GET") {
        bReads += 1;
        return Promise.resolve(
          jsonResponse({
            referral: detail({
              referralId: REFERRAL_B,
              summary: "Authorized B summary",
              currentStatus: bReads === 1 ? "ACCEPTED" : "IN_PROGRESS",
              rowVersion: bReads === 1 ? 3 : 4,
              contact: {
                name: "Participant B",
                phone: "0400 000 001",
                email: null,
              },
            }),
          }),
        );
      }
      if (String(input) === followUpUrl(REFERRAL_A) && init?.method === "POST") {
        return writeA.promise;
      }
      if (String(input) === followUpUrl(REFERRAL_B) && init?.method === "POST") {
        return writeB.promise;
      }
      throw new Error(`Unexpected request: ${init?.method} ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator();
    await waitForText("Private participant summary");
    await clickButton("Record follow-up / 记录跟进");

    await act(async () => {
      root.render(
        <PortalReferralProviderFollowUpCoordinator
          enabled
          referralId={REFERRAL_B}
        />,
      );
    });
    await waitForText("Authorized B summary");

    const bSubmit = button("Record follow-up / 记录跟进");
    expect(bSubmit.disabled).toBe(false);
    await act(async () => bSubmit.click());
    expect(postCalls(fetcher)).toHaveLength(2);
    expect(button("Recording…").disabled).toBe(true);

    await act(async () => {
      writeA.resolve(jsonResponse(ack(4, REFERRAL_A)));
      await writeA.promise;
    });
    expect(button("Recording…").disabled).toBe(true);

    await act(async () => {
      writeB.resolve(jsonResponse(ack(4, REFERRAL_B)));
      await writeB.promise;
    });
    await waitForText("Status IN_PROGRESS · Version 4");
    expect(bReads).toBe(2);
  });

  it("blocks a second A submit across A → B → A until the original A request settles", async () => {
    const writeA = deferred<Response>();
    const writeB = deferred<Response>();
    const reconciledA = deferred<Response>();
    let aReads = 0;
    let bReads = 0;
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === detailUrl(REFERRAL_A) && init?.method === "GET") {
        aReads += 1;
        return aReads === 3
          ? reconciledA.promise
          : Promise.resolve(jsonResponse({ referral: detail() }));
      }
      if (String(input) === detailUrl(REFERRAL_B) && init?.method === "GET") {
        bReads += 1;
        return Promise.resolve(
          jsonResponse({
            referral: detail({
              referralId: REFERRAL_B,
              summary: "Authorized B summary",
              currentStatus: bReads === 1 ? "ACCEPTED" : "IN_PROGRESS",
              rowVersion: bReads === 1 ? 3 : 4,
              contact: {
                name: "Participant B",
                phone: "0400 000 001",
                email: null,
              },
            }),
          }),
        );
      }
      if (String(input) === followUpUrl(REFERRAL_A) && init?.method === "POST") {
        return writeA.promise;
      }
      if (String(input) === followUpUrl(REFERRAL_B) && init?.method === "POST") {
        return writeB.promise;
      }
      throw new Error(`Unexpected request: ${init?.method} ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator();
    await waitForText("Private participant summary");
    await clickButton("Record follow-up / 记录跟进");

    await act(async () => {
      root.render(
        <PortalReferralProviderFollowUpCoordinator
          enabled
          referralId={REFERRAL_B}
        />,
      );
    });
    await waitForText("Authorized B summary");
    await clickButton("Record follow-up / 记录跟进");
    expect(postCalls(fetcher)).toHaveLength(2);

    await act(async () => {
      writeB.resolve(jsonResponse(ack(4, REFERRAL_B)));
      await writeB.promise;
    });
    await waitForText("Status IN_PROGRESS · Version 4");

    await act(async () => {
      root.render(
        <PortalReferralProviderFollowUpCoordinator
          enabled
          referralId={REFERRAL_A}
        />,
      );
    });
    await waitForText("Private participant summary");

    const blockedA = button("Recording…");
    expect(blockedA.disabled).toBe(true);
    await act(async () => blockedA.click());
    expect(postCalls(fetcher)).toHaveLength(2);

    await act(async () => {
      writeA.resolve(jsonResponse(ack(4, REFERRAL_A)));
      await writeA.promise;
    });
    await waitForReadCount(() => aReads, 3);
    expect(text()).toContain("Loading authorized referral detail");
    expect(text()).not.toContain("Private participant summary");
    expect(text()).not.toContain("Record follow-up / 记录跟进");
    expect(postCalls(fetcher)).toHaveLength(2);

    await act(async () => {
      reconciledA.resolve(
        jsonResponse({
          referral: detail({ currentStatus: "IN_PROGRESS", rowVersion: 4 }),
        }),
      );
      await reconciledA.promise;
    });
    await waitForText("Status IN_PROGRESS · Version 4");
    expect(aReads).toBe(3);
    expect(button("Record follow-up / 记录跟进").disabled).toBe(false);
    expect(postCalls(fetcher)).toHaveLength(2);
  });

  it("reconciles a stale A transport failure without carrying its key across authorization epochs", async () => {
    const writeA = deferred<Response>();
    const reconciledA = deferred<Response>();
    let aReads = 0;
    let aWrites = 0;
    const keys: string[] = [];
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === detailUrl(REFERRAL_A) && init?.method === "GET") {
        aReads += 1;
        if (aReads === 3) return reconciledA.promise;
        return Promise.resolve(
          jsonResponse({
            referral: detail(
              aReads < 4
                ? {}
                : { currentStatus: "IN_PROGRESS", rowVersion: 4 },
            ),
          }),
        );
      }
      if (String(input) === detailUrl(REFERRAL_B) && init?.method === "GET") {
        return Promise.resolve(
          jsonResponse({
            referral: detail({
              referralId: REFERRAL_B,
              summary: "Authorized B summary",
              contact: {
                name: "Participant B",
                phone: "0400 000 001",
                email: null,
              },
            }),
          }),
        );
      }
      if (String(input) === followUpUrl(REFERRAL_A) && init?.method === "POST") {
        aWrites += 1;
        keys.push(new Headers(init.headers).get("idempotency-key") ?? "");
        return aWrites === 1
          ? writeA.promise
          : Promise.resolve(jsonResponse(ack(4, REFERRAL_A)));
      }
      throw new Error(`Unexpected request: ${init?.method} ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator();
    await waitForText("Private participant summary");
    await clickButton("Record follow-up / 记录跟进");

    await act(async () => {
      root.render(
        <PortalReferralProviderFollowUpCoordinator
          enabled
          referralId={REFERRAL_B}
        />,
      );
    });
    await waitForText("Authorized B summary");
    await act(async () => {
      root.render(
        <PortalReferralProviderFollowUpCoordinator
          enabled
          referralId={REFERRAL_A}
        />,
      );
    });
    await waitForText("Private participant summary");
    expect(button("Recording…").disabled).toBe(true);

    await act(async () => {
      writeA.reject(new Error("transport interrupted"));
      await writeA.promise.catch(() => undefined);
    });
    await waitForReadCount(() => aReads, 3);
    expect(text()).toContain("Loading authorized referral detail");
    expect(text()).not.toContain("Private participant summary");
    expect(text()).not.toContain("Retry same follow-up / 重试同一跟进");
    expect(text()).not.toContain("Record follow-up / 记录跟进");

    await act(async () => {
      reconciledA.resolve(jsonResponse({ referral: detail() }));
      await reconciledA.promise;
    });
    await waitForText("Private participant summary");
    expect(aReads).toBe(3);
    expect(keys).toHaveLength(1);
    expect(text()).not.toContain("Retry same follow-up / 重试同一跟进");
    await clickButton("Record follow-up / 记录跟进");
    await waitForText("Status IN_PROGRESS · Version 4");

    expect(aWrites).toBe(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBeTruthy();
    expect(keys[1]).not.toBe(keys[0]);
    expect(aReads).toBe(4);
  });

  it("drains B lifecycle work after fencing a suspended A worker", async () => {
    const writeA = deferred<Response>();
    let aReads = 0;
    let bReads = 0;
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === detailUrl(REFERRAL_A) && init?.method === "GET") {
        aReads += 1;
        return Promise.resolve(jsonResponse({ referral: detail() }));
      }
      if (String(input) === detailUrl(REFERRAL_B) && init?.method === "GET") {
        bReads += 1;
        return Promise.resolve(
          jsonResponse({
            referral: detail({
              referralId: REFERRAL_B,
              summary: "Authorized B summary",
              currentStatus: bReads === 1 ? "ACCEPTED" : "IN_PROGRESS",
              rowVersion: bReads === 1 ? 3 : 4,
              contact: {
                name: "Participant B",
                phone: "0400 000 001",
                email: null,
              },
            }),
          }),
        );
      }
      if (String(input) === followUpUrl(REFERRAL_A) && init?.method === "POST") {
        return writeA.promise;
      }
      throw new Error(`Unexpected request: ${init?.method} ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator();
    await waitForText("Private participant summary");
    await clickButton("Record follow-up / 记录跟进");
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: "sb-preview-auth-token" }),
      );
    });
    await waitForLifecycleDebounce();

    await act(async () => {
      root.render(
        <PortalReferralProviderFollowUpCoordinator
          enabled
          referralId={REFERRAL_B}
        />,
      );
    });
    await waitForText("Authorized B summary");
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: "sb-preview-auth-token" }),
      );
    });

    await act(async () => {
      writeA.resolve(jsonResponse(ack(4, REFERRAL_A)));
      await writeA.promise;
    });
    await waitForReadCount(() => aReads + bReads, 3);
    await waitForText("Authorized B summary");

    expect(aReads).toBe(1);
    expect(bReads).toBe(2);
    expect(text()).not.toContain("Private participant summary");
    expect(text()).not.toContain("0400 000 000");
    expect(button("Record follow-up / 记录跟进").disabled).toBe(false);
  });

  it("shows authorized private detail and only the fixed five-code form", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ referral: detail() })));

    await renderCoordinator();
    await waitForText("Private participant summary");

    expect(text()).toContain("Participant A");
    expect(text()).toContain("0400 000 000");
    expect(container.querySelectorAll("select option")).toHaveLength(5);
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.querySelector('input[type="text"]')).toBeNull();
    expect(text()).not.toContain("history");
    expect(text()).not.toContain("Next due");
  });

  it("records a fixed outcome then replaces detail from an authoritative GET", async () => {
    let reads = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === detailUrl() && init?.method === "GET") {
        reads += 1;
        return jsonResponse({
          referral: detail(
            reads === 1
              ? {}
              : { currentStatus: "IN_PROGRESS", rowVersion: 4, summary: "Refreshed private summary" },
          ),
        });
      }
      if (String(input) === followUpUrl() && init?.method === "POST") {
        return jsonResponse(ack(4));
      }
      throw new Error(`Unexpected request: ${init?.method} ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator();
    await waitForText("Private participant summary");
    await clickButton("Record follow-up / 记录跟进");
    await waitForText("Refreshed private summary");

    expect(reads).toBe(2);
    expect(text()).toContain("Status IN_PROGRESS · Version 4");
    const post = fetcher.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[0]).toBe(followUpUrl());
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({
      outcomeCode: "CONTACT_CONFIRMED",
      expectedVersion: 3,
    });
    expect(new Headers(post?.[1]?.headers).get("idempotency-key")).toMatch(
      /^portal\.provider-follow-up:/,
    );
    expect(document.activeElement?.textContent).toContain("Follow-up recorded");
  });

  it("replays an uncertain command with the exact same idempotency key", async () => {
    let reads = 0;
    let writes = 0;
    const keys: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === detailUrl() && init?.method === "GET") {
        reads += 1;
        return jsonResponse({
          referral: detail(
            reads < 3
              ? {}
              : { currentStatus: "IN_PROGRESS", rowVersion: 4 },
          ),
        });
      }
      if (String(input) === followUpUrl() && init?.method === "POST") {
        writes += 1;
        keys.push(new Headers(init.headers).get("idempotency-key") ?? "");
        if (writes === 1) throw new Error("transport interrupted");
        return jsonResponse(ack(4));
      }
      throw new Error(`Unexpected request: ${init?.method} ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator();
    await waitForText("Private participant summary");
    await clickButton("Record follow-up / 记录跟进");
    await waitForText("Retry same follow-up / 重试同一跟进");
    await clickButton("Retry same follow-up / 重试同一跟进");
    await waitForText("Status IN_PROGRESS · Version 4");

    expect(writes).toBe(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
  });

  it("discards an uncertain detail and key when authoritative reconciliation is not successful", async () => {
    let reads = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === detailUrl() && init?.method === "GET") {
        reads += 1;
        return reads === 2
          ? jsonResponse({ unavailable: true }, 404)
          : jsonResponse({ referral: detail() });
      }
      if (String(input) === followUpUrl() && init?.method === "POST") {
        throw new Error("transport interrupted");
      }
      throw new Error(`Unexpected request: ${init?.method} ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator();
    await waitForText("Private participant summary");
    await clickButton("Record follow-up / 记录跟进");
    await waitForText("not available to the current account");

    expect(text()).not.toContain("Private participant summary");
    expect(text()).not.toContain("0400 000 000");
    expect(text()).not.toContain("Retry same follow-up / 重试同一跟进");

    await act(async () => {
      root.render(
        <PortalReferralProviderFollowUpCoordinator referralId={REFERRAL_A} />,
      );
    });
    await act(async () => {
      root.render(
        <PortalReferralProviderFollowUpCoordinator
          enabled
          referralId={REFERRAL_A}
        />,
      );
    });
    await waitForText("Private participant summary");

    expect(reads).toBe(3);
    expect(text()).toContain("Record follow-up / 记录跟进");
    expect(text()).not.toContain("Retry same follow-up / 重试同一跟进");
  });

  it("clears private detail synchronously before lifecycle reauthorization", async () => {
    const refreshed = deferred<Response>();
    let reads = 0;
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== detailUrl() || init?.method !== "GET") {
        throw new Error(`Unexpected request: ${init?.method} ${String(input)}`);
      }
      reads += 1;
      return reads === 1
        ? Promise.resolve(jsonResponse({ referral: detail() }))
        : refreshed.promise;
    });
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator();
    await waitForText("Private participant summary");
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: "sb-preview-auth-token" }),
      );
    });

    expect(text()).toContain("Loading authorized referral detail");
    expect(text()).not.toContain("Private participant summary");
    expect(text()).not.toContain("0400 000 000");
    await act(async () => {
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          PORTAL_REFERRAL_PROVIDER_FOLLOW_UP_LIFECYCLE_DEBOUNCE_MS + 10,
        ),
      );
    });
    expect(reads).toBe(2);
  });

  it("invalidates an in-flight write across an authorization epoch", async () => {
    const write = deferred<Response>();
    let reads = 0;
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === detailUrl() && init?.method === "GET") {
        reads += 1;
        return Promise.resolve(
          reads === 1
            ? jsonResponse({ referral: detail() })
            : jsonResponse({ unavailable: true }, 403),
        );
      }
      if (String(input) === followUpUrl() && init?.method === "POST") {
        return write.promise;
      }
      throw new Error(`Unexpected request: ${init?.method} ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator();
    await waitForText("Private participant summary");
    await clickButton("Record follow-up / 记录跟进");
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: "sb-preview-auth-token" }),
      );
    });
    expect(text()).not.toContain("Private participant summary");

    await act(async () => {
      write.resolve(jsonResponse(ack(4)));
      await write.promise;
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          PORTAL_REFERRAL_PROVIDER_FOLLOW_UP_LIFECYCLE_DEBOUNCE_MS + 10,
        ),
      );
    });
    await waitForText("not available to the current account");

    expect(reads).toBe(2);
    expect(text()).not.toContain("Private participant summary");
    expect(text()).not.toContain("Follow-up recorded");
  });

  it("does not let a settled submit swallow lifecycle authorization while its old GET is pending", async () => {
    const staleRefresh = deferred<Response>();
    let reads = 0;
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === detailUrl() && init?.method === "GET") {
        reads += 1;
        if (reads === 2) return staleRefresh.promise;
        return Promise.resolve(
          jsonResponse({
            referral: detail(
              reads === 1
                ? {}
                : { currentStatus: "IN_PROGRESS", rowVersion: 4 },
            ),
          }),
        );
      }
      if (String(input) === followUpUrl() && init?.method === "POST") {
        return Promise.resolve(jsonResponse(ack(4)));
      }
      throw new Error(`Unexpected request: ${init?.method} ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator();
    await waitForText("Private participant summary");
    await clickButton("Record follow-up / 记录跟进");
    await waitForReadCount(() => reads, 2);

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: "sb-preview-auth-token" }),
      );
    });
    expect(text()).toContain("Loading authorized referral detail");
    expect(text()).not.toContain("Private participant summary");
    await waitForLifecycleDebounce();
    await waitForText("Status IN_PROGRESS · Version 4");
    expect(reads).toBe(3);

    await act(async () => {
      staleRefresh.resolve(jsonResponse({ referral: detail() }));
      await staleRefresh.promise;
    });
    expect(text()).toContain("Status IN_PROGRESS · Version 4");
    expect(text()).not.toContain("Status ACCEPTED · Version 3");
    expect(reads).toBe(3);
  });

  it("does not steal focus when the user moves it while a write settles", async () => {
    const write = deferred<Response>();
    let reads = 0;
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === detailUrl() && init?.method === "GET") {
        reads += 1;
        return Promise.resolve(
          jsonResponse({
            referral: detail(
              reads === 1
                ? {}
                : { currentStatus: "IN_PROGRESS", rowVersion: 4 },
            ),
          }),
        );
      }
      if (String(input) === followUpUrl() && init?.method === "POST") {
        return write.promise;
      }
      throw new Error(`Unexpected request: ${init?.method} ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetcher);
    const userTarget = document.createElement("button");
    userTarget.textContent = "User moved here";
    document.body.append(userTarget);

    await renderCoordinator();
    await waitForText("Private participant summary");
    await clickButton("Record follow-up / 记录跟进");
    userTarget.focus();
    await act(async () => {
      write.resolve(jsonResponse(ack(4)));
      await write.promise;
    });
    await waitForText("Status IN_PROGRESS · Version 4");

    expect(document.activeElement).toBe(userTarget);
    userTarget.remove();
  });

  it("moves completion focus to sign-in after a write loses authentication", async () => {
    const errorJson = vi.fn(async () => ({ summary: "must-not-render" }));
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === detailUrl() && init?.method === "GET") {
        return jsonResponse({ referral: detail() });
      }
      if (String(input) === followUpUrl() && init?.method === "POST") {
        return { ok: false, status: 401, json: errorJson };
      }
      throw new Error(`Unexpected request: ${init?.method} ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetcher);

    await renderCoordinator();
    await waitForText("Private participant summary");
    await clickButton("Record follow-up / 记录跟进");
    await waitForText("Sign in again / 重新登录");

    const link = container.querySelector<HTMLAnchorElement>("a");
    expect(document.activeElement).toBe(link);
    expect(errorJson).not.toHaveBeenCalled();
  });

  it("uses the canonical same-origin sign-in next link without rendering error JSON", async () => {
    const json = vi.fn(async () => ({ summary: "must-not-render" }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, json })),
    );

    await renderCoordinator();
    await waitForText("Sign in again / 重新登录");

    const link = container.querySelector<HTMLAnchorElement>("a");
    expect(link?.getAttribute("href")).toBe(
      `/auth/login?next=%2Fprovider-portal%2Freferrals%2F${REFERRAL_A}`,
    );
    expect(text()).not.toContain("must-not-render");
    expect(json).not.toHaveBeenCalled();
  });
});

async function renderCoordinator() {
  await act(async () => {
    root.render(
      <PortalReferralProviderFollowUpCoordinator
        enabled
        referralId={REFERRAL_A}
      />,
    );
  });
}

async function clickButton(label: string) {
  const target = [...container.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.includes(label),
  );
  if (!target) throw new Error(`Button not found: ${label}\n${text()}`);
  await act(async () => target.click());
}

function button(label: string) {
  const target = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.includes(label),
  );
  if (!target) throw new Error(`Button not found: ${label}\n${text()}`);
  return target;
}

async function waitForText(expected: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (text().includes(expected)) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  throw new Error(`Text not found: ${expected}\n${text()}`);
}

async function waitForLifecycleDebounce() {
  await act(async () => {
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        PORTAL_REFERRAL_PROVIDER_FOLLOW_UP_LIFECYCLE_DEBOUNCE_MS + 10,
      ),
    );
  });
}

async function waitForReadCount(readCount: () => number, expected: number) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (readCount() >= expected) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  throw new Error(`Expected ${expected} detail reads, saw ${readCount()}`);
}

function text() {
  return container.textContent ?? "";
}

function detail(overrides: Record<string, unknown> = {}) {
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

function ack(rowVersion: number, referralId = REFERRAL_A) {
  return {
    referralId,
    matchId: null,
    currentStatus: "IN_PROGRESS",
    rowVersion,
    updatedAt: UPDATED_AT,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((fulfill, fail) => {
    resolve = fulfill;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function detailUrl(referralId = REFERRAL_A) {
  return `/api/portal/provider-referrals/${referralId}`;
}

function followUpUrl(referralId = REFERRAL_A) {
  return `/api/portal/referrals/${referralId}/follow-ups`;
}

function postCalls(fetcher: ReturnType<typeof vi.fn>) {
  return fetcher.mock.calls.filter(([, init]) => init?.method === "POST");
}
