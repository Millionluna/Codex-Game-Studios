import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  resolveAccount: vi.fn(),
  getStore: vi.fn(),
  deleteDraft: vi.fn(),
  tombstoneDeletedShadow: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  createCareslinkServerSupabaseClient: mocks.createServerClient,
}));

vi.mock("@/lib/referral-workspace-session", () => ({
  resolveWorkspaceAccountFromSupabaseSession: mocks.resolveAccount,
}));

vi.mock("@/lib/generated-material-draft-store", () => ({
  getGeneratedMaterialDraftStore: mocks.getStore,
}));

vi.mock("@/lib/v1/ndis-shadow-integration.server", () => ({
  tombstoneDeletedNdisShadowFromCanonical: mocks.tombstoneDeletedShadow,
}));

const provider = {
  id: "11111111-1111-4111-8111-111111111111",
  role: "provider" as const,
  name: "Provider",
  email: "provider@example.com",
};

const draftId = `ndis-case-note-${"a".repeat(32)}`;
const deletedDraftMetadata = {
  id: draftId,
  userId: provider.id,
  feature: "ndis_case_note" as const,
  status: "draft" as const,
  createdAt: "2026-08-09T00:00:00.000Z",
  updatedAt: "2026-08-09T00:05:00.000Z",
};
const privateDraftWording =
  "The participant attended a private support appointment.";

function createRequest(options: { intent?: string } = {}) {
  const headers = new Headers();

  if (options.intent !== undefined) {
    headers.set("x-careslink-intent", options.intent);
  }

  return new Request(
    `http://localhost/api/template-companion/ndis-case-note/drafts/${draftId}`,
    { method: "DELETE", headers },
  );
}

function createContext(id = draftId) {
  return { params: Promise.resolve({ draftId: id }) };
}

async function readResponse(response: Response) {
  const text = await response.text();

  expect(text).not.toContain(privateDraftWording);

  return JSON.parse(text) as Record<string, unknown>;
}

