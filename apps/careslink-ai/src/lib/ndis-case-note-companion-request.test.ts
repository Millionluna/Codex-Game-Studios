import { describe, expect, it } from "vitest";
import {
  NDIS_CASE_NOTE_COMPANION_SOURCE,
  NDIS_CASE_NOTE_RESOURCE_SLUG,
  NDIS_CASE_NOTE_UTM_CAMPAIGN,
  buildNdisCaseNoteCompanionAuthHref,
  buildNdisCaseNoteCompanionHref,
  createNdisCaseNoteIdempotentClaimToken,
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
      surface: undefined,
      utmMedium: undefined,
      utmCampaign: undefined,
      locale: "en",
    });
  });

  it("retains only the allowlisted Core attribution values", () => {
    const attribution = getNdisCaseNoteCompanionAttribution(
      `https://ai.careslink.com.au/template-companion/ndis-case-note?source=${NDIS_CASE_NOTE_COMPANION_SOURCE}&resourceSlug=${NDIS_CASE_NOTE_RESOURCE_SLUG}&utm_source=careslink&surface=core_download_success&utm_medium=post_download&utm_campaign=${NDIS_CASE_NOTE_UTM_CAMPAIGN}&lang=zh-Hans`,
    );

    expect(attribution).toMatchObject({
      source: NDIS_CASE_NOTE_COMPANION_SOURCE,
      resourceSlug: NDIS_CASE_NOTE_RESOURCE_SLUG,
      utmSource: "careslink",
      surface: "core_download_success",
      utmMedium: "post_download",
      utmCampaign: NDIS_CASE_NOTE_UTM_CAMPAIGN,
      locale: "zh-Hans",
    });
  });

  it.each([
    ["core_product_landing", "product_landing"],
    ["core_download_success", "post_download"],
  ])("accepts the allowlisted surface/medium pair %s", (surface, medium) => {
    const attribution = getNdisCaseNoteCompanionAttribution(
      `https://ai.careslink.com.au/template-companion/ndis-case-note?surface=${surface}&utm_medium=${medium}`,
    );

    expect(attribution).toMatchObject({ surface, utmMedium: medium });
  });

  it.each([
    ["core_product_landing", "post_download"],
    ["core_download_success", "product_landing"],
    ["participant-name", "product_landing"],
    ["core_product_landing", "free-text"],
  ])("drops an unknown or mismatched surface/medium pair", (surface, medium) => {
    const attribution = getNdisCaseNoteCompanionAttribution(
      `https://ai.careslink.com.au/template-companion/ndis-case-note?surface=${surface}&utm_medium=${medium}`,
    );

    expect(attribution.surface).toBeUndefined();
    expect(attribution.utmMedium).toBeUndefined();
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
        surface: "core_download_success",
        utmMedium: "post_download",
        utmCampaign: NDIS_CASE_NOTE_UTM_CAMPAIGN,
        locale: "en",
      },
      claimToken: "a".repeat(43),
      autoSave: true,
    });

    expect(href).toContain(`claimToken=${"a".repeat(43)}`);
    expect(href).toContain("surface=core_download_success");
    expect(href).not.toContain("observableFacts");
    expect(href).not.toContain("caseNoteDraft");
  });

  it("normalizes unsafe attribution objects before building a URL", () => {
    const href = buildNdisCaseNoteCompanionHref({
      attribution: {
        source: "participant-name",
        resourceSlug: "0412345678",
        utmSource: "private-contact",
        surface: "core_product_landing",
        utmMedium: "post_download",
        utmCampaign: "participant-facts",
        locale: "en",
      },
    });

    expect(href).toContain("source=ndis-case-note-download");
    expect(href).toContain("resourceSlug=ndis-case-note-template");
    expect(href).not.toContain("participant-name");
    expect(href).not.toContain("0412345678");
    expect(href).not.toContain("surface=");
    expect(href).not.toContain("utm_medium=");
  });

  it("derives a stable opaque claim token from the owner and credit reservation", () => {
    const input = {
      userId: "11111111-1111-4111-8111-111111111111",
      reservationId: "22222222-2222-4222-8222-222222222222",
    };
    const env = {
      NODE_ENV: "production",
      NDIS_CASE_NOTE_FINGERPRINT_PEPPER: "dedicated-test-pepper",
    };
    const token = createNdisCaseNoteIdempotentClaimToken(input, env);

    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(createNdisCaseNoteIdempotentClaimToken(input, env)).toBe(token);
    expect(
      createNdisCaseNoteIdempotentClaimToken(
        { ...input, userId: "33333333-3333-4333-8333-333333333333" },
        env,
      ),
    ).not.toBe(token);
  });

  it("builds a provider login handoff with only allowlisted attribution", () => {
    const href = buildNdisCaseNoteCompanionAuthHref("/auth/login", {
      source: NDIS_CASE_NOTE_COMPANION_SOURCE,
      resourceSlug: NDIS_CASE_NOTE_RESOURCE_SLUG,
      utmSource: "careslink",
      surface: "core_download_success",
      utmMedium: "post_download",
      utmCampaign: NDIS_CASE_NOTE_UTM_CAMPAIGN,
      locale: "zh-Hans",
    });
    const authUrl = new URL(href, "https://ai.careslink.com.au");
    const next = authUrl.searchParams.get("next");

    expect(authUrl.pathname).toBe("/auth/login");
    expect(authUrl.searchParams.get("returnTo")).toBe(next);
    expect(next).toContain("/template-companion/ndis-case-note?");
    expect(next).toContain("source=ndis-case-note-download");
    expect(next).toContain("resourceSlug=ndis-case-note-template");
    expect(next).toContain("utm_source=careslink");
    expect(next).toContain("surface=core_download_success");
    expect(next).toContain("lang=zh-Hans");
    expect(href).not.toContain("observableFacts");
    expect(href).not.toContain("caseNoteDraft");
    expect(href).not.toContain("claimToken");
  });
});
