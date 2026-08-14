import { handleCaresLinkV1SyncPushDisabledBoundary } from "@/lib/v1/product-api-route.server";

export function POST(request: Request) {
  return handleCaresLinkV1SyncPushDisabledBoundary(request);
}
