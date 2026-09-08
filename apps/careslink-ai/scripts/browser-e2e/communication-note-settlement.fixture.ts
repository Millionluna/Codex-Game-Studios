/** TEST ONLY. Read the one actually settled synthetic result. No terminal
 * credential, operator, grant-consumption or settlement command enters Next. */
import "server-only";
import { readFile, realpath } from "node:fs/promises";
import { assertAdmissionFixture } from "./communication-note-admission.fixture";
import { readReviewDatabaseDocument } from "./communication-note-self-review.fixture";

export function parseSettlementResultBinding(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Local result unavailable");
  const record=value as Record<string,unknown>, keys=Object.keys(record).sort();
  if (keys.join(",")!=="canonicalId,revisionId" || !keys.every(k=>typeof record[k]==="string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(record[k] as string))) throw new Error("Local result unavailable");
  return {canonicalId:record.canonicalId as string,revisionId:record.revisionId as string};
}
export async function readSettlementDocument(request: Request, documentId: string) {
  const root=assertAdmissionFixture();
  if(process.env.CARESLINK_LOCAL_SETTLEMENT_DATABASE!=="OWNED_UNIX_SOCKET_ONLY") throw new Error("Local settlement fixture unavailable");
  const absent=()=>Response.json({status:"NOT_FOUND"},{status:404,headers:{"Cache-Control":"private, no-store"}});
  const url=new URL(request.url);
  if(request.method!=="GET" || request.headers.get("host")!=="127.0.0.1:3395" ||
    request.headers.get("sec-fetch-site")!=="same-origin" || request.headers.has("authorization")) return absent();
  try {
    const path=root+"/settlement-result.json";
    if(await realpath(root)!==root || await realpath(path)!==path) return absent();
    const binding=parseSettlementResultBinding(JSON.parse(await readFile(path,"utf8")));
    if(binding.canonicalId!==documentId || (url.searchParams.has("revisionId") && url.searchParams.get("revisionId")!==binding.revisionId)) return absent();
  } catch {return absent();}
  // Fresh auth/current session and owner access are still checked by real SQL.
  return readReviewDatabaseDocument(request,documentId);
}
