// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunicationNoteGenerationJob } from "../../../../../lib/communication-note-generation-contract";

const mocks = vi.hoisted(() => ({
  loadJob: vi.fn(),
  replaceLocation: vi.fn(),
}));

vi.mock("../../../../../lib/communication-note-generation-job-client", () => ({
  loadCommunicationNoteGenerationJob: mocks.loadJob,
}));
vi.mock("../../../../../lib/communication-note-document-navigation", () => ({
  replaceCommunicationNoteLocation: mocks.replaceLocation,
}));
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

import { CommunicationNoteGenerationJobLoader } from "./communication-note-generation-job-loader";

const JOB_ID = "22222222-2222-4222-8222-222222222222";
const LOGIN = "/auth/login?lang=en&next=safe-job";
const DOCUMENT_ID = "44444444-4444-4444-8444-444444444444";
const REVISION_ID = "55555555-5555-4555-8555-555555555555";
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  if (vi.isFakeTimers()) {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
  container.remove();
  vi.restoreAllMocks();
});

describe("Communication Note generation job loader", () => {
  it("polls queued and running jobs with one timer, then stops on success", async () => {
    vi.useFakeTimers();
    mocks.loadJob
      .mockResolvedValueOnce(available(job("QUEUED")))
      .mockResolvedValueOnce(available(job("RUNNING")))
      .mockResolvedValueOnce(available(job("SUCCEEDED")));

    await renderLoader();
    expect(text()).toContain("Generation is queued");
    expect(mocks.loadJob).toHaveBeenCalledTimes(1);
    expectRequest(0);
    expect(vi.getTimerCount()).toBe(1);

    await act(async () => vi.advanceTimersByTimeAsync(1_500));
    expect(text()).toContain("Generating the Communication Note");
    expect(mocks.loadJob).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);

    await act(async () => vi.advanceTimersByTimeAsync(1_500));
    expect(text()).toContain("Draft generated and saved");
    expect(text()).toContain("Open saved draft");
    expect(container.querySelector<HTMLAnchorElement>('a[href*="/documents/"]')?.getAttribute("href"))
      .toBe(
        `/ai-documents/communication-note/documents/${DOCUMENT_ID}` +
          `?lang=en&revisionId=${REVISION_ID}`,
      );
    expect(vi.getTimerCount()).toBe(0);

    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(mocks.loadJob).toHaveBeenCalledTimes(3);
  });

  it("caps automatic checks at 40 and leaves one genuine manual GET", async () => {
    vi.useFakeTimers();
    mocks.loadJob.mockResolvedValue(available(job("QUEUED")));

    await renderLoader();
    await act(async () => vi.advanceTimersByTimeAsync(40 * 1_500));

    expect(mocks.loadJob).toHaveBeenCalledTimes(41);
    expect(text()).toContain("Automatic checks have paused");
    expect(vi.getTimerCount()).toBe(0);

    await clickButton("Check status");
    expect(mocks.loadJob).toHaveBeenCalledTimes(42);
    expect(text()).toContain("Automatic checks have paused");
    expect(vi.getTimerCount()).toBe(0);
    expectRequest(41);
  });

  it("clears on reauthorization and drops a late response from an older request", async () => {
    let resolveFirst!: (value: ReturnType<typeof available>) => void;
    let resolveSecond!: (value: ReturnType<typeof available>) => void;
    mocks.loadJob
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );

    await act(async () => {
      root.render(loaderElement());
    });
    const firstSignal = mocks.loadJob.mock.calls[0][0].signal as AbortSignal;
    await act(async () => window.dispatchEvent(new Event("focus")));

    expect(firstSignal.aborted).toBe(true);
    expect(text()).toContain("Checking generation status");
    await act(async () => resolveFirst(available(job("FAILED"))));
    expect(text()).not.toContain("Generation did not complete");
    await act(async () => resolveSecond(available(job("RUNNING"))));
    expect(text()).toContain("Generating the Communication Note");
  });

  it("reauthorizes on auth and browser lifecycle events", async () => {
    vi.useFakeTimers();
    mocks.loadJob.mockResolvedValue(available(job("SUCCEEDED")));
    await renderLoader();
    expect(mocks.loadJob).toHaveBeenCalledTimes(1);

    await act(async () =>
      window.dispatchEvent(new StorageEvent("storage", { key: "sb-auth" })),
    );
    await act(async () => window.dispatchEvent(new Event("online")));
    await act(async () =>
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })),
    );
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    await act(async () =>
      document.dispatchEvent(new Event("visibilitychange")),
    );

    expect(mocks.loadJob).toHaveBeenCalledTimes(5);
    for (let index = 0; index < 5; index += 1) expectRequest(index);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears and aborts before entering page history", async () => {
    mocks.loadJob.mockResolvedValueOnce(available(job("QUEUED")));
    await renderLoader();
    const initialSignal = mocks.loadJob.mock.calls[0][0].signal as AbortSignal;

    await act(async () => window.dispatchEvent(new Event("pagehide")));
    expect(initialSignal.aborted).toBe(false);
    expect(text()).toContain("Checking generation status");
    expect(text()).not.toContain("Generation is queued");
  });

  it("aborts an in-flight request on pagehide and ignores its late result", async () => {
    let resolveRequest!: (value: ReturnType<typeof available>) => void;
    mocks.loadJob.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );

    await act(async () => root.render(loaderElement()));
    const signal = mocks.loadJob.mock.calls[0][0].signal as AbortSignal;
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    expect(signal.aborted).toBe(true);
    expect(text()).toContain("Checking generation status");

    await act(async () => resolveRequest(available(job("FAILED"))));
    expect(text()).not.toContain("Generation did not complete");
  });

  it("replaces with the fixed login route when the read session is unavailable", async () => {
    mocks.loadJob.mockResolvedValueOnce({ status: "AUTH_REQUIRED" });
    await renderLoader();

    expect(mocks.replaceLocation).toHaveBeenCalledExactlyOnceWith(LOGIN);
    expect(text()).toContain("Checking generation status");
  });

  it("clears a previously visible owner job before replacing after auth expires", async () => {
    mocks.loadJob
      .mockResolvedValueOnce(available(job("SUCCEEDED")))
      .mockResolvedValueOnce({ status: "AUTH_REQUIRED" });
    await renderLoader();
    expect(text()).toContain("Draft generated and saved");

    await act(async () => window.dispatchEvent(new Event("focus")));

    expect(mocks.replaceLocation).toHaveBeenCalledExactlyOnceWith(LOGIN);
    expect(text()).not.toContain("Draft generated and saved");
    expect(text()).not.toContain("Open saved draft");
    expect(text()).toContain("Checking generation status");
  });

  it("turns an unavailable read into one real manual status check", async () => {
    mocks.loadJob
      .mockResolvedValueOnce({ status: "UNAVAILABLE" })
      .mockResolvedValueOnce(available(job("FAILED")));
    await renderLoader();

    expect(text()).toContain("Generation status is temporarily unavailable");
    await clickButton("Check status");
    expect(mocks.loadJob).toHaveBeenCalledTimes(2);
    expect(text()).toContain("Generation did not complete");
    expectRequest(1);
  });

  it("maps parser or transport errors to the fixed content-free unavailable state", async () => {
    mocks.loadJob.mockRejectedValueOnce(
      new Error("private-server-message observable_facts"),
    );
    await renderLoader();

    expect(text()).toContain("Generation status is temporarily unavailable");
    expect(text()).not.toContain("private-server-message");
    expect(text()).not.toContain("observable_facts");
  });
});

