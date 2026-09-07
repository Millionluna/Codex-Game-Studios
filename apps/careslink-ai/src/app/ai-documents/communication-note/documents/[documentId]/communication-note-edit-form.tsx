"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { buildCommunicationNoteDocumentHref, type CommunicationNoteAvailableDocument } from "../../../../../lib/communication-note-document-contract";
import type { CommunicationNoteDocumentLocale } from "../../../../../lib/communication-note-document-i18n";
import { COMMUNICATION_NOTE_EDIT_TEXT_LIMIT, parseCommunicationNoteEditRequest, type CommunicationNoteEditResult } from "../../../../../lib/communication-note-edit-contract";
import { saveCommunicationNoteEdit } from "../../../../../lib/communication-note-edit-client";
import { getCommunicationNoteEditCopy } from "../../../../../lib/communication-note-edit-i18n";

export function CommunicationNoteEditForm({ saved, locale, accessSignal, editing, onEditingChange, onResult }: Readonly<{
  saved: CommunicationNoteAvailableDocument; locale: CommunicationNoteDocumentLocale; accessSignal: AbortSignal; editing: boolean;
  onEditingChange: (value: boolean) => void; onResult: (result: CommunicationNoteEditResult) => void;
}>) {
  const copy = getCommunicationNoteEditCopy(locale);
  const original: [string, string, string] = [saved.revision.content.englishDraft, saved.revision.content.reviewVersions["zh-Hans"] ?? "", saved.revision.content.reviewVersions["zh-Hant"] ?? ""];
  const [texts, setTexts] = useState(original);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<"INVALID_REQUEST" | "PRIVACY_REVIEW_REQUIRED" | "STALE_REVISION" | "UNAVAILABLE">();
  const active = useRef<AbortController | undefined>(undefined);
  const busy = useRef(false);
  const navigationAllowed = useRef(false);
  const dirty = texts.some((text, i) => text !== original[i]);
  const locked = pending || error === "STALE_REVISION" || error === "UNAVAILABLE";
  const command = { baseRevisionId: saved.revision.revisionId, englishDraft: texts[0], reviewVersions: { "zh-Hans": texts[1], "zh-Hant": texts[2] }, wordingConfirmed: true } as const;

  useEffect(() => {
    const abort = () => { navigationAllowed.current = true; active.current?.abort(); };
    accessSignal.addEventListener("abort", abort);
    return () => { abort(); accessSignal.removeEventListener("abort", abort); };
  }, [accessSignal]);
  useEffect(() => {
    if (!editing || (!dirty && !locked)) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { if (!navigationAllowed.current) { event.preventDefault(); event.returnValue = ""; } };
    const navigate = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest("a[href]")) return;
      if (!window.confirm(copy.discard)) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", navigate, true); };
  }, [editing, dirty, locked, copy.discard]);

  function discard() {
    if (pending || ((dirty || locked) && !window.confirm(copy.discard))) return;
    setTexts(original); setConfirmed(false); setError(undefined); onEditingChange(false);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current || accessSignal.aborted || !saved.isCurrentRevision || locked || !confirmed || !dirty) return;
    const parsed = parseCommunicationNoteEditRequest(command);
    if (!parsed) { setError("INVALID_REQUEST"); return; }
    busy.current = true; setPending(true); setError(undefined);
    const controller = new AbortController(); active.current = controller;
    try {
      const result = await saveCommunicationNoteEdit({ canonicalId: saved.canonicalId, request: parsed,
        baseRevisionNumber: saved.revision.revisionNumber, mutationId: crypto.randomUUID(), signal: controller.signal });
      if (controller.signal.aborted || accessSignal.aborted) return;
      if (result.status === "SAVED" || result.status === "AUTH_REQUIRED" || result.status === "NOT_FOUND") {
        navigationAllowed.current = true; // Permit the ACK/auth navigation before React commits cleanup.
        onResult(result);
      }
      else setError(result.status);
    } catch { if (!controller.signal.aborted && !accessSignal.aborted) setError("UNAVAILABLE"); }
    finally { busy.current = false; if (!controller.signal.aborted && !accessSignal.aborted) setPending(false); }
  }
  if (!saved.isCurrentRevision) return null;
  if (!editing) return <div className="border-b border-line px-5 py-3 sm:px-6"><button type="button" className="jade-action min-h-11" onClick={() => {
    if (!accessSignal.aborted) onEditingChange(true);
  }}>{copy.edit}</button></div>;
  return <form onSubmit={submit} aria-busy={pending} className="border-b border-line bg-[#f3f8f5] p-5 sm:p-6">
    <fieldset disabled={locked}>
      <legend className="text-lg font-semibold text-foreground">{copy.title}</legend>
      <p id="edit-instructions" className="mt-2 max-w-[70ch] text-sm leading-6 text-[#455d55]">{copy.instruction}</p>
      <div className="mt-5 grid gap-5">
        {[copy.english, copy.simplified, copy.traditional].map((label, index) => <div key={index}>
          <label htmlFor={`edit-wording-${index}`} className="block text-sm font-semibold text-foreground">{label}</label>
          <textarea id={`edit-wording-${index}`} lang={["en", "zh-Hans", "zh-Hant"][index]} value={texts[index]} required rows={index === 0 ? 7 : 5}
            maxLength={COMMUNICATION_NOTE_EDIT_TEXT_LIMIT} aria-describedby="edit-instructions" spellCheck={false} autoComplete="off"
            className="mt-2 min-h-32 w-full min-w-0 resize-y rounded-md border border-[#97b2a5] bg-white p-3 text-base leading-7 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-70"
            onChange={event => { setTexts(previous => previous.map((text, i) => i === index ? event.target.value : text) as [string, string, string]); setConfirmed(false); setError(undefined); }} />
          <p className="mt-1 text-right text-xs text-[#455d55]">{(texts[index] ?? "").length.toLocaleString(locale)} / 8,000</p>
        </div>)}
      </div>
      <label className="mt-5 flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-6 text-foreground">
        <input type="checkbox" checked={confirmed} required className="mt-1 size-4 shrink-0 accent-[#08745a] focus-visible:ring-2 focus-visible:ring-brand" onChange={event => setConfirmed(event.target.checked)} />
        <span>{copy.confirmation}</span>
      </label>
      <p className="mt-3 text-sm leading-6 text-[#455d55]">{copy.localDetail}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="submit" disabled={!dirty || !confirmed || locked} className="jade-action min-h-11 disabled:cursor-not-allowed disabled:opacity-50">{pending ? copy.saving : copy.save}</button>
      </div>
    </fieldset>
    <button type="button" disabled={pending} onClick={discard} className="mt-3 min-h-11 rounded-md px-3 text-sm font-semibold text-brand underline focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50">{copy.cancel}</button>
    <div role="status" aria-live="polite">{error ? <p className="mt-3 text-sm leading-6 text-[#705318]">{copy[error]}</p> : null}</div>
    {error ? <a className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-brand underline" href={buildCommunicationNoteDocumentHref({ canonicalId: saved.canonicalId, locale })}>{copy.reload}</a> : null}
  </form>;
}
