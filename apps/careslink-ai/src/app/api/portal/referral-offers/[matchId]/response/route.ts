import { handlePortalReferralResponse } from "@/lib/portal-referral-route.server";

type Context = { params: Promise<{ matchId: string }> };

export async function POST(request: Request, { params }: Context) {
  const { matchId } = await params;
  return handlePortalReferralResponse(request, matchId);
}