async function renderLoader() {
  await act(async () => root.render(loaderElement()));
}

function loaderElement() {
  return (
    <CommunicationNoteGenerationJobLoader
      jobId={JOB_ID}
      locale="en"
      loginHref={LOGIN}
      unsupportedLocale={false}
    />
  );
}

function available(value: CommunicationNoteGenerationJob) {
  return { status: "AVAILABLE" as const, job: value };
}

function expectRequest(index: number) {
  const input = mocks.loadJob.mock.calls[index]?.[0];
  expect(input).toEqual({
    jobId: JOB_ID,
    signal: expect.any(AbortSignal),
  });
  expect(Object.keys(input)).toEqual(["jobId", "signal"]);
}

async function clickButton(label: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.includes(label),
  );
  if (!button) throw new Error(`Missing button: ${label}`);
  await act(async () => button.click());
}

function text() {
  return container.textContent ?? "";
}

function job(status: CommunicationNoteGenerationJob["status"]): CommunicationNoteGenerationJob {
  const base = {
    jobId: JOB_ID,
    noteType: "communication" as const,
    serviceCode: "note.communication.generate" as const,
    createdAt: "2026-09-07T01:00:00.000Z",
  };
  if (status === "QUEUED") {
    return {
      ...base,
      status,
      attemptCount: 0,
      updatedAt: base.createdAt,
    };
  }

  const startedAt = "2026-09-07T01:00:01.000Z";
  const finishedAt = "2026-09-07T01:00:02.000Z";
  const activeBase = {
    ...base,
    attemptCount: 1,
    startedAt,
    updatedAt: status === "RUNNING" ? startedAt : finishedAt,
  };
  if (status === "RUNNING") return { ...activeBase, status };
  if (status === "SUCCEEDED") {
    return {
      ...activeBase,
      status,
      finishedAt,
      result: {
        canonicalId: DOCUMENT_ID,
        revisionId: REVISION_ID,
        contentHash: "a".repeat(64),
        revisionNumber: 1,
        baseRevisionId: null,
        saveState: "SERVER_ACKNOWLEDGED",
      },
    };
  }
  if (status === "FAILED") {
    return {
      ...activeBase,
      status,
      finishedAt,
      failureCode: "GENERATION_FAILED",
    };
  }
  return { ...activeBase, status: "CANCELLED", finishedAt };
}
