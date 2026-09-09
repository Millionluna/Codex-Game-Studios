import { describe, expect, it } from "vitest";

import {
  formatCommunicationNoteGenerationJobDate,
  getCommunicationNoteGenerationJobCopy,
  resolveCommunicationNoteGenerationJobLocale,
} from "./communication-note-generation-job-i18n";

describe("Communication Note generation job i18n", () => {
  it.each([
    ["en", "Generation is queued", "Open saved draft"],
    ["zh-Hans", "生成任务已排队", "打开已保存草稿"],
    ["zh-Hant", "產生任務已排隊", "開啟已儲存草稿"],
  ] as const)("provides explicit %s job status copy", (locale, queued, action) => {
    const copy = getCommunicationNoteGenerationJobCopy(locale);

    expect(copy.statuses.QUEUED.title).toBe(queued);
    expect(copy.openSavedDraft).toBe(action);
    expect(copy.statuses.RUNNING.detail).not.toMatch(/\d+%|ETA/i);
  });

  it("falls back explicitly to English for an unsupported locale", () => {
    expect(resolveCommunicationNoteGenerationJobLocale("zh-TW")).toEqual({
      locale: "en",
      unsupported: true,
    });
    expect(resolveCommunicationNoteGenerationJobLocale(["zh-Hant", "en"]))
      .toEqual({ locale: "zh-Hant", unsupported: false });
  });

  it("formats server timestamps in the fixed Melbourne timezone", () => {
    expect(
      formatCommunicationNoteGenerationJobDate(
        "2026-09-07T01:00:00.000Z",
        "en",
      ),
    ).toContain("11:00");
  });
});
