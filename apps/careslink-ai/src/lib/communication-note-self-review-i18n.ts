import type { CommunicationNoteDocumentLocale } from "./communication-note-document-i18n";

const copy = {
  en: {
    legend: "Confirm your self-review", version: (version: number) => `This confirmation applies only to version ${version}.`,
    facts: "I checked the draft against the confirmed facts.",
    wording: "I checked the wording and its meaning, including any review translation I used.",
    missing: "I reviewed missing facts and follow-up prompts; I have not invented information.",
    submit: "Confirm my self-review", submitting: "Saving confirmation…",
    boundary: "This records your own review, not professional approval. The document remains a draft.",
    UNAVAILABLE: "The save result is not confirmed. Reload to check before retrying. Do not assume your review was saved.",
    INVALID_REQUEST: "Complete all three confirmations for this version before submitting.",
    STALE_REVISION: "The version has changed. Open the current version and review it again.",
    reload: "Reload to check", current: "Open current version",
  },
  "zh-Hans": {
    legend: "确认人工复核", version: (version: number) => `此确认仅适用于版本 ${version}。`,
    facts: "我已根据确认的事实核对草稿。",
    wording: "我已检查措辞及含义，包括我使用的复核译文。",
    missing: "我已检查缺失事实及后续提示，没有补写未经确认的信息。",
    submit: "确认已人工复核", submitting: "正在保存复核确认…",
    boundary: "这里只记录您的自我复核，不代表专业批准。文档仍为草稿。",
    UNAVAILABLE: "尚未确认保存结果。请先重新载入检查，再决定是否重试；不要视为已保存复核。",
    INVALID_REQUEST: "请完成此版本的三项确认后再提交。",
    STALE_REVISION: "版本已变化，请打开当前版本并重新复核。",
    reload: "重新载入检查", current: "打开当前版本",
  },
  "zh-Hant": {
    legend: "確認人工複核", version: (version: number) => `此確認僅適用於版本 ${version}。`,
    facts: "我已根據確認的事實核對草稿。",
    wording: "我已檢查措辭及意思，包括我使用的複核譯文。",
    missing: "我已檢查缺失事實及後續提示，沒有補寫未經確認的資訊。",
    submit: "確認已人工複核", submitting: "正在儲存複核確認…",
    boundary: "這裡只記錄您的自我複核，不代表專業批准。文件仍為草稿。",
    UNAVAILABLE: "尚未確認儲存結果。請先重新載入檢查，再決定是否重試；不要視為已儲存複核。",
    INVALID_REQUEST: "請完成此版本的三項確認後再提交。",
    STALE_REVISION: "版本已變更，請開啟目前版本並重新複核。",
    reload: "重新載入檢查", current: "開啟目前版本",
  },
};

export function getCommunicationNoteSelfReviewCopy(locale: CommunicationNoteDocumentLocale) {
  return copy[locale];
}
