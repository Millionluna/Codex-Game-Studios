import { handleCommunicationNoteWorkspaceRequest } from "../../../../../lib/communication-note-workspace.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

export async function GET(request: Request) {
  return handleCommunicationNoteWorkspaceRequest(request);
}
