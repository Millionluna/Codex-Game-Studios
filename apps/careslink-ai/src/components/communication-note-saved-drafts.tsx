"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { buildCommunicationNoteDocumentHref } from "../lib/communication-note-document-contract";
import { replaceCommunicationNoteLocation } from "../lib/communication-note-document-navigation";
import { COMMUNICATION_NOTE_DOCUMENT_LOCALES, formatCommunicationNoteDocumentDate,
  getCommunicationNoteDocumentCopy, type CommunicationNoteDocumentLocale } from "../lib/communication-note-document-i18n";
import { loadCommunicationNoteSavedDrafts, type CommunicationNoteSavedDraftsResult } from "../lib/communication-note-saved-drafts";

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

/** Reusable surface; this slice connects it only in the owned local fixture. */
export function CommunicationNoteSavedDrafts({ locale, loginHref, unsupportedLocale = false }: Readonly<{
  locale: CommunicationNoteDocumentLocale; loginHref: string; unsupportedLocale?: boolean;
}>) {
  const [state, setState] = useState<{ loginHref: string; result?: VisibleResult }>();
  const refreshRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    let mounted = true, sequence = 0;
    let controller: AbortController | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    function clear() {
      sequence += 1; controller?.abort(); controller = undefined;
      if (timeout !== undefined) clearTimeout(timeout);
      timeout = undefined; setState({ loginHref });
    }
    async function refresh() {
      clear();
      const ticket = sequence, current = new AbortController(); controller = current;
      timeout = setTimeout(() => {
        if (mounted && ticket === sequence) {
          current.abort(); setState({ loginHref, result: { status: "UNAVAILABLE" } });
        }
      }, 8_000);
      try {
        const result = await loadCommunicationNoteSavedDrafts(current.signal);
        if (!mounted || current.signal.aborted || ticket !== sequence) return;
        if (result.status === "AUTH_REQUIRED") { clear(); replaceCommunicationNoteLocation(loginHref); return; }
        setState({ loginHref, result });
      } catch {
        if (mounted && !current.signal.aborted && ticket === sequence)
          setState({ loginHref, result: { status: "UNAVAILABLE" } });
      } finally {
        if (ticket === sequence) { clearTimeout(timeout); timeout = undefined; controller = undefined; }
      }
    }
    const recheck = () => { void refresh(); };
    const offline = () => { clear(); setState({ loginHref, result: { status: "UNAVAILABLE" } }); };
    const visibility = () => { if (document.visibilityState === "visible") recheck(); else clear(); };
    const pageShow = (event: PageTransitionEvent) => { if (event.persisted) recheck(); };
    refreshRef.current = recheck; recheck();
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
  }, [loginHref]);
  return <CommunicationNoteSavedDraftsView locale={locale} unsupportedLocale={unsupportedLocale}
    result={state?.loginHref === loginHref ? state.result : undefined} onRefresh={() => refreshRef.current()} />;
}

export function CommunicationNoteSavedDraftsView({ locale, result, onRefresh, unsupportedLocale = false }: Readonly<{
  locale: CommunicationNoteDocumentLocale; result?: VisibleResult; onRefresh: () => void; unsupportedLocale?: boolean;
}>) {
  const copy = COPY[locale], documentCopy = getCommunicationNoteDocumentCopy(locale);
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
        <div><h1 id="saved-drafts-title" className="text-2xl font-semibold sm:text-3xl">{copy.title}</h1>
          <p className="mt-3 max-w-[70ch] text-sm leading-6">{copy.description}</p></div>
        <a className="jade-action" href={`/ai-documents/communication-note?lang=${locale}`}>{copy.create}</a>
      </div>
      {unsupportedLocale ? <p role="status" className="mt-4">{documentCopy.unsupportedLocale}</p> : null}
      <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-y border-line py-4">
        <p className="max-w-[70ch] text-sm leading-6">{copy.boundary}</p>
        <button type="button" onClick={onRefresh} className="rounded border border-line px-4 py-2 text-sm font-semibold hover:bg-white focus-visible:ring-2 focus-visible:ring-[#146451]">{copy.refresh}</button>
      </div>
      <div role="status" className="mt-5 text-sm leading-6">
        {!result ? copy.loading : result.status === "UNAVAILABLE" ? copy.unavailable : result.documents.length === 0 ? copy.empty : null}
      </div>
      {result?.status === "AVAILABLE" && result.documents.length > 0 ?
        <ul aria-label={copy.title} className="mt-4 divide-y divide-line">
          {result.documents.map(d => <li key={d.canonicalId} className="flex flex-wrap items-center justify-between gap-5 py-6">
            <div><h2 className="text-lg font-semibold">Communication Note</h2>
              <p className="mt-2 text-sm">{documentCopy.versionLabel(d.revisionNumber)} · {documentCopy.sourceLanguageNames[d.sourceLocale]}</p>
              <p className="mt-2 text-sm">{copy.updated}: <time dateTime={d.updatedAt}>{formatCommunicationNoteDocumentDate(d.updatedAt, locale)}</time></p>
              <p className="mt-2 text-sm font-medium">{copy.draft}</p></div>
            <a href={buildCommunicationNoteDocumentHref({ canonicalId: d.canonicalId, locale })}
              className="jade-action">{copy.open}</a>
          </li>)}
        </ul> : null}
    </section>
  </main>;
}
