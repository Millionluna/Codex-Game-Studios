import { describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { createCommunicationNoteJobListRepository, COMMUNICATION_NOTE_JOB_LIST_SQL } from "./communication-note-job-list-repository.server";
const principal={userId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",sessionId:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",transport:"COOKIE"} as const;
const page={tasks:[],nextCursor:null};
describe("purpose-scoped multi-task repository",()=>{
  it("binds owner/session and a fixed page size, exposing only a read method",async()=>{
    const query=vi.fn().mockResolvedValue({rows:[{data:page}]});const repo=createCommunicationNoteJobListRepository({principal,query});
    expect(Object.keys(repo)).toEqual(["list"]);expect(await repo.list(null)).toEqual(page);
    expect(query).toHaveBeenCalledWith(COMMUNICATION_NOTE_JOB_LIST_SQL,[principal.userId,principal.sessionId,null,null,20,"1.0.0-shadow.1","2026-08-09.v1-shadow"]);
  });
  it.each([{rows:[]},{rows:[{data:page},{data:page}]},{rows:[{data:{...page,body:"private"}}]},{rows:[{data:page}],secret:"private"}])("fails closed for broken query envelope %#",async raw=>{
    await expect(createCommunicationNoteJobListRepository({principal,query:vi.fn().mockResolvedValue(raw)}).list(null)).rejects.toMatchObject({code:"PRODUCT_API_DISABLED"});
  });
  it.each(["BEARER","unknown"])("rejects transport %s",transport=>expect(()=>createCommunicationNoteJobListRepository({principal:{...principal,transport} as never,query:vi.fn()})).toThrow());
  it("never leaks raw driver diagnostics",async()=>{
    await expect(createCommunicationNoteJobListRepository({principal,query:vi.fn().mockRejectedValue(new Error("private connection details"))}).list(null)).rejects.toMatchObject({message:"Task list unavailable"});
  });
  it("preserves only session revocation for the auth redirect",async()=>{
    await expect(createCommunicationNoteJobListRepository({principal,query:vi.fn().mockRejectedValue(Object.assign(new Error("SESSION_REVOKED"),{code:"P0001"}))}).list(null)).rejects.toMatchObject({code:"SESSION_REVOKED"});
  });
});
