import { Document, Header, HeadingLevel, Packer, Paragraph, Tab, TextRun } from "docx";
import { COMMUNICATION_NOTE_TEXT_TEMPLATE, CommunicationNoteExportError, type CommunicationNoteTextExport } from "./communication-note-export";

export const COMMUNICATION_NOTE_DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** A presentation of the shared, freshly authorized Record copy, not a second
 * content selector. No HTML/Markdown parsing, links, images, fields or metadata
 * from the private document. Imported only after a user requests DOCX. */
export async function renderCommunicationNoteDocx(record: CommunicationNoteTextExport) {
  if (record.profile !== "RECORD_COPY" || record.templateVersion !== COMMUNICATION_NOTE_TEXT_TEMPLATE ||
      !/^communication-note_\d{4}-\d{2}-\d{2}_[a-f0-9]{8}_v[1-9]\d*\.txt$/.test(record.filename)) {
    throw new CommunicationNoteExportError("UNAVAILABLE");
  }
  // Reject XML-invalid source, never silently replace saved characters.
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ud800-\udfff\ufffe\uffff]/u.test(record.text)) {
    throw new CommunicationNoteExportError("PLAIN_TEXT_REQUIRED");
  }
  try {
    // All formats retain identical field order and wording. Word paragraphs
    // represent LF/CRLF/CR line endings; tabs are native tab runs, not spaces.
    const children = record.text.split(/\r\n|\r|\n/).map((line, index) => new Paragraph({
      ...(index === 1 ? { heading: HeadingLevel.TITLE } : {}),
      spacing: { before: 0, after: index === 1 ? 160 : 0, line: 276 },
      keepNext: index < 8, widowControl: true,
      children: [new TextRun({
        children: line.split("\t").flatMap((part, n) => n === 0 ? [part] : [new Tab(), part]),
        ...(index === 2 ? { bold: true } : {}),
      })],
    }));
    const document = new Document({
      title: "Communication Note", creator: "", lastModifiedBy: "", description: "", subject: "", keywords: "",
      // Identifies the export contract, never a model/prompt or provider identity.
      customProperties: [
        { name: "CaresLinkExportTemplate", value: record.templateVersion },
        { name: "CaresLinkExportProfile", value: record.profile },
      ],
      styles: { default: {
        document: { run: { font: "Arial", size: 22, color: "000000", language: { value: "en-AU" } } },
        title: { run: { font: "Arial", size: 36, color: "000000", bold: true }, paragraph: { keepNext: true } },
      } },
      sections: [{
        properties: { page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, bottom: 1440, left: 1440, right: 1440, header: 720, footer: 720, gutter: 0 },
        } },
        // This safety notice remains visible when the record spans pages.
        headers: { default: new Header({ children: [new Paragraph({
          children: [new TextRun({ text: "Draft – review required", size: 18, color: "000000" })],
        })] }) },
        children,
      }],
    });
    const bytes = await Packer.toArrayBuffer(document);
    return { bytes, filename: record.filename.replace(/\.txt$/, ".docx"), mimeType: COMMUNICATION_NOTE_DOCX_MIME };
  } catch {
    throw new CommunicationNoteExportError("DOWNLOAD_FAILED");
  }
}
