"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Card } from "./ui";
import type { ReferralWorkspaceCopy } from "@/lib/referral-workspace-i18n";

type ProfileRewriteMaterial = {
  professionalEnglishDescription: string;
  shortEnglishSummary: string;
  chineseCommunityIntro: string;
  referralPartnerSummary: string;
  profileImprovementNotes: string;
  disclaimer: string;
};

type ProfileRewriteApiResponse =
  | {
      ok: true;
      material: ProfileRewriteMaterial;
    }
  | {
      ok: false;
      error?: string;
      retryAfterSeconds?: number;
    };

export type GuidedProfileRewriteDisabledReason =
  | "verified_session_required"
  | "claimed_draft_required"
  | "access_required";

type GuidedProfileRewriteGeneratorProps = {
  draftId?: string;
  profileName: string;
  enabled: boolean;
  disabledReason?: GuidedProfileRewriteDisabledReason;
  copy: ReferralWorkspaceCopy["materials"]["profileRewriteGenerator"];
};

type RequestState = "idle" | "loading" | "success" | "error";

export function GuidedProfileRewriteGenerator({
  draftId,
  profileName,
  enabled,
  disabledReason = "access_required",
  copy,
}: GuidedProfileRewriteGeneratorProps) {
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [material, setMaterial] = useState<ProfileRewriteMaterial | undefined>();
  const [errorMessage, setErrorMessage] = useState("");
  const isLoading = requestState === "loading";
  const canSubmit = enabled && !isLoading;

  async function generateProfileRewriteDraft() {
    if (!enabled) {
      return;
    }

    setRequestState("loading");
    setErrorMessage("");

    try {
      const response = await fetch("/api/guided-materials/profile-rewrite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draftId ? { draftId } : {}),
      });
      const body = (await response.json()) as ProfileRewriteApiResponse;

      if (!response.ok || !body.ok) {
        setMaterial(undefined);
        setRequestState("error");
        setErrorMessage(
          getGuidedProfileRewriteErrorMessage(response.status, body, copy),
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
    <div data-testid="guided-profile-rewrite-generator">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#181715]">
              <Sparkles className="size-5 text-[#635f57]" aria-hidden="true" />
              {copy.title}
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#635f57]">
              {copy.description}
            </p>
            <div className="mt-4 inline-flex max-w-full items-center gap-2 rounded-md border border-[#e3ddd2] bg-[#fbfaf7] px-3 py-2 text-sm text-[#3f3b34]">
              <FileText
                className="size-4 shrink-0 text-[#635f57]"
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
            onClick={generateProfileRewriteDraft}
            className="taito-primary px-4 disabled:cursor-not-allowed disabled:border-[#d8d0c1] disabled:bg-[#d8d0c1] disabled:text-[#635f57]"
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
          <div className="mt-4 flex gap-3 rounded-lg border border-[#ded6c8] bg-[#fbfaf7] p-3 text-sm leading-6 text-[#3f3b34]">
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
            <div className="flex items-center gap-2 text-sm font-semibold text-[#181715]">
              <CheckCircle2 className="size-5 text-[#635f57]" aria-hidden="true" />
              {copy.successTitle}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <ProfileRewriteField
                label={copy.fieldLabels.professionalEnglishDescription}
                value={material.professionalEnglishDescription}
              />
              <ProfileRewriteField
                label={copy.fieldLabels.shortEnglishSummary}
                value={material.shortEnglishSummary}
              />
              <ProfileRewriteField
                label={copy.fieldLabels.chineseCommunityIntro}
                value={material.chineseCommunityIntro}
              />
              <ProfileRewriteField
                label={copy.fieldLabels.referralPartnerSummary}
                value={material.referralPartnerSummary}
              />
              <ProfileRewriteField
                label={copy.fieldLabels.profileImprovementNotes}
                value={material.profileImprovementNotes}
              />
              <ProfileRewriteField
                label={copy.fieldLabels.disclaimer}
                value={material.disclaimer}
              />
            </div>
          </div>
        ) : null}

        <p className="mt-4 rounded-lg border border-[#e3ddd2] bg-[#fbfaf7] p-3 text-xs leading-5 text-[#635f57]">
          {copy.boundary}
        </p>
      </Card>
    </div>
  );
}

function ProfileRewriteField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-20 rounded-lg border border-[#e3ddd2] bg-[#fbfaf7] p-3">
      <p className="text-xs font-semibold text-[#635f57]">{label}</p>
      <p className="mt-2 text-sm leading-6 text-[#181715]">{value}</p>
    </div>
  );
}

function getGuidedProfileRewriteErrorMessage(
  status: number,
  body: ProfileRewriteApiResponse,
  copy: ReferralWorkspaceCopy["materials"]["profileRewriteGenerator"],
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
