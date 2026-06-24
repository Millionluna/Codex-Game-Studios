import type { ComponentType, SVGProps } from "react";
import {
  AlertTriangle,
  Bot,
  Building2,
  CheckCircle2,
  CircleGauge,
  ClipboardList,
  FileLock2,
  FileText,
  Info,
  KeyRound,
  Languages,
  LockKeyhole,
  MapPin,
  MessageSquareText,
  Send,
  UserRound,
} from "lucide-react";
import { Card } from "@/components/ui";
import type {
  AccessState,
  AgentQueueItem,
  BasicProfileSummary,
  HealthAudit,
  HealthStatus,
  LockedMaterial,
} from "@/lib/referral-profile-workspace";
import { REQUIRED_REFERRAL_PROFILE_BOUNDARY } from "@/lib/referral-profile-safe-copy";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

type BasicProfileCardProps = {
  summary: BasicProfileSummary;
  className?: string;
};

type HealthScorePanelProps = {
  audit: HealthAudit;
  className?: string;
};

type HealthSignalsTableProps = {
  audit: HealthAudit;
  className?: string;
};

type TopIssuesPanelProps = {
  audit: HealthAudit;
  limit?: number;
  className?: string;
};

type LockedMaterialsGridProps = {
  materials: LockedMaterial[];
  accessState: AccessState;
  className?: string;
};

type AgentQueuePanelProps = {
  queue: AgentQueueItem[];
  accessState: AccessState;
  className?: string;
};

type AccessStatusPanelProps = {
  accessState: AccessState;
  className?: string;
};

type GuidedCopilotPanelProps = {
  accessState: AccessState;
  queue: AgentQueueItem[];
  summary?: BasicProfileSummary;
  audit?: HealthAudit;
  className?: string;
};

type TrustBoundaryNoticeProps = {
  className?: string;
};

type CompletionBadgeProps = {
  audit: Pick<HealthAudit, "score" | "band">;
  className?: string;
};

const signalToneClasses: Record<HealthStatus, string> = {
  good: "border-[#9ed8c9] bg-[#e6f7f2] text-[#0f766e]",
  warning: "border-[#f4d28f] bg-[#fff7df] text-[#925b00]",
  high: "border-[#f0b7b7] bg-[#fff0f0] text-[#a33a3a]",
};

const signalLabels: Record<HealthStatus, string> = {
  good: "Complete",
  warning: "Needs detail",
  high: "Missing",
};

const issueToneClasses = {
  high: "border-[#f0b7b7] bg-[#fff0f0] text-[#a33a3a]",
  warning: "border-[#f4d28f] bg-[#fff7df] text-[#925b00]",
};

const directionLabels: Record<LockedMaterial["direction"], string> = {
  receive: "Receive",
  send: "Send",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, score));
}

function canUseGuidedWorkspace(accessState: AccessState) {
  return (
    accessState.hasAccessCode &&
    accessState.status === "approved" &&
    accessState.dailyQuota > accessState.usedToday
  );
}

function getRemainingQuota(accessState: AccessState) {
  return Math.max(0, accessState.dailyQuota - accessState.usedToday);
}

function accessStatusCopy(accessState: AccessState) {
  if (canUseGuidedWorkspace(accessState)) {
    return {
      label: "Access code active",
      detail: "Guided materials are available while daily quota remains.",
      tone: "good" as const,
    };
  }

  if (accessState.hasAccessCode && accessState.status === "approved") {
    return {
      label: "Quota used today",
      detail: "Preview materials remain visible. Guided drafting unlocks again with available quota.",
      tone: "warning" as const,
    };
  }

  if (accessState.status === "waitlist") {
    return {
      label: "Access request queued",
      detail: "Preview materials remain visible until an access code is active.",
      tone: "warning" as const,
    };
  }

  return {
    label: "Free preview",
    detail: "Preview materials are visible. Guided drafting requires an access code.",
    tone: "high" as const,
  };
}

