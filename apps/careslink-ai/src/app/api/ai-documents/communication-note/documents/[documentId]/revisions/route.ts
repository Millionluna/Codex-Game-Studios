import { handleCommunicationNoteEdit } from "@/lib/communication-note-edit.server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ documentId: string }> }) {
  return handleCommunicationNoteEdit(request, (await context.params).documentId);
}
