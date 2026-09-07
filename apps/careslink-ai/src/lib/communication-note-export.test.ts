import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { EXPORT_DOC, EXPORT_REV, EXPORT_NOW, exportDocument } from "./communication-note-export-test-fixture";
import { getCommunicationNoteExportCopy } from "./communication-note-export-i18n";
import { COMMUNICATION_NOTE_TEXT_TEMPLATE, prepareCommunicationNoteRecordCopy, renderCommunicationNoteRecordCopy } from "./communication-note-export";

describe("Communication Note Record copy renderer", () => {
  it("renders a fixed minimal profile with exact saved wording, version, times and draft boundary", () => {
    const saved = exportDocument(), result = renderCommunicationNoteRecordCopy(saved, EXPORT_NOW);
    expect(result).toEqual({ templateVersion: COMMUNICATION_NOTE_TEXT_TEMPLATE, profile: "RECORD_COPY",
      filename: "communication-note_2026-09-08_10000000_v3.txt",
      text: "CaresLink AI\nCommunication Note\nDraft – review required\nVersion: 3\nRevision saved (UTC): 2026-09-08T02:03:04.000Z\nExported (device time, UTC): 2026-09-08T02:03:04.000Z\nLanguage: English\nSelf-review: confirmed by the document owner. This is not approval by CaresLink.\n\nSynthetic record. The agreed information was recorded.\nUnicode: café 中文 😀.\n\nStatic copy: changes to this copy do not sync to CaresLink. External copies cannot be recalled.\nCheck this draft before using it in your organisation's authorised record system.\n",
    });
    expect(result.text).not.toMatch(/PRIVATE_|factsSummary|contentHash|point|model|privacy|10000000|20000000/);
    expect(Object.isFrozen(result)).toBe(true);
  });
  it("never derives filenames from participant text or an arbitrary title", () => {
    const saved = exportDocument(); saved.revision.content.englishDraft = "Synthetic person / : ? * ../ CON";
    const result = renderCommunicationNoteRecordCopy(saved, EXPORT_NOW);
    expect(result.filename).toMatch(/^communication-note_\d{4}-\d{2}-\d{2}_[a-f0-9]{8}_v\d+\.txt$/);
    expect(result.filename).not.toContain("Synthetic");
  });
  it.each(["REQUIRED", "UNKNOWN"])("does not treat %s as self-review confirmation", status => {
    const saved = exportDocument(); Object.assign(saved, { selfReviewStatus: status });
    expect(() => renderCommunicationNoteRecordCopy(saved, EXPORT_NOW)).toThrow("REVIEW_REQUIRED");
  });
  it("does not borrow review from another revision", () => {
    const saved = exportDocument(); Object.assign(saved, { isCurrentRevision: false, selfReviewStatus: "UNKNOWN" });
    expect(() => renderCommunicationNoteRecordCopy(saved, EXPORT_NOW)).toThrow("STALE_REVISION");
  });
  it.each(["", " ", "bad\u0000text", "bad\u202etext", "x".repeat(65537), "# Heading", "**bold**", "__bold__", "```code```", "`code`", "*emphasis*", "_emphasis_", "~~strike~~", "[link](https://example.test)", "<script>private</script>"])("refuses unsupported or unsafe plain text %# without silently changing it", text => {
    const saved = exportDocument(); saved.revision.content.englishDraft = text;
    expect(() => renderCommunicationNoteRecordCopy(saved, EXPORT_NOW)).toThrow("PLAIN_TEXT_REQUIRED");
    expect(saved.revision.content.englishDraft).toBe(text);
  });
  it.each(["../unsafe", "2026-09-08", "not-a-date", "2026-99-99T00:00:00Z"])("rejects invalid export times %#", now => {
    expect(() => renderCommunicationNoteRecordCopy(exportDocument(), now)).toThrow("UNAVAILABLE");
  });
  it.each([0, -1, 1.5, 2147483648])( "rejects invalid version %s", version => {
    const saved = exportDocument(); Object.assign(saved.revision, { revisionNumber: version });
    expect(() => renderCommunicationNoteRecordCopy(saved, EXPORT_NOW)).toThrow("UNAVAILABLE");
  });
  it.each(["en", "zh-Hans", "zh-Hant"] as const)("has explicit UI copy for %s but one English record profile", locale => {
    const copy = getCommunicationNoteExportCopy(locale);
    expect(Object.keys(copy)).toEqual(Object.keys(getCommunicationNoteExportCopy("en")));
    expect(copy.version(3)).toContain("3"); expect(Object.values(copy).every(Boolean)).toBe(true);
    const saved = exportDocument(); Object.assign(saved, { sourceLocale: locale });
    expect(renderCommunicationNoteRecordCopy(saved, EXPORT_NOW).text).toContain("Language: English");
  });
});

