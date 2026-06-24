import {
  HeartHandshake,
  Home,
  Languages,
  MapPin,
  MessageCircle,
  PhoneCall,
  Search,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { MobileAppFrame } from "@/components/mobile-app-frame";
import { PageHeader } from "@/components/page-header";
import { Card, MetricCard } from "@/components/ui";
import {
  displayArea,
  displayLanguage,
  displayList,
  displayService,
} from "@/lib/display";
import { getHushcareBridge } from "@/lib/demo-strategy";
import { providers } from "@/lib/mock-data";

const familySignals = [
  {
    label: "安心手帐",
    value: "今天小屋已点亮",
    detail: "只显示陪伴进展，不显示小游戏表现。",
  },
  {
    label: "家庭需求",
    value: "想了解中文 home care",
    detail: "由家人主动进入 Care Hub。",
  },
  {
    label: "隐私边界",
    value: "不使用能力评分",
    detail: "只把明确服务需求转成 referral lead。",
  },
];

const serviceNeeds = ["居家护理", "交通陪同", "支持协调", "OT 评估"];

export default function HushcareProviderFinderPage() {
  const bridge = getHushcareBridge();
  const visibleProviders = providers.filter(
    (provider) =>
      provider.status === "approved" &&
      (provider.supportsAgedCare || provider.supportsNdis),
  );

  return (
    <AppShell>
      <PageHeader
        eyebrow="终端用户端 / HushCare Care Hub"
        title="从家庭安心小程序进入可信 provider 查找"
        description="HushCare 家庭端不做监控，也不展示长者表现数据。当家人主动想了解居家支持时，Care Hub 可以进入 Careslink 的 provider discovery，并把需求转成 B2B referral lead。"
      />

      <div className="grid gap-4 md:grid-cols-3">
        {familySignals.map((signal) => (
          <MetricCard
            key={signal.label}
            label={signal.label}
            value={signal.value}
            detail={signal.detail}
            tone={signal.label === "家庭需求" ? "amber" : "teal"}
          />
        ))}
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="grid gap-5">
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Search className="size-5 text-[#0f766e]" /> Provider Finder
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5d6d68]">
                  面向家人端：按区域、语言、服务类型和资金类型筛选。这里不是下单页，
                  而是帮助家庭收藏、讨论，并向运营方发起 referral 请求。
                </p>
              </div>
              <span className="rounded-md border border-[#9ed8c9] bg-[#e6f7f2] px-2 py-1 text-xs font-semibold text-[#0f766e]">
                HushCare → Careslink AI
              </span>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              {[
                ["Postcode / 区域", "2150 Parramatta"],
                ["服务类型", "Personal care / Support coordination"],
                ["语言", "普通话 / 粤语"],
                ["资金", "NDIS / Aged Care / 自费"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-[#dce8e2] bg-[#f7faf8] p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#66736f]">
                    {label}
                  </p>
                  <p className="mt-2 text-sm font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {visibleProviders.map((provider) => (
              <Card key={provider.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold">{provider.name}</h3>
                    <p className="mt-1 text-sm leading-6 text-[#5d6d68]">
                      {displayList(provider.serviceTypes, displayService)}
                    </p>
                  </div>
                  <span className="rounded-md bg-[#e6f7f2] px-2 py-1 text-xs font-semibold text-[#0f766e]">
                    已审核
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-[#40504b]">{provider.intro}</p>
                <div className="mt-4 grid gap-2 text-sm text-[#5d6d68]">
                  <span className="flex items-center gap-2">
                    <MapPin className="size-4 text-[#0f766e]" />
                    {displayList(provider.serviceAreas, displayArea)}
                  </span>
                  <span className="flex items-center gap-2">
                    <Languages className="size-4 text-[#19518d]" />
                    {displayList(provider.languages, displayLanguage)}
                  </span>
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-[#925b00]" />
                    {provider.supportsNdis ? "支持 NDIS" : "不支持 NDIS"} ·{" "}
                    {provider.supportsAgedCare ? "支持 aged care" : "不支持 aged care"}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#0f766e] px-3 text-sm font-semibold text-white">
                    <PhoneCall className="size-4" /> 请求回电
                  </button>
                  <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#cfded8] bg-white px-3 text-sm font-semibold text-[#263834]">
                    <HeartHandshake className="size-4" /> 加入家庭讨论
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </div>

        <div className="grid gap-5">
          <MobileAppFrame
            title="Care Hub"
            subtitle="从家庭安心手帐进入，不像广告目录。"
            status="家庭主动查找"
            tabs={["安心", "服务", "收藏"]}
          >
            <div className="rounded-lg border border-[#dce8e2] bg-[#fffaf0] p-3">
              <p className="text-xs font-semibold text-[#66736f]">今日安心手帐</p>
              <h3 className="mt-2 text-base font-semibold">今天小屋已点亮</h3>
              <p className="mt-2 text-sm leading-6 text-[#40504b]">
                家人看到的是生活摘要，不是长者表现数据。若需要支持，可进入 Care Hub。
              </p>
            </div>
            <div className="rounded-lg border border-[#dce8e2] bg-white p-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Home className="size-4 text-[#0f766e]" /> 选择需要
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {serviceNeeds.map((need) => (
                  <button
                    key={need}
                    className="min-h-12 rounded-lg border border-[#dce8e2] bg-[#f7faf8] px-2 text-sm font-semibold text-[#263834]"
                  >
                    {need}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-[#dce8e2] bg-white p-3">
              <p className="text-sm font-semibold">推荐 provider</p>
              <div className="mt-3 grid gap-2">
                {visibleProviders.slice(0, 2).map((provider) => (
                  <div key={provider.id} className="rounded-lg bg-[#f7faf8] p-2">
                    <p className="text-sm font-semibold">{provider.name}</p>
                    <p className="mt-1 text-xs leading-5 text-[#66736f]">
                      {displayList(provider.serviceAreas.slice(0, 2), displayArea)} ·{" "}
                      {displayList(provider.languages.slice(0, 2), displayLanguage)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </MobileAppFrame>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <MessageCircle className="size-5 text-[#19518d]" /> 嫁接逻辑
            </h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="font-semibold">来源</dt>
                <dd className="mt-1 text-[#40504b]">{bridge.sourceProduct}</dd>
              </div>
              <div>
                <dt className="font-semibold">进入时刻</dt>
                <dd className="mt-1 leading-6 text-[#40504b]">{bridge.userMoment}</dd>
              </div>
              <div>
                <dt className="font-semibold">转化目标</dt>
                <dd className="mt-1 leading-6 text-[#40504b]">{bridge.conversionGoal}</dd>
              </div>
              <div>
                <dt className="font-semibold">隐私边界</dt>
                <dd className="mt-1 leading-6 text-[#40504b]">{bridge.privacyBoundary}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
