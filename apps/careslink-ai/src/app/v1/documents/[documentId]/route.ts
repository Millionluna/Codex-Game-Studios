import {
  handleCaresLinkV1AppendRevision,
  handleCaresLinkV1GetDocument,
  handleCaresLinkV1TombstoneDocument,
} from "@/lib/v1/product-api-route.server";

type DocumentRouteContext = {
  params: Promise<{ documentId: string }>;
};

export async function GET(request: Request, context: DocumentRouteContext) {
  const { documentId } = await context.params;
  return handleCaresLinkV1GetDocument(request, documentId);
}

export async function PATCH(request: Request, context: DocumentRouteContext) {
  const { documentId } = await context.params;
  return handleCaresLinkV1AppendRevision(request, documentId);
}

export async function DELETE(request: Request, context: DocumentRouteContext) {
  const { documentId } = await context.params;
  return handleCaresLinkV1TombstoneDocument(request, documentId);
}
