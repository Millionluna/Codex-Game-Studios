import {
  ArrowDown,
  ArrowRight,
  BookOpenCheck,
  BriefcaseBusiness,
  ClipboardCheck,
  Cpu,
  Handshake,
  Network,
  Sparkles,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { ButtonLink, Card, MetricCard } from "@/components/ui";
import {
  getDemoEntrypoints,
  getHushcareBridge,
  getRevenueEngines,
} from "@/lib/demo-strategy";
import { getAssessmentFunnel } from "@/lib/provider-assessment";

const operatingLayers = [
  {
    title: "群主 / 渠道方",
    copy: "提供微信群、行业判断、provider 信任关系和真实 referral 需求。",
  },
  {
    title: "Careslink AI",
    copy: "提供 referral ops 系统、AI 工具、审核流程、数据沉淀和报表。",
  },
  {
    title: "Provider Network",
    copy: "分成可发 referral、可接 referral、Both 三类，形成可运营供需网络。",
  },
  {
    title: "HushCare Care Hub",
    copy: "从家庭安心场景进入服务查找，把 C 端需求转成 B2B referral lead。",
  },
];

const pitchSteps = [
  "先用 Referral Ops Setup 帮一个大群主跑通",
  "把 provider、referral、状态、来源归因沉淀进系统",
  "通过 training / dashboard / provider tools 产品化",
  "复制给更多群主、agency 和社区渠道",
];

export default function DemoHubPage() {
  const entrypoints = getDemoEntrypoints();
  const revenueEngines = getRevenueEngines();
  const hushcareBridge = getHushcareBridge();
  const assessmentFunnel = getAssessmentFunnel();

  return (
    <AppShell>
      <PageHeader
        eyebrow="谈判演示包"
        title="Careslink AI = Referral Ops 平台 + Okana 式能力建设"
        description="这页用于和群主、agency 或投资人讲清楚：我们不是普通目录，也不是 C 端下单平台，而是把微信群资源、provider 网络、真实 referral 和 HushCare 家庭入口系统化。"
        actions={
          <>
            <ButtonLink href="/admin">看平台管理端</ButtonLink>
            <ButtonLink href="/provider-assessment" variant="secondary">
              看免费评估入口
            </ButtonLink>
            <ButtonLink href="/hushcare-provider-finder" variant="secondary">
              看 HushCare 用户端
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="冷启动" value="免费评估" detail="先帮助 provider 变得可推荐" />
        <MetricCard label="核心资产" value="Referral 数据" detail="来源、匹配、联系、接受、完成" tone="blue" />
        <MetricCard label="Okana 启发" value="Setup + Training" detail="先卖能力建设，再产品化复制" tone="amber" />
        <MetricCard label="增长入口" value="HushCare" detail="家庭安心场景进入 provider discovery" tone="slate" />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Network className="size-5 text-[#0f766e]" /> 核心构思图
          </h2>
          <div className="mt-5 grid gap-3">
            {operatingLayers.map((layer, index) => (
              <div key={layer.title}>
                <div className="rounded-lg border border-[#dce8e2] bg-[#f7faf8] p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#0f766e] text-sm font-semibold text-white">
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="font-semibold">{layer.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-[#40504b]">
                        {layer.copy}
                      </p>
                    </div>
                  </div>
                </div>
                {index < operatingLayers.length - 1 ? (
                  <div className="flex justify-center py-2 text-[#0f766e]">
                    <ArrowDown className="size-5" />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="size-5 text-[#925b00]" /> 你跟群主讲的版本
          </h2>
          <div className="mt-4 rounded-lg bg-[#fff7df] p-4 text-sm leading-7 text-[#4d3b16]">
            我不是把你的群变成普通目录，也不是把 provider 拉走。
            我们先把群里已经存在的资源、真实需求和跟进过程系统化。
            你负责信任关系和行业判断，我负责 AI 工具、dashboard、培训和复制能力。
          </div>
          <div className="mt-4 grid gap-3">
            {pitchSteps.map((step, index) => (
              <div key={step} className="flex gap-3 rounded-lg border border-[#dce8e2] p-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[#e6f7f2] text-xs font-semibold text-[#0f766e]">
                  {index + 1}
                </span>
                <p className="text-sm leading-6 text-[#40504b]">{step}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-6 p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <BriefcaseBusiness className="size-5 text-[#19518d]" /> 五个前端 demo 入口
        </h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {entrypoints.map((entry) => (
            <a
              key={entry.id}
              href={entry.path}
              className="rounded-lg border border-[#dce8e2] bg-white p-4 transition hover:border-[#9ed8c9] hover:bg-[#f3fbf8]"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#0f766e]">
                {entry.audience}
              </p>
              <h3 className="mt-2 text-base font-semibold">{entry.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#5d6d68]">
                {entry.purpose}
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#0f766e]">
                打开 demo <ArrowRight className="size-4" />
              </span>
            </a>
          ))}
        </div>
      </Card>

      <Card className="mt-6 p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ClipboardCheck className="size-5 text-[#0f766e]" /> 新增冷启动主线：免费 provider 评估
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#40504b]">
          这条漏斗把 Okana 式能力建设嫁接到 Careslink：先给 provider 免费 readiness snapshot，沉淀数据，再自然转 AI profile、分享卡片、training 和 Pro 工具。
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          {assessmentFunnel.map((step, index) => (
            <a
              key={step.id}
              href={index < 2 ? "/provider-assessment" : "/provider-assessment/report"}
              className="rounded-lg border border-[#dce8e2] bg-[#f7faf8] p-3 transition hover:border-[#9ed8c9] hover:bg-[#eef7f3]"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#66736f]">
                {index + 1}
              </p>
              <h3 className="mt-2 text-sm font-semibold">{step.label}</h3>
              <p className="mt-2 text-xs leading-5 text-[#5d6d68]">
                {step.description}
              </p>
            </a>
          ))}
        </div>
      </Card>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_420px]">
        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <BookOpenCheck className="size-5 text-[#0f766e]" /> 盈利模式图
          </h2>
          <div className="mt-5 grid gap-3">
            {revenueEngines.map((engine, index) => (
              <div
                key={engine.id}
                className="grid gap-3 rounded-lg border border-[#dce8e2] p-4 lg:grid-cols-[180px_1fr_220px]"
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#66736f]">
                    Engine {index + 1}
                  </p>
                  <h3 className="mt-1 font-semibold">{engine.label}</h3>
                </div>
                <p className="text-sm leading-6 text-[#40504b]">{engine.offer}</p>
                <div className="rounded-lg bg-[#f7faf8] p-3 text-sm">
                  <p className="font-semibold">{engine.buyer}</p>
                  <p className="mt-1 leading-5 text-[#66736f]">{engine.timing}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Handshake className="size-5 text-[#925b00]" /> HushCare 嫁接
          </h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="rounded-lg bg-[#fffaf0] p-3">
              <dt className="font-semibold">来源产品</dt>
              <dd className="mt-1 text-[#40504b]">{hushcareBridge.sourceProduct}</dd>
            </div>
            <div className="rounded-lg bg-[#f7faf8] p-3">
              <dt className="font-semibold">入口</dt>
              <dd className="mt-1 text-[#40504b]">{hushcareBridge.entryPoint}</dd>
            </div>
            <div className="rounded-lg bg-[#f7faf8] p-3">
              <dt className="font-semibold">用户时刻</dt>
              <dd className="mt-1 leading-6 text-[#40504b]">{hushcareBridge.userMoment}</dd>
            </div>
            <div className="rounded-lg bg-[#f7faf8] p-3">
              <dt className="font-semibold">隐私边界</dt>
              <dd className="mt-1 leading-6 text-[#40504b]">
                {hushcareBridge.privacyBoundary}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card className="mt-6 p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Cpu className="size-5 text-[#0f766e]" /> 讲清楚技术不是卖点，运营闭环才是卖点
        </h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            "AI 用来整理、生成文案、解释匹配理由，不替 participant 做决定。",
            "平台记录来源、跟进和结果，让群主资产化，而不是把群资源抽走。",
            "HushCare 提供家庭端自然需求入口，Careslink 负责 B2B referral ops。",
          ].map((item) => (
            <div key={item} className="rounded-lg bg-[#f7faf8] p-4 text-sm leading-6 text-[#40504b]">
              {item}
            </div>
          ))}
        </div>
      </Card>
    </AppShell>
  );
}
