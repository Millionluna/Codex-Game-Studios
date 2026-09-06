"use client";

import { useEffect, useRef, useState } from "react";
import { loadCommunicationNoteGenerationJob } from "../../../../../lib/communication-note-generation-job-client";
import type { CommunicationNoteGenerationJobReadResult } from "../../../../../lib/communication-note-generation-contract";
import { replaceCommunicationNoteLocation } from "../../../../../lib/communication-note-document-navigation";
import type { CommunicationNoteGenerationJobLocale } from "./communication-note-generation-job-i18n";
import { CommunicationNoteGenerationJobView } from "./communication-note-generation-job-view";

const POLL_INTERVAL_MS = 1_500;
const MAX_AUTOMATIC_POLLS = 40;

type VisibleResult = Exclude<
  CommunicationNoteGenerationJobReadResult,
  Readonly<{ status: "AUTH_REQUIRED" }>
>;

type RefreshReason = "automatic" | "initial" | "manual" | "reauthorize";

export function CommunicationNoteGenerationJobLoader({
  jobId,
  locale,
  loginHref,
  unsupportedLocale,
}: Readonly<{
  jobId: string;
  locale: CommunicationNoteGenerationJobLocale;
  loginHref: string;
  unsupportedLocale: boolean;
}>) {
  const [result, setResult] = useState<VisibleResult>();
  const [automaticChecksPaused, setAutomaticChecksPaused] = useState(false);
  const manualRefreshRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    let mounted = true;
    let requestNumber = 0;
    let automaticPollCount = 0;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function clearTimer() {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    }

    function scheduleNext(nextResult: VisibleResult) {
      clearTimer();
      if (
        nextResult.status !== "AVAILABLE" ||
        (nextResult.job.status !== "QUEUED" &&
          nextResult.job.status !== "RUNNING")
      ) {
        setAutomaticChecksPaused(false);
        return;
      }
      if (automaticPollCount >= MAX_AUTOMATIC_POLLS) {
        setAutomaticChecksPaused(true);
        return;
      }

      timer = setTimeout(() => {
        timer = undefined;
        automaticPollCount += 1;
        void refresh("automatic");
      }, POLL_INTERVAL_MS);
    }

    async function refresh(reason: RefreshReason) {
      clearTimer();
      requestNumber += 1;
      const request = requestNumber;
      controller?.abort();
      const currentController = new AbortController();
      controller = currentController;

      if (reason !== "automatic") {
        setResult(undefined);
        setAutomaticChecksPaused(false);
      }

      try {
        const nextResult = await loadCommunicationNoteGenerationJob({
          jobId,
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
          clearTimer();
          setAutomaticChecksPaused(false);
          setResult(undefined);
          replaceCommunicationNoteLocation(loginHref);
          return;
        }
        setResult(nextResult);
        scheduleNext(nextResult);
      } catch (error) {
        if (
          !mounted ||
          currentController.signal.aborted ||
          request !== requestNumber ||
          isAbortError(error)
        ) {
          return;
        }
        setAutomaticChecksPaused(false);
        setResult({ status: "UNAVAILABLE" });
      } finally {
        if (controller === currentController) controller = undefined;
      }
    }

    function reauthorize() {
      void refresh("reauthorize");
    }

    function refreshOnVisibility() {
      if (document.visibilityState === "visible") reauthorize();
    }

    function refreshOnPageShow(event: PageTransitionEvent) {
      if (event.persisted) reauthorize();
    }

    function clearOnPageHide() {
      clearTimer();
      requestNumber += 1;
      controller?.abort();
      controller = undefined;
      setAutomaticChecksPaused(false);
      setResult(undefined);
    }

    manualRefreshRef.current = () => void refresh("manual");
    void refresh("initial");
    window.addEventListener("focus", reauthorize);
    window.addEventListener("storage", reauthorize);
    window.addEventListener("online", reauthorize);
    window.addEventListener("pageshow", refreshOnPageShow);
    window.addEventListener("pagehide", clearOnPageHide);
    document.addEventListener("visibilitychange", refreshOnVisibility);

    return () => {
      mounted = false;
      requestNumber += 1;
      clearTimer();
      controller?.abort();
      controller = undefined;
      manualRefreshRef.current = () => undefined;
      window.removeEventListener("focus", reauthorize);
      window.removeEventListener("storage", reauthorize);
      window.removeEventListener("online", reauthorize);
      window.removeEventListener("pageshow", refreshOnPageShow);
      window.removeEventListener("pagehide", clearOnPageHide);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
    };
  }, [jobId, loginHref]);

  return (
    <CommunicationNoteGenerationJobView
      automaticChecksPaused={automaticChecksPaused}
      jobId={jobId}
      locale={locale}
      onCheckStatus={() => manualRefreshRef.current()}
      result={result}
      unsupportedLocale={unsupportedLocale}
    />
  );
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
