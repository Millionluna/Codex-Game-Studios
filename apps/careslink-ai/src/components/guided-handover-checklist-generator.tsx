"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  FileText,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Card } from "./ui";
import type { ReferralWorkspaceCopy } from "@/lib/referral-workspace-i18n";

type HandoverChecklistMaterial = {
  checklistTitle: string;
  consentCheck: string;
  clientContext: string;
  supportNeed: string;
  handoverDetails: string;
  nextStep: string;
  disclaimer: string;
};

type HandoverChecklistApiResponse =
  | {
      ok: true;
      material: HandoverChecklistMaterial;
    }
  | {
      ok: false;
      error?: string;
      retryAfterSeconds?: number;
    };

export type GuidedHandoverChecklistDisabledReason =
  | "verified_session_required"
  | "claimed_draft_required"
  | "access_required";

type GuidedHandoverChecklistGeneratorProps = {
  draftId?: string;
  profileName: string;
  enabled: boolean;
  disabledReason?: GuidedHandoverChecklistDisabledReason;
  copy: ReferralWorkspaceCopy["materials"]["handoverChecklistGenerator"];
};

type RequestState = "idle" | "loading" | "success" | "error";

export function GuidedHandoverChecklistGenerator({
  draftId,
  profileName,
  enabled,
  disabledReason = "access_required",
  copy,
}: GuidedHandoverChecklistGeneratorProps) {
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [material, setMaterial] = useState<
    HandoverChecklistMaterial | undefined
  >();
  const [errorMessage, setErrorMessage] = useState("");
  const isLoading = requestState === "loading";
  const canSubmit = enabled && !isLoading;

  async function generateHandoverChecklistDraft() {
    if (!enabled) {
      return;
    }

    setRequestState("loading");
    setErrorMessage("");

    try {
      const response = await fetch("/api/guided-materials/handover-checklist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draftId ? { draftId } : {}),
      });
      const body = (await response.json()) as HandoverChecklistApiResponse;

      if (!response.ok || !body.ok) {
        setMaterial(undefined);
        setRequestState("error");
        setErrorMessage(
          getGuidedHandoverChecklistErrorMessage(response.status, body, copy),
        );
        return;
      }

      setMaterial(body.material);
      setRequestState("success");
    } catch {
      setMaterial(undefined);
      setRequestState("error");
      setErrorMessage(copy.errors.generic);
    }
  }

  return (
    <div data-testid="guided-handover-checklist-generator">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
              <ClipboardList className="size-5" aria-hidden="true" />
              {copy.title}
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#65736f]">
              {copy.description}
            </p>
            <div className="mt-4 inline-flex max-w-full items-center gap-2 rounded-md border border-[#dce8e2] bg-[#f8fbfa] px-3 py-2 text-sm text-[#40504b]">
              <FileText
                className="size-4 shrink-0 text-[#0f766e]"
                aria-hidden="true"
              />
              <span className="shrink-0 font-semibold">
                {copy.profileLabel}
              </span>
              <span className="min-w-0 truncate">{profileName}</span>
            </div>
          </div>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={generateHandoverChecklistDraft}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#0f766e] px-4 text-sm font-semibold text-white transition hover:bg-[#0b5f59] disabled:cursor-not-allowed disabled:bg-[#9fb8b1] disabled:text-white"
          >
            {isLoading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="size-4" aria-hidden="true" />
            )}
            {isLoading ? copy.generating : copy.generate}
          </button>
        </div>

        {!enabled ? (
          <div className="mt-4 flex gap-3 rounded-lg border border-[#f4d28f] bg-[#fff7df] p-3 text-sm leading-6 text-[#925b00]">
            <AlertTriangle className="mt-1 size-4 shrink-0" aria-hidden="true" />
            <p>{copy.disabledReasons[disabledReason]}</p>
          </div>
        ) : null}

        {requestState === "error" ? (
          <div className="mt-4 flex gap-3 rounded-lg border border-[#f0b7b7] bg-[#fff0f0] p-3 text-sm leading-6 text-[#a33a3a]">
            <AlertTriangle className="mt-1 size-4 shrink-0" aria-hidden="true" />
            <p>{errorMessage}</p>
          </div>
        ) : null}

        {material ? (
          <div className="mt-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
              <CheckCircle2 className="size-5" aria-hidden="true" />
              {copy.successTitle}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <HandoverChecklistField
                label={copy.fieldLabels.checklistTitle}
                value={material.checklistTitle}
              />
              <HandoverChecklistField
                label={copy.fieldLabels.consentCheck}
                value={material.consentCheck}
              />
              <HandoverChecklistField
                label={copy.fieldLabels.clientContext}
                value={material.clientContext}
              />
              <HandoverChecklistField
                label={copy.fieldLabels.supportNeed}
                value={material.supportNeed}
              />
              <HandoverChecklistField
                label={copy.fieldLabels.handoverDetails}
                value={material.handoverDetails}
              />
              <HandoverChecklistField
                label={copy.fieldLabels.nextStep}
                value={material.nextStep}
              />
              <div className="md:col-span-2">
                <HandoverChecklistField
                  label={copy.fieldLabels.disclaimer}
                  value={material.disclaimer}
                />
              </div>
            </div>
          </div>
        ) : null}

        <p className="mt-4 rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-3 text-xs leading-5 text-[#65736f]">
          {copy.boundary}
        </p>
      </Card>
    </div>
  );
}

function HandoverChecklistField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-h-20 rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-3">
      <p className="text-xs font-semibold text-[#65736f]">{label}</p>
      <p className="mt-2 text-sm leading-6 text-[#263834]">{value}</p>
    </div>
  );
}

function getGuidedHandoverChecklistErrorMessage(
  status: number,
  body: HandoverChecklistApiResponse,
  copy: ReferralWorkspaceCopy["materials"]["handoverChecklistGenerator"],
) {
  const error = body.ok ? "" : body.error ?? "";

  if (status === 401) {
    return copy.errors.loginRequired;
  }

  if (status === 403) {
    return copy.errors.accessRequired;
  }

  if (status === 429) {
    return error.toLowerCase().includes("quota")
      ? copy.errors.quotaExhausted
      : copy.errors.rateLimited;
  }

  return copy.errors.generic;
}
