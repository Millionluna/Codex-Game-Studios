import { handlePortalReferralCollection } from "@/lib/portal-referral-route.server";

export async function GET(request: Request) {
  return handlePortalReferralCollection(request);
}

export async function POST(request: Request) {
  return handlePortalReferralCollection(request);
}
