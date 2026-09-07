// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyCommunicationNoteRecord, downloadCommunicationNoteRecord, downloadCommunicationNoteDocx } from "./communication-note-export-browser";
import { CommunicationNoteExportError, renderCommunicationNoteRecordCopy } from "./communication-note-export";
import { exportDocument, EXPORT_NOW } from "./communication-note-export-test-fixture";

const renderDocx = vi.hoisted(() => vi.fn());
vi.mock("./communication-note-export-docx", () => ({ renderCommunicationNoteDocx: renderDocx }));
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

let clicked: { href: string; filename: string }[];
beforeEach(() => {
  clicked = []; vi.useFakeTimers();
  renderDocx.mockReset().mockImplementation(async record => ({ bytes: new Uint8Array([80, 75, 3, 4]).buffer, filename: record.filename.replace(/\.txt$/, ".docx"), mimeType: DOCX_MIME }));
  vi.stubGlobal("ClipboardItem", undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(async () => {}) } });
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:owned-test"), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { clicked.push({ href: this.href, filename: this.download }); });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const artifact = () => renderCommunicationNoteRecordCopy(exportDocument(), EXPORT_NOW);

describe("record copy browser sinks", () => {
  it("downloads DOCX bytes with correct MIME/extension and releases the URL", async () => {
    vi.useRealTimers(); const controller = new AbortController();
    const dispose = await downloadCommunicationNoteDocx(artifact(), controller.signal);
    expect(clicked).toEqual([{ href: "blob:owned-test", filename: artifact().filename.replace(/\.txt$/, ".docx") }]);
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    expect(blob.type).toBe(DOCX_MIME); expect(blob.size).toBe(4);
    const reader = new FileReader(), pending = new Promise(r => { reader.onload = () => r(reader.result); }); reader.readAsArrayBuffer(blob);
    expect([...new Uint8Array(await pending as ArrayBuffer)]).toEqual([80, 75, 3, 4]);
    controller.abort(); dispose(); expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
  it("does not render an aborted DOCX or download bytes after rendering loses access", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(downloadCommunicationNoteDocx(artifact(), controller.signal)).rejects.toThrow("UNAVAILABLE");
    expect(renderDocx).not.toHaveBeenCalled();
    const later = new AbortController();
    renderDocx.mockImplementationOnce(async () => { later.abort(); return { bytes: new ArrayBuffer(0), filename: "unused.docx", mimeType: DOCX_MIME }; });
    await expect(downloadCommunicationNoteDocx(artifact(), later.signal)).rejects.toThrow("UNAVAILABLE");
    expect(URL.createObjectURL).not.toHaveBeenCalled(); expect(clicked).toHaveLength(0);
  });
  it("sanitizes a DOCX renderer failure and never falls back to TXT", async () => {
    renderDocx.mockRejectedValueOnce(new Error("private detail"));
    await expect(downloadCommunicationNoteDocx(artifact(), new AbortController().signal)).rejects.toThrow(/^DOWNLOAD_FAILED$/);
    expect(URL.createObjectURL).not.toHaveBeenCalled(); expect(clicked).toHaveLength(0);
  });
  it("revokes a DOCX URL at sixty seconds and cleans up a failed DOCX click", async () => {
    await downloadCommunicationNoteDocx(artifact(), new AbortController().signal);
    vi.advanceTimersByTime(60_000); expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    vi.mocked(HTMLAnchorElement.prototype.click).mockImplementationOnce(() => { throw new Error("private"); });
    await expect(downloadCommunicationNoteDocx(artifact(), new AbortController().signal)).rejects.toThrow("DOWNLOAD_FAILED");
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2); expect(document.querySelector('a[download]')).toBeNull();
  });
  it("writes only the shared plain text after fresh preparation", async () => {
    const prepare = vi.fn(async () => artifact());
    await copyCommunicationNoteRecord(prepare, new AbortController().signal);
    expect(prepare).toHaveBeenCalledTimes(1); expect(navigator.clipboard.writeText).toHaveBeenCalledExactlyOnceWith(artifact().text);
  });
  it("invokes promise-backed clipboard write inside activation, before the read completes", async () => {
    let resolve!: (value: ReturnType<typeof artifact>) => void;
    let itemData!: Record<string, Promise<Blob>>;
    vi.stubGlobal("ClipboardItem", class { constructor(data: Record<string, Promise<Blob>>) { itemData = data; } });
    const write = vi.fn(async () => { await itemData["text/plain"]; });
    vi.stubGlobal("navigator", { clipboard: { write } });
    const pending = copyCommunicationNoteRecord(() => new Promise(r => { resolve = r; }), new AbortController().signal);
    expect(write).toHaveBeenCalledTimes(1); expect(Object.keys(itemData)).toEqual(["text/plain"]);
    resolve(artifact()); await pending;
    const blob = await itemData["text/plain"]; expect(blob.type).toBe("text/plain"); expect(blob.size).toBeGreaterThan(100);
  });
  it.each(["AUTH_REQUIRED", "STALE_REVISION", "REVIEW_REQUIRED", "NOT_FOUND"] as const)("never writes text after %s", async code => {
    await expect(copyCommunicationNoteRecord(async () => { throw new CommunicationNoteExportError(code); }, new AbortController().signal)).rejects.toMatchObject({ code });
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });
  it("does not prepare or write when clipboard is unavailable", async () => {
    vi.stubGlobal("navigator", {}); const prepare = vi.fn(async () => artifact());
    await expect(copyCommunicationNoteRecord(prepare, new AbortController().signal)).rejects.toMatchObject({ code: "COPY_FAILED" });
    expect(prepare).not.toHaveBeenCalled();
  });
  it("reports denied copy without pretending success or retrying", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error("private permission detail"));
    await expect(copyCommunicationNoteRecord(async () => artifact(), new AbortController().signal)).rejects.toThrow(/^COPY_FAILED$/);
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
  });
  it("prefers a late auth failure to an early clipboard denial without unhandled rejection", async () => {
    vi.stubGlobal("ClipboardItem", class { constructor(readonly data: unknown) {} });
    vi.stubGlobal("navigator", { clipboard: { write: vi.fn(async () => { throw new Error("permission"); }) } });
    await expect(copyCommunicationNoteRecord(async () => { throw new CommunicationNoteExportError("AUTH_REQUIRED"); }, new AbortController().signal)).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });
  it("does not send a late prepared copy after access abort", async () => {
    const controller = new AbortController();
    await expect(copyCommunicationNoteRecord(async () => { controller.abort(); return artifact(); }, controller.signal)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });
  it("creates an exact UTF-8 TXT and releases its local URL after bounded lifetime", async () => {
    vi.useRealTimers();
    const dispose = downloadCommunicationNoteRecord(artifact(), new AbortController().signal);
    expect(clicked).toEqual([{ href: "blob:owned-test", filename: artifact().filename }]);
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    expect(blob.type).toBe("text/plain;charset=utf-8");
    const read = new FileReader(); const text = new Promise(r => { read.onload = () => r(read.result); }); read.readAsText(blob);
    expect(await text).toBe(artifact().text);
    dispose(); expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:owned-test");
    expect(document.querySelector('a[download]')).toBeNull();
  });
  it("revokes download URLs at sixty seconds even without a page transition", () => {
    downloadCommunicationNoteRecord(artifact(), new AbortController().signal);
    vi.advanceTimersByTime(59_999); expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
  it("cleans up exactly once on access loss and does not create an aborted download", () => {
    const controller = new AbortController(), dispose = downloadCommunicationNoteRecord(artifact(), controller.signal);
    controller.abort(); dispose(); vi.runAllTimers(); expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(() => downloadCommunicationNoteRecord(artifact(), controller.signal)).toThrow("UNAVAILABLE"); expect(clicked).toHaveLength(1);
  });
  it("cleans up a failed click without a successful-download claim", () => {
    vi.mocked(HTMLAnchorElement.prototype.click).mockImplementation(() => { throw new Error("private browser detail"); });
    expect(() => downloadCommunicationNoteRecord(artifact(), new AbortController().signal)).toThrow("DOWNLOAD_FAILED");
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1); expect(document.querySelector('a[download]')).toBeNull();
  });
});
