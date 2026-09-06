import {
  COMMUNICATION_NOTE_COMPOSER_LOCALES,
  parseCommunicationNoteComposerLocale,
  type CommunicationNoteComposerLocale,
} from "./communication-note-composer";
import type { CaresLinkV1Locale } from "./v1/shared-contracts";

export const COMMUNICATION_NOTE_DOCUMENT_LOCALES =
  COMMUNICATION_NOTE_COMPOSER_LOCALES;
export type CommunicationNoteDocumentLocale = CommunicationNoteComposerLocale;

type SearchValue = string | readonly string[] | undefined;

export function resolveCommunicationNoteDocumentLocale(value: SearchValue): {
  locale: CommunicationNoteDocumentLocale;
  unsupported: boolean;
} {
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

export type CommunicationNoteDocumentCopy = Readonly<{
  metadataTitle: string;
  metadataDescription: string;
  backToBuilder: string;
  languageLabel: string;
  localeLabels: Readonly<Record<CommunicationNoteDocumentLocale, string>>;
  unsupportedLocale: string;
  title: string;
  description: string;
  currentVersion: string;
  historicalVersion: string;
  versionLabel(revisionNumber: number): string;
  selectedVersion: string;
  currentVersionShort: string;
  createdLabel: string;
  sourceLanguageLabel: string;
  sourceLanguageNames: Readonly<Record<CaresLinkV1Locale, string>>;
  savedTitle: string;
  savedDetail: string;
  draftTitle: string;
  englishDraft: string;
  simplifiedReview: string;
  traditionalReview: string;
  sourceLanguage: string;
  reviewVersion: string;
  missingReviewVersion(language: string): string;
  reviewTranslationBoundary: string;
  fixedBoundary: string;
  reviewTitle: string;
  reviewDescription: string;
  selfReviewTitle: string;
  selfReview: Readonly<
    Record<
      "REQUIRED" | "CONFIRMED" | "UNKNOWN",
      Readonly<{ label: string; detail: string }>
    >
  >;
  missingFacts: string;
  neutralWordingChecks: string;
  followUpPrompts: string;
  noneFlagged: string;
  factsTitle: string;
  factsDescription: string;
  openFacts: string;
  notProvided: string;
  loadingTitle: string;
  loadingDescription: string;
  versionsTitle: string;
  versionsDescription: string;
  technicalDetails: string;
  documentReference: string;
  revisionReference: string;
  contentHash: string;
  emptyTitle: string;
  emptyDescription: string;
  unavailableTitle: string;
  unavailableDescription: string;
  retry: string;
  notFoundTitle: string;
  notFoundDescription: string;
}>;

const COMMON_LOCALE_LABELS = Object.freeze({
  en: "English",
  "zh-Hans": "简体中文",
  "zh-Hant": "繁體中文",
});

const COPY: Readonly<
  Record<CommunicationNoteDocumentLocale, CommunicationNoteDocumentCopy>
> = {
  en: {
    metadataTitle: "Communication Note draft",
    metadataDescription:
      "Review an owner-scoped saved Communication Note draft and its exact revision.",
    backToBuilder: "Back to Communication Note",
    languageLabel: "Page language",
    localeLabels: COMMON_LOCALE_LABELS,
    unsupportedLocale:
      "The requested language is not supported for this workflow. English is shown explicitly; choose another available language above.",
    title: "Communication Note draft",
    description:
      "Review the saved wording against the confirmed facts before using it in an authorised record.",
    currentVersion: "Current version",
    historicalVersion: "Historical version",
    versionLabel: (revisionNumber) => `Version ${revisionNumber}`,
    selectedVersion: "Selected",
    currentVersionShort: "Current",
    createdLabel: "Created",
    sourceLanguageLabel: "Source language",
    sourceLanguageNames: {
      en: "English",
      "zh-Hans": "Simplified Chinese",
      "zh-Hant": "Traditional Chinese",
    },
    savedTitle: "Saved on server",
    savedDetail: "This exact revision has a server acknowledgement.",
    draftTitle: "Saved draft wording",
    englishDraft: "English draft",
    simplifiedReview: "Simplified Chinese review version",
    traditionalReview: "Traditional Chinese review version",
    sourceLanguage: "Source language",
    reviewVersion: "Review version",
    missingReviewVersion: (language) =>
      `No ${language} review version is available. Nothing from another language has been substituted.`,
    reviewTranslationBoundary:
      "Review versions support checking only. Compare their meaning with the English draft.",
    fixedBoundary:
      "Draft status remains in place after self-review. This workflow does not provide clinical, legal, care, regulatory or compliance advice.",
    reviewTitle: "Review before use",
    reviewDescription:
      "Check the wording, missing facts and neutral language against your own record of the event.",
    selfReviewTitle: "Self-review status",
    selfReview: {
      REQUIRED: {
        label: "Self-review required",
        detail: "This current version has not received a recorded self-review confirmation.",
      },
      CONFIRMED: {
        label: "Self-review confirmed",
        detail: "The current version has a recorded human confirmation. It remains a draft.",
      },
      UNKNOWN: {
        label: "Status not carried to history",
        detail: "A current version's self-review status is never reused for a historical version.",
      },
    },
    missingFacts: "Missing facts to review",
    neutralWordingChecks: "Neutral wording checks",
    followUpPrompts: "Follow-up prompts",
    noneFlagged: "None flagged for this version.",
    factsTitle: "Confirmed cleaned facts",
    factsDescription:
      "These de-identified facts were bound to the selected revision.",
    openFacts: "Review source facts",
    notProvided: "Not provided",
    loadingTitle: "Checking saved draft access",
    loadingDescription:
      "CaresLink is confirming the current session before loading any document content.",
    versionsTitle: "Version history",
    versionsDescription:
      "Opening a version reloads the exact saved revision and rechecks access.",
    technicalDetails: "Technical references",
    documentReference: "Document reference",
    revisionReference: "Revision reference",
    contentHash: "Content hash",
    emptyTitle: "This Communication Note has no saved draft yet",
    emptyDescription:
      "The document exists, but the server has not acknowledged a revision to review.",
    unavailableTitle: "The saved draft is temporarily unavailable",
    unavailableDescription:
      "No document content is being shown. Retry to run the owner and session checks again.",
    retry: "Retry saved draft",
    notFoundTitle: "Communication Note not found",
    notFoundDescription:
      "The document is missing, unavailable to this account, or no longer retained.",
  },
  "zh-Hans": {
    metadataTitle: "沟通记录草稿",
    metadataDescription: "查看仅限文档所有者访问的沟通记录草稿及其精确版本。",
    backToBuilder: "返回沟通记录",
    languageLabel: "页面语言",
    localeLabels: COMMON_LOCALE_LABELS,
    unsupportedLocale:
      "此工作流程不支持所请求的语言。现已明确显示英文；请在上方选择其他可用语言。",
    title: "沟通记录草稿",
    description: "使用前，请根据已确认的事实检查已保存的文字。",
    currentVersion: "当前版本",
    historicalVersion: "历史版本",
    versionLabel: (revisionNumber) => `版本 ${revisionNumber}`,
    selectedVersion: "已选择",
    currentVersionShort: "当前",
    createdLabel: "创建时间",
    sourceLanguageLabel: "来源语言",
    sourceLanguageNames: {
      en: "英文",
      "zh-Hans": "简体中文",
      "zh-Hant": "繁体中文",
    },
    savedTitle: "已保存到服务器",
    savedDetail: "服务器已确认保存此精确版本。",
    draftTitle: "已保存的草稿文字",
    englishDraft: "英文草稿",
    simplifiedReview: "简体中文复核版本",
    traditionalReview: "繁体中文复核版本",
    sourceLanguage: "来源语言",
    reviewVersion: "复核版本",
    missingReviewVersion: (language) =>
      `没有可用的${language}复核版本。系统没有替换为其他语言的内容。`,
    reviewTranslationBoundary: "复核版本只用于检查。请与英文草稿核对含义。",
    fixedBoundary:
      "完成人工复核后仍为草稿。本工作流程不提供临床、法律、护理、监管或合规建议。",
    reviewTitle: "使用前复核",
    reviewDescription: "请根据您掌握的事件记录检查措辞、缺失事实和中性表达。",
    selfReviewTitle: "人工复核状态",
    selfReview: {
      REQUIRED: {
        label: "需要人工复核",
        detail: "当前版本尚未记录人工复核确认。",
      },
      CONFIRMED: {
        label: "已确认人工复核",
        detail: "当前版本已有人工确认记录，但仍然是草稿。",
      },
      UNKNOWN: {
        label: "历史版本不沿用状态",
        detail: "当前版本的人工复核状态绝不会沿用到历史版本。",
      },
    },
    missingFacts: "需要复核的缺失事实",
    neutralWordingChecks: "中性措辞检查",
    followUpPrompts: "后续提示",
    noneFlagged: "此版本没有标记项目。",
    factsTitle: "已确认的清理后事实",
    factsDescription: "这些已去标识化的事实与所选版本绑定。",
    openFacts: "检查来源事实",
    notProvided: "未提供",
    loadingTitle: "正在检查草稿访问权限",
    loadingDescription: "CaresLink 正在确认当前会话，确认前不会载入任何文档内容。",
    versionsTitle: "版本历史",
    versionsDescription: "打开版本会重新载入精确的已保存版本，并重新检查访问权限。",
    technicalDetails: "技术参考",
    documentReference: "文档编号",
    revisionReference: "版本编号",
    contentHash: "内容哈希",
    emptyTitle: "此沟通记录尚无已保存草稿",
    emptyDescription: "文档已存在，但服务器尚未确认任何可复核版本。",
    unavailableTitle: "暂时无法载入已保存草稿",
    unavailableDescription: "当前不显示任何文档内容。请重试以再次检查所有者和会话。",
    retry: "重试载入草稿",
    notFoundTitle: "找不到沟通记录",
    notFoundDescription: "此文档可能不存在、不属于当前账户，或已不再保留。",
  },
  "zh-Hant": {
    metadataTitle: "溝通記錄草稿",
    metadataDescription: "查看僅限文件擁有人存取的溝通記錄草稿及其精確版本。",
    backToBuilder: "返回溝通記錄",
    languageLabel: "頁面語言",
    localeLabels: COMMON_LOCALE_LABELS,
    unsupportedLocale:
      "此工作流程不支援所要求的語言。現已明確顯示英文；請在上方選擇其他可用語言。",
    title: "溝通記錄草稿",
    description: "使用前，請根據已確認的事實檢查已儲存的文字。",
    currentVersion: "目前版本",
    historicalVersion: "歷史版本",
    versionLabel: (revisionNumber) => `版本 ${revisionNumber}`,
    selectedVersion: "已選擇",
    currentVersionShort: "目前",
    createdLabel: "建立時間",
    sourceLanguageLabel: "來源語言",
    sourceLanguageNames: {
      en: "英文",
      "zh-Hans": "簡體中文",
      "zh-Hant": "繁體中文",
    },
    savedTitle: "已儲存到伺服器",
    savedDetail: "伺服器已確認儲存此精確版本。",
    draftTitle: "已儲存的草稿文字",
    englishDraft: "英文草稿",
    simplifiedReview: "簡體中文複核版本",
    traditionalReview: "繁體中文複核版本",
    sourceLanguage: "來源語言",
    reviewVersion: "複核版本",
    missingReviewVersion: (language) =>
      `沒有可用的${language}複核版本。系統沒有替換為其他語言的內容。`,
    reviewTranslationBoundary: "複核版本只用於檢查。請與英文草稿核對意思。",
    fixedBoundary:
      "完成人工複核後仍為草稿。本工作流程不提供臨床、法律、護理、監管或合規建議。",
    reviewTitle: "使用前複核",
    reviewDescription: "請根據您掌握的事件記錄檢查措辭、缺失事實和中性表達。",
    selfReviewTitle: "人工複核狀態",
    selfReview: {
      REQUIRED: {
        label: "需要人工複核",
        detail: "目前版本尚未記錄人工複核確認。",
      },
      CONFIRMED: {
        label: "已確認人工複核",
        detail: "目前版本已有人工確認記錄，但仍然是草稿。",
      },
      UNKNOWN: {
        label: "歷史版本不沿用狀態",
        detail: "目前版本的人工複核狀態絕不會沿用到歷史版本。",
      },
    },
    missingFacts: "需要複核的缺失事實",
    neutralWordingChecks: "中性措辭檢查",
    followUpPrompts: "後續提示",
    noneFlagged: "此版本沒有標記項目。",
    factsTitle: "已確認的清理後事實",
    factsDescription: "這些已去識別化的事實與所選版本綁定。",
    openFacts: "檢查來源事實",
    notProvided: "未提供",
    loadingTitle: "正在檢查草稿存取權限",
    loadingDescription: "CaresLink 正在確認目前工作階段，確認前不會載入任何文件內容。",
    versionsTitle: "版本歷史",
    versionsDescription: "開啟版本會重新載入精確的已儲存版本，並重新檢查存取權限。",
    technicalDetails: "技術參考",
    documentReference: "文件編號",
    revisionReference: "版本編號",
    contentHash: "內容雜湊",
    emptyTitle: "此溝通記錄尚無已儲存草稿",
    emptyDescription: "文件已存在，但伺服器尚未確認任何可複核版本。",
    unavailableTitle: "暫時無法載入已儲存草稿",
    unavailableDescription: "目前不顯示任何文件內容。請重試以再次檢查擁有人和工作階段。",
    retry: "重試載入草稿",
    notFoundTitle: "找不到溝通記錄",
    notFoundDescription: "此文件可能不存在、不屬於目前帳戶，或已不再保留。",
  },
};

export function getCommunicationNoteDocumentCopy(
  locale: CommunicationNoteDocumentLocale,
) {
  return COPY[locale];
}

export function formatCommunicationNoteDocumentDate(
  value: string,
  locale: CommunicationNoteDocumentLocale,
) {
  const localeName = {
    en: "en-AU",
    "zh-Hans": "zh-CN",
    "zh-Hant": "zh-HK",
  }[locale];

  try {
    return new Intl.DateTimeFormat(localeName, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Australia/Melbourne",
    }).format(new Date(value));
  } catch {
    return value;
  }
}
