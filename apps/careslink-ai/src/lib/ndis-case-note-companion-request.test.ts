import { describe, expect, it } from "vitest";
import {
  NDIS_CASE_NOTE_COMPANION_SOURCE,
  NDIS_CASE_NOTE_RESOURCE_SLUG,
  NDIS_CASE_NOTE_UTM_CAMPAIGN,
  buildNdisCaseNoteCompanionHref,
  getNdisCaseNoteCompanionAttribution,
  getNdisCaseNoteRequestIdentity,
} from "./ndis-case-note-companion-request";

describe("NDIS case note request metadata", () => {
  it("forces the exact source/resource contract and drops unknown UTM values", () => {
    const attribution = getNdisCaseNoteCompanionAttribution(
      "https://ai.careslink.com.au/template-companion/ndis-case-note?source=participant-jane&resourceSlug=0412345678&utm_source=private-name&utm_medium=notes&utm_campaign=participant-facts",
    );

    expect(attribution).toEqual({
      source: NDIS_CASE_NOTE_COMPANION_SOURCE,
      resourceSlug: NDIS_CASE_NOTE_RESOURCE_SLUG,
      utmSource: undefined,
      utmMedium: undefined,
      utmCampaign: undefined,
      locale: "en",
    });
  });

  it("retains only the allowlisted Core attribution values", () => {
    const attribution = getNdisCaseNoteCompanionAttribution(
      `https://ai.careslink.com.au/template-companion/ndis-case-note?source=${NDIS_CASE_NOTE_COMPANION_SOURCE}&resourceSlug=${NDIS_CASE_NOTE_RESOURCE_SLUG}&utm_source=careslink&utm_medium=post_download&utm_campaign=${NDIS_CASE_NOTE_UTM_CAMPAIGN}&lang=zh-Hans`,
    );

    expect(attribution).toMatchObject({
      source: NDIS_CASE_NOTE_COMPANION_SOURCE,
      resourceSlug: NDIS_CASE_NOTE_RESOURCE_SLUG,
      utmSource: "careslink",
      utmMedium: "post_download",
      utmCampaign: NDIS_CASE_NOTE_UTM_CAMPAIGN,
      locale: "zh-Hans",
    });
  });

  it("requires a dedicated fingerprint pepper in production", () => {
    const request = new Request("https://ai.careslink.com.au", {
      headers: { "x-forwarded-for": "203.0.113.8" },
    });

    expect(() =>
      getNdisCaseNoteRequestIdentity(request, {
        NODE_ENV: "production",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-is-not-the-pepper",
      }),
    ).toThrow("NDIS_CASE_NOTE_FINGERPRINT_PEPPER");

    expect(
      getNdisCaseNoteRequestIdentity(request, {
        NODE_ENV: "production",
        NDIS_CASE_NOTE_FINGERPRINT_PEPPER: "dedicated-test-pepper",
      }).ipHash,
    ).toMatch(/^[a-f0-9]{64}$/);
  });

  it("puts only safe attribution and the opaque claim token in a return URL", () => {
    const href = buildNdisCaseNoteCompanionHref({
      attribution: {
        source: NDIS_CASE_NOTE_COMPANION_SOURCE,
        resourceSlug: NDIS_CASE_NOTE_RESOURCE_SLUG,
        utmSource: "careslink",
        utmMedium: "post_download",
        utmCampaign: NDIS_CASE_NOTE_UTM_CAMPAIGN,
        locale: "en",
      },
      claimToken: "a".repeat(43),
      autoSave: true,
    });

    expect(href).toContain(`claimToken=${"a".repeat(43)}`);
    expect(href).not.toContain("observableFacts");
    expect(href).not.toContain("caseNoteDraft");
  });
});
