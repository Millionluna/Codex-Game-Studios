import { describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { readCommunicationNoteDraftCatalog } from "./communication-note-draft-catalog.server";
import { loadCommunicationNoteSavedDrafts, parseCommunicationNoteSavedDrafts } from "./communication-note-saved-drafts";
import type { CaresLinkV1DocumentResource } from "./v1/transport-contract";
const id=(i:number)=>`11111111-1111-4111-8111-${String(i).padStart(12,"0")}`;
const docs:CaresLinkV1DocumentResource[]=Array.from({length:20},(_,i)=>({canonicalId:id(i+1),noteType:"communication",sourceLocale:"en",
  lifecycleStatus:"IN_PROGRESS",currentRevisionId:id(50+i),currentRevisionNumber:i+1,contractVersion:"1.0.0-shadow.1",
  schemaVersion:"2026-08-09.v1-shadow",createdAt:"2026-09-08T01:00:00Z",updatedAt:"2026-09-08T02:00:00Z",deletedAt:null}));
const cursor="document.v1:"+id(20);
const page={documents:docs,nextCursor:cursor,hasMore:true};
const tasks={tasks:[],nextCursor:null};
const metadata=docs.map(d=>({canonicalId:d.canonicalId,revisionNumber:d.currentRevisionNumber,sourceLocale:d.sourceLocale,updatedAt:d.updatedAt}));
describe("current-owner draft catalog",()=>{
  it("uses one fixed 20-row Product API page and returns only minimal current-version metadata",async()=>{
    const list=vi.fn().mockResolvedValue(page), result=await readCommunicationNoteDraftCatalog(list);
    expect(list).toHaveBeenCalledExactlyOnceWith({limit:20});expect(result).toEqual({documents:metadata,documentsCursor:cursor});
    expect(JSON.stringify(result)).not.toMatch(/owner|revisionId|factsSummary|selfReviewStatus|contentHash/);
  });
  it("filters other note types, deleted and revisionless entries but retains sparse-page continuation",async()=>{
    const mixed=[{...docs[0],noteType:"handover"},{...docs[1],lifecycleStatus:"TOMBSTONED",deletedAt:docs[1].updatedAt},
      {...docs[2],lifecycleStatus:"PURGED"},{...docs[3],currentRevisionId:null},...docs.slice(4)];
    const result=await readCommunicationNoteDraftCatalog(vi.fn().mockResolvedValue({...page,documents:mixed}));
    expect(result.documents).toEqual(metadata.slice(4));expect(result.documentsCursor).toBe(cursor);
  });
  it("allows an empty filtered page to progress and a true final empty page",async()=>{
    expect(await readCommunicationNoteDraftCatalog(vi.fn().mockResolvedValue({...page,documents:docs.map(d=>({...d,noteType:"handover"}))})))
      .toEqual({documents:[],documentsCursor:cursor});
    const list=vi.fn().mockResolvedValue({documents:[],nextCursor:null,hasMore:false});
    expect(await readCommunicationNoteDraftCatalog(list,cursor)).toEqual({documents:[],documentsCursor:null});
    expect(list).toHaveBeenCalledWith({limit:20,cursor});
  });
  it.each([{...page,documents:docs.slice(1)},{...page,nextCursor:null},{...page,hasMore:false},{...page,nextCursor:"private"},
    {...page,nextCursor:"document.v1:"+id(19)},{...page,documents:[...docs].reverse()},
    {...page,documents:[docs[0],...docs.slice(0,19)]},{...page,documents:[...docs,docs[0]]}])("denies inconsistent source page %#",async value=>{
    await expect(readCommunicationNoteDraftCatalog(vi.fn().mockResolvedValue(value))).rejects.toThrow();
  });
  it("rejects repeated/out-of-order positions and propagates fresh-session failures",async()=>{
    await expect(readCommunicationNoteDraftCatalog(vi.fn().mockResolvedValue(page),cursor)).rejects.toThrow();
    const denied=new Error("SESSION_REVOKED");await expect(readCommunicationNoteDraftCatalog(vi.fn().mockRejectedValue(denied))).rejects.toBe(denied);
  });
});
describe("multi-document browser metadata contract",()=>{
  const envelope={status:"AVAILABLE",documents:metadata,documentsCursor:cursor,taskPage:tasks};
  it("accepts bounded stable pages without pinning a revision in navigation",()=>{
    expect(parseCommunicationNoteSavedDrafts(200,envelope,"MULTI")).toEqual(envelope);
    expect(parseCommunicationNoteSavedDrafts(200,{...envelope,documents:[],documentsCursor:null},"MULTI",null,cursor))
      .toMatchObject({documents:[],documentsCursor:null});
  });
  it.each([{...envelope,documentsCursor:undefined},{...envelope,documentsCursor:"document.v1:private"},
    {...envelope,documents:[...metadata,metadata[0]]},{...envelope,documents:[...metadata].reverse()},
    {...envelope,documentsCursor:"document.v1:"+id(1)},{...envelope,documents:[{...metadata[0],englishDraft:"private"}]}])("rejects excessive/invalid response %#",value=>{
    expect(()=>parseCommunicationNoteSavedDrafts(200,value,"MULTI")).toThrow();
  });
  it("rejects nonadvancing cursors even on filtered empty pages",()=>{
    expect(()=>parseCommunicationNoteSavedDrafts(200,{...envelope,documents:[]},"MULTI",null,cursor)).toThrow();
  });
  it("rejects sparse arrays and never invokes metadata accessors",()=>{
    expect(()=>parseCommunicationNoteSavedDrafts(200,{...envelope,documents:Array(1)},"MULTI")).toThrow();
    const getter=vi.fn(), entries=[metadata[0]];Object.defineProperty(entries,"0",{enumerable:true,get:getter});
    expect(()=>parseCommunicationNoteSavedDrafts(200,{...envelope,documents:entries},"MULTI")).toThrow();expect(getter).not.toHaveBeenCalled();
  });
  it("issues only a bounded cookie GET with a validated position",async()=>{
    const fetcher=vi.fn().mockResolvedValue(Response.json({...envelope,documents:[],documentsCursor:null}));
    await loadCommunicationNoteSavedDrafts(new AbortController().signal,fetcher,"MULTI",null,cursor);
    expect(fetcher).toHaveBeenCalledWith("/api/ai-documents/communication-note/documents?draftAfter="+encodeURIComponent(cursor),
      expect.objectContaining({method:"GET",cache:"no-store",credentials:"same-origin"}));
    fetcher.mockClear();await expect(loadCommunicationNoteSavedDrafts(new AbortController().signal,fetcher,"MULTI",null,"private")).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
