import type { CommunicationNoteDocumentLocale } from "./communication-note-document-i18n";
const copy = {
  en: {
    title: "Export history", load: "View or refresh export history", loading: "Loading export history…",
    pending: "Recording export history…", empty: "No export reports are recorded for this version.",
    boundary: "Latest 20 reports for this version. Start times come from the device. Browser reports do not confirm that a file was saved or remains available.",
    temporary: "Temporary test history only. Records disappear when the test server stops.",
    unavailable: "Export history is unavailable. This does not change the export result above. Refresh history later; do not export again just to add a history entry.",
    warning: "The history entry could not be confirmed. The export result above is unchanged.",
    more: "Only the latest 20 reports are shown; older reports are not shown in this view.",
    version: (n: number) => `Version ${n}`, time: "Started (device time)",
    outcomes: { COPY_REPORTED: "Browser reported copied", DOWNLOAD_INITIATED: "Download initiated", FAILED: "Browser reported operation failure" },
  },
  "zh-Hans": {
    title: "导出历史", load: "查看或刷新导出历史", loading: "正在读取导出历史…",
    pending: "正在记录导出历史…", empty: "此版本还没有已记录的导出报告。",
    boundary: "显示此版本最近 20 条报告。发起时间来自设备；浏览器报告不能确认文件已保存或仍然可用。",
    temporary: "仅为临时测试历史，测试服务器停止后记录会消失。",
    unavailable: "导出历史暂不可用，不影响上方的导出结果。请稍后刷新历史，不要为了补记历史重复导出。",
    warning: "尚未确认历史记录写入，上方的导出结果没有变化。",
    more: "这里只显示最近 20 条报告，更早的报告未在此视图显示。",
    version: (n: number) => `版本 ${n}`, time: "发起时间（设备时间）",
    outcomes: { COPY_REPORTED: "浏览器报告已复制", DOWNLOAD_INITIATED: "已发起下载", FAILED: "浏览器报告操作失败" },
  },
  "zh-Hant": {
    title: "匯出歷史", load: "查看或重新整理匯出歷史", loading: "正在讀取匯出歷史…",
    pending: "正在記錄匯出歷史…", empty: "此版本還沒有已記錄的匯出報告。",
    boundary: "顯示此版本最近 20 筆報告。啟動時間來自裝置；瀏覽器報告不能確認檔案已儲存或仍然可用。",
    temporary: "僅為暫時測試歷史，測試伺服器停止後記錄會消失。",
    unavailable: "匯出歷史暫時無法使用，不影響上方的匯出結果。請稍後重新整理歷史，不要為了補記歷史重複匯出。",
    warning: "尚未確認歷史記錄寫入，上方的匯出結果沒有變更。",
    more: "這裡只顯示最近 20 筆報告，更早的報告未在此檢視顯示。",
    version: (n: number) => `版本 ${n}`, time: "啟動時間（裝置時間）",
    outcomes: { COPY_REPORTED: "瀏覽器報告已複製", DOWNLOAD_INITIATED: "已啟動下載", FAILED: "瀏覽器報告操作失敗" },
  },
};
export function getExportHistoryCopy(locale: CommunicationNoteDocumentLocale) { return copy[locale]; }
