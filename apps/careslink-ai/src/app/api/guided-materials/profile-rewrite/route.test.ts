import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const accessControlStoreMock = vi.hoisted(() => ({
  getAccessControlStore: vi.fn(),
  getGuidedAiAccessDecision: vi.fn(),
  recordGuidedAiUsageIfAllowed: vi.fn(),
}));

const openAiProfileRewriteMock = vi.hoisted(() => ({
  generateProfileRewriteDraft: vi.fn(),
}));

const generatedMaterialDraftStoreMock = vi.hoisted(() => ({
  createGeneratedMaterialDraftRecord: vi.fn(),
  getGeneratedMaterialDraftStore: vi.fn(),
}));

const providerDraftStoreMock = vi.hoisted(() => ({
  getProviderDraftStore: vi.fn(),
  resolveProviderDraftForOwner: vi.fn(),
}));

const rateLimitMock = vi.hoisted(() => ({
  getGuidedAiRateLimiter: vi.fn(),
  check: vi.fn(),
}));

const sessionMock = vi.hoisted(() => ({
  resolveWorkspaceAccountFromSupabaseSession: vi.fn(),
}));

const supabaseServerMock = vi.hoisted(() => ({
  createCareslinkServerSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/access-control-store", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../lib/access-control-store")
  >("../../../../lib/access-control-store");

  return {
    ...actual,
    getAccessControlStore: accessControlStoreMock.getAccessControlStore,
    getGuidedAiAccessDecision: accessControlStoreMock.getGuidedAiAccessDecision,
    recordGuidedAiUsageIfAllowed:
      accessControlStoreMock.recordGuidedAiUsageIfAllowed,
  };
});

vi.mock("@/lib/generated-material-draft-store", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../lib/generated-material-draft-store")
  >("../../../../lib/generated-material-draft-store");

  return {
    ...actual,
    createGeneratedMaterialDraftRecord:
      generatedMaterialDraftStoreMock.createGeneratedMaterialDraftRecord,
    getGeneratedMaterialDraftStore:
      generatedMaterialDraftStoreMock.getGeneratedMaterialDraftStore,
  };
});

vi.mock("@/lib/guided-ai-rate-limit", () => ({
  getGuidedAiRateLimiter: rateLimitMock.getGuidedAiRateLimiter,
}));

vi.mock("@/lib/openai-profile-rewrite", () => ({
  generateProfileRewriteDraft:
    openAiProfileRewriteMock.generateProfileRewriteDraft,
}));

vi.mock("@/lib/provider-draft-store", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../lib/provider-draft-store")
  >("../../../../lib/provider-draft-store");

  return {
    ...actual,
    getProviderDraftStore: providerDraftStoreMock.getProviderDraftStore,
    resolveProviderDraftForOwner:
      providerDraftStoreMock.resolveProviderDraftForOwner,
  };
});

vi.mock("@/lib/referral-workspace-session", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../lib/referral-workspace-session")
  >("../../../../lib/referral-workspace-session");

  return {
    ...actual,
    resolveWorkspaceAccountFromSupabaseSession:
      sessionMock.resolveWorkspaceAccountFromSupabaseSession,
  };
});

vi.mock("@/lib/supabase-server", () => ({
  createCareslinkServerSupabaseClient:
    supabaseServerMock.createCareslinkServerSupabaseClient,
}));

const providerAccount = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Harbour Community Support",
  email: "provider@example.com",
  role: "provider" as const,
};

const providerDraft = {
  id: "sample-harbour",
  profile: {
    name: "Harbour Community Support",
    entityType: "organisation" as const,
    referralDirection: "both" as const,
    serviceAreas: ["Inner West Sydney"],
    languages: ["English", "Mandarin"],
    intakeMethod: "Phone warm handover",
    responseTime: "Usually within the week",
    capacityStatus: "Limited intake places",
    bestFit: ["Older adults who need navigation"],
    handoverRequirements: ["Consent confirmation"],
    summary: "Community support profile.",
  },
  shareCard: {
    title: "Harbour Community Support",
    channel: "Provider profile preview",
    summary: "A structured provider profile draft.",
    cta: "Continue in CaresLink AI",
  },
  boundary:
    "Self-submitted provider information. Not a CaresLink endorsement, certification, quality assessment, clinical assessment, compliance assessment, or referral outcome guarantee.",
};

const profileRewriteMaterial = {
  professionalEnglishDescription:
    "Harbour Community Support provides community navigation information for referral conversations.",
  shortEnglishSummary: "Referral-ready community navigation profile.",
  chineseCommunityIntro:
    "Harbour Community Support 提供社区导航资料，供转介沟通前审核。",
  referralPartnerSummary:
    "A concise self-submitted provider overview for referral partners.",
  profileImprovementNotes:
    "Add clearer intake timing and current capacity before sharing.",
  disclaimer:
    "Draft wording based on self-submitted information. Not a CaresLink endorsement.",
};

const accessStore = { kind: "memory" };
const generatedMaterialDraftStore = {
  kind: "memory",
  saveGeneratedMaterialDraft: vi.fn(),
};
const providerStore = { kind: "memory" };

