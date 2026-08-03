"use client";

import {
  AlertTriangle,
  ArrowRight,
  Check,
  ClipboardCheck,
  FileText,
  History,
  Languages,
  LockKeyhole,
  Menu,
  Save,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { GeneratedDraftCopyButton } from "../../../components/generated-draft-copy-button";
import type {
  GeneratedMaterialDraftStatus,
} from "../../../lib/generated-material-draft-store";
import type {
  NdisCaseNoteCompanionAttribution,
} from "../../../lib/ndis-case-note-companion-store";
import {
  buildNdisCaseNoteCompanionHref,
} from "../../../lib/ndis-case-note-companion-navigation";
import {
  getNdisCaseNoteMaterialCopyText,
  NDIS_CASE_NOTE_INPUT_LIMITS,
  type NdisCaseNoteCompanionInput,
  type NdisCaseNoteInputIssue,
  type NdisCaseNoteMaterial,
} from "../../../lib/ndis-case-note-companion";
import {
  areNdisCaseNotePrivacyFindingsResolved,
  buildNdisCaseNoteGenerationRequest,
  getMissingNdisCaseNoteMinimumFacts,
  getNdisCaseNotePrivacyFindingText,
  reviewPastedChineseCaseNotes,
  reviewStructuredNdisCaseNoteInput,
  type NdisCaseNoteBrowserPrivacyReview,
  type NdisCaseNoteInputMode,
  type NdisCaseNotePrivacyConfirmations,
  type NdisCaseNotePrivacyFinding,
  type NdisCaseNotePrivacyResolution,
  type NdisCaseNotePrivacyResolutionMap,
} from "../../../lib/ndis-case-note-browser-privacy";

export type SavedNdisCaseNoteDraft = {
  id: string;
  material: NdisCaseNoteMaterial;
  status: GeneratedMaterialDraftStatus;
  createdAt: string;
};

type NdisCaseNoteCompanionProps = {
  attribution: NdisCaseNoteCompanionAttribution;
  initialClaimToken?: string;
  initialMaterial?: NdisCaseNoteMaterial;
  autoSave: boolean;
  savedDrafts: SavedNdisCaseNoteDraft[];
};

type CompanionApiResult =
  | {
      ok: true;
      material: NdisCaseNoteMaterial;
      claimToken: string;
    }
  | {
      ok: false;
      code?: string;
      error?: string;
      issues?: NdisCaseNoteInputIssue[];
    };

type SaveApiResult = {
  ok: boolean;
  error?: string;
  generatedMaterialDraftId?: string;
  material?: NdisCaseNoteMaterial;
};

const EMPTY_INPUT: NdisCaseNoteCompanionInput = {
  supportDateTime: "",
  supportType: "",
  setting: "",
  supportDelivered: "",
  observableFacts: "",
  actionTaken: "",
  followUp: "",
};

export function NdisCaseNoteCompanion({
  attribution,
  initialClaimToken,
  initialMaterial,
  autoSave,
  savedDrafts: initialSavedDrafts,
}: NdisCaseNoteCompanionProps) {
  const copy = getCompanionCopy(attribution.locale);
  const [inputMode, setInputMode] =
    useState<NdisCaseNoteInputMode>("structured");
  const [input, setInput] = useState<NdisCaseNoteCompanionInput>(EMPTY_INPUT);
  const [pastedNotes, setPastedNotes] = useState("");
  const [pastePrepared, setPastePrepared] = useState(false);
  const [privacyReview, setPrivacyReview] =
    useState<NdisCaseNoteBrowserPrivacyReview>();
  const [reviewIsCurrent, setReviewIsCurrent] = useState(false);
  const [privacyResolutions, setPrivacyResolutions] =
    useState<NdisCaseNotePrivacyResolutionMap>({});
  const [confirmations, setConfirmations] =
    useState<NdisCaseNotePrivacyConfirmations>({
      reviewedNoIdentifiers: false,
      processingAuthorityConfirmed: false,
    });
  const [material, setMaterial] = useState(initialMaterial);
  const [claimToken, setClaimToken] = useState(initialClaimToken);
  const [issues, setIssues] = useState<NdisCaseNoteInputIssue[]>([]);
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<
    "idle" | "saved" | "error"
  >("idle");
  const [savedDrafts, setSavedDrafts] = useState(initialSavedDrafts);
  const trackedView = useRef(false);
  const trackedStart = useRef(false);
  const attemptedAutoSave = useRef(false);
  const attributionQuery = useMemo(
    () => buildAttributionQuery(attribution),
    [attribution],
  );

  useEffect(() => {
    if (trackedView.current) {
      return;
    }

    trackedView.current = true;
    void trackEvent("companion_viewed", attributionQuery);
  }, [attributionQuery]);

  const issueByField = useMemo(() => {
    const map = new Map<string, string>();
    issues.forEach((issue) => map.set(issue.field, issue.message));
    return map;
  }, [issues]);
  const privacyFindingCount = privacyReview?.findings.length ?? issues.length;
  const missingMinimumFacts = useMemo(
    () => getMissingNdisCaseNoteMinimumFacts(input),
    [input],
  );
  const allPrivacyFindingsResolved = privacyReview
    ? areNdisCaseNotePrivacyFindingsResolved(
        privacyReview,
        privacyResolutions,
      )
    : false;
  const canConfirmPrivacy = reviewIsCurrent && allPrivacyFindingsResolved;

  function updateInput(
    field: keyof NdisCaseNoteCompanionInput,
    value: string,
  ) {
    setInput((current) => ({ ...current, [field]: value }));
    setReviewIsCurrent(false);
    if (inputMode === "structured") {
      setPrivacyResolutions({});
    }
    resetConfirmations();
    setIssues((current) => current.filter((issue) => issue.field !== field));
    setError("");

    if (!trackedStart.current) {
      trackedStart.current = true;
      void trackEvent("companion_started", attributionQuery);
    }
  }

  function updatePastedNotes(value: string) {
    setPastedNotes(value);
    setPastePrepared(false);
    setPrivacyReview(undefined);
    setReviewIsCurrent(false);
    setPrivacyResolutions({});
    resetConfirmations();
    setIssues([]);
    setError("");

    if (!trackedStart.current) {
      trackedStart.current = true;
      void trackEvent("companion_started", attributionQuery);
    }
  }

  function changeInputMode(mode: NdisCaseNoteInputMode) {
    setInputMode(mode);
    setPrivacyReview(undefined);
    setReviewIsCurrent(false);
    setPrivacyResolutions({});
    setPastePrepared(false);
    resetConfirmations();
    setIssues([]);
    setError("");
  }

  function resetConfirmations() {
    setConfirmations({
      reviewedNoIdentifiers: false,
      processingAuthorityConfirmed: false,
    });
  }

  function runPrivacyReview() {
    const freshReview =
      inputMode === "paste" && !pastePrepared
        ? reviewPastedChineseCaseNotes(pastedNotes)
        : reviewStructuredNdisCaseNoteInput(input);
    const review =
      inputMode === "paste" &&
      pastePrepared &&
      privacyReview?.mode === "paste"
        ? {
            ...freshReview,
            mode: "paste" as const,
            findings: [
              ...privacyReview.findings,
              ...freshReview.findings.filter(
                (candidate) =>
                  !privacyReview.findings.some(
                    (existing) => existing.id === candidate.id,
                  ),
              ),
            ],
            originalTextByField: {
              ...privacyReview.originalTextByField,
              ...freshReview.originalTextByField,
            },
            sanitisedPreview: privacyReview.sanitisedPreview,
          }
        : freshReview;

    setPrivacyReview(review);
    setInput(review.proposedInput);
    if (inputMode !== "paste" || !pastePrepared) {
      setPrivacyResolutions({});
    }
    setPastePrepared(inputMode === "paste");
    setReviewIsCurrent(true);
    resetConfirmations();
    setIssues(
      getMissingNdisCaseNoteMinimumFacts(review.proposedInput).map((field) => ({
        field,
        code: "required" as const,
        message: copy.requiredField,
      })),
    );
    setError("");
  }

  function resolvePrivacyFinding(
    finding: NdisCaseNotePrivacyFinding,
    resolution: NdisCaseNotePrivacyResolution,
  ) {
    setPrivacyResolutions((current) => ({
      ...current,
      [finding.id]: resolution,
    }));
    resetConfirmations();
    setError("");
  }

  async function generateDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestBody = reviewIsCurrent
      ? buildNdisCaseNoteGenerationRequest(
          input,
          confirmations,
          privacyReview,
          privacyResolutions,
        )
      : undefined;

    if (!reviewIsCurrent) {
      runPrivacyReview();
      return;
    }

    if (!requestBody) {
      setError(
        missingMinimumFacts.length > 0
          ? copy.errors.minimumFacts
          : copy.errors.privacyReview,
      );
      return;
    }

    setIsGenerating(true);
    setError("");
    setIssues([]);
    setSaveState("idle");

    try {
      const response = await fetch(
        `/api/template-companion/ndis-case-note?${attributionQuery}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        },
      );
      const result = (await response.json()) as CompanionApiResult;

      if (!response.ok || !result.ok) {
        setIssues(result.ok ? [] : result.issues ?? []);
        setError(
          result.ok
            ? copy.errors.generic
            : getFriendlyError(result.code, result.error, copy),
        );
        return;
      }

      setMaterial(result.material);
      setClaimToken(result.claimToken);
      window.requestAnimationFrame(() => {
        document
          .getElementById("case-note-result")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch {
      setError(copy.errors.generic);
    } finally {
      setIsGenerating(false);
    }
  }

  async function promptToSave() {
    if (!claimToken) {
      return;
    }

    await saveDraft();
  }

  async function saveDraft() {
    if (!claimToken || !material || isSaving) {
      return;
    }

    setIsSaving(true);
    setSaveState("idle");

    try {
      const response = await fetch(
        `/api/template-companion/ndis-case-note/save?${attributionQuery}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ claimToken }),
        },
      );
      const result = (await response.json()) as SaveApiResult;

      if (!response.ok || !result.ok || !result.generatedMaterialDraftId) {
        setSaveState("error");
        setError(result.error ?? copy.errors.save);
        return;
      }

      const savedMaterial = result.material ?? material;
      setSaveState("saved");
      setSavedDrafts((current) => {
        if (
          current.some(
            (draft) => draft.id === result.generatedMaterialDraftId,
          )
        ) {
          return current;
        }

        return [
          {
            id: result.generatedMaterialDraftId!,
            material: savedMaterial,
            status: "draft" as const,
            createdAt: new Date().toISOString(),
          },
          ...current,
        ].slice(0, 6);
      });
    } catch {
      setSaveState("error");
      setError(copy.errors.save);
    } finally {
      setIsSaving(false);
    }
  }

  useEffect(() => {
    if (
      !autoSave ||
      !claimToken ||
      !material ||
      attemptedAutoSave.current
    ) {
      return;
    }

    attemptedAutoSave.current = true;
    void saveDraft();
    // saveDraft is intentionally triggered once for the short-lived return token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSave, claimToken, material]);

  return (
    <main className="case-note-page">
      <header className="case-note-brandbar border-b border-white/10">
        <div className="mx-auto flex min-h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            href={buildAiDocumentsHref(attribution.locale)}
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
          </Link>
          <nav
            className="hidden items-center gap-1 md:flex"
            aria-label={copy.productNavigation}
          >
            <Link
              href={buildAiDocumentsHref(attribution.locale)}
              className="inline-flex min-h-11 items-center rounded-md bg-white/12 px-3 text-sm font-semibold text-white hover:bg-white/18"
            >
              {copy.aiDocuments}
            </Link>
            <Link
              href={buildReferralsHref(attribution.locale)}
              className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-white/72 hover:bg-white/10 hover:text-white"
            >
              {copy.referrals}
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <a
              href={buildLanguageHref(attribution, claimToken)}
              className="hidden min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-white/18 bg-white/8 px-3 text-sm font-semibold text-white hover:bg-white/14 md:inline-flex"
            >
              <Languages className="size-4" aria-hidden="true" />
              {copy.language}
            </a>
            <Link
              href={buildAiDocumentsHref(attribution.locale)}
              className="hidden min-h-10 items-center rounded-md border border-[#9fe1ca]/35 bg-[#9fe1ca]/12 px-3 text-xs font-semibold text-[#d8f2e7] hover:bg-[#9fe1ca]/18 sm:inline-flex"
            >
              {copy.signedIn}
            </Link>
            <details className="case-note-mobile-menu relative md:hidden">
              <summary aria-label={copy.menu}>
                <Menu className="size-5" aria-hidden="true" />
              </summary>
              <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 grid min-w-52 overflow-hidden rounded-md border border-white/14 bg-[#063d34] p-2 shadow-xl">
                <Link
                  href={buildAiDocumentsHref(attribution.locale)}
                  className="flex min-h-11 items-center rounded-sm px-3 text-sm font-semibold text-white hover:bg-white/10"
                >
                  {copy.aiDocuments}
                </Link>
                <Link
                  href={buildReferralsHref(attribution.locale)}
                  className="flex min-h-11 items-center rounded-sm px-3 text-sm font-semibold text-white hover:bg-white/10"
                >
                  {copy.referrals}
                </Link>
                <a
                  href={buildLanguageHref(attribution, claimToken)}
                  className="flex min-h-11 items-center gap-2 rounded-sm border-t border-white/12 px-3 text-sm font-semibold text-white/78 hover:bg-white/10 hover:text-white"
                >
                  <Languages className="size-4" aria-hidden="true" />
                  {copy.language}
                </a>
              </div>
            </details>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <section className="grid gap-6 border-b border-[#bfcfc7] pb-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)] lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-md border border-[#b9d5c8] bg-[#e2f1e9] px-2.5 py-1 text-xs font-bold text-[#0b5c4d]">
                <Sparkles className="size-3.5" aria-hidden="true" />
                {copy.freeDraft}
              </span>
              <span className="text-xs font-semibold text-muted">
                {copy.noCard}
              </span>
            </div>
            <h1 className="document-title mt-4 max-w-4xl sm:text-[2.75rem]">
              {copy.title}
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-muted">
              {copy.subtitle}
            </p>
          </div>
          <div className="care-glass grid grid-cols-3 overflow-hidden">
            {copy.steps.map((step, index) => (
              <div
                key={step}
                className="border-r border-[#b8ccc2] p-3 last:border-r-0 sm:p-4"
              >
                <span className="font-mono text-xs font-bold text-brand">
                  0{index + 1}
                </span>
                <p className="mt-2 text-xs font-semibold leading-5 text-[#304b42] sm:text-sm">
                  {step}
                </p>
              </div>
            ))}
          </div>
        </section>

        <div className="case-note-workspace mt-5">
          <details className="care-glass case-note-mobile-context lg:hidden">
            <summary>
              <span className="flex items-center gap-2 text-brand">
                <ShieldCheck className="size-4" aria-hidden="true" />
                <span className="micro-label">{copy.privacyReviewTitle}</span>
              </span>
              <span className="text-xs font-semibold text-[#385249]">
                {privacyReview
                  ? !reviewIsCurrent
                    ? copy.privacyReviewStale
                    : privacyFindingCount > 0
                      ? copy.privacyReviewReadyWithFindings
                      : copy.privacyReviewClear
                  : issues.length > 0
                    ? copy.privacyNeedsAttention
                    : copy.privacyWaiting}
              </span>
            </summary>
            <div className="border-t border-[#b8ccc2] px-4 pb-4 pt-3">
              <p className="text-sm leading-6 text-muted">
                {privacyReview
                  ? reviewIsCurrent
                    ? copy.privacyReviewReadyDetail
                    : copy.privacyReviewStaleDetail
                  : issues.length > 0
                    ? copy.privacyNeedsAttentionDetail
                    : copy.privacyWaitingDetail}
              </p>
              <PrivacyFindingList
                review={privacyReview}
                issues={issues}
                locale={attribution.locale}
                fields={copy.fields}
                actionLabels={copy.privacyActions}
                resolutionLabels={copy.privacyResolution}
                resolutions={privacyResolutions}
                onResolve={resolvePrivacyFinding}
                mobile
              />
              {privacyReview ? (
                <PrivacyTextComparison
                  review={privacyReview}
                  originalTitle={copy.originalTextTitle}
                  sanitisedTitle={copy.sanitisedPreviewTitle}
                  structuredTitle={copy.structuredFactsTitle}
                  fields={copy.fields}
                />
              ) : null}
              <a
                href="#case-note-result"
                className="mt-3 inline-flex min-h-11 items-center gap-2 font-semibold text-brand"
              >
                {copy.viewDraftStatus}
                <ArrowRight className="size-4" aria-hidden="true" />
              </a>
            </div>
          </details>

          <form
            onSubmit={generateDraft}
            className="document-paper overflow-hidden"
          >
            <div className="border-b border-line p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-md bg-[#e3f0e9] text-brand">
                  <ShieldCheck className="size-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">{copy.formTitle}</h2>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    {copy.privacyIntro}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex gap-3 rounded-md border border-[#e3c4b8] bg-[#fff4ef] p-3 text-sm leading-6 text-[#783f31]">
                <AlertTriangle
                  className="mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                <span>{copy.identifierWarning}</span>
              </div>
            </div>

            <div className="grid gap-5 p-5 sm:p-6">
              <fieldset>
                <legend className="text-sm font-semibold text-foreground">
                  {copy.inputModeTitle}
                </legend>
                <div className="mt-2 grid grid-cols-2 border border-line bg-[#f4f6f2] p-1">
                  <button
                    type="button"
                    aria-pressed={inputMode === "structured"}
                    onClick={() => changeInputMode("structured")}
                    className={`min-h-11 px-3 text-sm font-semibold transition-colors ${
                      inputMode === "structured"
                        ? "bg-white text-brand shadow-sm"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    {copy.structuredMode}
                  </button>
                  <button
                    type="button"
                    aria-pressed={inputMode === "paste"}
                    onClick={() => changeInputMode("paste")}
                    className={`min-h-11 px-3 text-sm font-semibold transition-colors ${
                      inputMode === "paste"
                        ? "bg-white text-brand shadow-sm"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    {copy.pasteMode}
                  </button>
                </div>
              </fieldset>

              {inputMode === "paste" && !pastePrepared ? (
                <CompanionField
                  fieldId="pastedNotes"
                  label={copy.pastedNotesLabel}
                  hint={copy.browserMemoryOnly}
                  required
                >
                  <textarea
                    required
                    rows={13}
                    value={pastedNotes}
                    maxLength={6000}
                    onChange={(event) => updatePastedNotes(event.target.value)}
                    placeholder={copy.pastedNotesPlaceholder}
                    className="case-note-input"
                    autoComplete="off"
                    spellCheck="false"
                  />
                  <span className="text-xs leading-5 text-muted">
                    {copy.pastedNotesBoundary}
                  </span>
                </CompanionField>
              ) : (
                <>
                  {inputMode === "paste" ? (
                    <div className="border-l-2 border-brand bg-[#edf5f0] px-4 py-3 text-sm leading-6 text-[#385249]">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span>{copy.structuredProposalReady}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setPastePrepared(false);
                            setPrivacyReview(undefined);
                            setReviewIsCurrent(false);
                            resetConfirmations();
                          }}
                          className="font-semibold text-brand hover:underline"
                        >
                          {copy.editOriginalPaste}
                        </button>
                      </div>
                    </div>
                  ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <CompanionField
                  fieldId="supportDateTime"
                  label={copy.fields.supportDateTime}
                  error={issueByField.get("supportDateTime")}
                  required
                >
                  <input
                    type="text"
                    required
                    value={input.supportDateTime}
                    maxLength={NDIS_CASE_NOTE_INPUT_LIMITS.supportDateTime}
                    onChange={(event) =>
                      updateInput("supportDateTime", event.target.value)
                    }
                    placeholder={copy.placeholders.supportDateTime}
                    className={fieldClassName(
                      Boolean(issueByField.get("supportDateTime")),
                    )}
                  />
                </CompanionField>
                <CompanionField
                  fieldId="supportType"
                  label={copy.fields.supportType}
                  error={issueByField.get("supportType")}
                  required
                >
                  <input
                    type="text"
                    required
                    value={input.supportType}
                    maxLength={NDIS_CASE_NOTE_INPUT_LIMITS.supportType}
                    onChange={(event) =>
                      updateInput("supportType", event.target.value)
                    }
                    placeholder={copy.placeholders.supportType}
                    className={fieldClassName(
                      Boolean(issueByField.get("supportType")),
                    )}
                  />
                </CompanionField>
              </div>

              <CompanionField
                fieldId="setting"
                label={copy.fields.setting}
                error={issueByField.get("setting")}
                required
              >
                <input
                  type="text"
                  required
                  value={input.setting}
                  maxLength={NDIS_CASE_NOTE_INPUT_LIMITS.setting}
                  onChange={(event) =>
                    updateInput("setting", event.target.value)
                  }
                  placeholder={copy.placeholders.setting}
                  className={fieldClassName(
                    Boolean(issueByField.get("setting")),
                  )}
                />
              </CompanionField>

              <CompanionField
                fieldId="supportDelivered"
                label={copy.fields.supportDelivered}
                hint={copy.deidentifiedHint}
                error={issueByField.get("supportDelivered")}
                required
              >
                <textarea
                  required
                  rows={4}
                  value={input.supportDelivered}
                  maxLength={NDIS_CASE_NOTE_INPUT_LIMITS.supportDelivered}
                  onChange={(event) =>
                    updateInput("supportDelivered", event.target.value)
                  }
                  placeholder={copy.placeholders.supportDelivered}
                  className={fieldClassName(
                    Boolean(issueByField.get("supportDelivered")),
                  )}
                />
              </CompanionField>

              <CompanionField
                fieldId="observableFacts"
                label={copy.fields.observableFacts}
                hint={copy.deidentifiedHint}
                error={issueByField.get("observableFacts")}
                required
              >
                <textarea
                  required
                  rows={5}
                  value={input.observableFacts}
                  maxLength={NDIS_CASE_NOTE_INPUT_LIMITS.observableFacts}
                  onChange={(event) =>
                    updateInput("observableFacts", event.target.value)
                  }
                  placeholder={copy.placeholders.observableFacts}
                  className={fieldClassName(
                    Boolean(issueByField.get("observableFacts")),
                  )}
                />
              </CompanionField>

              <CompanionField
                fieldId="actionTaken"
                label={copy.fields.actionTaken}
                hint={copy.deidentifiedHint}
                error={issueByField.get("actionTaken")}
                required
              >
                <textarea
                  required
                  rows={4}
                  value={input.actionTaken}
                  maxLength={NDIS_CASE_NOTE_INPUT_LIMITS.actionTaken}
                  onChange={(event) =>
                    updateInput("actionTaken", event.target.value)
                  }
                  placeholder={copy.placeholders.actionTaken}
                  className={fieldClassName(
                    Boolean(issueByField.get("actionTaken")),
                  )}
                />
              </CompanionField>

              <CompanionField
                fieldId="followUp"
                label={copy.fields.followUp}
                hint={copy.deidentifiedHint}
                error={issueByField.get("followUp")}
              >
                <textarea
                  rows={3}
                  value={input.followUp}
                  maxLength={NDIS_CASE_NOTE_INPUT_LIMITS.followUp}
                  onChange={(event) =>
                    updateInput("followUp", event.target.value)
                  }
                  placeholder={copy.placeholders.followUp}
                  className={fieldClassName(
                    Boolean(issueByField.get("followUp")),
                  )}
                />
              </CompanionField>
                </>
              )}

              <fieldset
                disabled={!canConfirmPrivacy}
                className={`grid gap-3 border border-[#b8ccc2] bg-[#f3f7f4] p-4 ${
                  canConfirmPrivacy ? "" : "opacity-55"
                }`}
              >
                  <legend className="px-1 text-sm font-semibold text-foreground">
                    {copy.confirmationTitle}
                  </legend>
                  {!canConfirmPrivacy ? (
                    <p className="text-xs leading-5 text-muted">
                      {reviewIsCurrent && !allPrivacyFindingsResolved
                        ? copy.confirmationFindingsLocked
                        : copy.confirmationLocked}
                    </p>
                  ) : null}
                  <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-[#385249]">
                    <input
                      type="checkbox"
                      checked={confirmations.reviewedNoIdentifiers}
                      onChange={(event) =>
                        setConfirmations((current) => ({
                          ...current,
                          reviewedNoIdentifiers: event.target.checked,
                        }))
                      }
                      className="mt-1 size-4 shrink-0 accent-[#115c47]"
                    />
                    <span>{copy.reviewedNoIdentifiers}</span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-[#385249]">
                    <input
                      type="checkbox"
                      checked={confirmations.processingAuthorityConfirmed}
                      onChange={(event) =>
                        setConfirmations((current) => ({
                          ...current,
                          processingAuthorityConfirmed: event.target.checked,
                        }))
                      }
                      className="mt-1 size-4 shrink-0 accent-[#115c47]"
                    />
                    <span>{copy.processingAuthorityConfirmed}</span>
                  </label>
                  <p className="text-xs leading-5 text-muted">
                    {copy.authorityNotConsent}
                  </p>
              </fieldset>

              {error ? (
                <div
                  role="alert"
                  className="rounded-md border border-[#efc7c7] bg-[#fff2f2] px-4 py-3 text-sm leading-6 text-[#963b3b]"
                >
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={
                  isGenerating ||
                  (reviewIsCurrent &&
                    (missingMinimumFacts.length > 0 ||
                      !allPrivacyFindingsResolved ||
                      !confirmations.reviewedNoIdentifiers ||
                      !confirmations.processingAuthorityConfirmed))
                }
                className="coral-action w-full"
              >
                <Sparkles className="size-4" aria-hidden="true" />
                {isGenerating
                  ? copy.generating
                  : reviewIsCurrent
                    ? copy.generate
                    : copy.reviewPrivacy}
              </button>
              <p className="text-center text-xs leading-5 text-muted">
                {copy.boundary}
              </p>
            </div>
          </form>

          <aside
            className="care-glass case-note-context hidden lg:block"
            aria-label={copy.privacyReviewTitle}
          >
            <div className="flex items-center gap-2 text-brand">
              <ShieldCheck className="size-4" aria-hidden="true" />
              <p className="micro-label">{copy.privacyReviewTitle}</p>
            </div>
            <h2 className="mt-4 text-base font-semibold text-foreground">
              {privacyReview
                ? !reviewIsCurrent
                  ? copy.privacyReviewStale
                  : privacyFindingCount > 0
                    ? copy.privacyReviewReadyWithFindings
                    : copy.privacyReviewClear
                : issues.length > 0
                  ? copy.privacyNeedsAttention
                  : copy.privacyWaiting}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              {privacyReview
                ? reviewIsCurrent
                  ? copy.privacyReviewReadyDetail
                  : copy.privacyReviewStaleDetail
                : issues.length > 0
                  ? copy.privacyNeedsAttentionDetail
                  : copy.privacyWaitingDetail}
            </p>

            {privacyReview || issues.length > 0 ? (
              <PrivacyFindingList
                review={privacyReview}
                issues={issues}
                locale={attribution.locale}
                fields={copy.fields}
                actionLabels={copy.privacyActions}
                resolutionLabels={copy.privacyResolution}
                resolutions={privacyResolutions}
                onResolve={resolvePrivacyFinding}
              />
            ) : (
              <ul className="mt-5 divide-y divide-[#b8ccc2] border-y border-[#b8ccc2]">
                {copy.privacyChecks.map((check) => (
                  <li
                    key={check}
                    className="flex gap-3 py-3 text-sm leading-5 text-[#385249]"
                  >
                    <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
                    {check}
                  </li>
                ))}
              </ul>
            )}

            {privacyReview ? (
              <PrivacyTextComparison
                review={privacyReview}
                originalTitle={copy.originalTextTitle}
                sanitisedTitle={copy.sanitisedPreviewTitle}
                structuredTitle={copy.structuredFactsTitle}
                fields={copy.fields}
              />
            ) : null}

            {material ? (
              <div className="mt-6 border-t border-[#b8ccc2] pt-5">
                <p className="micro-label">{copy.reviewPromptsTitle}</p>
                <OutputList
                  title={copy.output.missingFacts}
                  items={material.missingFacts}
                  empty={copy.output.none}
                />
                <OutputList
                  title={copy.output.neutralWordingChecks}
                  items={material.neutralWordingChecks}
                  empty={copy.output.none}
                />
                <OutputList
                  title={copy.output.followUpPrompts}
                  items={material.followUpPrompts}
                  empty={copy.output.none}
                />
              </div>
            ) : null}

            <div className="mt-6 flex gap-3 border-t border-[#b8ccc2] pt-4 text-xs leading-5 text-muted">
              <LockKeyhole className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{copy.privacyAutomationLimit}</span>
            </div>
          </aside>

          <section
            id="case-note-result"
            className="document-paper case-note-result scroll-mt-6 overflow-hidden"
          >
            <div className="flex items-start justify-between gap-4 border-b border-line p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-md bg-[#edf3ee] text-brand">
                  <FileText className="size-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">{copy.resultTitle}</h2>
                  <p className="mt-1 text-sm leading-6 text-[#697180]">
                    {material ? copy.resultReady : copy.resultEmpty}
                  </p>
                </div>
              </div>
              {material ? (
                <GeneratedDraftCopyButton
                  text={getNdisCaseNoteMaterialCopyText(material)}
                  label={copy.copyAll}
                  copiedLabel={copy.copied}
                  ariaLabel={copy.copyAll}
                />
              ) : null}
            </div>

            {material ? (
              <div className="p-5 sm:p-6">
                <OutputSection
                  title={copy.output.englishCaseNoteDraft}
                  icon={<ClipboardCheck className="size-4" aria-hidden="true" />}
                >
                  <div className="document-prose whitespace-pre-wrap">
                    {material.englishCaseNoteDraft}
                  </div>
                </OutputSection>
                <div className="mt-6 border-t border-line pt-6">
                  <OutputSection
                    title={copy.output.chineseReviewVersion}
                    icon={<Languages className="size-4" aria-hidden="true" />}
                  >
                    <p className="mb-3 border-l-2 border-brand bg-[#edf5f0] px-3 py-2 text-xs leading-5 text-[#385249]">
                      {copy.chineseReviewBoundary}
                    </p>
                    <div className="document-prose whitespace-pre-wrap">
                      {material.chineseReviewVersion}
                    </div>
                  </OutputSection>
                </div>
                <div className="mt-6 border-t border-line pt-4 text-xs leading-5 text-muted">
                  {material.disclaimer}
                </div>

                <div className="mt-5 border-t border-line pt-5">
                  {saveState === "saved" ? (
                    <div className="flex items-center gap-2 rounded-md border border-[#bcdccf] bg-[#edf8f3] px-4 py-3 text-sm font-semibold text-[#27644d]">
                      <Check className="size-4" aria-hidden="true" />
                      {copy.saved}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={promptToSave}
                      disabled={isSaving}
                      className="jade-action w-full"
                    >
                      <Save className="size-4" aria-hidden="true" />
                      {isSaving ? copy.saving : copy.save}
                      {!isSaving ? (
                        <ArrowRight className="size-4" aria-hidden="true" />
                      ) : null}
                    </button>
                  )}
                  {saveState === "error" ? (
                    <p className="mt-3 text-sm text-[#963b3b]">
                      {copy.errors.save}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="grid min-h-[440px] place-items-center p-8 text-center">
                <div className="max-w-sm">
                  <div className="mx-auto grid size-14 place-items-center rounded-md border border-line bg-[#f1f4f0] text-[#71877d]">
                    <Sparkles className="size-6" aria-hidden="true" />
                  </div>
                  <p className="mt-4 text-sm leading-6 text-muted">
                    {copy.emptyDetail}
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>

        {savedDrafts.length > 0 ? (
          <section className="document-paper mt-5 overflow-hidden">
            <div className="flex items-end justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-brand">
                  <History className="size-4" aria-hidden="true" />
                  {copy.historyEyebrow}
                </div>
                <h2 className="mt-2 text-2xl font-semibold">
                  {copy.historyTitle}
                </h2>
              </div>
              <span className="text-sm text-muted">
                {savedDrafts.length} {copy.savedCount}
              </span>
            </div>
            <div className="divide-y divide-line">
              {savedDrafts.map((draft) => (
                <article
                  key={draft.id}
                  className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:p-5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase text-[#697180]">
                        {formatDate(draft.createdAt, attribution.locale)}
                      </span>
                      <span className="rounded bg-[#eef2f8] px-2 py-0.5 text-xs font-semibold text-[#596476]">
                        {draft.status}
                      </span>
                    </div>
                    <p className="document-prose mt-2 line-clamp-3 whitespace-pre-wrap text-[0.9375rem]">
                      {draft.material.englishCaseNoteDraft}
                    </p>
                  </div>
                  <GeneratedDraftCopyButton
                    text={getNdisCaseNoteMaterialCopyText(draft.material)}
                    label={copy.copy}
                    copiedLabel={copy.copied}
                    ariaLabel={copy.copy}
                    telemetryEvent={{
                      generatedMaterialDraftId: draft.id,
                      eventType: "copy_all",
                    }}
                  />
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <footer className="mt-8 flex flex-col gap-3 border-t border-[#bfcfc7] py-6 text-xs leading-5 text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>{copy.footerBoundary}</span>
        </footer>
      </div>
    </main>
  );
}
function CompanionField({
  fieldId,
  label,
  hint,
  error,
  required,
  children,
}: {
  fieldId?: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      id={fieldId ? `case-note-field-${fieldId}` : undefined}
      className="case-note-field scroll-mt-24"
    >
      <span className="flex flex-wrap items-baseline justify-between gap-2">
        <span>
          {label}
          {required ? <span className="text-[#b84d4d]"> *</span> : null}
        </span>
        {hint ? (
          <span className="text-xs font-normal text-[#7a8290]">{hint}</span>
        ) : null}
      </span>
      {children}
      {error ? (
        <span className="text-xs font-medium text-[#a33a3a]">{error}</span>
      ) : null}
    </label>
  );
}

function PrivacyFindingList({
  review,
  issues,
  locale,
  fields,
  actionLabels,
  resolutionLabels,
  resolutions,
  onResolve,
  mobile = false,
}: {
  review?: NdisCaseNoteBrowserPrivacyReview;
  issues: NdisCaseNoteInputIssue[];
  locale: "en" | "zh-Hans";
  fields: Record<string, string>;
  actionLabels: Record<string, string>;
  resolutionLabels: {
    blocking: string;
    reviewRequired: string;
    resolved: string;
    confirm: string;
  };
  resolutions: NdisCaseNotePrivacyResolutionMap;
  onResolve: (
    finding: NdisCaseNotePrivacyFinding,
    resolution: NdisCaseNotePrivacyResolution,
  ) => void;
  mobile?: boolean;
}) {
  if (review && review.findings.length === 0) {
    return (
      <div className="mt-4 flex gap-2 border-l-2 border-brand bg-white/55 px-3 py-2 text-xs leading-5 text-[#385249]">
        <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
        <span>
          {locale === "zh-Hans"
            ? "未检测到明显线索。自动检查并不完整，仍需人工复核。"
            : "No obvious clues detected. Automated checks are incomplete, so manual review is still required."}
        </span>
      </div>
    );
  }

  if (review) {
    return (
      <div className="mt-4 grid gap-2">
        {review.findings.map((finding) => {
          const resolution = resolutions[finding.id];
          const className = `${
            mobile ? "min-h-11" : ""
          } border-l-2 ${
            resolution ? "border-brand bg-[#edf5f0]" : "border-[#bd5135] bg-white/55"
          } px-3 py-2 text-xs leading-5`;

          return (
            <div key={finding.id} className={className}>
              <span className="flex flex-wrap items-center justify-between gap-2">
                {finding.field === "pastedNotes" ? (
                  <span className="font-bold text-[#8e402f]">
                    {getInputFieldLabel(finding.field, fields)}
                  </span>
                ) : (
                  <a
                    href={`#case-note-field-${finding.field}`}
                    className="font-bold text-[#8e402f] underline-offset-2 hover:underline"
                  >
                    {getInputFieldLabel(finding.field, fields)}
                  </a>
                )}
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="border border-[#d8a992] bg-[#fff4ef] px-1.5 py-0.5 font-mono text-[0.65rem] uppercase text-[#8e402f]">
                    {finding.severity === "blocking"
                      ? resolutionLabels.blocking
                      : resolutionLabels.reviewRequired}
                  </span>
                  <span className="border border-[#d8a992] bg-[#fff4ef] px-1.5 py-0.5 font-mono text-[0.65rem] uppercase text-[#8e402f]">
                    {actionLabels[finding.action]}
                  </span>
                </span>
              </span>
              <span className="mt-1 block text-[#6f4a41]">
                {getNdisCaseNotePrivacyFindingText(finding.category, locale)}
              </span>
              <button
                type="button"
                disabled={Boolean(resolution)}
                onClick={() =>
                  onResolve(finding, getFindingResolution(finding.action))
                }
                className="mt-2 min-h-9 border border-[#9eb8ab] bg-white px-2.5 font-semibold text-brand transition-colors hover:bg-[#edf5f0] disabled:cursor-default disabled:border-[#b8ccc2] disabled:bg-transparent disabled:text-[#527064]"
              >
                {resolution
                  ? resolutionLabels.resolved
                  : `${resolutionLabels.confirm} ${actionLabels[finding.action]}`}
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  if (issues.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 grid gap-2">
      {issues.map((issue) => (
        <a
          key={`${issue.field}-${issue.code}`}
          href={`#case-note-field-${issue.field}`}
          className={`${
            mobile ? "min-h-11" : ""
          } border-l-2 border-[#bd5135] bg-white/55 px-3 py-2 text-xs leading-5 text-[#6f4a41]`}
        >
          <span className="block font-bold text-[#8e402f]">
            {getInputFieldLabel(issue.field, fields)}
          </span>
          {issue.message}
        </a>
      ))}
    </div>
  );
}

function PrivacyTextComparison({
  review,
  originalTitle,
  sanitisedTitle,
  structuredTitle,
  fields,
}: {
  review: NdisCaseNoteBrowserPrivacyReview;
  originalTitle: string;
  sanitisedTitle: string;
  structuredTitle: string;
  fields: Record<string, string>;
}) {
  const sourceFields = Object.entries(review.originalTextByField).filter(
    ([field, value]) =>
      Boolean(value) && review.findings.some((finding) => finding.field === field),
  );
  const structuredFacts = Object.entries(review.proposedInput).filter(
    ([, value]) => Boolean(value),
  );

  return (
    <div className="mt-5 grid gap-4 border-t border-[#b8ccc2] pt-4">
      {sourceFields.length > 0 ? (
        <section>
          <p className="micro-label">{originalTitle}</p>
          <div className="mt-2 grid max-h-52 gap-3 overflow-auto border border-[#d6c4bb] bg-[#fffaf7] p-3 text-xs leading-5 text-[#563c35]">
            {sourceFields.map(([field, value]) => (
              <div key={field}>
                {sourceFields.length > 1 ? (
                  <p className="mb-1 font-semibold">
                    {getInputFieldLabel(field, fields)}
                  </p>
                ) : null}
                <p className="whitespace-pre-wrap">
                  <HighlightedPrivacyText
                    text={value ?? ""}
                    findings={review.findings.filter(
                      (finding) => finding.field === field,
                    )}
                  />
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {review.sanitisedPreview ? (
        <section>
          <p className="micro-label">{sanitisedTitle}</p>
          <p className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap border border-[#b8ccc2] bg-white/60 p-3 text-xs leading-5 text-muted">
            {review.sanitisedPreview}
          </p>
        </section>
      ) : null}

      <section>
        <p className="micro-label">{structuredTitle}</p>
        <dl className="mt-2 divide-y divide-[#c8d7d0] border-y border-[#c8d7d0]">
          {structuredFacts.map(([field, value]) => (
            <div key={field} className="grid gap-1 py-2 text-xs leading-5">
              <dt className="font-semibold text-[#385249]">
                {getInputFieldLabel(field, fields)}
              </dt>
              <dd className="whitespace-pre-wrap text-muted">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

function HighlightedPrivacyText({
  text,
  findings,
}: {
  text: string;
  findings: NdisCaseNotePrivacyFinding[];
}) {
  const ranges = mergePrivacyRanges(
    findings.flatMap((finding) => finding.matchedSpans),
  );
  const content: React.ReactNode[] = [];
  let cursor = 0;

  ranges.forEach((range, index) => {
    if (range.start > cursor) {
      content.push(text.slice(cursor, range.start));
    }
    content.push(
      <mark
        key={`${range.start}-${range.end}-${index}`}
        className="bg-[#ffd9cb] px-0.5 text-[#762f20]"
      >
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });

  if (cursor < text.length) {
    content.push(text.slice(cursor));
  }

  return <>{content}</>;
}

function mergePrivacyRanges(
  spans: NdisCaseNotePrivacyFinding["matchedSpans"],
) {
  return [...spans]
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .reduce<Array<{ start: number; end: number }>>((ranges, span) => {
      const previous = ranges.at(-1);
      if (previous && span.start <= previous.end) {
        previous.end = Math.max(previous.end, span.end);
      } else {
        ranges.push({ start: span.start, end: span.end });
      }
      return ranges;
    }, []);
}

function getFindingResolution(
  action: NdisCaseNotePrivacyFinding["action"],
): NdisCaseNotePrivacyResolution {
  if (action === "remove") return "removed";
  if (action === "replace") return "replaced";
  if (action === "generalise") return "generalised";
  return "reviewed";
}

function OutputSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="text-brand">{icon}</span>
        {title}
      </div>
      {children}
    </section>
  );
}

function OutputList({
  title,
  items,
  empty,
}: {
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <section className="mt-5 border-t border-[#b8ccc2] pt-4 first:mt-3 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {items.length > 0 ? (
        <ul className="mt-2 grid gap-2">
          {items.map((item) => (
            <li
              key={item}
              className="flex gap-2 text-sm leading-6 text-muted"
            >
              <span
                className="mt-2 size-1.5 shrink-0 rounded-full bg-brand"
                aria-hidden="true"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      )}
    </section>
  );
}

function fieldClassName(hasError: boolean) {
  return `case-note-input ${hasError ? "case-note-input--error" : ""}`;
}

function getInputFieldLabel(
  field: string,
  fields: Record<string, string>,
) {
  return fields[field] ?? field;
}

function buildAiDocumentsHref(locale: "en" | "zh-Hans") {
  return `/ai-documents?lang=${encodeURIComponent(locale)}`;
}

function buildReferralsHref(locale: "en" | "zh-Hans") {
  return `/referral-workspace/referral-pack?lang=${encodeURIComponent(locale)}`;
}

function buildAttributionQuery(
  attribution: NdisCaseNoteCompanionAttribution,
) {
  const href = buildNdisCaseNoteCompanionHref({ attribution });
  return href.split("?", 2)[1] ?? "";
}

function buildLanguageHref(
  attribution: NdisCaseNoteCompanionAttribution,
  claimToken?: string,
) {
  return buildNdisCaseNoteCompanionHref({
    attribution: {
      ...attribution,
      locale: attribution.locale === "zh-Hans" ? "en" : "zh-Hans",
    },
    claimToken,
  });
}

async function trackEvent(eventName: string, attributionQuery: string) {
  try {
    await fetch(`/api/template-companion/events?${attributionQuery}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventName }),
      keepalive: true,
    });
  } catch {
    // Product telemetry is intentionally non-blocking.
  }
}

function getFriendlyError(
  code: string | undefined,
  fallback: string | undefined,
  copy: ReturnType<typeof getCompanionCopy>,
) {
  if (code === "daily_limit_reached") {
    return copy.errors.dailyLimit;
  }

  if (code === "rate_limited") {
    return copy.errors.rateLimit;
  }

  if (code === "input_review_required") {
    return copy.errors.identifiers;
  }

  if (code === "privacy_review_required") {
    return copy.errors.privacyReview;
  }

  return fallback || copy.errors.generic;
}

function formatDate(value: string, locale: "en" | "zh-Hans") {
  try {
    return new Intl.DateTimeFormat(
      locale === "zh-Hans" ? "zh-CN" : "en-AU",
      { dateStyle: "medium", timeStyle: "short" },
    ).format(new Date(value));
  } catch {
    return value;
  }
}

function getCompanionCopy(locale: "en" | "zh-Hans") {
  if (locale === "zh-Hans") {
    return {
      productLabel: "文档工作区",
      productNavigation: "产品导航",
      menu: "打开产品导航",
      aiDocuments: "AI 文档",
      referrals: "转介",
      language: "English",
      signedIn: "返回 AI 文档",
      freeDraft: "免费账户可用",
      noCard: "注册或登录后生成",
      title: "NDIS Case Note AI 助手",
      subtitle:
        "把去标识化的支持事实整理成中性、可复核的 case note 草稿，并保存到当前服务商账号。",
      steps: ["填写支持事实", "检查隐私提示", "复核、复制或保存"],
      formTitle: "输入去标识化的支持信息",
      privacyIntro:
        "只填写草稿所需事实，并使用“participant”等通用称呼。",
      identifierWarning:
        "不要输入姓名、NDIS 号码、出生日期、地址、电话、邮箱或其他可识别个人身份的信息。自动检查只能识别部分明显格式。",
      deidentifiedHint: "请勿填写身份信息",
      inputModeTitle: "选择输入方式",
      structuredMode: "结构化事实",
      pasteMode: "粘贴中文记录",
      pastedNotesLabel: "粘贴中文工作记录",
      browserMemoryOnly: "仅保留在当前浏览器内存",
      pastedNotesPlaceholder:
        "可粘贴中文记录。建议使用标签：支持类型、场景、提供的支持、可观察事实、采取的行动、后续。请勿粘贴姓名、联系方式、NDIS 号码或其他身份信息。",
      pastedNotesBoundary:
        "原始粘贴文本不会写入网址、本地存储、分析事件、日志或管理页面。完成隐私复核前不会调用 AI。",
      structuredProposalReady:
        "已根据本地隐私检查整理出结构化事实。请逐项复核并补全必填项。",
      editOriginalPaste: "返回编辑原文",
      fields: {
        pastedNotes: "粘贴的中文记录",
        supportDateTime: "支持日期与大致时间",
        supportType: "支持类型",
        setting: "场景或地点类型",
        supportDelivered: "实际提供的支持",
        observableFacts: "可观察事实与 participant 的反应",
        actionTaken: "工作人员采取的行动",
        followUp: "后续跟进或升级事项（可选）",
      },
      placeholders: {
        supportDateTime: "例如：2026 年 7 月 30 日，下午约 2 点",
        supportType: "例如：社区参与支持",
        setting: "例如：社区场所，不填写具体地址",
        supportDelivered: "只描述实际提供的支持。",
        observableFacts:
          "记录看到、听到或已记录的事实，不作诊断或推断。",
        actionTaken: "描述工作人员实际采取的行动。",
        followUp: "记录仍需交接、复核或跟进的事项。",
      },
      boundary:
        "输出是需要用户复核的草稿，不是完成记录，也不构成临床、法律、照护、监管、合规或其他专业建议。",
      generate: "生成待复核草稿",
      reviewPrivacy: "先进行隐私复核",
      generating: "正在生成草稿",
      privacyReviewTitle: "隐私检查",
      privacyNeedsAttention: "发现需要修改的字段",
      privacyNeedsAttentionDetail:
        "选择下方提示可返回对应输入。移除明显的身份信息后再生成。",
      privacyWaiting: "生成前会检查明显格式",
      privacyWaitingDetail:
        "这里只进行有限的自动检查，不能替代你对输入内容的人工复核。",
      privacyReviewReadyWithFindings: "请处理并复核这些提示",
      privacyReviewClear: "未检测到明显线索",
      privacyReviewReadyDetail:
        "下面是浏览器内完成的检查与处理建议。请对照结构化事实逐项人工复核。",
      privacyReviewStale: "内容已修改，请重新复核",
      privacyReviewStaleDetail:
        "你在上次检查后修改了结构化事实。再次生成前需要重新运行隐私复核。",
      privacyActions: {
        remove: "删除",
        replace: "替换",
        generalise: "概括",
        review: "复核",
      },
      privacyResolution: {
        blocking: "必须处理",
        reviewRequired: "需要复核",
        resolved: "已处理",
        confirm: "确认",
      },
      originalTextTitle: "原始文本（仅当前会话）",
      sanitisedPreviewTitle: "处理后文本预览",
      structuredFactsTitle: "提取后的结构化事实",
      privacyChecks: [
        "使用 participant 或 person 等通用称呼",
        "不填写号码、联系方式或具体地址",
        "只记录可观察事实和实际行动",
      ],
      reviewPromptsTitle: "草稿复核提示",
      privacyAutomationLimit:
        "自动检查无法识别所有个人信息。提交前请再次人工检查每个字段。",
      confirmationTitle: "生成前确认",
      confirmationLocked: "完成隐私复核后才能勾选。",
      confirmationFindingsLocked: "逐项处理隐私提示后才能勾选。",
      reviewedNoIdentifiers:
        "我已复核，且未故意包含姓名、联系方式、participant numbers 或其他可识别信息。",
      processingAuthorityConfirmed:
        "我确认有权为此文档整理目的处理这些资料。",
      authorityNotConsent:
        "此确认仅说明处理权限，不代表或替代 participant consent。",
      viewDraftStatus: "查看草稿状态",
      resultTitle: "待复核草稿",
      resultReady: "逐项核对事实，再复制或保存。",
      resultEmpty: "生成后，草稿会显示在这张文档纸上。",
      emptyDetail: "填写事实并完成隐私复核后生成草稿。",
      copyAll: "复制全部",
      copy: "复制",
      copied: "已复制",
      output: {
        englishCaseNoteDraft: "英文 case note 草稿",
        chineseReviewVersion: "中文复核版本",
        missingFacts: "待补充事实",
        neutralWordingChecks: "中性表述检查",
        followUpPrompts: "后续提示",
        none: "没有额外项目。",
      },
      chineseReviewBoundary:
        "中文内容仅用于核对英文草稿中的事实，不是第二份正式记录。",
      save: "保存这份草稿",
      saving: "正在保存",
      saved: "草稿已保存到你的账号",
      historyEyebrow: "账号内文档",
      historyTitle: "最近保存的草稿",
      savedCount: "份已保存",
      footerBoundary:
        "CaresLink AI 仅提供一般文档和运营支持。所有草稿都需要用户复核。",
      requiredField: "生成前必须补充此项。",
      errors: {
        identifiers: "请移除已标出的可识别信息后重试。",
        privacyReview: "请先完成隐私复核并勾选两项确认。",
        minimumFacts: "请先补全标出的最低事实，再重新进行隐私复核。",
        dailyLimit: "今天的生成额度已用完，请明天再试。",
        rateLimit: "请求过于频繁，请稍后再试。",
        save: "暂时无法保存这份草稿，请稍后再试。",
        generic: "暂时无法生成草稿，请稍后再试。",
      },
    };
  }

  return {
    productLabel: "Document workspace",
    productNavigation: "Product navigation",
    menu: "Open product navigation",
    aiDocuments: "AI Documents",
    referrals: "Referrals",
    language: "简体中文",
    signedIn: "Back to AI Documents",
    freeDraft: "Available with a free account",
    noCard: "Register or sign in to generate",
    title: "NDIS Case Note AI Companion",
    subtitle:
      "Turn de-identified support facts into neutral case-note wording you can review and save to your provider account.",
    steps: ["Enter support facts", "Check privacy findings", "Review, copy or save"],
    formTitle: "Enter de-identified support details",
    privacyIntro:
      "Include only the facts needed for the draft and use generic terms such as “participant”.",
    identifierWarning:
      "Do not enter names, NDIS numbers, dates of birth, addresses, phone numbers, email addresses or other identifying information. Automated checks only catch some obvious formats.",
    deidentifiedHint: "No identifying information",
    inputModeTitle: "Choose an input mode",
    structuredMode: "Structured facts",
    pasteMode: "Paste Chinese notes",
    pastedNotesLabel: "Paste Chinese working notes",
    browserMemoryOnly: "Current browser memory only",
    pastedNotesPlaceholder:
      "Paste Chinese working notes here. Labels such as support type, setting, support delivered, observable facts, action taken and follow-up work best. Do not paste names, contact details, NDIS numbers or other identifiers.",
    pastedNotesBoundary:
      "The original paste is not written to the URL, local storage, analytics, logs or admin views. AI is not called until Privacy Review is complete.",
    structuredProposalReady:
      "A structured-facts proposal is ready from the local privacy review. Check every field and complete the required facts.",
    editOriginalPaste: "Edit original paste",
    fields: {
      pastedNotes: "Pasted Chinese notes",
      supportDateTime: "Support date and approximate time",
      supportType: "Support type",
      setting: "Setting or location type",
      supportDelivered: "Support delivered",
      observableFacts: "Observable facts and participant response",
      actionTaken: "Action taken",
      followUp: "Follow-up or escalation (optional)",
    },
    placeholders: {
      supportDateTime: "For example: 30 July 2026, around 2:00 pm",
      supportType: "For example: community participation support",
      setting: "For example: community setting, without a street address",
      supportDelivered: "Describe only the support that was delivered.",
      observableFacts:
        "Record what was seen, heard or documented without diagnosis or interpretation.",
      actionTaken: "Describe the action the worker actually took.",
      followUp: "Note any handover, review or follow-up that is still needed.",
    },
    boundary:
      "The output is a user-reviewed draft, not a completed record or clinical, legal, compliance, regulatory, care or professional advice.",
    generate: "Generate reviewable draft",
    reviewPrivacy: "Review privacy first",
    generating: "Generating draft",
    privacyReviewTitle: "Privacy Review",
    privacyNeedsAttention: "Some fields need attention",
    privacyNeedsAttentionDetail:
      "Choose a finding to return to the related input. Remove obvious identifying information before generating.",
    privacyWaiting: "Obvious formats are checked before generation",
    privacyWaitingDetail:
      "This is a limited automated check and does not replace your review of every input.",
    privacyReviewReadyWithFindings: "Review these findings",
    privacyReviewClear: "No obvious clues detected",
    privacyReviewReadyDetail:
      "These checks and suggested changes were prepared in this browser. Review the structured facts yourself before continuing.",
    privacyReviewStale: "Content changed — review again",
    privacyReviewStaleDetail:
      "The structured facts changed after the last check. Run Privacy Review again before generating.",
    privacyActions: {
      remove: "Remove",
      replace: "Replace",
      generalise: "Generalise",
      review: "Review",
    },
    privacyResolution: {
      blocking: "Blocking",
      reviewRequired: "Review required",
      resolved: "Resolved",
      confirm: "Confirm",
    },
    originalTextTitle: "Original text (this session only)",
    sanitisedPreviewTitle: "Sanitised text preview",
    structuredFactsTitle: "Extracted structured facts",
    privacyChecks: [
      "Use generic terms such as participant or person",
      "Exclude numbers, contact details and specific addresses",
      "Record observable facts and actions only",
    ],
    reviewPromptsTitle: "Draft review prompts",
    privacyAutomationLimit:
      "Automated checks cannot identify every type of personal information. Review every field before submitting.",
    confirmationTitle: "Confirm before generating",
    confirmationLocked: "Complete Privacy Review before selecting these confirmations.",
    confirmationFindingsLocked: "Resolve every privacy finding before selecting these confirmations.",
    reviewedNoIdentifiers:
      "I reviewed the facts and did not intentionally include names, contact details, participant numbers or other identifying information.",
    processingAuthorityConfirmed:
      "I confirm I am authorised to process these details for this documentation purpose.",
    authorityNotConsent:
      "This confirms processing authority only. It does not state or replace participant consent.",
    viewDraftStatus: "View draft status",
    resultTitle: "Reviewable draft",
    resultReady: "Check every fact before copying or saving.",
    resultEmpty: "Your generated wording will appear on this document surface.",
    emptyDetail: "Enter the facts and complete Privacy Review to generate a draft.",
    copyAll: "Copy all",
    copy: "Copy",
    copied: "Copied",
    output: {
      englishCaseNoteDraft: "English case note draft",
      chineseReviewVersion: "Chinese review version",
      missingFacts: "Missing facts to review",
      neutralWordingChecks: "Neutral wording checks",
      followUpPrompts: "Follow-up prompts",
      none: "No additional items.",
    },
    chineseReviewBoundary:
      "For factual checking against the English draft only. This is not a second formal record.",
    save: "Save this draft",
    saving: "Saving",
    saved: "Draft saved to your account",
    historyEyebrow: "Your account",
    historyTitle: "Recently saved drafts",
    savedCount: "saved",
    footerBoundary:
      "CaresLink AI provides general documentation and operational support. Every draft requires user review.",
    requiredField: "Required before a draft can be generated.",
    errors: {
      identifiers: "Remove the highlighted identifying information and try again.",
      privacyReview: "Complete Privacy Review and both confirmations first.",
      minimumFacts: "Complete the highlighted minimum facts, then run Privacy Review again.",
      dailyLimit: "Your draft limit has been reached for today.",
      rateLimit: "Too many requests. Please wait before trying again.",
      save: "This draft could not be saved. Please try again.",
      generic: "The draft could not be generated. Please try again.",
    },
  };
}