describe("fresh revision authorization for each export", () => {
  it("reads the exact saved version once for every action without mutation", async () => {
    const saved = exportDocument(), before = structuredClone(saved), load = vi.fn(async () => saved), signal = new AbortController().signal;
    const args = { saved, signal, load, now: () => EXPORT_NOW };
    expect(await prepareCommunicationNoteRecordCopy(args)).toEqual(renderCommunicationNoteRecordCopy(saved, EXPORT_NOW));
    await prepareCommunicationNoteRecordCopy(args);
    expect(load).toHaveBeenCalledTimes(2); expect(load).toHaveBeenLastCalledWith({ canonicalId: EXPORT_DOC, revisionId: EXPORT_REV, signal });
    expect(saved).toEqual(before);
  });
  it.each(["AUTH_REQUIRED", "NOT_FOUND", "UNAVAILABLE"] as const)("propagates only sanitized %s", async status => {
    const load = vi.fn(async () => ({ status }));
    await expect(prepareCommunicationNoteRecordCopy({ saved: exportDocument(), signal: new AbortController().signal, load })).rejects.toMatchObject({ code: status });
  });
  it.each(["canonicalId", "revisionId", "revisionNumber", "contentHash", "englishDraft"])("rejects misbound %s with no stale fallback", async field => {
    const saved = exportDocument(), fresh = exportDocument();
    if (field === "canonicalId") Object.assign(fresh, { canonicalId: EXPORT_REV });
    else if (field === "englishDraft") fresh.revision.content.englishDraft = "Different text";
    else Object.assign(fresh.revision, { [field]: field === "revisionNumber" ? 4 : "changed" });
    await expect(prepareCommunicationNoteRecordCopy({ saved, signal: new AbortController().signal, load: async () => fresh })).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });
  it.each(["stale", "review-reset"])("rejects a fresh %s result", async kind => {
    const fresh = exportDocument(); Object.assign(fresh, kind === "stale" ? { isCurrentRevision: false, selfReviewStatus: "UNKNOWN" } : { selfReviewStatus: "REQUIRED" });
    await expect(prepareCommunicationNoteRecordCopy({ saved: exportDocument(), signal: new AbortController().signal, load: async () => fresh })).rejects.toMatchObject({ code: kind === "stale" ? "STALE_REVISION" : "REVIEW_REQUIRED" });
  });
  it("drops aborted or late reads and never surfaces backend details", async () => {
    const controller = new AbortController(), saved = exportDocument(), load = vi.fn(async () => { controller.abort(); return saved; });
    await expect(prepareCommunicationNoteRecordCopy({ saved, signal: controller.signal, load })).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await expect(prepareCommunicationNoteRecordCopy({ saved, signal: controller.signal, load })).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(load).toHaveBeenCalledTimes(1);
    await expect(prepareCommunicationNoteRecordCopy({ saved, signal: new AbortController().signal, load: async () => { throw new Error("private backend detail"); } })).rejects.toThrow(/^UNAVAILABLE$/);
  });
  it("does not persist bytes or call write/AI/Points/legacy telemetry endpoints", () => {
    for (const file of ["./communication-note-export.ts", "./communication-note-export-browser.ts"]) {
      const code = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(code).not.toMatch(/localStorage|sessionStorage|indexedDB|sendBeacon|console\.|recordGeneratedDraftCopyEvent|clipboard\.read|execCommand/);
    }
  });
});
