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
      "https://ai.careslink.com.au/template-companion/ndis-case-note?source=ndis-case-note-download&resourceSlug=ndis-case-note-template&lang=zh-Hans",
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
    expect(cancelledLocation.endsWith("#")).toBe(true);
    expect(new URL(cancelledLocation).hash).toBe("");
  });

  it("prevents a browser from inheriting a private OAuth error fragment", async () => {
    const { GET } = await import("./route");
    const callbackUrl =
      "https://ai.careslink.com.au/auth/callback?flow=oauth" +
      "&next=%2Fai-documents%3Flang%3Dzh-Hans&lang=zh-Hans" +
      "#error=access_denied&error_description=private-provider-message";
    const response = await GET(new Request(callbackUrl));
    const location = response.headers.get("location") ?? "";
    const finalUrl = followBrowserRedirect(callbackUrl, location);

    expect(location.endsWith("#")).toBe(true);
    expect(finalUrl.pathname).toBe("/auth/login");
    expect(finalUrl.searchParams.get("next")).toBe(
      "/ai-documents?lang=zh-Hans",
    );
    expect(finalUrl.searchParams.get("lang")).toBe("zh-Hans");
    expect(finalUrl.hash).toBe("");
    expect(finalUrl.href).not.toContain("access_denied");
    expect(finalUrl.href).not.toContain("private-provider-message");
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

function followBrowserRedirect(sourceHref: string, location: string) {
  const source = new URL(sourceHref);
  const destination = new URL(location, source);

  if (!location.includes("#") && source.hash) {
    destination.hash = source.hash;
  }

  return destination;
}
