import { handlePortalReferralAssignmentCollection } from "@/lib/portal-referral-route.server";

export async function GET(request: Request) {
  return handlePortalReferralAssignmentCollection(request);
}