function createProfileRewriteRequest(body: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/guided-materials/profile-rewrite", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("guided profile-rewrite API route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    vi.stubEnv("OPENAI_PROFILE_REWRITE_MODEL", "gpt-5.4-mini");

    Object.values(accessControlStoreMock).forEach((mock) => mock.mockReset());
    Object.values(generatedMaterialDraftStoreMock).forEach((mock) =>
      mock.mockReset(),
    );
    Object.values(providerDraftStoreMock).forEach((mock) => mock.mockReset());
    openAiProfileRewriteMock.generateProfileRewriteDraft.mockReset();
    generatedMaterialDraftStore.saveGeneratedMaterialDraft.mockReset();
    rateLimitMock.getGuidedAiRateLimiter.mockReset();
    rateLimitMock.check.mockReset();
    sessionMock.resolveWorkspaceAccountFromSupabaseSession.mockReset();
    supabaseServerMock.createCareslinkServerSupabaseClient.mockReset();

    accessControlStoreMock.getAccessControlStore.mockReturnValue(accessStore);
    accessControlStoreMock.getGuidedAiAccessDecision.mockResolvedValue({
      allowed: true,
      accessState: {
        userId: providerAccount.id,
        hasAccessCode: true,
        status: "approved",
        codeType: "Provider Pilot",
        dailyQuota: 5,
        usedToday: 1,
      },
      remainingQuota: 4,
    });
    accessControlStoreMock.recordGuidedAiUsageIfAllowed.mockResolvedValue({
      decision: { allowed: true, remainingQuota: 4 },
      event: { id: "usage-1" },
    });
    openAiProfileRewriteMock.generateProfileRewriteDraft.mockResolvedValue({
      material: profileRewriteMaterial,
      inputTokenCount: 180,
      outputTokenCount: 120,
    });
    generatedMaterialDraftStoreMock.getGeneratedMaterialDraftStore.mockReturnValue(
      generatedMaterialDraftStore,
    );
    generatedMaterialDraftStoreMock.createGeneratedMaterialDraftRecord.mockReturnValue({
      id: "generated-material-profile-rewrite-1",
      userId: providerAccount.id,
      providerDraftId: "sample-harbour",
      feature: "profile_rewrite",
      status: "draft",
      content: profileRewriteMaterial,
      createdAt: "2026-06-26T00:00:00.000Z",
      updatedAt: "2026-06-26T00:00:00.000Z",
    });
    generatedMaterialDraftStore.saveGeneratedMaterialDraft.mockResolvedValue({
      id: "generated-material-profile-rewrite-1",
    });
    providerDraftStoreMock.getProviderDraftStore.mockReturnValue(providerStore);
    providerDraftStoreMock.resolveProviderDraftForOwner.mockResolvedValue({
      draft: providerDraft,
      source: "store",
      record: {
        id: "sample-harbour",
        source: "provider-profile-generator",
        draftPayload: "{}",
        status: "claimed",
        ownerUserId: providerAccount.id,
        claimedAt: "2026-06-26T00:00:00.000Z",
        createdAt: "2026-06-26T00:00:00.000Z",
        updatedAt: "2026-06-26T00:00:00.000Z",
      },
    });
    rateLimitMock.getGuidedAiRateLimiter.mockReturnValue({
      check: rateLimitMock.check,
    });
    rateLimitMock.check.mockReturnValue({
      allowed: true,
      remaining: 5,
      resetAt: "2026-06-26T00:01:00.000Z",
    });
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue({
      auth: { getUser: vi.fn() },
    });
    sessionMock.resolveWorkspaceAccountFromSupabaseSession.mockResolvedValue(
      providerAccount,
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires a verified Supabase session before resolving drafts or calling OpenAI", async () => {
    sessionMock.resolveWorkspaceAccountFromSupabaseSession.mockResolvedValueOnce(
      undefined,
    );
    const { POST } = await import("./route");
    const response = await POST(createProfileRewriteRequest());

    expect(response.status).toBe(401);
    expect(providerDraftStoreMock.resolveProviderDraftForOwner).not.toHaveBeenCalled();
    expect(openAiProfileRewriteMock.generateProfileRewriteDraft).not.toHaveBeenCalled();
  });

  it("generates a profile-rewrite draft and records usage after all gates pass", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      createProfileRewriteRequest({ draftId: "sample-harbour" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      feature: "profile_rewrite",
      draftId: "sample-harbour",
      material: {
        shortEnglishSummary: "Referral-ready community navigation profile.",
        disclaimer:
          "Draft wording based on self-submitted information. Not a CaresLink endorsement.",
      },
      meta: {
        model: "gpt-5.4-mini",
        generatedMaterialDraftId: "generated-material-profile-rewrite-1",
        inputTokenCount: 180,
        outputTokenCount: 120,
      },
    });
    expect(JSON.stringify(body)).not.toContain("test-openai-key");
    expect(openAiProfileRewriteMock.generateProfileRewriteDraft).toHaveBeenCalledWith({
      draft: providerDraft,
      apiKey: "test-openai-key",
      model: "gpt-5.4-mini",
    });
    expect(
      accessControlStoreMock.recordGuidedAiUsageIfAllowed,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: providerAccount.id,
        providerDraftId: "sample-harbour",
        feature: "profile_rewrite",
        inputTokenCount: 180,
        outputTokenCount: 120,
        store: accessStore,
      }),
    );
    expect(
      generatedMaterialDraftStoreMock.createGeneratedMaterialDraftRecord,
    ).toHaveBeenCalledWith({
      userId: providerAccount.id,
      providerDraftId: "sample-harbour",
      feature: "profile_rewrite",
      content: profileRewriteMaterial,
    });
  });
});
