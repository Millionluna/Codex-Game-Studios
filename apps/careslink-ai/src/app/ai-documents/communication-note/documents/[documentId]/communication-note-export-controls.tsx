"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Download } from "lucide-react";
import { buildCommunicationNoteDocumentHref, type CommunicationNoteAvailableDocument } from "../../../../../lib/communication-note-document-contract";
import type { CommunicationNoteDocumentLocale } from "../../../../../lib/communication-note-document-i18n";
import { getCommunicationNoteExportCopy } from "../../../../../lib/communication-note-export-i18n";
import { CommunicationNoteExportError, prepareCommunicationNoteRecordCopy, type CommunicationNoteExportErrorCode } from "../../../../../lib/communication-note-export";
import { copyCommunicationNoteRecord, downloadCommunicationNoteRecord, downloadCommunicationNoteDocx, downloadCommunicationNotePdf } from "../../../../../lib/communication-note-export-browser";

type State = "idle" | "checking" | "copied" | "downloaded" | "docxDownloaded" | "pdfDownloaded" | Exclude<CommunicationNoteExportErrorCode, "AUTH_REQUIRED" | "NOT_FOUND">;
export function CommunicationNoteExportControls({ saved, locale, accessSignal, onAccessResult }: Readonly<{
  saved: CommunicationNoteAvailableDocument; locale: CommunicationNoteDocumentLocale; accessSignal: AbortSignal;
  onAccessResult: (status: "AUTH_REQUIRED" | "NOT_FOUND") => void;
}>) {
  const copy = getCommunicationNoteExportCopy(locale);
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

  async function exportRecord(format: "COPY" | "TXT" | "DOCX" | "PDF") {
    const signal = lifetime.current?.signal;
    if (busy.current || !signal || signal.aborted || accessSignal.aborted ||
        !saved.isCurrentRevision || saved.selfReviewStatus !== "CONFIRMED" || state === "STALE_REVISION" || state === "REVIEW_REQUIRED") return;
    busy.current = true; setState("checking"); disposal.current?.();
    const prepare = () => prepareCommunicationNoteRecordCopy({ saved, signal });
    try {
      if (format === "COPY") await copyCommunicationNoteRecord(prepare, signal);
      else if (format === "DOCX") disposal.current = await downloadCommunicationNoteDocx(await prepare(), signal);
      else if (format === "PDF") disposal.current = await downloadCommunicationNotePdf(await prepare(), signal);
      else disposal.current = downloadCommunicationNoteRecord(await prepare(), signal);
      if (!signal.aborted) setState(({ COPY: "copied", DOCX: "docxDownloaded", PDF: "pdfDownloaded", TXT: "downloaded" } as const)[format]);
    } catch (error) {
      if (signal.aborted) return;
      const code = error instanceof CommunicationNoteExportError ? error.code : "UNAVAILABLE";
      if (code === "AUTH_REQUIRED" || code === "NOT_FOUND") onAccessResult(code);
      else setState(code);
    } finally { busy.current = false; }
  }

  const blocked = !saved.isCurrentRevision || saved.selfReviewStatus !== "CONFIRMED" || accessSignal.aborted ||
    state === "checking" || state === "STALE_REVISION" || state === "REVIEW_REQUIRED";
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
  </section>;
}
