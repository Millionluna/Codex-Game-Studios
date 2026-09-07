"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { buildCommunicationNoteDocumentHref, type CommunicationNoteAvailableDocument } from "../../../../../lib/communication-note-document-contract";
import type { CommunicationNoteDocumentLocale } from "../../../../../lib/communication-note-document-i18n";
import { confirmCommunicationNoteSelfReview } from "../../../../../lib/communication-note-self-review-client";
import { getCommunicationNoteSelfReviewCopy } from "../../../../../lib/communication-note-self-review-i18n";

export function CommunicationNoteSelfReviewForm({ document: saved, locale, accessSignal, onResult }: Readonly<{
  document: CommunicationNoteAvailableDocument;
  locale: CommunicationNoteDocumentLocale;
  accessSignal: AbortSignal;
  onResult: (status: "CONFIRMED" | "AUTH_REQUIRED" | "NOT_FOUND") => void;
}>) {
  const copy = getCommunicationNoteSelfReviewCopy(locale);
  const [checks, setChecks] = useState([false, false, false]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<"UNAVAILABLE" | "INVALID_REQUEST" | "STALE_REVISION">();
  const inFlight = useRef(false);
  const mutationId = useRef<string | undefined>(undefined);
  const active = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    const abort = () => active.current?.abort();
    accessSignal.addEventListener("abort", abort);
    return () => { abort(); accessSignal.removeEventListener("abort", abort); };
  }, [accessSignal]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || accessSignal.aborted || !checks.every(Boolean) ||
        !saved.isCurrentRevision || saved.selfReviewStatus !== "REQUIRED" || error === "STALE_REVISION") return;
    inFlight.current = true;
    setPending(true);
    setError(undefined);
    const controller = new AbortController();
    active.current = controller;
    try {
      // Retained only in this mounted form for same-command manual retries.
      mutationId.current ??= crypto.randomUUID();
      const result = await confirmCommunicationNoteSelfReview({
        canonicalId: saved.canonicalId, mutationId: mutationId.current,
        request: { revisionId: saved.revision.revisionId, factsConfirmed: true, wordingConfirmed: true, missingFactsReviewed: true },
        signal: controller.signal,
      });
      if (controller.signal.aborted || accessSignal.aborted) return;
      if (["CONFIRMED", "AUTH_REQUIRED", "NOT_FOUND"].includes(result.status)) {
        onResult(result.status as "CONFIRMED" | "AUTH_REQUIRED" | "NOT_FOUND");
      } else {
        setError(result.status as "UNAVAILABLE" | "INVALID_REQUEST" | "STALE_REVISION");
      }
    } catch {
      if (!controller.signal.aborted && !accessSignal.aborted) setError("UNAVAILABLE");
    } finally {
      inFlight.current = false;
      if (!controller.signal.aborted && !accessSignal.aborted) setPending(false);
    }
  }

  if (!saved.isCurrentRevision || saved.selfReviewStatus !== "REQUIRED") return null;
  return (
    <form onSubmit={submit} className="border-t border-line bg-[#f3f8f5] p-5" aria-busy={pending}>
      <fieldset disabled={pending || error === "STALE_REVISION"}>
        <legend className="text-sm font-semibold text-foreground">{copy.legend}</legend>
        <p className="mt-2 text-xs leading-5 text-muted">{copy.version(saved.revision.revisionNumber)}</p>
        <div className="mt-4 grid gap-3">
          {[copy.facts, copy.wording, copy.missing].map((label, index) => (
            <label key={index} className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-6 text-foreground">
              <input type="checkbox" checked={checks[index]} required
                className="mt-1 size-4 shrink-0 accent-[#08745a] focus-visible:ring-2 focus-visible:ring-brand"
                onChange={event => setChecks(previous => previous.map((checked, i) => i === index ? event.target.checked : checked))} />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-muted">{copy.boundary}</p>
        <button type="submit" disabled={pending || !checks.every(Boolean)} className="jade-action mt-4 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50">
          {pending ? copy.submitting : copy.submit}
        </button>
      </fieldset>
      <div aria-live="polite" role="status">
        {error ? <p className="mt-3 text-sm leading-6 text-[#705318]">{copy[error]}</p> : null}
      </div>
      {error ? <a className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-brand underline"
        href={buildCommunicationNoteDocumentHref({ canonicalId: saved.canonicalId, locale,
          revisionId: error === "STALE_REVISION" ? undefined : saved.revision.revisionId })}>
        {error === "STALE_REVISION" ? copy.current : copy.reload}
      </a> : null}
    </form>
  );
}
