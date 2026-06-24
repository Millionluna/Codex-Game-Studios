import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

vi.mock("@/lib/referral-workspace-i18n", async () =>
  import("../lib/referral-workspace-i18n"),
);

describe("AppShell", () => {
  it("preserves caller-provided route context in language switcher links", () => {
    const markup = renderToStaticMarkup(
      <AppShell
        locale="zh-Hans"
        languageSwitcherHref="/referral-workspace/materials?access=code#preview"
      >
        <div>Workspace content</div>
      </AppShell>,
    );

    expect(markup).toContain(
      'href="/referral-workspace/materials?access=code&amp;lang=en#preview"',
    );
    expect(markup).toContain(
      'href="/referral-workspace/materials?access=code&amp;lang=zh-Hans#preview"',
    );
  });
});
