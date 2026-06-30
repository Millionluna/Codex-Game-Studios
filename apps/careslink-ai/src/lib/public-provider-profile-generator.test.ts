import { describe, expect, it } from "vitest";
import {
  getCanonicalPublicProviderDraftPayload,
  getPublicProviderDraftProfile,
  getPublicProviderDraft,
  getSaveDraftHref,
  parsePublicProviderDraftPayload,
} from "./public-provider-profile-generator";

describe("public provider profile generator", () => {
  const riversideDraftPayload = JSON.stringify({
    version: 1,
    id: "riverside-care-navigation",
    businessName: "Riverside Care Navigation",
    serviceCategories: ["Aged care navigation", "NDIS support coordination"],
    referralServices: ["SERV-0007"],
    serviceAreas: ["Brisbane South", "Logan"],
    languages: ["English", "Mandarin"],
    supportsNdis: true,
    supportsAgedCare: true,
    acceptingNewClients: true,
    urgentReferralAvailable: true,
    shortDescription:
      "Bilingual care navigation provider helping families understand aged care and NDIS referral pathways.",
    targetClients: "Older people, NDIS participants, and family decision makers",
    publicContactMethods: ["Phone", "Email"],
    sourceChannel: "public-generator",
    createdAt: "2026-06-25T00:00:00.000Z",
    updatedAt: "2026-06-25T00:00:00.000Z",
  });

  it("returns a deterministic self-submitted draft without endorsement claims", () => {
    const draft = getPublicProviderDraft("sample-harbour");
    const combinedCopy = [
      draft.profile.name,
      draft.profile.summary,
      draft.shareCard.title,
      draft.shareCard.summary,
      draft.boundary,
    ].join(" ");

    expect(draft.id).toBe("sample-harbour");
    expect(draft.profile.name).toBe("Harbour Community Support");
    expect(draft.profile.referralDirection).toBe("both");
    expect(draft.shareCard.cta).toContain("Save this draft");
    expect(combinedCopy.toLowerCase()).not.toContain("certified");
    expect(combinedCopy.toLowerCase()).not.toContain("recommended provider");
  });

  it("builds a repository-backed register link without serializing draft JSON", () => {
    const href = getSaveDraftHref("sample-harbour", "zh-Hans");
    const query = new URLSearchParams(href.split("?")[1]);
    const nextQuery = new URLSearchParams(
      (query.get("next") ?? "").split("?")[1],
    );

    expect(query.get("source")).toBe("provider-profile-generator");
    expect(query.get("draftId")).toBe("sample-harbour");
    expect(query.get("draftPayload")).toBeNull();
    expect(query.get("lang")).toBe("zh-Hans");
    expect(nextQuery.get("draftId")).toBe("sample-harbour");
    expect(nextQuery.get("draftPayload")).toBeNull();
  });

  it("builds a register link that preserves a real generator payload", () => {
    const href = getSaveDraftHref(
      "riverside-care-navigation",
      "zh-Hans",
      riversideDraftPayload,
    );
    const query = new URLSearchParams(href.split("?")[1]);
    const nextQuery = new URLSearchParams(
      (query.get("next") ?? "").split("?")[1],
    );

    expect(query.get("draftId")).toBe("riverside-care-navigation");
    expect(query.get("draftPayload")).toBe(riversideDraftPayload);
    expect(nextQuery.get("draftId")).toBe("riverside-care-navigation");
    expect(nextQuery.get("draftPayload")).toBe(riversideDraftPayload);
  });

  it("canonicalizes public draft payloads before persistence", () => {
    const unsafePayload = JSON.stringify({
      version: 1,
      id: "bright-path",
      businessName: "Bright Path Community Support",
      contactPerson: "Private Person",
      email: "private@example.com",
      phone: "0400 000 000",
      approved: true,
      verified: true,
      compliant: true,
      certified: true,
      guaranteed: true,
      serviceCategories: ["Personal care"],
      referralServices: ["SERV-0002"],
      serviceAreas: ["Sydney"],
      languages: ["English"],
      supportsNdis: true,
      supportsAgedCare: false,
      acceptingNewClients: true,
      urgentReferralAvailable: true,
      shortDescription: "Provider-submitted public profile draft.",
      targetClients: "Older people and families",
      publicContactMethods: ["Phone"],
      sourceChannel: "website",
      createdAt: "2026-06-25T00:00:00.000Z",
      updatedAt: "2026-06-25T00:00:00.000Z",
    });

    const canonical = JSON.parse(
      getCanonicalPublicProviderDraftPayload("url-draft-id", unsafePayload),
    );

    expect(Object.keys(canonical).sort()).toEqual(
      [
        "acceptingNewClients",
        "businessName",
        "createdAt",
        "id",
        "languages",
        "publicContactMethods",
        "referralServices",
        "serviceAreas",
        "serviceCategories",
        "shortDescription",
        "sourceChannel",
        "supportsAgedCare",
        "supportsNdis",
        "targetClients",
        "updatedAt",
        "urgentReferralAvailable",
        "version",
      ].sort(),
    );
    expect(canonical.id).toBe("url-draft-id");
    expect(canonical.businessName).toBe("Bright Path Community Support");
    expect(canonical.shortDescription).toBe(
      "Provider-submitted public profile draft.",
    );
    expect(canonical.serviceCategories).toEqual(["Personal care"]);
    expect(canonical.referralServices).toEqual(["SERV-0002"]);
    expect(canonical.serviceAreas).toEqual(["Sydney"]);
    expect(canonical.languages).toEqual(["English"]);
    expect(canonical.supportsNdis).toBe(true);
    expect(canonical.supportsAgedCare).toBe(false);
    expect(canonical.acceptingNewClients).toBe(true);
    expect(canonical.urgentReferralAvailable).toBe(true);
    expect(canonical.targetClients).toBe("Older people and families");
    expect(canonical.publicContactMethods).toEqual(["Phone"]);
    expect(canonical.sourceChannel).toBe("website");
    expect(canonical.createdAt).toBe("2026-06-25T00:00:00.000Z");
    expect(canonical.updatedAt).toBe("2026-06-25T00:00:00.000Z");
    expect(canonical.email).toBeUndefined();
    expect(canonical.contactPerson).toBeUndefined();
    expect(canonical.phone).toBeUndefined();
    expect(canonical.approved).toBeUndefined();
    expect(canonical.verified).toBeUndefined();
    expect(canonical.compliant).toBeUndefined();
    expect(canonical.certified).toBeUndefined();
    expect(canonical.guaranteed).toBeUndefined();
  });

  it("maps a public draft into a workspace referral profile preview", () => {
    const profile = getPublicProviderDraftProfile("sample-harbour", "user-free");

    expect(profile.id).toBe("public-draft-sample-harbour");
    expect(profile.ownerUserId).toBe("user-free");
    expect(profile.name).toBe("Harbour Community Support");
    expect(profile.referralDirection).toBe("both");
    expect(profile.summary).toContain("clear intake details");
    expect(profile.receive?.intakeMethod).toBe(
      "Phone warm handover and secure web form",
    );
    expect(profile.send?.handoverRequirements).toContain(
      "Consent confirmation before introduction",
    );
  });

  it("maps a real public generator payload into a workspace profile", () => {
    const draftPayload = JSON.stringify({
      version: 1,
      id: "bright-path",
      businessName: "Bright Path Community Support",
      serviceCategories: ["Transport", "Interpreting"],
      referralServices: ["SERV-0016"],
      serviceAreas: ["Sydney", "Parramatta"],
      languages: ["English", "Mandarin"],
      supportsNdis: true,
      supportsAgedCare: true,
      acceptingNewClients: true,
      urgentReferralAvailable: false,
      shortDescription:
        "Community support provider helping families with transport and interpreting.",
      targetClients: "Older people and NDIS participants",
      publicContactMethods: ["Phone", "Website"],
      sourceChannel: "public-generator",
      createdAt: "2026-06-25T00:00:00.000Z",
      updatedAt: "2026-06-25T00:00:00.000Z",
    });
    const draft = parsePublicProviderDraftPayload("fallback-id", draftPayload);
    const profile = getPublicProviderDraftProfile(
      "fallback-id",
      "user-free",
      draftPayload,
    );

    expect(draft?.id).toBe("bright-path");
    expect(profile.id).toBe("public-draft-bright-path");
    expect(profile.name).toBe("Bright Path Community Support");
    expect(profile.referralDirection).toBe("receive");
    expect(profile.serviceAreas).toEqual(["Sydney", "Parramatta"]);
    expect(profile.languages).toEqual(["English", "Mandarin"]);
    expect(profile.bestFit).toContain("Older people and NDIS participants");
    expect(profile.receive?.intakeMethod).toContain("Phone");
    expect(profile.receive?.capacityStatus).toContain("accepting new clients");
  });
});