describe("NDIS case note saved-draft deletion route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.createServerClient.mockResolvedValue({ auth: {} });
    mocks.resolveAccount.mockResolvedValue(provider);
    mocks.getStore.mockReturnValue({
      deleteGeneratedMaterialDraftByUser: mocks.deleteDraft,
    });
    mocks.deleteDraft.mockResolvedValue(deletedDraftMetadata);
    mocks.tombstoneDeletedShadow.mockResolvedValue({
      enabled: false,
      guardReason: "non_preview_environment",
    });
  });

  it("returns 401 before resolving the draft store for an unauthenticated request", async () => {
    mocks.resolveAccount.mockResolvedValueOnce(undefined);
    const { DELETE } = await import("./route");
    const response = await DELETE(
      createRequest({ intent: "delete-generated-draft" }),
      createContext(),
    );
    const payload = await readResponse(response);

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({ ok: false, code: "login_required" });
    expect(mocks.getStore).not.toHaveBeenCalled();
    expect(mocks.deleteDraft).not.toHaveBeenCalled();
    expect(mocks.tombstoneDeletedShadow).not.toHaveBeenCalled();
  });

  it("returns 403 before resolving the draft store for an admin", async () => {
    mocks.resolveAccount.mockResolvedValueOnce({ ...provider, role: "admin" });
    const { DELETE } = await import("./route");
    const response = await DELETE(
      createRequest({ intent: "delete-generated-draft" }),
      createContext(),
    );
    const payload = await readResponse(response);

    expect(response.status).toBe(403);
    expect(payload).toMatchObject({
      ok: false,
      code: "provider_account_required",
    });
    expect(mocks.getStore).not.toHaveBeenCalled();
    expect(mocks.deleteDraft).not.toHaveBeenCalled();
    expect(mocks.tombstoneDeletedShadow).not.toHaveBeenCalled();
  });

  it("requires an explicit delete intent before reading the draft identifier", async () => {
    const params = vi.fn(async () => ({ draftId }));
    const { DELETE } = await import("./route");
    const response = await DELETE(createRequest(), {
      params: { then: params } as unknown as Promise<{ draftId: string }>,
    });
    const payload = await readResponse(response);

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      ok: false,
      code: "delete_confirmation_required",
    });
    expect(params).not.toHaveBeenCalled();
    expect(mocks.getStore).not.toHaveBeenCalled();
    expect(mocks.deleteDraft).not.toHaveBeenCalled();
    expect(mocks.tombstoneDeletedShadow).not.toHaveBeenCalled();
  });

  it("returns the same non-disclosing 404 for an invalid draft identifier", async () => {
    const { DELETE } = await import("./route");
    const response = await DELETE(
      createRequest({ intent: "delete-generated-draft" }),
      createContext("ndis-case-note-private-owner"),
    );
    const payload = await readResponse(response);

    expect(response.status).toBe(404);
    expect(payload).toEqual({
      ok: false,
      code: "draft_not_found",
      error: "Draft not found.",
    });
    expect(mocks.getStore).not.toHaveBeenCalled();
    expect(mocks.deleteDraft).not.toHaveBeenCalled();
    expect(mocks.tombstoneDeletedShadow).not.toHaveBeenCalled();
  });

  it("atomically deletes only the signed-in provider's NDIS case note draft", async () => {
    const { DELETE } = await import("./route");
    const response = await DELETE(
      createRequest({ intent: "delete-generated-draft" }),
      createContext(),
    );
    const payload = await readResponse(response);

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, draftId });
    expect(mocks.deleteDraft).toHaveBeenCalledOnce();
    expect(mocks.deleteDraft).toHaveBeenCalledWith({
      draftId,
      userId: provider.id,
      feature: "ndis_case_note",
    });
    expect(mocks.tombstoneDeletedShadow).toHaveBeenCalledOnce();
    expect(mocks.tombstoneDeletedShadow).toHaveBeenCalledWith({
      ownerUserId: provider.id,
      sourceDraftId: draftId,
      sourceCreatedAt: deletedDraftMetadata.createdAt,
    });
    expect(JSON.stringify(payload)).not.toContain("content");
    expect(JSON.stringify(payload)).not.toContain("participant");
  });

  it.each(["missing draft", "another provider's draft"])(
    "returns the same non-disclosing 404 for %s",
    async () => {
      mocks.deleteDraft.mockResolvedValueOnce(undefined);
      const { DELETE } = await import("./route");
      const response = await DELETE(
        createRequest({ intent: "delete-generated-draft" }),
        createContext(),
      );
      const payload = await readResponse(response);

      expect(response.status).toBe(404);
      expect(payload).toEqual({
        ok: false,
        code: "draft_not_found",
        error: "Draft not found.",
      });
      expect(mocks.deleteDraft).toHaveBeenCalledWith({
        draftId,
        userId: provider.id,
        feature: "ndis_case_note",
      });
      expect(mocks.tombstoneDeletedShadow).not.toHaveBeenCalled();
    },
  );

  it("keeps the successful legacy response when shadow cleanup fails", async () => {
    mocks.tombstoneDeletedShadow.mockRejectedValueOnce(
      new Error(`shadow cleanup unavailable: ${privateDraftWording}`),
    );
    const { DELETE } = await import("./route");
    const response = await DELETE(
      createRequest({ intent: "delete-generated-draft" }),
      createContext(),
    );
    const payload = await readResponse(response);

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, draftId });
    expect(mocks.deleteDraft).toHaveBeenCalledOnce();
    expect(mocks.tombstoneDeletedShadow).toHaveBeenCalledOnce();
  });

  it("returns a generic 503 without exposing store errors or draft content", async () => {
    mocks.deleteDraft.mockRejectedValueOnce(
      new Error(`database unavailable: ${privateDraftWording}`),
    );
    const { DELETE } = await import("./route");
    const response = await DELETE(
      createRequest({ intent: "delete-generated-draft" }),
      createContext(),
    );
    const payload = await readResponse(response);

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      ok: false,
      code: "service_unavailable",
      error: "Draft deletion is temporarily unavailable.",
    });
    expect(JSON.stringify(payload)).not.toContain("database unavailable");
    expect(mocks.tombstoneDeletedShadow).not.toHaveBeenCalled();
  });
});
