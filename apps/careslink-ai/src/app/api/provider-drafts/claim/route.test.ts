import { beforeEach, describe, expect, it, vi } from "vitest";

const providerDraftStoreMock = vi.hoisted(() => ({
  claimProviderDraft: vi.fn(),
  getProviderDraftStore: vi.fn(),
}));
const workspaceServerAuthMock = vi.hoisted(() => ({
  resolveWorkspaceAccountFromRequest: vi.fn(),
}));

vi.mock("@/lib/provider-draft-store", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../lib/provider-draft-store")
  >("../../../../lib/provider-draft-store");

  return {
    ...actual,
    claimProviderDraft: providerDraftStoreMock.claimProviderDraft,
    getProviderDraftStore: providerDraftStoreMock.getProviderDraftStore,
  };
});

vi.mock("@/lib/referral-workspace-auth", async () =>
  import("../../../../lib/referral-workspace-auth")
);
vi.mock("@/lib/referral-workspace-server-auth", () => ({
  resolveWorkspaceAccountFromRequest:
    workspaceServerAuthMock.resolveWorkspaceAccountFromRequest,
}));

const providerDraftStore = {
  kind: "memory",
  getDraft: vi.fn(),
  getDraftByOwner: vi.fn(),
  saveDraft: vi.fn(),
};

function createClaimRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/provider-drafts/claim", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function createAuthenticatedClaimRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/provider-drafts/claim", {
    method: "POST",
    headers: { authorization: "Bearer real-access-token" },
    body: JSON.stringify(body),
  });
}

describe("provider draft claim API route", () => {
  beforeEach(() => {
    providerDraftStoreMock.getProviderDraftStore.mockReset();
    providerDraftStoreMock.claimProviderDraft.mockReset();
    workspaceServerAuthMock.resolveWorkspaceAccountFromRequest.mockReset();
    providerDraftStoreMock.getProviderDraftStore.mockReturnValue(providerDraftStore);
    workspaceServerAuthMock.resolveWorkspaceAccountFromRequest.mockResolvedValue({
      source: "demo",
      account: {
        id: "user-free",
        name: "Alex Lee",
        email: "alex.free@example.com",
        role: "provider",
      },
    });
    providerDraftStoreMock.claimProviderDraft.mockImplementation(
      async ({
        draftId,
        ownerUserId,
      }: {
        draftId: string;
        ownerUserId: string;
      }) => ({
        id: draftId,
        source: "provider-profile-generator",
        draftPayload: "{}",
        status: "claimed",
        ownerUserId,
        claimedAt: "2026-06-26T01:00:00.000Z",
        createdAt: "2026-06-25T10:00:00.000Z",
        updatedAt: "2026-06-26T01:00:00.000Z",
      }),
    );
  });

  it("claims a provider draft for a signed-in provider account", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      createClaimRequest({
        draftId: "riverside-care-navigation",
        accountId: "user-free",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      draftId: "riverside-care-navigation",
      ownerUserId: "user-free",
      status: "claimed",
      claimedAt: "2026-06-26T01:00:00.000Z",
    });
    expect(providerDraftStoreMock.claimProviderDraft).toHaveBeenCalledWith({
      draftId: "riverside-care-navigation",
      ownerUserId: "user-free",
      store: providerDraftStore,
    });
    expect(
      workspaceServerAuthMock.resolveWorkspaceAccountFromRequest,
    ).toHaveBeenCalledWith(expect.any(Request), {
      demoAccountId: "user-free",
    });
  });

  it("claims a provider draft for a verified Supabase auth user without demo account id", async () => {
    workspaceServerAuthMock.resolveWorkspaceAccountFromRequest.mockResolvedValueOnce({
      source: "supabase",
      account: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Provider Owner",
        email: "provider@example.com",
        role: "provider",
      },
    });
    const { POST } = await import("./route");
    const response = await POST(
      createAuthenticatedClaimRequest({
        draftId: "riverside-care-navigation",
      }),
    );

    expect(response.status).toBe(200);
    expect(providerDraftStoreMock.claimProviderDraft).toHaveBeenCalledWith({
      draftId: "riverside-care-navigation",
      ownerUserId: "11111111-1111-4111-8111-111111111111",
      store: providerDraftStore,
    });
  });

  it("rejects admin accounts because they cannot own provider drafts", async () => {
    workspaceServerAuthMock.resolveWorkspaceAccountFromRequest.mockResolvedValueOnce({
      source: "demo",
      account: {
        id: "user-admin",
        name: "CaresLink Admin",
        email: "admin@example.com",
        role: "admin",
      },
    });
    const { POST } = await import("./route");
    const response = await POST(
      createClaimRequest({
        draftId: "riverside-care-navigation",
        accountId: "user-admin",
      }),
    );

    expect(response.status).toBe(403);
    expect(providerDraftStoreMock.claimProviderDraft).not.toHaveBeenCalled();
  });

  it("rejects missing server auth accounts", async () => {
    workspaceServerAuthMock.resolveWorkspaceAccountFromRequest.mockResolvedValueOnce({
      source: "none",
    });
    const { POST } = await import("./route");
    const response = await POST(
      createClaimRequest({
        draftId: "riverside-care-navigation",
      }),
    );

    expect(response.status).toBe(401);
    expect(providerDraftStoreMock.claimProviderDraft).not.toHaveBeenCalled();
  });

  it("does not let demo accounts claim drafts against the persistent Supabase store", async () => {
    providerDraftStoreMock.getProviderDraftStore.mockReturnValueOnce({
      ...providerDraftStore,
      kind: "supabase",
    });
    const { POST } = await import("./route");
    const response = await POST(
      createClaimRequest({
        draftId: "riverside-care-navigation",
        accountId: "user-free",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      ok: false,
      error: "Demo account claiming is disabled for persistent storage",
    });
    expect(providerDraftStoreMock.claimProviderDraft).not.toHaveBeenCalled();
  });

  it("rejects invalid draft ids without claiming", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      createClaimRequest({
        draftId: "bad draft/../x",
        accountId: "user-free",
      }),
    );

    expect(response.status).toBe(400);
    expect(providerDraftStoreMock.claimProviderDraft).not.toHaveBeenCalled();
  });

  it("returns 409 when a draft is already claimed by another owner", async () => {
    providerDraftStoreMock.claimProviderDraft.mockRejectedValueOnce(
      new Error("Provider draft is already claimed."),
    );
    const { POST } = await import("./route");
    const response = await POST(
      createClaimRequest({
        draftId: "riverside-care-navigation",
        accountId: "user-free",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      ok: false,
      error: "Provider draft is already claimed",
    });
  });
});
