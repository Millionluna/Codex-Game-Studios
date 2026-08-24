import { handleCaresLinkV1ConfirmPrivacyReview } from "@/lib/v1/product-api-route.server";

export async function POST(request: Request) {
  return handleCaresLinkV1ConfirmPrivacyReview(request);
}
