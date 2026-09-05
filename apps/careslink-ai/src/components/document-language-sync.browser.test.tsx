// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: "/plan-and-usage",
  search: "?lang=en",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

import { DocumentLanguageSync } from "./document-language-sync";

const layoutSource = readFileSync(
  join(process.cwd(), "src/app/layout.tsx"),
  "utf8",
);
const bootstrapTemplate = layoutSource.match(
  /const DOCUMENT_LANGUAGE_BOOTSTRAP = (`[\s\S]*?`);/,
)?.[1];
if (!bootstrapTemplate) throw new Error("Missing document language bootstrap");
const bootstrap: string = runInNewContext(bootstrapTemplate);

let container: HTMLDivElement;
let root: Root;
let originalLanguage: string;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  originalLanguage = document.documentElement.lang;
  document.documentElement.lang = "stale";
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.documentElement.lang = originalLanguage;
  vi.unstubAllGlobals();
});

async function navigate(pathname: string, search: string) {
  navigation.pathname = pathname;
  navigation.search = search;
  await act(async () => root.render(<DocumentLanguageSync />));
}

describe("document language synchronization", () => {
  it.each([
    ["/plan-and-usage", "?lang=en", "en"],
    ["/plan-and-usage", "?lang=zh-Hans", "zh-Hans"],
    ["/plan-and-usage", "?lang=zh-Hant", "en"],
    ["/ai-documents/communication-note", "?lang=zh-Hant", "zh-Hant"],
    ["/ai-documents/communication-note/", "?lang=zh-Hant", "zh-Hant"],
    ["/ai-documents/communication-note/draft", "?lang=zh-Hant", "en"],
    ["/auth/login", "?lang=zh-Hans", "zh-Hans"],
    ["/", "", "en"],
    ["/plan-and-usage", "?lang=", "en"],
    ["/plan-and-usage", "?lang=fr", "en"],
    ["/plan-and-usage", "?lang=ZH-HANS", "en"],
    ["/plan-and-usage", "?lang=zh-Hans&lang=en", "zh-Hans"],
  ])("matches the initial bootstrap for %s%s", async (pathname, search, expected) => {
    const initialDocument = { documentElement: { lang: "en" } };
    runInNewContext(bootstrap, {
      URLSearchParams,
      window: { location: { pathname, search } },
      document: initialDocument,
    });
    expect(initialDocument.documentElement.lang).toBe(expected);

    await navigate(pathname, search);
    expect(document.documentElement.lang).toBe(expected);
    expect(container.innerHTML).toBe("");
  });

  it("updates query-only navigation and back/forward transitions without remounting", async () => {
    for (const locale of ["en", "zh-Hans", "en", "zh-Hans", "en"]) {
      await navigate("/plan-and-usage", `?lang=${locale}`);
      expect(document.documentElement.lang).toBe(locale);
    }
    await navigate("/plan-and-usage", "");
    expect(document.documentElement.lang).toBe("en");
  });

  it("rechecks the route allowlist when the language query stays unchanged", async () => {
    await navigate("/ai-documents/communication-note", "?lang=zh-Hant");
    expect(document.documentElement.lang).toBe("zh-Hant");
    await navigate("/plan-and-usage", "?lang=zh-Hant");
    expect(document.documentElement.lang).toBe("en");
    await navigate("/ai-documents/communication-note", "?lang=zh-Hant");
    expect(document.documentElement.lang).toBe("zh-Hant");
  });

  it("isolates navigation hooks in Suspense without wrapping page content", () => {
    expect(layoutSource).toMatch(
      /<Suspense fallback=\{null\}>\s*<DocumentLanguageSync \/>\s*<\/Suspense>\s*\{children\}/,
    );
    expect(layoutSource).not.toMatch(/["']use client["']/);
  });
});
