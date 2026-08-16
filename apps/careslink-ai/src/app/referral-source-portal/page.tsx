import {
  BookOpenCheck,
  ClipboardPlus,
  Handshake,
  MapPin,
  MessageSquareText,
  TimerReset,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { MobileAppFrame } from "@/components/mobile-app-frame";
import { PageHeader } from "@/components/page-header";
import { PortalReferralIntakeControls } from "@/components/portal-referral-workflow-controls";
import {
  ButtonLink,
  Card,
  MetricCard,
  ReferralStatusBadge,
} from "@/components/ui";
import {
  displayArea,
  displayFrequency,
  displayLanguage,
  displayList,
  displayService,
} from "@/lib/display";
import { getRevenueEngines } from "@/lib/demo-strategy";
import { referralSources, referrals } from "@/lib/mock-data";
import {
  getAssessmentPipeline,
  getSourceReadinessMap,
} from "@/lib/provider-assessment";
import { getRolePortal } from "@/lib/role-portals";

export default function ReferralSourcePortalPage() {
  const portal = getRolePortal("referral_source");
  const source = referralSources[0];
  const sourcedReferrals = referrals.filter(
    (referral) => referral.sourcePartnerId === source.sourcePartnerId,
  );
  const openReferrals = sourcedReferrals.filter(
    (referral) => referral.status !== "Completed" && referral.status !== "Closed",
  );
  const urgentCount = sourcedReferrals.filter((referral) => referral.urgent).length;
  const revenueEngines = getRevenueEngines();
  const setupEngine = revenueEngines.find((engine) => engine.id === "setup");
  const trainingEngine = revenueEngines.find((engine) => engine.id === "training");
  const assessmentPipeline = getAssessmentPipeline(source.sourcePartnerId);
  const readinessMap = getSourceReadinessMap(source.sourcePartnerId);

  return (
    <AppShell>
      <PageHeader
        eyebrow="可发 referral 的 provider / 资源方"
        title="发 referral 端：录入需求、追踪状态、沉淀来源质量"
        description="这个角色可以是 support coordinator、case manager、社区资源方、微信群主，也可以是本身有服务能力但这次作为需求来源的 provider。核心不是接单，而是把真实需求发出来并持续跟进。"
        actions={
          <>
            <ButtonLink href="/referrals/intake">
              <ClipboardPlus className="size-4" /> 新建 referral
            </ButtonLink>
            <ButtonLink href="/referrals" variant="secondary">
              查看来源 pipeline
            </ButtonLink>
          </>
        }
      />

      <Card className="mb-4 border-[#f0d28a] bg-[#fffaf0] p-4">
        <p className="text-sm font-semibold text-[#7a4b00]">
          Legacy demo data / 旧版演示数据
        </p>
        <p className="mt-1 text-sm leading-6 text-[#6c5a38]">
          本页现有数量、列表和手机卡片来自本地 mock，不是 Preview
          数据库记录。新的 intake 控件保持关闭，不会提交或保存资料。
        </p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="来源方"
          value={source.organizationName}
          detail="只管理自己来源的需求"
        />
        <MetricCard
          label="Open referral"
          value={String(openReferrals.length)}
          detail="等待匹配、联系或后续确认"
          tone="blue"
        />
        <MetricCard
          label="紧急需求"
          value={String(urgentCount)}
          detail="需要业务合伙人优先处理"
          tone="amber"
        />
        <MetricCard
          label="权限边界"
          value={portal?.canSendReferrals ? "可发单" : "不可发单"}
          detail={portal?.accessBoundary ?? "仅查看来源数据"}
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
                <h2 className="mt-2 text-lg font-semibold">Referral 快速录入</h2>
                <p className="mt-1 text-sm leading-6 text-[#5d6d68]">
                  来源方只需要把需求描述清楚，匹配、审核和分配由业务合伙人或平台规则处理。
                </p>
              </div>
              <span className="rounded-md border border-[#9ed8c9] bg-[#e6f7f2] px-2 py-1 text-xs font-semibold text-[#0f766e]">
                {portal?.label}
              </span>
            </div>

            <div className="mt-5">
              <PortalReferralIntakeControls />
            </div>
          </Card>

          <Card className="overflow-x-auto p-5">
            <h2 className="text-lg font-semibold">我的 referral 跟进</h2>
            <table className="mt-4 w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.12em] text-[#66736f]">
                <tr>
                  <th className="py-2">需求</th>
                  <th>区域</th>
                  <th>语言</th>
                  <th>频率</th>
                  <th>状态</th>
                  <th>下次跟进</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e5eee9]">
                {sourcedReferrals.map((referral) => (
                  <tr key={referral.id}>
                    <td className="py-3 font-medium">
                      {displayService(referral.needType)}
                    </td>
                    <td>{displayArea(referral.clientArea)}</td>
                    <td>{displayList(referral.languageRequirements, displayLanguage)}</td>
                    <td>{displayFrequency(referral.frequency)}</td>
                    <td>
                      <ReferralStatusBadge status={referral.status} />
                    </td>
                    <td>{referral.followUpDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        <div className="grid gap-5">
          <MobileAppFrame
            title="快速发 referral"
            subtitle="适合微信群主、coordinator 或社区资源方在手机上录入需求。"
            status="只能看自己来源的 referral"
            tabs={["首页", "新建", "跟进"]}
          >
            <div className="rounded-lg border border-[#dce8e2] bg-white p-3">
              <p className="text-xs font-semibold text-[#66736f]">今日待处理</p>
              <p className="mt-1 text-2xl font-semibold text-[#17211f]">
                {openReferrals.length}
              </p>
              <p className="mt-1 text-xs leading-5 text-[#5d6d68]">
                {urgentCount} 个紧急需求等待确认匹配方向。
              </p>
            </div>
            <div className="rounded-lg border border-[#dce8e2] bg-white p-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <MessageSquareText className="size-4 text-[#0f766e]" /> 语音 / 文字录入
              </p>
              <p className="mt-2 rounded-lg bg-[#f7faf8] p-3 text-sm leading-6 text-[#40504b]">
                帕拉马塔，普通话，急需支持协调，本周可联系家属。
              </p>
              <button
                type="button"
                disabled
                className="mt-3 h-9 w-full rounded-lg bg-[#0f766e] text-sm font-semibold text-white opacity-50"
              >
                生成 referral 草稿
              </button>
            </div>
            <div className="rounded-lg border border-[#dce8e2] bg-white p-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <TimerReset className="size-4 text-[#925b00]" /> 最近跟进
              </p>
              <div className="mt-3 grid gap-2">
                {sourcedReferrals.slice(0, 2).map((referral) => (
                  <div key={referral.id} className="rounded-lg bg-[#f7faf8] p-2">
                    <p className="text-sm font-medium">
                      {displayArea(referral.clientArea)} · {displayService(referral.needType)}
                    </p>
                    <p className="mt-1 text-xs text-[#66736f]">
                      下次跟进 {referral.followUpDate}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </MobileAppFrame>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <MapPin className="size-5 text-[#19518d]" /> Provider readiness map
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#40504b]">
              群主或 referral source 可以看到自己的供给网络哪里强、哪里缺，而不是每天靠记忆在群里找人。
            </p>
            <div className="mt-4 grid gap-3">
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-lg bg-[#f7faf8] p-3">
                  <p className="text-xs text-[#66736f]">完成评估</p>
                  <p className="mt-1 text-xl font-semibold">{assessmentPipeline.completed}</p>
                </div>
                <div className="rounded-lg bg-[#e6f7f2] p-3">
                  <p className="text-xs text-[#0f766e]">Ready</p>
                  <p className="mt-1 text-xl font-semibold">{assessmentPipeline.ready}</p>
                </div>
                <div className="rounded-lg bg-[#fff7df] p-3">
                  <p className="text-xs text-[#925b00]">资料缺口</p>
                  <p className="mt-1 text-xl font-semibold">{assessmentPipeline.missingInsurance}</p>
                </div>
              </div>
              {readinessMap.map((item) => (
                <div key={item.id} className="rounded-lg border border-[#dce8e2] p-3">
                  <p className="text-sm font-semibold">
                    {item.region} · {item.serviceType}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#40504b]">{item.gap}</p>
                  <p className="mt-2 text-xs font-semibold text-[#0f766e]">
                    下一步：{item.nextMove}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <BookOpenCheck className="size-5 text-[#0f766e]" /> Source enablement
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#40504b]">
              发 referral 的一方不是普通推广员，而是渠道运营节点。平台要帮助他把群里的零散需求变成标准化 intake、来源质量和可复制培训。
            </p>
            <div className="mt-4 grid gap-3">
              {[setupEngine, trainingEngine].filter(Boolean).map((engine) => (
                <div key={engine!.id} className="rounded-lg border border-[#dce8e2] p-3">
                  <p className="font-semibold">{engine!.label}</p>
                  <p className="mt-1 text-sm leading-6 text-[#40504b]">{engine!.offer}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg bg-[#f7faf8] p-3 text-sm leading-6 text-[#40504b]">
              <p className="flex items-center gap-2 font-semibold text-[#17211f]">
                <Handshake className="size-4 text-[#19518d]" /> 谈判重点
              </p>
              <p className="mt-1">
                群主贡献真实需求和行业判断，平台贡献 AI 工具、SOP、dashboard 和未来 licence / 分成账本。
              </p>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-lg font-semibold">这个角色不能做什么</h2>
            <ul className="mt-4 grid gap-2 text-sm leading-6 text-[#40504b]">
              <li>不能直接看到所有服务商的内部审核资料。</li>
              <li>不能把 referral 私自分配给自己，除非账号被审核为 Both。</li>
              <li>不能查看其他来源方的客户池和商业数据。</li>
            </ul>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
