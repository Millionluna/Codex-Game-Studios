import type {
  EntityType,
  ReferralDirection,
  ReferralProfile,
} from "./referral-profile-workspace";
import {
  PROVIDER_GENERATOR_SOURCE,
  withAuthHandoffParams,
} from "./referral-workspace-handoff";
import type { Locale } from "./referral-workspace-i18n";

export type PublicProviderProfileDraft = {
  id: string;
  profile: {
    name: string;
    entityType: EntityType;
    referralDirection: ReferralDirection;
    serviceAreas: string[];
    languages: string[];
    intakeMethod: string;
    responseTime: string;
    capacityStatus: string;
    bestFit: string[];
    handoverRequirements: string[];
    summary: string;
  };
  shareCard: {
    title: string;
    channel: string;
    summary: string;
    cta: string;
  };
  boundary: string;
};

type PublicProviderDraftPayload = {
  version?: unknown;
  id?: unknown;
  businessName?: unknown;
  serviceCategories?: unknown;
  referralServices?: unknown;
  serviceAreas?: unknown;
  languages?: unknown;
  supportsNdis?: unknown;
  supportsAgedCare?: unknown;
  acceptingNewClients?: unknown;
  urgentReferralAvailable?: unknown;
  shortDescription?: unknown;
  targetClients?: unknown;
  publicContactMethods?: unknown;
  sourceChannel?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export const publicProviderDraftPayloadSamples: Record<string, string> = {
  "riverside-care-navigation": JSON.stringify({
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
  }),
};

const publicProviderDrafts: Record<string, PublicProviderProfileDraft> = {
  "riverside-care-navigation": {
    id: "riverside-care-navigation",
    profile: {
      name: "Riverside Care Navigation",
      entityType: "organisation",
      referralDirection: "receive",
      serviceAreas: ["Brisbane South", "Logan"],
      languages: ["English", "Mandarin"],
      intakeMethod: "Provider listed public contact methods: Phone, Email",
      responseTime:
        "Urgent referral discussions may be available; confirm before sharing client details",
      capacityStatus: "Provider marked that they are accepting new clients",
      bestFit: [
        "Older people, NDIS participants, and family decision makers",
        "Aged care navigation",
        "NDIS support coordination",
      ],
      handoverRequirements: [
        "Confirm consent before sharing contact details",
        "Confirm service availability and location fit directly with the provider",
      ],
      summary:
        "Bilingual care navigation provider helping families understand aged care and NDIS referral pathways.",
    },
    shareCard: {
      title: "Riverside Care Navigation",
      channel: "Provider profile generator handoff",
      summary:
        "A provider-submitted profile draft covering Brisbane South and Logan, English and Mandarin support, and referral discussion prompts.",
      cta: "Continue this draft in CaresLink AI",
    },
    boundary:
      "Self-submitted provider information imported from public CaresLink. Not a CaresLink endorsement, certification, quality assessment, clinical assessment, compliance assessment, or referral outcome guarantee.",
  },
  "sample-harbour": {
    id: "sample-harbour",
    profile: {
      name: "Harbour Community Support",
      entityType: "organisation",
      referralDirection: "both",
      serviceAreas: ["Inner West Sydney", "Canterbury-Bankstown"],
      languages: ["English", "Mandarin", "Cantonese"],
      intakeMethod: "Phone warm handover and secure web form",
      responseTime: "Usually within the week",
      capacityStatus: "Limited weekday intake places available",
      bestFit: ["Older adults who need community navigation"],
      handoverRequirements: [
        "Client goals and preferred contact time",
        "Consent confirmation before introduction",
      ],
      summary:
        "Neighbourhood aged care navigation and social support for older adults, with clear intake details for referral partners.",
    },
    shareCard: {
      title: "Harbour Community Support",
      channel: "Provider profile preview",
      summary:
        "A structured provider profile draft covering service area, languages, intake pathway, current capacity, and referral handover notes.",
      cta: "Save this draft to continue in CaresLink AI",
    },
    boundary:
      "Self-submitted provider information. Not a CaresLink endorsement, certification, quality assessment, clinical assessment, compliance assessment, or referral outcome guarantee.",
  },
};

export function getPublicProviderDraft(
  draftId: string,
  draftPayload?: string,
): PublicProviderProfileDraft {
  const payloadDraft = parsePublicProviderDraftPayload(draftId, draftPayload);

  if (payloadDraft) {
    return payloadDraft;
  }

  return publicProviderDrafts[draftId] ?? publicProviderDrafts["sample-harbour"];
}

export function getPublicProviderDraftPayload(
  draftId: string,
  draftPayload?: string,
): string {
  return draftPayload ?? buildPublicProviderDraftPayload(getPublicProviderDraft(draftId));
}

export function getCanonicalPublicProviderDraftPayload(
  draftId: string,
  draftPayload?: string,
): string {
  const canonicalPayload = parseCanonicalPublicProviderDraftPayload(
    draftId,
    draftPayload,
  );

  if (canonicalPayload) {
    return canonicalPayload;
  }

  return buildPublicProviderDraftPayload({
    ...getPublicProviderDraft(draftId, draftPayload),
    id: draftId,
  });
}

export function getPublicProviderDraftPreviewHref(
  draftId: string,
  locale: Locale,
  draftPayload?: string,
): string {
  const queryParams = new URLSearchParams({ lang: locale });

  if (draftPayload) {
    queryParams.set("draftPayload", draftPayload);
  }

  return `/provider-profile-generator/preview/${encodeURIComponent(
    draftId,
  )}?${queryParams.toString()}`;
}

export function getPublicProviderDraftProfile(
  draftId: string,
  ownerUserId: string,
  draftPayload?: string,
): ReferralProfile {
  const draft = getPublicProviderDraft(draftId, draftPayload);

  return mapPublicProviderDraftToProfile(draft, ownerUserId);
}

export function mapPublicProviderDraftToProfile(
  draft: PublicProviderProfileDraft,
  ownerUserId: string,
): ReferralProfile {
  const receive =
    draft.profile.referralDirection === "receive" ||
    draft.profile.referralDirection === "both"
      ? {
          intakeMethod: draft.profile.intakeMethod,
          responseTime: draft.profile.responseTime,
          capacityStatus: draft.profile.capacityStatus,
        }
      : undefined;
  const send =
    draft.profile.referralDirection === "send" ||
    draft.profile.referralDirection === "both"
      ? {
          handoverRequirements: [...draft.profile.handoverRequirements],
          followUpCadence: "To be defined after workspace review",
          consentReminder: "Confirm consent before sharing contact details",
        }
      : undefined;

  return {
    id: `public-draft-${draft.id}`,
    ownerUserId,
    name: draft.profile.name,
    entityType: draft.profile.entityType,
    referralDirection: draft.profile.referralDirection,
    submittedBy: "self",
    summary: draft.profile.summary,
    serviceAreas: [...draft.profile.serviceAreas],
    languages: [...draft.profile.languages],
    bestFit: [...draft.profile.bestFit],
    receive,
    send,
    updatedAt: "Draft preview",
  };
}

export function parsePublicProviderDraftPayload(
  fallbackDraftId: string,
  draftPayload?: string,
): PublicProviderProfileDraft | undefined {
  if (!draftPayload) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(draftPayload) as PublicProviderDraftPayload;
    const businessName = cleanPayloadString(parsed.businessName, 120);
    const shortDescription = cleanPayloadString(parsed.shortDescription, 700);

    if (!businessName || !shortDescription) {
      return undefined;
    }

    const id = cleanPayloadString(parsed.id, 80) || fallbackDraftId;
    const serviceCategories = cleanPayloadStringArray(
      parsed.serviceCategories,
      12,
      80,
    );
    const serviceAreas = cleanPayloadStringArray(parsed.serviceAreas, 16, 100);
    const languages = cleanPayloadStringArray(parsed.languages, 12, 60);
    const targetClients = cleanPayloadString(parsed.targetClients, 300);
    const publicContactMethods = cleanPayloadStringArray(
      parsed.publicContactMethods,
      6,
      60,
    );
    const acceptingNewClients = parsed.acceptingNewClients === true;
    const urgentReferralAvailable = parsed.urgentReferralAvailable === true;
    const supportsNdis = parsed.supportsNdis === true;
    const supportsAgedCare = parsed.supportsAgedCare === true;
    const programTags = [
      supportsNdis ? "NDIS" : undefined,
      supportsAgedCare ? "aged care / Support at Home" : undefined,
    ].filter((value): value is string => Boolean(value));
    const bestFit = [
      targetClients,
      ...serviceCategories.slice(0, 4),
      ...programTags,
    ].filter(Boolean);

    return {
      id,
      profile: {
        name: businessName,
        entityType: "organisation",
        referralDirection: "receive",
        serviceAreas,
        languages,
        intakeMethod:
          publicContactMethods.length > 0
            ? `Provider listed public contact methods: ${publicContactMethods.join(", ")}`
            : "Contact path to be confirmed with the provider",
        responseTime: urgentReferralAvailable
          ? "Urgent referral discussions may be available; confirm before sharing client details"
          : "Response time to be confirmed with the provider",
        capacityStatus: acceptingNewClients
          ? "Provider marked that they are accepting new clients"
          : "New client capacity to be confirmed with the provider",
        bestFit,
        handoverRequirements: [
          "Confirm consent before sharing contact details",
          "Confirm service availability and location fit directly with the provider",
        ],
        summary: shortDescription,
      },
      shareCard: {
        title: businessName,
        channel: "Provider profile generator handoff",
        summary:
          "A provider-submitted profile draft imported from public CaresLink, covering services, areas, languages, and referral discussion prompts.",
        cta: "Continue this draft in CaresLink AI",
      },
      boundary:
        "Self-submitted provider information imported from public CaresLink. Not a CaresLink endorsement, certification, quality assessment, clinical assessment, compliance assessment, or referral outcome guarantee.",
    };
  } catch {
    return undefined;
  }
}

