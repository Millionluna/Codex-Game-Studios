import {
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  ClipboardCheck,
  FilePenLine,
  Share2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { ButtonLink, Card, MetricCard } from "@/components/ui";
import {
  getAssessmentFunnel,
  getReadinessReport,
  getReadinessUpgradeOffers,
} from "@/lib/provider-assessment";

const statusClasses = {
  Strong: "bg-[#e6f7f2] text-[#0f766e]",
  Improve: "bg-[#fff7df] text-[#925b00]",
  Missing: "bg-[#fff0f0] text-[#a33a3a]",
};

export default function ProviderAssessmentReportPage() {
  const report = getReadinessReport("provider-harbour");
  const offers = getReadinessUpgradeOffers();
  const funnel = getAssessmentFunnel();

  return (
    <AppShell>
      <PageHeader
        eyebrow="Referral Readiness Snapshot"
        title={`${report.providerName} 的接单准备度报告`}
        description={report.summary}
        actions={
          <>
            <ButtonLink href="/ai-profile">
              <FilePenLine className="size-4" /> 生成 AI profile
            </ButtonLink>
            <ButtonLink href="/share-cards" variant="secondary">
              <Share2 className="size-4" /> 生成分享卡片
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Readiness level" value={report.level} detail="用于 referral 运营排序，不是服务质量认证" />
        <MetricCard label="Overall score" value={`${report.overallScore}/100`} detail="资料、区域、响应、语言和分享素材" tone="blue" />
        <MetricCard label="Top actions" value={String(report.nextActions.length)} detail="直接引导 AI profile / directory / capacity" tone="amber" />
        <MetricCard label="Risk wording" value="Safe" detail="避免 certified / guaranteed 等高风险表达" tone="slate" />
      </div>

      <Card className="mt-6 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#0f766e]">
              <ShieldCheck className="size-4" /> Non-certification boundary
            </p>
            <h2 className="mt-2 text-xl font-semibold">这份报告帮 provider 变得更容易被推荐</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#40504b]">
              {report.disclaimer}
            </p>
          </div>
          <div className="rounded-lg border border-[#9ed8c9] bg-[#e6f7f2] px-4 py-3 text-sm font-semibold text-[#0f766e]">
            Profile reviewed · Referral-ready snapshot completed
          </div>
        </div>
      </Card>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_390px]">
        <div className="grid gap-5">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <ClipboardCheck className="size-5 text-[#0f766e]" /> 评估维度
            </h2>
            <div className="mt-5 grid gap-4">
              {report.sections.map((section) => (
                <div key={section.id} className="rounded-lg border border-[#dce8e2] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{section.label}</h3>
                      <p className="mt-1 text-sm leading-6 text-[#40504b]">
                        {section.evidence}
                      </p>
                    </div>
                    <span className={`rounded-md px-2 py-1 text-xs font-semibold ${statusClasses[section.status]}`}>
                      {section.status}
                    </span>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#eef3f1]">
                    <div
                      className="h-full rounded-full bg-[#0f766e]"
                      style={{ width: `${section.score}%` }}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap items-start justify-between gap-3 text-sm">
                    <p className="font-semibold text-[#17211f]">{section.score}/100</p>
                    <p className="max-w-2xl leading-6 text-[#5d6d68]">
                      {section.recommendation}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Sparkles className="size-5 text-[#925b00]" /> 免费评估后的转化漏斗
            </h2>
            <div className="mt-4 grid gap-3 md:grid-cols-5">
              {funnel.map((step, index) => (
                <div key={step.id} className="rounded-lg border border-[#dce8e2] bg-[#f7faf8] p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#66736f]">
                    {index + 1}
                  </p>
                  <h3 className="mt-2 text-sm font-semibold">{step.label}</h3>
                  <p className="mt-2 text-xs leading-5 text-[#5d6d68]">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="grid gap-5">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <BadgeCheck className="size-5 text-[#0f766e]" /> Top 3 改进建议
            </h2>
            <ul className="mt-4 grid gap-3 text-sm leading-6 text-[#40504b]">
              {report.topRecommendations.map((item) => (
                <li key={item} className="flex gap-2">
                  <BadgeCheck className="mt-0.5 size-4 shrink-0 text-[#0f766e]" />
                  {item}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <ArrowRight className="size-5 text-[#19518d]" /> 下一步 CTA
            </h2>
            <div className="mt-4 grid gap-3">
              {report.nextActions.map((item) => (
                <div key={item} className="rounded-lg bg-[#f7faf8] p-3 text-sm font-semibold text-[#263834]">
                  {item}
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <BookOpenCheck className="size-5 text-[#925b00]" /> 后续产品化
            </h2>
            <div className="mt-4 grid gap-3">
              {offers.map((offer) => (
                <div key={offer.id} className="rounded-lg border border-[#dce8e2] p-3">
                  <p className="font-semibold">{offer.label}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-[#66736f]">
                    {offer.priceSignal}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#40504b]">
                    {offer.outcome}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
