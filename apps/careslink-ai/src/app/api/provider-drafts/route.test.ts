import { beforeEach, describe, expect, it, vi } from "vitest";

const providerDraftStoreMock = vi.hoisted(() => ({
  getProviderDraftStore: vi.fn(),
  saveProviderDraftPayload: vi.fn(),
}));

vi.mock("@/lib/provider-draft-store", async () => {
  const actual = await vi.importActual<
    typeof import("../../../lib/provider-draft-store")
  >("../../../lib/provider-draft-store");

  return {
    ...actual,
    getProviderDraftStore: providerDraftStoreMock.getProviderDraftStore,
    saveProviderDraftPayload: providerDraftStoreMock.saveProviderDraftPayload,
  };
});

vi.mock("@/lib/referral-workspace-handoff", async () =>
  import("../../../lib/referral-workspace-handoff")
);

const providerDraftStore = {
  kind: "memory",
  getDraft: vi.fn(),
  saveDraft: vi.fn(),
};

function createValidDraftPayload(id = "test-provider-1") {
  return JSON.stringify({
    version: 1,
    id,
    businessName: "Bright Path Community Support",
    shortDescription: "Provider-submitted public profile draft.",
  });
}

function createProviderDraftRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/provider-drafts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("provider drafts API route", () => {
  beforeEach(() => {
    providerDraftStoreMock.getProviderDraftStore.mockReset();
    providerDraftStoreMock.saveProviderDraftPayload.mockReset();
    providerDraftStoreMock.getProviderDraftStore.mockReturnValue(providerDraftStore);
    providerDraftStoreMock.saveProviderDraftPayload.mockImplementation(
      async ({
        draftId,
        draftPayload,
      }: {
        draftId: string;
        draftPayload: string;
      }) => ({
        id: draftId,
        source: "provider-profile-generator",
        draftPayload,
        status: "draft",
        createdAt: "2026-06-26T00:00:00.000Z",
        updatedAt: "2026-06-26T00:00:00.000Z",
      }),
    );
    providerDraftStore.getDraft.mockReset();
    providerDraftStore.saveDraft.mockReset();
  });

  it("persists a local handoff provider draft", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      createProviderDraftRequest({
        source: "provider-profile-generator",
        draftId: "test-provider-1",
        draftPayload: createValidDraftPayload(),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      draftId: "test-provider-1",
      source: "provider-profile-generator",
    });
    expect(providerDraftStoreMock.saveProviderDraftPayload).toHaveBeenCalledWith({
      draftId: "test-provider-1",
      draftPayload: createValidDraftPayload(),
      store: providerDraftStore,
    });
  });

  it("allows public generator preflight requests from the CaresLink public origin", async () => {
    const { OPTIONS } = await import("./route");
    const response = await OPTIONS(
      new Request("http://localhost/api/provider-drafts", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:3002",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type",
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3002",
    );
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
      "Content-Type",
    );
  });

  it("returns CORS headers on successful public generator draft saves", async () => {
    const { POST } = await import("./route");
    const request = createProviderDraftRequest({
      source: "provider-profile-generator",
      draftId: "test-provider-1",
      draftPayload: createValidDraftPayload(),
    });
    request.headers.set("Origin", "http://localhost:3002");

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3002",
    );
  });

  it("trims whitespace-padded draft ids before saving and returning them", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      createProviderDraftRequest({
        source: "provider-profile-generator",
        draftId: "  test-provider-1  ",
        draftPayload: createValidDraftPayload(),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      draftId: "test-provider-1",
    });
    expect(providerDraftStoreMock.saveProviderDraftPayload).toHaveBeenCalledWith({
      draftId: "test-provider-1",
      draftPayload: createValidDraftPayload(),
      store: providerDraftStore,
    });
  });

  it("rejects non-generator sources without persistence", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      createProviderDraftRequest({
        source: "unknown-source",
        draftId: "test-provider-1",
        draftPayload: "{}",
      }),
    );

    expect(response.status).toBe(400);
    expect(providerDraftStoreMock.saveProviderDraftPayload).not.toHaveBeenCalled();
  });

  it("rejects oversized draft payloads without persistence", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      createProviderDraftRequest({
        source: "provider-profile-generator",
        draftId: "test-provider-1",
        draftPayload: `{${'"x":'.repeat(9000)}"y"}`,
      }),
    );

    expect(response.status).toBe(400);
    expect(providerDraftStoreMock.saveProviderDraftPayload).not.toHaveBeenCalled();
  });

  it("rejects malformed object-looking draft payloads without persistence", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      createProviderDraftRequest({
        source: "provider-profile-generator",
        draftId: "test-provider-1",
        draftPayload: "{not-object-looking",
      }),
    );

    expect(response.status).toBe(400);
    expect(providerDraftStoreMock.saveProviderDraftPayload).not.toHaveBeenCalled();
  });

  it("rejects invalid draft ids without persistence", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      createProviderDraftRequest({
        source: "provider-profile-generator",
        draftId: "bad draft/../x",
        draftPayload: createValidDraftPayload(),
      }),
    );

    expect(response.status).toBe(400);
    expect(providerDraftStoreMock.saveProviderDraftPayload).not.toHaveBeenCalled();
  });

  it("returns 400 when provider draft store validation fails", async () => {
    providerDraftStoreMock.saveProviderDraftPayload.mockRejectedValueOnce(
      new Error("Invalid provider draft payload: missing required public profile fields."),
    );
    const { POST } = await import("./route");
    const response = await POST(
      createProviderDraftRequest({
        source: "provider-profile-generator",
        draftId: "test-provider-1",
        draftPayload: JSON.stringify({
          version: 1,
          id: "test-provider-1",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(providerDraftStoreMock.saveProviderDraftPayload).toHaveBeenCalledOnce();
  });

  it("returns 500 with a generic error when saving unexpectedly fails", async () => {
    providerDraftStoreMock.saveProviderDraftPayload.mockRejectedValueOnce(
      new Error("database password is incorrect"),
    );
    const { POST } = await import("./route");
    const response = await POST(
      createProviderDraftRequest({
        source: "provider-profile-generator",
        draftId: "test-provider-1",
        draftPayload: createValidDraftPayload(),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      ok: false,
      error: "Unable to save provider draft",
    });
  });
});
