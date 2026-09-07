import { assertExportActive, CommunicationNoteExportError, type CommunicationNoteTextExport } from "./communication-note-export";

/** Called synchronously inside the click. Promise-backed ClipboardItem preserves
 * WebKit's user activation while the exact revision is reauthorized. No reads. */
export async function copyCommunicationNoteRecord(
  prepare: () => Promise<CommunicationNoteTextExport>, signal: AbortSignal,
) {
  assertExportActive(signal);
  const clipboard = globalThis.navigator?.clipboard;
  if (!clipboard || (!clipboard.write && !clipboard.writeText)) throw new CommunicationNoteExportError("COPY_FAILED");
  let prepared: Promise<CommunicationNoteTextExport> | undefined;
  try {
    prepared = prepare();
    if (clipboard.write && typeof ClipboardItem !== "undefined") {
      const bytes = prepared.then(artifact => {
        assertExportActive(signal); return new Blob([artifact.text], { type: "text/plain" });
      });
      // A denied write can reject before the prepared data settles.
      void bytes.catch(() => {});
      await clipboard.write([new ClipboardItem({ "text/plain": bytes })]);
    } else {
      const artifact = await prepared;
      assertExportActive(signal);
      await clipboard.writeText(artifact.text);
    }
    assertExportActive(signal);
  } catch (error) {
    // Prefer the sanitized auth/version failure over a browser permission error.
    if (prepared) await prepared;
    if (error instanceof CommunicationNoteExportError) throw error;
    throw new CommunicationNoteExportError("COPY_FAILED");
  }
}

/** Local, short-lived Blob URL only. "Started" is not a saved-file receipt. */
export function downloadCommunicationNoteRecord(artifact: CommunicationNoteTextExport, signal: AbortSignal) {
  return downloadRecordBlob(new Blob([artifact.text], { type: "text/plain;charset=utf-8" }), artifact.filename, signal);
}

export async function downloadCommunicationNoteDocx(artifact: CommunicationNoteTextExport, signal: AbortSignal) {
  assertExportActive(signal);
  try {
    const { renderCommunicationNoteDocx } = await import("./communication-note-export-docx");
    assertExportActive(signal);
    const docx = await renderCommunicationNoteDocx(artifact);
    assertExportActive(signal);
    return downloadRecordBlob(new Blob([docx.bytes], { type: docx.mimeType }), docx.filename, signal);
  } catch (error) {
    if (error instanceof CommunicationNoteExportError) throw error;
    throw new CommunicationNoteExportError("DOWNLOAD_FAILED");
  }
}

function downloadRecordBlob(blob: Blob, filename: string, signal: AbortSignal) {
  assertExportActive(signal);
  let url: string | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  const anchor = document.createElement("a");
  const dispose = () => {
    if (timer !== undefined) clearTimeout(timer);
    if (url !== undefined) { URL.revokeObjectURL(url); url = undefined; }
    anchor.remove(); signal.removeEventListener("abort", dispose);
  };
  try {
    url = URL.createObjectURL(blob);
    anchor.href = url; anchor.download = filename; anchor.hidden = true;
    document.body.append(anchor); signal.addEventListener("abort", dispose, { once: true });
    assertExportActive(signal); anchor.click(); anchor.remove();
    timer = setTimeout(dispose, 60_000);
    return dispose;
  } catch {
    dispose(); throw new CommunicationNoteExportError("DOWNLOAD_FAILED");
  }
}
