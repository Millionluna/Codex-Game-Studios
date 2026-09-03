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

const availablePointsPreview = {
  status: "AVAILABLE" as const,
  unit: "POINTS" as const,
  serviceCode: "note.communication.generate" as const,
  catalogVersion: "2026-08-09.v1-shadow",
  generationCostPoints: 20,
  availablePoints: 300,
  reservedPoints: 20,
  canAfford: true,
};

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
    expect(markup).toContain(
      'aria-label="Communication Note structured facts"',
    );
    expect(markup).toContain("<form");
    expect(markup).toContain('type="submit"');
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
      "This shadow preview is read only and not active. Viewing it does not reserve or use Points",
    );
    expect(markup).not.toContain(">Save<");
    expect(markup).not.toContain(">Export<");
    expect(markup).not.toContain(">Download<");
    expect(markup).not.toContain("credits remaining");
  });

  it.each([
    ["en", "Shadow balance: 300 available · 20 already reserved", "If this preview is activated, a generation would cost 20 Points.", "not active"],
    ["zh-Hans", "预览余额：可用 300 · 已有预扣 20", "此预览正式启用后，每次生成预计需要 20 Points。", "尚未启用"],
    ["zh-Hant", "預覽餘額：可用 300 · 已有預扣 20", "此預覽正式啟用後，每次產生預計需要 20 Points。", "尚未啟用"],
  ] as const)(
    "renders the server-owned Points preview in %s",
    (locale, balance, cost, inactive) => {
      const markup = renderToStaticMarkup(
        createElement(CommunicationNoteComposer, {
          locale,
          pointsPreview: availablePointsPreview,
        }),
      );

      const visibleText = markup.replace(/<[^>]+>/g, "");
      expect(visibleText).toContain(balance);
      expect(visibleText).toContain(cost);
      expect(markup).toContain('disabled=""');
      expect(markup).toContain('<span lang="en-AU">Points</span>');
      expect(visibleText).toContain("20 Points");
      expect(visibleText).toContain(inactive);
      expect(markup).not.toMatch(/(?:3 credits|1 credit|account credit)/i);
    },
  );

  it("distinguishes an unready wallet, insufficient balance and unavailable preview", () => {
    const notReady = renderToStaticMarkup(
      createElement(CommunicationNoteComposer, {
        locale: "en",
        pointsPreview: {
          status: "NOT_READY",
          unit: "POINTS",
          serviceCode: "note.communication.generate",
          catalogVersion: "2026-08-09.v1-shadow",
          generationCostPoints: 20,
        },
      }),
    );
    const insufficient = renderToStaticMarkup(
      createElement(CommunicationNoteComposer, {
        locale: "en",
        pointsPreview: {
          ...availablePointsPreview,
          availablePoints: 10,
          canAfford: false,
        },
      }),
    );
    const unavailable = renderToStaticMarkup(
      createElement(CommunicationNoteComposer, {
        locale: "en",
        pointsPreview: { status: "UNAVAILABLE", unit: "POINTS" },
      }),
    );

    expect(notReady).toContain("The shadow balance is not ready");
    expect(notReady.replace(/<[^>]+>/g, "")).toContain(
      "a generation would cost 20 Points",
    );
    expect(insufficient).toContain("shadow balance would not cover");
    expect(unavailable).toContain("shadow rate and balance are unavailable");
    expect(unavailable).not.toContain("a generation would cost");
  });

  it.each(["en", "zh-Hans", "zh-Hant"] as const)(
    "formats large Point values and marks the English unit in %s",
    (locale) => {
      const markup = renderToStaticMarkup(
        createElement(CommunicationNoteComposer, {
          locale,
          pointsPreview: {
            ...availablePointsPreview,
            availablePoints: 1_234_567,
            reservedPoints: 1_234,
          },
        }),
      );
      const visibleText = markup.replace(/<[^>]+>/g, "");

      expect(visibleText).toContain("1,234,567");
      expect(visibleText).toContain("1,234");
      expect(markup).toContain('<span lang="en-AU">Points</span>');
    },
  );

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
