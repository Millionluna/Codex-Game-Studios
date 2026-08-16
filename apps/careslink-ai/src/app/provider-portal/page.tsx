import {
  BadgeCheck,
  BellRing,
  BookOpenCheck,
  BriefcaseBusiness,
  CalendarClock,
  ClipboardCheck,
  FilePenLine,
  Share2,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { MobileAppFrame } from "@/components/mobile-app-frame";
import { PageHeader } from "@/components/page-header";
import { PortalReferralWorkflowBoundary } from "@/components/portal-referral-workflow-controls";
import { ShareCardPreview } from "@/components/share-card";
import {
  ButtonLink,
  Card,
  MetricCard,
  ProviderStatusBadge,
} from "@/components/ui";
import {
  displayArea,
  displayLanguage,
  displayList,
  displayService,
} from "@/lib/display";
import { getRevenueEngines } from "@/lib/demo-strategy";
import {
  getReadinessReport,
  getReadinessUpgradeOffers,
} from "@/lib/provider-assessment";
import { getProviderPortalData } from "@/lib/provider-portal";
import { getRolePortal } from "@/lib/role-portals";

export default function ProviderPortalPage() {
  const portal = getRolePortal("referral_receiver");
  const {
    provider,
    profile,
    shareCard,
    nextSteps,
  } = getProviderPortalData("provider-harbour");

  // The real list must come from the request-scoped, provider-bound adapter.
  // Legacy mock matches are deliberately not promoted into this workflow.
  const previewReferralCount = 0;
  const urgentPreviewReferralCount = 0;
  const revenueEngines = getRevenueEngines();
  const providerTools = revenueEngines.find((engine) => engine.id === "provider_tools");
  const trainingEngine = revenueEngines.find((engine) => engine.id === "training");
  const readinessReport = getReadinessReport(provider.id);
  const upgradeOffers = getReadinessUpgradeOffers();

  return (
    <AppShell>
      <PageHeader
        eyebrow="可接 referral 的 provider / 个人"
        title="接 referral 端：看机会、回状态、维护接单能力"
        description="这个角色可以是机构 provider，也可以是审核通过的个人 practitioner。它不管理全平台需求，只看到匹配给自己或已分配给自己的 referral，并快速反馈能不能服务。"
        actions={
          <>
            <ButtonLink href={`/providers/${provider.id}`} variant="secondary">
              <FilePenLine className="size-4" /> 查看公开资料
            </ButtonLink>
            <ButtonLink href="/provider-assessment/report" variant="secondary">
              <ClipboardCheck className="size-4" /> Readiness 报告
            </ButtonLink>
            <ButtonLink href="/share-cards">
              <Share2 className="size-4" /> 生成分享卡片
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Readiness"
          value={readinessReport.level}
          detail={`${readinessReport.overallScore}/100，影响推荐可信度`}
        />
        <MetricCard
          label="审核状态"
          value="已审核"
          detail="可被业务合伙人推荐和分享"
          tone="blue"
        />
        <MetricCard
          label="Referral 机会"
          value={String(previewReferralCount)}
          detail={`${urgentPreviewReferralCount} 个为紧急需求`}
          tone="amber"
        />
        <MetricCard
          label="角色权限"
          value={portal?.canReceiveReferrals ? "可接单" : "不可接单"}
          detail={portal?.accessBoundary ?? "仅看匹配给自己的机会"}
          tone="slate"
        />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="grid gap-5">
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#0f766e]">
                  Web 端
                </p>
                <h2 className="mt-2 text-lg font-semibold">我的接单工作台</h2>
                <p className="mt-1 text-sm text-[#5d6d68]">
                  服务商或个人 practitioner 维护自己的服务能力，方便 AI 和运营方匹配。
                </p>
              </div>
              <ProviderStatusBadge status={provider.status} />
            </div>
            <dl className="mt-5 grid gap-4 md:grid-cols-2">
              {[
                ["服务对象", "机构 provider / 个人 practitioner"],
                ["服务类型", displayList(provider.serviceTypes, displayService)],
                ["服务区域", displayList(provider.serviceAreas, displayArea)],
                ["服务语言", displayList(provider.languages, displayLanguage)],
                ["联系方式", provider.contact.phone ?? provider.contact.email ?? "待补充"],
                ["来源群", provider.sourceGroupName],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-[#f7faf8] p-3">
                  <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[#66736f]">
                    {label}
                  </dt>
                  <dd className="mt-1 text-sm font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <BellRing className="size-5 text-[#0f766e]" /> 匹配给我的 referral
                </h2>
                <p className="mt-1 text-sm text-[#5d6d68]">
                  这里不展示所有 referral，只展示和当前 provider / 个人有关的机会。
                </p>
              </div>
              <span className="text-sm font-semibold text-[#66736f]">
                Preview 数据未连接
              </span>
            </div>
            <div className="mt-4 grid gap-3">
              <p className="rounded-lg bg-[#f7faf8] p-3 text-sm leading-6 text-[#5d6d68]">
                No database-scoped offer is available in the frozen Victorian Preview catalog.
                Legacy mock referrals are intentionally not shown here.
              </p>
              <PortalReferralWorkflowBoundary operation="respond" />
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <SlidersHorizontal className="size-5 text-[#19518d]" /> 容量和接单偏好
            </h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {[
                ["当前状态", provider.acceptsNewClients ? "接新客户" : "暂停接单"],
                ["紧急 referral", provider.urgentCapacity ? "可处理" : "不可处理"],
                ["资金类型", provider.supportsNdis ? "NDIS" : "Aged Care"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-[#dce8e2] p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#66736f]">
                    {label}
                  </p>
                  <p className="mt-1 text-sm font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#0f766e]">
                  <ClipboardCheck className="size-4" /> Free assessment result
                </p>
                <h2 className="mt-2 text-lg font-semibold">我的 referral 接单准备度</h2>
                <p className="mt-1 text-sm leading-6 text-[#5d6d68]">
                  这是给 provider 自己看的增长工具，不是认证或质量担保。
                </p>
              </div>
              <span className="rounded-md bg-[#e6f7f2] px-2 py-1 text-xs font-semibold text-[#0f766e]">
                {readinessReport.overallScore}/100
              </span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {readinessReport.sections.slice(0, 3).map((section) => (
                <div key={section.id} className="rounded-lg border border-[#dce8e2] p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#66736f]">
                    {section.label}
                  </p>
                  <p className="mt-2 text-xl font-semibold">{section.score}</p>
                  <p className="mt-1 text-sm text-[#40504b]">{section.status}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <ButtonLink href="/provider-assessment/report">查看完整报告</ButtonLink>
              <ButtonLink href="/provider-assessment" variant="secondary">
                重新评估
              </ButtonLink>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#0f766e]">
                  <Sparkles className="size-4" /> Provider Pro layer
                </p>
                <h2 className="mt-2 text-lg font-semibold">从接 referral 到买工具</h2>
              </div>
              <span className="rounded-md border border-[#9ed8c9] bg-[#e6f7f2] px-2 py-1 text-xs font-semibold text-[#0f766e]">
                先给机会，再转付费
              </span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {[providerTools, trainingEngine].filter(Boolean).map((engine) => (
                <div key={engine!.id} className="rounded-lg border border-[#dce8e2] p-3">
                  <p className="font-semibold">{engine!.label}</p>
                  <p className="mt-1 text-sm leading-6 text-[#40504b]">{engine!.offer}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-[#f7faf8] p-3 text-sm leading-6 text-[#40504b]">
              <BookOpenCheck className="mt-0.5 size-4 shrink-0 text-[#0f766e]" />
              Provider 端可以后续升级为团队版 intake CRM：多人处理机会、统一话术、接单表现摘要和资料更新提醒。
            </p>
            <div className="mt-4 grid gap-2">
              {upgradeOffers.slice(0, 2).map((offer) => (
                <div key={offer.id} className="rounded-lg bg-[#f7faf8] p-3 text-sm">
                  <p className="font-semibold">{offer.label}</p>
                  <p className="mt-1 leading-6 text-[#40504b]">{offer.outcome}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="grid gap-5">
          <MobileAppFrame
            title="接 referral"
            subtitle="适合负责人、intake 团队或个人 practitioner 快速回应机会。"
            status="只显示匹配给我的机会"
            tabs={["机会", "容量", "资料"]}
          >
            <p className="rounded-lg border border-[#dce8e2] bg-white p-3 text-sm text-[#5d6d68]">
              Preview offers remain unavailable while the workflow capability is disabled.
            </p>
            <PortalReferralWorkflowBoundary operation="respond" />
            <div className="rounded-lg border border-[#dce8e2] bg-white p-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <CalendarClock className="size-4 text-[#925b00]" /> 本周容量
              </p>
              <div className="mt-3 grid gap-2">
                {["支持协调：3 个名额", "紧急需求：可接 1 个", "电话 intake：今日 4pm 后"].map(
                  (item) => (
                    <div key={item} className="rounded-lg bg-[#f7faf8] px-3 py-2 text-sm">
                      {item}
                    </div>
                  ),
                )}
              </div>
            </div>
            <div className="rounded-lg border border-[#dce8e2] bg-white p-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <BriefcaseBusiness className="size-4 text-[#19518d]" /> 资料提醒
              </p>
              <p className="mt-2 text-sm leading-6 text-[#40504b]">
                更新服务区域和语言后，AI 推荐理由会同步刷新。
              </p>
            </div>
          </MobileAppFrame>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <BadgeCheck className="size-5 text-[#0f766e]" /> 下一步
            </h2>
            <ul className="mt-4 grid gap-3 text-sm leading-6 text-[#40504b]">
              {nextSteps.map((step) => (
                <li key={step} className="flex gap-2">
                  <BadgeCheck className="mt-0.5 size-4 shrink-0 text-[#0f766e]" />
                  {step}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <h2 className="text-lg font-semibold">AI 推荐文案</h2>
            <p className="mt-3 text-sm leading-6 text-[#40504b]">
              {profile?.chineseIntro}
            </p>
            <p className="mt-3 rounded-lg bg-[#f7faf8] p-3 text-sm leading-6 text-[#40504b]">
              {profile?.wechatCopy}
            </p>
          </Card>

          <ShareCardPreview card={shareCard} provider={provider} />
        </div>
      </div>
    </AppShell>
  );
}
