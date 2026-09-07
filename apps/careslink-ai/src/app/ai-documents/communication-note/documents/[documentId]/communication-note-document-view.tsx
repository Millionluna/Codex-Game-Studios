import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  FolderOpen,
  History,
  Languages,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { getCommunicationNoteEditCopy } from "../../../../../lib/communication-note-edit-i18n";
import {
  COMMUNICATION_NOTE_COMPOSER_FIELDS,
  getCommunicationNoteComposerCopy,
} from "../../../../../lib/communication-note-composer";
import {
  buildCommunicationNoteDocumentHref,
  type CommunicationNoteAvailableDocument,
  type CommunicationNoteDocumentResult,
} from "../../../../../lib/communication-note-document-contract";
import {
  COMMUNICATION_NOTE_DOCUMENT_LOCALES,
  formatCommunicationNoteDocumentDate,
  getCommunicationNoteDocumentCopy,
  type CommunicationNoteDocumentCopy,
  type CommunicationNoteDocumentLocale,
} from "../../../../../lib/communication-note-document-i18n";

type DisplayResult = Exclude<
  CommunicationNoteDocumentResult,
  Readonly<{ status: "AUTH_REQUIRED" }>
>;

export type CommunicationNoteDocumentViewProps = Readonly<{
  canonicalId: string;
  documentNavigationAvailable?: boolean;
  locale: CommunicationNoteDocumentLocale;
  result?: DisplayResult;
  revisionId?: string;
  unsupportedLocale?: boolean;
  selfReviewControl?: ReactNode;
  editorControl?: ReactNode;
  exportControl?: ReactNode;
  editing?: boolean;
  editorNotice?: string;
}>;

