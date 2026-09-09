import {
  COMMUNICATION_NOTE_COMPOSER_LOCALES,
  parseCommunicationNoteComposerLocale,
  type CommunicationNoteComposerLocale,
} from "../../../../../lib/communication-note-composer";
import type { CommunicationNoteGenerationJob } from "../../../../../lib/communication-note-generation-contract";

export const COMMUNICATION_NOTE_GENERATION_JOB_LOCALES =
  COMMUNICATION_NOTE_COMPOSER_LOCALES;
export type CommunicationNoteGenerationJobLocale =
  CommunicationNoteComposerLocale;

type SearchValue = string | readonly string[] | undefined;

export function resolveCommunicationNoteGenerationJobLocale(
  value: SearchValue,
): Readonly<{
  locale: CommunicationNoteGenerationJobLocale;
  unsupported: boolean;
}> {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) return { locale: "en", unsupported: false };

  try {
    return {
      locale: parseCommunicationNoteComposerLocale(candidate),
      unsupported: false,
    };
  } catch {
    return { locale: "en", unsupported: true };
  }
}

type JobStatusCopy = Readonly<{
  label: string;
  title: string;
  detail: string;
}>;

export type CommunicationNoteGenerationJobCopy = Readonly<{
  metadataTitle: string;
  metadataDescription: string;
  backToWorkspace: string;
  languageLabel: string;
  localeLabels: Readonly<Record<CommunicationNoteGenerationJobLocale, string>>;
  unsupportedLocale: string;
  title: string;
  description: string;
  checkingLabel: string;
  checkingTitle: string;
  checkingDescription: string;
  statuses: Readonly<
    Record<CommunicationNoteGenerationJob["status"], JobStatusCopy>
  >;
  createdLabel: string;
  updatedLabel: string;
  savedLabel: string;
  draftNotice: string;
  succeededBoundary: string;
  activeBoundary: string;
  terminalBoundary: string;
  privacyBoundary: string;
  automaticChecksPaused: string;
  checkStatus: string;
  openSavedDraft: string;
  startNewNote: string;
  technicalDetails: string;
  jobReference: string;
  attemptCount: string;
  unavailableLabel: string;
  unavailableTitle: string;
  unavailableDescription: string;
  notFoundLabel: string;
  notFoundTitle: string;
  notFoundDescription: string;
}>;

const LOCALE_LABELS = Object.freeze({
  en: "English",
  "zh-Hans": "简体中文",
  "zh-Hant": "繁體中文",
});

const COPY: Readonly<
  Record<
    CommunicationNoteGenerationJobLocale,
    CommunicationNoteGenerationJobCopy
  >
