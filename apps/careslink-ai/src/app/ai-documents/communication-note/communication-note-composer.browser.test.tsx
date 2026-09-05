// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", async () => {
  const React = await import("react");

  return {
    default: ({
      priority,
      ...props
    }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => {
      void priority;
      return React.createElement("img", props);
    },
  };
});

import { CommunicationNoteComposer } from "./communication-note-composer";
import { getCommunicationNoteGenerationErrorMessage } from "../../../lib/communication-note-generation-contract";

type ComposerLocale = React.ComponentProps<typeof CommunicationNoteComposer>["locale"];
const ERROR_COPY_CASES = [
  {
    locale: "en", reason: "The server reports insufficient Points.",
    snapshot: "The page-load balance snapshot may be out of date.",
    generic: "The server did not confirm whether this exact request was accepted.",
    transport: "Generation status cannot be confirmed right now.",
    replay: "Check status safely",
  },
  {
    locale: "zh-Hans", reason: "服务器报告 Points 余额不足。",
    snapshot: "页面载入时的余额快照可能已过期。",
    generic: "服务器未确认是否已接纳此精确请求。",
    transport: "暂时无法确认生成状态。", replay: "安全查询状态",
  },
  {
    locale: "zh-Hant", reason: "伺服器回報 Points 餘額不足。",
    snapshot: "頁面載入時的餘額快照可能已過期。",
    generic: "伺服器未確認是否已接納此精確請求。",
    transport: "暫時無法確認生成狀態。", replay: "安全查詢狀態",
  },
] as const;

const AVAILABLE_POINTS_PREVIEW = {
  status: "AVAILABLE" as const,
  unit: "POINTS" as const,
  serviceCode: "note.communication.generate" as const,
  catalogVersion: "2026-08-09.v1-shadow",
  generationCostPoints: 20,
  availablePoints: 300,
  reservedPoints: 0,
  canAfford: true,
};

const LOCAL_CLIENT_MODULE_PATHS = [
  "src/app/ai-documents/communication-note/communication-note-composer.tsx",
  "src/lib/communication-note-composer.ts",
  "src/lib/communication-note-points-preview.ts",
] as const;

const FIELD_NAMES = [
  "occurred_at",
  "contact_channel",
  "parties_by_role",
  "observable_facts",
  "action_taken",
  "stated_outcome",
  "follow_up",
] as const;

const REQUIRED_FIELD_NAMES = FIELD_NAMES.slice(0, 5);
const IDENTIFIERS = [
  "Name: Jane Smith",
  "worker@example.test",
  "0412 345 678",
  "NDIS number: 123456789",
  "Address: 12 Smith Street Melbourne VIC 3000",
  "DOB: 01/02/1980",
] as const;

