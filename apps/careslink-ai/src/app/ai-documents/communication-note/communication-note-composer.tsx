"use client";

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Coins,
  Languages,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  UNAVAILABLE_COMMUNICATION_NOTE_POINTS_PREVIEW,
  type CommunicationNotePointsPreview,
} from "../../../lib/communication-note-points-preview";
import {
  submitCommunicationNoteGeneration,
  type CommunicationNoteGenerationClientResult,
} from "../../../lib/communication-note-generation-client";
import type { CommunicationNoteGenerationJob } from "../../../lib/communication-note-generation-contract";

type CommunicationNoteComposerProps = {
  locale: CommunicationNoteComposerLocale;
  pointsPreview?: CommunicationNotePointsPreview;
  unsupportedLocale?: boolean;
  /** Server-owned capability flag. Production keeps this false until rollout. */
  generationAvailable?: boolean;
};

const INITIAL_CONFIRMATIONS: CommunicationNoteComposerConfirmations = {
  reviewedNoIdentifiers: false,
  processingAuthorityConfirmed: false,
};
const GENERATION_POLL_INTERVAL_MS = 1_500;
const GENERATION_MAX_AUTOMATIC_POLLS = 40;

export function CommunicationNoteComposer({
  locale,
  pointsPreview = UNAVAILABLE_COMMUNICATION_NOTE_POINTS_PREVIEW,
  unsupportedLocale = false,
  generationAvailable = false,
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
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const requestRef = useRef<
    Readonly<{ body: string; idempotencyKey: string }> | undefined
  >(undefined);
  const abortControllerRef = useRef<AbortController | undefined>(undefined);
  const replayTimerRef = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);
  const automaticPollCountRef = useRef(0);
  const [generationJob, setGenerationJob] =
    useState<CommunicationNoteGenerationJob>();
  const [generationError, setGenerationError] = useState<string>();
  const [generationPending, setGenerationPending] = useState(false);
  const [requestLocked, setRequestLocked] = useState(false);
  const generationCopy = getGenerationSurfaceCopy(locale);

  function clearReplayTimer() {
    if (replayTimerRef.current !== undefined) {
      clearTimeout(replayTimerRef.current);
      replayTimerRef.current = undefined;
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
      clearReplayTimer();
    };
  }, []);

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
  const canGenerate = Boolean(
    generationAvailable &&
      readySubmission &&
      pointsPreview.status === "AVAILABLE" &&
      pointsPreview.canAfford &&
      !requestLocked,
  );

  async function replayGenerationStatus() {
    const request = requestRef.current;
    if (!request || inFlightRef.current) return;
    clearReplayTimer();
    inFlightRef.current = true;
    setGenerationPending(true);
    setGenerationError(undefined);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      const result = await submitCommunicationNoteGeneration({
        ...request,
        signal: controller.signal,
      });
      if (!mountedRef.current || requestRef.current !== request) return;
      handleGenerationResult(result, request);
    } catch {
      if (!mountedRef.current || controller.signal.aborted) return;
      setGenerationError(generationCopy.transportError);
    } finally {
      if (requestRef.current === request) inFlightRef.current = false;
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = undefined;
      }
      if (mountedRef.current) setGenerationPending(false);
    }
  }

  function handleGenerationResult(
    result: CommunicationNoteGenerationClientResult,
    request: Readonly<{ body: string; idempotencyKey: string }>,
  ) {
    clearReplayTimer();
    if (!result.ok) {
      setGenerationError(generationCopy.error(result.error.code));
      return;
    }
    const job = result.admission.job;
    setGenerationJob(job);
    if (job.status === "QUEUED" || job.status === "RUNNING") {
      if (
        automaticPollCountRef.current >= GENERATION_MAX_AUTOMATIC_POLLS
      ) {
        setGenerationError(generationCopy.pollingPaused);
        return;
      }
      replayTimerRef.current = setTimeout(() => {
        replayTimerRef.current = undefined;
        if (requestRef.current === request) {
          automaticPollCountRef.current += 1;
          void replayGenerationStatus();
        }
      }, GENERATION_POLL_INTERVAL_MS);
    }
  }

  async function submitGeneration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canGenerate || !readySubmission || inFlightRef.current) return;
    const request = Object.freeze({
      body: JSON.stringify(readySubmission),
      idempotencyKey: window.crypto.randomUUID(),
    });
    clearReplayTimer();
    automaticPollCountRef.current = 0;
    setRequestLocked(true);
    requestRef.current = request;
    await replayGenerationStatus();
  }

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
                {generationAvailable ? generationCopy.connected : surface.localOnly}
              </span>
              <span className="text-xs font-semibold text-muted">
                {generationAvailable ? generationCopy.serverGeneration : surface.generationOffline}
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

        <form
          className="case-note-workspace mt-5"
          onSubmit={submitGeneration}
          aria-busy={generationPending}
          aria-label={surface.formLabel}
        >
          <section className="document-paper overflow-hidden">
            <div className="border-b border-line p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-md bg-[#e3f0e9] text-brand">
                  <MessageSquareText className="size-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">{surface.formTitle}</h2>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    {generationAvailable ? generationCopy.memoryBoundary : surface.memoryBoundary}
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
                  disabled={requestLocked}
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
                  disabled={requestLocked}
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
                disabled={requestLocked}
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
                disabled={requestLocked}
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
                disabled={requestLocked}
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
                disabled={requestLocked}
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
                disabled={requestLocked}
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
                disabled={requestLocked}
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
                      disabled={requestLocked}
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
                      disabled={requestLocked}
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
                <section
                  aria-labelledby="communication-note-points-title"
                  className="mb-5 border border-line bg-brand-soft p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <Coins
                        className="mt-0.5 size-5 shrink-0 text-brand"
                        aria-hidden="true"
                      />
                      <div>
                        <h3
                          id="communication-note-points-title"
                          className="text-sm font-semibold text-foreground"
                        >
                          <span lang="en-AU">Points</span>
                          {generationAvailable ? generationCopy.pointsTitle : surface.pointsTitle}
                        </h3>
                        <p className="mt-1 text-sm leading-6 text-foreground">
                          {generationAvailable
                            ? generationCopy.pointsBalance(pointsPreview, locale)
                            : getPointsBalanceText(pointsPreview, surface, locale)}
                        </p>
                      </div>
                    </div>
                    <span className="workspace-status-pill shrink-0">
                      {generationAvailable ? generationCopy.pointsStatus : surface.pointsReadOnly}
                    </span>
                  </div>

                  {pointsPreview.status !== "UNAVAILABLE" ? (
                    <div className="mt-4 border-t border-line pt-3">
                      <p className="text-sm font-semibold text-foreground">
                        {surface.pointsCost(
                          formatPointsNumber(
                            pointsPreview.generationCostPoints,
                            locale,
                          ),
                        )}
                        <span lang="en-AU">Points</span>
                        {surface.pointsSentenceEnd}
                      </p>
                      {pointsPreview.status === "AVAILABLE" &&
                      !pointsPreview.canAfford ? (
                        <p className="mt-1 text-xs font-semibold leading-5 text-danger">
                          {surface.pointsInsufficient}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <p className="mt-3 text-xs leading-5 text-foreground">
                    {generationAvailable ? generationCopy.pointsBoundary : surface.pointsBoundary}
                  </p>
                </section>

                <button
                  type="submit"
                  disabled={!canGenerate}
                  aria-describedby="communication-note-generation-boundary"
                  className="coral-action w-full"
                >
                  <LockKeyhole className="size-4" aria-hidden="true" />
                  {generationAvailable
                    ? generationCopy.action
                    : readySubmission
                    ? surface.readyButOffline
                    : surface.generationUnavailable}
                </button>
                <p
                  id="communication-note-generation-boundary"
                  className="mt-3 text-center text-xs leading-5 text-muted"
                >
                  {generationAvailable
                    ? generationCopy.boundary(pointsPreview.status === "AVAILABLE" ? formatPointsNumber(pointsPreview.generationCostPoints, locale) : undefined)
                    : surface.generationBoundary}
                </p>
                {generationJob ? (
                  <p role="status" aria-live="polite" className="mt-3 text-sm leading-6 text-foreground">
                    {generationCopy.status(generationJob.status)}
                  </p>
                ) : null}
                {generationError ? (
                  <div role="alert" className="mt-3 border border-[#efc7c7] bg-[#fff2f2] px-3 py-2 text-sm text-danger">
                    {generationError}
                    <button type="button" className="taito-secondary mt-2 w-full" onClick={() => void replayGenerationStatus()}>
                      {generationCopy.checkStatus}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <aside className="care-glass case-note-context" aria-label={surface.boundaryTitle}>
            <div className="flex items-center gap-2 text-brand">
              <LockKeyhole className="size-4" aria-hidden="true" />
              <p className="micro-label">{surface.boundaryTitle}</p>
            </div>
            <ul className="mt-4 grid gap-3 text-sm leading-6 text-muted">
              {(generationAvailable ? generationCopy.boundaries : surface.boundaries).map((boundary) => (
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
        </form>
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
  disabled = false,
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
  disabled?: boolean;
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
    disabled,
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
  disabled = false,
}: {
  id: string;
  checked: boolean;
  label: string;
  onChange(checked: boolean): void;
  disabled?: boolean;
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
        disabled={disabled}
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

type GenerationSurfaceCopy = Readonly<{
  connected: string;
  serverGeneration: string;
  memoryBoundary: string;
  pointsBoundary: string;
  pointsTitle: string;
  pointsStatus: string;
  boundaries: readonly string[];
  pointsBalance(preview: CommunicationNotePointsPreview, locale: CommunicationNoteComposerLocale): string;
  action: string;
  checkStatus: string;
  transportError: string;
  pollingPaused: string;
  boundary(cost?: string): string;
  status(status: CommunicationNoteGenerationJob["status"]): string;
  error(code: string): string;
}>;

function getGenerationSurfaceCopy(
  locale: CommunicationNoteComposerLocale,
): GenerationSurfaceCopy {
  if (locale === "zh-Hans") {
    return {
      connected: "安全服务器生成",
      serverGeneration: "安全队列 · 异步生成",
      memoryBoundary: "本地隐私检查完成并确认后，清理后的事实会发送至 CaresLink 服务器。",
      pointsBoundary: "提交后由服务器重新核验并预留 Points；页面不会自行扣减余额。",
      pointsTitle: " · 服务器核验",
      pointsStatus: "服务器管理",
      boundaries: ["只有完成本地检查并确认的清理事实才会发送至服务器。", "生成任务与正式草稿由服务器保存；页面离开不会取消任务。", "本工作流不提供临床、法律、护理、监管或合规建议。"],
      pointsBalance: connectedPointsBalanceZhHans,
      action: "提交生成 Communication Note",
      checkStatus: "安全查询状态",
      transportError: "暂时无法确认生成状态。可使用相同请求安全查询；离开页面不会取消服务器任务。",
      pollingPaused: "自动状态查询已暂停。任务可能仍在服务器运行；请使用相同请求安全查询状态。",
      boundary: (cost) => `服务器将在接纳请求时重新核验${cost ? `并预留 ${cost} Points` : " Points"}。AI 会异步生成并保存正式草稿；内容不构成专业建议。`,
      status: generationStatusZhHans,
      error: generationErrorZhHans,
    };
  }
  if (locale === "zh-Hant") {
    return {
      connected: "安全伺服器生成",
      serverGeneration: "安全佇列 · 非同步生成",
      memoryBoundary: "本機私隱檢查完成並確認後，清理後的事實會傳送至 CaresLink 伺服器。",
      pointsBoundary: "提交後由伺服器重新核驗並預留 Points；頁面不會自行扣減餘額。",
      pointsTitle: " · 伺服器核驗",
      pointsStatus: "伺服器管理",
      boundaries: ["只有完成本機檢查並確認的清理事實才會傳送至伺服器。", "生成任務與正式草稿由伺服器儲存；離開頁面不會取消任務。", "本工作流程不提供臨床、法律、護理、監管或合規建議。"],
      pointsBalance: connectedPointsBalanceZhHant,
      action: "提交生成 Communication Note",
      checkStatus: "安全查詢狀態",
      transportError: "暫時無法確認生成狀態。可使用相同請求安全查詢；離開頁面不會取消伺服器任務。",
      pollingPaused: "自動狀態查詢已暫停。任務可能仍在伺服器運行；請使用相同請求安全查詢狀態。",
      boundary: (cost) => `伺服器將在接納請求時重新核驗${cost ? `並預留 ${cost} Points` : " Points"}。AI 會非同步生成並儲存正式草稿；內容不構成專業建議。`,
      status: generationStatusZhHant,
      error: generationErrorZhHant,
    };
  }
  return {
    connected: "Secure server generation",
    serverGeneration: "Secure queue · asynchronous generation",
    memoryBoundary: "After local privacy review and confirmation, cleaned facts are sent to the CaresLink server.",
    pointsBoundary: "The server rechecks and reserves Points on submission. This page never subtracts the balance itself.",
    pointsTitle: " · server verified",
    pointsStatus: "Server managed",
    boundaries: ["Only cleaned facts that pass local review and confirmation are sent to the server.", "The generation job and canonical draft are saved server-side; leaving does not cancel the job.", "This workflow does not provide clinical, legal, care, regulatory or compliance advice."],
    pointsBalance: (preview, numberLocale) => preview.status === "AVAILABLE"
      ? `Page-load balance snapshot: ${formatPointsNumber(preview.availablePoints, numberLocale)} available · ${formatPointsNumber(preview.reservedPoints, numberLocale)} reserved`
      : preview.status === "NOT_READY" ? "The Points balance is not ready for this account." : "The Points rate and balance are unavailable.",
    action: "Submit Communication Note generation",
    checkStatus: "Check status safely",
    transportError: "Generation status cannot be confirmed right now. You can safely replay the same request; leaving this page does not cancel server work.",
    pollingPaused: "Automatic status checks have paused. The job may still be running on the server; check the same request safely.",
    boundary: (cost) => `On admission the server rechecks eligibility${cost ? ` and reserves ${cost} Points` : " and the Points cost"}. AI generation is asynchronous and saves a canonical draft. It is not professional advice.`,
    status: (status) => ({
      QUEUED: "Generation queued. Points are reserved by the server.",
      RUNNING: "Generation is running. Leaving this page does not cancel server work.",
      SUCCEEDED: "Communication Note draft generated and saved by the server.",
      FAILED: "Communication Note generation failed. The server has finalised the job.",
      CANCELLED: "Communication Note generation was cancelled by the server.",
    })[status],
    error: generationErrorEn,
  };
}

function generationStatusZhHans(status: CommunicationNoteGenerationJob["status"]) {
  return ({ QUEUED: "生成任务已排队，Points 已由服务器预留。", RUNNING: "正在生成；离开页面不会取消服务器任务。", SUCCEEDED: "Communication Note 草稿已由服务器生成并保存。", FAILED: "生成失败，服务器已结束该任务。", CANCELLED: "服务器已取消生成任务。" })[status];
}
function generationStatusZhHant(status: CommunicationNoteGenerationJob["status"]) {
  return ({ QUEUED: "生成任務已排隊，Points 已由伺服器預留。", RUNNING: "正在生成；離開頁面不會取消伺服器任務。", SUCCEEDED: "Communication Note 草稿已由伺服器生成並儲存。", FAILED: "生成失敗，伺服器已結束該任務。", CANCELLED: "伺服器已取消生成任務。" })[status];
}
function generationErrorEn(code: string) {
  const reason = code === "POINTS_INSUFFICIENT"
    ? "The server reports insufficient Points. The page-load balance snapshot may be out of date. "
    : "";
  return `${reason}The server did not confirm whether this exact request was accepted. To avoid duplicate work, this page stays locked; check the same request safely.`;
}
function generationErrorZhHans(code: string) {
  const reason = code === "POINTS_INSUFFICIENT"
    ? "服务器报告 Points 余额不足。页面载入时的余额快照可能已过期。"
    : "";
  return `${reason}服务器未确认是否已接纳此精确请求。为避免重复生成，页面会保持锁定；请使用相同请求安全查询状态。`;
}
function generationErrorZhHant(code: string) {
  const reason = code === "POINTS_INSUFFICIENT"
    ? "伺服器回報 Points 餘額不足。頁面載入時的餘額快照可能已過期。"
    : "";
  return `${reason}伺服器未確認是否已接納此精確請求。為避免重複生成，頁面會保持鎖定；請使用相同請求安全查詢狀態。`;
}
function connectedPointsBalanceZhHans(preview: CommunicationNotePointsPreview, locale: CommunicationNoteComposerLocale) {
  return preview.status === "AVAILABLE" ? `页面载入时余额：可用 ${formatPointsNumber(preview.availablePoints, locale)} · 已预留 ${formatPointsNumber(preview.reservedPoints, locale)}` : preview.status === "NOT_READY" ? "此账户的 Points 余额尚未就绪。" : "Points 费率和余额不可用。";
}
function connectedPointsBalanceZhHant(preview: CommunicationNotePointsPreview, locale: CommunicationNoteComposerLocale) {
  return preview.status === "AVAILABLE" ? `頁面載入時餘額：可用 ${formatPointsNumber(preview.availablePoints, locale)} · 已預留 ${formatPointsNumber(preview.reservedPoints, locale)}` : preview.status === "NOT_READY" ? "此帳戶的 Points 餘額尚未就緒。" : "Points 費率和餘額不可用。";
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
  pointsTitle: string;
  pointsReadOnly: string;
  pointsNotReady: string;
  pointsUnavailable: string;
  pointsInsufficient: string;
  pointsBoundary: string;
  pointsBalance(available: string, reserved: string): string;
  pointsCost(cost: string): string;
  pointsSentenceEnd: string;
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
    pointsTitle: " preview · not active",
    pointsReadOnly: "Not active",
    pointsNotReady: "The shadow balance is not ready for this account.",
    pointsUnavailable: "The shadow rate and balance are unavailable.",
    pointsInsufficient: "The shadow balance would not cover this generation.",
    pointsBoundary:
      "Viewing this preview does not reserve or use Points. Shadow balances cannot yet be spent in this workflow.",
    pointsBalance: (available, reserved) =>
      `Shadow balance: ${available} available · ${reserved} already reserved`,
    pointsCost: (cost) =>
      `If this preview is activated, a generation would cost ${cost} `,
    pointsSentenceEnd: ".",
    generationUnavailable: "Generation unavailable",
    readyButOffline: "Ready locally · generation unavailable",
    generationBoundary:
      "This shadow preview is read only and not active. Viewing it does not reserve or use Points; model generation, save and export remain unavailable.",
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
    pointsTitle: " 预览（尚未启用）",
    pointsReadOnly: "尚未启用",
    pointsNotReady: "此账户的预览余额尚未就绪。",
    pointsUnavailable: "暂时无法读取预览费率和余额。",
    pointsInsufficient: "此预览余额预计不足以完成本次生成。",
    pointsBoundary:
      "查看此预览不会造成预扣或使用；此流程目前不能消费预览余额。",
    pointsBalance: (available, reserved) =>
      `预览余额：可用 ${available} · 已有预扣 ${reserved}`,
    pointsCost: (cost) => `此预览正式启用后，每次生成预计需要 ${cost} `,
    pointsSentenceEnd: "。",
    generationUnavailable: "生成功能不可用",
    readyButOffline: "本地已准备 · 生成功能不可用",
    generationBoundary:
      "此预览尚未启用。查看预览不会造成预扣或使用；模型生成、保存和导出仍不可用。",
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
    pointsTitle: " 預覽（尚未啟用）",
    pointsReadOnly: "尚未啟用",
    pointsNotReady: "此帳戶的預覽餘額尚未就緒。",
    pointsUnavailable: "暫時無法讀取預覽費率和餘額。",
    pointsInsufficient: "此預覽餘額預計不足以完成本次產生。",
    pointsBoundary:
      "查看此預覽不會造成預扣或使用；此流程目前不能消費預覽餘額。",
    pointsBalance: (available, reserved) =>
      `預覽餘額：可用 ${available} · 已有預扣 ${reserved}`,
    pointsCost: (cost) => `此預覽正式啟用後，每次產生預計需要 ${cost} `,
    pointsSentenceEnd: "。",
    generationUnavailable: "產生功能不可用",
    readyButOffline: "本機已準備 · 產生功能不可用",
    generationBoundary:
      "此預覽尚未啟用。查看預覽不會造成預扣或使用；模型產生、儲存和匯出仍不可用。",
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

function getPointsBalanceText(
  preview: CommunicationNotePointsPreview,
  surface: SurfaceCopy,
  locale: CommunicationNoteComposerLocale,
) {
  if (preview.status === "AVAILABLE") {
    return surface.pointsBalance(
      formatPointsNumber(preview.availablePoints, locale),
      formatPointsNumber(preview.reservedPoints, locale),
    );
  }
  if (preview.status === "NOT_READY") {
    return surface.pointsNotReady;
  }
  return surface.pointsUnavailable;
}

function formatPointsNumber(
  value: number,
  locale: CommunicationNoteComposerLocale,
) {
  return new Intl.NumberFormat(locale === "en" ? "en-AU" : locale).format(
    value,
  );
}
