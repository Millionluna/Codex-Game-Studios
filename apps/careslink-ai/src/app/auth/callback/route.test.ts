import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseServerMock = vi.hoisted(() => ({
  createCareslinkServerSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  createCareslinkServerSupabaseClient:
    supabaseServerMock.createCareslinkServerSupabaseClient,
}));

vi.mock("@/lib/referral-workspace-auth-actions", async () =>
  import("../../../lib/referral-workspace-auth-actions"),
);

function createAuthClient({
  role,
  userMetadataRole,
  exchangeError,
  userError,
}: {
  role?: "provider" | "admin";
  userMetadataRole?: "provider" | "admin";
  exchangeError?: string;
  userError?: string;
} = {}) {
  return {
    auth: {
      exchangeCodeForSession: vi.fn(async () => ({
        error: exchangeError ? { message: exchangeError } : null,
      })),
      getUser: vi.fn(async () => ({
        data: {
          user: userError
            ? null
            : {
                id: "11111111-1111-4111-8111-111111111111",
                app_metadata: role ? { careslink_role: role } : {},
                user_metadata: userMetadataRole
                  ? { role: userMetadataRole }
                  : {},
              },
        },
        error: userError ? { message: userError } : null,
      })),
    },
  };
}

describe("Supabase auth callback", () => {
  beforeEach(() => {
    supabaseServerMock.createCareslinkServerSupabaseClient.mockReset();
  });

  it("exchanges the OAuth code and returns a provider to an allowlisted route", async () => {
    const authClient = createAuthClient({
      role: "provider",
      userMetadataRole: "admin",
    });
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue(
      authClient,
    );
    const { GET } = await import("./route");
    const response = await GET(
      new Request(
        "https://ai.careslink.com.au/auth/callback?flow=oauth&code=one-time-code" +
          "&next=%2Ftemplate-companion%2Fndis-case-note%3Fsource%3Dndis-case-note-download" +
          "&lang=zh-Hans",
      ),
    );

    expect(authClient.auth.exchangeCodeForSession).toHaveBeenCalledWith(
      "one-time-code",
    );
    expect(response.headers.get("location")).toBe(
      "https://ai.careslink.com.au/template-companion/ndis-case-note?source=ndis-case-note-download&lang=zh-Hans",
    );
    expect(response.headers.get("location")).not.toContain("code=");
    expect(response.headers.get("location")).not.toContain("access_token");
    expect(response.headers.get("location")).not.toContain("refresh_token");
  });

  it("does not let user-editable metadata self-assign the admin role", async () => {
    const authClient = createAuthClient({ userMetadataRole: "admin" });
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue(
      authClient,
    );
    const { GET } = await import("./route");
    const response = await GET(
      new Request(
        "https://ai.careslink.com.au/auth/callback?flow=oauth&code=one-time-code" +
          "&next=%2Fadmin%2Fmaterial-usage&lang=en",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://ai.careslink.com.au/ai-documents?lang=en",
    );
  });

  it("honours a trusted app-metadata admin role for an existing account", async () => {
    const authClient = createAuthClient({ role: "admin" });
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue(
      authClient,
    );
    const { GET } = await import("./route");
    const response = await GET(
      new Request(
        "https://ai.careslink.com.au/auth/callback?flow=oauth&code=one-time-code" +
          "&next=%2Fadmin%2Fmaterial-usage&lang=en",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://ai.careslink.com.au/admin/material-usage?lang=en",
    );
  });

  it("rejects an external next URL and strips OAuth error details", async () => {
    const authClient = createAuthClient();
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue(
      authClient,
    );
    const { GET } = await import("./route");
    const successResponse = await GET(
      new Request(
        "https://ai.careslink.com.au/auth/callback?flow=oauth&code=one-time-code" +
          "&next=https%3A%2F%2Fevil.example%2Fsteal&lang=en",
      ),
    );
    const cancelledResponse = await GET(
      new Request(
        "https://ai.careslink.com.au/auth/callback?flow=oauth" +
          "&error=access_denied&error_description=private-provider-message" +
          "&next=%2Fai-documents&lang=en",
      ),
    );

    expect(successResponse.headers.get("location")).toBe(
      "https://ai.careslink.com.au/ai-documents?lang=en",
    );
    const cancelledLocation = cancelledResponse.headers.get("location") ?? "";
    expect(cancelledLocation).toContain("/auth/login?");
    expect(cancelledLocation).toContain("Google+sign-in+was+not+completed");
    expect(cancelledLocation).toContain("next=%2Fai-documents");
    expect(cancelledLocation).not.toContain("private-provider-message");
    expect(cancelledLocation).not.toContain("access_denied");
  });

  it("keeps the password-reset callback restricted to update-password", async () => {
    const authClient = createAuthClient();
    supabaseServerMock.createCareslinkServerSupabaseClient.mockResolvedValue(
      authClient,
    );
    const { GET } = await import("./route");
    const response = await GET(
      new Request(
        "https://ai.careslink.com.au/auth/callback?code=reset-code" +
          "&next=%2Fadmin%2Fmaterial-usage",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://ai.careslink.com.au/auth/update-password",
    );
  });
});
