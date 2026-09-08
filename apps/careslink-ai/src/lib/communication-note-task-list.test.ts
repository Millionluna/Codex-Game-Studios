import { describe, expect, it, vi } from "vitest";
import { decodeCommunicationNoteTaskCursor, encodeCommunicationNoteTaskCursor, parseCommunicationNoteTaskPage } from "./communication-note-task-list";
import { loadCommunicationNoteSavedDrafts } from "./communication-note-saved-drafts";
const TIME="2026-09-08T01:00:00.123456Z";
const tasks=Array.from({length:20},(_,i)=>({jobId:`11111111-1111-4111-8111-${String(100-i).padStart(12,"0")}`,status:"QUEUED",createdAt:TIME,updatedAt:TIME}));
const cursor={jobId:tasks[19].jobId,createdAt:TIME},page={tasks,nextCursor:cursor};
describe("multi-task metadata contract",()=>{
  it("preserves microsecond keyset precision and freezes metadata",()=>{const parsed=parseCommunicationNoteTaskPage(page);
    expect(parsed).toEqual(page);expect(Object.isFrozen(parsed.tasks)).toBe(true);expect(Object.isFrozen(parsed.tasks[0])).toBe(true);expect(Object.isFrozen(parsed.nextCursor)).toBe(true);
    expect(decodeCommunicationNoteTaskCursor(encodeCommunicationNoteTaskCursor(cursor))).toEqual(cursor);});
  it("accepts empty last page",()=>expect(parseCommunicationNoteTaskPage({tasks:[],nextCursor:null},cursor)).toEqual({tasks:[],nextCursor:null}));
  it.each(["RUNNING","SUCCEEDED","FAILED","CANCELLED"])("accepts %s without granting review authority",status=>expect(parseCommunicationNoteTaskPage({tasks:[{...tasks[0],status}],nextCursor:null}).tasks[0].status).toBe(status));
  it.each([{tasks:[tasks[0],tasks[0]],nextCursor:null},{tasks:[...tasks].reverse(),nextCursor:null},
    {tasks:[...tasks,tasks[0]],nextCursor:null},{tasks:[],nextCursor:cursor},{...page,nextCursor:{...cursor,jobId:tasks[0].jobId}},
    {...page,ownerId:"private"},{tasks:[{...tasks[0],cleanedFacts:"private"}],nextCursor:null},
    {tasks:[{...tasks[0],status:"APPROVED"}],nextCursor:null},{tasks:[{...tasks[0],createdAt:"2026-02-30T00:00:00.000000Z"}],nextCursor:null},
    {tasks:[{...tasks[0],updatedAt:"2026-09-07T01:00:00.123456Z"}],nextCursor:null}])("rejects invalid page %#",value=>expect(()=>parseCommunicationNoteTaskPage(value)).toThrow());
  it("rejects out-of-page tasks after a cursor",()=>expect(()=>parseCommunicationNoteTaskPage(page,cursor)).toThrow());
  it("does not execute record accessors",()=>{const getter=vi.fn();const value={...page};Object.defineProperty(value,"tasks",{enumerable:true,get:getter});expect(()=>parseCommunicationNoteTaskPage(value)).toThrow();expect(getter).not.toHaveBeenCalled();});
  it.each(["","private","2026-09-08T01:00:00.123456Z~javascript:alert(1)",encodeCommunicationNoteTaskCursor(cursor)+"x"])("rejects invalid encoded position %#",value=>expect(()=>decodeCommunicationNoteTaskCursor(value)).toThrow());
  it("sends a cookie GET with position only and validates the returned page",async()=>{
    const fetcher=vi.fn().mockResolvedValue(Response.json({status:"AVAILABLE",documents:[],documentsCursor:null,taskPage:{tasks:[],nextCursor:null}}));
    await loadCommunicationNoteSavedDrafts(new AbortController().signal,fetcher,"MULTI",cursor);
    expect(fetcher).toHaveBeenCalledWith("/api/ai-documents/communication-note/documents?"+new URLSearchParams({before:encodeCommunicationNoteTaskCursor(cursor)}),expect.objectContaining({method:"GET",cache:"no-store",credentials:"same-origin"}));
  });
});
