"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { buildCommunicationNoteDocumentHref } from "../lib/communication-note-document-contract";
import { buildCommunicationNoteGenerationJobHref } from "../lib/communication-note-generation-contract";
import { replaceCommunicationNoteLocation } from "../lib/communication-note-document-navigation";
import { COMMUNICATION_NOTE_DOCUMENT_LOCALES, formatCommunicationNoteDocumentDate,
  getCommunicationNoteDocumentCopy, type CommunicationNoteDocumentLocale } from "../lib/communication-note-document-i18n";
import { loadCommunicationNoteSavedDrafts, type CommunicationNoteSavedDraftsResult } from "../lib/communication-note-saved-drafts";
import type { CommunicationNoteTaskCursor } from "../lib/communication-note-task-list";

type VisibleResult = Exclude<CommunicationNoteSavedDraftsResult, { status: "AUTH_REQUIRED" }>;
const COPY = {
  en: { title: "Saved Communication Notes", description: "Reopen the current saved version. Draft wording is not shown in this list.",
    create: "Create Communication Note", refresh: "Refresh saved drafts", loading: "Checking saved drafts and access…",
    empty: "No saved Communication Notes yet. Complete a generation task, then return here.",
    unavailable: "Saved drafts cannot be checked right now. Refresh this list later; do not submit another generation to recover a saved draft.",
    open: "Open current version", updated: "Updated", draft: "Draft, review before use", boundary: "Opening rechecks access and self-review for the current version. It does not generate a draft or charge Points." },
  "zh-Hans": { title: "已保存的 Communication Note", description: "重新打开当前已保存版本。列表不显示草稿正文。",
    create: "创建 Communication Note", refresh: "刷新已保存草稿", loading: "正在检查已保存草稿及访问权限…",
    empty: "尚无已保存的 Communication Note。完成生成任务后，可返回此处查看。",
    unavailable: "暂时无法确认已保存草稿。请稍后刷新列表，不要为找回草稿重复提交生成任务。",
    open: "打开当前版本", updated: "更新时间", draft: "草稿，使用前请复核", boundary: "打开时会重新检查当前版本的访问权限及自查状态，不生成新草稿，也不扣 Points。" },
  "zh-Hant": { title: "已儲存的 Communication Note", description: "重新開啟目前已儲存版本。清單不顯示草稿正文。",
    create: "建立 Communication Note", refresh: "重新整理已儲存草稿", loading: "正在檢查已儲存草稿及存取權限…",
    empty: "尚無已儲存的 Communication Note。完成生成任務後，可返回此處查看。",
    unavailable: "暫時無法確認已儲存草稿。請稍後重新整理清單，不要為找回草稿重複提交生成任務。",
    open: "開啟目前版本", updated: "更新時間", draft: "草稿，使用前請複核", boundary: "開啟時會重新檢查目前版本的存取權限及自查狀態，不生成新草稿，也不扣 Points。" },
} as const;
const TASK_COPY = {
  en: { title: "Communication Note workspace", description: "Return to your generation task or reopen a saved draft. Facts and draft wording are not shown here.",
    heading: "Generation task", refresh: "Refresh tasks and drafts", loading: "Checking tasks, drafts and access…",
    unavailable: "Tasks and drafts cannot be checked right now. Refresh later; do not submit another generation to recover a task.",
    empty: "No generation task yet.", noDraft: "No saved draft yet. Open the task status for progress or the outcome.",
    open: "Open task status", boundary: "Returning only checks status and access. It does not start or retry generation, confirm review, or charge Points.",
    states: { QUEUED: "Queued", RUNNING: "Generating", SUCCEEDED: "Draft saved, review required", FAILED: "Generation failed", CANCELLED: "Task cancelled" } },
  "zh-Hans": { title: "Communication Note 工作台", description: "返回生成任务或重新打开已保存草稿。此处不显示事实内容和草稿正文。",
    heading: "生成任务", refresh: "刷新任务与草稿", loading: "正在检查任务、草稿及访问权限…",
    unavailable: "暂时无法确认任务及草稿。请稍后刷新，不要为找回任务重复提交生成。",
    empty: "尚无生成任务。", noDraft: "尚无已保存草稿。打开任务状态可查看进度或处理结果。",
    open: "打开任务状态", boundary: "返回仅检查状态和访问权限，不启动或重试生成、不确认复核，也不扣 Points。",
    states: { QUEUED: "排队中", RUNNING: "生成中", SUCCEEDED: "草稿已保存，仍需复核", FAILED: "生成失败", CANCELLED: "任务已取消" } },
  "zh-Hant": { title: "Communication Note 工作台", description: "返回生成任務或重新開啟已儲存草稿。此處不顯示事實內容和草稿正文。",
    heading: "生成任務", refresh: "重新整理任務與草稿", loading: "正在檢查任務、草稿及存取權限…",
    unavailable: "暫時無法確認任務及草稿。請稍後重新整理，不要為找回任務重複提交生成。",
    empty: "尚無生成任務。", noDraft: "尚無已儲存草稿。開啟任務狀態可查看進度或處理結果。",
    open: "開啟任務狀態", boundary: "返回僅檢查狀態和存取權限，不啟動或重試生成、不確認複核，也不扣 Points。",
    states: { QUEUED: "排隊中", RUNNING: "生成中", SUCCEEDED: "草稿已儲存，仍需複核", FAILED: "生成失敗", CANCELLED: "任務已取消" } },
} as const;
const PAGE_COPY = {
  en: { heading: "Generation tasks", created: "Created", next: "Older tasks", latest: "Latest tasks", description: "Newest first, up to 20 tasks per page. Open a task to check its outcome before starting another generation." },
  "zh-Hans": { heading: "生成任务", created: "创建时间", next: "更早的任务", latest: "最新任务", description: "按创建时间倒序，每页最多 20 条。再次生成前，请先打开任务查看处理结果。" },
  "zh-Hant": { heading: "生成任務", created: "建立時間", next: "較早的任務", latest: "最新任務", description: "按建立時間倒序，每頁最多 20 筆。再次生成前，請先開啟任務查看處理結果。" },
} as const;
const DRAFT_PAGE_COPY = {
  en: { next: "Next saved drafts", first: "First draft page", description: "Up to 20 drafts per page in stable document order, not update order.",
    empty: "No saved Communication Notes on this page. Continue if another page is available, or refresh to start again." },
  "zh-Hans": { next: "下一页草稿", first: "草稿首页", description: "每页最多 20 份草稿，按文档固定顺序排列，并非更新时间顺序。",
    empty: "本页没有已保存的 Communication Note。如有下一页，可继续查看；也可刷新返回首页。" },
  "zh-Hant": { next: "下一頁草稿", first: "草稿首頁", description: "每頁最多 20 份草稿，按文件固定順序排列，並非更新時間順序。",
    empty: "本頁沒有已儲存的 Communication Note。如有下一頁，可繼續查看；也可重新整理返回首頁。" },
} as const;

