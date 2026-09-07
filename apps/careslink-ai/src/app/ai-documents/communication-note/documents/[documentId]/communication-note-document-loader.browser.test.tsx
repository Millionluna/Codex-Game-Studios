// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunicationNoteAvailableDocument } from "../../../../../lib/communication-note-document-contract";
import { createValidCaresLinkV1CleanedFacts } from "../../../../../lib/v1/cleaned-facts-test-fixtures";

const mocks = vi.hoisted(() => ({
  loadDocument: vi.fn(),
  replaceLocation: vi.fn(),
  confirmReview: vi.fn(),
  saveEdit: vi.fn(),
}));

vi.mock("../../../../../lib/communication-note-self-review-client", () => ({
  confirmCommunicationNoteSelfReview: mocks.confirmReview,
}));
vi.mock("../../../../../lib/communication-note-edit-client", () => ({ saveCommunicationNoteEdit: mocks.saveEdit }));

vi.mock("../../../../../lib/communication-note-document-client", () => ({
  loadCommunicationNoteDocument: mocks.loadDocument,
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

import { CommunicationNoteDocumentLoader } from "./communication-note-document-loader";

const DOC = "10000000-0000-4000-8000-000000000001";
const REV = "20000000-0000-4000-8000-000000000001";
const LOGIN = "/auth/login?next=safe";
const NOW = "2026-09-07T01:00:00.000Z";
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  mocks.confirmReview.mockReset();
  mocks.saveEdit.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("Communication Note private result loader", () => {
  it("loads only after mount, then clears and reauthorizes on focus", async () => {
    mocks.loadDocument.mockResolvedValueOnce(documentResult("First private draft"));
    await renderLoader();

    expect(container.textContent).toContain("First private draft");
    expect(mocks.loadDocument).toHaveBeenCalledTimes(1);
    const firstSignal = mocks.loadDocument.mock.calls[0][0].signal as AbortSignal;
    expect(firstSignal.aborted).toBe(false);

    let resolveSecond!: (value: CommunicationNoteAvailableDocument) => void;
    mocks.loadDocument.mockImplementationOnce(
      () =>
        new Promise<CommunicationNoteAvailableDocument>((resolve) => {
          resolveSecond = resolve;
        }),
    );
    await act(async () => window.dispatchEvent(new Event("focus")));

    expect(firstSignal.aborted).toBe(true);
    expect(container.textContent).not.toContain("First private draft");
    expect(container.textContent).toContain("Checking saved draft access");

    await act(async () => resolveSecond(documentResult("Second private draft")));
    expect(container.textContent).toContain("Second private draft");
    expect(container.textContent).not.toContain("First private draft");
  });

  it("drops a late response from an older principal generation", async () => {
    let resolveFirst!: (value: CommunicationNoteAvailableDocument) => void;
    let resolveSecond!: (value: CommunicationNoteAvailableDocument) => void;
    mocks.loadDocument
      .mockImplementationOnce(
        () =>
          new Promise<CommunicationNoteAvailableDocument>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<CommunicationNoteAvailableDocument>((resolve) => {
            resolveSecond = resolve;
          }),
      );

    await act(async () => {
      root.render(loaderElement());
    });
    await act(async () => window.dispatchEvent(new StorageEvent("storage")));
    expect(mocks.loadDocument).toHaveBeenCalledTimes(2);

    await act(async () => resolveFirst(documentResult("Stale private draft")));
    expect(container.textContent).not.toContain("Stale private draft");

    await act(async () => resolveSecond(documentResult("Fresh private draft")));
    expect(container.textContent).toContain("Fresh private draft");
  });

  it("clears content and aborts the active read before entering page history", async () => {
    mocks.loadDocument.mockResolvedValueOnce(documentResult("Private draft"));
    await renderLoader();
    const signal = mocks.loadDocument.mock.calls[0][0].signal as AbortSignal;

    await act(async () => window.dispatchEvent(new Event("pagehide")));
    expect(signal.aborted).toBe(true);
    expect(container.textContent).not.toContain("Private draft");
    expect(container.textContent).toContain("Checking saved draft access");
  });

  it("replaces the page with the fixed login route when API auth is no longer valid", async () => {
    mocks.loadDocument.mockResolvedValueOnce({ status: "AUTH_REQUIRED" });
    await renderLoader();

    expect(mocks.replaceLocation).toHaveBeenCalledExactlyOnceWith(LOGIN);
    expect(container.textContent).toContain("Checking saved draft access");
  });

  it("maps transport and parser failures to a content-free retry state", async () => {
    mocks.loadDocument.mockRejectedValueOnce(
      new Error("private provider and database details"),
    );
    await renderLoader();

    expect(container.textContent).toContain("temporarily unavailable");
    expect(container.textContent).not.toContain("private provider");
  });
});

describe("revision-bound human self-review interaction", () => {
  it("requires all three explicit checks, blocks double submit, and re-reads only after ACK", async () => {
    mocks.loadDocument.mockResolvedValueOnce(documentResult("Synthetic draft"));
    let resolveWrite!: (value: { status: "CONFIRMED" }) => void;
    mocks.confirmReview.mockImplementationOnce(() => new Promise(resolve => { resolveWrite = resolve; }));
    await renderLoader();
    expect(reviewButton().disabled).toBe(true);
    const checks = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(checks).toHaveLength(3);
    await act(async () => { checks[0].click(); checks[1].click(); });
    expect(reviewButton().disabled).toBe(true); expect(mocks.confirmReview).not.toHaveBeenCalled();
    await act(async () => checks[2].click());
    await submitReview(); await submitReview();
    expect(mocks.confirmReview).toHaveBeenCalledTimes(1);
    expect(mocks.loadDocument).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Saving confirmation");
    expect(container.textContent).not.toContain("Self-review confirmed");
    expect(mocks.confirmReview.mock.calls[0][0]).toMatchObject({ canonicalId: DOC,
      request: { revisionId: REV, factsConfirmed: true, wordingConfirmed: true, missingFactsReviewed: true },
      mutationId: expect.stringMatching(/^[a-f0-9-]{36}$/),
    });
    mocks.loadDocument.mockResolvedValueOnce({ ...documentResult("Synthetic draft"), selfReviewStatus: "CONFIRMED" });
    await act(async () => resolveWrite({ status: "CONFIRMED" }));
    expect(mocks.loadDocument).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Self-review confirmed");
    expect(container.textContent).toContain("Draft – review required");
    expect(container.querySelector("form")).toBeNull();
  });
  it("keeps an ambiguous result unconfirmed and reuses the command key only on explicit retry", async () => {
    mocks.loadDocument.mockResolvedValueOnce(documentResult("Synthetic draft"));
    mocks.confirmReview.mockResolvedValue({ status: "UNAVAILABLE" });
    await renderLoader(); await checkAll(); await submitReview();
    expect(container.textContent).toContain("The save result is not confirmed");
    expect(container.textContent).not.toContain("Self-review confirmed");
    expect(mocks.confirmReview).toHaveBeenCalledTimes(1);
    await submitReview();
    expect(mocks.confirmReview).toHaveBeenCalledTimes(2);
    expect(mocks.confirmReview.mock.calls[0][0].mutationId).toBe(mocks.confirmReview.mock.calls[1][0].mutationId);
  });
  it("does not permit submitting an obsolete revision after a 409", async () => {
    mocks.loadDocument.mockResolvedValueOnce(documentResult("Synthetic draft"));
    mocks.confirmReview.mockResolvedValue({ status: "STALE_REVISION" });
    await renderLoader(); await checkAll(); await submitReview();
    expect(container.textContent).toContain("The version has changed");
    const currentLink = [...container.querySelectorAll("a")].find(a => a.textContent === "Open current version")!;
    expect(currentLink.getAttribute("href")).toBe(`/ai-documents/communication-note/documents/${DOC}?lang=en`);
    await submitReview(); expect(mocks.confirmReview).toHaveBeenCalledTimes(1);
  });
  it.each(["AUTH_REQUIRED", "NOT_FOUND"] as const)("clears private content on %s", async status => {
    mocks.loadDocument.mockResolvedValueOnce(documentResult("Private synthetic draft"));
    mocks.confirmReview.mockResolvedValue({ status });
    await renderLoader(); await checkAll(); await submitReview();
    expect(container.textContent).not.toContain("Private synthetic draft");
    if (status === "AUTH_REQUIRED") expect(mocks.replaceLocation).toHaveBeenCalledWith(LOGIN);
    else expect(mocks.replaceLocation).not.toHaveBeenCalled();
  });
  it("aborts a write on access recheck and ignores its late success", async () => {
    mocks.loadDocument.mockResolvedValueOnce(documentResult("Old private draft"));
    let resolveWrite!: (value: { status: "CONFIRMED" }) => void;
    mocks.confirmReview.mockImplementationOnce(() => new Promise(resolve => { resolveWrite = resolve; }));
    await renderLoader(); await checkAll(); await submitReview();
    const signal = mocks.confirmReview.mock.calls[0][0].signal as AbortSignal;
    mocks.loadDocument.mockResolvedValueOnce(documentResult("New principal draft"));
    await act(async () => window.dispatchEvent(new StorageEvent("storage")));
    expect(signal.aborted).toBe(true);
    await act(async () => resolveWrite({ status: "CONFIRMED" }));
    expect(mocks.loadDocument).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("New principal draft");
    expect(container.textContent).not.toContain("Self-review confirmed");
    expect([...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].every(check => !check.checked)).toBe(true);
  });
  it("offers no mutation on a historical version", async () => {
    mocks.loadDocument.mockResolvedValueOnce({ ...documentResult("History"), isCurrentRevision: false, selfReviewStatus: "UNKNOWN" });
    await renderLoader();
    expect(container.querySelector("form")).toBeNull(); expect(mocks.confirmReview).not.toHaveBeenCalled();
  });
  it("does not infer confirmation from a successful write when the re-read is unavailable", async () => {
    mocks.loadDocument.mockResolvedValueOnce(documentResult("Synthetic draft")).mockResolvedValueOnce({ status: "UNAVAILABLE" });
    mocks.confirmReview.mockResolvedValueOnce({ status: "CONFIRMED" });
    await renderLoader(); await checkAll(); await submitReview();
    expect(container.textContent).toContain("temporarily unavailable");
    expect(container.textContent).not.toContain("Self-review confirmed");
  });
});

describe("wording editor", () => {
  it("hides old confirmation during editing, requires a change/check, and resets the check after typing", async () => {
    mocks.loadDocument.mockResolvedValue({ ...documentResult("Original"), selfReviewStatus: "CONFIRMED" });
    await renderLoader(); await openEditor();
    expect(container.textContent).toContain("Edits are not saved"); expect(container.textContent).not.toContain("Self-review confirmed");
    expect(container.querySelectorAll("textarea")).toHaveLength(3); expect(reviewButton().disabled).toBe(true);
    await fillEdits(); await checkAll(); expect(reviewButton().disabled).toBe(false);
    await typeEdit(0, "Another wording"); expect(reviewButton().disabled).toBe(true); expect(mocks.saveEdit).not.toHaveBeenCalled();
  });
  it("prevents duplicate submits and follows only the acknowledged new revision", async () => {
    mocks.loadDocument.mockResolvedValue(documentResult("Original")); let finish!: (value: unknown) => void;
    mocks.saveEdit.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await renderLoader(); await openEditor(); await fillEdits(); await checkAll(); await submitReview(); await submitReview();
    expect(mocks.saveEdit).toHaveBeenCalledTimes(1); expect(mocks.replaceLocation).not.toHaveBeenCalled();
    const command = mocks.saveEdit.mock.calls[0][0]; expect(command.request).toEqual({ baseRevisionId: REV, englishDraft: "Changed synthetic wording",
      reviewVersions: { "zh-Hans": "合成修改", "zh-Hant": "合成修改" }, wordingConfirmed: true });
    const next = "90000000-0000-4000-8000-000000000001";
    mocks.replaceLocation.mockImplementationOnce(() => {
      const unload = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(false);
    });
    await act(async () => finish({ status: "SAVED", revisionId: next }));
    expect(mocks.replaceLocation).toHaveBeenCalledWith(`/ai-documents/communication-note/documents/${DOC}?lang=en&revisionId=${next}`);
    expect(container.querySelector("textarea")).toBeNull(); expect(container.textContent).not.toContain("Self-review confirmed");
  });
  it.each(["STALE_REVISION", "UNAVAILABLE"])("freezes %s without retries or discarding edited text", async status => {
    mocks.loadDocument.mockResolvedValue(documentResult("Original")); mocks.saveEdit.mockResolvedValue({ status });
    await renderLoader(); await openEditor(); await fillEdits(); await checkAll(); await submitReview(); await submitReview();
    expect(mocks.saveEdit).toHaveBeenCalledTimes(1); expect(reviewButton().disabled).toBe(true);
    expect(container.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("Changed synthetic wording");
    expect(container.textContent).toContain("Open current version to check"); expect(mocks.replaceLocation).not.toHaveBeenCalled();
  });
  it("aborts pending edits and clears their text when access is rechecked", async () => {
    mocks.loadDocument.mockResolvedValue(documentResult("Original")); let finish!: (value: unknown) => void;
    mocks.saveEdit.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await renderLoader(); await openEditor(); await fillEdits(); await checkAll(); await submitReview();
    const signal = mocks.saveEdit.mock.calls[0][0].signal as AbortSignal;
    await act(async () => window.dispatchEvent(new StorageEvent("storage")));
    expect(signal.aborted).toBe(true); expect(container.querySelector("textarea")).toBeNull();
    expect(container.textContent).toContain("The editor was cleared");
    await act(async () => finish({ status: "SAVED", revisionId: DOC })); expect(mocks.replaceLocation).not.toHaveBeenCalled();
  });
  it("warns before losing edits and discards them only on explicit confirmation", async () => {
    mocks.loadDocument.mockResolvedValue(documentResult("Original"));
    await renderLoader(); await openEditor(); await fillEdits();
    const unload = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const cancel = [...container.querySelectorAll("button")].find(b => b.textContent === "Discard edits")!;
    await act(async () => cancel.click()); expect(container.querySelector("textarea")).not.toBeNull();
    confirm.mockReturnValue(true); await act(async () => cancel.click()); expect(container.querySelector("textarea")).toBeNull(); confirm.mockRestore();
    expect(mocks.saveEdit).not.toHaveBeenCalled();
  });
  it.each(["AUTH_REQUIRED", "NOT_FOUND"])("removes edit content on %s", async status => {
    mocks.loadDocument.mockResolvedValue(documentResult("Original")); mocks.saveEdit.mockResolvedValue({ status });
    await renderLoader(); await openEditor(); await fillEdits(); await checkAll(); await submitReview();
    expect(container.querySelector("textarea")).toBeNull(); expect(container.textContent).not.toContain("Changed synthetic wording");
    if (status === "AUTH_REQUIRED") expect(mocks.replaceLocation).toHaveBeenCalledWith(LOGIN);
  });
});
async function openEditor() {
  await act(async () => [...container.querySelectorAll("button")].find(b => b.textContent === "Edit draft wording")!.click());
}
async function typeEdit(index: number, value: string) {
  const area = container.querySelectorAll("textarea")[index];
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(area, value); area.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function fillEdits() { await typeEdit(0, "Changed synthetic wording"); await typeEdit(1, "合成修改"); await typeEdit(2, "合成修改"); }
function reviewButton() { return container.querySelector<HTMLButtonElement>('button[type="submit"]')!; }
async function checkAll() {
  await act(async () => { container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(check => check.click()); });
}
async function submitReview() {
  await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}

async function renderLoader() {
  await act(async () => {
    root.render(loaderElement());
    await Promise.resolve();
  });
}

function loaderElement() {
  return (
    <CommunicationNoteDocumentLoader
      canonicalId={DOC}
      locale="en"
      loginHref={LOGIN}
      revisionId={REV}
      unsupportedLocale={false}
    />
  );
}

function documentResult(text: string): CommunicationNoteAvailableDocument {
  return {
    status: "AVAILABLE",
    canonicalId: DOC,
    noteType: "communication",
    sourceLocale: "en",
    currentRevisionId: REV,
    revision: {
      revisionId: REV,
      revisionNumber: 1,
      contentHash: "a".repeat(64),
      createdAt: NOW,
      content: {
        englishDraft: text,
        reviewVersions: {},
        factsSummary: createValidCaresLinkV1CleanedFacts("communication"),
        missingFacts: [],
        neutralWordingChecks: [],
        followUpPrompts: [],
        disclaimer: "Draft",
      },
    },
    versions: [{ revisionId: REV, revisionNumber: 1, createdAt: NOW }],
    isCurrentRevision: true,
    selfReviewStatus: "REQUIRED",
    draftNotice: "Draft – review required",
    saveState: "SERVER_ACKNOWLEDGED",
  };
}
