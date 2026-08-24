import { ArrowRight, CalendarClock } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PortalReferralWorkflowBoundary } from "@/components/portal-referral-workflow-controls";
import { ButtonLink, Card, ReferralStatusBadge } from "@/components/ui";
import {
  displayArea,
  displayFrequency,
  displayFundingType,
  displayLanguage,
  displayList,
  displayService,
} from "@/lib/display";
import { providers, referrals } from "@/lib/mock-data";

export default async function ReferralDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const referral = referrals.find((item) => item.id === id);
  if (!referral) notFound();
  const assignedProvider = providers.find(
    (provider) => provider.id === referral.assignedProviderId,
  );

  return (
    <AppShell>
      <PageHeader
        eyebrow="Referral 详情"
        title={`${displayArea(referral.clientArea)} · ${displayService(referral.needType)}`}
        description="这是旧版 demo fixture，不是 Preview 数据库记录。页面只展示非敏感演示 metadata；联系人、私密摘要与后续记录在权威角色验证前保持隐藏。"
        actions={
          <ButtonLink href={`/referrals/${referral.id}/matches`}>
            查看匹配 <ArrowRight className="size-4" />
          </ButtonLink>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Card className="p-5">
          <div className="flex flex-wrap gap-3">
            <ReferralStatusBadge status={referral.status} />
            <span className="rounded-md bg-[#fff7df] px-2 py-1 text-xs font-semibold text-[#925b00]">
              {referral.urgent ? "紧急" : "普通优先级"}
            </span>
            <span className="rounded-md bg-[#edf5ff] px-2 py-1 text-xs font-semibold text-[#19518d]">
              {displayFundingType(referral.fundingType)}
            </span>
          </div>

          <dl className="mt-5 grid gap-4 md:grid-cols-2">
            {[
              ["区域", displayArea(referral.clientArea)],
              ["语言", displayList(referral.languageRequirements, displayLanguage)],
              ["频率", displayFrequency(referral.frequency)],
              ["已分配服务商", assignedProvider?.name ?? "未分配"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-[#f7faf8] p-3">
                <dt className="text-xs uppercase tracking-[0.12em] text-[#66736f]">
                  {label}
                </dt>
                <dd className="mt-1 text-sm font-medium">{value}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-5 rounded-lg bg-[#f7faf8] p-3 text-sm leading-6 text-[#5d6d68]">
            私密摘要、联系人和自由文本备注不会出现在未授权页面、URL、错误或 mutation ACK 中。
          </p>
        </Card>

        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CalendarClock className="size-5 text-[#0f766e]" /> 跟进控制
          </h2>
          <p className="mt-2 text-sm text-[#5d6d68]">
            跟进时间与历史记录只会在 request-scoped 角色检查通过后返回。
          </p>
          <div className="mt-4">
            <PortalReferralWorkflowBoundary operation="follow-up" />
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
