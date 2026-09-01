import { handleCommunicationNoteGenerationRequest } from "@/lib/communication-note-generation-route.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleCommunicationNoteGenerationRequest(request);
}
