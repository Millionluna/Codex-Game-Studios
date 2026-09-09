import type { CommunicationNoteComposerDraft } from "./communication-note-composer";

export function hasCommunicationNoteComposerInput(draft: CommunicationNoteComposerDraft) {
  return Object.values(draft).some(value => Array.isArray(value)
    ? value.some(text => text.trim().length > 0) : value.trim().length > 0);
}

export const COMMUNICATION_NOTE_COMPOSER_NAVIGATION_COPY = {
  en: {
    title: "Leave this page?",
    stay: "Keep editing",
    leave: "Discard inputs and leave",
    points: "View the read-only Points page. Purchasing is not available. Returning to the workspace will not restore inputs left on this page.",
    discard: "Leave this page and discard the unsubmitted facts and privacy checks? They are not saved. Choose Keep editing to retain them.",
    unresolved: "The submission result is not confirmed. Leaving does not cancel a server task, but the inputs and exact retry request on this page will be lost. Check the workspace before generating again. Leave this page?",
  },
  "zh-Hans": {
    title: "离开此页面？",
    stay: "继续填写",
    leave: "放弃输入并离开",
    points: "查看只读 Points 页面，目前不能购买。返回工作台不会恢复此页面上离开前的输入。",
    discard: "要离开此页面并放弃未提交的事实及隐私检查吗？这些内容尚未保存。选择“继续填写”可保留内容。",
    unresolved: "提交结果尚未确认。离开不会取消服务器任务，但会丢失此页面的输入和同一请求重试信息。再次生成前，请先到工作台检查任务。要离开此页面吗？",
  },
  "zh-Hant": {
    title: "離開此頁面？",
    stay: "繼續填寫",
    leave: "放棄輸入並離開",
    points: "查看唯讀 Points 頁面，目前不能購買。返回工作台不會還原此頁面上離開前的輸入。",
    discard: "要離開此頁面並放棄未提交的事實及隱私檢查嗎？這些內容尚未儲存。選擇「繼續填寫」可保留內容。",
    unresolved: "提交結果尚未確認。離開不會取消伺服器任務，但會遺失此頁面的輸入和同一請求重試資訊。再次產生前，請先到工作台檢查任務。要離開此頁面嗎？",
  },
} as const;
