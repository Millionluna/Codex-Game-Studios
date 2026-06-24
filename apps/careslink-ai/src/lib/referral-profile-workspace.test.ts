import { describe, expect, it } from "vitest";
import {
  getAccessState,
  getAgentQueue,
  getHealthAudit,
  getLockedMaterials,
  getSeedReferralProfiles,
  summarizeProfile,
} from "./referral-profile-workspace";

describe("referral profile workspace domain", () => {
  it("models individual/organisation and receive/send/both without exposing partner roles", () => {
    const profiles = getSeedReferralProfiles();

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

  it("scores a both-mode profile and keeps receive/send sections separate", () => {
    const profile = getSeedReferralProfiles()[0];
    const audit = getHealthAudit(profile);

    expect(audit.score).toBeGreaterThanOrEqual(70);
    expect(audit.score).toBeLessThanOrEqual(100);
    expect(audit.band).toBe("Referral-ready soon");
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
});
