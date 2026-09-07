"use client";

import { useEffect, useRef, useState } from "react";
import { loadCommunicationNoteDocument } from "../../../../../lib/communication-note-document-client";
import type { CommunicationNoteDocumentResult } from "../../../../../lib/communication-note-document-contract";
import type { CommunicationNoteDocumentLocale } from "../../../../../lib/communication-note-document-i18n";
import { replaceCommunicationNoteLocation } from "../../../../../lib/communication-note-document-navigation";
import { CommunicationNoteDocumentView } from "./communication-note-document-view";
import { CommunicationNoteSelfReviewForm } from "./communication-note-self-review-form";
import { CommunicationNoteEditForm } from "./communication-note-edit-form";
import { buildCommunicationNoteDocumentHref } from "../../../../../lib/communication-note-document-contract";
import type { CommunicationNoteEditResult } from "../../../../../lib/communication-note-edit-contract";
import { getCommunicationNoteEditCopy } from "../../../../../lib/communication-note-edit-i18n";

type VisibleResult = Exclude<
  CommunicationNoteDocumentResult,
  Readonly<{ status: "AUTH_REQUIRED" }>
>;

export function CommunicationNoteDocumentLoader({
  canonicalId,
  locale,
  loginHref,
  revisionId,
  unsupportedLocale,
}: Readonly<{
  canonicalId: string;
  locale: CommunicationNoteDocumentLocale;
  loginHref: string;
  revisionId?: string;
  unsupportedLocale: boolean;
}>) {
  const [result, setResult] = useState<VisibleResult>();
  const [accessSignal, setAccessSignal] = useState<AbortSignal>();
  const [accessGeneration, setAccessGeneration] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [editing, setEditing] = useState(false);
  const editingRef = useRef(false);
  const [editorCleared, setEditorCleared] = useState(false);

  useEffect(() => {
    let mounted = true;
    let requestNumber = 0;
    let controller: AbortController | undefined;

    async function refresh() {
      requestNumber += 1;
      const request = requestNumber;
      controller?.abort();
      const currentController = new AbortController();
      controller = currentController;
      setResult(undefined);
      if (editingRef.current) setEditorCleared(true);
      editingRef.current = false;
      setEditing(false);

      try {
        const nextResult = await loadCommunicationNoteDocument({
          canonicalId,
          revisionId,
          signal: currentController.signal,
        });
        if (
          !mounted ||
          currentController.signal.aborted ||
          request !== requestNumber
        ) {
          return;
        }
        if (nextResult.status === "AUTH_REQUIRED") {
          replaceCommunicationNoteLocation(loginHref);
          return;
        }
        setResult(nextResult);
        setAccessSignal(currentController.signal);
        setAccessGeneration(value => value + 1);
      } catch (error) {
        if (
          !mounted ||
          currentController.signal.aborted ||
          request !== requestNumber ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
        setResult({ status: "UNAVAILABLE" });
      }
    }

    function refreshOnFocus() {
      void refresh();
    }

    function refreshOnVisibility() {
      if (document.visibilityState === "visible") void refresh();
    }

    function refreshOnPageShow(event: PageTransitionEvent) {
      if (event.persisted) void refresh();
    }

    function clearOnPageHide() {
      requestNumber += 1;
      controller?.abort();
      setResult(undefined);
    }

    void refresh();
    window.addEventListener("focus", refreshOnFocus);
    window.addEventListener("storage", refreshOnFocus);
    window.addEventListener("pageshow", refreshOnPageShow);
    window.addEventListener("pagehide", clearOnPageHide);
    document.addEventListener("visibilitychange", refreshOnVisibility);

    return () => {
      mounted = false;
      requestNumber += 1;
      controller?.abort();
      window.removeEventListener("focus", refreshOnFocus);
      window.removeEventListener("storage", refreshOnFocus);
      window.removeEventListener("pageshow", refreshOnPageShow);
      window.removeEventListener("pagehide", clearOnPageHide);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
    };
  }, [canonicalId, loginHref, revisionId, refreshVersion]);

  function onReviewResult(status: "CONFIRMED" | "AUTH_REQUIRED" | "NOT_FOUND") {
    if (!accessSignal || accessSignal.aborted) return;
    if (status === "AUTH_REQUIRED") {
      setResult(undefined);
      replaceCommunicationNoteLocation(loginHref);
    } else if (status === "NOT_FOUND") {
      setResult({ status: "NOT_FOUND" });
    } else {
      // Re-read through the owner/session gate; never optimistically confirm.
      setResult(undefined);
      setRefreshVersion(value => value + 1);
    }
  }

  function onEditResult(next: CommunicationNoteEditResult) {
    if (!accessSignal || accessSignal.aborted) return;
    if (next.status === "SAVED") {
      editingRef.current = false;
      setEditing(false);
      setResult(undefined);
      // Follow the exact acknowledged revision through a new authenticated read.
      replaceCommunicationNoteLocation(buildCommunicationNoteDocumentHref({ canonicalId, revisionId: next.revisionId, locale }));
    } else if (next.status === "AUTH_REQUIRED" || next.status === "NOT_FOUND") onReviewResult(next.status);
  }

  return (
    <CommunicationNoteDocumentView
      canonicalId={canonicalId}
      locale={locale}
      result={result}
      revisionId={revisionId}
      unsupportedLocale={unsupportedLocale}
      editing={editing}
      editorNotice={editorCleared ? getCommunicationNoteEditCopy(locale).cleared : undefined}
      editorControl={result?.status === "AVAILABLE" && accessSignal ? <CommunicationNoteEditForm
        key={`edit:${result.canonicalId}:${result.revision.revisionId}:${accessGeneration}`}
        saved={result} locale={locale} accessSignal={accessSignal} editing={editing}
        onEditingChange={value => { editingRef.current = value; setEditing(value); setEditorCleared(false); }} onResult={onEditResult}
      /> : undefined}
      selfReviewControl={!editing && result?.status === "AVAILABLE" && accessSignal ? (
        <CommunicationNoteSelfReviewForm
          key={`${result.canonicalId}:${result.revision.revisionId}:${accessGeneration}`}
          document={result} locale={locale} accessSignal={accessSignal} onResult={onReviewResult}
        />
      ) : undefined}
    />
  );
}
