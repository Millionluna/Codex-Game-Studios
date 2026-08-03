import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  resolveAccount: vi.fn(),
  getStore: vi.fn(),
  recordEvent: vi.fn(),
  getRateLimiter: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  createCareslinkServerSupabaseClient: mocks.createServerClient,
}));
vi.mock("@/lib/referral-workspace-session", () => ({
  resolveWorkspaceAccountFromSupabaseSession: mocks.resolveAccount,
}));
vi.mock("@/lib/guided-ai-rate-limit", () => ({
  getGuidedAiRateLimiter: mocks.getRateLimiter,
}));
vi.mock("@/lib/ndis-case-note-companion-store", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../lib/ndis-case-note-companion-store")
  >("../../../../lib/ndis-case-note-companion-store");

  return {
    ...actual,
    getNdisCaseNoteCompanionStore: mocks.getStore,
  };
});
vi.mock("@/lib/ndis-case-note-companion-request", async () => {
  return vi.importActual("../../../../lib/ndis-case-note-companion-request");
});

const provider = {
  id: "11111111-1111-4111-8111-111111111111",
  role: "provider" as const,
  name: "Provider",
  email: "provider@example.com",
};

function createRequest() {
  return new Request(
    "http://localhost/api/template-companion/events?source=ndis-case-note-download&resourceSlug=ndis-case-note-template&utm_source=careslink",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "careslink_ndis_companion_session=session_test_1234567890abcdef",
        "user-agent": "vitest",
        "x-forwarded-for": "203.0.113.10",
      },
      body: JSON.stringify({ eventName: "companion_viewed" }),
    },
  );
}

describe("provider-only companion telemetry", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NDIS_CASE_NOTE_FINGERPRINT_PEPPER", "test-pepper");
    vi.clearAllMocks();
    mocks.createServerClient.mockResolvedValue({ auth: {} });
    mocks.resolveAccount.mockResolvedValue(provider);
    mocks.getStore.mockReturnValue({ recordEvent: mocks.recordEvent });
    mocks.recordEvent.mockImplementation(async (event) => event);
    mocks.getRateLimiter.mockReturnValue({ check: mocks.checkRateLimit });
    mocks.checkRateLimit.mockReturnValue({
      allowed: true,
      remaining: 5,
      resetAt: "2026-08-03T00:01:00.000Z",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects an unauthenticated event before parsing or rate limiting", async () => {
    mocks.resolveAccount.mockResolvedValueOnce(undefined);
    const json = vi.fn();
    const request = {
      url: "http://localhost/api/template-companion/events",
      headers: new Headers(),
      json,
    } as unknown as Request;

    const { POST } = await import("./route");
    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(json).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.getStore).not.toHaveBeenCalled();
  });

  it("records provider metadata without case-note content", async () => {
    const { POST } = await import("./route");
    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      `ndis-case-note-event:user:${provider.id}`,
    );
    const event = mocks.recordEvent.mock.calls[0]?.[0];
    expect(event).toMatchObject({
      eventName: "companion_viewed",
      userId: provider.id,
      attribution: {
        source: "ndis-case-note-download",
        resourceSlug: "ndis-case-note-template",
        utmSource: "careslink",
      },
    });
    expect(JSON.stringify(event)).not.toContain("observableFacts");
    expect(JSON.stringify(event)).not.toContain("caseNoteDraft");
  });

  it("rejects an admin before reading event data", async () => {
    mocks.resolveAccount.mockResolvedValueOnce({ ...provider, role: "admin" });
    const json = vi.fn();
    const request = {
      url: "http://localhost/api/template-companion/events",
      headers: new Headers(),
      json,
    } as unknown as Request;

    const { POST } = await import("./route");
    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(json).not.toHaveBeenCalled();
    expect(mocks.recordEvent).not.toHaveBeenCalled();
  });
});