function scoreTone(score: number) {
  if (score >= 85) {
    return "border-[#9ed8c9] bg-[#e6f7f2] text-[#0f766e]";
  }

  if (score >= 70) {
    return "border-[#b9d7ff] bg-[#edf5ff] text-[#19518d]";
  }

  if (score >= 40) {
    return "border-[#f4d28f] bg-[#fff7df] text-[#925b00]";
  }

  return "border-[#f0b7b7] bg-[#fff0f0] text-[#a33a3a]";
}

function EntityIcon({ label }: { label: string }) {
  const Icon = label.toLowerCase().includes("organisation")
    ? Building2
    : UserRound;

  return <Icon className="size-5 text-[#0f766e]" aria-hidden="true" />;
}

function LabelValue({
  icon: Icon,
  label,
  value,
}: {
  icon: IconComponent;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-14 gap-3 rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-[#0f766e]" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-[#65736f]">{label}</p>
        <p className="mt-1 break-words text-sm leading-5 text-[#17211f]">{value}</p>
      </div>
    </div>
  );
}

function StatusBadge({
  children,
  className,
}: {
  children: string;
  className: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex min-h-7 items-center rounded-md border px-2 py-1 text-xs font-semibold",
        className,
      )}
    >
      {children}
    </span>
  );
}

