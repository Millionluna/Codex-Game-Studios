import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  focusElementAfterGeneratedDraftCopy,
  GeneratedDraftCopyButton,
  recordGeneratedDraftCopyEvent,
  writeGeneratedDraftCopyText,
} from "./generated-draft-copy-button";

describe("generated draft copy button", () => {
  it("renders a button with a specific copy label", () => {
    const markup = renderToStaticMarkup(
      createElement(GeneratedDraftCopyButton, {
        text: "Headline: Referral-ready support",
        label: "Copy all",
        copiedLabel: "Copied",
        ariaLabel: "Copy all generated draft fields",
      }),
    );

    expect(markup).toContain('type="button"');
    expect(markup).toContain("Copy all");
    expect(markup).toContain('aria-label="Copy all generated draft fields"');
  });

  it("writes generated draft text only to the supplied clipboard", async () => {
    const writeText = vi.fn(async () => undefined);
    const clipboard = {
      writeText,
    };

    await expect(
      writeGeneratedDraftCopyText("Support need: Review before use", clipboard),
    ).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith(
      "Support need: Review before use",
    );
  });

  it("returns false when clipboard writing is unavailable", async () => {
    await expect(
      writeGeneratedDraftCopyText("Draft text", undefined),
    ).resolves.toBe(false);
  });

  it("records copy telemetry without sending generated text", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ ok: true })),
    );

    await recordGeneratedDraftCopyEvent(
      {
        generatedMaterialDraftId: "generated-material-1",
        eventType: "copy_field",
        fieldKey: "supportNeed",
      },
      fetcher,
    );

    expect(fetcher).toHaveBeenCalledWith(
      "/api/generated-material-events",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    const [, init] = fetcher.mock.calls[0] ?? [];
    expect(String(init?.body)).toContain("supportNeed");
    expect(String(init?.body)).not.toContain("Private generated text");
  });

  it("focuses the matching send form after copy", () => {
    const focus = vi.fn();
    const scrollIntoView = vi.fn();
    const animate = vi.fn();
    const documentRef = {
      getElementById: vi.fn(() => ({
        scrollIntoView,
        animate,
        querySelector: vi.fn(() => ({ focus })),
      })),
    };

    expect(
      focusElementAfterGeneratedDraftCopy(
        "record-send-target-support_coordinator",
        documentRef,
      ),
    ).toBe(true);

    expect(documentRef.getElementById).toHaveBeenCalledWith(
      "record-send-target-support_coordinator",
    );
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
    expect(animate).toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
  });
});
