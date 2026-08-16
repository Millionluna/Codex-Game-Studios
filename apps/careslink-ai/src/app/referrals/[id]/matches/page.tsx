import { CheckCircle2, CircleAlert } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PortalReferralWorkflowBoundary } from "@/components/portal-referral-workflow-controls";
import { Card } from "@/components/ui";
import { displayArea, displayList, displayService } from "@/lib/display";
import { providers, referrals } from "@/lib/mock-data";
import { matchReferralToProviders } from "@/lib/referral-matching";

export default async function ReferralMatchingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const referral = referrals.find((item) => item.id === id);
  if (!referral) notFound();
  const matches = matchReferralToProviders(referral, providers);

  return (
    <AppShell>
      <PageHeader
        eyebrow="AI 匹配"
        title={`${displayArea(referral.clientArea)} ${displayService(referral.needType)}推荐服务商`}
        description="这是旧版 demo fixture 的本地评分演示，不是 Preview 数据库分配。透明规则只用于展示区域、服务类型、语言、容量和资金路径的排序依据。"
      />

      <Card className="mb-4 p-4">
        <p className="mb-3 text-sm leading-6 text-[#5d6d68]">
          评分只提供本地排序参考，不代表 provider 已拒绝，也不会自动改变 referral 状态。
        </p>
        <PortalReferralWorkflowBoundary operation="triage" />
      </Card>

      <div className="grid gap-4">
        {matches.map((match) => {
          const provider = providers.find((item) => item.id === match.providerId)!;
          return (
            <Card key={match.id} className="p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{provider.name}</h2>
                  <p className="mt-1 text-sm text-[#5d6d68]">
                    {displayList(provider.serviceTypes, displayService)} · {displayList(provider.serviceAreas, displayArea)}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-lg bg-[#12312d] px-4 py-3 text-white md:block md:text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#b8e6de]">
                    匹配分
                  </p>
                  <p className="text-2xl font-semibold">{match.score}</p>
                </div>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold text-[#0f766e]">推荐理由</h3>
                  <ul className="mt-2 grid gap-2 text-sm text-[#40504b]">
                    {match.reasons.map((reason) => (
                      <li key={reason} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#0f766e]" />
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#925b00]">需要确认</h3>
                  <ul className="mt-2 grid gap-2 text-sm text-[#40504b]">
                    {match.gaps.length > 0 ? (
                      match.gaps.map((gap) => (
                        <li key={gap} className="flex gap-2">
                          <CircleAlert className="mt-0.5 size-4 shrink-0 text-[#925b00]" />
                          {gap}
                        </li>
                      ))
                    ) : (
                      <li className="text-[#5d6d68]">未发现主要缺口。</li>
                    )}
                  </ul>
                </div>
              </div>
              <div className="mt-4 border-t border-[#e5eee9] pt-4">
                <PortalReferralWorkflowBoundary operation="offer" />
              </div>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