function parseCanonicalPublicProviderDraftPayload(
  draftId: string,
  draftPayload?: string,
): string | undefined {
  if (!draftPayload) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(draftPayload) as PublicProviderDraftPayload;
    const businessName = cleanPayloadString(parsed.businessName, 120);
    const shortDescription = cleanPayloadString(parsed.shortDescription, 700);

    if (!businessName || !shortDescription) {
      return undefined;
    }

    return JSON.stringify({
      version: 1,
      id: draftId,
      businessName,
      serviceCategories: cleanPayloadStringArray(
        parsed.serviceCategories,
        12,
        80,
      ),
      referralServices: cleanPayloadStringArray(
        parsed.referralServices,
        24,
        80,
      ),
      serviceAreas: cleanPayloadStringArray(parsed.serviceAreas, 16, 100),
      languages: cleanPayloadStringArray(parsed.languages, 12, 60),
      supportsNdis: parsed.supportsNdis === true,
      supportsAgedCare: parsed.supportsAgedCare === true,
      acceptingNewClients: parsed.acceptingNewClients === true,
      urgentReferralAvailable: parsed.urgentReferralAvailable === true,
      shortDescription,
      targetClients: cleanPayloadString(parsed.targetClients, 300),
      publicContactMethods: cleanPayloadStringArray(
        parsed.publicContactMethods,
        6,
        60,
      ),
      sourceChannel: cleanPayloadString(parsed.sourceChannel, 80),
      createdAt: cleanPayloadString(parsed.createdAt, 80),
      updatedAt: cleanPayloadString(parsed.updatedAt, 80),
    });
  } catch {
    return undefined;
  }
}

