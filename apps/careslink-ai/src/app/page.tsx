import Image from "next/image";
import { ArrowRight, ClipboardCheck, Network, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { ButtonLink, Card, MetricCard } from "@/components/ui";
import { dashboardMetrics, formatCurrency } from "@/lib/metrics";

export default function LandingPage() {
  return (
    <AppShell>
      <section className="relative mb-8 min-h-[420px] overflow-hidden rounded-lg bg-[#12312d]">
        <Image
          src="/careslink-hero.png"
          alt="A community services operator reviewing provider referrals on a tablet"
          fill
          sizes="(min-width: 1024px) 900px, 100vw"
          className="object-cover opacity-42"
          priority
        />
        <div className="relative flex min-h-[420px] max-w-4xl flex-col justify-end px-6 py-8 text-white sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b8e6de]">
            澳洲养老护理 / NDIS referral 运营系统
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-normal md:text-6xl">
            Careslink AI
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/86 md:text-lg">
            把一个可信行业群，变成可沉淀、可搜索、可匹配、可跟进的
            B2B referral network。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/dashboard">
              打开合伙人工作台 <ArrowRight className="size-4" />
            </ButtonLink>
            <ButtonLink href="/provider-assessment" variant="secondary">
              免费 Provider 评估
            </ButtonLink>
          </div>
        </div>
      </section>

      <PageHeader
        eyebrow="MVP 重点"
        title="先把第一个核心业务群系统化，再复制扩张"
        description="第一版不是公开 marketplace，而是给一个业务合伙人使用的运营系统：沉淀服务商资源、整理真实 referral、生成 AI 辅助文案，并记录来源归因。"
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="服务商"
          value={String(dashboardMetrics.providerCount)}
          detail={`${dashboardMetrics.approvedProviders} 个已审核，${dashboardMetrics.pendingProviders} 个待审核`}
        />
        <MetricCard
          label="进行中 referral"
          value={String(dashboardMetrics.openReferrals)}
          detail={`${dashboardMetrics.urgentReferrals} 个标记为紧急`}
          tone="amber"
        />
        <MetricCard
          label="未来收入"
          value={formatCurrency(dashboardMetrics.estimatedMonthlyRevenue)}
          detail="用于预留后续套餐和分成逻辑"
          tone="blue"
        />
        <MetricCard
          label="合伙人分成"
          value={formatCurrency(dashboardMetrics.partnerShareEstimate)}
          detail="为未来渠道合伙人模式预留"
          tone="slate"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {[
          {
            icon: ClipboardCheck,
            title: "免费 Provider 准备度评估",
            copy: "先给服务商一页 referral readiness snapshot，沉淀资料、缺口和下一步转化。",
          },
          {
            icon: ShieldCheck,
            title: "服务商可信资料层",
            copy: "统一管理 ABN、服务区域、语言、接单能力、保险状态、审核状态和来源。",
          },
          {
            icon: Network,
            title: "Referral 需求沉淀",
            copy: "把微信群和合作方消息转成结构化 referral，记录状态、跟进时间和来源。",
          },
        ].map((item) => (
          <Card key={item.title} className="p-5">
            <item.icon className="size-8 text-[#0f766e]" aria-hidden="true" />
            <h2 className="mt-4 text-lg font-semibold text-[#17211f]">
              {item.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#5d6d68]">
              {item.copy}
            </p>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
