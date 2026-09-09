import { PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";
import { communicationNotePdfFontkit } from "./communication-note-export-pdf-fontkit";
import { assertExportActive, COMMUNICATION_NOTE_TEXT_TEMPLATE, CommunicationNoteExportError, type CommunicationNoteTextExport } from "./communication-note-export";
import { loadCommunicationNotePdfFont, type PdfFontLoader } from "./communication-note-export-pdf-fonts";

export const COMMUNICATION_NOTE_PDF_MIME = "application/pdf";
const PAGE = { width: 612, height: 792, left: 72, right: 540, top: 712, bottom: 72, header: 752 };
type Glyph = { text: string; font: PDFFont; width: number };

/** Local selectable-text PDF of the same minimal Record copy as TXT/DOCX.
 * Fonts are subset-embedded; no screenshots, HTML, attachments or active links. */
export async function renderCommunicationNotePdf(
  record: CommunicationNoteTextExport, signal: AbortSignal, loadFont: PdfFontLoader = loadCommunicationNotePdfFont,
) {
  assertExportActive(signal);
  if (record.profile !== "RECORD_COPY" || record.templateVersion !== COMMUNICATION_NOTE_TEXT_TEMPLATE ||
      !/^communication-note_\d{4}-\d{2}-\d{2}_[a-f0-9]{8}_v[1-9]\d*\.txt$/.test(record.filename) ||
      new TextEncoder().encode(record.text).length > 66 * 1024) throw new CommunicationNoteExportError("UNAVAILABLE");
  try {
    const pdf = await PDFDocument.create(); pdf.registerFontkit(communicationNotePdfFontkit);
    pdf.setTitle("Communication Note"); pdf.setAuthor(""); pdf.setCreator("CaresLink AI"); pdf.setProducer("CaresLink AI");
    pdf.setSubject("Draft – review required"); pdf.setLanguage("en-AU");
    pdf.setKeywords([record.templateVersion, record.profile]);
    const options = { subset: true, features: { liga: false, clig: false, kern: false } };
    const textFont = await pdf.embedFont(await loadFont("text", signal), options);
    assertExportActive(signal);
    const textSet = new Set(textFont.getCharacterSet());
    let emojiFont: PDFFont | undefined, emojiSet = new Set<number>();
    const characters = [...record.text].filter(char => !["\n", "\r", "\t"].includes(char));
    if (characters.some(char => !textSet.has(char.codePointAt(0)!))) {
      emojiFont = await pdf.embedFont(await loadFont("emoji", signal), options);
      emojiSet = new Set(emojiFont.getCharacterSet());
      assertExportActive(signal);
    }
    const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
    const cache = new Map<string, Glyph>();
    const glyph = (text: string, size: number): Glyph => {
      const key = `${size}:${text}`, known = cache.get(key); if (known) return known;
      const points = [...text].map(char => char.codePointAt(0)!);
      const font = text === "\t" || points.every(cp => textSet.has(cp)) ? textFont
        : emojiFont && points.every(cp => emojiSet.has(cp)) ? emojiFont : undefined;
      if (!font) throw new CommunicationNoteExportError("PDF_UNSUPPORTED_TEXT");
      const result = { text, font, width: text === "\t" ? 0 : font.widthOfTextAtSize(text, size) };
      cache.set(key, result); return result;
    };
    let page: PDFPage, y = PAGE.top;
    const nextPage = () => {
      if (pdf.getPageCount() >= 200) throw new CommunicationNoteExportError("PDF_TOO_LARGE");
      page = pdf.addPage([PAGE.width, PAGE.height]); y = PAGE.top;
      page.drawText("Draft – review required", { x: PAGE.left, y: PAGE.header, font: textFont, size: 9 });
    };
    nextPage();
    const drawLine = (items: Glyph[], size: number) => {
      if (y < PAGE.bottom) nextPage();
      let x = PAGE.left, run = "", runFont = textFont;
      const flush = () => {
        if (!run) return;
        page.drawText(run, { x, y, font: runFont, size }); x += runFont.widthOfTextAtSize(run, size); run = "";
      };
      for (const item of items) {
        if (item.text === "\t") { flush(); x = PAGE.left + (Math.floor((x - PAGE.left) / 36) + 1) * 36; }
        else { if (item.font !== runFont) flush(); runFont = item.font; run += item.text; }
      }
      flush(); y -= size === 18 ? 29 : 16;
    };
    // Do not drop whitespace or rewrite words while wrapping. Overlong words
    // wrap at grapheme boundaries; tabs advance to half-inch stops.
    const lines = record.text.split(/\r\n|\r|\n/);
    for (let index = 0; index < lines.length; index++) {
      assertExportActive(signal);
      const size = index === 1 ? 18 : 11;
      let row: Glyph[] = [], width = 0;
      const advance = (item: Glyph, at: number) => item.text === "\t" ? 36 - (at % 36) : item.width;
      for (const token of lines[index].split(/([ \t]+)/u).filter(Boolean)) {
        const items = [...segmenter.segment(token)].map(part => glyph(part.segment, size));
        const tokenWidth = items.reduce((n, item) => n + advance(item, n), 0);
        if (row.length && tokenWidth <= PAGE.right - PAGE.left && width + tokenWidth > PAGE.right - PAGE.left) {
          drawLine(row, size); row = []; width = 0;
        }
        for (const item of items) {
          let step = advance(item, width);
          if (row.length && width + step > PAGE.right - PAGE.left) { drawLine(row, size); row = []; width = 0; step = advance(item, 0); }
          row.push(item); width += step;
        }
      }
      drawLine(row, size);
      // Yield between paragraphs so a focus/unmount/access abort can be observed.
      if (index % 16 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    assertExportActive(signal);
    const bytes = await pdf.save(); assertExportActive(signal);
    return { bytes, filename: record.filename.replace(/\.txt$/, ".pdf"), mimeType: COMMUNICATION_NOTE_PDF_MIME };
  } catch (error) {
    if (error instanceof CommunicationNoteExportError) throw error;
    throw new CommunicationNoteExportError("DOWNLOAD_FAILED");
  }
}
