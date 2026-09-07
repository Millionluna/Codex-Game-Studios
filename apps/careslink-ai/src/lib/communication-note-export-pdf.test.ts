import { readFile } from "node:fs/promises";
import { PDFDocument, PDFPage } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderCommunicationNotePdf } from "./communication-note-export-pdf";
import { PDF_FONTS, type PdfFontLoader } from "./communication-note-export-pdf-fonts";
import { renderCommunicationNoteRecordCopy } from "./communication-note-export";
import { exportDocument, EXPORT_NOW } from "./communication-note-export-test-fixture";

const load: PdfFontLoader = async name => new Uint8Array(await readFile(new URL(`../../public${PDF_FONTS[name].path}`, import.meta.url)));
function record(text?: string) {
  const saved = exportDocument(); if (text !== undefined) saved.revision.content.englishDraft = text;
  return renderCommunicationNoteRecordCopy(saved, EXPORT_NOW);
}
afterEach(() => vi.restoreAllMocks());

describe("Communication Note selectable PDF", () => {
  it.each([
    "Synthetic record. The agreed information was recorded.",
    "  café e\u0301 中文 繁體字 😀 & < >\tTabbed\r\nNext line.  ",
    Array.from({ length: 30 }, (_, n) => `Record ${n + 1}. The worker recorded the agreed information after the telephone call. The source wording was checked.`).join("\n\n"),
    "longword".repeat(500),
  ])("retains full shared text/order, wraps within margins and keeps draft notice on every page", async source => {
    const draw = vi.spyOn(PDFPage.prototype, "drawText"), input = record(source);
    const result = await renderCommunicationNotePdf(input, new AbortController().signal, load);
    expect(result.filename).toBe(input.filename.replace(/\.txt$/, ".pdf")); expect(result.mimeType).toBe("application/pdf");
    expect(new TextDecoder().decode(result.bytes.slice(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(result.bytes, { updateMetadata: false }), body: string[] = [];
    let headers = 0;
    for (const [text, opts] of draw.mock.calls) {
      if (opts?.y === 752) { headers++; expect(text).toBe("Draft – review required"); continue; }
      body.push(text); expect(opts?.y).toBeGreaterThanOrEqual(72); expect(opts?.y).toBeLessThanOrEqual(712);
      expect(opts?.x).toBeGreaterThanOrEqual(72);
      expect(opts!.x! + opts!.font!.widthOfTextAtSize(text, opts!.size!)).toBeLessThanOrEqual(540.01);
    }
    expect(body.join("").replace(/\s/g, "")).toBe(input.text.replace(/\s/g, ""));
    expect(headers).toBe(pdf.getPageCount()); expect(pdf.getAuthor()).toBe("");
    const structure = pdf.context.enumerateIndirectObjects().map(([, o]) => o.toString()).join("\n");
    expect(/\/OpenAction|\/JavaScript|\/AcroForm|\/EmbeddedFiles|\/Launch|\/URI|PRIVATE_|factsSummary|contentHash/.test(structure)).toBe(false);
    expect(pdf.getPages().every(page => !page.node.Annots()?.size())).toBe(true);
    expect(structure).toMatch(/\/FontFile[23]/); expect(structure).toContain("/ToUnicode");
    expect(pdf.getKeywords()).toContain(input.templateVersion);
  });
  it("does not request the emoji font for plain English", async () => {
    const loader = vi.fn(load); await renderCommunicationNotePdf(record("Plain English."), new AbortController().signal, loader);
    expect(loader.mock.calls.map(([name]) => name)).toEqual(["text"]);
  });
  it("refuses an unsupported character instead of producing a missing glyph", async () => {
    await expect(renderCommunicationNotePdf(record("Unknown character: \u0378"), new AbortController().signal, load)).rejects.toThrow("PDF_UNSUPPORTED_TEXT");
  });
  it("bounds a newline-heavy record to 200 pages without returning a partial file", async () => {
    await expect(renderCommunicationNotePdf(record("x\n".repeat(9000)), new AbortController().signal, load)).rejects.toThrow("PDF_TOO_LARGE");
  });
  it("does not load fonts for aborted, oversized or unsafe input", async () => {
    const loader = vi.fn(load), aborted = new AbortController(); aborted.abort();
    await expect(renderCommunicationNotePdf(record(), aborted.signal, loader)).rejects.toThrow("UNAVAILABLE");
    for (const input of [{ ...record(), filename: "../../note.pdf" }, { ...record(), text: "x".repeat(70 * 1024) }]) {
      await expect(renderCommunicationNotePdf(input, new AbortController().signal, loader)).rejects.toThrow("UNAVAILABLE");
    }
    expect(loader).not.toHaveBeenCalled();
  });
  it("observes access loss during font loading and paragraph rendering", async () => {
    const first = new AbortController();
    await expect(renderCommunicationNotePdf(record(), first.signal, async (name, signal) => { const bytes = await load(name, signal); first.abort(); return bytes; })).rejects.toThrow("UNAVAILABLE");
    const second = new AbortController(), original = PDFPage.prototype.drawText;
    vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, ...args) { second.abort(); return original.apply(this, args); });
    await expect(renderCommunicationNotePdf(record(), second.signal, load)).rejects.toThrow("UNAVAILABLE");
  });
  it("sanitizes font and serialization failures", async () => {
    await expect(renderCommunicationNotePdf(record(), new AbortController().signal, async () => { throw new Error("private font detail"); })).rejects.toThrow(/^DOWNLOAD_FAILED$/);
    vi.spyOn(PDFDocument.prototype, "save").mockRejectedValueOnce(new Error("private serializer detail"));
    await expect(renderCommunicationNotePdf(record("Plain."), new AbortController().signal, load)).rejects.toThrow(/^DOWNLOAD_FAILED$/);
  });
});