export function CommunicationNoteDocumentView({
  canonicalId,
  documentNavigationAvailable = true,
  locale,
  result,
  revisionId,
  unsupportedLocale = false,
  selfReviewControl,
  editorControl, exportControl, editing = false, editorNotice,
}: CommunicationNoteDocumentViewProps) {
  const copy = getCommunicationNoteDocumentCopy(locale);
  const selectedRevisionId =
    result?.status === "AVAILABLE" ? result.revision.revisionId : revisionId;

  return (
    <main className="case-note-page">
      <header className="case-note-brandbar border-b border-white/10">
        <div className="mx-auto flex min-h-16 max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
          <a
            href={buildWorkspaceHref(locale)}
            className="inline-flex items-center rounded-sm focus-visible:ring-2 focus-visible:ring-[#9fe1ca]"
            aria-label="CaresLink AI"
          >
            <Image
              src="/careslink-ai-logo-reverse.svg"
              alt="CaresLink AI"
              width={190}
              height={46}
              priority
              className="h-auto w-[166px]"
            />
          </a>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <a
              href={buildComposerHref(locale)}
              className="inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-xs font-semibold text-white/78 hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              {copy.backToBuilder}
            </a>
            <nav
              aria-label={copy.languageLabel}
              className="flex items-center rounded-md border border-white/18 bg-white/8 p-1"
            >
              <Languages
                className="mx-2 size-4 text-white/72"
                aria-hidden="true"
              />
              {COMMUNICATION_NOTE_DOCUMENT_LOCALES.map((supportedLocale) => (
                <a
                  key={supportedLocale}
                  href={
                    documentNavigationAvailable
                      ? buildCommunicationNoteDocumentHref({
                          canonicalId,
                          revisionId: selectedRevisionId,
                          locale: supportedLocale,
                        })
                      : buildComposerHref(supportedLocale)
                  }
                  hrefLang={supportedLocale}
                  lang={supportedLocale}
                  aria-current={supportedLocale === locale ? "page" : undefined}
                  className={`inline-flex min-h-9 items-center rounded px-2 text-xs font-semibold ${
                    supportedLocale === locale
                      ? "bg-white text-brand-dark"
                      : "text-white/72 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {copy.localeLabels[supportedLocale]}
                </a>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {editorNotice ? <p role="status" className="mb-5 border border-[#e2c891] bg-[#fff8e6] px-4 py-3 text-sm leading-6 text-[#705318]">{editorNotice}</p> : null}
        {unsupportedLocale ? (
          <div
            role="status"
            className="mb-5 border border-[#e2c891] bg-[#fff8e6] px-4 py-3 text-sm leading-6 text-[#705318]"
          >
            {copy.unsupportedLocale}
          </div>
        ) : null}

        {!result ? (
          <DocumentLoading copy={copy} />
        ) : result.status === "AVAILABLE" ? (
          <AvailableDocument result={result} locale={locale} copy={copy} selfReviewControl={selfReviewControl} editorControl={editorControl} exportControl={exportControl} editing={editing} />
        ) : (
          <DocumentState
            status={result.status}
            copy={copy}
            retryHref={buildCommunicationNoteDocumentHref({
              canonicalId,
              revisionId,
              locale,
            })}
          />
        )}
      </div>
    </main>
  );
}

function AvailableDocument({
  result,
  locale,
  copy,
  selfReviewControl,
  editorControl, exportControl, editing,
}: Readonly<{
  result: CommunicationNoteAvailableDocument;
  locale: CommunicationNoteDocumentLocale;
  copy: CommunicationNoteDocumentCopy;
  selfReviewControl?: ReactNode;
  editorControl?: ReactNode;
  exportControl?: ReactNode;
  editing: boolean;
}>) {
  const composerCopy = getCommunicationNoteComposerCopy(locale);
  const selfReview = copy.selfReview[result.selfReviewStatus];
  const editCopy = getCommunicationNoteEditCopy(locale);

  return (
    <>
      <section className="grid gap-5 border-b border-[#bfcfc7] pb-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)] lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="workspace-status-pill workspace-status-pill--warning">
              <span lang="en-AU">{result.draftNotice}</span>
            </span>
            <span className="workspace-status-pill">
              {result.isCurrentRevision
                ? copy.currentVersion
                : copy.historicalVersion}
            </span>
          </div>
          <h1 className="document-title mt-4 max-w-4xl sm:text-[2.75rem]">
            {copy.title}
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted">
            {copy.description}
          </p>
        </div>

        <dl className="document-paper grid overflow-hidden sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          <MetadataItem
            label={copy.selectedVersion}
            value={copy.versionLabel(result.revision.revisionNumber)}
          />
          <MetadataItem
            label={copy.createdLabel}
            value={formatCommunicationNoteDocumentDate(
              result.revision.createdAt,
              locale,
            )}
            dateTime={result.revision.createdAt}
          />
          <MetadataItem
            label={copy.sourceLanguageLabel}
            value={copy.sourceLanguageNames[result.sourceLocale]}
          />
        </dl>
      </section>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,0.68fr)]">
        <article
          className="document-paper overflow-hidden"
          aria-labelledby="communication-note-saved-draft-title"
        >
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-md bg-[#e3f0e9] text-brand">
                <FileText className="size-5" aria-hidden="true" />
              </div>
              <div>
                <h2
                  id="communication-note-saved-draft-title"
                  className="text-lg font-semibold text-foreground"
                >
                  {copy.draftTitle}
                </h2>
                <p className="mt-1 text-sm leading-6 text-muted">
                  {copy.versionLabel(result.revision.revisionNumber)}
                </p>
              </div>
            </div>
            <div className={`flex max-w-full items-start gap-2 border px-3 py-2 text-xs leading-5 ${editing ? "border-[#e2c891] bg-[#fff8e6] text-[#705318]" : "border-[#aad4c2] bg-[#e2f2ea] text-brand"}`}>
              {editing ? <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <CheckCircle2
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />}
              <span>
                <strong className="block">{editing ? editCopy.local : copy.savedTitle}</strong>
                <span>{editing ? editCopy.reviewDetail : copy.savedDetail}</span>
              </span>
            </div>
          </header>

          {editorControl}
          {!editing ? <><DraftLanguageSection
            title={copy.englishDraft}
            text={result.revision.content.englishDraft}
            contentLocale="en"
            sourceLocale={result.sourceLocale}
            copy={copy}
          />
          <DraftLanguageSection
            title={copy.simplifiedReview}
            text={result.revision.content.reviewVersions["zh-Hans"]}
            contentLocale="zh-Hans"
            sourceLocale={result.sourceLocale}
            copy={copy}
          />
          <DraftLanguageSection
            title={copy.traditionalReview}
            text={result.revision.content.reviewVersions["zh-Hant"]}
            contentLocale="zh-Hant"
            sourceLocale={result.sourceLocale}
            copy={copy}
          />
          </> : null}
          {!editing ? exportControl : null}
          <footer className="flex gap-3 border-t border-line bg-[#f5f4ed] p-5 text-xs leading-5 text-[#455d55] sm:p-6">
            <LockKeyhole
              className="mt-0.5 size-4 shrink-0 text-brand"
              aria-hidden="true"
            />
            <p>{copy.fixedBoundary}</p>
          </footer>
        </article>

        <aside className="grid content-start gap-4">
          <section
            className="document-paper overflow-hidden"
            aria-labelledby="communication-note-review-title"
          >
            <div className="border-b border-line p-5">
              <div className="flex items-center gap-2 text-brand">
                <ShieldCheck className="size-4" aria-hidden="true" />
                <h2
                  id="communication-note-review-title"
                  className="text-base font-semibold text-foreground"
                >
                  {copy.reviewTitle}
                </h2>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted">
                {copy.reviewDescription}
              </p>
            </div>

            <div className="border-b border-line p-5">
              <p className="text-xs font-semibold text-muted">
                {copy.selfReviewTitle}
              </p>
              <div className="mt-3 flex gap-3">
                {!editing && result.selfReviewStatus === "CONFIRMED" ? (
                  <CheckCircle2
                    className="mt-0.5 size-5 shrink-0 text-brand"
                    aria-hidden="true"
                  />
                ) : (
                  <AlertTriangle
                    className="mt-0.5 size-5 shrink-0 text-[#82550a]"
                    aria-hidden="true"
                  />
                )}
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {editing ? editCopy.review : selfReview.label}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    {editing ? editCopy.reviewDetail : selfReview.detail}
                  </p>
                </div>
              </div>
            </div>

            {result.isCurrentRevision && result.selfReviewStatus === "REQUIRED" ? selfReviewControl : null}

            <div className="grid gap-5 p-5">
              <ReviewList
                title={copy.missingFacts}
                items={result.revision.content.missingFacts}
                empty={copy.noneFlagged}
              />
              <ReviewList
                title={copy.neutralWordingChecks}
                items={result.revision.content.neutralWordingChecks}
                empty={copy.noneFlagged}
              />
              <ReviewList
                title={copy.followUpPrompts}
                items={result.revision.content.followUpPrompts}
                empty={copy.noneFlagged}
              />
            </div>

            <details className="border-t border-line p-5">
              <summary className="cursor-pointer text-sm font-semibold text-brand">
                {copy.openFacts}
              </summary>
              <p className="mt-3 text-xs leading-5 text-muted">
                {copy.factsDescription}
              </p>
              <dl className="mt-4 divide-y divide-line border-y border-line">
                {COMMUNICATION_NOTE_COMPOSER_FIELDS.map((field) => (
                  <FactItem
                    key={field}
                    label={composerCopy.fieldLabels[field]}
                    value={result.revision.content.factsSummary[field]}
                    notProvided={copy.notProvided}
                  />
                ))}
              </dl>
            </details>
          </section>

          <section
            className="document-paper overflow-hidden"
            aria-labelledby="communication-note-versions-title"
          >
            <div className="border-b border-line p-5">
              <div className="flex items-center gap-2 text-brand">
                <History className="size-4" aria-hidden="true" />
                <h2
                  id="communication-note-versions-title"
                  className="text-base font-semibold text-foreground"
                >
                  {copy.versionsTitle}
                </h2>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted">
                {copy.versionsDescription}
              </p>
            </div>
            <nav aria-label={copy.versionsTitle} className="divide-y divide-line">
              {result.versions.map((version) => {
                const selected =
                  version.revisionId === result.revision.revisionId;
                const current =
                  version.revisionId === result.currentRevisionId;
                return (
                  <a
                    key={version.revisionId}
                    href={buildCommunicationNoteDocumentHref({
                      canonicalId: result.canonicalId,
                      revisionId: version.revisionId,
                      locale,
                    })}
                    aria-current={selected ? "page" : undefined}
                    className={`block px-5 py-4 ${
                      selected ? "bg-brand-soft" : "hover:bg-[#f5f4ed]"
                    }`}
                  >
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-sm text-foreground">
                        {copy.versionLabel(version.revisionNumber)}
                      </strong>
                      <span className="flex flex-wrap gap-1">
                        {selected ? (
                          <span className="workspace-status-pill">
                            {copy.selectedVersion}
                          </span>
                        ) : null}
                        {current ? (
                          <span className="workspace-status-pill workspace-status-pill--success">
                            {copy.currentVersionShort}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <time
                      dateTime={version.createdAt}
                      className="mt-2 block text-xs leading-5 text-muted"
                    >
                      {formatCommunicationNoteDocumentDate(
                        version.createdAt,
                        locale,
                      )}
                    </time>
                  </a>
                );
              })}
            </nav>
            <details className="border-t border-line p-5">
              <summary className="cursor-pointer text-xs font-semibold text-brand">
                {copy.technicalDetails}
              </summary>
              <dl className="mt-4 grid gap-3 text-xs leading-5">
                <TechnicalItem
                  label={copy.documentReference}
                  value={result.canonicalId}
                />
                <TechnicalItem
                  label={copy.revisionReference}
                  value={result.revision.revisionId}
                />
                <TechnicalItem
                  label={copy.contentHash}
                  value={result.revision.contentHash}
                />
              </dl>
            </details>
          </section>
        </aside>
      </div>
    </>
  );
}

function DraftLanguageSection({
  title,
  text,
  contentLocale,
  sourceLocale,
  copy,
}: Readonly<{
  title: string;
  text?: string;
  contentLocale: CommunicationNoteDocumentLocale;
  sourceLocale: CommunicationNoteDocumentLocale;
  copy: CommunicationNoteDocumentCopy;
}>) {
  const isEnglish = contentLocale === "en";

  return (
    <section className="border-b border-line p-5 last:border-b-0 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="flex flex-wrap gap-1">
          <span className="workspace-status-pill">
            {isEnglish ? copy.englishDraft : copy.reviewVersion}
          </span>
          {sourceLocale === contentLocale ? (
            <span className="workspace-status-pill workspace-status-pill--success">
              {copy.sourceLanguage}
            </span>
          ) : null}
        </span>
      </div>
      {text !== undefined ? (
        <div
          lang={contentLocale === "en" ? "en-AU" : contentLocale}
          className="document-prose mt-4 max-w-[72ch] whitespace-pre-wrap"
        >
          {text}
        </div>
      ) : (
        <p
          role="status"
          className="mt-4 border border-[#d8d3c7] bg-[#f5f1e8] px-4 py-3 text-sm leading-6 text-[#635f57]"
        >
          {copy.missingReviewVersion(
            copy.sourceLanguageNames[contentLocale],
          )}
        </p>
      )}
      {!isEnglish && text !== undefined ? (
        <p className="mt-4 text-xs leading-5 text-muted">
          {copy.reviewTranslationBoundary}
        </p>
      ) : null}
    </section>
  );
}

function ReviewList({
  title,
  items,
  empty,
}: Readonly<{ title: string; items: readonly string[]; empty: string }>) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {items.length > 0 ? (
        <ul className="mt-2 divide-y divide-line border-y border-line">
          {items.map((item, index) => (
            <li
              key={`${index}:${item}`}
              className="flex gap-2 py-2 text-sm leading-6 text-[#385249]"
            >
              <span className="mt-[0.65rem] size-1.5 shrink-0 rounded-full bg-brand" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm leading-6 text-muted">{empty}</p>
      )}
    </section>
  );
}

function FactItem({
  label,
  value,
  notProvided,
}: Readonly<{
  label: string;
  value: string | readonly string[] | undefined;
  notProvided: string;
}>) {
  return (
    <div className="grid gap-1 py-3">
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="whitespace-pre-wrap text-sm leading-6 text-foreground">
        {Array.isArray(value)
          ? value.join("\n")
          : value ?? notProvided}
      </dd>
    </div>
  );
}

function MetadataItem({
  label,
  value,
  dateTime,
}: Readonly<{ label: string; value: ReactNode; dateTime?: string }>) {
  return (
    <div className="border-b border-line p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 lg:border-b lg:border-r-0 lg:last:border-b-0 xl:border-b-0 xl:border-r xl:last:border-r-0">
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="mt-2 text-sm font-semibold text-foreground">
        {dateTime ? <time dateTime={dateTime}>{value}</time> : value}
      </dd>
    </div>
  );
}

function TechnicalItem({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt className="font-semibold text-muted">{label}</dt>
      <dd className="mt-1 break-all text-foreground">{value}</dd>
    </div>
  );
}

function DocumentLoading({ copy }: Readonly<{ copy: CommunicationNoteDocumentCopy }>) {
  return (
    <section
      aria-live="polite"
      aria-busy="true"
      className="document-paper mx-auto min-h-[70vh] max-w-4xl overflow-hidden"
    >
      <div className="flex items-start gap-3 border-b border-line p-5 sm:p-6">
        <div className="grid size-10 shrink-0 place-items-center rounded-md bg-[#e3f0e9] text-brand">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            {copy.loadingTitle}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            {copy.loadingDescription}
          </p>
        </div>
      </div>
      <div className="grid gap-3 p-5 sm:p-6">
        <span className="h-4 w-1/3 rounded bg-[#dcebe4]" />
        <span className="h-4 w-full rounded bg-[#e7ece8]" />
        <span className="h-4 w-5/6 rounded bg-[#e7ece8]" />
        <span className="h-4 w-2/3 rounded bg-[#e7ece8]" />
      </div>
    </section>
  );
}

function DocumentState({
  status,
  copy,
  retryHref,
}: Readonly<{
  status: Exclude<DisplayResult["status"], "AVAILABLE">;
  copy: CommunicationNoteDocumentCopy;
  retryHref: string;
}>) {
  const unavailable = status === "UNAVAILABLE";
  const empty = status === "EMPTY";
  const title = unavailable
    ? copy.unavailableTitle
    : empty
      ? copy.emptyTitle
      : copy.notFoundTitle;
  const description = unavailable
    ? copy.unavailableDescription
    : empty
      ? copy.emptyDescription
      : copy.notFoundDescription;

  return (
    <section
      role="status"
      aria-live="polite"
      className="document-paper mx-auto max-w-4xl p-6 sm:p-8"
    >
      <div className="grid size-12 place-items-center rounded-md bg-[#e3f0e9] text-brand">
        {unavailable ? (
          <AlertTriangle className="size-6" aria-hidden="true" />
        ) : (
          <FolderOpen className="size-6" aria-hidden="true" />
        )}
      </div>
      <h1 className="document-title mt-5">{title}</h1>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
        {description}
      </p>
      {unavailable ? (
        <a href={retryHref} className="jade-action mt-6">
          <RefreshCw className="size-4" aria-hidden="true" />
          {copy.retry}
        </a>
      ) : null}
    </section>
  );
}

function buildComposerHref(locale: CommunicationNoteDocumentLocale) {
  return `/ai-documents/communication-note?lang=${encodeURIComponent(locale)}`;
}

function buildWorkspaceHref(locale: CommunicationNoteDocumentLocale) {
  const workspaceLocale = locale === "zh-Hant" ? "en" : locale;
  return `/ai-documents?lang=${encodeURIComponent(workspaceLocale)}`;
}
