"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Download } from "lucide-react";
import { buildCommunicationNoteDocumentHref, type CommunicationNoteAvailableDocument } from "../../../../../lib/communication-note-document-contract";
import type { CommunicationNoteDocumentLocale } from "../../../../../lib/communication-note-document-i18n";
import { getCommunicationNoteExportCopy } from "../../../../../lib/communication-note-export-i18n";
import { CommunicationNoteExportError, prepareCommunicationNoteRecordCopy, type CommunicationNoteExportErrorCode } from "../../../../../lib/communication-note-export";
import { copyCommunicationNoteRecord, downloadCommunicationNoteRecord, downloadCommunicationNoteDocx, downloadCommunicationNotePdf } from "../../../../../lib/communication-note-export-browser";
import { loadExportHistory, recordExportHistory } from "../../../../../lib/communication-note-export-history-client";
import type { ExportHistoryList, ExportHistoryOutcome } from "../../../../../lib/communication-note-export-history-contract";
import { getExportHistoryCopy } from "../../../../../lib/communication-note-export-history-i18n";
import { formatCommunicationNoteDocumentDate } from "../../../../../lib/communication-note-document-i18n";

type State = "idle" | "checking" | "copied" | "downloaded" | "docxDownloaded" | "pdfDownloaded" | Exclude<CommunicationNoteExportErrorCode, "AUTH_REQUIRED" | "NOT_FOUND">;
export function CommunicationNoteExportControls({ saved, locale, accessSignal, onAccessResult }: Readonly<{
  saved: CommunicationNoteAvailableDocument; locale: CommunicationNoteDocumentLocale; accessSignal: AbortSignal;
  onAccessResult: (status: "AUTH_REQUIRED" | "NOT_FOUND") => void;
}>) {
  const copy = getCommunicationNoteExportCopy(locale);
  const historyCopy = getExportHistoryCopy(locale);
  const [history, setHistory] = useState<ExportHistoryList>();
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPending, setHistoryPending] = useState(false);
  const [historyWarning, setHistoryWarning] = useState(false);
  const historyRequest = useRef(0);
  const [state, setState] = useState<State>("idle");
  const busy = useRef(false);
  const lifetime = useRef<AbortController | undefined>(undefined);
  const disposal = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    const abort = () => { controller.abort(); disposal.current?.(); };
    accessSignal.addEventListener("abort", abort, { once: true });
    if (accessSignal.aborted) abort();
    return () => { abort(); accessSignal.removeEventListener("abort", abort); };
  }, [accessSignal]);

  async function refreshHistory() {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || accessSignal.aborted || busy.current) return;
    const sequence = ++historyRequest.current;
    setHistory(undefined); setHistoryLoading(true);
    const result = await loadExportHistory({ canonicalId: saved.canonicalId, revisionId: saved.revision.revisionId, signal });
    if (signal.aborted || accessSignal.aborted || sequence !== historyRequest.current) return;
    setHistoryLoading(false);
    if (result.status === "AUTH_REQUIRED" || result.status === "NOT_FOUND") onAccessResult(result.status);
    else setHistory(result);
  }

  async function exportRecord(format: "COPY" | "TXT" | "DOCX" | "PDF") {
    const signal = lifetime.current?.signal;
    if (busy.current || !signal || signal.aborted || accessSignal.aborted ||
        !saved.isCurrentRevision || saved.selfReviewStatus !== "CONFIRMED" || state === "STALE_REVISION" || state === "REVIEW_REQUIRED") return;
    busy.current = true; setState("checking"); disposal.current?.();
    historyRequest.current += 1; setHistoryLoading(false); setHistory(undefined); setHistoryWarning(false);
    const startedAt = new Date().toISOString();
    let authorized = false, outcome: ExportHistoryOutcome | undefined;
    const prepare = async () => {
      const artifact = await prepareCommunicationNoteRecordCopy({ saved, signal });
      authorized = true; return artifact;
    };
    try {
      if (format === "COPY") await copyCommunicationNoteRecord(prepare, signal);
      else if (format === "DOCX") disposal.current = await downloadCommunicationNoteDocx(await prepare(), signal);
      else if (format === "PDF") disposal.current = await downloadCommunicationNotePdf(await prepare(), signal);
      else disposal.current = downloadCommunicationNoteRecord(await prepare(), signal);
      outcome = format === "COPY" ? "COPY_REPORTED" : "DOWNLOAD_INITIATED";
      if (!signal.aborted) setState(({ COPY: "copied", DOCX: "docxDownloaded", PDF: "pdfDownloaded", TXT: "downloaded" } as const)[format]);
    } catch (error) {
      if (signal.aborted) return;
      const code = error instanceof CommunicationNoteExportError ? error.code : "UNAVAILABLE";
      if (code === "AUTH_REQUIRED" || code === "NOT_FOUND") onAccessResult(code);
      else setState(code);
      // Only report a renderer/browser failure after successful reauthorization.
      // Never create metadata for an unauthenticated or inaccessible document.
      if (authorized && !["AUTH_REQUIRED", "NOT_FOUND"].includes(code)) outcome = "FAILED";
    } finally {
      if (outcome && !signal.aborted && !accessSignal.aborted) {
        setHistoryPending(true);
        try {
          const receipt = await recordExportHistory({ canonicalId: saved.canonicalId, attemptId: crypto.randomUUID(),
            report: { revisionId: saved.revision.revisionId, format, outcome, startedAt }, signal });
          if (!signal.aborted && !accessSignal.aborted) {
            if (receipt.status === "AUTH_REQUIRED" || receipt.status === "NOT_FOUND") onAccessResult(receipt.status);
            else setHistoryWarning(receipt.status !== "RECORDED");
          }
        } catch { if (!signal.aborted) setHistoryWarning(true); }
      }
      if (!signal.aborted) setHistoryPending(false);
      busy.current = false;
    }
  }

  const blocked = !saved.isCurrentRevision || saved.selfReviewStatus !== "CONFIRMED" || accessSignal.aborted ||
    state === "checking" || historyPending || state === "STALE_REVISION" || state === "REVIEW_REQUIRED";
  const message = !saved.isCurrentRevision ? copy.historical : saved.selfReviewStatus !== "CONFIRMED" ? copy.REVIEW_REQUIRED
    : state === "idle" ? undefined : copy[state];
  return <section aria-labelledby="communication-note-export-title" className="border-t border-line p-5 sm:p-6">
    <h2 id="communication-note-export-title" className="text-base font-semibold text-foreground">{copy.title}</h2>
    <p className="mt-2 text-sm leading-6 text-foreground">{copy.version(saved.revision.revisionNumber)}</p>
    <p className="mt-1 text-sm leading-6 text-foreground">{copy.profile}</p>
    <p id="communication-note-export-boundary" className="mt-2 max-w-[75ch] text-sm leading-6 text-foreground">{copy.boundary}</p>
    <div className="mt-4 flex flex-wrap gap-3" aria-describedby="communication-note-export-boundary">
      <button type="button" onClick={() => void exportRecord("COPY")} disabled={blocked} className="taito-secondary disabled:cursor-not-allowed disabled:opacity-60">
        <Copy className="size-4" aria-hidden="true" />{copy.copy}
      </button>
      <button type="button" onClick={() => void exportRecord("TXT")} disabled={blocked} className="taito-secondary disabled:cursor-not-allowed disabled:opacity-60">
        <Download className="size-4" aria-hidden="true" />{copy.download}
      </button>
      <button type="button" onClick={() => void exportRecord("DOCX")} disabled={blocked} className="taito-secondary disabled:cursor-not-allowed disabled:opacity-60">
        <Download className="size-4" aria-hidden="true" />{copy.downloadDocx}
      </button>
      <button type="button" onClick={() => void exportRecord("PDF")} disabled={blocked} className="taito-secondary disabled:cursor-not-allowed disabled:opacity-60">
        <Download className="size-4" aria-hidden="true" />{copy.downloadPdf}
      </button>
    </div>
    <p role="status" aria-live="polite" aria-atomic="true" className="mt-3 text-sm leading-6 text-foreground">{message}</p>
    {state === "STALE_REVISION" || !saved.isCurrentRevision ? <a className="mt-2 inline-flex min-h-11 items-center font-semibold text-brand underline"
      href={buildCommunicationNoteDocumentHref({ canonicalId: saved.canonicalId, locale })}>{copy.current}</a> : null}
    <div className="mt-5 border-t border-line pt-5" aria-labelledby="export-history-title">
      <h3 id="export-history-title" className="text-sm font-semibold text-foreground">{historyCopy.title}</h3>
      <p className="mt-2 max-w-[75ch] text-sm leading-6 text-foreground">{historyCopy.boundary}</p>
      <button type="button" className="taito-secondary mt-3 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={state === "checking" || historyPending || historyLoading || accessSignal.aborted}
        onClick={() => void refreshHistory()}>{historyCopy.load}</button>
      <p role="status" aria-live="polite" aria-atomic="true" className="mt-2 text-sm leading-6 text-foreground">
        {historyPending ? historyCopy.pending : historyLoading ? historyCopy.loading : historyWarning ? historyCopy.warning : null}
      </p>
      {history?.status === "AVAILABLE" ? <>
        {history.storage === "PROCESS_MEMORY_ONLY" ? <p className="mt-2 text-sm leading-6 text-foreground">{historyCopy.temporary}</p> : null}
        {history.entries.length === 0 ? <p className="mt-2 text-sm leading-6 text-foreground">{historyCopy.empty}</p> :
          <ol aria-label={historyCopy.title} className="mt-3 divide-y divide-line">
            {history.entries.map(item => <li key={item.attemptId} className="py-3 text-sm leading-6 text-foreground">
              <p className="font-semibold">{historyCopy.version(item.revisionNumber)} · {item.format} · {historyCopy.outcomes[item.outcome]}</p>
              <p>{historyCopy.time}: <time dateTime={item.startedAt}>{formatCommunicationNoteDocumentDate(item.startedAt, locale)}</time></p>
            </li>)}
          </ol>}
        {history.hasMore ? <p className="mt-2 text-sm leading-6 text-foreground">{historyCopy.more}</p> : null}
      </> : history ? <p className="mt-2 text-sm leading-6 text-foreground">{historyCopy.unavailable}</p> : null}
    </div>
  </section>;
}