> = {
  en: {
    metadataTitle: "Communication Note generation",
    metadataDescription:
      "Check an owner-scoped Communication Note generation job.",
    backToWorkspace: "Back to workspace",
    languageLabel: "Page language",
    localeLabels: LOCALE_LABELS,
    unsupportedLocale:
      "The requested language is not supported for this workflow. English is shown explicitly; choose another available language above.",
    title: "Communication Note generation",
    description:
      "This page checks the saved server job without resending source facts or the request key.",
    checkingLabel: "Checking access",
    checkingTitle: "Checking generation status",
    checkingDescription:
      "CaresLink is confirming the current session before showing the owner-scoped job status.",
    statuses: {
      QUEUED: {
        label: "Queued",
        title: "Generation is queued",
        detail:
          "The server accepted this job. You can leave and return using this page.",
      },
      RUNNING: {
        label: "Running",
        title: "Generating the Communication Note",
        detail:
          "The server is processing the saved job. No completion estimate is available.",
      },
      SUCCEEDED: {
        label: "Saved",
        title: "Draft generated and saved",
        detail:
          "Open the exact saved revision and complete human review before use.",
      },
      FAILED: {
        label: "Failed",
        title: "Generation did not complete",
        detail: "This job has no saved draft available to open.",
      },
      CANCELLED: {
        label: "Cancelled",
        title: "Generation was cancelled",
        detail: "This job has no saved draft available to open.",
      },
    },
    createdLabel: "Created",
    updatedLabel: "Server updated",
    savedLabel: "Saved on server",
    draftNotice: "Draft – review required",
    succeededBoundary:
      "A server acknowledgement confirms this revision was saved. It remains a draft until a person reviews it.",
    activeBoundary:
      "Status checks do not resubmit the generation request or reserve additional Points.",
    terminalBoundary:
      "Starting a new note creates a separate request. This page does not retry or cancel the finished job.",
    privacyBoundary:
      "This status page reads job metadata only. Source facts and the request key are not stored by this page.",
    automaticChecksPaused:
      "Automatic checks have paused. The server job may still be active.",
    checkStatus: "Check status",
    openSavedDraft: "Open saved draft",
    startNewNote: "Start a new Communication Note",
    technicalDetails: "Technical references",
    jobReference: "Job reference",
    attemptCount: "Server attempts",
    unavailableLabel: "Status unavailable",
    unavailableTitle: "Generation status is temporarily unavailable",
    unavailableDescription:
      "No job result is being shown. Check again to repeat the owner and session checks.",
    notFoundLabel: "Not found",
    notFoundTitle: "Generation job not found",
    notFoundDescription:
      "The job is missing, unavailable to this account, or no longer retained.",
  },
  "zh-Hans": {
    metadataTitle: "Communication Note 生成任务",
    metadataDescription: "查看仅限所有者访问的 Communication Note 生成任务。",
    backToWorkspace: "返回工作台",
    languageLabel: "页面语言",
    localeLabels: LOCALE_LABELS,
    unsupportedLocale:
      "此工作流程不支持所请求的语言。现已明确显示英文；请在上方选择其他可用语言。",
    title: "Communication Note 生成任务",
    description: "此页面检查服务器上已保存的任务，不会再次发送来源事实或请求密钥。",
    checkingLabel: "正在检查访问权限",
    checkingTitle: "正在检查生成状态",
    checkingDescription:
      "CaresLink 正在确认当前会话，确认后才会显示仅限所有者访问的任务状态。",
    statuses: {
      QUEUED: {
        label: "已排队",
        title: "生成任务已排队",
        detail: "服务器已接纳此任务。您可以离开，之后通过此页面返回。",
      },
      RUNNING: {
        label: "生成中",
        title: "正在生成 Communication Note",
        detail: "服务器正在处理已保存的任务。当前不提供预计完成时间。",
      },
      SUCCEEDED: {
        label: "已保存",
        title: "草稿已生成并保存",
        detail: "请打开精确的已保存版本，并在使用前完成人工复核。",
      },
      FAILED: {
        label: "失败",
        title: "生成未完成",
        detail: "此任务没有可打开的已保存草稿。",
      },
      CANCELLED: {
        label: "已取消",
        title: "生成任务已取消",
        detail: "此任务没有可打开的已保存草稿。",
      },
    },
    createdLabel: "创建时间",
    updatedLabel: "服务器更新时间",
    savedLabel: "已保存到服务器",
    draftNotice: "Draft – review required",
    succeededBoundary:
      "服务器确认表示此版本已保存。在完成人工复核前，它仍然是草稿。",
    activeBoundary: "状态检查不会再次提交生成请求，也不会额外预留 Points。",
    terminalBoundary:
      "新建记录会创建另一项请求。此页面不会重试或取消已结束的任务。",
    privacyBoundary:
      "此状态页面只读取任务元数据，不会存储来源事实或请求密钥。",
    automaticChecksPaused: "自动检查已暂停，服务器任务可能仍在运行。",
    checkStatus: "检查状态",
    openSavedDraft: "打开已保存草稿",
    startNewNote: "新建 Communication Note",
    technicalDetails: "技术参考",
    jobReference: "任务编号",
    attemptCount: "服务器尝试次数",
    unavailableLabel: "状态不可用",
    unavailableTitle: "暂时无法读取生成状态",
    unavailableDescription:
      "当前不显示任务结果。请再次检查，以重新核验所有者和会话。",
    notFoundLabel: "未找到",
    notFoundTitle: "未找到生成任务",
    notFoundDescription:
      "此任务可能不存在、不可供当前账户访问，或已不再保留。",
  },
  "zh-Hant": {
    metadataTitle: "Communication Note 產生任務",
    metadataDescription: "查看僅限擁有者存取的 Communication Note 產生任務。",
    backToWorkspace: "返回工作台",
    languageLabel: "頁面語言",
    localeLabels: LOCALE_LABELS,
    unsupportedLocale:
      "此工作流程不支援所要求的語言。現已明確顯示英文；請在上方選擇其他可用語言。",
    title: "Communication Note 產生任務",
    description: "此頁面檢查伺服器上已儲存的任務，不會再次傳送來源事實或請求密鑰。",
    checkingLabel: "正在檢查存取權限",
    checkingTitle: "正在檢查產生狀態",
    checkingDescription:
      "CaresLink 正在確認目前工作階段，確認後才會顯示僅限擁有者存取的任務狀態。",
    statuses: {
      QUEUED: {
        label: "已排隊",
        title: "產生任務已排隊",
        detail: "伺服器已接納此任務。您可以離開，之後透過此頁面返回。",
      },
      RUNNING: {
        label: "產生中",
        title: "正在產生 Communication Note",
        detail: "伺服器正在處理已儲存的任務。目前不提供預計完成時間。",
      },
      SUCCEEDED: {
        label: "已儲存",
        title: "草稿已產生並儲存",
        detail: "請開啟精確的已儲存版本，並在使用前完成人工覆核。",
      },
      FAILED: {
        label: "失敗",
        title: "產生未完成",
        detail: "此任務沒有可開啟的已儲存草稿。",
      },
      CANCELLED: {
        label: "已取消",
        title: "產生任務已取消",
        detail: "此任務沒有可開啟的已儲存草稿。",
      },
    },
    createdLabel: "建立時間",
    updatedLabel: "伺服器更新時間",
    savedLabel: "已儲存到伺服器",
    draftNotice: "Draft – review required",
    succeededBoundary:
      "伺服器確認表示此版本已儲存。在完成人工覆核前，它仍然是草稿。",
    activeBoundary: "狀態檢查不會再次提交產生請求，也不會額外預留 Points。",
    terminalBoundary:
      "新增記錄會建立另一項請求。此頁面不會重試或取消已結束的任務。",
    privacyBoundary:
      "此狀態頁面只讀取任務中繼資料，不會儲存來源事實或請求密鑰。",
    automaticChecksPaused: "自動檢查已暫停，伺服器任務可能仍在運行。",
    checkStatus: "檢查狀態",
    openSavedDraft: "開啟已儲存草稿",
    startNewNote: "新增 Communication Note",
    technicalDetails: "技術參考",
    jobReference: "任務編號",
    attemptCount: "伺服器嘗試次數",
    unavailableLabel: "狀態不可用",
    unavailableTitle: "暫時無法讀取產生狀態",
    unavailableDescription:
      "目前不顯示任務結果。請再次檢查，以重新核驗擁有者和工作階段。",
    notFoundLabel: "未找到",
    notFoundTitle: "未找到產生任務",
    notFoundDescription:
      "此任務可能不存在、不可供目前帳戶存取，或已不再保留。",
  },
};

export function getCommunicationNoteGenerationJobCopy(
  locale: CommunicationNoteGenerationJobLocale,
) {
  return COPY[locale];
}

export function formatCommunicationNoteGenerationJobDate(
  value: string,
  locale: CommunicationNoteGenerationJobLocale,
) {
  const numberLocale =
    locale === "zh-Hans" ? "zh-CN" : locale === "zh-Hant" ? "zh-TW" : "en-AU";
  return new Intl.DateTimeFormat(numberLocale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Melbourne",
  }).format(new Date(value));
}
