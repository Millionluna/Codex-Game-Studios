import {
  handleCaresLinkV1CreateDocument,
  handleCaresLinkV1ListDocuments,
} from "@/lib/v1/product-api-route.server";

export async function GET(request: Request) {
  return handleCaresLinkV1ListDocuments(request);
}

export async function POST(request: Request) {
  return handleCaresLinkV1CreateDocument(request);
}
