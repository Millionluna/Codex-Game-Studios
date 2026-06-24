import {
  BookOpenCheck,
  ClipboardCheck,
  Database,
  GitBranch,
  Handshake,
  KeyRound,
  MapPin,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import {
  ButtonLink,
  Card,
  MetricCard,
  ProviderStatusBadge,
  ReferralStatusBadge,
} from "@/components/ui";
import {
  activityLogs,
  businessPartners,
  networkParticipants,
  providers,
  referralSources,
  referrals,
  revenueTracking,
  sourceChannels,
  users,
} from "@/lib/mock-data";
import { getRevenueEngines } from "@/lib/demo-strategy";
import { formatCurrency } from "@/lib/metrics";
import {
  getAssessmentPipeline,
  getSourceReadinessMap,
} from "@/lib/provider-assessment";
import { getRolePortals } from "@/lib/role-portals";

const modelRows = [
  ["users", "用户身份和角色路由", users.length],
  ["business_partners", "业务合伙人拥有的渠道资源", businessPartners.length],
  ["network_participants", "区分发 referral、接 referral 和两边都做的网络成员", networkParticipants.length],
  ["referral_sources", "可发布 referral 的机构、资源方和来源可信度", referralSources.length],
  ["providers", "带审核和来源字段的服务商供给", providers.length],
  ["provider_profiles", "AI 生成的双语服务商内容", providers.length],
  ["referrals", "带状态和跟进时间的需求记录", referrals.length],
  ["referral_matches", "规则匹配结果", "自动"],
  ["share_cards", "服务商 / referral 分享卡片记录", 2],
  ["source_channels", "微信群、邀请链接和卡片归因", sourceChannels.length],
  ["activity_logs", "运营方和管理员操作记录", activityLogs.length],
  ["membership_plans", "Free / Pro / Agency 商业化预留", 3],
  ["revenue_tracking", "未来收入和合伙人分成账本", revenueTracking.length],
];

const reviewQueues = [
  {
    label: "Referral source 审核",
    count: referralSources.length,
    detail: "核验来源真实性、联系人和需求质量。",
  },
  {
    label: "接 referral 服务商审核",
    count: providers.filter((provider) => provider.status === "pending").length,
    detail: "核验 ABN、保险、服务区域、语言和接单能力。",
  },
  {
    label: "Both 类型审核",
    count: networkParticipants.filter((participant) => participant.role === "both").length,
    detail: "重点看利益冲突、归因规则和双方权限边界。",
  },
];

const rolloutStages = [
  ["1. 资源盘点", "导入群主现有 provider、微信群、常见 referral 类型和审核规则。"],
  ["2. 模板训练", "把高质量 referral、provider profile、跟进话术整理成可复制 SOP。"],
  ["3. 试运行", "用真实需求跑匹配、联系、接受、完成和无法服务的状态闭环。"],
  ["4. 复制扩张", "把同一套 dashboard、Academy 和分成账本复制给下一个渠道方。"],
];

export default function AdminDashboardPage() {
  const projectedRevenue = revenueTracking.reduce(
    (total, item) => total + item.estimatedMonthlyValue,
    0,
  );
  const rolePortals = getRolePortals();
  const revenueEngines = getRevenueEngines();
  const assessmentPipeline = getAssessmentPipeline("partner-chen");
  const readinessMap = getSourceReadinessMap("partner-chen");
  const openReferrals = referrals.filter(
    (referral) => referral.status !== "Completed" && referral.status !== "Closed",
  );

  return (
    <AppShell>
      <PageHeader
        eyebrow="平台管理员"
        title="平台管理员端：管规则、管审核、管全局网络"
        description="管理员不是发 referral 的 provider，也不是接 referral 的服务商。管理员负责角色权限、审核治理、来源归因、全局 pipeline 和未来商业化数据。"
        actions={
          <>
            <ButtonLink href="/demo" variant="secondary">
              看谈判总览
            </ButtonLink>
            <ButtonLink href="/provider-assessment" variant="secondary">
              免费评估
            </ButtonLink>
            <ButtonLink href="/referral-source-portal" variant="secondary">
              看发 referral 端
            </ButtonLink>
            <ButtonLink href="/provider-portal">看接 referral 端</ButtonLink>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="平台用户" value={String(users.length)} detail="管理员、合伙人、来源方和接单方" />
        <MetricCard label="网络成员" value={String(networkParticipants.length)} detail="按发单 / 接单 / Both 分流" tone="blue" />
        <MetricCard label="Open referral" value={String(openReferrals.length)} detail="全平台仍在跟进的机会" tone="amber" />
        <MetricCard label="ARR 种子" value={formatCurrency(projectedRevenue * 12)} detail="暂不收费，仅用于规划" tone="slate" />
      </div>

      <Card className="mt-6 p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#0f766e]">
              <ClipboardCheck className="size-4" /> Provider Assessment Pipeline
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              用免费评估把群里的 provider 变成可运营供给
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#40504b]">
              管理员和群主不只是看谁入驻了，而是看谁完成了 referral readiness、哪些资料缺失、哪些区域和服务类型还需要补供给。
            </p>
          </div>
          <ButtonLink href="/provider-assessment/report">看示例报告</ButtonLink>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-5">
          {[
            ["已邀请", assessmentPipeline.invited],
            ["完成评估", assessmentPipeline.completed],
            ["Referral-ready", assessmentPipeline.ready],
            ["Growth", assessmentPipeline.growth],
            ["缺保险资料", assessmentPipeline.missingInsurance],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-[#dce8e2] bg-[#f7faf8] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#66736f]">
                {label}
              </p>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {readinessMap.map((item) => (
            <div key={item.id} className="rounded-lg border border-[#dce8e2] bg-white p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <MapPin className="size-4 text-[#19518d]" /> {item.region}
              </p>
              <p className="mt-2 text-sm font-medium text-[#17211f]">{item.serviceType}</p>
              <p className="mt-2 text-sm leading-6 text-[#40504b]">{item.gap}</p>
              <p className="mt-3 rounded-lg bg-[#fff7df] p-3 text-sm leading-6 text-[#4d3b16]">
                {item.nextMove}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-6 p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#0f766e]">
              <Sparkles className="size-4" /> Okana 式商业化控制台
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              先卖能力建设和运营系统，再长成多渠道 referral network
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#40504b]">
              管理员端要能回答合伙人最关心的问题：这个群怎么被系统化、怎么训练成员、怎么证明 referral 价值、未来如何做团队 licence 和分成。
            </p>
          </div>
          <div className="rounded-lg border border-[#dce8e2] bg-[#f7faf8] px-4 py-3 text-sm leading-6 text-[#40504b]">
            <span className="font-semibold text-[#17211f]">冷启动原则：</span>
            不先强调入驻收费，先把真实 referral pipeline、培训内容和来源归因跑出来。
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-5">
          {revenueEngines.map((engine) => (
            <div key={engine.id} className="rounded-lg border border-[#dce8e2] bg-white p-3">
              <p className="text-sm font-semibold">{engine.label}</p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#66736f]">
                {engine.buyer}
              </p>
              <p className="mt-2 text-sm leading-6 text-[#40504b]">{engine.offer}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {rolloutStages.map(([label, detail]) => (
            <div key={label} className="rounded-lg bg-[#eef7f3] p-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                {label === "2. 模板训练" ? (
                  <BookOpenCheck className="size-4 text-[#0f766e]" />
                ) : (
                  <Handshake className="size-4 text-[#19518d]" />
                )}
                {label}
              </p>
              <p className="mt-2 text-sm leading-6 text-[#40504b]">{detail}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_420px]">
        <div className="grid gap-5">
          <Card className="overflow-x-auto p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <KeyRound className="size-5 text-[#0f766e]" /> 三类角色权限矩阵
            </h2>
            <table className="mt-4 w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.12em] text-[#66736f]">
                <tr>
                  <th className="py-2">角色页面</th>
                  <th>端</th>
                  <th>可发 referral</th>
                  <th>可接 referral</th>
                  <th>边界</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e5eee9]">
                {rolePortals.map((portal) => (
                  <tr key={portal.id}>
                    <td className="py-3 font-semibold">{portal.label}</td>
                    <td>{portal.surfaces.join(" / ")}</td>
                    <td>{portal.canSendReferrals ? "是" : "否"}</td>
                    <td>{portal.canReceiveReferrals ? "是" : "否"}</td>
                    <td className="max-w-[320px] leading-6 text-[#40504b]">
                      {portal.accessBoundary}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="overflow-x-auto p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <GitBranch className="size-5 text-[#19518d]" /> 全局 referral pipeline
            </h2>
            <table className="mt-4 w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.12em] text-[#66736f]">
                <tr>
                  <th className="py-2">Referral</th>
                  <th>来源群</th>
                  <th>匹配数</th>
                  <th>分配</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e5eee9]">
                {referrals.map((referral) => (
                  <tr key={referral.id}>
                    <td className="py-3 font-medium">{referral.summary}</td>
                    <td>{referral.sourceGroupName}</td>
                    <td>{referral.matchedProviderIds.length}</td>
                    <td>{referral.assignedProviderId ?? "待分配"}</td>
                    <td>
                      <ReferralStatusBadge status={referral.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="overflow-x-auto p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Database className="size-5 text-[#0f766e]" /> 数据模型地图
            </h2>
            <table className="mt-4 w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.12em] text-[#66736f]">
                <tr>
                  <th className="py-2">表</th>
                  <th>用途</th>
                  <th>记录数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e5eee9]">
                {modelRows.map(([name, purpose, count]) => (
                  <tr key={String(name)}>
                    <td className="py-3 font-mono text-xs font-semibold">{name}</td>
                    <td>{purpose}</td>
                    <td>{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        <div className="grid gap-5">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <ShieldCheck className="size-5 text-[#0f766e]" /> 审核队列
            </h2>
            <div className="mt-4 grid gap-3">
              {reviewQueues.map((queue) => (
                <div key={queue.label} className="rounded-lg border border-[#dce8e2] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">{queue.label}</p>
                    <span className="rounded-md bg-[#eef3f1] px-2 py-1 text-xs font-semibold text-[#40504b]">
                      {queue.count}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#5d6d68]">
                    {queue.detail}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <UsersRound className="size-5 text-[#19518d]" /> 网络成员
            </h2>
            <div className="mt-4 grid gap-3">
              {networkParticipants.map((participant) => (
                <div key={participant.id} className="rounded-lg bg-[#f7faf8] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        {participant.organizationName}
                      </p>
                      <p className="mt-1 text-xs text-[#66736f]">
                        {participant.role} · {participant.sourceGroupName}
                      </p>
                    </div>
                    <ProviderStatusBadge status={participant.status} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-lg font-semibold">治理边界</h2>
            <ul className="mt-4 grid gap-2 text-sm leading-6 text-[#40504b]">
              <li>MVP 不接支付。</li>
              <li>不做护理交付、排班、雇佣或临床建议。</li>
              <li>服务商进入可信展示前必须审核。</li>
              <li>Both 类型必须单独标注利益冲突和归因规则。</li>
              <li>未来 Supabase RLS 按角色、合伙人、服务商和来源渠道控制可见性。</li>
            </ul>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
