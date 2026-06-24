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
import { Card } from "./ui";
import {
  canUseGuidedMaterials,
  type AccessState,
  type AgentQueueItem,
  type BasicProfileSummary,
  type HealthAudit,
  type HealthStatus,
  type LockedMaterial,
} from "../lib/referral-profile-workspace";
import {
  DEFAULT_LOCALE,
  getReferralWorkspaceCopy,
  type Locale,
  type ReferralWorkspaceCopy,
} from "@/lib/referral-workspace-i18n";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;
type ComponentCopy = ReferralWorkspaceCopy["components"];

type BasicProfileCardProps = {
  summary: BasicProfileSummary;
  locale?: Locale;
  className?: string;
};

type HealthScorePanelProps = {
  audit: HealthAudit;
  locale?: Locale;
  className?: string;
};

type HealthSignalsTableProps = {
  audit: HealthAudit;
  locale?: Locale;
  className?: string;
};

type TopIssuesPanelProps = {
  audit: HealthAudit;
  limit?: number;
  locale?: Locale;
  className?: string;
};

type LockedMaterialsGridProps = {
  materials: LockedMaterial[];
  accessState: AccessState;
  locale?: Locale;
  className?: string;
};

type AgentQueuePanelProps = {
  queue: AgentQueueItem[];
  accessState: AccessState;
  locale?: Locale;
  className?: string;
};

type AccessStatusPanelProps = {
  accessState: AccessState;
  locale?: Locale;
  className?: string;
};

type GuidedCopilotPanelProps = {
  accessState: AccessState;
  queue: AgentQueueItem[];
  summary?: BasicProfileSummary;
  audit?: HealthAudit;
  locale?: Locale;
  className?: string;
};

type TrustBoundaryNoticeProps = {
  locale?: Locale;
  className?: string;
};

type CompletionBadgeProps = {
  audit: Pick<HealthAudit, "score" | "band">;
  locale?: Locale;
  className?: string;
};

type HealthIssueItem = HealthAudit["issues"][number];
type IssueCopy = ComponentCopy["topIssues"]["issues"][keyof ComponentCopy["topIssues"]["issues"]];
type MaterialCopy = ComponentCopy["materialsGrid"]["materials"][keyof ComponentCopy["materialsGrid"]["materials"]];
type QueueItemCopy = ComponentCopy["agentQueue"]["items"][keyof ComponentCopy["agentQueue"]["items"]];

const signalToneClasses: Record<HealthStatus, string> = {
  good: "border-[#9ed8c9] bg-[#e6f7f2] text-[#0f766e]",
  warning: "border-[#f4d28f] bg-[#fff7df] text-[#925b00]",
  high: "border-[#f0b7b7] bg-[#fff0f0] text-[#a33a3a]",
};

const issueToneClasses = {
  high: "border-[#f0b7b7] bg-[#fff0f0] text-[#a33a3a]",
  warning: "border-[#f4d28f] bg-[#fff7df] text-[#925b00]",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, score));
}

function canUseGuidedWorkspace(accessState: AccessState) {
  return canUseGuidedMaterials(accessState);
}

function getRemainingQuota(accessState: AccessState) {
  return Math.max(0, accessState.dailyQuota - accessState.usedToday);
}

