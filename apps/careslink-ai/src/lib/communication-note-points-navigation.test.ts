import { describe, expect, it } from "vitest";
import { buildCommunicationNotePointsHref, resolveCommunicationNotePointsLocale } from "./communication-note-points-navigation";
import { getSafeAuthRedirectHref, getSafePendingAuthNextHref } from "./referral-workspace-auth-actions";
import { withLocale } from "./referral-workspace-i18n";

describe("workspace Points navigation context", () => {
  it.each(["en", "zh-Hans", "zh-Hant"] as const)("round-trips only the locale %s, including pending login", locale => {
    const href = buildCommunicationNotePointsHref(locale);
    const url = new URL(href, "https://local.invalid");
    expect(url.pathname).toBe("/plan-and-usage");
    expect([...url.searchParams.keys()]).toEqual(["lang", "communicationLang"]);
    expect(url.searchParams.get("lang")).toBe(locale === "zh-Hant" ? "en" : locale);
    expect(resolveCommunicationNotePointsLocale(url.searchParams.get("communicationLang")!)).toBe(locale);
    expect(getSafePendingAuthNextHref(href)).toBe(href);
    expect(getSafeAuthRedirectHref(href, "en")).toBe(href);
    expect(new URL(withLocale(href, "zh-Hans"), url).searchParams.get("communicationLang")).toBe(locale);
  });
  it.each([undefined, "", "private-owner", "EN", " en", "https://outside.invalid", "/ai-documents", ["en"], ["en", "zh-Hant"]])(
    "rejects invalid or duplicate context %#", value => {
      expect(resolveCommunicationNotePointsLocale(value)).toBeUndefined();
    },
  );
});
