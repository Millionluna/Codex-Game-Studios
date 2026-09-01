"use client";

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Languages,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import {
  COMMUNICATION_NOTE_COMPOSER_FIELDS,
  COMMUNICATION_NOTE_COMPOSER_LOCALES,
  buildCommunicationNoteSubmission,
  createEmptyCommunicationNoteComposerDraft,
  getCommunicationNoteComposerCopy,
  reviewCommunicationNoteDraft,
  type CommunicationNoteComposerConfirmations,
  type CommunicationNoteComposerDraft,
  type CommunicationNoteComposerField,
  type CommunicationNoteComposerLocale,
  type CommunicationNoteComposerReview,
  type CommunicationNoteComposerValidationIssue,
} from "../../../lib/communication-note-composer";

type CommunicationNoteComposerProps = {
  locale: CommunicationNoteComposerLocale;
  unsupportedLocale?: boolean;
};

const INITIAL_CONFIRMATIONS: CommunicationNoteComposerConfirmations = {
  reviewedNoIdentifiers: false,
  processingAuthorityConfirmed: false,
};

export function CommunicationNoteComposer({
  locale,
  unsupportedLocale = false,
}: CommunicationNoteComposerProps) {
  const copy = getCommunicationNoteComposerCopy(locale);
  const surface = getSurfaceCopy(locale);
  const [draft, setDraft] = useState<CommunicationNoteComposerDraft>(() =>
    createEmptyCommunicationNoteComposerDraft(),
  );
  const [review, setReview] = useState<CommunicationNoteComposerReview>();
  const [reviewIsCurrent, setReviewIsCurrent] = useState(false);
  const [confirmations, setConfirmations] =
    useState<CommunicationNoteComposerConfirmations>(INITIAL_CONFIRMATIONS);
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  const issueByField = useMemo(() => {
    const issues = new Map<
      CommunicationNoteComposerField,
      CommunicationNoteComposerValidationIssue
    >();
    if (!reviewIsCurrent) {
      return issues;
    }
    review?.validationIssues.forEach((issue) => {
      if (!issues.has(issue.field)) {
        issues.set(issue.field, issue);
      }
    });
    return issues;
  }, [review, reviewIsCurrent]);

  const canConfirm = Boolean(
    reviewIsCurrent &&
      review?.cleanedFacts &&
      review.findings.length === 0 &&
      review.validationIssues.length === 0,
  );
  const readySubmission = buildCommunicationNoteSubmission(
    reviewIsCurrent ? review : undefined,
    confirmations,
  );

  function resetReview() {
    setReviewIsCurrent(false);
    setConfirmations(INITIAL_CONFIRMATIONS);
  }

  function updateTextField(
    field: Exclude<CommunicationNoteComposerField, "parties_by_role">,
    value: string,
  ) {
    setDraft((current) => ({ ...current, [field]: value }));
    resetReview();
  }

  function updateParties(value: string) {
    setDraft((current) => ({
      ...current,
      parties_by_role: value.split(/\r?\n/),
    }));
    resetReview();
  }

  function runLocalReview() {
    const nextReview = reviewCommunicationNoteDraft(draft, locale);
    setReview(nextReview);
    setReviewIsCurrent(true);
    setConfirmations(INITIAL_CONFIRMATIONS);

    if (nextReview.validationIssues.length > 0) {
      window.requestAnimationFrame(() => errorSummaryRef.current?.focus());
    }
  }

  function applySanitisedFacts() {
    if (!review) {
      return;
    }
    const sanitisedDraft = review.sanitisedDraft;
    const nextReview = reviewCommunicationNoteDraft(sanitisedDraft, locale);
    setDraft(sanitisedDraft);
    setReview(nextReview);
    setReviewIsCurrent(true);
    setConfirmations(INITIAL_CONFIRMATIONS);
  }

  return (
    <main className="case-note-page">
      <header className="case-note-brandbar border-b border-white/10">
        <div className="mx-auto flex min-h-16 max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
          <a
            href={buildCommunicationNoteWorkspaceHref("/ai-documents", locale)}
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
              href={buildCommunicationNoteWorkspaceHref(
                "/ai-documents",
                locale,
              )}
              className="inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-xs font-semibold text-white/78 hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              {surface.backToDocuments}
            </a>
            <nav
              aria-label={surface.languageLabel}
              className="flex items-center rounded-md border border-white/18 bg-white/8 p-1"
            >
              <Languages
                className="mx-2 size-4 text-white/72"
                aria-hidden="true"
              />
              {COMMUNICATION_NOTE_COMPOSER_LOCALES.map((supportedLocale) => (
                <a
                  key={supportedLocale}
                  href={buildCommunicationNoteLocaleHref(supportedLocale)}
                  hrefLang={supportedLocale}
                  lang={supportedLocale}
                  aria-current={supportedLocale === locale ? "page" : undefined}
                  className={`inline-flex min-h-9 items-center rounded px-2 text-xs font-semibold ${
                    supportedLocale === locale
                      ? "bg-white text-brand-dark"
                      : "text-white/72 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {surface.localeLabels[supportedLocale]}
                </a>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {unsupportedLocale ? (
          <div
            role="status"
            className="mb-5 border border-[#e2c891] bg-[#fff8e6] px-4 py-3 text-sm leading-6 text-[#705318]"
          >
            The requested language is not supported for this workflow. English
            is shown explicitly; choose another available language above.
          </div>
        ) : null}

        <section className="grid gap-5 border-b border-[#bfcfc7] pb-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)] lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="workspace-status-pill workspace-status-pill--warning">
                {surface.localOnly}
              </span>
              <span className="text-xs font-semibold text-muted">
                {surface.generationOffline}
              </span>
            </div>
            <h1 className="document-title mt-4 max-w-4xl sm:text-[2.75rem]">
              {copy.title}
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-muted">
              {copy.description}
            </p>
          </div>
          <ol className="care-glass grid grid-cols-3 overflow-hidden">
            {surface.steps.map((step, index) => (
              <li
                key={step}
                className="border-r border-[#b8ccc2] p-3 last:border-r-0 sm:p-4"
              >
                <span className="text-xs font-bold text-brand">
                  0{index + 1}
                </span>
                <p className="mt-2 text-xs font-semibold leading-5 text-[#304b42] sm:text-sm">
                  {step}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <div className="case-note-workspace mt-5">
          <section
            role="form"
            aria-label={surface.formLabel}
            className="document-paper overflow-hidden"
          >
            <div className="border-b border-line p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-md bg-[#e3f0e9] text-brand">
                  <MessageSquareText className="size-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">{surface.formTitle}</h2>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    {surface.memoryBoundary}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex gap-3 border border-[#e3c4b8] bg-[#fff4ef] p-3 text-sm leading-6 text-[#783f31]">
                <AlertTriangle
                  className="mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                <span>{copy.privacyBody}</span>
              </div>
            </div>

            <fieldset className="grid gap-5 p-5 sm:p-6">
              <legend className="sr-only">{surface.factLegend}</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <ComposerField
                  field="occurred_at"
                  label={copy.fieldLabels.occurred_at}
                  placeholder={copy.fieldPlaceholders.occurred_at}
                  issue={issueByField.get("occurred_at")}
                  issueText={getIssueText(
                    issueByField.get("occurred_at"),
                    copy.validationLabels,
                  )}
                  hint={surface.dateTimeHint}
                  value={draft.occurred_at}
                  onChange={(value) => updateTextField("occurred_at", value)}
                />
                <ComposerField
                  field="contact_channel"
                  label={copy.fieldLabels.contact_channel}
                  placeholder={copy.fieldPlaceholders.contact_channel}
                  issue={issueByField.get("contact_channel")}
                  issueText={getIssueText(
                    issueByField.get("contact_channel"),
                    copy.validationLabels,
                  )}
                  value={draft.contact_channel}
                  onChange={(value) =>
                    updateTextField("contact_channel", value)
                  }
                />
              </div>

              <ComposerField
                field="parties_by_role"
                label={copy.fieldLabels.parties_by_role}
                placeholder={copy.fieldPlaceholders.parties_by_role}
                issue={issueByField.get("parties_by_role")}
                issueText={getIssueText(
                  issueByField.get("parties_by_role"),
                  copy.validationLabels,
                )}
                hint={surface.rolesHint}
                value={draft.parties_by_role.join("\n")}
                onChange={updateParties}
                multiline
              />

              <ComposerField
                field="observable_facts"
                label={copy.fieldLabels.observable_facts}
                placeholder={copy.fieldPlaceholders.observable_facts}
                issue={issueByField.get("observable_facts")}
                issueText={getIssueText(
                  issueByField.get("observable_facts"),
                  copy.validationLabels,
                )}
                value={draft.observable_facts}
                onChange={(value) => updateTextField("observable_facts", value)}
                multiline
                rows={5}
              />

              <ComposerField
                field="action_taken"
                label={copy.fieldLabels.action_taken}
                placeholder={copy.fieldPlaceholders.action_taken}
                issue={issueByField.get("action_taken")}
                issueText={getIssueText(
                  issueByField.get("action_taken"),
                  copy.validationLabels,
                )}
                value={draft.action_taken}
                onChange={(value) => updateTextField("action_taken", value)}
                multiline
                rows={4}
              />

              <ComposerField
                field="stated_outcome"
                label={copy.fieldLabels.stated_outcome}
                placeholder={copy.fieldPlaceholders.stated_outcome}
                value={draft.stated_outcome}
                onChange={(value) => updateTextField("stated_outcome", value)}
                optionalLabel={copy.optionalLabel}
                multiline
                rows={3}
              />

              <ComposerField
                field="follow_up"
                label={copy.fieldLabels.follow_up}
                placeholder={copy.fieldPlaceholders.follow_up}
                value={draft.follow_up}
                onChange={(value) => updateTextField("follow_up", value)}
                optionalLabel={copy.optionalLabel}
                multiline
                rows={3}
              />

              {reviewIsCurrent && review?.validationIssues.length ? (
                <div
                  ref={errorSummaryRef}
                  role="alert"
                  tabIndex={-1}
                  className="border border-[#efc7c7] bg-[#fff2f2] px-4 py-3 text-sm leading-6 text-[#963b3b] outline-none focus-visible:ring-2 focus-visible:ring-[#963b3b]"
                >
                  {surface.fixFields(review.validationIssues.length)}
                </div>
              ) : null}

              <button
                type="button"
                onClick={runLocalReview}
                className="jade-action w-full"
              >
                <ShieldCheck className="size-4" aria-hidden="true" />
                {copy.reviewAction}
              </button>
            </fieldset>
          </section>

          <section
            className="document-paper case-note-result overflow-hidden"
            aria-labelledby="communication-note-review-title"
          >
            <div className="border-b border-line p-5 sm:p-6">
              <div className="flex items-center gap-2 text-brand">
                <ShieldCheck className="size-4" aria-hidden="true" />
                <p className="micro-label">{copy.privacyHeading}</p>
              </div>
              <h2
                id="communication-note-review-title"
                className="mt-3 text-lg font-semibold"
              >
                {reviewIsCurrent ? surface.reviewReady : surface.reviewWaiting}
              </h2>
              <p
                role="status"
                aria-live="polite"
                className="mt-2 text-sm leading-6 text-muted"
              >
                {getReviewStatus(review, reviewIsCurrent, surface)}
              </p>
            </div>

            <div className="grid gap-5 p-5 sm:p-6">
              {reviewIsCurrent && review?.findings.length ? (
                <section aria-labelledby="privacy-findings-title">
                  <h3
                    id="privacy-findings-title"
                    className="text-sm font-semibold text-foreground"
                  >
                    {surface.findingsTitle(review.findings.length)}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    {surface.findingsBoundary}
                  </p>
                  <ul className="mt-3 divide-y divide-[#dfd8c9] border-y border-[#dfd8c9]">
                    {review.findings.map((finding, index) => (
                      <li
                        key={`${finding.fieldPath}:${finding.startOffset}:${finding.kind}`}
                        className="grid gap-1 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                      >
                        <span className="font-semibold text-foreground">
                          {copy.findingLabels[finding.kind]}
                        </span>
                        <span className="text-xs text-muted">
                          {copy.fieldLabels[finding.field]} · {surface.finding(index + 1)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={applySanitisedFacts}
                    className="taito-secondary mt-4 w-full"
                  >
                    {surface.applyCleanedFacts}
                  </button>
                </section>
              ) : null}

              {reviewIsCurrent && review?.cleanedFacts ? (
                <CleanedFactsReview
                  review={review}
                  locale={locale}
                  emptyValue={surface.notProvided}
                />
              ) : (
                <div className="border border-dashed border-[#b8c9c0] bg-[#f7f8f4] p-5 text-sm leading-6 text-muted">
                  {surface.emptyReview}
                </div>
              )}

              <fieldset className="grid gap-3 border-t border-line pt-5">
                <legend className="text-sm font-semibold text-foreground">
                  {surface.confirmationTitle}
                </legend>
                {canConfirm ? (
                  <>
                    <Confirmation
                      id="communication-note-reviewed-identifiers"
                      checked={confirmations.reviewedNoIdentifiers}
                      label={copy.confirmationLabels.reviewedNoIdentifiers}
                      onChange={(checked) =>
                        setConfirmations((current) => ({
                          ...current,
                          reviewedNoIdentifiers: checked,
                        }))
                      }
                    />
                    <Confirmation
                      id="communication-note-processing-authority"
                      checked={confirmations.processingAuthorityConfirmed}
                      label={
                        copy.confirmationLabels.processingAuthorityConfirmed
                      }
                      onChange={(checked) =>
                        setConfirmations((current) => ({
                          ...current,
                          processingAuthorityConfirmed: checked,
                        }))
                      }
                    />
                    <p className="text-xs leading-5 text-muted">
                      {surface.authorityBoundary}
                    </p>
                  </>
                ) : (
                  <p
                    role="status"
                    className="border border-[#d8d3c7] bg-[#f5f1e8] px-3 py-2 text-sm leading-6 text-[#635f57]"
                  >
                    {surface.confirmationLocked}
                  </p>
                )}
              </fieldset>

              <div className="border-t border-line pt-5">
                <button
                  type="button"
                  disabled
                  aria-describedby="communication-note-generation-boundary"
                  className="coral-action w-full"
                >
                  <LockKeyhole className="size-4" aria-hidden="true" />
                  {readySubmission
                    ? surface.readyButOffline
                    : surface.generationUnavailable}
                </button>
                <p
                  id="communication-note-generation-boundary"
                  className="mt-3 text-center text-xs leading-5 text-muted"
                >
                  {surface.generationBoundary}
                </p>
              </div>
            </div>
          </section>

          <aside className="care-glass case-note-context" aria-label={surface.boundaryTitle}>
            <div className="flex items-center gap-2 text-brand">
              <LockKeyhole className="size-4" aria-hidden="true" />
              <p className="micro-label">{surface.boundaryTitle}</p>
            </div>
            <ul className="mt-4 grid gap-3 text-sm leading-6 text-muted">
              {surface.boundaries.map((boundary) => (
                <li key={boundary} className="flex gap-2">
                  <CheckCircle2
                    className="mt-1 size-4 shrink-0 text-brand"
                    aria-hidden="true"
                  />
                  <span>{boundary}</span>
                </li>
              ))}
            </ul>
            <a
              href={buildCommunicationNoteWorkspaceHref("/privacy", locale)}
              className="mt-5 inline-flex text-sm font-semibold text-brand hover:underline"
            >
              {surface.privacyNotice}
            </a>
          </aside>
        </div>
      </div>
    </main>
  );
}

function ComposerField({
  field,
  label,
  placeholder,
  value,
  onChange,
  issue,
  issueText,
  hint,
  optionalLabel,
  multiline = false,
  rows = 3,
}: {
  field: CommunicationNoteComposerField;
  label: string;
  placeholder: string;
  value: string;
  onChange(value: string): void;
  issue?: CommunicationNoteComposerValidationIssue;
  issueText?: string;
  hint?: string;
  optionalLabel?: string;
  multiline?: boolean;
  rows?: number;
}) {
  const fieldId = `communication-note-${field}`;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = issue ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const className = `case-note-input ${issue ? "case-note-input--error" : ""}`;
  const common = {
    id: fieldId,
    name: field,
    value,
    placeholder,
    "aria-invalid": issue ? (true as const) : undefined,
    "aria-describedby": describedBy,
    className,
    autoComplete: "off",
    spellCheck: false,
  };

  return (
    <div className="case-note-field">
      <label htmlFor={fieldId}>
        {label}
        {optionalLabel ? (
          <span className="ml-2 text-xs font-normal text-muted">
            {optionalLabel}
          </span>
        ) : null}
      </label>
      {hint ? (
        <span id={hintId} className="text-xs font-normal leading-5 text-muted">
          {hint}
        </span>
      ) : null}
      {multiline ? (
        <textarea
          {...common}
          required={!optionalLabel}
          rows={rows}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          {...common}
          type="text"
          required={!optionalLabel}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {issue && issueText ? (
        <span
          id={errorId}
          className="text-xs font-semibold leading-5 text-danger"
        >
          {issueText}
        </span>
      ) : null}
    </div>
  );
}

function Confirmation({
  id,
  checked,
  label,
  onChange,
}: {
  id: string;
  checked: boolean;
  label: string;
  onChange(checked: boolean): void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3 border border-[#c7d5ce] bg-[#f7faf8] p-3 text-sm leading-6 text-[#304b42]"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 size-4 accent-[#0b5c4d]"
      />
      <span>{label}</span>
    </label>
  );
}

function CleanedFactsReview({
  review,
  locale,
  emptyValue,
}: {
  review: CommunicationNoteComposerReview;
  locale: CommunicationNoteComposerLocale;
  emptyValue: string;
}) {
  const copy = getCommunicationNoteComposerCopy(locale);
  if (!review.cleanedFacts) {
    return null;
  }

  return (
    <section aria-labelledby="cleaned-facts-title">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="size-4 text-brand" aria-hidden="true" />
        <h3 id="cleaned-facts-title" className="text-sm font-semibold">
          {copy.readyMessage}
        </h3>
      </div>
      <dl className="mt-3 divide-y divide-line border-y border-line">
        {COMMUNICATION_NOTE_COMPOSER_FIELDS.map((field) => {
          const value = review.cleanedFacts?.[field];
          return (
            <div key={field} className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr]">
              <dt className="text-xs font-semibold text-muted">
                {copy.fieldLabels[field]}
              </dt>
              <dd className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                {Array.isArray(value)
                  ? value.join("\n")
                  : value || emptyValue}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function getIssueText(
  issue: CommunicationNoteComposerValidationIssue | undefined,
  labels: ReturnType<
    typeof getCommunicationNoteComposerCopy
  >["validationLabels"],
) {
  return issue ? labels[issue.code] : undefined;
}

function getReviewStatus(
  review: CommunicationNoteComposerReview | undefined,
  reviewIsCurrent: boolean,
  surface: SurfaceCopy,
) {
  if (!review || !reviewIsCurrent) {
    return surface.reviewWaitingDetail;
  }
  if (review.validationIssues.length > 0) {
    return surface.fixFields(review.validationIssues.length);
  }
  if (review.findings.length > 0) {
    return surface.findingsStatus(review.findings.length);
  }
  return surface.cleanStatus;
}

export function buildCommunicationNoteLocaleHref(
  locale: CommunicationNoteComposerLocale,
) {
  return `/ai-documents/communication-note?lang=${encodeURIComponent(locale)}`;
}

export function buildCommunicationNoteWorkspaceHref(
  path: "/ai-documents" | "/privacy",
  locale: CommunicationNoteComposerLocale,
) {
  const supportedLocale = locale === "zh-Hant" ? "en" : locale;
  return `${path}?lang=${encodeURIComponent(supportedLocale)}`;
}

type SurfaceCopy = {
  backToDocuments: string;
  languageLabel: string;
  localeLabels: Record<CommunicationNoteComposerLocale, string>;
  localOnly: string;
  generationOffline: string;
  steps: readonly [string, string, string];
  formLabel: string;
  formTitle: string;
  memoryBoundary: string;
  factLegend: string;
  dateTimeHint: string;
  rolesHint: string;
  reviewReady: string;
  reviewWaiting: string;
  reviewWaitingDetail: string;
  cleanStatus: string;
  emptyReview: string;
  findingsBoundary: string;
  applyCleanedFacts: string;
  confirmationTitle: string;
  confirmationLocked: string;
  authorityBoundary: string;
  generationUnavailable: string;
  readyButOffline: string;
  generationBoundary: string;
  boundaryTitle: string;
  boundaries: readonly string[];
  privacyNotice: string;
  notProvided: string;
  fixFields(count: number): string;
  findingsTitle(count: number): string;
  findingsStatus(count: number): string;
  finding(index: number): string;
};

const SURFACE_COPY: Record<CommunicationNoteComposerLocale, SurfaceCopy> = {
  en: {
    backToDocuments: "Back to AI Documents",
    languageLabel: "Communication Note language",
    localeLabels: { en: "EN", "zh-Hans": "简", "zh-Hant": "繁" },
    localOnly: "Browser memory only",
    generationOffline: "Generation is not connected",
    steps: ["Enter facts", "Review privacy", "Confirm readiness"],
    formLabel: "Communication Note structured facts",
    formTitle: "Enter de-identified communication facts",
    memoryBoundary:
      "This form stays in this browser tab. It is not saved or sent by this workspace.",
    factLegend: "Communication facts",
    dateTimeHint:
      "Use RFC3339 with a timezone, for example 2026-09-01T14:30:00+10:00.",
    rolesHint: "Enter one role per line. Do not enter names.",
    reviewReady: "Local review",
    reviewWaiting: "Review not started",
    reviewWaitingDetail:
      "Complete the required facts, then run the browser-only privacy review.",
    cleanStatus: "No obvious identifiers were found in the cleaned facts.",
    emptyReview:
      "Cleaned facts will appear here after the local privacy review.",
    findingsBoundary:
      "Only finding type and field are shown. Matched identifier text is not copied into the review result.",
    applyCleanedFacts: "Apply clean-up and review again",
    confirmationTitle: "Confirm before any future generation",
    confirmationLocked:
      "Complete a clean local review before the confirmations become available.",
    authorityBoundary:
      "Processing authority does not state or replace participant consent.",
    generationUnavailable: "Generation unavailable",
    readyButOffline: "Ready locally · generation unavailable",
    generationBoundary:
      "No model, Product API, Points, save or export action is connected in this release slice.",
    boundaryTitle: "Current boundary",
    boundaries: [
      "No facts leave this browser tab.",
      "No draft is generated, saved or exported.",
      "This workflow does not provide clinical, legal, care, regulatory or compliance advice.",
    ],
    privacyNotice: "Privacy, collection & retention",
    notProvided: "Not provided",
    fixFields: (count) =>
      `${count} field${count === 1 ? " needs" : "s need"} attention before review can finish.`,
    findingsTitle: (count) =>
      `${count} obvious identifier finding${count === 1 ? "" : "s"}`,
    findingsStatus: (count) =>
      `${count} obvious identifier finding${count === 1 ? " was" : "s were"} removed from the cleaned preview. Apply the cleaned facts and review again.`,
    finding: (index) => `Finding ${index}`,
  },
  "zh-Hans": {
    backToDocuments: "返回 AI 文档",
    languageLabel: "Communication Note 语言",
    localeLabels: { en: "EN", "zh-Hans": "简", "zh-Hant": "繁" },
    localOnly: "仅保留在浏览器内存",
    generationOffline: "生成功能尚未连接",
    steps: ["输入事实", "检查隐私", "确认准备状态"],
    formLabel: "沟通记录结构化事实",
    formTitle: "输入已去标识化的沟通事实",
    memoryBoundary:
      "此表单仅保留在当前浏览器标签页，不会由此工作区保存或发送。",
    factLegend: "沟通事实",
    dateTimeHint:
      "请使用带时区的 RFC3339 格式，例如 2026-09-01T14:30:00+10:00。",
    rolesHint: "每行输入一个角色，请勿填写姓名。",
    reviewReady: "本地复核",
    reviewWaiting: "尚未开始复核",
    reviewWaitingDetail: "填写必填事实后，在浏览器内进行隐私检查。",
    cleanStatus: "清理后的事实中未发现明显标识符。",
    emptyReview: "完成本地隐私检查后，清理后的事实会显示在这里。",
    findingsBoundary:
      "这里只显示发现类型和字段；匹配到的标识符原文不会复制到复核结果中。",
    applyCleanedFacts: "应用清理结果并再次检查",
    confirmationTitle: "为后续生成步骤进行确认",
    confirmationLocked: "完成无明显标识符的本地复核后，才能进行两项确认。",
    authorityBoundary: "处理权限确认不代表或替代 participant consent。",
    generationUnavailable: "生成功能不可用",
    readyButOffline: "本地已准备 · 生成功能不可用",
    generationBoundary:
      "此版本未连接模型、Product API、Points、保存或导出操作。",
    boundaryTitle: "当前边界",
    boundaries: [
      "事实不会离开当前浏览器标签页。",
      "不会生成、保存或导出草稿。",
      "此流程不提供临床、法律、照护、监管或合规建议。",
    ],
    privacyNotice: "隐私、收集与保留说明",
    notProvided: "未提供",
    fixFields: (count) => `复核完成前还有 ${count} 个字段需要处理。`,
    findingsTitle: (count) => `发现 ${count} 个明显标识符`,
    findingsStatus: (count) =>
      `已从清理预览中移除 ${count} 个明显标识符。请应用清理结果并再次检查。`,
    finding: (index) => `发现 ${index}`,
  },
  "zh-Hant": {
    backToDocuments: "返回 AI 文件（英文）",
    languageLabel: "Communication Note 語言",
    localeLabels: { en: "EN", "zh-Hans": "簡", "zh-Hant": "繁" },
    localOnly: "僅保留在瀏覽器記憶體",
    generationOffline: "產生功能尚未連接",
    steps: ["輸入事實", "檢查隱私", "確認準備狀態"],
    formLabel: "溝通記錄結構化事實",
    formTitle: "輸入已去識別化的溝通事實",
    memoryBoundary:
      "此表單僅保留在目前瀏覽器分頁，不會由此工作區儲存或傳送。",
    factLegend: "溝通事實",
    dateTimeHint:
      "請使用帶時區的 RFC3339 格式，例如 2026-09-01T14:30:00+10:00。",
    rolesHint: "每行輸入一個角色，請勿填寫姓名。",
    reviewReady: "本機複核",
    reviewWaiting: "尚未開始複核",
    reviewWaitingDetail: "填寫必填事實後，在瀏覽器內進行隱私檢查。",
    cleanStatus: "清理後的事實中未發現明顯識別符。",
    emptyReview: "完成本機隱私檢查後，清理後的事實會顯示在這裡。",
    findingsBoundary:
      "這裡只顯示發現類型和欄位；配對到的識別符原文不會複製到複核結果中。",
    applyCleanedFacts: "套用清理結果並再次檢查",
    confirmationTitle: "為後續產生步驟進行確認",
    confirmationLocked: "完成無明顯識別符的本機複核後，才能進行兩項確認。",
    authorityBoundary: "處理權限確認不代表或取代 participant consent。",
    generationUnavailable: "產生功能不可用",
    readyButOffline: "本機已準備 · 產生功能不可用",
    generationBoundary:
      "此版本未連接模型、Product API、Points、儲存或匯出操作。",
    boundaryTitle: "目前邊界",
    boundaries: [
      "事實不會離開目前瀏覽器分頁。",
      "不會產生、儲存或匯出草稿。",
      "此流程不提供臨床、法律、照護、監管或合規建議。",
    ],
    privacyNotice: "隱私、收集與保留說明（英文）",
    notProvided: "未提供",
    fixFields: (count) => `複核完成前還有 ${count} 個欄位需要處理。`,
    findingsTitle: (count) => `發現 ${count} 個明顯識別符`,
    findingsStatus: (count) =>
      `已從清理預覽中移除 ${count} 個明顯識別符。請套用清理結果並再次檢查。`,
    finding: (index) => `發現 ${index}`,
  },
};

function getSurfaceCopy(locale: CommunicationNoteComposerLocale) {
  return SURFACE_COPY[locale];
}
