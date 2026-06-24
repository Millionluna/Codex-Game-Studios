import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../components/ui", async () => {
  const React = await import("react");

  return {
    ButtonLink: ({
      href,
      children,
    }: {
      href: string;
      children: ReactNode;
    }) => React.createElement("a", { href }, children),
    Card: ({
      children,
      className = "",
    }: {
      children: ReactNode;
      className?: string;
    }) => React.createElement("section", { className }, children),
    FieldLabel: ({ children }: { children: ReactNode }) =>
      React.createElement("label", null, children),
    SelectInput: ({
      children,
      ...props
    }: React.SelectHTMLAttributes<HTMLSelectElement>) =>
      React.createElement("select", props, children),
    TextArea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) =>
      React.createElement("textarea", props),
    TextInput: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
      React.createElement("input", props),
  };
});

vi.mock("@/lib/referral-workspace-i18n", async () =>
  import("./referral-workspace-i18n"),
);

import {
  AgentQueuePanel,
  BasicProfileCard,
  GuidedCopilotPanel,
  LockedMaterialsGrid,
} from "../components/referral-profile-workspace";
import {
  canUseGuidedMaterials,
  getAccessRequests,
  getAccessState,
  getAgentQueue,
  getAgentQueueForAccess,
  getHealthAudit,
  getLockedMaterials,
  getReferralProfile,
  getScoreBand,
  getSeedReferralProfiles,
  summarizeProfile,
} from "./referral-profile-workspace";

