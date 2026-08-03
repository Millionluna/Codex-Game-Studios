import { describe, expect, it } from "vitest";
import { isGoogleOAuthAvailable } from "./google-oauth";

describe("Google OAuth availability", () => {
  it("enables Google only through an explicit server-side release gate", () => {
    expect(
      isGoogleOAuthAvailable({ CARESLINK_GOOGLE_OAUTH_ENABLED: "true" }),
    ).toBe(true);
  });

  it("fails closed when the gate is absent or not exactly true", () => {
    expect(isGoogleOAuthAvailable({})).toBe(false);
    expect(
      isGoogleOAuthAvailable({ CARESLINK_GOOGLE_OAUTH_ENABLED: "false" }),
    ).toBe(false);
    expect(
      isGoogleOAuthAvailable({ CARESLINK_GOOGLE_OAUTH_ENABLED: "TRUE" }),
    ).toBe(false);
  });
});
