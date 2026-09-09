import { handleExportHistory } from "@/lib/communication-note-export-history.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ documentId: string }> }) {
  return handleExportHistory(request, (await context.params).documentId);
}
export async function POST(request: Request, context: { params: Promise<{ documentId: string }> }) {
  // Dedicated durable capability is not installed by this source-only slice.
  return handleExportHistory(request, (await context.params).documentId);
}
