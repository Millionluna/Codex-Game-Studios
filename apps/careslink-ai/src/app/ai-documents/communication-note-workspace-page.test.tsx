import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
const mocks=vi.hoisted(()=>({client:vi.fn(),account:vi.fn(),redirect:vi.fn()}));
vi.mock("../../lib/supabase-server",()=>({createCareslinkServerSupabaseClient:mocks.client}));
vi.mock("../../lib/referral-workspace-session",()=>({resolveWorkspaceAccountFromSupabaseSession:mocks.account}));
vi.mock("next/navigation",()=>({redirect:mocks.redirect}));
vi.mock("../../components/communication-note-saved-drafts",()=>({CommunicationNoteSavedDrafts:()=>null}));
import { renderCommunicationNoteWorkspacePage } from "./communication-note-workspace-page";
const client={auth:{getUser:vi.fn()}};
beforeEach(()=>{vi.resetAllMocks();mocks.client.mockResolvedValue(client);mocks.account.mockResolvedValue({id:"owner",role:"provider"});
  mocks.redirect.mockImplementation(href=>{throw new Error("redirect:"+href);});});
describe("formal Communication workspace shell",()=>{
  it.each(["en","zh-Hans","zh-Hant"])("passes only safe serializable loader props for %s",async locale=>{
    const view=await renderCommunicationNoteWorkspacePage({lang:locale});
    expect(view?.props).toEqual({locale,includeTask:"MULTI",loginHref:`/auth/login?lang=${locale==="zh-Hant"?"en":locale}&next=${encodeURIComponent("/ai-documents?lang="+locale)}`});
    expect(mocks.account).toHaveBeenCalledWith(client);expect(JSON.stringify(view?.props)).not.toContain("owner");
  });
  it("requires server auth before canonicalization and never accepts a demo account",async()=>{
    mocks.account.mockResolvedValue(undefined);
    await expect(renderCommunicationNoteWorkspacePage({lang:"zh-Hant",account:"admin",next:"https://outside.invalid"})).rejects.toThrow("redirect:");
    expect(mocks.redirect).toHaveBeenCalledWith("/auth/login?lang=en&next=%2Fai-documents%3Flang%3Dzh-Hant");
  });
  it.each([{},{lang:"private"},{lang:["en","zh-Hant"]},{lang:"en",owner:"private"},{lang:"en",draftAfter:"private"}])("canonicalizes unsafe/duplicate query %# to a fixed locale path",async query=>{
    await expect(renderCommunicationNoteWorkspacePage(query)).rejects.toThrow("redirect:/ai-documents?lang=en");
    expect(mocks.account.mock.invocationCallOrder[0]).toBeLessThan(mocks.redirect.mock.invocationCallOrder[0]);
  });
  it("returns administrators to the existing branch without a redirect loop",async()=>{
    mocks.account.mockResolvedValue({id:"administrator",role:"admin"});
    expect(await renderCommunicationNoteWorkspacePage({lang:"zh-Hant"})).toBeNull();expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("does not turn an auth service failure into private workspace props",async()=>{
    mocks.client.mockRejectedValue(new Error("auth unavailable"));await expect(renderCommunicationNoteWorkspacePage({lang:"en"})).rejects.toThrow();
    expect(mocks.account).not.toHaveBeenCalled();
  });
});
