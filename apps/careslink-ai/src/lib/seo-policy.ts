export const CARESLINK_AI_NOINDEX_ROBOTS = {
  index: false,
  follow: false,
} as const;

export const CARESLINK_AI_PROTECTED_ROUTE_FAMILIES = [
  "/auth/",
  "/admin/",
  "/ai-documents",
  "/template-companion/",
  "/referral-workspace/",
  "/plan-and-usage",
  "/provider-profile-generator/preview/",
  "/providers/",
  "/referrals/",
] as const;
