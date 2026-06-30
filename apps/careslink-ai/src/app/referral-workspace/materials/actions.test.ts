import { beforeEach, describe, expect, it, vi } from "vitest";

const generatedMaterialDraftStoreMock = vi.hoisted(() => ({
  getGeneratedMaterialDraftStore: vi.fn(),
  updateGeneratedMaterialDraftStatus: vi.fn(),
}));

const sessionMock = vi.hoisted(() => ({
  resolveWorkspaceAccountFromSupabaseSession: vi.fn(),
}));

const supabaseServerMock = vi.hoisted(() => ({
  createCareslinkServerSupabaseClient: vi.fn(),
}));

const cacheMock = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
}));

const navigationMock = vi.hoisted(() => ({
  redirect: vi.fn(),
}));

vi.mock("../../../lib/generated-material-draft-store", async () => {
  const actual = await vi.importActual<
    typeof import("../../../lib/generated-material-draft-store")
  >("../../../lib/generated-material-draft-store");

  return {
    ...actual,
    getGeneratedMaterialDraftStore:
      generatedMaterialDraftStoreMock.getGeneratedMaterialDraftStore,
    updateGeneratedMaterialDraftStatus:
      generatedMaterialDraftStoreMock.updateGeneratedMaterialDraftStatus,
  };
});

vi.mock("../../../lib/referral-workspace-session", async () => {
  const actual = await vi.importActual<
    typeof import("../../../lib/referral-workspace-session")
  >("../../../lib/referral-workspace-session");

  return {
    ...actual,
    resolveWorkspaceAccountFromSupabaseSession:
      sessionMock.resolveWorkspaceAccountFromSupabaseSession,
  };
});

vi.mock("../../../lib/supabase-server", () => ({
  createCareslinkServerSupabaseClient:
    supabaseServerMock.createCareslinkServerSupabaseClient,
}));

vi.mock("next/cache", () => ({
  revalidatePath: cacheMock.revalidatePath,
}));

vi.mock("next/navigation", () => ({
  redirect: navigationMock.redirect,
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

const store = {
  kind: "memory",
};

function createStatusFormData(values: Record<string, string>) {
  const formData = new FormData();

  Object.entries(values).forEach(([key, value]) => formData.set(key, value));

  return formData;
}

describe("generated material status actions", () => {
  beforeEach(() => {
    vi.resetModules();
    generatedMaterialDraftStoreMock.getGeneratedMaterialDraftStore.mockReset();
    generatedMaterialDraftStoreMock.updateGeneratedMaterialDraftStatus.mockReset();
    sessionMock.resolveWorkspaceAccountFromSupabaseSession.mockReset();
    supabaseServerMock.createCareslinkServerSupabaseClient.mockReset();
    cacheMock.revalidatePath.mockReset();
    navigationMock.redirect.mockReset();

    generatedMaterialDraftStoreMock.getGeneratedMaterialDraftStore.mockReturnValue(
      store,
    );
    generatedMaterialDraftStoreMock.updateGeneratedMaterialDraftStatus.mockResolvedValue({
      id: "generated-material-1",
      userId: providerAccount.id,
      providerDraftId: "sample-harbour",
      feature: "share_card",
      status: "reviewed",
      content: {},
      createdAt: "2026-06-26T03:00:00.000Z",
      updatedAt: "2026-06-26T04:00:00.000Z",
    });
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue({
      auth: { getUser: vi.fn() },
    });
    sessionMock.resolveWorkspaceAccountFromSupabaseSession.mockResolvedValue(
      providerAccount,
    );
  });

  it("marks a generated material draft as reviewed for the owning provider session", async () => {
    const { updateGeneratedMaterialDraftStatusAction } = await import("./actions");

    await updateGeneratedMaterialDraftStatusAction(
      createStatusFormData({
        materialDraftId: "generated-material-1",
        status: "reviewed",
        lang: "zh-Hans",
        source: "provider-profile-generator",
        draftId: "sample-harbour",
      }),
    );

    expect(
      generatedMaterialDraftStoreMock.updateGeneratedMaterialDraftStatus,
    ).toHaveBeenCalledWith({
      draftId: "generated-material-1",
      userId: providerAccount.id,
      status: "reviewed",
      store,
    });
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith(
      "/referral-workspace/materials",
    );
    expect(navigationMock.redirect).toHaveBeenCalledWith(
      "/referral-workspace/materials?lang=zh-Hans&source=provider-profile-generator&draftId=sample-harbour&materialStatus=reviewed",
    );
  });

  it("does not update generated material drafts without a verified provider session", async () => {
    sessionMock.resolveWorkspaceAccountFromSupabaseSession.mockResolvedValueOnce(
      undefined,
    );
    const { updateGeneratedMaterialDraftStatusAction } = await import("./actions");

    await updateGeneratedMaterialDraftStatusAction(
      createStatusFormData({
        materialDraftId: "generated-material-1",
        status: "archived",
        lang: "en",
      }),
    );

    expect(
      generatedMaterialDraftStoreMock.updateGeneratedMaterialDraftStatus,
    ).not.toHaveBeenCalled();
    expect(cacheMock.revalidatePath).not.toHaveBeenCalled();
    expect(navigationMock.redirect).toHaveBeenCalledWith(
      "/referral-workspace/materials?lang=en&materialStatus=login-required",
    );
  });

  it("does not update generated material drafts for non-provider sessions", async () => {
    sessionMock.resolveWorkspaceAccountFromSupabaseSession.mockResolvedValueOnce(
      adminAccount,
    );
    const { updateGeneratedMaterialDraftStatusAction } = await import("./actions");

    await updateGeneratedMaterialDraftStatusAction(
      createStatusFormData({
        materialDraftId: "generated-material-1",
        status: "reviewed",
      }),
    );

    expect(
      generatedMaterialDraftStoreMock.updateGeneratedMaterialDraftStatus,
    ).not.toHaveBeenCalled();
    expect(navigationMock.redirect).toHaveBeenCalledWith(
      "/referral-workspace/materials?materialStatus=login-required",
    );
  });

  it("does not update generated material drafts that do not belong to the session user", async () => {
    generatedMaterialDraftStoreMock.updateGeneratedMaterialDraftStatus.mockResolvedValueOnce(
      undefined,
    );
    const { updateGeneratedMaterialDraftStatusAction } = await import("./actions");

    await updateGeneratedMaterialDraftStatusAction(
      createStatusFormData({
        materialDraftId: "generated-material-1",
        status: "archived",
      }),
    );

    expect(cacheMock.revalidatePath).not.toHaveBeenCalled();
    expect(navigationMock.redirect).toHaveBeenCalledWith(
      "/referral-workspace/materials?materialStatus=not-found",
    );
  });
});
