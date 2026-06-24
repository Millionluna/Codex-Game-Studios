export const BLOCKED_REFERRAL_PROFILE_CLAIMS = [
  "certified",
  "approved provider",
  "verified provider quality",
  "quality checked",
  "compliant provider",
  "guaranteed referral",
  "guaranteed service",
  "recommended provider",
  "clinically suitable",
  "best provider",
  "meets requirements",
  "ensures compliance",
] as const;

const blockedClaimPatterns: ReadonlyArray<{
  label: (typeof BLOCKED_REFERRAL_PROFILE_CLAIMS)[number];
  phrases: readonly string[];
}> = [
  { label: "certified", phrases: ["certified"] },
  { label: "approved provider", phrases: ["approved provider", "approved care provider"] },
  {
    label: "verified provider quality",
    phrases: ["verified provider quality", "provider quality verified"],
  },
  { label: "quality checked", phrases: ["quality checked"] },
  { label: "compliant provider", phrases: ["compliant provider"] },
  { label: "guaranteed referral", phrases: ["guaranteed referral"] },
  { label: "guaranteed service", phrases: ["guaranteed service"] },
  { label: "recommended provider", phrases: ["recommended provider"] },
  { label: "clinically suitable", phrases: ["clinically suitable"] },
  { label: "best provider", phrases: ["best provider"] },
  { label: "meets requirements", phrases: ["meets requirements", "meets all requirements"] },
  { label: "ensures compliance", phrases: ["ensures compliance", "ensure compliance"] },
];

export const REQUIRED_REFERRAL_PROFILE_BOUNDARY =
  "Referral profile information is based on self-submitted information. CaresLink does not assess provider quality, clinical suitability, compliance status, or service outcomes, and this is not legal, clinical, medical, compliance, financial, or professional advice.";

function normalizeReferralProfileCopy(copy: string): string {
  return copy
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function includesNormalizedPhrase(copy: string, phrase: string): boolean {
  return ` ${copy} `.includes(` ${normalizeReferralProfileCopy(phrase)} `);
}

export function getUnsafeClaimReason(copy: string): string | null {
  const normalizedCopy = normalizeReferralProfileCopy(copy);

  for (const pattern of blockedClaimPatterns) {
    const matchedPhrase = pattern.phrases.find((phrase) =>
      includesNormalizedPhrase(normalizedCopy, phrase),
    );

    if (matchedPhrase) {
      return `Referral profile copy must not make unsafe claims such as "${matchedPhrase}".`;
    }
  }

  return null;
}

export function isSafeReferralProfileCopy(copy: string): boolean {
  return getUnsafeClaimReason(copy) === null;
}
