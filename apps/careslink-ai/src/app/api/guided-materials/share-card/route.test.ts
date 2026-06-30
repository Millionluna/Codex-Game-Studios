import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const accessControlStoreMock = vi.hoisted(() => ({
  getAccessControlStore: vi.fn(),
  getGuidedAiAccessDecision: vi.fn(),
  recordGuidedAiUsageIfAllowed: vi.fn(),
}));

const openAiShareCardMock = vi.hoisted(() => ({
  generateShareCardDraft: vi.fn(),
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

vi.mock("@/lib/guided-ai-rate-limit", () => ({
  getGuidedAiRateLimiter: rateLimitMock.getGuidedAiRateLimiter,
}));

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

vi.mock("@/lib/openai-share-card", () => ({
  generateShareCardDraft: openAiShareCardMock.generateShareCardDraft,
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

const adminAccount = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "CaresLink Admin",
  email: "admin@example.com",
  role: "admin" as const,
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

const providerDraftResolution = {
  draft: providerDraft,
  source: "store" as const,
  record: {
    id: "sample-harbour",
    source: "provider-profile-generator",
    draftPayload: JSON.stringify({
      version: 1,
      id: "sample-harbour",
      businessName: "Harbour Community Support",
      shortDescription: "Community support profile.",
    }),
    status: "claimed" as const,
    ownerUserId: providerAccount.id,
    claimedAt: "2026-06-26T00:00:00.000Z",
    createdAt: "2026-06-26T00:00:00.000Z",
    updatedAt: "2026-06-26T00:00:00.000Z",
  },
};

const accessStore = { kind: "memory" };
const generatedMaterialDraftStore = {
  kind: "memory",
  saveGeneratedMaterialDraft: vi.fn(),
};
const providerStore = { kind: "memory" };

function createShareCardRequest(body: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/guided-materials/share-card", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("guided share-card API route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    vi.stubEnv("OPENAI_SHARE_CARD_MODEL", "gpt-5.4-mini");

    accessControlStoreMock.getAccessControlStore.mockReset();
    accessControlStoreMock.getGuidedAiAccessDecision.mockReset();
    accessControlStoreMock.recordGuidedAiUsageIfAllowed.mockReset();
    generatedMaterialDraftStoreMock.createGeneratedMaterialDraftRecord.mockReset();
    generatedMaterialDraftStoreMock.getGeneratedMaterialDraftStore.mockReset();
    generatedMaterialDraftStore.saveGeneratedMaterialDraft.mockReset();
    openAiShareCardMock.generateShareCardDraft.mockReset();
    providerDraftStoreMock.getProviderDraftStore.mockReset();
    providerDraftStoreMock.resolveProviderDraftForOwner.mockReset();
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
      decision: {
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
      },
      event: {
        id: "usage-1",
        userId: providerAccount.id,
        providerDraftId: "sample-harbour",
        feature: "share_card",
        inputTokenCount: 120,
        outputTokenCount: 80,
        createdAt: "2026-06-26T00:00:00.000Z",
      },
    });
    openAiShareCardMock.generateShareCardDraft.mockResolvedValue({
      material: {
        headline: "Harbour Community Support",
        subheadline: "Referral-ready community support profile",
        serviceArea: "Inner West Sydney",
        languages: "English; Mandarin",
        referralFit: "Older adults who need navigation",
        intakePath: "Phone warm handover",
        disclaimer:
          "Based on self-submitted information. Not a provider endorsement.",
      },
      inputTokenCount: 120,
      outputTokenCount: 80,
    });
    generatedMaterialDraftStoreMock.getGeneratedMaterialDraftStore.mockReturnValue(
      generatedMaterialDraftStore,
    );
    generatedMaterialDraftStoreMock.createGeneratedMaterialDraftRecord.mockReturnValue({
      id: "generated-material-1",
      userId: providerAccount.id,
      providerDraftId: "sample-harbour",
      feature: "share_card",
      status: "draft",
      content: {
        headline: "Harbour Community Support",
        subheadline: "Referral-ready community support profile",
        serviceArea: "Inner West Sydney",
        languages: "English; Mandarin",
        referralFit: "Older adults who need navigation",
        intakePath: "Phone warm handover",
        disclaimer:
          "Based on self-submitted information. Not a provider endorsement.",
      },
      createdAt: "2026-06-26T00:00:00.000Z",
      updatedAt: "2026-06-26T00:00:00.000Z",
    });
    generatedMaterialDraftStore.saveGeneratedMaterialDraft.mockResolvedValue({
      id: "generated-material-1",
      userId: providerAccount.id,
      providerDraftId: "sample-harbour",
      feature: "share_card",
      status: "draft",
      content: {
        headline: "Harbour Community Support",
        subheadline: "Referral-ready community support profile",
        serviceArea: "Inner West Sydney",
        languages: "English; Mandarin",
        referralFit: "Older adults who need navigation",
        intakePath: "Phone warm handover",
        disclaimer:
          "Based on self-submitted information. Not a provider endorsement.",
      },
      createdAt: "2026-06-26T00:00:00.000Z",
      updatedAt: "2026-06-26T00:00:00.000Z",
    });
    providerDraftStoreMock.getProviderDraftStore.mockReturnValue(providerStore);
    providerDraftStoreMock.resolveProviderDraftForOwner.mockResolvedValue(
      providerDraftResolution,
    );
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
    const response = await POST(createShareCardRequest());

    expect(response.status).toBe(401);
    expect(providerDraftStoreMock.resolveProviderDraftForOwner).not.toHaveBeenCalled();
    expect(openAiShareCardMock.generateShareCardDraft).not.toHaveBeenCalled();
  });

  it("rejects non-provider accounts before calling OpenAI", async () => {
    sessionMock.resolveWorkspaceAccountFromSupabaseSession.mockResolvedValueOnce(
      adminAccount,
    );
    const { POST } = await import("./route");
    const response = await POST(createShareCardRequest());

    expect(response.status).toBe(403);
    expect(openAiShareCardMock.generateShareCardDraft).not.toHaveBeenCalled();
  });

  it("requires an access code before calling OpenAI", async () => {
    accessControlStoreMock.getGuidedAiAccessDecision.mockResolvedValueOnce({
      allowed: false,
      reason: "access_required",
      accessState: {
        userId: providerAccount.id,
        hasAccessCode: false,
        status: "waitlist",
        dailyQuota: 0,
        usedToday: 0,
      },
      remainingQuota: 0,
    });
    const { POST } = await import("./route");
    const response = await POST(createShareCardRequest());

    expect(response.status).toBe(403);
    expect(openAiShareCardMock.generateShareCardDraft).not.toHaveBeenCalled();
  });

  it("stops at quota exhaustion before calling OpenAI", async () => {
    accessControlStoreMock.getGuidedAiAccessDecision.mockResolvedValueOnce({
      allowed: false,
      reason: "quota_exhausted",
      accessState: {
        userId: providerAccount.id,
        hasAccessCode: true,
        status: "approved",
        codeType: "Provider Pilot",
        dailyQuota: 1,
        usedToday: 1,
      },
      remainingQuota: 0,
    });
    const { POST } = await import("./route");
    const response = await POST(createShareCardRequest());

    expect(response.status).toBe(429);
    expect(openAiShareCardMock.generateShareCardDraft).not.toHaveBeenCalled();
  });

  it("rate limits an authenticated provider before checking quota or calling OpenAI", async () => {
    rateLimitMock.check.mockReturnValueOnce({
      allowed: false,
      retryAfterSeconds: 42,
      resetAt: "2026-06-26T00:01:00.000Z",
    });
    const { POST } = await import("./route");
    const response = await POST(createShareCardRequest());
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toMatchObject({
      ok: false,
      error: "Too many guided AI requests",
      retryAfterSeconds: 42,
    });
    expect(accessControlStoreMock.getGuidedAiAccessDecision).not.toHaveBeenCalled();
    expect(openAiShareCardMock.generateShareCardDraft).not.toHaveBeenCalled();
  });

  it("requires a claimed provider draft for the signed-in provider", async () => {
    providerDraftStoreMock.resolveProviderDraftForOwner.mockResolvedValueOnce(
      undefined,
    );
    const { POST } = await import("./route");
    const response = await POST(createShareCardRequest());

    expect(response.status).toBe(404);
    expect(openAiShareCardMock.generateShareCardDraft).not.toHaveBeenCalled();
  });

  it("rejects a requested draft id that does not belong to the signed-in provider", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      createShareCardRequest({ draftId: "other-provider" }),
    );

    expect(response.status).toBe(403);
    expect(openAiShareCardMock.generateShareCardDraft).not.toHaveBeenCalled();
  });

  it("returns service unavailable when the OpenAI API key is not configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const { POST } = await import("./route");
    const response = await POST(createShareCardRequest());

    expect(response.status).toBe(503);
    expect(openAiShareCardMock.generateShareCardDraft).not.toHaveBeenCalled();
  });

  it("generates a share-card draft and records usage after all gates pass", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      createShareCardRequest({ draftId: "sample-harbour" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      feature: "share_card",
      draftId: "sample-harbour",
      material: {
        headline: "Harbour Community Support",
        disclaimer:
          "Based on self-submitted information. Not a provider endorsement.",
      },
      meta: {
        model: "gpt-5.4-mini",
        generatedMaterialDraftId: "generated-material-1",
        inputTokenCount: 120,
        outputTokenCount: 80,
        remainingQuotaBefore: 4,
      },
    });
    expect(JSON.stringify(body)).not.toContain("test-openai-key");
    expect(openAiShareCardMock.generateShareCardDraft).toHaveBeenCalledWith({
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
        feature: "share_card",
        inputTokenCount: 120,
        outputTokenCount: 80,
        store: accessStore,
      }),
    );
    expect(
      generatedMaterialDraftStoreMock.createGeneratedMaterialDraftRecord,
    ).toHaveBeenCalledWith({
      userId: providerAccount.id,
      providerDraftId: "sample-harbour",
      feature: "share_card",
      content: {
        headline: "Harbour Community Support",
        subheadline: "Referral-ready community support profile",
        serviceArea: "Inner West Sydney",
        languages: "English; Mandarin",
        referralFit: "Older adults who need navigation",
        intakePath: "Phone warm handover",
        disclaimer:
          "Based on self-submitted information. Not a provider endorsement.",
      },
    });
    expect(
      generatedMaterialDraftStore.saveGeneratedMaterialDraft,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "generated-material-1",
        userId: providerAccount.id,
        providerDraftId: "sample-harbour",
        feature: "share_card",
        status: "draft",
      }),
    );
  });
});
