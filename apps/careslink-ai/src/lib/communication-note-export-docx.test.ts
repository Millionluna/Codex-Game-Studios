// @vitest-environment jsdom
import { inflateRawSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { Packer } from "docx";
import { renderCommunicationNoteDocx, COMMUNICATION_NOTE_DOCX_MIME } from "./communication-note-export-docx";
import { renderCommunicationNoteRecordCopy } from "./communication-note-export";
import { exportDocument, EXPORT_NOW } from "./communication-note-export-test-fixture";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const artifact = (text?: string) => {
  const saved = exportDocument();
  if (text !== undefined) saved.revision.content.englishDraft = text;
  return renderCommunicationNoteRecordCopy(saved, EXPORT_NOW);
};
// Independent ZIP/DEFLATE reader, not the writer's ZIP implementation.
function parts(bytes: ArrayBuffer) {
  const zip = Buffer.from(bytes), result = new Map<string, string>();
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    expect(zip.readUInt16LE(offset + 6) & 8).toBe(0);
    const method = zip.readUInt16LE(offset + 8), size = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26), extraLength = zip.readUInt16LE(offset + 28);
    const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const start = offset + 30 + nameLength + extraLength, compressed = zip.subarray(start, start + size);
    expect([0, 8]).toContain(method);
    const data = method === 8 ? inflateRawSync(compressed) : compressed;
    expect(data.length).toBe(zip.readUInt32LE(offset + 22));
    if (!name.endsWith("/")) result.set(name, data.toString("utf8"));
    offset = start + size;
  }
  expect(zip.readUInt32LE(offset)).toBe(0x02014b50);
  return result;
}
function xml(value: string) {
  const doc = new DOMParser().parseFromString(value, "application/xml");
  expect(doc.getElementsByTagName("parsererror")).toHaveLength(0); return doc;
}
function textOf(doc: XMLDocument) {
  return [...doc.getElementsByTagNameNS(W, "body")[0].children].filter(p => p.localName === "p").map(p =>
    [...p.getElementsByTagNameNS(W, "r")].map(r => [...r.children].map(n => n.localName === "tab" ? "\t" : n.localName === "t" ? n.textContent : "").join("")).join("")
  ).join("\n");
}

describe("shared Communication Note DOCX", () => {
  it.each([
    undefined,
    '  Spaces & ampersands; 2 < 3 > 1; "quotes".\tTab\tend.\r\nCafé 中文 😀.\rNext line.\n\nFinal.  ',
    Array.from({ length: 75 }, (_, n) => `Record line ${n + 1}. The information was checked and recorded.`).join("\n\n"),
    "Longword".repeat(8000),
  ])("preserves the exact shared profile and line order without rewriting the note", async draft => {
    const record = artifact(draft), result = await renderCommunicationNoteDocx(record), entries = parts(result.bytes);
    expect(result.filename).toBe(record.filename.replace(/\.txt$/, ".docx"));
    expect(result.mimeType).toBe(COMMUNICATION_NOTE_DOCX_MIME);
    for (const [name, contents] of entries) if (name.endsWith(".xml") || name.endsWith(".rels")) xml(contents);
    expect(textOf(xml(entries.get("word/document.xml")!))).toBe(record.text.replace(/\r\n|\r/g, "\n"));
    const all = [...entries.values()].join("\n");
    expect(all).not.toMatch(/PRIVATE_|factsSummary|privacyFindings|missingPrompts|contentHash|TargetMode="External"|w:hyperlink|w:fldChar|w:instrText|w:altChunk|w:vanish/);
    expect(all).not.toContain("20000000-0000-4000-8000-000000000001");
    expect([...entries.keys()].some(name => /vba|media\/|embeddings\/|customXml\//i.test(name))).toBe(false);
    expect(entries.get("docProps/core.xml")).not.toMatch(/dc:creator|cp:lastModifiedBy|Un-named/);
    expect(entries.get("docProps/custom.xml")).toContain(record.templateVersion);
    expect(entries.get("docProps/custom.xml")).toContain("RECORD_COPY");
    const header = xml(entries.get("word/header1.xml")!);
    expect(header.documentElement.textContent).toBe("Draft – review required");
    const document = xml(entries.get("word/document.xml")!);
    expect(document.getElementsByTagNameNS(W, "pgSz")[0].getAttributeNS(W, "w")).toBe("12240");
    const styles = xml(entries.get("word/styles.xml")!);
    const title = [...styles.getElementsByTagNameNS(W, "style")].find(s => s.getAttributeNS(W, "styleId") === "Title")!;
    expect(title.getElementsByTagNameNS(W, "color")[0].getAttributeNS(W, "val")).toBe("000000");
    expect(title.getElementsByTagNameNS(W, "pBdr")).toHaveLength(0);
  });
  it.each(["\ud800", "\udfff", "\ufffe", "\uffff", "\u0000"])("refuses XML-invalid source in every format and when called directly", async invalid => {
    expect(() => artifact(`Draft ${invalid}`)).toThrow("PLAIN_TEXT_REQUIRED");
    await expect(renderCommunicationNoteDocx({ ...artifact(), text: `Draft ${invalid}` })).rejects.toThrow("PLAIN_TEXT_REQUIRED");
  });
  it("rejects unknown profiles/templates and unsafe filenames", async () => {
    const record = artifact();
    for (const changed of [{ filename: "participant-name.docx" }, { filename: "../../record.txt" }, { profile: "PRIVATE" }, { templateVersion: "unknown" }]) {
      await expect(renderCommunicationNoteDocx({ ...record, ...changed } as typeof record)).rejects.toThrow("UNAVAILABLE");
    }
  });
  it("sanitizes packer failures, with no fallback artifact", async () => {
    const pack = vi.spyOn(Packer, "toArrayBuffer").mockRejectedValueOnce(new Error("private details"));
    try { await expect(renderCommunicationNoteDocx(artifact())).rejects.toThrow(/^DOWNLOAD_FAILED$/); }
    finally { pack.mockRestore(); }
  });
});
