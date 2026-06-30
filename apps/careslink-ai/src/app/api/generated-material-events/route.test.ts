import { beforeEach, describe, expect, it, vi } from "vitest";

const generatedMaterialDraftStoreMock = vi.hoisted(() => ({
  getGeneratedMaterialDraftStore: vi.fn(),
}));

const generatedMaterialEventStoreMock = vi.hoisted(() => ({
  createGeneratedMaterialEventRecord: vi.fn(),
  getGeneratedMaterialEventStore: vi.fn(),
}));

const sessionMock = vi.hoisted(() => ({
  resolveWorkspaceAccountFromSupabaseSession: vi.fn(),
}));

const supabaseServerMock = vi.hoisted(() => ({
  createCareslinkServerSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/generated-material-draft-store", async () => {
  const actual = await vi.importActual<
    typeof import("../../../lib/generated-material-draft-store")
  >("../../../lib/generated-material-draft-store");

  return {
    ...actual,
    getGeneratedMaterialDraftStore:
      generatedMaterialDraftStoreMock.getGeneratedMaterialDraftStore,
  };
});

vi.mock("@/lib/generated-material-event-store", async () => {
  const actual = await vi.importActual<
    typeof import("../../../lib/generated-material-event-store")
  >("../../../lib/generated-material-event-store");

  return {
    ...actual,
    createGeneratedMaterialEventRecord:
      generatedMaterialEventStoreMock.createGeneratedMaterialEventRecord,
    getGeneratedMaterialEventStore:
      generatedMaterialEventStoreMock.getGeneratedMaterialEventStore,
  };
});

vi.mock("@/lib/referral-workspace-session", async () => {
  const actual = await vi.importActual<
    typeof import("../../../lib/referral-workspace-session")
  >("../../../lib/referral-workspace-session");

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
  name: "Provider",
  email: "provider@example.com",
  role: "provider" as const,
};

const adminAccount = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Admin",
  email: "admin@example.com",
  role: "admin" as const,
};

const materialDraft = {
  id: "generated-material-1",
  userId: providerAccount.id,
  providerDraftId: "provider-draft-1",
  feature: "handover_checklist" as const,
  status: "draft" as const,
  content: {
    supportNeed: "Private generated support need should never be returned.",
  },
  createdAt: "2026-06-26T10:00:00.000Z",
  updatedAt: "2026-06-26T10:00:00.000Z",
};

const materialDraftStore = {
  getGeneratedMaterialDraft: vi.fn(),
};

const materialEventStore = {
  saveGeneratedMaterialEvent: vi.fn(),
};

function createEventRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/generated-material-events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("generated material events API route", () => {
  beforeEach(() => {
    vi.resetModules();
    generatedMaterialDraftStoreMock.getGeneratedMaterialDraftStore.mockReset();
    generatedMaterialEventStoreMock.createGeneratedMaterialEventRecord.mockReset();
    generatedMaterialEventStoreMock.getGeneratedMaterialEventStore.mockReset();
    sessionMock.resolveWorkspaceAccountFromSupabaseSession.mockReset();
    supabaseServerMock.createCareslinkServerSupabaseClient.mockReset();
    materialDraftStore.getGeneratedMaterialDraft.mockReset();
    materialEventStore.saveGeneratedMaterialEvent.mockReset();

    generatedMaterialDraftStoreMock.getGeneratedMaterialDraftStore.mockReturnValue(
      materialDraftStore,
    );
    generatedMaterialEventStoreMock.getGeneratedMaterialEventStore.mockReturnValue(
      materialEventStore,
    );
    generatedMaterialEventStoreMock.createGeneratedMaterialEventRecord.mockReturnValue({
      id: "event-1",
      userId: providerAccount.id,
      providerDraftId: "provider-draft-1",
      generatedMaterialDraftId: "generated-material-1",
      feature: "handover_checklist",
      eventType: "copy_field",
      fieldKey: "supportNeed",
      createdAt: "2026-06-26T10:01:00.000Z",
    });
    materialDraftStore.getGeneratedMaterialDraft.mockResolvedValue(materialDraft);
    materialEventStore.saveGeneratedMaterialEvent.mockResolvedValue({
      id: "event-1",
    });
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue({
      auth: { getUser: vi.fn() },
    });
    sessionMock.resolveWorkspaceAccountFromSupabaseSession.mockResolvedValue(
      providerAccount,
    );
  });

  it("requires a verified provider session", async () => {
    sessionMock.resolveWorkspaceAccountFromSupabaseSession.mockResolvedValueOnce(
      undefined,
    );
    const { POST } = await import("./route");
    const response = await POST(
      createEventRequest({
        generatedMaterialDraftId: "generated-material-1",
        eventType: "copy_all",
      }),
    );

    expect(response.status).toBe(401);
    expect(materialEventStore.saveGeneratedMaterialEvent).not.toHaveBeenCalled();
  });

  it("rejects non-provider accounts", async () => {
    sessionMock.resolveWorkspaceAccountFromSupabaseSession.mockResolvedValueOnce(
      adminAccount,
    );
    const { POST } = await import("./route");
    const response = await POST(
      createEventRequest({
        generatedMaterialDraftId: "generated-material-1",
        eventType: "copy_all",
      }),
    );

    expect(response.status).toBe(403);
  });

  it("records a copy event only for the owning provider without returning content", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      createEventRequest({
        generatedMaterialDraftId: "generated-material-1",
        eventType: "copy_field",
        fieldKey: "supportNeed",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, eventId: "event-1" });
    expect(
      generatedMaterialEventStoreMock.createGeneratedMaterialEventRecord,
    ).toHaveBeenCalledWith({
      userId: providerAccount.id,
      providerDraftId: "provider-draft-1",
      generatedMaterialDraftId: "generated-material-1",
      feature: "handover_checklist",
      eventType: "copy_field",
      fieldKey: "supportNeed",
    });
    expect(JSON.stringify(body)).not.toContain("Private generated support need");
  });

  it("rejects copy_field without a field key", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      createEventRequest({
        generatedMaterialDraftId: "generated-material-1",
        eventType: "copy_field",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects events for another provider's draft", async () => {
    materialDraftStore.getGeneratedMaterialDraft.mockResolvedValueOnce({
      ...materialDraft,
      userId: "33333333-3333-4333-8333-333333333333",
    });
    const { POST } = await import("./route");
    const response = await POST(
      createEventRequest({
        generatedMaterialDraftId: "generated-material-1",
        eventType: "copy_all",
      }),
    );

    expect(response.status).toBe(403);
    expect(materialEventStore.saveGeneratedMaterialEvent).not.toHaveBeenCalled();
  });
});
