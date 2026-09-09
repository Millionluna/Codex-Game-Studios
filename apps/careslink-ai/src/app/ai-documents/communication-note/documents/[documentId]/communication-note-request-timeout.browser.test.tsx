// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CommunicationNoteEditForm } from "./communication-note-edit-form";
import { CommunicationNoteExportControls } from "./communication-note-export-controls";
import { exportDocument } from "../../../../../lib/communication-note-export-test-fixture";
import { COMMUNICATION_NOTE_REQUEST_DEADLINE_MS as DEADLINE_MS } from "../../../../../lib/communication-note-request-deadline";

// Real components, clients and browser helpers; only the transport/browser APIs
// are replaced. Both fetch and body deliberately ignore cancellation.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
let root: Root, container: HTMLDivElement, access: AbortController;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers(); access = new AbortController();
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { access.abort(); root.unmount(); });
  container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});
function button(label: string) {
  return [...container.querySelectorAll("button")].find(item => item.textContent === label)!;
}
function stalledTransport(phase: "request" | "body") {
  const body = deferred<unknown>(), request = deferred<Pick<Response, "status" | "json">>();
  const response = { status: 200, json: vi.fn(() => body.promise) };
  const fetcher = vi.fn<(url: unknown, init: RequestInit) => Promise<Pick<Response, "status" | "json">>>(
    () => phase === "request" ? request.promise : Promise.resolve(response));
  vi.stubGlobal("fetch", fetcher);
  return { fetcher, signal: () => fetcher.mock.calls[0][1].signal!,
    finish: (value: unknown) => { body.resolve(value); request.resolve(response); } };
}

