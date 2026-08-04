import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  deleteGeneratedDraft,
  GeneratedDraftDeleteButton,
} from "./generated-draft-delete-button";

describe("GeneratedDraftDeleteButton", () => {
  it("renders an accessible first-step delete action without showing permanent confirmation", () => {
    const markup = renderToStaticMarkup(
      createElement(GeneratedDraftDeleteButton, {
        draftId: `ndis-case-note-${"a".repeat(32)}`,
        locale: "en",
      }),
    );

    expect(markup).toContain("Delete");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain("Delete permanently");
    expect(markup).not.toContain("Permanently delete this saved draft");
  });

  it("uses natural Chinese delete copy", () => {
    const markup = renderToStaticMarkup(
      createElement(GeneratedDraftDeleteButton, {
        draftId: `ndis-case-note-${"b".repeat(32)}`,
        locale: "zh-Hans",
      }),
    );

    expect(markup).toContain("删除");
    expect(markup).not.toContain("永久删除");
  });

  it("sends an explicit same-task deletion intent and no request body", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const draftId = `ndis-case-note-${"c".repeat(32)}`;

    await expect(deleteGeneratedDraft(draftId, fetcher)).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledWith(
      `/api/template-companion/ndis-case-note/drafts/${draftId}`,
      {
        method: "DELETE",
        headers: {
          "x-careslink-intent": "delete-generated-draft",
        },
      },
    );
    expect(fetcher.mock.calls[0][1]).not.toHaveProperty("body");
  });

  it("keeps the client flow in an error state when deletion fails", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));

    await expect(
      deleteGeneratedDraft(`ndis-case-note-${"d".repeat(32)}`, fetcher),
    ).resolves.toBe(false);
  });
});
