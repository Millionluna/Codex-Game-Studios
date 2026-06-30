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

import { GuidedReferralMessageGenerator } from "./guided-referral-message-generator";

describe("guided referral-message generator", () => {
  it("renders an enabled generate control for an active-access provider draft", () => {
    const copy = getReferralWorkspaceCopy("en").materials.referralMessageGenerator;
    const markup = renderToStaticMarkup(
      createElement(GuidedReferralMessageGenerator, {
        draftId: "sample-harbour",
        profileName: "Harbour Community Support",
        enabled: true,
        copy,
      }),
    );

    expect(markup).toContain('data-testid="guided-referral-message-generator"');
    expect(markup).toContain("Referral-message guided draft");
    expect(markup).toContain("Generate referral message");
    expect(markup).toContain("Harbour Community Support");
    expect(markup).not.toContain("Verified approved login required");
  });

  it("renders a disabled boundary for preview access without exposing generation", () => {
    const copy = getReferralWorkspaceCopy("en").materials.referralMessageGenerator;
    const markup = renderToStaticMarkup(
      createElement(GuidedReferralMessageGenerator, {
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
    expect(markup).toContain("Generate referral message");
    expect(markup).toContain("disabled");
  });
});
