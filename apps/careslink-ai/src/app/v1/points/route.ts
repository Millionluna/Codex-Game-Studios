import { handleCaresLinkV1GetPoints } from "@/lib/v1/product-api-route.server";

export async function GET(request: Request) {
  return handleCaresLinkV1GetPoints(request);
}
