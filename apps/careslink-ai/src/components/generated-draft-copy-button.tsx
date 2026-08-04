"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

type GeneratedDraftClipboard = {
  writeText(text: string): Promise<void>;
};

type GeneratedDraftCopyButtonProps = {
  text: string;
  label: string;
  copiedLabel: string;
  ariaLabel: string;
  compact?: boolean;
  telemetryEvent?: GeneratedDraftCopyEvent;
  focusAfterCopyId?: string;
  onCopied?: () => void;
};

type GeneratedDraftCopyEvent = {
  generatedMaterialDraftId: string;
  eventType: "copy_all" | "copy_field";
  fieldKey?: string;
};

type GeneratedDraftCopyEventFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type CopyFocusElement = {
  scrollIntoView?: (options?: ScrollIntoViewOptions) => void;
  animate?: (
    keyframes: Keyframe[] | PropertyIndexedKeyframes,
    options?: number | KeyframeAnimationOptions,
  ) => Animation;
  querySelector?: (selector: string) => { focus?: () => void } | null;
};

type CopyFocusDocument = {
  getElementById(id: string): CopyFocusElement | null;
};

export async function writeGeneratedDraftCopyText(
  text: string,
  clipboard: GeneratedDraftClipboard | undefined = globalThis.navigator
    ?.clipboard,
) {
  const copyText = text.trim();

  if (!copyText || !clipboard?.writeText) {
    return false;
  }

  try {
    await clipboard.writeText(copyText);

    return true;
  } catch {
    return false;
  }
}

export async function recordGeneratedDraftCopyEvent(
  event: GeneratedDraftCopyEvent | undefined,
  fetcher: GeneratedDraftCopyEventFetcher = globalThis.fetch,
) {
  if (!event) {
    return false;
  }

  try {
    const response = await fetcher("/api/generated-material-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });

    return response.ok;
  } catch {
    return false;
  }
}

export function focusElementAfterGeneratedDraftCopy(
  elementId: string | undefined,
  documentRef: CopyFocusDocument | undefined = globalThis.document,
) {
  if (!elementId || !documentRef) {
    return false;
  }

  const element = documentRef.getElementById(elementId);

  if (!element) {
    return false;
  }

  element.scrollIntoView?.({ behavior: "smooth", block: "center" });
  element.animate?.(
    [
      { boxShadow: "0 0 0 0 rgba(36, 107, 253, 0)", backgroundColor: "" },
      {
        boxShadow: "0 0 0 3px rgba(36, 107, 253, 0.22)",
        backgroundColor: "#edf7f2",
      },
      { boxShadow: "0 0 0 0 rgba(36, 107, 253, 0)", backgroundColor: "" },
    ],
    { duration: 1400, easing: "ease-out" },
  );
  element.querySelector?.('input[name="recipientName"]')?.focus?.();

  return true;
}

export function GeneratedDraftCopyButton({
  text,
  label,
  copiedLabel,
  ariaLabel,
  compact = false,
  telemetryEvent,
  focusAfterCopyId,
  onCopied,
}: GeneratedDraftCopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function copyDraftText() {
    const didCopy = await writeGeneratedDraftCopyText(text);

    if (!didCopy) {
      return;
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
    focusElementAfterGeneratedDraftCopy(focusAfterCopyId);
    onCopied?.();
    void recordGeneratedDraftCopyEvent(telemetryEvent);
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={!text.trim()}
      onClick={copyDraftText}
      className={`inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-[#dedbd2] bg-white font-semibold text-[#263241] transition hover:border-[#0b5c4d] hover:bg-[#edf7f2] disabled:cursor-not-allowed disabled:text-[#91a0b5] ${
        compact ? "px-2 py-1 text-xs" : "px-2.5 py-1 text-xs"
      }`}
    >
      {copied ? (
        <Check className="size-4" aria-hidden="true" />
      ) : (
        <Copy className="size-4" aria-hidden="true" />
      )}
      {copied ? copiedLabel : label}
    </button>
  );
}