it.each(["request", "body"] as const)("edit %s timeout preserves wording, exposes recovery and ignores a late valid ACK", async phase => {
  const saved = exportDocument(), result = vi.fn(), transport = stalledTransport(phase);
  await act(async () => { root.render(<CommunicationNoteEditForm saved={saved} locale="en" accessSignal={access.signal}
    editing={true} onEditingChange={vi.fn()} onResult={result} />); });
  const area = container.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(area, "Changed synthetic wording.");
    area.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => { container.querySelector<HTMLInputElement>("input[type=checkbox]")!.click(); });
  await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(container.textContent).toContain("Saving new version…");
  await act(async () => { await vi.advanceTimersByTimeAsync(DEADLINE_MS - 1); });
  expect(container.textContent).toContain("Saving new version…");
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(container.textContent).not.toContain("Saving new version…");
  expect(container.textContent).toContain("The save result is unknown. Do not submit again.");
  expect(area.value).toBe("Changed synthetic wording.");
  expect(button("Discard edits").disabled).toBe(false);
  expect(button("Save as new version").disabled).toBe(true);
  expect(container.querySelector("a")?.getAttribute("href")).toContain(saved.canonicalId);
  expect(container.querySelector("a")?.textContent).toBe("Open current version to check");
  expect(transport.signal().aborted).toBe(true); expect(access.signal.aborted).toBe(false);
  const mutationId = (transport.fetcher.mock.calls[0][1].headers as Record<string, string>)["Idempotency-Key"];
  await act(async () => {
    transport.finish({ status: "SAVED", canonicalId: saved.canonicalId, baseRevisionId: saved.revision.revisionId,
      revisionId: "30000000-0000-4000-8000-000000000001", revisionNumber: 4, mutationId,
      saveState: "SERVER_ACKNOWLEDGED", selfReviewStatus: "REQUIRED", draftNotice: "Draft – review required" });
    await vi.advanceTimersByTimeAsync(DEADLINE_MS);
    container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(result).not.toHaveBeenCalled(); expect(transport.fetcher).toHaveBeenCalledTimes(1);
  expect(area.value).toBe("Changed synthetic wording.");
  expect(container.textContent).toContain("The save result is unknown.");
  expect(vi.getTimerCount()).toBe(0);
});

const exportCases = (["request", "body"] as const).flatMap(phase =>
  (["TXT", "DOCX", "PDF", "COPY_TEXT", "COPY_ITEM"] as const).map(format => ({ phase, format })));
it.each(exportCases)("$format $phase timeout unlocks controls without a late export or metadata write", async ({ phase, format }) => {
  const transport = stalledTransport(phase), onAccessResult = vi.fn(), copiedBytes = vi.fn();
  const writeText = vi.fn(async () => {});
  class TestClipboardItem { constructor(readonly data: Record<string, Promise<Blob>>) {} }
  const write = vi.fn(async (items: TestClipboardItem[]) => { copiedBytes(await items[0].data["text/plain"]); });
  vi.stubGlobal("ClipboardItem", TestClipboardItem);
  vi.stubGlobal("navigator", { clipboard: { writeText, ...(format === "COPY_ITEM" ? { write } : {}) } });
  const createObjectURL = vi.fn(() => "blob:synthetic-timeout");
  vi.stubGlobal("URL", class extends URL { static createObjectURL = createObjectURL; static revokeObjectURL = vi.fn(); });
  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  await act(async () => { root.render(<CommunicationNoteExportControls saved={exportDocument()} locale="en"
    accessSignal={access.signal} onAccessResult={onAccessResult} />); });
  const label = format.startsWith("COPY") ? "Copy record text" : `Download ${format}`;
  await act(async () => { button(label).click(); });
  expect(container.textContent).toContain("Checking access and version…");
  await act(async () => { await vi.advanceTimersByTimeAsync(DEADLINE_MS); });
  expect(container.textContent).not.toContain("Checking access and version…");
  expect(container.textContent).toContain("Access or version could not be verified. Nothing was exported.");
  expect([...container.querySelectorAll("button")].every(item => !item.disabled)).toBe(true);
  expect(transport.signal().aborted).toBe(true); expect(access.signal.aborted).toBe(false);
  await act(async () => { transport.finish(exportDocument()); await vi.advanceTimersByTimeAsync(DEADLINE_MS); });
  expect(transport.fetcher).toHaveBeenCalledTimes(1); expect(onAccessResult).not.toHaveBeenCalled();
  expect(writeText).not.toHaveBeenCalled(); expect(copiedBytes).not.toHaveBeenCalled();
  expect(createObjectURL).not.toHaveBeenCalled(); expect(anchorClick).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Nothing was exported."); expect(vi.getTimerCount()).toBe(0);
});

it("reauthorizes an explicit new export without letting the timed-out read complete that action", async () => {
  const transport = stalledTransport("body"), nextBody = deferred<unknown>();
  const createObjectURL = vi.fn(() => "blob:synthetic-new-action"), revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", class extends URL { static createObjectURL = createObjectURL; static revokeObjectURL = revokeObjectURL; });
  const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  await act(async () => { root.render(<CommunicationNoteExportControls saved={exportDocument()} locale="en"
    accessSignal={access.signal} onAccessResult={vi.fn()} />); });
  await act(async () => { button("Download TXT").click(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(DEADLINE_MS); });
  expect(transport.fetcher).toHaveBeenCalledTimes(1);
  transport.fetcher.mockResolvedValueOnce({ status: 200, json: () => nextBody.promise })
    .mockResolvedValueOnce({ status: 503, json: async () => ({ status: "UNAVAILABLE" }) });
  await act(async () => { button("Download TXT").click(); });
  expect(transport.fetcher).toHaveBeenCalledTimes(2);
  expect(transport.fetcher.mock.calls[1][1].signal?.aborted).toBe(false);
  await act(async () => { transport.finish(exportDocument()); });
  expect(container.textContent).toContain("Checking access and version…");
  expect(createObjectURL).not.toHaveBeenCalled(); expect(anchorClick).not.toHaveBeenCalled();
  await act(async () => { nextBody.resolve(exportDocument()); });
  expect(createObjectURL).toHaveBeenCalledTimes(1); expect(anchorClick).toHaveBeenCalledTimes(1);
  expect(transport.fetcher).toHaveBeenCalledTimes(3);
  const history = transport.fetcher.mock.calls[2][1];
  expect(history.method).toBe("POST");
  expect(JSON.parse(history.body as string)).toMatchObject({ format: "TXT", outcome: "DOWNLOAD_INITIATED" });
  await act(async () => { access.abort(); });
  expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:synthetic-new-action");
  expect(vi.getTimerCount()).toBe(0);
});
