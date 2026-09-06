import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileText,
  Languages,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import {
  buildCommunicationNoteGenerationJobHref,
  type CommunicationNoteGenerationJob,
  type CommunicationNoteGenerationJobReadResult,
} from "../../../../../lib/communication-note-generation-contract";
import { buildCommunicationNoteDocumentHref } from "../../../../../lib/communication-note-document-contract";
import {
  COMMUNICATION_NOTE_GENERATION_JOB_LOCALES,
  formatCommunicationNoteGenerationJobDate,
  getCommunicationNoteGenerationJobCopy,
  type CommunicationNoteGenerationJobCopy,
  type CommunicationNoteGenerationJobLocale,
} from "./communication-note-generation-job-i18n";

type VisibleResult = Exclude<
  CommunicationNoteGenerationJobReadResult,
  Readonly<{ status: "AUTH_REQUIRED" }>
>;

export type CommunicationNoteGenerationJobViewProps = Readonly<{
  automaticChecksPaused?: boolean;
  jobId: string;
  jobNavigationAvailable?: boolean;
  locale: CommunicationNoteGenerationJobLocale;
  onCheckStatus?: () => void;
  result?: VisibleResult;
  unsupportedLocale?: boolean;
}>;

export function CommunicationNoteGenerationJobView({
  automaticChecksPaused = false,
  jobId,
  jobNavigationAvailable = true,
  locale,
  onCheckStatus,
  result,
  unsupportedLocale = false,
}: CommunicationNoteGenerationJobViewProps) {
  const copy = getCommunicationNoteGenerationJobCopy(locale);

  return (
    <main className="case-note-page">
      <header className="case-note-brandbar border-b border-white/10">
        <div className="mx-auto flex min-h-16 max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
          <a
            href={buildComposerHref(locale)}
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
              className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-xs font-semibold text-white/78 hover:bg-white/10 hover:text-white"
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
              {COMMUNICATION_NOTE_GENERATION_JOB_LOCALES.map(
                (supportedLocale) => (
                  <a
                    key={supportedLocale}
                    href={
                      jobNavigationAvailable
                        ? buildCommunicationNoteGenerationJobHref({
                            jobId,
                            locale: supportedLocale,
                          })
                        : buildComposerHref(supportedLocale)
                    }
                    hrefLang={supportedLocale}
                    lang={supportedLocale}
                    aria-current={
                      supportedLocale === locale ? "page" : undefined
                    }
                    className={`inline-flex min-h-9 items-center rounded px-2 text-xs font-semibold ${
                      supportedLocale === locale
                        ? "bg-white text-brand-dark"
                        : "text-white/72 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {copy.localeLabels[supportedLocale]}
                  </a>
                ),
              )}
            </nav>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {unsupportedLocale ? (
          <div
            role="status"
            className="mb-5 border border-[#e2c891] bg-[#fff8e6] px-4 py-3 text-sm leading-6 text-[#705318]"
          >
            {copy.unsupportedLocale}
          </div>
        ) : null}

        {!result ? (
          <JobLoading copy={copy} />
        ) : result.status === "AVAILABLE" ? (
          <AvailableJob
            automaticChecksPaused={automaticChecksPaused}
            copy={copy}
            job={result.job}
            locale={locale}
            onCheckStatus={onCheckStatus}
          />
        ) : (
          <JobState
            copy={copy}
            locale={locale}
            onCheckStatus={onCheckStatus}
            status={result.status}
          />
        )}
      </div>
    </main>
  );
}

function JobLoading({ copy }: Readonly<{ copy: CommunicationNoteGenerationJobCopy }>) {
  return (
    <section
      role="status"
      aria-live="polite"
      className="document-paper mx-auto min-h-[62vh] overflow-hidden"
    >
      <div className="grid min-h-[62vh] place-items-center p-6 text-center sm:p-10">
        <div className="max-w-xl">
          <RefreshCw className="mx-auto size-7 text-brand" aria-hidden="true" />
          <p className="micro-label mt-4">{copy.checkingLabel}</p>
          <h1 className="document-title mt-3 text-[2rem] sm:text-[2.75rem]">
            {copy.checkingTitle}
          </h1>
          <p className="mx-auto mt-4 max-w-[62ch] text-base leading-7 text-muted">
            {copy.checkingDescription}
          </p>
        </div>
      </div>
    </section>
  );
}

function AvailableJob({
  automaticChecksPaused,
  copy,
  job,
  locale,
  onCheckStatus,
}: Readonly<{
  automaticChecksPaused: boolean;
  copy: CommunicationNoteGenerationJobCopy;
  job: CommunicationNoteGenerationJob;
  locale: CommunicationNoteGenerationJobLocale;
  onCheckStatus?: () => void;
}>) {
  const statusCopy = copy.statuses[job.status];
  const active = job.status === "QUEUED" || job.status === "RUNNING";
  const succeeded = job.status === "SUCCEEDED";
  const failed = job.status === "FAILED" || job.status === "CANCELLED";
  const savedDraftHref = succeeded
    ? buildCommunicationNoteDocumentHref({
        canonicalId: job.result.canonicalId,
        revisionId: job.result.revisionId,
        locale,
      })
    : undefined;

  return (
    <>
      <section className="border-b border-[#bfcfc7] pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`workspace-status-pill ${
              succeeded
                ? "workspace-status-pill--success"
                : failed
                  ? "workspace-status-pill--warning"
                  : ""
            }`}
          >
            {statusCopy.label}
          </span>
          {succeeded ? (
            <span className="workspace-status-pill workspace-status-pill--warning">
              <span lang="en-AU">{copy.draftNotice}</span>
            </span>
          ) : null}
        </div>
        <h1 className="document-title mt-4 max-w-4xl sm:text-[2.75rem]">
          {copy.title}
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-muted">
          {copy.description}
        </p>
      </section>

      <section className="document-paper mt-5 overflow-hidden">
        <div className="grid gap-6 border-b border-line p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:p-7">
          <StatusIcon status={job.status} />
          <div>
            <div
              role={failed ? "alert" : "status"}
              aria-live={failed ? "assertive" : "polite"}
              aria-atomic="true"
            >
              <p className="text-sm font-semibold text-brand">
                {statusCopy.label}
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-foreground">
                {statusCopy.title}
              </h2>
              <p className="mt-3 max-w-[68ch] text-base leading-7 text-muted">
                {statusCopy.detail}
              </p>
            </div>

            {active && automaticChecksPaused ? (
              <div className="mt-5 border border-[#e7c891] bg-[#fff7df] p-4 text-sm leading-6 text-[#705318]">
                <p>{copy.automaticChecksPaused}</p>
                <button
                  type="button"
                  className="taito-secondary mt-3 min-h-11 w-full sm:w-auto"
                  onClick={onCheckStatus}
                >
                  <RefreshCw className="size-4" aria-hidden="true" />
                  {copy.checkStatus}
                </button>
              </div>
            ) : null}

            {savedDraftHref ? (
              <div className="mt-5 border border-[#aad4c2] bg-[#e2f2ea] p-4">
                <div className="flex items-start gap-3 text-brand">
                  <CheckCircle2
                    className="mt-0.5 size-5 shrink-0"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-semibold">{copy.savedLabel}</p>
                    <p className="mt-1 text-sm leading-6">
                      {copy.succeededBoundary}
                    </p>
                  </div>
                </div>
                <a href={savedDraftHref} className="jade-action mt-4 w-full sm:w-auto">
                  <FileText className="size-4" aria-hidden="true" />
                  {copy.openSavedDraft}
                </a>
              </div>
            ) : null}

            {failed ? (
              <div className="mt-5">
                <p className="text-sm leading-6 text-muted">
                  {copy.terminalBoundary}
                </p>
                <a
                  href={buildComposerHref(locale)}
                  className="taito-secondary mt-3 w-full sm:w-auto"
                >
                  {copy.startNewNote}
                </a>
              </div>
            ) : null}
          </div>
        </div>

        <dl className="grid border-b border-line sm:grid-cols-2">
          <MetadataItem
            label={copy.createdLabel}
            value={formatCommunicationNoteGenerationJobDate(
              job.createdAt,
              locale,
            )}
            dateTime={job.createdAt}
          />
          <MetadataItem
            label={copy.updatedLabel}
            value={formatCommunicationNoteGenerationJobDate(
              job.updatedAt,
              locale,
            )}
            dateTime={job.updatedAt}
          />
        </dl>

        <div className="flex gap-3 bg-[#f5f4ed] p-5 text-sm leading-6 text-[#455d55] sm:p-6">
          <LockKeyhole
            className="mt-0.5 size-4 shrink-0 text-brand"
            aria-hidden="true"
          />
          <p>{active ? copy.activeBoundary : copy.privacyBoundary}</p>
        </div>

        <details className="border-t border-line p-5 sm:p-6">
          <summary className="cursor-pointer text-sm font-semibold text-brand">
            {copy.technicalDetails}
          </summary>
          <dl className="mt-4 divide-y divide-line border-y border-line">
            <ReferenceItem label={copy.jobReference} value={job.jobId} />
            <ReferenceItem
              label={copy.attemptCount}
              value={String(job.attemptCount)}
            />
          </dl>
        </details>
      </section>
    </>
  );
}

function StatusIcon({ status }: Readonly<{ status: CommunicationNoteGenerationJob["status"] }>) {
  let icon: ReactNode;
  let className = "grid size-12 shrink-0 place-items-center rounded-md bg-[#e3f0e9] text-brand";

  if (status === "SUCCEEDED") {
    icon = <CheckCircle2 className="size-6" aria-hidden="true" />;
  } else if (status === "FAILED" || status === "CANCELLED") {
    className =
      "grid size-12 shrink-0 place-items-center rounded-md bg-[#fff1e8] text-danger";
    icon = <XCircle className="size-6" aria-hidden="true" />;
  } else if (status === "RUNNING") {
    icon = <RefreshCw className="size-6" aria-hidden="true" />;
  } else {
    icon = <Clock3 className="size-6" aria-hidden="true" />;
  }

  return <div className={className}>{icon}</div>;
}

function MetadataItem({
  dateTime,
  label,
  value,
}: Readonly<{ dateTime: string; label: string; value: string }>) {
  return (
    <div className="border-b border-line p-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-foreground">
        <time dateTime={dateTime}>{value}</time>
      </dd>
    </div>
  );
}

function ReferenceItem({
  label,
  value,
}: Readonly<{ label: string; value: string }>) {
  return (
    <div className="grid gap-1 py-3 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
      <dt className="font-semibold text-muted">{label}</dt>
      <dd className="break-all font-mono text-xs leading-5 text-foreground">
        {value}
      </dd>
    </div>
  );
}

function JobState({
  copy,
  locale,
  onCheckStatus,
  status,
}: Readonly<{
  copy: CommunicationNoteGenerationJobCopy;
  locale: CommunicationNoteGenerationJobLocale;
  onCheckStatus?: () => void;
  status: Exclude<VisibleResult["status"], "AVAILABLE">;
}>) {
  const unavailable = status === "UNAVAILABLE";

  return (
    <section
      role={unavailable ? "alert" : "status"}
      className="document-paper mx-auto min-h-[62vh] overflow-hidden"
    >
      <div className="grid min-h-[62vh] place-items-center p-6 text-center sm:p-10">
        <div className="max-w-xl">
          {unavailable ? (
            <AlertTriangle
              className="mx-auto size-8 text-[#82550a]"
              aria-hidden="true"
            />
          ) : (
            <ShieldCheck
              className="mx-auto size-8 text-brand"
              aria-hidden="true"
            />
          )}
          <span
            className={`workspace-status-pill mt-4 ${
              unavailable ? "workspace-status-pill--warning" : ""
            }`}
          >
            {unavailable ? copy.unavailableLabel : copy.notFoundLabel}
          </span>
          <h1 className="document-title mt-4 text-[2rem] sm:text-[2.75rem]">
            {unavailable ? copy.unavailableTitle : copy.notFoundTitle}
          </h1>
          <p className="mx-auto mt-4 max-w-[64ch] text-base leading-7 text-muted">
            {unavailable
              ? copy.unavailableDescription
              : copy.notFoundDescription}
          </p>
          {unavailable ? (
            <button
              type="button"
              className="jade-action mt-6 min-h-11 w-full sm:w-auto"
              onClick={onCheckStatus}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              {copy.checkStatus}
            </button>
          ) : (
            <a
              href={buildComposerHref(locale)}
              className="taito-secondary mt-6 w-full sm:w-auto"
            >
              {copy.backToBuilder}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

function buildComposerHref(locale: CommunicationNoteGenerationJobLocale) {
  return `/ai-documents/communication-note?lang=${encodeURIComponent(locale)}`;
}