let container: HTMLDivElement;
let root: Root;
let originalSendBeaconDescriptor: PropertyDescriptor | undefined;
let animationFrameCallbacks: FrameRequestCallback[];

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(
    { boundary: "safe-baseline" },
    "",
    "/ai-documents/communication-note?lang=en",
  );

  animationFrameCallbacks = [];
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      animationFrameCallbacks.push(callback);
      return animationFrameCallbacks.length;
    }),
  );

  originalSendBeaconDescriptor = Object.getOwnPropertyDescriptor(
    window.navigator,
    "sendBeacon",
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  if (vi.isFakeTimers()) {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();

  if (originalSendBeaconDescriptor) {
    Object.defineProperty(
      window.navigator,
      "sendBeacon",
      originalSendBeaconDescriptor,
    );
  } else {
    Reflect.deleteProperty(window.navigator, "sendBeacon");
  }

  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("Communication Note composer browser boundary", () => {
  it("keeps every local-only client module free of network and persistence APIs", () => {
    for (const relativePath of LOCAL_CLIENT_MODULE_PATHS) {
      const source = readFileSync(
        resolve(process.cwd(), relativePath),
        "utf8",
      );

      expect(source, relativePath).not.toMatch(
        /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|caches|serviceWorker)\b|document\.cookie/,
      );
      expect(source, relativePath).not.toMatch(/["'`]\/api\//);
      expect(source, relativePath).not.toMatch(
        /\bhistory\.(?:pushState|replaceState)\b/,
      );
    }
  });

  it("exposes labelled controls and moves focus to linked validation errors", async () => {
    await renderComposer();

    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelectorAll("form")).toHaveLength(1);
    expect(container.querySelector("form")?.getAttribute("aria-label")).toBe(
      "Communication Note structured facts",
    );
    expect(container.querySelectorAll("fieldset legend").length).toBeGreaterThan(
      0,
    );

    for (const fieldName of FIELD_NAMES) {
      const control = getField(fieldName);
      expect(control.id).not.toBe("");
      expect(
        container.querySelector(`label[for="${control.id}"]`),
        fieldName,
      ).not.toBeNull();
      expect(control.getAttribute("autocomplete")).toBe("off");
      expect(control.getAttribute("spellcheck")).toBe("false");
    }

    for (const fieldName of REQUIRED_FIELD_NAMES) {
      expect(getField(fieldName).required, fieldName).toBe(true);
    }
    expect(getField("stated_outcome").required).toBe(false);
    expect(getField("follow_up").required).toBe(false);
    expect(container.querySelector("button:not([type])")).toBeNull();
    expect(container.querySelectorAll('button[type="submit"]')).toHaveLength(1);

    const generationButton = getDisabledGenerationButton();
    const boundaryId = generationButton.getAttribute("aria-describedby");
    expect(boundaryId).toBe("communication-note-generation-boundary");
    expect(document.getElementById(boundaryId ?? "")?.textContent).toContain(
      "This shadow preview is read only and not active. Viewing it does not reserve or use Points",
    );
    expect(text()).toContain("Shadow balance: 300 available · 0 already reserved");
    expect(text()).toContain(
      "If this preview is activated, a generation would cost 20 Points",
    );

    await clickButton("Review facts and privacy");
    await flushAnimationFrames();

    const summary = container.querySelector<HTMLElement>('[role="alert"]');
    expect(summary?.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(summary);

    for (const fieldName of REQUIRED_FIELD_NAMES) {
      const control = getField(fieldName);
      expect(control.getAttribute("aria-invalid"), fieldName).toBe("true");
      const describedBy = control
        .getAttribute("aria-describedby")
        ?.split(/\s+/)
        .filter(Boolean);
      expect(describedBy?.length, fieldName).toBeGreaterThan(0);
      expect(
        describedBy?.some((id) => document.getElementById(id)?.textContent),
        fieldName,
      ).toBe(true);
    }

    await act(async () => {
      setNativeValue(
        getField("occurred_at"),
        "2026-09-01T14:30:00+10:00",
      );
      getField("occurred_at").dispatchEvent(
        new Event("input", { bubbles: true }),
      );
    });
    expect(container.querySelector('[role="alert"]')).toBeNull();
    for (const fieldName of REQUIRED_FIELD_NAMES) {
      expect(getField(fieldName).getAttribute("aria-invalid"), fieldName).toBeNull();
    }
  });

  it("sanitises identifiers, completes local confirmations, and performs zero I/O", async () => {
    const io = installBrowserIoSpies();
    const startingUrl = window.location.href;

    await renderComposer();
    await fillFields({
      occurred_at: "2026-09-01T14:30:00+10:00",
      contact_channel: "Phone",
      parties_by_role: "Name: Jane Smith\nSupport worker",
      observable_facts:
        "The caller used worker@example.test and 0412 345 678.",
      action_taken: "The worker recorded NDIS number: 123456789.",
      stated_outcome: "Address: 12 Smith Street Melbourne VIC 3000",
      follow_up: "DOB: 01/02/1980",
    });

    await submitLocalReview();
    expect(text()).toContain("obvious identifier findings");
    expect(text()).toContain("Apply clean-up and review again");
    for (const identifier of IDENTIFIERS) {
      expect(reviewPanelText()).not.toContain(identifier);
    }

    await clickButton("Apply clean-up and review again");
    for (const fieldName of FIELD_NAMES) {
      for (const identifier of IDENTIFIERS) {
        expect(getField(fieldName).value).not.toContain(identifier);
      }
    }

    const confirmations = [
      ...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ];
    expect(confirmations).toHaveLength(2);
    expect(confirmations.every(({ checked }) => !checked)).toBe(true);
    for (const confirmation of confirmations) {
      expect(
        container.querySelector(`label[for="${confirmation.id}"]`),
      ).not.toBeNull();
      await act(async () => confirmation.click());
    }

    const generationButton = getDisabledGenerationButton();
    expect(generationButton.textContent).toContain(
      "Ready locally · generation unavailable",
    );
    expect(generationButton.disabled).toBe(true);

    expect(window.location.href).toBe(startingUrl);
    expect(window.history.state).toEqual({ boundary: "safe-baseline" });
    expect(io.pushState).not.toHaveBeenCalled();
    expect(io.replaceState).not.toHaveBeenCalled();
    expect(container.querySelector("form")).not.toBeNull();
    expect(container.querySelector('button[type="submit"]')).not.toBeNull();

    const navigationSurface = [
      window.location.href,
      JSON.stringify(window.history.state),
      ...[...container.querySelectorAll<HTMLAnchorElement>("a")].map(
        (anchor) => anchor.getAttribute("href") ?? "",
      ),
    ].join(" ");
    for (const identifier of IDENTIFIERS) {
      expect(navigationSurface).not.toContain(identifier);
    }

    expectNoBrowserIo(io);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);

    await act(async () => root.unmount());
    root = createRoot(container);
    await renderComposer();

    for (const fieldName of FIELD_NAMES) {
      expect(getField(fieldName).value, fieldName).toBe("");
    }
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expectNoBrowserIo(io);
  });

  it("submits immutable reviewed bytes once and safely replays the same idempotency key", async () => {
    vi.useFakeTimers();
    const idempotencyKey = "11111111-1111-4111-8111-111111111111";
    vi.spyOn(window.crypto, "randomUUID").mockReturnValue(idempotencyKey);
    const createdAt = "2026-09-03T02:00:00.000Z";
    const fetcher = vi.fn()
      .mockResolvedValueOnce({
        status: 202,
        json: async () => ({ created: true, job: {
          jobId: "22222222-2222-4222-8222-222222222222",
          status: "QUEUED", noteType: "communication",
          serviceCode: "note.communication.generate", attemptCount: 0,
          createdAt, updatedAt: createdAt,
        } }),
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ created: false, job: {
          jobId: "22222222-2222-4222-8222-222222222222",
          status: "RUNNING", noteType: "communication",
          serviceCode: "note.communication.generate", attemptCount: 1,
          createdAt, updatedAt: "2026-09-03T02:00:01.000Z",
          startedAt: "2026-09-03T02:00:00.500Z",
        } }),
      });
    vi.stubGlobal("fetch", fetcher);

    await renderComposer(true);
    await fillFields({
      occurred_at: "2026-09-01T14:30:00+10:00",
      contact_channel: "Phone",
      parties_by_role: "Support worker\nFamily representative",
      observable_facts: "The family representative requested an update.",
      action_taken: "The support worker provided the recorded update.",
      stated_outcome: "The family representative acknowledged the update.",
      follow_up: "The support worker will record any further contact.",
    });
    await submitLocalReview();
    for (const checkbox of container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
      await act(async () => checkbox.click());
    }

    const submit = container.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(submit?.disabled).toBe(false);
    await act(async () => {
      submit?.click();
      submit?.click();
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const firstInit = fetcher.mock.calls[0]?.[1] as RequestInit;
    const firstBody = firstInit.body;
    expect(firstInit.headers).toEqual({
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    });
    const parsedBody = JSON.parse(String(firstBody)) as Record<string, unknown>;
    expect(Object.keys(parsedBody).sort()).toEqual([
      "cleanedFacts",
      "privacyReview",
      "sourceLocale",
    ]);
    expect(parsedBody).toMatchObject({
      privacyReview: {
        reviewedNoIdentifiers: true,
        processingAuthorityConfirmed: true,
      },
    });
    expect(String(firstBody)).not.toMatch(
      /userId|ownerUserId|sessionId|accessToken|authorization/i,
    );
    expect(getField("observable_facts").disabled).toBe(true);
    expect(text()).toContain("Points are reserved by the server");
    expect(vi.getTimerCount()).toBe(1);
    expect(
      [...container.querySelectorAll<HTMLButtonElement>("button")].some(
        (button) => button.textContent?.includes("Check status safely"),
      ),
    ).toBe(false);

    await act(async () => vi.advanceTimersByTimeAsync(1500));
    expect(fetcher).toHaveBeenCalledTimes(2);
    const secondInit = fetcher.mock.calls[1]?.[1] as RequestInit;
    expect(secondInit.body).toBe(firstBody);
    expect(secondInit.headers).toEqual(firstInit.headers);
    expect(text()).toContain("Generation is running");
    expect(vi.getTimerCount()).toBe(1);

    const signal = secondInit.signal as AbortSignal;
    await act(async () => root.unmount());
    root = createRoot(container);
    expect(signal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it("stops polling after a terminal response", async () => {
    vi.useFakeTimers();
    vi.spyOn(window.crypto, "randomUUID").mockReturnValue(
      "11111111-1111-4111-8111-111111111111",
    );
    const createdAt = "2026-09-03T02:00:00.000Z";
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        status: 202,
        json: async () => ({
          created: true,
          job: {
            jobId: "22222222-2222-4222-8222-222222222222",
            status: "QUEUED",
            noteType: "communication",
            serviceCode: "note.communication.generate",
            attemptCount: 0,
            createdAt,
            updatedAt: createdAt,
          },
        }),
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          created: false,
          job: {
            jobId: "22222222-2222-4222-8222-222222222222",
            status: "FAILED",
            noteType: "communication",
            serviceCode: "note.communication.generate",
            attemptCount: 1,
            createdAt,
            updatedAt: "2026-09-03T02:00:02.000Z",
            startedAt: "2026-09-03T02:00:00.500Z",
            finishedAt: "2026-09-03T02:00:02.000Z",
            failureCode: "GENERATION_FAILED",
          },
        }),
      });
    vi.stubGlobal("fetch", fetcher);

    await prepareConnectedSubmission();
    await act(async () =>
      container.querySelector<HTMLButtonElement>('button[type="submit"]')?.click(),
    );
    expect(vi.getTimerCount()).toBe(1);
    await act(async () => vi.advanceTimersByTimeAsync(1_500));
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(text()).toContain("generation failed");
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("pauses after 40 automatic polls and keeps manual replay byte-identical", async () => {
    vi.useFakeTimers();
    const idempotencyKey = "11111111-1111-4111-8111-111111111111";
    vi.spyOn(window.crypto, "randomUUID").mockReturnValue(idempotencyKey);
    const createdAt = "2026-09-03T02:00:00.000Z";
    let callCount = 0;
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => {
        void _input;
        void _init;
        callCount += 1;
        const created = callCount === 1;
        return {
          status: created ? 202 : 200,
          json: async () => ({
            created,
            job: {
              jobId: "22222222-2222-4222-8222-222222222222",
              status: "QUEUED",
              noteType: "communication",
              serviceCode: "note.communication.generate",
              attemptCount: 0,
              createdAt,
              updatedAt: createdAt,
            },
          }),
        };
      },
    );
    vi.stubGlobal("fetch", fetcher);

    await prepareConnectedSubmission();
    await act(async () =>
      container.querySelector<HTMLButtonElement>('button[type="submit"]')?.click(),
    );
    const firstInit = fetcher.mock.calls[0]?.[1] as RequestInit;

    await act(async () => vi.advanceTimersByTimeAsync(40 * 1_500));
    expect(fetcher).toHaveBeenCalledTimes(41);
    expect(text()).toContain("Automatic status checks have paused");
    expect(vi.getTimerCount()).toBe(0);

    await clickButton("Check status safely");
    expect(fetcher).toHaveBeenCalledTimes(42);
    const manualInit = fetcher.mock.calls[41]?.[1] as RequestInit;
    expect(manualInit.body).toBe(firstInit.body);
    expect(manualInit.headers).toEqual(firstInit.headers);
    expect(manualInit.headers).toEqual({
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(ERROR_COPY_CASES)("explains insufficient Points in $locale while preserving the exact locked request", async (copy) => {
    vi.useFakeTimers();
    const uuid = vi.spyOn(window.crypto, "randomUUID").mockReturnValue(
      "11111111-1111-4111-8111-111111111111",
    );
    const fetcher = mockGenerationError(409, "POINTS_INSUFFICIENT",
      getCommunicationNoteGenerationErrorMessage("POINTS_INSUFFICIENT"));
    vi.stubGlobal("fetch", fetcher);
    await prepareConnectedSubmission(copy.locale);
    const points = container.querySelector('[aria-labelledby="communication-note-points-title"]');
    const initialBalance = points?.textContent;
    const submit = container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submit.disabled).toBe(false);
    await act(async () => submit.click());

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(copy.reason);
    expect(alert?.textContent).toContain(copy.snapshot);
    expect(alert?.textContent).toContain(copy.generic);
    expect(alert?.textContent).toContain(copy.replay);
    expect(points?.textContent).toBe(initialBalance);
    expect(submit.disabled).toBe(true);
    for (const field of FIELD_NAMES) expect(getField(field).disabled).toBe(true);
    expect(vi.getTimerCount()).toBe(0);

    await act(async () => submit.click());
    expect(fetcher).toHaveBeenCalledTimes(1);
    await clickButton(copy.replay);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const firstRequest = fetcher.mock.calls[0][1];
    const replayRequest = fetcher.mock.calls[1][1];
    expect(replayRequest?.body).toBe(firstRequest?.body);
    expect(replayRequest?.headers).toEqual(firstRequest?.headers);
    expect(uuid).toHaveBeenCalledTimes(1);
    expect(submit.disabled).toBe(true);
    expect(points?.textContent).toBe(initialBalance);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(ERROR_COPY_CASES)("keeps the generic response warning for other registered errors in $locale", async (copy) => {
    vi.stubGlobal("fetch", mockGenerationError(502, "GENERATION_FAILED",
      getCommunicationNoteGenerationErrorMessage("GENERATION_FAILED")));
    await prepareConnectedSubmission(copy.locale);
    await act(async () => container.querySelector<HTMLButtonElement>('button[type="submit"]')?.click());
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(copy.generic);
    expect(alert?.textContent).not.toContain(copy.reason);
    expect(alert?.textContent).not.toContain(copy.snapshot);
    expect(getDisabledGenerationButton()).toBeDefined();
  });

  it.each(ERROR_COPY_CASES.flatMap((copy) => [
    { ...copy, code: "POINTS_INSUFFICIENT" },
    { ...copy, code: "UNKNOWN_ERROR" },
  ]))("uses the safe fallback for untrusted $code responses in $locale", async (copy) => {
    const untrustedMessage = "private-server-message <script>unsafe</script>";
    vi.stubGlobal("fetch", mockGenerationError(409, copy.code, untrustedMessage));
    await prepareConnectedSubmission(copy.locale);
    await act(async () => container.querySelector<HTMLButtonElement>('button[type="submit"]')?.click());
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(copy.transport);
    expect(alert?.textContent).not.toContain(copy.reason);
    expect(container.textContent).not.toContain(untrustedMessage);
    expect(alert?.querySelector("script")).toBeNull();
    expect(getDisabledGenerationButton()).toBeDefined();
  });

  it("aborts an in-flight status request when the composer unmounts", async () => {
    let requestSignal: AbortSignal | undefined;
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestSignal = init?.signal ?? undefined;
        return await new Promise<Pick<Response, "json" | "status">>(() => {});
      },
    );
    vi.stubGlobal("fetch", fetcher);

    await prepareConnectedSubmission();
    act(() => {
      container.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(requestSignal?.aborted).toBe(false);

    await act(async () => root.unmount());
    root = createRoot(container);
    expect(requestSignal?.aborted).toBe(true);
  });

  it.each([
    { status: "UNAVAILABLE" as const, unit: "POINTS" as const },
    {
      status: "NOT_READY" as const,
      unit: "POINTS" as const,
      serviceCode: "note.communication.generate" as const,
      catalogVersion: "2026-09.test",
      generationCostPoints: 20,
    },
    { ...AVAILABLE_POINTS_PREVIEW, canAfford: false, availablePoints: 0 },
  ])("keeps generation at zero requests when Points cannot admit it", async (pointsPreview) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await renderComposer(true, pointsPreview);
    const submit = container.querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(submit?.disabled).toBe(true);
    await act(async () => submit?.click());
    expect(fetcher).not.toHaveBeenCalled();
  });
});

async function renderComposer(
  generationAvailable = false,
  pointsPreview: React.ComponentProps<typeof CommunicationNoteComposer>["pointsPreview"] = AVAILABLE_POINTS_PREVIEW,
  locale: ComposerLocale = "en",
) {
  await act(async () => {
    root.render(
      <CommunicationNoteComposer
        locale={locale}
        pointsPreview={pointsPreview}
        generationAvailable={generationAvailable}
      />,
    );
  });
}

async function prepareConnectedSubmission(locale: ComposerLocale = "en") {
  await renderComposer(true, AVAILABLE_POINTS_PREVIEW, locale);
  await fillFields({
    occurred_at: "2026-09-01T14:30:00+10:00",
    contact_channel: "Phone",
    parties_by_role: "Support worker\nFamily representative",
    observable_facts: "The family representative requested an update.",
    action_taken: "The support worker provided the recorded update.",
    stated_outcome: "The family representative acknowledged the update.",
    follow_up: "The support worker will record any further contact.",
  });
  await submitLocalReview(locale);
  for (const checkbox of container.querySelectorAll<HTMLInputElement>(
    'input[type="checkbox"]',
  )) {
    await act(async () => checkbox.click());
  }
}

function getField(fieldName: (typeof FIELD_NAMES)[number]) {
  const control = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[name="${fieldName}"]`,
  );
  if (!control) {
    throw new Error(`Missing Communication Note field: ${fieldName}`);
  }
  return control;
}

async function fillFields(
  values: Record<(typeof FIELD_NAMES)[number], string>,
) {
  await act(async () => {
    for (const fieldName of FIELD_NAMES) {
      setNativeValue(getField(fieldName), values[fieldName]);
      getField(fieldName).dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
}

function setNativeValue(
  control: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const prototype =
    control instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) {
    throw new Error("Native value setter is unavailable");
  }
  setter.call(control, value);
}

async function submitLocalReview(locale: ComposerLocale = "en") {
  await clickButton({ en: "Review facts and privacy", "zh-Hans": "检查事实与隐私", "zh-Hant": "檢查事實與隱私" }[locale]);
  await flushAnimationFrames();
}

function mockGenerationError(status: number, code: string, message: string) {
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    void _input;
    void _init;
    return { status, json: async () => ({ error: {
      code, message, correlationId: "22222222-2222-4222-8222-222222222222",
    } }) };
  });
}

async function flushAnimationFrames() {
  const callbacks = animationFrameCallbacks.splice(0);
  await act(async () => {
    for (const callback of callbacks) {
      callback(performance.now());
    }
  });
}

async function clickButton(label: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.includes(label),
  );
  if (!button) {
    throw new Error(`Missing button: ${label}`);
  }
  await act(async () => button.click());
}

function getDisabledGenerationButton() {
  const button = container.querySelector<HTMLButtonElement>(
    'button[type="submit"][disabled][aria-describedby="communication-note-generation-boundary"]',
  );
  if (!button) {
    throw new Error("Disabled generation boundary was not rendered");
  }
  return button;
}

function reviewPanelText() {
  return (
    container.querySelector('[aria-labelledby="communication-note-review-title"]')
      ?.textContent ?? ""
  );
}

function text() {
  return container.textContent ?? "";
}

function installBrowserIoSpies() {
  const fetcher = vi.fn();
  const webSocket = vi.fn();
  const eventSource = vi.fn();
  const sendBeacon = vi.fn();

  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("WebSocket", webSocket);
  vi.stubGlobal("EventSource", eventSource);
  Object.defineProperty(window.navigator, "sendBeacon", {
    configurable: true,
    value: sendBeacon,
  });

  return {
    fetcher,
    webSocket,
    eventSource,
    sendBeacon,
    xhrOpen: vi.spyOn(XMLHttpRequest.prototype, "open"),
    xhrSend: vi.spyOn(XMLHttpRequest.prototype, "send"),
    storageGet: vi.spyOn(Storage.prototype, "getItem"),
    storageSet: vi.spyOn(Storage.prototype, "setItem"),
    storageRemove: vi.spyOn(Storage.prototype, "removeItem"),
    storageClear: vi.spyOn(Storage.prototype, "clear"),
    pushState: vi.spyOn(window.history, "pushState"),
    replaceState: vi.spyOn(window.history, "replaceState"),
  };
}

function expectNoBrowserIo(io: ReturnType<typeof installBrowserIoSpies>) {
  expect(io.fetcher).not.toHaveBeenCalled();
  expect(io.xhrOpen).not.toHaveBeenCalled();
  expect(io.xhrSend).not.toHaveBeenCalled();
  expect(io.webSocket).not.toHaveBeenCalled();
  expect(io.eventSource).not.toHaveBeenCalled();
  expect(io.sendBeacon).not.toHaveBeenCalled();
  expect(io.storageGet).not.toHaveBeenCalled();
  expect(io.storageSet).not.toHaveBeenCalled();
  expect(io.storageRemove).not.toHaveBeenCalled();
  expect(io.storageClear).not.toHaveBeenCalled();
}
