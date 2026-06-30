import { describe, expect, it } from "vitest";
import {
  getProviderGeneratorHandoffContext,
  getSafeNextHrefWithHandoff,
  withAuthHandoffParams,
  withProviderGeneratorHandoff,
} from "./referral-workspace-handoff";

describe("referral workspace handoff", () => {
  it("reads public CaresLink draftId handoff parameters", () => {
    expect(
      getProviderGeneratorHandoffContext({
        source: "provider-profile-generator",
        draftId: "sample-harbour",
      }),
    ).toEqual({
      source: "provider-profile-generator",
      draftId: "sample-harbour",
      draftPayload: undefined,
      draftParamName: "draftId",
    });
  });

  it("keeps legacy draft links compatible", () => {
    const handoff = getProviderGeneratorHandoffContext({
      draft: "sample-harbour",
    });

    expect(handoff).toEqual({
      source: undefined,
      draftId: "sample-harbour",
      draftPayload: undefined,
      draftParamName: "draft",
    });
    expect(withProviderGeneratorHandoff("/referral-workspace/health", handoff)).toBe(
      "/referral-workspace/health?draft=sample-harbour",
    );
  });

  it("uses a safe next route before deriving the profile destination", () => {
    expect(
      getSafeNextHrefWithHandoff({
        source: "provider-profile-generator",
        draftId: "sample-harbour",
        next: "/referral-workspace/profile?source=provider-profile-generator&draftId=sample-harbour",
      }),
    ).toBe(
      "/referral-workspace/profile?source=provider-profile-generator&draftId=sample-harbour",
    );
  });

  it("derives the profile destination from source and draftId when next is absent", () => {
    expect(
      getSafeNextHrefWithHandoff({
        source: "provider-profile-generator",
        draftId: "sample-harbour",
      }),
    ).toBe(
      "/referral-workspace/profile?source=provider-profile-generator&draftId=sample-harbour",
    );
  });

  it("preserves auth handoff params for login and register links", () => {
    expect(
      withAuthHandoffParams("/auth/login", {
        source: "provider-profile-generator",
        draftId: "sample-harbour",
        next: "/referral-workspace/profile?source=provider-profile-generator&draftId=sample-harbour",
      }),
    ).toBe(
      "/auth/login?source=provider-profile-generator&draftId=sample-harbour&next=%2Freferral-workspace%2Fprofile%3Fsource%3Dprovider-profile-generator%26draftId%3Dsample-harbour",
    );
  });

  it("preserves real draft payloads through workspace and auth links", () => {
    const draftPayload = JSON.stringify({
      version: 1,
      businessName: "Bright Path Community Support",
      shortDescription: "Provider-submitted profile draft.",
    });
    const handoff = getProviderGeneratorHandoffContext({
      source: "provider-profile-generator",
      draftId: "test-provider-1",
      draftPayload,
    });

    expect(handoff).toEqual({
      source: "provider-profile-generator",
      draftId: "test-provider-1",
      draftPayload,
      draftParamName: "draftId",
    });
    const workspaceHref = withProviderGeneratorHandoff(
      "/referral-workspace/health",
      handoff,
    );
    const workspaceQuery = new URLSearchParams(workspaceHref.split("?")[1]);

    expect(workspaceQuery.get("source")).toBe("provider-profile-generator");
    expect(workspaceQuery.get("draftId")).toBe("test-provider-1");
    expect(workspaceQuery.get("draftPayload")).toBe(draftPayload);

    const authHref = withAuthHandoffParams("/auth/register", {
      source: "provider-profile-generator",
      draftId: "test-provider-1",
      draftPayload,
      next: `/referral-workspace/profile?source=provider-profile-generator&draftId=test-provider-1&draftPayload=${encodeURIComponent(draftPayload)}`,
    });
    const authQuery = new URLSearchParams(authHref.split("?")[1]);
    const nextQuery = new URLSearchParams(
      (authQuery.get("next") ?? "").split("?")[1],
    );

    expect(authQuery.get("draftPayload")).toBe(draftPayload);
    expect(nextQuery.get("draftPayload")).toBe(draftPayload);
  });

  it("drops unsafe next routes but keeps safe handoff context", () => {
    expect(
      getSafeNextHrefWithHandoff({
        source: "provider-profile-generator",
        draftId: "sample-harbour",
        next: "https://example.com/steal",
      }),
    ).toBe(
      "/referral-workspace/profile?source=provider-profile-generator&draftId=sample-harbour",
    );
  });
});
