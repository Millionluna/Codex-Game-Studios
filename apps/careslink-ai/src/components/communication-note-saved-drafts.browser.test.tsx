// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({load:vi.fn(),replace:vi.fn()}));
vi.mock("../lib/communication-note-saved-drafts",()=>({loadCommunicationNoteSavedDrafts:mocks.load}));
vi.mock("../lib/communication-note-document-navigation",()=>({replaceCommunicationNoteLocation:mocks.replace}));
vi.mock("next/image",async()=>{const React=await import("react");return {default:({priority,...props}:React.ImgHTMLAttributes<HTMLImageElement>&{priority?:boolean})=>{void priority;return React.createElement("img",props);}};});
import { CommunicationNoteSavedDrafts, CommunicationNoteSavedDraftsView } from "./communication-note-saved-drafts";
const DOC="11111111-1111-4111-8111-111111111111",LOGIN="/auth/login?next=%2Fai-documents";
const result={status:"AVAILABLE",documents:[{canonicalId:DOC,revisionNumber:2,sourceLocale:"en",updatedAt:"2026-09-08T01:00:00Z"}]} as const;
let root:Root,container:HTMLDivElement;
beforeEach(()=>{(globalThis as typeof globalThis&{IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;vi.resetAllMocks();container=document.createElement("div");document.body.append(container);root=createRoot(container);mocks.load.mockResolvedValue(result);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.useRealTimers();vi.restoreAllMocks();});
const render=()=>act(async()=>root.render(<CommunicationNoteSavedDrafts locale="en" loginHref={LOGIN}/>));
const hasEntry=()=>Boolean(container.querySelector('a[href*="/documents/"]'));
describe("saved draft revisit surface",()=>{
  it.each(["en","zh-Hans","zh-Hant"] as const)("renders current-version link and locale %s without raw IDs/review claims",locale=>{
    const markup=renderToStaticMarkup(<CommunicationNoteSavedDraftsView locale={locale} result={result} onRefresh={()=>{}}/>);
    expect(markup).toContain(`/documents/${DOC}?lang=${locale}`);expect(markup).not.toContain("revisionId=");
    const visible=document.createElement("div");visible.innerHTML=markup;expect(visible.textContent).not.toContain(DOC);expect(visible.textContent).not.toContain("confirmed");
    expect(markup).toContain("careslink-ai-logo-reverse.svg");expect(markup).toContain('role="status"');
  });
  it("reads once without polling and manual refresh rechecks",async()=>{
    await render();expect(hasEntry()).toBe(true);expect(mocks.load).toHaveBeenCalledTimes(1);
    await act(async()=>container.querySelector("button")!.click());expect(mocks.load).toHaveBeenCalledTimes(2);
  });
  it.each(["focus","storage","online"])("clears before %s reauthorization and rejects delayed old data",async event=>{
    let oldResolve:(value:unknown)=>void=()=>{};
    mocks.load.mockImplementationOnce(()=>new Promise(resolve=>{oldResolve=resolve;}));await render();
    mocks.load.mockResolvedValue({status:"UNAVAILABLE"});await act(async()=>window.dispatchEvent(new Event(event)));
    await act(async()=>oldResolve(result));expect(hasEntry()).toBe(false);expect(container.textContent).toContain("cannot be checked");
    expect(mocks.load.mock.calls[0][0].aborted).toBe(true);
  });
  it.each(["offline","pagehide"])("clears immediately on %s",async event=>{await render();await act(async()=>window.dispatchEvent(new Event(event)));expect(hasEntry()).toBe(false);if(event==="offline") expect(container.textContent).toContain("cannot be checked");});
  it("clears then redirects on revoked session",async()=>{await render();mocks.load.mockResolvedValue({status:"AUTH_REQUIRED"});await act(async()=>window.dispatchEvent(new Event("focus")));expect(hasEntry()).toBe(false);expect(mocks.replace).toHaveBeenCalledWith(LOGIN);});
  it("turns a stalled read into retryable unavailability",async()=>{
    vi.useFakeTimers();mocks.load.mockImplementation(()=>new Promise(()=>{}));await render();
    await act(async()=>vi.advanceTimersByTimeAsync(8000));expect(container.textContent).toContain("cannot be checked");expect(mocks.load.mock.calls[0][0].aborted).toBe(true);
  });
  it("clears a hidden page and rechecks a persisted return",async()=>{
    await render();vi.spyOn(document,"visibilityState","get").mockReturnValue("hidden");
    await act(async()=>document.dispatchEvent(new Event("visibilitychange")));expect(hasEntry()).toBe(false);
    await act(async()=>window.dispatchEvent(new PageTransitionEvent("pageshow",{persisted:true})));expect(mocks.load).toHaveBeenCalledTimes(2);
  });
  it("distinguishes empty from failure without generation submission",async()=>{
    mocks.load.mockResolvedValue({status:"AVAILABLE",documents:[]});await render();expect(container.textContent).toContain("No saved Communication Notes yet");
    mocks.load.mockRejectedValue(new Error("private"));await act(async()=>container.querySelector("button")!.click());
    expect(container.textContent).not.toContain("No saved Communication Notes yet");expect(container.textContent).not.toContain("private");expect(hasEntry()).toBe(false);
  });
});
const task={jobId:DOC,status:"QUEUED",createdAt:result.documents[0].updatedAt,updatedAt:result.documents[0].updatedAt} as const;
const workspace={...result,task};
const hasTask=()=>Boolean(container.querySelector('a[href*="/jobs/"]'));
const renderWorkspace=()=>act(async()=>root.render(<CommunicationNoteSavedDrafts locale="en" loginHref={LOGIN} includeTask/>));
describe("workspace task revisit surface",()=>{
  it.each((["en","zh-Hans","zh-Hant"] as const).flatMap(locale=>(["QUEUED","RUNNING","SUCCEEDED","FAILED","CANCELLED"] as const).map(status=>({locale,status}))))("renders $locale / $status with safe task navigation",({locale,status})=>{
    const markup=renderToStaticMarkup(<CommunicationNoteSavedDraftsView locale={locale} includeTask result={{...workspace,task:{...task,status}}} onRefresh={()=>{}}/>);
    const visible=document.createElement("div");visible.innerHTML=markup;
    expect(markup).toContain(`/jobs/${DOC}?lang=${locale}`);expect(visible.textContent).not.toContain(DOC);
    expect(visible.querySelector("h3")?.textContent).toBe("Communication Note");
    expect(visible.textContent).not.toContain("QUEUED");expect(visible.textContent).not.toContain("SUCCEEDED");
    expect(markup).not.toContain('href="/ai-documents/communication-note?');
    if(status==="SUCCEEDED")expect(visible.textContent).toMatch(/review required|仍需复核|仍需複核/);
  });
  it("reopens a pending task on a fresh mount without restoring submitted facts",async()=>{
    mocks.load.mockResolvedValue(workspace);await renderWorkspace();expect(hasTask()).toBe(true);
    await act(async()=>root.unmount());root=createRoot(container);await renderWorkspace();
    expect(hasTask()).toBe(true);expect(mocks.load).toHaveBeenLastCalledWith(expect.any(AbortSignal),undefined,true);
    expect(container.textContent).not.toContain("Synthetic call occurred.");
  });
  it.each(["offline","pagehide","focus"])("clears both entries immediately for %s",async event=>{
    mocks.load.mockResolvedValue(workspace);await renderWorkspace();expect(hasEntry()&&hasTask()).toBe(true);
    mocks.load.mockImplementation(()=>new Promise(()=>{}));await act(async()=>window.dispatchEvent(new Event(event)));
    expect(hasEntry()||hasTask()).toBe(false);
  });
  it("clears task and drafts together on revoked access",async()=>{
    mocks.load.mockResolvedValue(workspace);await renderWorkspace();mocks.load.mockResolvedValue({status:"AUTH_REQUIRED"});
    await act(async()=>container.querySelector("button")!.click());expect(hasEntry()||hasTask()).toBe(false);expect(mocks.replace).toHaveBeenCalledWith(LOGIN);
  });
  it("does not offer a new generation while a task exists or its state is unknown",async()=>{
    mocks.load.mockResolvedValue({status:"UNAVAILABLE"});await renderWorkspace();expect(container.querySelector('a[href="/ai-documents/communication-note?lang=en"]')).toBeNull();
    mocks.load.mockResolvedValue({status:"AVAILABLE",documents:[],task:null});await act(async()=>container.querySelector("button")!.click());
    expect(container.textContent).toContain("No generation task yet");expect(container.querySelector('a[href="/ai-documents/communication-note?lang=en"]')).not.toBeNull();
  });
  it("clears old mode data and ignores its delayed response",async()=>{
    let resolve:(value:unknown)=>void=()=>{};mocks.load.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));await render();
    mocks.load.mockResolvedValue({status:"UNAVAILABLE"});await renderWorkspace();await act(async()=>resolve(result));
    expect(hasEntry()||hasTask()).toBe(false);expect(mocks.load.mock.calls[0][0].aborted).toBe(true);
  });
});