/** Reusable surface; this slice connects it only in the owned local fixture. */
export function CommunicationNoteSavedDrafts({ locale, loginHref, unsupportedLocale = false, includeTask = false }: Readonly<{
  locale: CommunicationNoteDocumentLocale; loginHref: string; unsupportedLocale?: boolean; includeTask?: boolean | "MULTI";
}>) {
  const [state, setState] = useState<{ loginHref: string; includeTask: boolean | "MULTI"; result?: VisibleResult; before?: CommunicationNoteTaskCursor | null; draftAfter?: string | null }>();
  const refreshRef = useRef<(before?: CommunicationNoteTaskCursor | null, draftAfter?: string | null) => void>(() => undefined);
  useEffect(() => {
    let mounted = true, sequence = 0;
    let controller: AbortController | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    function clear() {
      sequence += 1; controller?.abort(); controller = undefined;
      if (timeout !== undefined) clearTimeout(timeout);
      timeout = undefined; setState({ loginHref, includeTask });
    }
    async function refresh(before: CommunicationNoteTaskCursor | null = null, draftAfter: string | null = null) {
      clear();
      const ticket = sequence, current = new AbortController(); controller = current;
      timeout = setTimeout(() => {
        if (mounted && ticket === sequence) {
          current.abort(); setState({ loginHref, includeTask, result: { status: "UNAVAILABLE" } });
        }
      }, 8_000);
      try {
        const result = includeTask === "MULTI" ? await loadCommunicationNoteSavedDrafts(current.signal, undefined, "MULTI", before, draftAfter)
          : includeTask ? await loadCommunicationNoteSavedDrafts(current.signal, undefined, true)
          : await loadCommunicationNoteSavedDrafts(current.signal);
        if (!mounted || current.signal.aborted || ticket !== sequence) return;
        if (result.status === "AUTH_REQUIRED") { clear(); replaceCommunicationNoteLocation(loginHref); return; }
        setState({ loginHref, includeTask, result, before, draftAfter });
      } catch {
        if (mounted && !current.signal.aborted && ticket === sequence)
          setState({ loginHref, includeTask, result: { status: "UNAVAILABLE" } });
      } finally {
        if (ticket === sequence) { clearTimeout(timeout); timeout = undefined; controller = undefined; }
      }
    }
    const recheck = () => { void refresh(); };
    const offline = () => { clear(); setState({ loginHref, includeTask, result: { status: "UNAVAILABLE" } }); };
    const visibility = () => { if (document.visibilityState === "visible") recheck(); else clear(); };
    const pageShow = (event: PageTransitionEvent) => { if (event.persisted) recheck(); };
    refreshRef.current = (before, draftAfter) => { void refresh(before, draftAfter); }; recheck();
    window.addEventListener("focus", recheck); window.addEventListener("storage", recheck);
    window.addEventListener("online", recheck); window.addEventListener("offline", offline);
    window.addEventListener("pagehide", clear); window.addEventListener("pageshow", pageShow);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      mounted = false; sequence += 1; controller?.abort(); clearTimeout(timeout);
      refreshRef.current = () => undefined;
      window.removeEventListener("focus", recheck); window.removeEventListener("storage", recheck);
      window.removeEventListener("online", recheck); window.removeEventListener("offline", offline);
      window.removeEventListener("pagehide", clear); window.removeEventListener("pageshow", pageShow);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [loginHref, includeTask]);
  const current = state?.loginHref === loginHref && state.includeTask === includeTask ? state : undefined;
  return <CommunicationNoteSavedDraftsView locale={locale} unsupportedLocale={unsupportedLocale} includeTask={includeTask}
    olderPage={!!current?.before} laterDraftPage={!!current?.draftAfter}
    onPage={cursor => refreshRef.current(cursor, current?.draftAfter)}
    onDraftPage={cursor => refreshRef.current(current?.before, cursor)}
    result={current?.result} onRefresh={() => refreshRef.current()} />;
}

export function CommunicationNoteSavedDraftsView({ locale, result, onRefresh, unsupportedLocale = false, includeTask = false, olderPage = false, onPage, laterDraftPage = false, onDraftPage }: Readonly<{
  locale: CommunicationNoteDocumentLocale; result?: VisibleResult; onRefresh: () => void; unsupportedLocale?: boolean; includeTask?: boolean | "MULTI";
  olderPage?: boolean; onPage?: (cursor: CommunicationNoteTaskCursor | null) => void;
  laterDraftPage?: boolean; onDraftPage?: (cursor: string | null) => void;
}>) {
  const copy = COPY[locale], documentCopy = getCommunicationNoteDocumentCopy(locale);
  const taskCopy = TASK_COPY[locale], surfaceCopy = includeTask ? taskCopy : copy;
  const task = includeTask && result?.status === "AVAILABLE" ? result.task : null;
  const taskPage = includeTask === "MULTI" && result?.status === "AVAILABLE" ? result.taskPage : undefined;
  const pageCopy = PAGE_COPY[locale];
  const draftPageCopy = DRAFT_PAGE_COPY[locale];
  const DraftHeading = includeTask ? "h3" : "h2";
  return <main className="case-note-page">
    <header className="case-note-brandbar">
      <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <a href={`/ai-documents?lang=${locale}`} aria-label="CaresLink AI" className="rounded-sm focus-visible:ring-2 focus-visible:ring-[#9fe1ca]">
          <Image src="/careslink-ai-logo-reverse.svg" alt="CaresLink AI" width={190} height={46} priority className="h-auto w-[166px]" />
        </a>
        <nav aria-label={documentCopy.languageLabel} className="flex flex-wrap gap-2">
          {COMMUNICATION_NOTE_DOCUMENT_LOCALES.map(language => <a key={language} href={`/ai-documents?lang=${language}`}
            lang={language} aria-current={locale === language ? "page" : undefined}
            className="rounded px-3 py-2 text-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-[#9fe1ca]">
            {documentCopy.localeLabels[language]}</a>)}
        </nav>
      </div>
    </header>
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10" aria-labelledby="saved-drafts-title">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div><h1 id="saved-drafts-title" className="text-2xl font-semibold sm:text-3xl">{surfaceCopy.title}</h1>
          <p className="mt-3 max-w-[70ch] text-sm leading-6">{surfaceCopy.description}</p></div>
        {!includeTask || (result?.status === "AVAILABLE" && (result.task === null || includeTask === "MULTI")) ?
          <a className="jade-action" href={`/ai-documents/communication-note?lang=${locale}`}>{copy.create}</a> : null}
      </div>
      {unsupportedLocale ? <p role="status" className="mt-4">{documentCopy.unsupportedLocale}</p> : null}
      <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-y border-line py-4">
        <p className="max-w-[70ch] text-sm leading-6">{surfaceCopy.boundary}</p>
        <button type="button" onClick={onRefresh} className="rounded border border-line px-4 py-2 text-sm font-semibold hover:bg-white focus-visible:ring-2 focus-visible:ring-[#146451]">{surfaceCopy.refresh}</button>
      </div>
      <div role="status" className="mt-5 text-sm leading-6">
        {!result ? surfaceCopy.loading : result.status === "UNAVAILABLE" ? surfaceCopy.unavailable : !includeTask && result.documents.length === 0 ? copy.empty : null}
      </div>
      {includeTask && result?.status === "AVAILABLE" ? <>
        <section className="border-b border-line py-6" aria-labelledby="workspace-task-title">
          <h2 id="workspace-task-title" className="text-xl font-semibold">{includeTask === "MULTI" ? pageCopy.heading : taskCopy.heading}</h2>
          {taskPage ? <>
            <p className="mt-3 max-w-[70ch] text-sm leading-6">{pageCopy.description}</p>
            {taskPage.tasks.length === 0 ? <p className="mt-3 text-sm">{taskCopy.empty}</p> :
              <ul aria-label={pageCopy.heading} className="mt-2 divide-y divide-line">
                {taskPage.tasks.map(t => <li key={t.jobId} className="flex flex-wrap items-center justify-between gap-5 py-5">
                  <div><h3 id={`task-${t.jobId}`} className="font-semibold">{taskCopy.states[t.status]}</h3>
                    <p className="mt-2 text-sm">{pageCopy.created}: <time dateTime={t.createdAt}>{formatCommunicationNoteDocumentDate(t.createdAt, locale)}</time></p>
                    <p className="mt-2 text-sm">{copy.updated}: <time dateTime={t.updatedAt}>{formatCommunicationNoteDocumentDate(t.updatedAt, locale)}</time></p></div>
                  <a className="jade-action" aria-describedby={`task-${t.jobId}`}
                    href={buildCommunicationNoteGenerationJobHref({ jobId: t.jobId, locale })}>{taskCopy.open}</a>
                </li>)}
              </ul>}
            <nav aria-label={pageCopy.heading} className="mt-4 flex flex-wrap gap-3">
              {olderPage ? <button className="jade-action" type="button" onClick={() => onPage ? onPage(null) : onRefresh()}>{pageCopy.latest}</button> : null}
              {taskPage.nextCursor && onPage ? <button className="jade-action" type="button" onClick={() => onPage(taskPage.nextCursor)}>{pageCopy.next}</button> : null}
            </nav>
          </> : task ? <div className="mt-4 flex flex-wrap items-center justify-between gap-5">
            <div><p className="font-semibold">{taskCopy.states[task.status]}</p>
              <p className="mt-2 text-sm">{copy.updated}: <time dateTime={task.updatedAt}>{formatCommunicationNoteDocumentDate(task.updatedAt, locale)}</time></p></div>
            <a className="jade-action" href={buildCommunicationNoteGenerationJobHref({ jobId: task.jobId, locale })}>{taskCopy.open}</a>
          </div> : <p className="mt-3 text-sm">{taskCopy.empty}</p>}
        </section>
        <h2 className="mt-7 text-xl font-semibold">{copy.title}</h2>
        {includeTask === "MULTI" ? <p className="mt-3 text-sm leading-6">{draftPageCopy.description}</p> : null}
        {result.documents.length === 0 ? <p className="mt-3 text-sm leading-6">{includeTask === "MULTI" ? draftPageCopy.empty : task ? taskCopy.noDraft : copy.empty}</p> : null}
      </> : null}
      {result?.status === "AVAILABLE" && result.documents.length > 0 ?
        <ul aria-label={copy.title} className="mt-4 divide-y divide-line">
          {result.documents.map(d => <li key={d.canonicalId} className="flex flex-wrap items-center justify-between gap-5 py-6">
            <div><DraftHeading id={`draft-${d.canonicalId}`} className="text-lg font-semibold">Communication Note</DraftHeading>
              <p className="mt-2 text-sm">{documentCopy.versionLabel(d.revisionNumber)} · {documentCopy.sourceLanguageNames[d.sourceLocale]}</p>
              <p className="mt-2 text-sm">{copy.updated}: <time dateTime={d.updatedAt}>{formatCommunicationNoteDocumentDate(d.updatedAt, locale)}</time></p>
              <p className="mt-2 text-sm font-medium">{copy.draft}</p></div>
            <a href={buildCommunicationNoteDocumentHref({ canonicalId: d.canonicalId, locale })}
              aria-describedby={`draft-${d.canonicalId}`} className="jade-action">{copy.open}</a>
          </li>)}
        </ul> : null}
      {includeTask === "MULTI" && result?.status === "AVAILABLE" && onDraftPage ?
        <nav aria-label={copy.title} className="mt-4 flex flex-wrap gap-3">
          {laterDraftPage ? <button className="jade-action" type="button" onClick={() => onDraftPage(null)}>{draftPageCopy.first}</button> : null}
          {result.documentsCursor ? <button className="jade-action" type="button" onClick={() => onDraftPage(result.documentsCursor!)}>{draftPageCopy.next}</button> : null}
        </nav> : null}
    </section>
  </main>;
}
