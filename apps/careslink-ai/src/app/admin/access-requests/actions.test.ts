import { beforeEach, describe, expect, it, vi } from "vitest";

const accessControlStoreMock = vi.hoisted(() => ({
  approveAccessRequest: vi.fn(),
  declineAccessRequest: vi.fn(),
  getAccessControlStore: vi.fn(),
}));

const sessionMock = vi.hoisted(() => ({
  resolveWorkspaceAccountFromSupabaseSession: vi.fn(),
}));

const supabaseServerMock = vi.hoisted(() => ({
  createCareslinkServerSupabaseClient: vi.fn(),
}));

const navigationMock = vi.hoisted(() => ({
  redirect: vi.fn(),
}));

vi.mock("../../../lib/access-control-store", async () => {
  const actual = await vi.importActual<
    typeof import("../../../lib/access-control-store")
  >("../../../lib/access-control-store");

  return {
    ...actual,
    approveAccessRequest: accessControlStoreMock.approveAccessRequest,
    declineAccessRequest: accessControlStoreMock.declineAccessRequest,
    getAccessControlStore: accessControlStoreMock.getAccessControlStore,
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

vi.mock("next/navigation", () => ({
  redirect: navigationMock.redirect,
}));

const store = {
  kind: "memory",
};

function createReviewFormData(values: Record<string, string>) {
  const formData = new FormData();

  Object.entries(values).forEach(([key, value]) => formData.set(key, value));

  return formData;
}

describe("admin access request review actions", () => {
  beforeEach(() => {
    accessControlStoreMock.approveAccessRequest.mockReset();
    accessControlStoreMock.declineAccessRequest.mockReset();
    accessControlStoreMock.getAccessControlStore.mockReset();
    sessionMock.resolveWorkspaceAccountFromSupabaseSession.mockReset();
    supabaseServerMock.createCareslinkServerSupabaseClient.mockReset();
    navigationMock.redirect.mockReset();
    accessControlStoreMock.getAccessControlStore.mockReturnValue(store);
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue({
      auth: { getUser: vi.fn() },
    });
    sessionMock.resolveWorkspaceAccountFromSupabaseSession.mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      name: "CaresLink Admin",
      email: "admin@example.com",
      role: "admin",
    });
  });

  it("approves a queued access request for a verified admin session", async () => {
    const { reviewAccessRequestAction } = await import("./actions");

    await reviewAccessRequestAction(
      createReviewFormData({
        requestId: "request-1",
        decision: "approve",
        lang: "zh-Hans",
      }),
    );

    expect(accessControlStoreMock.approveAccessRequest).toHaveBeenCalledWith({
      requestId: "request-1",
      store,
    });
    expect(accessControlStoreMock.declineAccessRequest).not.toHaveBeenCalled();
    expect(navigationMock.redirect).toHaveBeenCalledWith(
      "/admin/access-requests?lang=zh-Hans&review=approved",
    );
  });

  it("declines a queued access request for a verified admin session", async () => {
    const { reviewAccessRequestAction } = await import("./actions");

    await reviewAccessRequestAction(
      createReviewFormData({
        requestId: "request-1",
        decision: "decline",
        lang: "en",
      }),
    );

    expect(accessControlStoreMock.declineAccessRequest).toHaveBeenCalledWith({
      requestId: "request-1",
      store,
    });
    expect(accessControlStoreMock.approveAccessRequest).not.toHaveBeenCalled();
    expect(navigationMock.redirect).toHaveBeenCalledWith(
      "/admin/access-requests?lang=en&review=declined",
    );
  });

  it("does not review requests for non-admin sessions", async () => {
    sessionMock.resolveWorkspaceAccountFromSupabaseSession.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Provider Owner",
      email: "provider@example.com",
      role: "provider",
    });
    const { reviewAccessRequestAction } = await import("./actions");

    await reviewAccessRequestAction(
      createReviewFormData({
        requestId: "request-1",
        decision: "approve",
        lang: "zh-Hans",
      }),
    );

    expect(accessControlStoreMock.approveAccessRequest).not.toHaveBeenCalled();
    expect(accessControlStoreMock.declineAccessRequest).not.toHaveBeenCalled();
    expect(navigationMock.redirect).toHaveBeenCalledWith(
      "/admin/access-requests?lang=zh-Hans&review=forbidden",
    );
  });
});
