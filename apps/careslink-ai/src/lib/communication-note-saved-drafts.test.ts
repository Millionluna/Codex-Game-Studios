import { describe, expect, it, vi } from "vitest";
import { loadCommunicationNoteSavedDrafts, parseCommunicationNoteSavedDrafts } from "./communication-note-saved-drafts";
const document = { canonicalId: "11111111-1111-4111-8111-111111111111", revisionNumber: 2, sourceLocale: "en", updatedAt: "2026-09-08T01:00:00Z" };
describe("saved draft metadata contract", () => {
  it("accepts and freezes only minimal metadata", () => {
    const result = parseCommunicationNoteSavedDrafts(200, { status: "AVAILABLE", documents: [document] });
    expect(Object.isFrozen(result)).toBe(true);
    if(result.status !== "AVAILABLE") throw new Error("missing list");
    expect(Object.isFrozen(result.documents[0])).toBe(true);
    expect(result.documents).toEqual([document]);
  });
  it("accepts a genuine empty list", () => expect(parseCommunicationNoteSavedDrafts(200, { status: "AVAILABLE", documents: [] })).toEqual({status:"AVAILABLE",documents:[]}));
  it.each([
    { ...document, canonicalId: "javascript:alert(1)" }, { ...document, revisionNumber: 0 },
    { ...document, revisionNumber: 1.5 }, { ...document, sourceLocale: "fr" },
    { ...document, updatedAt: "invalid" }, { ...document, englishDraft: "private" },
    { ...document, selfReviewStatus: "CONFIRMED" }, { ...document, currentRevisionId: document.canonicalId },
  ])("rejects invalid or excessive metadata %#", d => expect(() => parseCommunicationNoteSavedDrafts(200, { status: "AVAILABLE", documents: [d] })).toThrow());
  it.each([
    { status: "AVAILABLE", documents: [document, document] },
    { status: "AVAILABLE", documents: Array(101).fill(document) },
    { status: "AVAILABLE", documents: [], nextCursor: "private" },
    { status: "AUTH_REQUIRED", documents: [document] },
  ])("rejects duplicate/oversized/unknown envelopes %#", value => expect(() => parseCommunicationNoteSavedDrafts(200, value)).toThrow());
  it.each([[401,"AUTH_REQUIRED"],[503,"UNAVAILABLE"]] as const)("validates status %s", (code,status) => {
    expect(parseCommunicationNoteSavedDrafts(code,{status})).toEqual({status});
    expect(()=>parseCommunicationNoteSavedDrafts(200,{status})).toThrow();
  });
  it("uses only a no-store cookie GET, without writes or identifiers in the query", async () => {
    const signal = new AbortController().signal;
    const fetcher = vi.fn().mockResolvedValue(Response.json({status:"AVAILABLE",documents:[]}));
    await loadCommunicationNoteSavedDrafts(signal, fetcher);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/ai-documents/communication-note/documents", {
      method:"GET",credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json"},signal,
    });
  });
});
const task = {jobId:document.canonicalId,status:"QUEUED",createdAt:document.updatedAt,updatedAt:document.updatedAt};
describe("opt-in workspace task metadata",()=>{
  it.each(["QUEUED","RUNNING","SUCCEEDED","FAILED","CANCELLED"])("accepts frozen minimal %s entry",status=>{
    const result=parseCommunicationNoteSavedDrafts(200,{status:"AVAILABLE",documents:[],task:{...task,status}},true);
    expect(result).toEqual({status:"AVAILABLE",documents:[],task:{...task,status}});
    if(result.status!=="AVAILABLE")throw new Error();expect(Object.isFrozen(result.task)).toBe(true);
  });
  it("requires explicit opt-in and explicit empty task",()=>{
    expect(()=>parseCommunicationNoteSavedDrafts(200,{status:"AVAILABLE",documents:[],task})).toThrow();
    expect(()=>parseCommunicationNoteSavedDrafts(200,{status:"AVAILABLE",documents:[]},true)).toThrow();
    expect(parseCommunicationNoteSavedDrafts(200,{status:"AVAILABLE",documents:[],task:null},true)).toEqual({status:"AVAILABLE",documents:[],task:null});
  });
  it.each([{jobId:"javascript:alert(1)"},{status:"APPROVED"},{createdAt:"private"},{updatedAt:"2026-09-07T00:00:00Z"},
    {cleanedFacts:"private"},{result:{canonicalId:document.canonicalId}},{failureCode:"secret"},{reviewed:true}])("rejects excessive or invalid task %#",patch=>{
    expect(()=>parseCommunicationNoteSavedDrafts(200,{status:"AVAILABLE",documents:[],task:{...task,...patch}},true)).toThrow();
  });
  it("never accepts task metadata alongside auth failure",()=>expect(()=>parseCommunicationNoteSavedDrafts(401,{status:"AUTH_REQUIRED",task},true)).toThrow());
  it("reads the workspace with no client locator, facts or request key",async()=>{
    const fetcher=vi.fn().mockResolvedValue(Response.json({status:"AVAILABLE",documents:[],task}));
    expect(await loadCommunicationNoteSavedDrafts(new AbortController().signal,fetcher,true)).toMatchObject({task});
    expect(fetcher).toHaveBeenCalledWith("/api/ai-documents/communication-note/documents",expect.objectContaining({method:"GET",cache:"no-store",credentials:"same-origin"}));
  });
});