function formatTemplate(
  template: string,
  values: Record<string, string | number>,
) {
  return Object.entries(values).reduce(
    (formatted, [key, value]) =>
      formatted.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function formatCountLabel(
  count: number,
  labels: ComponentCopy["topIssues"]["countLabel"],
) {
  const template = count === 1 ? labels.one : labels.other;

  return formatTemplate(template, { count });
}

function getCopyById<T extends Record<string, TValue>, TValue>(
  record: T,
  id: string,
): TValue | undefined {
  return Object.prototype.hasOwnProperty.call(record, id)
    ? record[id as keyof T]
    : undefined;
}

function localizedIssueCopy(
  issue: HealthIssueItem,
  copy: ComponentCopy["topIssues"],
): IssueCopy {
  return (
    getCopyById(copy.issues, issue.id) ?? {
      label: issue.label,
      title: issue.title,
      guidance: issue.guidance,
    }
  );
}

function localizedMaterialCopy(
  material: LockedMaterial,
  copy: ComponentCopy["materialsGrid"],
): MaterialCopy {
  return (
    getCopyById(copy.materials, material.id) ?? {
      label: material.label,
      description: material.description,
      preview: material.preview,
    }
  );
}

function localizedQueueItemCopy(
  item: AgentQueueItem,
  copy: ComponentCopy["agentQueue"],
): QueueItemCopy {
  return (
    getCopyById(copy.items, item.id) ?? {
      label: item.label,
      freeState: item.freeState,
      accessCodeState: item.accessCodeState,
    }
  );
}

function accessStatusCopy(
  accessState: AccessState,
  copy: ComponentCopy["accessStatus"],
) {
  if (canUseGuidedWorkspace(accessState)) {
    return {
      ...copy.states.active,
      tone: "good" as const,
    };
  }

  if (accessState.hasAccessCode && accessState.status === "approved") {
    return {
      ...copy.states.quotaUsed,
      tone: "warning" as const,
    };
  }

  if (accessState.status === "waitlist") {
    return {
      ...copy.states.waitlist,
      tone: "warning" as const,
    };
  }

  return {
    ...copy.states.free,
    tone: "warning" as const,
  };
}

function lockedGuidedMaterialMessage(
  accessState: AccessState,
  copy: ComponentCopy["materialsGrid"],
) {
  if (accessState.hasAccessCode && accessState.status === "approved") {
    return copy.lockedMessages.quotaUsed;
  }

  if (accessState.status === "waitlist") {
    return copy.lockedMessages.waitlist;
  }

  return copy.lockedMessages.accessRequired;
}

function lockedGuidedStatusLabel(
  accessState: AccessState,
  copy: ComponentCopy["materialsGrid"],
) {
  if (accessState.hasAccessCode && accessState.status === "approved") {
    return copy.lockedStatusLabels.quotaUsed;
  }

  if (accessState.status === "waitlist") {
    return copy.lockedStatusLabels.waitlist;
  }

  return copy.lockedStatusLabels.accessRequired;
}

function lockedQueueBadgeLabel(
  accessState: AccessState,
  copy: ComponentCopy["agentQueue"],
) {
  if (accessState.hasAccessCode && accessState.status === "approved") {
    return copy.lockedBadgeLabels.quotaUsed;
  }

  if (accessState.status === "waitlist") {
    return copy.lockedBadgeLabels.queued;
  }

  return copy.lockedBadgeLabels.accessCode;
}

function copilotBoundaryMessage(
  accessState: AccessState,
  copy: ComponentCopy["copilot"],
) {
  if (accessState.hasAccessCode && accessState.status === "approved") {
    return copy.boundaryMessages.quotaUsed;
  }

  if (accessState.status === "waitlist") {
    return copy.boundaryMessages.waitlist;
  }

  return copy.boundaryMessages.accessRequired;
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

export function BasicProfileCard({
  summary,
  locale = DEFAULT_LOCALE,
  className = "",
}: BasicProfileCardProps) {
  const copy = getReferralWorkspaceCopy(locale).components.basicProfile;
  const entityLabel = copy.entityLabels[summary.entityType];
  const directionLabel = copy.directionLabels[summary.referralDirection];

  return (
    <Card className={cx("flex h-full min-h-80 flex-col p-5", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
            <EntityIcon label={summary.entityLabel} />
            <span>{entityLabel}</span>
          </div>
          <h2 className="mt-3 break-words text-xl font-semibold text-[#17211f]">
            {summary.title}
          </h2>
        </div>
        <StatusBadge className="border-[#b9d7ff] bg-[#edf5ff] text-[#19518d]">
          {directionLabel}
        </StatusBadge>
      </div>

      <p className="mt-4 text-sm leading-6 text-[#40504b]">{summary.description}</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <LabelValue
          icon={MapPin}
          label={copy.serviceArea}
          value={summary.serviceAreaLabel}
        />
        <LabelValue
          icon={Languages}
          label={copy.languages}
          value={summary.languageLabel}
        />
      </div>

      <div className="mt-auto pt-5">
        <div className="flex gap-2 rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-3 text-sm leading-6 text-[#5d6d68]">
          <Info className="mt-1 size-4 shrink-0 text-[#65736f]" aria-hidden="true" />
          <p>{copy.footer}</p>
        </div>
      </div>
    </Card>
  );
}

export function CompletionBadge({
  audit,
  locale = DEFAULT_LOCALE,
  className = "",
}: CompletionBadgeProps) {
  const copy = getReferralWorkspaceCopy(locale).components.healthScore;
  const BadgeIcon =
    audit.score >= 85 ? CheckCircle2 : audit.score >= 70 ? CircleGauge : AlertTriangle;

  return (
    <span
      className={cx(
        "inline-flex min-h-8 items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-semibold",
        scoreTone(audit.score),
        className,
      )}
    >
      <BadgeIcon className="size-4 shrink-0" aria-hidden="true" />
      <span>{clampScore(audit.score)}%</span>
      <span className="min-w-0 break-words">{copy.bandLabels[audit.band]}</span>
    </span>
  );
}

export function HealthScorePanel({
  audit,
  locale = DEFAULT_LOCALE,
  className = "",
}: HealthScorePanelProps) {
  const componentCopy = getReferralWorkspaceCopy(locale).components;
  const copy = componentCopy.healthScore;
  const score = clampScore(audit.score);
  const recommendations =
    audit.issues.length > 0
      ? audit.issues
          .slice(0, 3)
          .map((issue) => localizedIssueCopy(issue, componentCopy.topIssues))
      : [{ title: copy.defaultRecommendation, guidance: copy.defaultRecommendation }];

  return (
    <Card className={cx("flex h-full min-h-80 flex-col p-5", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
            <CircleGauge className="size-5" aria-hidden="true" />
            {copy.heading}
          </div>
          <p className="mt-3 text-sm leading-6 text-[#65736f]">{copy.summary}</p>
        </div>
        <CompletionBadge audit={audit} locale={locale} />
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
        {recommendations.map((recommendation) => (
          <div key={recommendation.title} className="flex gap-2 text-sm leading-6 text-[#40504b]">
            <ClipboardList className="mt-1 size-4 shrink-0 text-[#19518d]" aria-hidden="true" />
            <p>{recommendation.guidance}</p>
          </div>
        ))}
      </div>

      <p className="mt-auto pt-5 text-xs leading-5 text-[#65736f]">{copy.note}</p>
    </Card>
  );
}

export function HealthSignalsTable({
  audit,
  locale = DEFAULT_LOCALE,
  className = "",
}: HealthSignalsTableProps) {
  const copy = getReferralWorkspaceCopy(locale).components.healthSignals;

  return (
    <Card className={cx("overflow-hidden", className)}>
      <div className="border-b border-[#dce8e2] p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
          <ClipboardList className="size-5" aria-hidden="true" />
          {copy.heading}
        </div>
        <p className="mt-2 text-sm leading-6 text-[#65736f]">
          {copy.description}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[720px] divide-y divide-[#dce8e2] text-left text-sm">
          <thead className="bg-[#f8fbfa] text-xs font-semibold text-[#65736f]">
            <tr>
              <th className="px-5 py-3">{copy.columns.signal}</th>
              <th className="px-5 py-3">{copy.columns.detail}</th>
              <th className="w-28 px-5 py-3">{copy.columns.points}</th>
              <th className="w-36 px-5 py-3">{copy.columns.status}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef3f1]">
            {audit.signals.map((signal) => {
              const signalCopy = copy.signals[signal.id];

              return (
                <tr key={signal.id} className="align-top">
                  <td className="px-5 py-4 font-semibold text-[#17211f]">
                    {signalCopy.label}
                  </td>
                  <td className="px-5 py-4 leading-6 text-[#40504b]">
                    {signalCopy.detail}
                  </td>
                  <td className="px-5 py-4 text-[#263834]">{signal.points}</td>
                  <td className="px-5 py-4">
                    <StatusBadge className={signalToneClasses[signal.status]}>
                      {copy.statusLabels[signal.status]}
                    </StatusBadge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function TopIssuesPanel({
  audit,
  limit = 4,
  locale = DEFAULT_LOCALE,
  className = "",
}: TopIssuesPanelProps) {
  const copy = getReferralWorkspaceCopy(locale).components.topIssues;
  const issues = audit.issues.slice(0, limit);

  return (
    <Card className={cx("p-5", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
            <AlertTriangle className="size-5" aria-hidden="true" />
            {copy.heading}
          </div>
          <p className="mt-2 text-sm leading-6 text-[#65736f]">
            {copy.description}
          </p>
        </div>
        <StatusBadge className="border-[#dce8e2] bg-[#f8fbfa] text-[#40504b]">
          {formatCountLabel(issues.length, copy.countLabel)}
        </StatusBadge>
      </div>

      <div className="mt-5 grid gap-3">
        {issues.length > 0 ? (
          issues.map((issue) => {
            const issueCopy = localizedIssueCopy(issue, copy);

            return (
              <div key={issue.id} className="border-l-2 border-[#dce8e2] bg-[#f8fbfa] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-[#17211f]">
                      {issueCopy.title}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-[#65736f]">{issueCopy.label}</p>
                  </div>
                  <StatusBadge className={issueToneClasses[issue.priority]}>
                    {copy.priorityLabels[issue.priority]}
                  </StatusBadge>
                </div>
                <p className="mt-3 text-sm leading-6 text-[#40504b]">{issueCopy.guidance}</p>
              </div>
            );
          })
        ) : (
          <EmptyState
            icon={CheckCircle2}
            title={copy.emptyTitle}
            detail={copy.emptyDetail}
          />
        )}
      </div>
    </Card>
  );
}

export function LockedMaterialsGrid({
  materials,
  accessState,
  locale = DEFAULT_LOCALE,
  className = "",
}: LockedMaterialsGridProps) {
  const workspaceCopy = getReferralWorkspaceCopy(locale);
  const copy = workspaceCopy.components.materialsGrid;
  const canUseGuided = canUseGuidedWorkspace(accessState);
  const lockedStatusLabel = lockedGuidedStatusLabel(accessState, copy);

  return (
    <div className={cx("grid gap-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
            <FileText className="size-5" aria-hidden="true" />
            {copy.heading}
          </div>
          <p className="mt-2 text-sm leading-6 text-[#65736f]">
            {copy.description}
          </p>
        </div>
        <StatusBadge
          className={
            canUseGuided
              ? signalToneClasses.good
              : "border-[#f4d28f] bg-[#fff7df] text-[#925b00]"
          }
        >
          {canUseGuided ? copy.guidedAvailable : lockedStatusLabel}
        </StatusBadge>
      </div>

      {materials.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {materials.map((material) => {
            const locked = !canUseGuided;
            const materialCopy = localizedMaterialCopy(material, copy);
            const lockedMessage = lockedGuidedMaterialMessage(
              accessState,
              copy,
            );

            return (
              <Card key={material.id} className="flex min-h-64 flex-col p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#17211f]">
                      {locked ? (
                        <FileLock2 className="size-4 shrink-0 text-[#925b00]" aria-hidden="true" />
                      ) : (
                        <FileText className="size-4 shrink-0 text-[#0f766e]" aria-hidden="true" />
                      )}
                      <span className="break-words">{materialCopy.label}</span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#65736f]">
                      {materialCopy.description}
                    </p>
                  </div>
                  <StatusBadge className="border-[#b9d7ff] bg-[#edf5ff] text-[#19518d]">
                    {copy.directionLabels[material.direction]}
                  </StatusBadge>
                </div>

                <div className="mt-4 rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-3">
                  <p className="text-xs font-semibold text-[#65736f]">
                    {workspaceCopy.common.previewOnly}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#263834]">{materialCopy.preview}</p>
                </div>

                <div className="mt-auto pt-4">
                  <div
                    className={cx(
                      "flex min-h-12 items-start gap-2 rounded-lg border p-3 text-sm leading-6",
                      locked
                        ? "border-[#f4d28f] bg-[#fff7df] text-[#925b00]"
                        : "border-[#9ed8c9] bg-[#e6f7f2] text-[#0f766e]",
                    )}
                  >
                    {locked ? (
                      <LockKeyhole className="mt-1 size-4 shrink-0" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 className="mt-1 size-4 shrink-0" aria-hidden="true" />
                    )}
                    <p>
                      {locked
                        ? lockedMessage
                        : copy.readyMessage}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={FileText}
          title={copy.noMaterialsTitle}
          detail={copy.noMaterialsDetail}
        />
      )}
    </div>
  );
}

export function AgentQueuePanel({
  queue,
  accessState,
  locale = DEFAULT_LOCALE,
  className = "",
}: AgentQueuePanelProps) {
  const copy = getReferralWorkspaceCopy(locale).components;
  const canUseGuided = canUseGuidedWorkspace(accessState);
  const status = accessStatusCopy(accessState, copy.accessStatus);
  const lockedBadgeLabel = lockedQueueBadgeLabel(
    accessState,
    copy.agentQueue,
  );

  return (
    <Card className={cx("p-5", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
            <Bot className="size-5" aria-hidden="true" />
            {copy.agentQueue.heading}
          </div>
          <p className="mt-2 text-sm leading-6 text-[#65736f]">
            {copy.agentQueue.description}
          </p>
        </div>
        <StatusBadge className={canUseGuided ? signalToneClasses.good : signalToneClasses.warning}>
          {canUseGuided ? copy.agentQueue.readyLabel : status.label}
        </StatusBadge>
      </div>

      <div className="mt-5 grid gap-3">
        {queue.map((item) => {
          const ready = canUseGuided;
          const itemCopy = localizedQueueItemCopy(item, copy.agentQueue);

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
                  <p className="break-words text-sm font-semibold text-[#17211f]">{itemCopy.label}</p>
                  <StatusBadge className={ready ? signalToneClasses.good : signalToneClasses.warning}>
                    {ready ? copy.agentQueue.readyLabel : lockedBadgeLabel}
                  </StatusBadge>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#40504b]">
                  {ready ? itemCopy.accessCodeState : itemCopy.freeState}
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
  locale = DEFAULT_LOCALE,
  className = "",
}: AccessStatusPanelProps) {
  const copy = getReferralWorkspaceCopy(locale).components.accessStatus;
  const status = accessStatusCopy(accessState, copy);
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
            {copy.heading}
          </div>
          <p className="mt-2 text-sm leading-6 text-[#65736f]">{status.detail}</p>
        </div>
        <StatusBadge className={signalToneClasses[status.tone]}>{status.label}</StatusBadge>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <LabelValue
          icon={KeyRound}
          label={copy.accessCodeLabel}
          value={accessState.hasAccessCode ? copy.present : copy.notPresent}
        />
        <LabelValue
          icon={ClipboardList}
          label={copy.usedToday}
          value={`${quotaUsed}`}
        />
        <LabelValue
          icon={CheckCircle2}
          label={copy.remaining}
          value={`${remainingQuota}`}
        />
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-3 text-xs font-semibold text-[#65736f]">
          <span>{copy.dailyGuidedQuota}</span>
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
  locale = DEFAULT_LOCALE,
  className = "",
}: GuidedCopilotPanelProps) {
  const workspaceCopy = getReferralWorkspaceCopy(locale);
  const copy = workspaceCopy.components;
  const canUseGuided = canUseGuidedWorkspace(accessState);
  const activeItem = queue[0];
  const activeItemCopy = activeItem
    ? localizedQueueItemCopy(activeItem, copy.agentQueue)
    : undefined;
  const status = accessStatusCopy(accessState, copy.accessStatus);
  const directionLabel = summary
    ? copy.basicProfile.directionLabels[summary.referralDirection]
    : undefined;

  return (
    <Card className={cx("flex h-full min-h-[520px] flex-col overflow-hidden", className)}>
      <div className="border-b border-[#dce8e2] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
              <MessageSquareText className="size-5" aria-hidden="true" />
              {copy.copilot.heading}
            </div>
            <p className="mt-2 text-sm leading-6 text-[#65736f]">
              {copy.copilot.description}
            </p>
          </div>
          <StatusBadge className={signalToneClasses[status.tone]}>{status.label}</StatusBadge>
        </div>
      </div>

      <div className="flex-1 space-y-3 bg-[#f8fbfa] p-4">
        <CopilotMessage label={copy.copilot.profileContextLabel} tone="system">
          {summary
            ? `${summary.title}: ${directionLabel}. ${summary.serviceAreaLabel}.`
            : copy.copilot.noProfileContext}
        </CopilotMessage>

        {audit ? (
          <CopilotMessage
            label={copy.copilot.readinessContextLabel}
            tone="system"
          >
            {`${formatTemplate(copy.copilot.readinessScore, {
              score: clampScore(audit.score),
            })} ${copy.healthScore.note}`}
          </CopilotMessage>
        ) : null}

        <CopilotMessage
          label={
            canUseGuided
              ? copy.copilot.guidedStepLabel
              : copy.copilot.previewStepLabel
          }
        >
          {activeItemCopy
            ? canUseGuided
              ? activeItemCopy.accessCodeState
              : activeItemCopy.freeState
            : copy.copilot.noQueueItem}
        </CopilotMessage>

        {!canUseGuided ? (
          <CopilotMessage label={copy.copilot.accessBoundaryLabel}>
            {copilotBoundaryMessage(accessState, copy.copilot)}
          </CopilotMessage>
        ) : null}
      </div>

      <div className="border-t border-[#dce8e2] bg-white p-4">
        <div className="flex min-h-11 items-center gap-3 rounded-lg border border-[#cfded8] bg-[#f8fbfa] px-3 text-sm text-[#65736f]">
          <MessageSquareText className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {canUseGuided
              ? copy.copilot.draftingPromptReady
              : workspaceCopy.common.previewOnly}
          </span>
          <Send className="size-4 shrink-0 text-[#91a09b]" aria-hidden="true" />
        </div>
      </div>
    </Card>
  );
}

export function TrustBoundaryNotice({
  locale = DEFAULT_LOCALE,
  className = "",
}: TrustBoundaryNoticeProps) {
  const copy = getReferralWorkspaceCopy(locale);

  return (
    <div
      className={cx(
        "flex gap-3 rounded-lg border border-[#cfded8] bg-[#f8fbfa] p-4 text-sm leading-6 text-[#40504b]",
        className,
      )}
      role="note"
    >
      <Info className="mt-1 size-5 shrink-0 text-[#0f766e]" aria-hidden="true" />
      <p>{copy.common.trustBoundary}</p>
    </div>
  );
}
