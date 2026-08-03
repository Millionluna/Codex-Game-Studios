import { beforeEach, describe, expect, it, vi } from "vitest";

const companionStoreMock = vi.hoisted(() => ({
  getNdisCaseNoteCompanionStore: vi.fn(),
}));

const materialStoreMock = vi.hoisted(() => ({
  getGeneratedMaterialDraftStore: vi.fn(),
}));

const sessionMock = vi.hoisted(() => ({
  resolveWorkspaceAccountFromSupabaseSession: vi.fn(),
}));

const supabaseMock = vi.hoisted(() => ({
  createCareslinkServerSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/ndis-case-note-companion-store", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../../lib/ndis-case-note-companion-store")
  >("../../../../../lib/ndis-case-note-companion-store");

  return {
    ...actual,
    getNdisCaseNoteCompanionStore:
      companionStoreMock.getNdisCaseNoteCompanionStore,
  };
});

vi.mock("@/lib/ndis-case-note-companion-request", async () => {
  return vi.importActual(
    "../../../../../lib/ndis-case-note-companion-request",
  );
});

vi.mock("@/lib/generated-material-draft-store", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../../lib/generated-material-draft-store")
  >("../../../../../lib/generated-material-draft-store");

  return {
    ...actual,
    getGeneratedMaterialDraftStore:
      materialStoreMock.getGeneratedMaterialDraftStore,
  };
});

vi.mock("@/lib/referral-workspace-session", () => ({
  resolveWorkspaceAccountFromSupabaseSession:
    sessionMock.resolveWorkspaceAccountFromSupabaseSession,
}));

vi.mock("@/lib/supabase-server", () => ({
  createCareslinkServerSupabaseClient:
    supabaseMock.createCareslinkServerSupabaseClient,
}));

const provider = {
  id: "11111111-1111-4111-8111-111111111111",
  role: "provider" as const,
  name: "Provider",
  email: "provider@example.com",
};

const claimToken = "a".repeat(43);
const material = {
  englishCaseNoteDraft: "Neutral case note draft.",
  chineseReviewVersion: "中性 case note 草稿。",
  missingFacts: [],
  neutralWordingChecks: [],
  followUpPrompts: [],
  disclaimer:
    "User-reviewed draft wording based only on the details entered. It is not a completed record or clinical, legal, compliance, regulatory, care, or professional advice. General documentation support only.",
};

const claim = {
  tokenHash: "b".repeat(64),
  material,
  expiresAt: "2026-07-23T01:00:00.000Z",
  claimedByUserId: provider.id,
  claimedAt: "2026-07-23T00:00:00.000Z",
  createdAt: "2026-07-23T00:00:00.000Z",
};

const companionStore = {
  purgeExpiredClaims: vi.fn(),
  consumeClaim: vi.fn(),
  completeClaim: vi.fn(),
  recordEvent: vi.fn(),
};

const materialStore = {
  getGeneratedMaterialDraft: vi.fn(),
  saveGeneratedMaterialDraft: vi.fn(),
};

function createSaveRequest() {
  return new Request(
    "http://localhost/api/template-companion/ndis-case-note/save?source=ndis-case-note-download&resourceSlug=ndis-case-note-template",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "careslink_ndis_companion_session=session_test_1234567890abcdef",
      },
      body: JSON.stringify({ claimToken }),
    },
  );
}

describe("NDIS case note save route", () => {
  beforeEach(() => {
    vi.resetModules();
    companionStoreMock.getNdisCaseNoteCompanionStore.mockReset();
    materialStoreMock.getGeneratedMaterialDraftStore.mockReset();
    sessionMock.resolveWorkspaceAccountFromSupabaseSession.mockReset();
    supabaseMock.createCareslinkServerSupabaseClient.mockReset();
    Object.values(companionStore).forEach((mock) => mock.mockReset());
    Object.values(materialStore).forEach((mock) => mock.mockReset());

    companionStoreMock.getNdisCaseNoteCompanionStore.mockReturnValue(
      companionStore,
    );
    materialStoreMock.getGeneratedMaterialDraftStore.mockReturnValue(
      materialStore,
    );
    supabaseMock.createCareslinkServerSupabaseClient.mockResolvedValue(
      { auth: {} },
    );
    sessionMock.resolveWorkspaceAccountFromSupabaseSession.mockResolvedValue(
      provider,
    );
    companionStore.consumeClaim.mockResolvedValue(claim);
    companionStore.recordEvent.mockImplementation(async (event) => event);
    companionStore.purgeExpiredClaims.mockResolvedValue(undefined);
    companionStore.completeClaim.mockResolvedValue(undefined);
    materialStore.getGeneratedMaterialDraft.mockResolvedValue(undefined);
    materialStore.saveGeneratedMaterialDraft.mockImplementation(
      async (record) => record,
    );
  });

  it("requires sign-in before claim lookup or persistence", async () => {
    sessionMock.resolveWorkspaceAccountFromSupabaseSession.mockResolvedValueOnce(
      undefined,
    );
    const { POST } = await import("./route");
    const response = await POST(createSaveRequest());

    expect(response.status).toBe(401);
    expect(companionStore.consumeClaim).not.toHaveBeenCalled();
  });

  it("claims and saves the output as an owner-scoped NDIS material draft", async () => {
    const { POST } = await import("./route");
    const response = await POST(createSaveRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      feature: "ndis_case_note",
      material,
    });
    expect(materialStore.saveGeneratedMaterialDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: provider.id,
        feature: "ndis_case_note",
        content: material,
      }),
    );
    expect(companionStore.completeClaim).toHaveBeenCalledWith({
      token: claimToken,
      userId: provider.id,
    });

    const event = companionStore.recordEvent.mock.calls[0][0];
    expect(event).toMatchObject({
      eventName: "companion_saved",
      userId: provider.id,
    });
    expect(JSON.stringify(event)).not.toContain(material.englishCaseNoteDraft);
    expect(JSON.stringify(event)).not.toContain(material.chineseReviewVersion);
  });

  it("does not save an expired or differently owned claim", async () => {
    companionStore.consumeClaim.mockResolvedValueOnce(undefined);
    const { POST } = await import("./route");
    const response = await POST(createSaveRequest());

    expect(response.status).toBe(410);
    expect(materialStore.saveGeneratedMaterialDraft).not.toHaveBeenCalled();
  });

  it("keeps the first owner binding when material persistence fails", async () => {
    materialStore.saveGeneratedMaterialDraft.mockRejectedValueOnce(
      new Error("database unavailable"),
    );
    const { POST } = await import("./route");
    const response = await POST(createSaveRequest());

    expect(response.status).toBe(502);
    expect(companionStore.completeClaim).not.toHaveBeenCalled();
  });

  it("returns only an existing draft owned by the signed-in provider", async () => {
    materialStore.getGeneratedMaterialDraft.mockResolvedValueOnce({
      id: `ndis-case-note-${claim.tokenHash.slice(0, 32)}`,
      userId: provider.id,
      feature: "ndis_case_note",
      status: "draft",
      content: material,
      createdAt: claim.createdAt,
      updatedAt: claim.createdAt,
    });
    const { POST } = await import("./route");
    const response = await POST(createSaveRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.alreadySaved).toBe(true);
    expect(materialStore.saveGeneratedMaterialDraft).not.toHaveBeenCalled();
  });
});
