import { handleCommunicationNoteDocumentRead } from "@/lib/communication-note-document.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await context.params;
  return handleCommunicationNoteDocumentRead(request, documentId);
}
