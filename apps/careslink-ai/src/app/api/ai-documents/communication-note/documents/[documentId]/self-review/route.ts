import { handleCommunicationNoteSelfReview } from "@/lib/communication-note-self-review.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ documentId: string }> }) {
  // No durable writer is installed. A UI read gate must never enable writes.
  return handleCommunicationNoteSelfReview(request, (await context.params).documentId);
}
