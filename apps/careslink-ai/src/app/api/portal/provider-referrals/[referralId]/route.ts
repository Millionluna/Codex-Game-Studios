import { handlePortalReferralProviderFollowUpDetail } from "@/lib/portal-referral-route.server";

type PortalReferralProviderDetailRouteContext = Readonly<{
  params: Promise<Readonly<{ referralId: string }>>;
}>;

export async function GET(
  request: Request,
  { params }: PortalReferralProviderDetailRouteContext,
) {
  const { referralId } = await params;
  return handlePortalReferralProviderFollowUpDetail(request, referralId);
}
