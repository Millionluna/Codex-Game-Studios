const blockedClaims = [
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

export const REQUIRED_REFERRAL_PROFILE_BOUNDARY =
  "Referral profile information is based on self-submitted information. CaresLink does not assess provider quality, clinical suitability, compliance status, or service outcomes, and this is not legal, clinical, medical, compliance, financial, or professional advice.";

export function getUnsafeClaimReason(copy: string): string | null {
  const normalizedCopy = copy.toLowerCase();
  const matchedTerm = blockedClaims.find((claim) => normalizedCopy.includes(claim));

  if (!matchedTerm) {
    return null;
  }

  return `Referral profile copy must not make unsafe claims such as "${matchedTerm}".`;
}

export function isSafeReferralProfileCopy(copy: string): boolean {
  return getUnsafeClaimReason(copy) === null;
}
