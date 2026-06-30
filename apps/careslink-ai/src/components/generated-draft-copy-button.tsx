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

export function GeneratedDraftCopyButton({
  text,
  label,
  copiedLabel,
  ariaLabel,
  compact = false,
  telemetryEvent,
}: GeneratedDraftCopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function copyDraftText() {
    const didCopy = await writeGeneratedDraftCopyText(text);

    if (!didCopy) {
      return;
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
    void recordGeneratedDraftCopyEvent(telemetryEvent);
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={!text.trim()}
      onClick={copyDraftText}
      className={`inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-[#cfded8] bg-white font-semibold text-[#263834] transition hover:bg-[#f0f7f4] disabled:cursor-not-allowed disabled:text-[#91a09b] ${
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
