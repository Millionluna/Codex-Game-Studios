// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunicationNoteAvailableDocument } from "../../../../../lib/communication-note-document-contract";
import { createValidCaresLinkV1CleanedFacts } from "../../../../../lib/v1/cleaned-facts-test-fixtures";

const mocks = vi.hoisted(() => ({
  loadDocument: vi.fn(),
  replaceLocation: vi.fn(),
}));

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