function EmptyState({
  icon: Icon,
  title,
  detail,
}: {
  icon: IconComponent;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex min-h-36 items-center gap-3 rounded-lg border border-dashed border-[#cfded8] bg-[#f8fbfa] p-4">
      <Icon className="size-5 shrink-0 text-[#65736f]" aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold text-[#17211f]">{title}</p>
        <p className="mt-1 text-sm leading-6 text-[#65736f]">{detail}</p>
      </div>
    </div>
  );
}

function CopilotMessage({
  label,
  children,
  tone = "neutral",
}: {
  label: string;
  children: string;
  tone?: "neutral" | "system";
}) {
  return (
    <div
      className={cx(
        "rounded-lg border p-3 text-sm leading-6",
        tone === "system"
          ? "border-[#dce8e2] bg-[#f8fbfa] text-[#40504b]"
          : "border-[#cfded8] bg-white text-[#263834]",
      )}
    >
      <p className="mb-1 text-xs font-semibold text-[#65736f]">{label}</p>
      <p>{children}</p>
    </div>
  );
}

export function BasicProfileCard({ summary, className = "" }: BasicProfileCardProps) {
  return (
    <Card className={cx("flex h-full min-h-80 flex-col p-5", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
            <EntityIcon label={summary.entityLabel} />
            <span>{summary.entityLabel}</span>
          </div>
          <h2 className="mt-3 break-words text-xl font-semibold text-[#17211f]">
            {summary.title}
          </h2>
        </div>
        <StatusBadge className="border-[#b9d7ff] bg-[#edf5ff] text-[#19518d]">
          {summary.directionLabel}
        </StatusBadge>
      </div>

      <p className="mt-4 text-sm leading-6 text-[#40504b]">{summary.description}</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <LabelValue icon={MapPin} label="Service area" value={summary.serviceAreaLabel} />
        <LabelValue icon={Languages} label="Languages" value={summary.languageLabel} />
      </div>

      <div className="mt-auto pt-5">
        <div className="flex gap-2 rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-3 text-sm leading-6 text-[#5d6d68]">
          <Info className="mt-1 size-4 shrink-0 text-[#65736f]" aria-hidden="true" />
          <p>{summary.footer}</p>
        </div>
      </div>
    </Card>
  );
}

export function CompletionBadge({ audit, className = "" }: CompletionBadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex min-h-8 items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-semibold",
        scoreTone(audit.score),
        className,
      )}
    >
      <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
      <span>{clampScore(audit.score)}%</span>
      <span className="min-w-0 break-words">{audit.band}</span>
    </span>
  );
}

export function HealthScorePanel({ audit, className = "" }: HealthScorePanelProps) {
  const score = clampScore(audit.score);

  return (
    <Card className={cx("flex h-full min-h-80 flex-col p-5", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
            <CircleGauge className="size-5" aria-hidden="true" />
            Referral communication score
          </div>
          <p className="mt-3 text-sm leading-6 text-[#65736f]">{audit.summary}</p>
        </div>
        <CompletionBadge audit={audit} />
      </div>

      <div className="mt-6">
        <div className="flex items-end gap-2">
          <p className="text-5xl font-semibold text-[#17211f]">{score}</p>
          <p className="pb-2 text-sm font-semibold text-[#65736f]">/ 100</p>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-md bg-[#eef3f1]">
          <div
            className="h-full rounded-md bg-[#0f766e]"
            style={{ width: `${score}%` }}
            aria-hidden="true"
          />
        </div>
      </div>

      <div className="mt-5 grid gap-2">
        {audit.recommendations.slice(0, 3).map((recommendation) => (
          <div key={recommendation} className="flex gap-2 text-sm leading-6 text-[#40504b]">
            <ClipboardList className="mt-1 size-4 shrink-0 text-[#19518d]" aria-hidden="true" />
            <p>{recommendation}</p>
          </div>
        ))}
      </div>

      <p className="mt-auto pt-5 text-xs leading-5 text-[#65736f]">{audit.note}</p>
    </Card>
  );
}

export function HealthSignalsTable({ audit, className = "" }: HealthSignalsTableProps) {
  return (
    <Card className={cx("overflow-hidden", className)}>
      <div className="border-b border-[#dce8e2] p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
          <ClipboardList className="size-5" aria-hidden="true" />
          Readiness signals
        </div>
        <p className="mt-2 text-sm leading-6 text-[#65736f]">
          Field-level signals for referral communication completeness.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[720px] divide-y divide-[#dce8e2] text-left text-sm">
          <thead className="bg-[#f8fbfa] text-xs font-semibold text-[#65736f]">
            <tr>
              <th className="px-5 py-3">Signal</th>
              <th className="px-5 py-3">Detail</th>
              <th className="w-28 px-5 py-3">Points</th>
              <th className="w-36 px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef3f1]">
            {audit.signals.map((signal) => (
              <tr key={signal.id} className="align-top">
                <td className="px-5 py-4 font-semibold text-[#17211f]">{signal.label}</td>
                <td className="px-5 py-4 leading-6 text-[#40504b]">{signal.detail}</td>
                <td className="px-5 py-4 text-[#263834]">{signal.points}</td>
                <td className="px-5 py-4">
                  <StatusBadge className={signalToneClasses[signal.status]}>
                    {signalLabels[signal.status]}
                  </StatusBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function TopIssuesPanel({
  audit,
  limit = 4,
  className = "",
}: TopIssuesPanelProps) {
  const issues = audit.issues.slice(0, limit);

  return (
    <Card className={cx("p-5", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
            <AlertTriangle className="size-5" aria-hidden="true" />
            Top issues
          </div>
          <p className="mt-2 text-sm leading-6 text-[#65736f]">
            Prioritized gaps in the referral communication profile.
          </p>
        </div>
        <StatusBadge className="border-[#dce8e2] bg-[#f8fbfa] text-[#40504b]">
          {issues.length === 1 ? "1 item" : `${issues.length} items`}
        </StatusBadge>
      </div>

      <div className="mt-5 grid gap-3">
        {issues.length > 0 ? (
          issues.map((issue) => (
            <div key={issue.id} className="rounded-lg border border-[#dce8e2] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold text-[#17211f]">
                    {issue.title}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[#65736f]">{issue.label}</p>
                </div>
                <StatusBadge className={issueToneClasses[issue.priority]}>
                  {issue.priority === "high" ? "High priority" : "Needs detail"}
                </StatusBadge>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#40504b]">{issue.guidance}</p>
            </div>
          ))
        ) : (
          <EmptyState
            icon={CheckCircle2}
            title="No priority issues"
            detail="This audit did not find priority communication gaps in the current profile."
          />
        )}
      </div>
    </Card>
  );
}

export function LockedMaterialsGrid({
  materials,
  accessState,
  className = "",
}: LockedMaterialsGridProps) {
  const canUseGuided = canUseGuidedWorkspace(accessState);

  return (
    <div className={cx("grid gap-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
            <FileText className="size-5" aria-hidden="true" />
            Guided materials
          </div>
          <p className="mt-2 text-sm leading-6 text-[#65736f]">
            Preview text remains visible when guided drafting is locked.
          </p>
        </div>
        <StatusBadge
          className={
            canUseGuided
              ? signalToneClasses.good
              : "border-[#f4d28f] bg-[#fff7df] text-[#925b00]"
          }
        >
          {canUseGuided ? "Guided drafting available" : "Access code required"}
        </StatusBadge>
      </div>

      {materials.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {materials.map((material) => (
            <Card key={material.id} className="flex min-h-64 flex-col p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#17211f]">
                    {material.locked ? (
                      <FileLock2 className="size-4 shrink-0 text-[#925b00]" aria-hidden="true" />
                    ) : (
                      <FileText className="size-4 shrink-0 text-[#0f766e]" aria-hidden="true" />
                    )}
                    <span className="break-words">{material.label}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#65736f]">
                    {material.description}
                  </p>
                </div>
                <StatusBadge className="border-[#b9d7ff] bg-[#edf5ff] text-[#19518d]">
                  {directionLabels[material.direction]}
                </StatusBadge>
              </div>

              <div className="mt-4 rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-3">
                <p className="text-xs font-semibold text-[#65736f]">Preview</p>
                <p className="mt-2 text-sm leading-6 text-[#263834]">{material.preview}</p>
              </div>

              <div className="mt-auto pt-4">
                <div
                  className={cx(
                    "flex min-h-12 items-start gap-2 rounded-lg border p-3 text-sm leading-6",
                    material.locked
                      ? "border-[#f4d28f] bg-[#fff7df] text-[#925b00]"
                      : "border-[#9ed8c9] bg-[#e6f7f2] text-[#0f766e]",
                  )}
                >
                  {material.locked ? (
                    <LockKeyhole className="mt-1 size-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="mt-1 size-4 shrink-0" aria-hidden="true" />
                  )}
                  <p>
                    {material.locked
                      ? material.lockReason ?? "Access code required for guided materials."
                      : "Ready for guided drafting from submitted profile details."}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={FileText}
          title="No materials configured"
          detail="Materials appear here when a receive or send direction is available for the profile."
        />
      )}
    </div>
  );
}

export function AgentQueuePanel({
  queue,
  accessState,
  className = "",
}: AgentQueuePanelProps) {
  const canUseGuided = canUseGuidedWorkspace(accessState);

  return (
    <Card className={cx("p-5", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
            <Bot className="size-5" aria-hidden="true" />
            Agent queue
          </div>
          <p className="mt-2 text-sm leading-6 text-[#65736f]">
            Guided steps are based on submitted profile fields and access state.
          </p>
        </div>
        <StatusBadge className={canUseGuided ? signalToneClasses.good : signalToneClasses.warning}>
          {canUseGuided ? "Ready" : "Locked"}
        </StatusBadge>
      </div>

      <div className="mt-5 grid gap-3">
        {queue.map((item) => {
          const ready = item.status === "ready" && canUseGuided;
          return (
            <div
              key={item.id}
              className="grid min-h-20 grid-cols-[auto_1fr] gap-3 rounded-lg border border-[#dce8e2] p-3"
            >
              <div
                className={cx(
                  "flex size-9 items-center justify-center rounded-lg",
                  ready ? "bg-[#e6f7f2] text-[#0f766e]" : "bg-[#fff7df] text-[#925b00]",
                )}
              >
                {ready ? (
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                ) : (
                  <LockKeyhole className="size-4" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="break-words text-sm font-semibold text-[#17211f]">{item.label}</p>
                  <StatusBadge className={ready ? signalToneClasses.good : signalToneClasses.warning}>
                    {ready ? "Ready" : "Access code"}
                  </StatusBadge>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#40504b]">
                  {ready ? item.accessCodeState : item.freeState}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function AccessStatusPanel({
  accessState,
  className = "",
}: AccessStatusPanelProps) {
  const status = accessStatusCopy(accessState);
  const remainingQuota = getRemainingQuota(accessState);
  const quotaTotal = Math.max(0, accessState.dailyQuota);
  const quotaUsed = Math.min(Math.max(0, accessState.usedToday), quotaTotal);
  const quotaPercent = quotaTotal > 0 ? (quotaUsed / quotaTotal) * 100 : 0;

  return (
    <Card className={cx("p-5", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
            <KeyRound className="size-5" aria-hidden="true" />
            Access status
          </div>
          <p className="mt-2 text-sm leading-6 text-[#65736f]">{status.detail}</p>
        </div>
        <StatusBadge className={signalToneClasses[status.tone]}>{status.label}</StatusBadge>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <LabelValue
          icon={KeyRound}
          label="Access code"
          value={accessState.hasAccessCode ? "Present" : "Not present"}
        />
        <LabelValue icon={ClipboardList} label="Used today" value={`${quotaUsed}`} />
        <LabelValue icon={CheckCircle2} label="Remaining" value={`${remainingQuota}`} />
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-3 text-xs font-semibold text-[#65736f]">
          <span>Daily guided quota</span>
          <span>
            {quotaUsed} / {quotaTotal}
          </span>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-md bg-[#eef3f1]">
          <div
            className="h-full rounded-md bg-[#19518d]"
            style={{ width: `${quotaPercent}%` }}
            aria-hidden="true"
          />
        </div>
        {accessState.codeType ? (
          <p className="mt-3 text-sm leading-6 text-[#40504b]">{accessState.codeType}</p>
        ) : null}
      </div>
    </Card>
  );
}

export function GuidedCopilotPanel({
  accessState,
  queue,
  summary,
  audit,
  className = "",
}: GuidedCopilotPanelProps) {
  const canUseGuided = canUseGuidedWorkspace(accessState);
  const activeItem = queue.find((item) => item.status === (canUseGuided ? "ready" : "locked")) ?? queue[0];
  const status = accessStatusCopy(accessState);

  return (
    <Card className={cx("flex h-full min-h-[520px] flex-col overflow-hidden", className)}>
      <div className="border-b border-[#dce8e2] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
              <MessageSquareText className="size-5" aria-hidden="true" />
              Guided copilot
            </div>
            <p className="mt-2 text-sm leading-6 text-[#65736f]">
              Right-side workspace for profile drafting prompts.
            </p>
          </div>
          <StatusBadge className={signalToneClasses[status.tone]}>{status.label}</StatusBadge>
        </div>
      </div>

      <div className="flex-1 space-y-3 bg-[#f8fbfa] p-4">
        <CopilotMessage label="Profile context" tone="system">
          {summary
            ? `${summary.title}: ${summary.directionLabel}. ${summary.serviceAreaLabel}.`
            : "Select a profile to show submitted referral context."}
        </CopilotMessage>

        {audit ? (
          <CopilotMessage label="Readiness context" tone="system">
            {`Current score is ${clampScore(audit.score)} out of 100. ${audit.note}`}
          </CopilotMessage>
        ) : null}

        <CopilotMessage label={canUseGuided ? "Guided step" : "Preview step"}>
          {activeItem
            ? canUseGuided
              ? activeItem.accessCodeState
              : activeItem.freeState
            : "Queue items appear here when a guided workflow is configured."}
        </CopilotMessage>

        {!canUseGuided ? (
          <CopilotMessage label="Access boundary">
            Access code required before guided drafting is available. Preview materials remain visible.
          </CopilotMessage>
        ) : null}
      </div>

      <div className="border-t border-[#dce8e2] bg-white p-4">
        <div className="flex min-h-11 items-center gap-3 rounded-lg border border-[#cfded8] bg-[#f8fbfa] px-3 text-sm text-[#65736f]">
          <MessageSquareText className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {canUseGuided ? "Drafting prompt ready" : "Preview mode only"}
          </span>
          <Send className="size-4 shrink-0 text-[#91a09b]" aria-hidden="true" />
        </div>
      </div>
    </Card>
  );
}

export function TrustBoundaryNotice({ className = "" }: TrustBoundaryNoticeProps) {
  return (
    <div
      className={cx(
        "flex gap-3 rounded-lg border border-[#cfded8] bg-[#f8fbfa] p-4 text-sm leading-6 text-[#40504b]",
        className,
      )}
      role="note"
    >
      <Info className="mt-1 size-5 shrink-0 text-[#0f766e]" aria-hidden="true" />
      <p>{REQUIRED_REFERRAL_PROFILE_BOUNDARY}</p>
    </div>
  );
}
