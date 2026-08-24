import { handlePortalReferralFollowUp } from "@/lib/portal-referral-route.server";

type Context = { params: Promise<{ referralId: string }> };

export async function POST(request: Request, { params }: Context) {
  const { referralId } = await params;
  return handlePortalReferralFollowUp(request, referralId);
}
