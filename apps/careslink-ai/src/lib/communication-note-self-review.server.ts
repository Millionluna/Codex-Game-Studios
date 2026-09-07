import "server-only";
import {
  buildCommunicationNoteSelfReviewHref, parseCommunicationNoteSelfReviewRequest,
  parseCommunicationNoteSelfReviewResult, SELF_REVIEW_HTTP_STATUS, SELF_REVIEW_UUID,
  type CommunicationNoteSelfReviewRequest, type CommunicationNoteSelfReviewResult,
} from "./communication-note-self-review-contract";

/** Trusted server port, not a browser-supplied capability. An eventual durable
 * binding MUST atomically check the active provider Cookie session, owner,
 * Communication type, writable lifecycle and exact CURRENT revision before
 * recording all three confirmations. Replays must be idempotent, with those
 * authorization/current-revision checks repeated before returning a receipt.
 * No binding is installed by the formal route in this slice. */
export type CommunicationNoteSelfReviewWriter = (input: Readonly<{
  request: Request;
  canonicalId: string;
  mutationId: string;
  confirmation: CommunicationNoteSelfReviewRequest;
}>) => Promise<CommunicationNoteSelfReviewResult>;

export async function handleCommunicationNoteSelfReview(
  request: Request,
  canonicalId: string,
  binding?: Readonly<{
    write: CommunicationNoteSelfReviewWriter;
    /** Only an owned, guarded test fixture may explicitly opt into loopback. */
    localFixtureOrigin?: "http://127.0.0.1:3395";
  }>,
) {
  // Fail closed before auth, reads or writes. Never fall back to the memory
  // store, a service-role client, or DOCUMENT_DETAIL read permission.
  if (!binding) return reply({ status: "UNAVAILABLE" });
  try {
    const url = new URL(request.url);
    const loopbackFixture = url.origin === binding.localFixtureOrigin &&
      process.env.CARESLINK_LOCAL_BROWSER_FIXTURE === "SYNTHETIC_LOOPBACK_ONLY" &&
      /^\/private\/tmp\/cl-job-browser-[a-zA-Z0-9]{6}$/.test(process.cwd()) && !process.env.VERCEL;
    if (request.method !== "POST" || !SELF_REVIEW_UUID.test(canonicalId) ||
        url.pathname !== buildCommunicationNoteSelfReviewHref(canonicalId) || url.search ||
        (url.protocol !== "https:" && !loopbackFixture) ||
        request.headers.get("origin") !== url.origin ||
        request.headers.get("sec-fetch-site") !== "same-origin" ||
        !/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "")) {
      return reply({ status: "INVALID_REQUEST" });
    }
    if (request.headers.has("authorization")) return reply({ status: "AUTH_REQUIRED" });
    const mutationId = request.headers.get("idempotency-key") ?? "";
    if (!SELF_REVIEW_UUID.test(mutationId)) return reply({ status: "INVALID_REQUEST" });
    const confirmation = parseCommunicationNoteSelfReviewRequest(await readBoundedJson(request));
    if (!confirmation) return reply({ status: "INVALID_REQUEST" });
    if (request.signal.aborted) return reply({ status: "UNAVAILABLE" });
    const result = parseCommunicationNoteSelfReviewResult(await binding.write({
      request, canonicalId, mutationId, confirmation,
    }), { canonicalId, revisionId: confirmation.revisionId, mutationId });
    return reply(request.signal.aborted ? { status: "UNAVAILABLE" } : result ?? { status: "UNAVAILABLE" });
  } catch {
    return reply({ status: "UNAVAILABLE" });
  }
}

async function readBoundedJson(request: Request): Promise<unknown> {
  if (!request.body) return;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024 || request.signal.aborted) {
        await reader.cancel();
        return;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch { return; } finally { reader.releaseLock(); }
}

function reply(result: CommunicationNoteSelfReviewResult) {
  return Response.json(result, { status: SELF_REVIEW_HTTP_STATUS[result.status], headers: {
    "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie, Authorization",
    "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow",
  } });
}
