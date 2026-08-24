import { handleCaresLinkV1SaveCheckpoint } from "@/lib/v1/product-api-route.server";

type CheckpointRouteContext = {
  params: Promise<{ documentId: string }>;
};

export async function PUT(request: Request, context: CheckpointRouteContext) {
  const { documentId } = await context.params;
  return handleCaresLinkV1SaveCheckpoint(request, documentId);
}
