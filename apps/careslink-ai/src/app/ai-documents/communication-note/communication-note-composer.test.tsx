import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { COMMUNICATION_NOTE_COMPOSER_FIELDS } from "../../../lib/communication-note-composer";
import {
  CommunicationNoteComposer,
  buildCommunicationNoteLocaleHref,
  buildCommunicationNoteWorkspaceHref,
} from "./communication-note-composer";

const localeSentinels = {
  en: ["Communication Note", "Browser memory only"],
  "zh-Hans": ["沟通记录", "仅保留在浏览器内存"],
  "zh-Hant": ["溝通記錄", "僅保留在瀏覽器記憶體"],
} as const;

describe("Communication Note composer UI", () => {
  it.each(["en", "zh-Hans", "zh-Hant"] as const)(
    "renders all seven contract fields and the local-only boundary in %s",
    (locale) => {
      const markup = renderToStaticMarkup(
        createElement(CommunicationNoteComposer, { locale }),
      );

      for (const sentinel of localeSentinels[locale]) {
        expect(markup).toContain(sentinel);
      }
      for (const field of COMMUNICATION_NOTE_COMPOSER_FIELDS) {
        expect(markup).toContain(`name="${field}"`);
        expect(markup).toContain(`id="communication-note-${field}"`);
      }
      expect(markup.match(/<h1/g)).toHaveLength(1);
      expect(markup).toContain("generation-boundary");
      expect(markup).toContain('disabled=""');
      expect(markup).toContain('aria-live="polite"');
      expect(markup).toContain('href="/ai-documents/communication-note?lang=zh-Hant"');
      expect(markup).not.toMatch(
        /name="(?:participant_name|participant_id|ndis_number|email|phone|address|date_of_birth)"/,
      );
    },
  );

  it("marks exactly the five contract fields as required", () => {
    const markup = renderToStaticMarkup(
      createElement(CommunicationNoteComposer, { locale: "en" }),
    );
    const requiredFields = [
      "occurred_at",
      "contact_channel",
      "parties_by_role",
      "observable_facts",
      "action_taken",
    ];

    for (const field of requiredFields) {
      const control = markup.match(
        new RegExp(`<(?:input|textarea)[^>]*name="${field}"[^>]*>`),
      )?.[0];
      expect(control).toContain('required=""');
    }
    for (const field of ["stated_outcome", "follow_up"]) {
      const control = markup.match(
        new RegExp(`<(?:input|textarea)[^>]*name="${field}"[^>]*>`),
      )?.[0];
      expect(control).not.toContain('required=""');
    }
    expect(markup).not.toContain('type="checkbox"');
    expect(markup).toContain('role="form"');
    expect(markup).not.toContain("<form");
    expect(markup).not.toContain('type="submit"');
  });

  it("shows a disabled, explained generation action without save, Points or export promises", () => {
    const markup = renderToStaticMarkup(
      createElement(CommunicationNoteComposer, { locale: "en" }),
    );

    expect(markup).toContain("Generation unavailable");
    expect(markup).toContain(
      'aria-describedby="communication-note-generation-boundary"',
    );
    expect(markup).toContain(
      "No model, Product API, Points, save or export action is connected",
    );
    expect(markup).not.toContain(">Save<");
    expect(markup).not.toContain(">Export<");
    expect(markup).not.toContain(">Download<");
    expect(markup).not.toContain("credits remaining");
  });

  it("keeps the Traditional Chinese surface independent from Simplified Chinese", () => {
    const markup = renderToStaticMarkup(
      createElement(CommunicationNoteComposer, { locale: "zh-Hant" }),
    );

    expect(markup).toContain("溝通記錄");
    expect(markup).toContain("隱私檢查");
    expect(markup).toContain("本機複核");
    expect(markup).not.toContain("沟通记录");
    expect(markup).not.toContain("隐私检查");
    expect(markup).not.toContain("应用清理结果");
  });

  it("builds language links from the fixed route and locale only", () => {
    expect(buildCommunicationNoteLocaleHref("en")).toBe(
      "/ai-documents/communication-note?lang=en",
    );
    expect(buildCommunicationNoteLocaleHref("zh-Hans")).toBe(
      "/ai-documents/communication-note?lang=zh-Hans",
    );
    expect(buildCommunicationNoteLocaleHref("zh-Hant")).toBe(
      "/ai-documents/communication-note?lang=zh-Hant",
    );
    expect(buildCommunicationNoteWorkspaceHref("/ai-documents", "en")).toBe(
      "/ai-documents?lang=en",
    );
    expect(
      buildCommunicationNoteWorkspaceHref("/ai-documents", "zh-Hans"),
    ).toBe("/ai-documents?lang=zh-Hans");
    expect(
      buildCommunicationNoteWorkspaceHref("/privacy", "zh-Hant"),
    ).toBe("/privacy?lang=en");
  });

  it("makes Traditional Chinese workspace fallbacks explicit and reloads the document", () => {
    const source = readFileSync(
      new URL("./communication-note-composer.tsx", import.meta.url),
      "utf8",
    );
    const markup = renderToStaticMarkup(
      createElement(CommunicationNoteComposer, { locale: "zh-Hant" }),
    );

    expect(source).not.toContain('from "next/link"');
    expect(markup).toContain(
      '<a href="/ai-documents?lang=en" class="inline-flex min-h-10',
    );
    expect(markup).toContain("返回 AI 文件（英文）");
    expect(markup).toContain('<a href="/privacy?lang=en"');
    expect(markup).toContain("隱私、收集與保留說明（英文）");
  });

  it("contains no client-side network, storage, analytics or API path", () => {
    const source = readFileSync(
      new URL("./communication-note-composer.tsx", import.meta.url),
      "utf8",
    );

    expect(source).not.toMatch(
      /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage)\b/,
    );
    expect(source).not.toContain("/api/");
    expect(source).not.toContain("trackEvent");
  });
});
