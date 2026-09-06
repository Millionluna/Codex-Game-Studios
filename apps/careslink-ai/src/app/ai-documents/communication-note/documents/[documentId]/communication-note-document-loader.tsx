"use client";

import { useEffect, useState } from "react";
import { loadCommunicationNoteDocument } from "../../../../../lib/communication-note-document-client";
import type { CommunicationNoteDocumentResult } from "../../../../../lib/communication-note-document-contract";
import type { CommunicationNoteDocumentLocale } from "../../../../../lib/communication-note-document-i18n";
import { replaceCommunicationNoteLocation } from "../../../../../lib/communication-note-document-navigation";
import { CommunicationNoteDocumentView } from "./communication-note-document-view";

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
  }, [canonicalId, loginHref, revisionId]);

  return (
    <CommunicationNoteDocumentView
      canonicalId={canonicalId}
      locale={locale}
      result={result}
      revisionId={revisionId}
      unsupportedLocale={unsupportedLocale}
    />
  );
}
