import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCommunicationNotePdfFont, PDF_FONTS } from "./communication-note-export-pdf-fonts";

afterEach(() => vi.unstubAllGlobals());
describe("fixed PDF font asset boundary", () => {
  it.each(["text", "emoji"] as const)("loads and verifies only the pinned %s public asset", async name => {
    const bytes = await readFile(new URL(`../../public${PDF_FONTS[name].path}`, import.meta.url));
    const fetch = vi.fn(async () => new Response(bytes)); vi.stubGlobal("fetch", fetch);
    const signal = new AbortController().signal;
    expect(Buffer.from(await loadCommunicationNotePdfFont(name, signal)).equals(bytes)).toBe(true);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(PDF_FONTS[name].path, { signal, credentials: "omit", referrerPolicy: "no-referrer", redirect: "error", cache: "force-cache" });
  });
  it.each(["http", "redirect", "size", "digest"])("rejects %s failure without a font fallback or leaking details", async mode => {
    const bytes = new Uint8Array(mode === "digest" ? PDF_FONTS.text.size : 2);
    const response = new Response(bytes, { status: mode === "http" ? 404 : 200 });
    if (mode === "redirect") Object.defineProperty(response, "redirected", { value: true });
    const fetch = vi.fn(async () => response); vi.stubGlobal("fetch", fetch);
    await expect(loadCommunicationNotePdfFont("text", new AbortController().signal)).rejects.toThrow(/^DOWNLOAD_FAILED$/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("refuses an aborted request before fetching", async () => {
    const fetch = vi.fn(), controller = new AbortController(); controller.abort(); vi.stubGlobal("fetch", fetch);
    await expect(loadCommunicationNotePdfFont("text", controller.signal)).rejects.toThrow("UNAVAILABLE"); expect(fetch).not.toHaveBeenCalled();
  });
});
