import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getReferralWorkspaceCopy } from "../lib/referral-workspace-i18n";

vi.mock("./ui", async () => {
  const React = await import("react");

  return {
    Card: ({
      children,
      className = "",
    }: {
      children: React.ReactNode;
      className?: string;
    }) => React.createElement("section", { className }, children),
  };
});

vi.mock("@/lib/referral-workspace-i18n", async () =>
  import("../lib/referral-workspace-i18n"),
);

import { GuidedShareCardGenerator } from "./guided-share-card-generator";

describe("guided share-card generator", () => {
  it("renders an enabled generate control for an active-access provider draft", () => {
    const copy = getReferralWorkspaceCopy("en").materials.shareCardGenerator;
    const markup = renderToStaticMarkup(
      createElement(GuidedShareCardGenerator, {
        draftId: "sample-harbour",
        profileName: "Harbour Community Support",
        enabled: true,
        copy,
      }),
    );

    expect(markup).toContain('data-testid="guided-share-card-generator"');
    expect(markup).toContain("Share-card guided draft");
    expect(markup).toContain("Generate share-card draft");
    expect(markup).toContain("Harbour Community Support");
    expect(markup).not.toContain("Verified approved login required");
  });

  it("renders a disabled boundary for preview access without exposing generation", () => {
    const copy = getReferralWorkspaceCopy("en").materials.shareCardGenerator;
    const markup = renderToStaticMarkup(
      createElement(GuidedShareCardGenerator, {
        draftId: undefined,
        profileName: "Demo Provider",
        enabled: false,
        disabledReason: "verified_session_required",
        copy,
      }),
    );

    expect(markup).toContain(
      "Sign in with a provider account that has active workspace access.",
    );
    expect(markup).not.toContain("Verified approved login required");
    expect(markup).not.toContain("approved provider account");
    expect(markup).toContain("Generate share-card draft");
    expect(markup).toContain("disabled");
  });
});
