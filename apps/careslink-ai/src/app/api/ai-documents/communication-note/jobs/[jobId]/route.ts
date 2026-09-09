import { handleCommunicationNoteGenerationJobRecoveryRequest } from "@/lib/communication-note-generation-job-recovery.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  return handleCommunicationNoteGenerationJobRecoveryRequest(request, jobId);
}
