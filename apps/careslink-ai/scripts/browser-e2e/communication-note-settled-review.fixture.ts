/** TEST ONLY. Exact newly settled draft → existing durable review/history.
 * No edit route, terminal authority, credentials, or process-memory fallback. */
import "server-only";
import { assertAdmissionFixture } from "./communication-note-admission.fixture";
import { readSettlementResultBinding } from "./communication-note-settlement.fixture";
import { readReviewDatabaseDocument, confirmReviewDatabaseDocument, handleDatabaseExportHistory } from "./communication-note-self-review.fixture";

export async function handleSettledReview(request: Request, documentId: string) {
  const root=assertAdmissionFixture();
  if(process.env.CARESLINK_LOCAL_SETTLEMENT_DATABASE!=="OWNED_UNIX_SOCKET_ONLY" ||
    process.env.CARESLINK_LOCAL_HISTORY_DATABASE!=="OWNED_UNIX_SOCKET_ONLY" ||
    process.env.CARESLINK_LOCAL_SETTLED_REVIEW!=="EXACT_SETTLED_RESULT_ONLY") throw new Error("Local settled review unavailable");
  const absent=()=>Response.json({status:"NOT_FOUND"},{status:404,headers:{"Cache-Control":"private, no-store"}});
  const url=new URL(request.url), base="/api/ai-documents/communication-note/documents/"+documentId;
  if(request.headers.get("host")!=="127.0.0.1:3395" || request.headers.get("sec-fetch-site")!=="same-origin" ||
    request.headers.has("authorization") || (request.headers.has("origin") && request.headers.get("origin")!=="http://127.0.0.1:3395") ||
    (request.method==="POST" && request.headers.get("origin")!=="http://127.0.0.1:3395")) return absent();
  const handler=url.pathname===base && request.method==="GET" ? readReviewDatabaseDocument
    : url.pathname===base+"/self-review" && request.method==="POST" ? confirmReviewDatabaseDocument
    : url.pathname===base+"/export-history" && ["GET","POST"].includes(request.method) ? handleDatabaseExportHistory : undefined;
  if(!handler) return absent();
  try {
    const binding=await readSettlementResultBinding(root);
    if(binding.canonicalId!==documentId || (url.searchParams.has("revisionId") && url.searchParams.get("revisionId")!==binding.revisionId)) return absent();
  } catch { return absent(); }
  // Existing handlers bound-parse the untouched body and recheck active
  // session, owner, exact current revision and self-review in real SQL.
  return handler(request,documentId);
}