function cleanPayloadString(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

function cleanPayloadStringArray(
  value: unknown,
  maxItems: number,
  maxLength: number,
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => cleanPayloadString(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function getSaveDraftHref(
  draftId: string,
  locale: Locale,
  draftPayload?: string,
): string {
  const nextQueryParams = new URLSearchParams({
    source: PROVIDER_GENERATOR_SOURCE,
    draftId,
  });

  if (draftPayload) {
    nextQueryParams.set("draftPayload", draftPayload);
  }

  const href = withAuthHandoffParams("/auth/register", {
    source: PROVIDER_GENERATOR_SOURCE,
    draftId,
    draftPayload,
    next: `/referral-workspace/profile?${nextQueryParams.toString()}`,
  });
  const [pathname, query = ""] = href.split("?", 2);
  const queryParams = new URLSearchParams(query);

  queryParams.set("lang", locale);

  return `${pathname}?${queryParams.toString()}`;
}

function buildPublicProviderDraftPayload(
  draft: PublicProviderProfileDraft,
): string {
  const publicContactMethods = getPublicContactMethodsFromDraft(draft);

  return JSON.stringify({
    version: 1,
    id: draft.id,
    businessName: draft.profile.name,
    serviceCategories: draft.profile.bestFit,
    referralServices: [],
    serviceAreas: draft.profile.serviceAreas,
    languages: draft.profile.languages,
    supportsNdis: false,
    supportsAgedCare: true,
    acceptingNewClients: draft.profile.capacityStatus
      .toLowerCase()
      .includes("available"),
    urgentReferralAvailable: false,
    shortDescription: draft.profile.summary,
    targetClients: draft.profile.bestFit.join(", "),
    publicContactMethods,
    sourceChannel: "careslink-ai-sample-generator",
    createdAt: "Draft preview",
    updatedAt: "Draft preview",
  });
}

function getPublicContactMethodsFromDraft(
  draft: PublicProviderProfileDraft,
): string[] {
  const prefix = "Provider listed public contact methods: ";

  if (!draft.profile.intakeMethod.startsWith(prefix)) {
    return ["Phone", "Website"];
  }

  return draft.profile.intakeMethod
    .slice(prefix.length)
    .split(",")
    .map((method) => method.trim())
    .filter(Boolean);
}
