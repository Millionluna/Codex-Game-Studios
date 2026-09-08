// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommunicationNoteAvailableDocument } from "../../../../../lib/communication-note-document-contract";
import { createValidCaresLinkV1CleanedFacts } from "../../../../../lib/v1/cleaned-facts-test-fixtures";
import { CommunicationNoteExportError } from "../../../../../lib/communication-note-export";

const mocks = vi.hoisted(() => ({
  loadDocument: vi.fn(),
  replaceLocation: vi.fn(),
  confirmReview: vi.fn(),
  saveEdit: vi.fn(),
  copyRecord: vi.fn(), downloadRecord: vi.fn(), downloadDocx: vi.fn(), downloadPdf: vi.fn(), disposeExport: vi.fn(),
  recordHistory: vi.fn(), loadHistory: vi.fn(),
}));
vi.mock("../../../../../lib/communication-note-export-history-client", () => ({
  recordExportHistory: mocks.recordHistory, loadExportHistory: mocks.loadHistory,
}));

vi.mock("../../../../../lib/communication-note-export-browser", () => ({
  copyCommunicationNoteRecord: mocks.copyRecord, downloadCommunicationNoteRecord: mocks.downloadRecord,
  downloadCommunicationNoteDocx: mocks.downloadDocx,
  downloadCommunicationNotePdf: mocks.downloadPdf,
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
  mocks.copyRecord.mockReset().mockImplementation(async prepare => { await prepare(); });
  mocks.downloadRecord.mockReset().mockReturnValue(mocks.disposeExport);
  mocks.downloadDocx.mockReset().mockResolvedValue(mocks.disposeExport);
  mocks.downloadPdf.mockReset().mockResolvedValue(mocks.disposeExport);
  mocks.recordHistory.mockReset().mockResolvedValue({ status: "RECORDED" });
  mocks.loadHistory.mockReset().mockResolvedValue({ status: "UNAVAILABLE" });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("Communication Note private result loader", () => {
  it("reports only version/format/device time after each successful export, not body content", async () => {
    mocks.loadDocument.mockResolvedValue(reviewedDocument()); await renderLoader();
    expect(mocks.loadHistory).not.toHaveBeenCalled(); expect(mocks.recordHistory).not.toHaveBeenCalled();
    for (const [label, format, outcome] of [["Copy record text", "COPY", "COPY_REPORTED"], ["Download TXT", "TXT", "DOWNLOAD_INITIATED"],
      ["Download DOCX", "DOCX", "DOWNLOAD_INITIATED"], ["Download PDF", "PDF", "DOWNLOAD_INITIATED"]]) {
      await act(async () => exportButton(label).click());
      const call = mocks.recordHistory.mock.calls.at(-1)![0];
      expect(call).toMatchObject({ canonicalId: DOC, report: { revisionId: REV, format, outcome } });
      expect(Object.keys(call.report).sort()).toEqual(["format", "outcome", "revisionId", "startedAt"]);
      expect(new Date(call.report.startedAt).toISOString()).toBe(call.report.startedAt);
      expect(JSON.stringify(call)).not.toMatch(/Synthetic export text|factsSummary|englishDraft|contentHash/);
    }
    expect(new Set(mocks.recordHistory.mock.calls.map(([call]) => call.attemptId)).size).toBe(4);
  });
  it("keeps the actual export success when history is unavailable, without re-exporting", async () => {
    mocks.loadDocument.mockResolvedValue(reviewedDocument()); mocks.recordHistory.mockResolvedValue({ status: "UNAVAILABLE" });
    await renderLoader(); await act(async () => exportButton("Download TXT").click());
    expect(container.textContent).toContain("TXT download started.");
    expect(container.textContent).toContain("The history entry could not be confirmed.");
    expect(container.textContent).not.toContain("Nothing was exported.");
    await act(async () => exportButton("View or refresh export history").click());
    expect(container.textContent).toContain("do not export again just to add a history entry");
    expect(mocks.downloadRecord).toHaveBeenCalledTimes(1); expect(mocks.recordHistory).toHaveBeenCalledTimes(1);
  });
  it("records a sanitized browser failure only after the version read succeeds", async () => {
    mocks.loadDocument.mockResolvedValue(reviewedDocument()); mocks.downloadPdf.mockRejectedValue(new CommunicationNoteExportError("PDF_UNSUPPORTED_TEXT"));
    await renderLoader(); await act(async () => exportButton("Download PDF").click());
    expect(mocks.recordHistory.mock.calls[0][0].report).toMatchObject({ format: "PDF", outcome: "FAILED" });
    expect(JSON.stringify(mocks.recordHistory.mock.calls)).not.toContain("PDF_UNSUPPORTED_TEXT");
  });
  it.each(["AUTH_REQUIRED", "NOT_FOUND"] as const)("does not report inaccessible exports: %s", async status => {
    mocks.loadDocument.mockResolvedValueOnce(reviewedDocument()).mockResolvedValueOnce({ status });
    await renderLoader(); await act(async () => exportButton("Download TXT").click());
    expect(mocks.recordHistory).not.toHaveBeenCalled();
  });
  it("reads scoped history on explicit action and labels temporary device reports", async () => {
    mocks.loadDocument.mockResolvedValue(reviewedDocument());
    mocks.loadHistory.mockResolvedValue({ status: "AVAILABLE", canonicalId: DOC, revisionId: REV, storage: "PROCESS_MEMORY_ONLY", hasMore: true,
      entries: [{ attemptId: "one", revisionNumber: 1, format: "TXT", outcome: "DOWNLOAD_INITIATED", startedAt: NOW }] });
    await renderLoader(); await act(async () => exportButton("View or refresh export history").click());
    expect(mocks.loadHistory).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ canonicalId: DOC, revisionId: REV }));
    expect(container.textContent).toContain("Temporary test history only");
    expect(container.textContent).toContain("Version 1 · TXT · Download initiated");
    expect(container.textContent).toContain("Started (device time)");
    expect(container.textContent).toContain("older reports are not shown");
    expect(mocks.downloadRecord).not.toHaveBeenCalled();
  });
  it("shows a specific empty history state without creating an event", async () => {
    mocks.loadDocument.mockResolvedValue(reviewedDocument());
    mocks.loadHistory.mockResolvedValue({ status: "AVAILABLE", storage: "PROCESS_MEMORY_ONLY", entries: [], hasMore: false });
    await renderLoader(); await act(async () => exportButton("View or refresh export history").click());
    expect(container.textContent).toContain("No export reports are recorded for this version.");
    expect(mocks.recordHistory).not.toHaveBeenCalled();
  });
  it.each(["AUTH_REQUIRED", "NOT_FOUND"] as const)("clears private content on a history read denial: %s", async status => {
    mocks.loadDocument.mockResolvedValue(reviewedDocument()); mocks.loadHistory.mockResolvedValue({ status });
    await renderLoader(); await act(async () => exportButton("View or refresh export history").click());
    expect(container.textContent).not.toContain("Synthetic export text");
  });
  it("ignores a late history response after focus refresh", async () => {
    let resolve!: (v: unknown) => void;
    mocks.loadDocument.mockResolvedValueOnce(reviewedDocument()).mockResolvedValueOnce({ status: "NOT_FOUND" });
    mocks.loadHistory.mockImplementation(() => new Promise(r => { resolve = r; }));
    await renderLoader(); await act(async () => exportButton("View or refresh export history").click());
    const signal = mocks.loadHistory.mock.calls[0][0].signal;
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(signal.aborted).toBe(true);
    await act(async () => resolve({ status: "AVAILABLE", entries: [], storage: "PROCESS_MEMORY_ONLY" }));
    expect(container.textContent).not.toContain("Temporary test history only");
  });
  it("requires a saved self-review and hides export while editing", async () => {
    mocks.loadDocument.mockResolvedValue(documentResult("Private draft")); await renderLoader();
    expect(exportButton("Copy record text").disabled).toBe(true);
    expect(exportButton("Download TXT").disabled).toBe(true);
    expect(exportButton("Download DOCX").disabled).toBe(true);
    expect(exportButton("Download PDF").disabled).toBe(true);
    expect(container.textContent).toContain("Confirm your self-review for this saved version before exporting.");
    await openEditor(); expect(container.textContent).not.toContain("Export a record copy");
    expect(mocks.copyRecord).not.toHaveBeenCalled();
  });
  it("rechecks access separately for Copy, TXT, DOCX and PDF, with no review or document writes", async () => {
    const saved = reviewedDocument(); mocks.loadDocument.mockResolvedValue(saved); await renderLoader();
    await act(async () => exportButton("Copy record text").click());
    expect(container.textContent).toContain("Record text copied.");
    await act(async () => exportButton("Download TXT").click());
    expect(mocks.loadDocument).toHaveBeenCalledTimes(3);
    expect(mocks.loadDocument.mock.calls[2][0]).toMatchObject({ canonicalId: DOC, revisionId: REV });
    expect(mocks.downloadRecord.mock.calls[0][0]).toMatchObject({ profile: "RECORD_COPY", filename: "communication-note_2026-09-07_10000000_v1.txt" });
    expect(mocks.downloadRecord.mock.calls[0][0].text).not.toContain("factsSummary");
    expect(container.textContent).toContain("TXT download started.");
    await act(async () => exportButton("Download DOCX").click());
    expect(mocks.loadDocument).toHaveBeenCalledTimes(4);
    expect(mocks.downloadDocx.mock.calls[0][0]).toMatchObject({ profile: "RECORD_COPY", filename: "communication-note_2026-09-07_10000000_v1.txt" });
    expect(container.textContent).toContain("DOCX download started.");
    await act(async () => exportButton("Download PDF").click());
    expect(mocks.loadDocument).toHaveBeenCalledTimes(5);
    expect(mocks.downloadPdf.mock.calls[0][0]).toMatchObject({ profile: "RECORD_COPY", filename: "communication-note_2026-09-07_10000000_v1.txt" });
    expect(container.textContent).toContain("PDF download started.");
    expect(mocks.confirmReview).not.toHaveBeenCalled(); expect(mocks.saveEdit).not.toHaveBeenCalled();
    await openEditor(); expect(mocks.disposeExport).toHaveBeenCalled();
  });
  it.each(["AUTH_REQUIRED", "NOT_FOUND"] as const)("clears the private page after export recheck returns %s", async status => {
    mocks.loadDocument.mockResolvedValueOnce(reviewedDocument()).mockResolvedValueOnce({ status }); await renderLoader();
    await act(async () => exportButton("Download TXT").click());
    expect(mocks.downloadRecord).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Synthetic export text");
    if (status === "AUTH_REQUIRED") expect(mocks.replaceLocation).toHaveBeenCalledExactlyOnceWith(LOGIN);
    else expect(container.textContent).not.toContain("Download TXT");
  });
  it("freezes stale export without substituting the latest revision or changing self-review", async () => {
    const stale = { ...reviewedDocument(), isCurrentRevision: false, selfReviewStatus: "UNKNOWN" };
    mocks.loadDocument.mockResolvedValueOnce(reviewedDocument()).mockResolvedValueOnce(stale); await renderLoader();
    await act(async () => exportButton("Download TXT").click());
    expect(exportButton("Download TXT").disabled).toBe(true); expect(container.textContent).toContain("A newer version exists.");
    expect(mocks.downloadRecord).not.toHaveBeenCalled(); expect(mocks.confirmReview).not.toHaveBeenCalled();
  });
  it("prevents duplicate actions and cancels a pending export when page access is refreshed", async () => {
    let resolve!: (value: CommunicationNoteAvailableDocument) => void;
    mocks.loadDocument.mockResolvedValueOnce(reviewedDocument()).mockImplementationOnce(() => new Promise(r => { resolve = r; }))
      .mockResolvedValueOnce(documentResult("Fresh private read"));
    await renderLoader();
    await act(async () => { exportButton("Download TXT").click(); exportButton("Download TXT").click(); });
    expect(mocks.loadDocument).toHaveBeenCalledTimes(2); expect(exportButton("Copy record text").disabled).toBe(true);
    await act(async () => window.dispatchEvent(new Event("focus")));
    await act(async () => resolve(reviewedDocument()));
    expect(mocks.downloadRecord).not.toHaveBeenCalled(); expect(container.textContent).not.toContain("TXT download started.");
    expect(container.textContent).toContain("Fresh private read");
  });
  it.each(["en", "zh-Hans", "zh-Hant"] as const)("shows explicit %s export copy and no unavailable format controls", async locale => {
    mocks.loadDocument.mockResolvedValue(reviewedDocument());
    await act(async () => root.render(<CommunicationNoteDocumentLoader canonicalId={DOC} locale={locale} loginHref={LOGIN} revisionId={REV} unsupportedLocale={false} />));
    expect(container.textContent).toContain(locale === "en" ? "Export a record copy" : locale === "zh-Hans" ? "导出记录副本" : "匯出記錄副本");
    expect(exportButton(locale === "en" ? "Download DOCX" : locale === "zh-Hans" ? "下载 DOCX" : "下載 DOCX").disabled).toBe(false);
    expect(exportButton(locale === "en" ? "Download PDF" : locale === "zh-Hans" ? "下载 PDF" : "下載 PDF").disabled).toBe(false);
  });
  it.each(["AUTH_REQUIRED", "NOT_FOUND", "STALE_REVISION", "REVIEW_REQUIRED"] as const)("does not start PDF after %s", async status => {
    const fresh = status === "STALE_REVISION" ? { ...reviewedDocument(), isCurrentRevision: false }
      : status === "REVIEW_REQUIRED" ? { ...reviewedDocument(), selfReviewStatus: "REQUIRED" } : { status };
    mocks.loadDocument.mockResolvedValueOnce(reviewedDocument()).mockResolvedValueOnce(fresh); await renderLoader();
    await act(async () => exportButton("Download PDF").click());
    expect(mocks.downloadPdf).not.toHaveBeenCalled(); expect(container.textContent).not.toContain("PDF download started.");
    if (status === "AUTH_REQUIRED") expect(mocks.replaceLocation).toHaveBeenCalledExactlyOnceWith(LOGIN);
    if (status === "NOT_FOUND") expect(container.textContent).not.toContain("Synthetic export text");
    if (status === "STALE_REVISION" || status === "REVIEW_REQUIRED") expect(exportButton("Download PDF").disabled).toBe(true);
  });
  it("cancels a pending PDF access check and suppresses duplicate clicks", async () => {
    let resolve!: (value: CommunicationNoteAvailableDocument) => void;
    mocks.loadDocument.mockResolvedValueOnce(reviewedDocument()).mockImplementationOnce(() => new Promise(r => { resolve = r; }))
      .mockResolvedValueOnce(documentResult("Fresh private read")); await renderLoader();
    await act(async () => { exportButton("Download PDF").click(); exportButton("Download PDF").click(); });
    expect(mocks.loadDocument).toHaveBeenCalledTimes(2); expect(exportButton("Download TXT").disabled).toBe(true);
    await act(async () => window.dispatchEvent(new Event("focus")));
    await act(async () => resolve(reviewedDocument()));
    expect(mocks.downloadPdf).not.toHaveBeenCalled(); expect(container.textContent).not.toContain("PDF download started.");
  });
  it("allows a fresh explicit PDF retry after an unsupported glyph refusal", async () => {
    mocks.loadDocument.mockResolvedValue(reviewedDocument());
    mocks.downloadPdf.mockRejectedValueOnce(new CommunicationNoteExportError("PDF_UNSUPPORTED_TEXT")); await renderLoader();
    await act(async () => exportButton("Download PDF").click());
    expect(container.textContent).toContain("Some characters cannot be safely rendered in PDF.");
    expect(exportButton("Download PDF").disabled).toBe(false);
    await act(async () => exportButton("Download PDF").click());
    expect(mocks.loadDocument).toHaveBeenCalledTimes(3); expect(container.textContent).toContain("PDF download started.");
  });
  it("keeps historical PDF disabled even if a snapshot carries confirmed review", async () => {
    mocks.loadDocument.mockResolvedValue({ ...reviewedDocument(), isCurrentRevision: false }); await renderLoader();
    expect(exportButton("Download PDF").disabled).toBe(true); expect(mocks.downloadPdf).not.toHaveBeenCalled();
  });
  it.each(["AUTH_REQUIRED", "NOT_FOUND", "STALE_REVISION", "REVIEW_REQUIRED"] as const)("does not start DOCX after %s", async status => {
    const fresh = status === "STALE_REVISION" ? { ...reviewedDocument(), isCurrentRevision: false }
      : status === "REVIEW_REQUIRED" ? { ...reviewedDocument(), selfReviewStatus: "REQUIRED" } : { status };
    mocks.loadDocument.mockResolvedValueOnce(reviewedDocument()).mockResolvedValueOnce(fresh); await renderLoader();
    await act(async () => exportButton("Download DOCX").click());
    expect(mocks.downloadDocx).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("DOCX download started.");
    if (status === "AUTH_REQUIRED") expect(mocks.replaceLocation).toHaveBeenCalledExactlyOnceWith(LOGIN);
    if (status === "NOT_FOUND") expect(container.textContent).not.toContain("Synthetic export text");
    if (status === "STALE_REVISION" || status === "REVIEW_REQUIRED") expect(exportButton("Download DOCX").disabled).toBe(true);
  });
  it("cancels a pending DOCX access check and suppresses duplicate clicks", async () => {
    let resolve!: (value: CommunicationNoteAvailableDocument) => void;
    mocks.loadDocument.mockResolvedValueOnce(reviewedDocument()).mockImplementationOnce(() => new Promise(r => { resolve = r; }))
      .mockResolvedValueOnce(documentResult("Fresh private read")); await renderLoader();
    await act(async () => { exportButton("Download DOCX").click(); exportButton("Download DOCX").click(); });
    expect(mocks.loadDocument).toHaveBeenCalledTimes(2); expect(exportButton("Download TXT").disabled).toBe(true);
    await act(async () => window.dispatchEvent(new Event("focus")));
    await act(async () => resolve(reviewedDocument()));
    expect(mocks.downloadDocx).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("DOCX download started.");
  });
  it("allows a fresh explicit DOCX retry after a sanitized failure", async () => {
    mocks.loadDocument.mockResolvedValue(reviewedDocument());
    mocks.downloadDocx.mockRejectedValueOnce(new CommunicationNoteExportError("DOWNLOAD_FAILED")); await renderLoader();
    await act(async () => exportButton("Download DOCX").click());
    expect(container.textContent).toContain("The download could not start.");
    expect(exportButton("Download DOCX").disabled).toBe(false);
    await act(async () => exportButton("Download DOCX").click());
    expect(mocks.loadDocument).toHaveBeenCalledTimes(3);
    expect(container.textContent).toContain("DOCX download started.");
  });
  it("keeps historical DOCX disabled even if a snapshot carries confirmed review", async () => {
    mocks.loadDocument.mockResolvedValue({ ...reviewedDocument(), isCurrentRevision: false }); await renderLoader();
    expect(exportButton("Download DOCX").disabled).toBe(true);
    expect(container.textContent).toContain("Historical export is not available yet");
    expect(mocks.downloadDocx).not.toHaveBeenCalled();
  });
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

function exportButton(label: string) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent === label)!;
}
function reviewedDocument(): CommunicationNoteAvailableDocument {
  return { ...documentResult("Synthetic export text"), isCurrentRevision: true, selfReviewStatus: "CONFIRMED" };
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