describe("referral profile workspace domain", () => {
  it("models individual/organisation and receive/send/both without exposing partner roles", () => {
    const profiles = getSeedReferralProfiles();

    expect(profiles).toHaveLength(3);
    expect(profiles.map((profile) => profile.id)).toEqual([
      "profile-harbour",
      "profile-alex-lee",
      "profile-carepath",
    ]);
    expect(profiles.map((profile) => profile.ownerUserId)).toEqual([
      "user-approved",
      "user-free",
      "user-waitlist",
    ]);
    expect(profiles.map((profile) => profile.entityType)).toEqual([
      "organisation",
      "individual",
      "organisation",
    ]);
    expect(profiles.map((profile) => profile.referralDirection)).toEqual([
      "both",
      "receive",
      "send",
    ]);
    expect(JSON.stringify(profiles)).not.toContain("group_owner");
    expect(JSON.stringify(profiles)).not.toContain("channel_partner");
    expect(JSON.stringify(profiles)).not.toContain("referral_network_manager");
  });

  it("creates a useful basic profile summary from self-submitted information", () => {
    const profile = getSeedReferralProfiles()[0];
    const summary = summarizeProfile(profile);

    expect(summary.title).toBe("Harbour Community Support");
    expect(summary.entityLabel).toBe("Organisation");
    expect(summary.directionLabel).toBe("Receives and sends referrals");
    expect(summary.footer).toContain("self-submitted information");
    expect(summary.footer).toContain("Not a provider endorsement");
  });

  it("replaces unsafe self-submitted summary claims before display", () => {
    const profile = {
      ...getSeedReferralProfiles()[0],
      summary:
        "We are a certified recommended provider for older adults comparing care options.",
    };
    const summary = summarizeProfile(profile);
    const description = summary.description.toLowerCase();

    expect(description).not.toContain("certified");
    expect(description).not.toContain("recommended provider");
    expect(description).toContain("profile summary needs review");
    expect(description).not.toContain("quality");
    expect(description).not.toContain("compliance");
  });

  it("renders the basic profile card without unsafe self-submitted summary claims", () => {
    const profile = {
      ...getSeedReferralProfiles()[0],
      summary:
        "We are a certified recommended provider for older adults comparing care options.",
    };
    const markup = renderToStaticMarkup(
      createElement(BasicProfileCard, { summary: summarizeProfile(profile) }),
    ).toLowerCase();

    expect(markup).not.toContain("certified");
    expect(markup).not.toContain("recommended provider");
    expect(markup).toContain("profile summary needs review");
  });

  it("renders the profile page without unsafe self-submitted summary claims", async () => {
    const unsafeSummary =
      "We are a certified recommended provider for older adults comparing care options.";

    vi.resetModules();
    vi.doMock("@/components/app-shell", async () => {
      const React = await import("react");

      return {
        AppShell: ({ children }: { children: ReactNode }) =>
          React.createElement("main", null, children),
      };
    });
    vi.doMock("@/components/page-header", async () => {
      const React = await import("react");

      return {
        PageHeader: ({
          title,
          description,
          actions,
        }: {
          title: string;
          description?: string;
          actions?: ReactNode;
        }) =>
          React.createElement(
            "header",
            null,
            React.createElement("h1", null, title),
            description ? React.createElement("p", null, description) : null,
            actions,
          ),
      };
    });
    vi.doMock("@/components/referral-profile-workspace", async () =>
      import("../components/referral-profile-workspace")
    );
    vi.doMock("@/components/ui", async () => import("../components/ui"));
    vi.doMock("@/lib/referral-profile-workspace", async () => {
      const actual = await import("./referral-profile-workspace");
      const unsafeProfile = {
        ...actual.getSeedReferralProfiles()[0],
        summary: unsafeSummary,
      };

      return {
        ...actual,
        getReferralProfile: () => unsafeProfile,
        getSeedReferralProfiles: () => [unsafeProfile],
      };
    });

    try {
      const { default: ReferralProfilePage } = await import(
        "../app/referral-workspace/profile/page"
      );
      const markup = renderToStaticMarkup(
        createElement(ReferralProfilePage),
      ).toLowerCase();

      expect(markup).not.toContain("certified");
      expect(markup).not.toContain("recommended provider");
      expect(markup).toContain("profile summary needs review");
    } finally {
      vi.doUnmock("@/components/app-shell");
      vi.doUnmock("@/components/page-header");
      vi.doUnmock("@/components/referral-profile-workspace");
      vi.doUnmock("@/components/ui");
      vi.doUnmock("@/lib/referral-profile-workspace");
      vi.resetModules();
    }
  });

  it("scores a both-mode profile and keeps receive/send sections separate", () => {
    const profile = getSeedReferralProfiles()[0];
    const audit = getHealthAudit(profile);

    expect(audit.score).toBeGreaterThanOrEqual(70);
    expect(audit.score).toBeLessThanOrEqual(100);
    expect(audit.band).toBe("Communication profile nearly ready");
    expect(audit.profileId).toBe("profile-harbour");
    expect(audit.summary).toContain("referral communication readiness");
    expect(Array.isArray(audit.recommendations)).toBe(true);
    expect(
      audit.signals.every((signal) =>
        ["good", "warning", "high"].includes(signal.status),
      ),
    ).toBe(true);
    expect(audit.signals.map((signal) => signal.id)).toContain("intake_method");
    expect(audit.signals.map((signal) => signal.id)).toContain("handover_requirements");
    expect(audit.tabs).toEqual(["Receive Referrals", "Send Referrals"]);
  });

  it("surfaces high-priority issues for an incomplete receive profile", () => {
    const profile = getSeedReferralProfiles()[1];
    const audit = getHealthAudit(profile);

    expect(audit.score).toBeLessThan(70);
    expect(audit.issues.some((issue) => issue.priority === "high")).toBe(true);
    expect(audit.issues.map((issue) => issue.id)).toContain("missing_capacity_status");
    expect(audit.issues[0]).toMatchObject({
      label: expect.any(String),
      recommendation: expect.any(String),
    });
  });

  it("flags unsafe long summary copy instead of awarding full readability points", () => {
    const profile = {
      ...getSeedReferralProfiles()[0],
      summary:
        "We are a certified recommended provider for older adults comparing care options, with a complete profile that includes broad context for referrers and families.",
    };
    const audit = getHealthAudit(profile);
    const readabilitySignal = audit.signals.find(
      (signal) => signal.id === "profile_readability",
    );
    const readabilityIssue = audit.issues.find(
      (issue) => issue.signalId === "profile_readability",
    );

    expect(readabilitySignal).toMatchObject({
      status: expect.not.stringMatching(/^good$/),
    });
    expect(readabilitySignal?.points).toBeLessThan(10);
    expect(readabilityIssue).toMatchObject({
      priority: expect.stringMatching(/^(high|warning)$/),
      recommendation: expect.any(String),
    });
    expect(readabilityIssue?.recommendation.toLowerCase()).not.toContain(
      "provider quality assessment",
    );
    expect(readabilityIssue?.recommendation.toLowerCase()).not.toContain(
      "compliance assessment",
    );
  });

  it("labels partial capacity status as a warning instead of a missing high-priority issue", () => {
    const baseProfile = getSeedReferralProfiles()[0];
    const profile = {
      ...baseProfile,
      receive: {
        intakeMethod: "Phone warm handover and secure web form",
        responseTime: "Usually within the week",
        capacityStatus: "Full",
      },
    };
    const audit = getHealthAudit(profile);
    const capacityIssue = audit.issues.find(
      (issue) => issue.id === "partial_capacity_status",
    );

    expect(audit.issues.map((issue) => issue.id)).not.toContain(
      "missing_capacity_status",
    );
    expect(capacityIssue).toMatchObject({
      priority: "warning",
      label: "Capacity status",
      title: "Capacity status needs detail",
    });
  });

  it("locks AI materials without access code and unlocks guided actions with access code", () => {
    const noCode = getAccessState("user-free");
    const withCode = getAccessState("user-approved");

    expect(noCode.hasAccessCode).toBe(false);
    expect(withCode.hasAccessCode).toBe(true);
    expect(withCode.dailyQuota).toBe(5);
    expect(withCode.usedToday).toBe(1);
    expect(getLockedMaterials("receive", noCode)[0]).toMatchObject({
      description: expect.any(String),
      preview: expect.any(String),
    });
    expect(getLockedMaterials("receive", noCode).every((item) => item.locked)).toBe(true);
    expect(getLockedMaterials("receive", withCode).every((item) => item.locked)).toBe(false);
  });

  it("uses quota-aware access before unlocking guided materials", () => {
    const exhaustedAccess = {
      ...getAccessState("user-approved"),
      usedToday: 5,
    };

    expect(canUseGuidedMaterials(exhaustedAccess)).toBe(false);
    expect(getLockedMaterials("receive", exhaustedAccess).every((item) => item.locked)).toBe(true);
    expect(getAgentQueueForAccess(exhaustedAccess)[0].status).toBe("locked");
  });

  it("uses access state as the final material gate when material data is stale", () => {
    const freeAccess = getAccessState("user-free");
    const staleUnlockedMaterials = getLockedMaterials(
      "receive",
      getAccessState("user-approved"),
    );
    const markup = renderToStaticMarkup(
      createElement(LockedMaterialsGrid, {
        materials: staleUnlockedMaterials,
        accessState: freeAccess,
      }),
    );

    expect(markup).toContain("Service areas, languages, intake method");
    expect(markup).toContain("Access code required");
    expect(markup).not.toContain("Ready for guided drafting");
  });

  it("uses quota-used material copy when stale unlocked materials are gated by exhausted quota", () => {
    const quotaExhaustedAccess = {
      ...getAccessState("user-approved"),
      usedToday: 5,
    };
    const staleUnlockedMaterials = getLockedMaterials(
      "receive",
      getAccessState("user-approved"),
    );
    const markup = renderToStaticMarkup(
      createElement(LockedMaterialsGrid, {
        materials: staleUnlockedMaterials,
        accessState: quotaExhaustedAccess,
      }),
    );

    expect(markup).toContain("Service areas, languages, intake method");
    expect(markup).toContain("quota used");
    expect(markup).not.toContain("Guided drafting available");
    expect(markup).not.toContain("Ready for guided drafting");
    expect(markup).not.toContain("Access code");
  });

  it("uses access state as the final queue and copilot gate when queue data is stale", () => {
    const freeAccess = getAccessState("user-free");
    const staleReadyQueue = getAgentQueueForAccess(getAccessState("user-approved"));
    const queueMarkup = renderToStaticMarkup(
      createElement(AgentQueuePanel, {
        queue: staleReadyQueue,
        accessState: freeAccess,
      }),
    );
    const copilotMarkup = renderToStaticMarkup(
      createElement(GuidedCopilotPanel, {
        queue: staleReadyQueue,
        accessState: freeAccess,
      }),
    );

    expect(queueMarkup).toContain("Preview basic profile structure");
    expect(queueMarkup).toContain("Access code");
    expect(queueMarkup).not.toContain("Guide profile wording");
    expect(copilotMarkup).toContain("Preview mode only");
    expect(copilotMarkup).not.toContain("Drafting prompt ready");
    expect(copilotMarkup).not.toContain("Guide profile wording");
  });

  it("uses quota-used queue and copilot copy when stale ready queue is gated by exhausted quota", () => {
    const quotaExhaustedAccess = {
      ...getAccessState("user-approved"),
      usedToday: 5,
    };
    const staleReadyQueue = getAgentQueueForAccess(getAccessState("user-approved"));
    const queueMarkup = renderToStaticMarkup(
      createElement(AgentQueuePanel, {
        queue: staleReadyQueue,
        accessState: quotaExhaustedAccess,
      }),
    );
    const copilotMarkup = renderToStaticMarkup(
      createElement(GuidedCopilotPanel, {
        queue: staleReadyQueue,
        accessState: quotaExhaustedAccess,
      }),
    );

    expect(queueMarkup).toContain("Preview basic profile structure");
    expect(queueMarkup).toContain("Quota used");
    expect(queueMarkup).not.toContain("Access code");
    expect(queueMarkup).not.toContain("Guide profile wording");
    expect(copilotMarkup).toContain("Preview mode only");
    expect(copilotMarkup).toContain("quota used");
    expect(copilotMarkup).not.toContain("Access code");
    expect(copilotMarkup).not.toContain("Drafting prompt ready");
    expect(copilotMarkup).not.toContain("Guide profile wording");
  });

  it("shows a restrained module queue instead of claiming autonomous agents", () => {
    const queue = getAgentQueue(false);
    const unlockedQueue = getAgentQueue(true);

    expect(queue.map((item) => item.label)).toEqual([
      "Profile Agent",
      "Readiness Agent",
      "Share Card Agent",
      "Referral Message Agent",
      "Trust Copy Agent",
    ]);
    expect(queue[0].status).toBe("locked");
    expect(unlockedQueue[0].status).toBe("ready");
    expect(queue.every((item) => item.freeState.length > 0)).toBe(true);
    expect(JSON.stringify(queue)).not.toContain("autonomous");
  });

  it("uses submitted-field queue copy without approval or endorsement wording", () => {
    const unlockedQueueText = JSON.stringify(getAgentQueue(true)).toLowerCase();

    expect(unlockedQueueText).toContain("submitted profile fields");
    expect(unlockedQueueText).not.toContain("approved fields");
    expect(unlockedQueueText).not.toContain("field approval");
    expect(unlockedQueueText).not.toContain("provider endorsement");
  });

  it("throws when requesting an unknown referral profile id", () => {
    expect(getReferralProfile()).toMatchObject({ id: "profile-harbour" });
    expect(() => getReferralProfile("profile-missing")).toThrow(
      "Referral profile not found: profile-missing",
    );
  });

  it("exposes access requests for the current pilot code types", () => {
    const requests = getAccessRequests();

    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requestedCodeType: "Provider Pilot",
          status: "queued",
          profileId: "profile-alex-lee",
        }),
        expect.objectContaining({
          requestedCodeType: "Referral Source Pilot",
          status: "queued",
          profileId: "profile-carepath",
        }),
        expect.objectContaining({
          requestedCodeType: "Dual Role Pilot",
          status: "approved",
          profileId: "profile-harbour",
        }),
      ]),
    );
  });

  it("keeps score band boundaries stable", () => {
    expect([39, 40, 69, 70, 84, 85].map(getScoreBand)).toEqual([
      "Communication profile not ready",
      "Communication profile needs work",
      "Communication profile needs work",
      "Communication profile nearly ready",
      "Communication profile nearly ready",
      "Strong communication profile",
    ]);
  });

  it("returns all receive and send material ids for both-direction profiles", () => {
    expect(
      getLockedMaterials("both", getAccessState("user-approved")).map(
        (item) => item.id,
      ),
    ).toEqual([
      "provider_profile",
      "bilingual_intro",
      "share_card",
      "referral_partner_message",
      "intake_checklist",
      "referral_source_profile",
      "provider_requirement_brief",
      "handover_template",
      "consent_reminder",
      "follow_up_message",
    ]);
  });

  it("avoids endorsement and overclaiming language in module text", () => {
    const moduleText = JSON.stringify({
      profiles: getSeedReferralProfiles(),
      accessRequests: getAccessRequests(),
      materials: getLockedMaterials("both", getAccessState("user-approved")),
      lockedQueue: getAgentQueue(false),
      unlockedQueue: getAgentQueue(true),
      audit: getHealthAudit(getSeedReferralProfiles()[0]),
    }).toLowerCase();

    [
      "certified",
      "approved provider",
      "verified provider quality",
      "guaranteed referral",
      "clinically suitable",
      "compliant provider",
      "provider quality endorsement",
      "trusted referral conversations",
      "safest",
      "safely introduced",
    ].forEach((term) => {
      expect(moduleText).not.toContain(term);
    });
  });
});
