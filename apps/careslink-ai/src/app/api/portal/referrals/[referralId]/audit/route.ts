import { handlePortalReferralAudit } from "@/lib/portal-referral-route.server";

type Context = { params: Promise<{ referralId: string }> };

export async function GET(request: Request, { params }: Context) {
  const { referralId } = await params;
  return handlePortalReferralAudit(request, referralId);
}
