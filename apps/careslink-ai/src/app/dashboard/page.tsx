import { Activity, ArrowRight, CircleDollarSign, ClipboardList } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { ReferralCard } from "@/components/referral-card";
import { ButtonLink, Card, MetricCard, ProviderStatusBadge } from "@/components/ui";
import { displayList, displayService, displaySourceType } from "@/lib/display";
import {
  activityLogs,
  businessPartners,
  providers,
  referrals,
  sourceChannels,
} from "@/lib/mock-data";
import { dashboardMetrics, formatCurrency } from "@/lib/metrics";

export default function PartnerDashboardPage() {
  const partner = businessPartners[0];
  const pendingProviders = providers.filter((provider) => provider.status === "pending");

  return (
    <AppShell>
      <PageHeader
        eyebrow="业务合伙人工作台"
        title={`${partner.operatorName} 的 referral 运营室`}
        description="集中管理一个业务合伙人的服务商资源、真实 referral 需求、来源渠道、AI 内容和未来收入信号。"
        actions={
          <>
            <ButtonLink href="/referrals/intake">
              <ClipboardList className="size-4" /> 新建 referral
            </ButtonLink>
            <ButtonLink href="/providers/onboarding" variant="secondary">
              邀请入驻 <ArrowRight className="size-4" />
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="服务商网络" value={String(partner.providerCount)} detail="归因到该业务合伙人的服务商" />
        <MetricCard label="Referral 需求" value={String(partner.referralCount)} detail="来自微信群和分享卡片的需求" tone="blue" />
        <MetricCard label="月收入潜力" value={formatCurrency(dashboardMetrics.estimatedMonthlyRevenue)} detail="未来 Pro / Agency 套餐追踪" tone="amber" />
        <MetricCard label="合伙人分成" value={formatCurrency(dashboardMetrics.partnerShareEstimate)} detail={`预留 ${Math.round(partner.revenueShareRate * 100)}% 模型`} tone="slate" />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Referral 流程</h2>
            <ButtonLink href="/referrals" variant="secondary">查看看板</ButtonLink>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {referrals.map((referral) => (
              <ReferralCard key={referral.id} referral={referral} />
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-semibold">服务商审核队列</h2>
          <div className="mt-4 grid gap-3">
            {pendingProviders.map((provider) => (
              <div
                key={provider.id}
                className="rounded-lg border border-[#dce8e2] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{provider.name}</p>
                    <p className="mt-1 text-sm text-[#5d6d68]">
                      {displayList(provider.serviceTypes, displayService)}
                    </p>
                  </div>
                  <ProviderStatusBadge status={provider.status} />
                </div>
                <p className="mt-3 text-sm text-[#5d6d68]">
                  来源：{provider.sourceGroupName}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Activity className="size-5 text-[#0f766e]" /> 来源追踪
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.12em] text-[#66736f]">
                <tr>
                  <th className="py-2">渠道</th>
                  <th>类型</th>
                  <th>服务商</th>
                  <th>需求数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e5eee9]">
                {sourceChannels.map((channel) => (
                  <tr key={channel.id}>
                    <td className="py-3 font-medium">{channel.name}</td>
                    <td>{displaySourceType(channel.type)}</td>
                    <td>{channel.providerCount}</td>
                    <td>{channel.referralCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CircleDollarSign className="size-5 text-[#925b00]" /> 未来商业信号
          </h2>
          <div className="mt-4 grid gap-3">
            {activityLogs.map((log) => (
              <div key={log.id} className="rounded-lg bg-[#f7faf8] p-3">
                <p className="text-sm font-medium">{log.action}</p>
                <p className="mt-1 text-xs text-[#66736f]">
                  {log.entityType} · {log.createdAt}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
