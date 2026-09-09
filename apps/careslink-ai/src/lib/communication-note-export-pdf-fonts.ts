import { assertExportActive, CommunicationNoteExportError } from "./communication-note-export";

export const PDF_FONTS = {
  text: { path: "/export-fonts/noto-sans-sc-regular.fc0fda93.otf", size: 8331336, sha256: "faa6c9df652116dde789d351359f3d7e5d2285a2b2a1f04a2d7244df706d5ea9" },
  emoji: { path: "/export-fonts/noto-emoji-variable.c2c26ab6.ttf", size: 1982596, sha256: "de6c18832938afc99caf132b39d6a30a19bac7f2e812e28db2535b4608d27551" },
} as const;
export type PdfFontName = keyof typeof PDF_FONTS;
export type PdfFontLoader = (name: PdfFontName, signal: AbortSignal) => Promise<Uint8Array>;

/** Fixed public same-origin assets only. No private text in URLs, credentials,
 * query strings, referrers or persistent application caches. */
export const loadCommunicationNotePdfFont: PdfFontLoader = async (name, signal) => {
  assertExportActive(signal);
  const asset = PDF_FONTS[name];
  try {
    const response = await fetch(asset.path, {
      signal, credentials: "omit", referrerPolicy: "no-referrer", redirect: "error", cache: "force-cache",
    });
    if (!response.ok || response.redirected) throw new Error("font unavailable");
    const bytes = new Uint8Array(await response.arrayBuffer());
    assertExportActive(signal);
    if (bytes.byteLength !== asset.size) throw new Error("font size");
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hex = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, "0")).join("");
    if (hex !== asset.sha256) throw new Error("font integrity");
    assertExportActive(signal); return bytes;
  } catch (error) {
    if (error instanceof CommunicationNoteExportError) throw error;
    throw new CommunicationNoteExportError("DOWNLOAD_FAILED");
  }
};
