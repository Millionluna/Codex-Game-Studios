import {
  ArrowRight,
  ClipboardCheck,
  FileText,
  Languages,
  MapPin,
  ShieldAlert,
  Sparkles,
  TimerReset,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { MobileAppFrame } from "@/components/mobile-app-frame";
import { PageHeader } from "@/components/page-header";
import {
  ButtonLink,
  Card,
  FieldLabel,
  MetricCard,
  SelectInput,
  TextArea,
  TextInput,
} from "@/components/ui";
import {
  getAssessmentFunnel,
  getReadinessUpgradeOffers,
} from "@/lib/provider-assessment";

export default function ProviderAssessmentPage() {
  const funnel = getAssessmentFunnel();
  const upgradeOffers = getReadinessUpgradeOffers();

  return (
    <AppShell>
      <PageHeader
        eyebrow="免费 Provider Referral Readiness Assessment"
        title="先用免费评估冷启动 provider network"
        description="这不是认证，也不是质量担保。它是一份 referral 接单准备度评估，帮助 provider 看清资料、服务区域、语言、intake 和分享素材是否适合被 referral partners 推荐。"
        actions={
          <>
            <ButtonLink href="/provider-assessment/report">
              <FileText className="size-4" /> 看示例报告
            </ButtonLink>
            <ButtonLink href="/providers/onboarding" variant="secondary">
              进入网络入驻
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="获客钩子" value="免费" detail="先提供 snapshot，不先卖入驻费" />
        <MetricCard label="评估时长" value="20-30 分钟" detail="适合从微信群邀请 provider" tone="blue" />
        <MetricCard label="输出" value="1 页报告" detail="准备度、缺口、下一步 CTA" tone="amber" />
        <MetricCard label="边界" value="非认证" detail="避免合规和质量背书风险" tone="slate" />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_390px]">
        <div className="grid gap-5">
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#0f766e]">
                  <ClipboardCheck className="size-4" /> Provider intake form
                </p>
                <h2 className="mt-2 text-lg font-semibold">Referral readiness 快速评估</h2>
                <p className="mt-1 text-sm leading-6 text-[#5d6d68]">
                  这个表单用于 demo 展示真实冷启动流程：群主邀请 provider 填资料，平台生成 readiness snapshot，再引导 AI profile / share card / Pro 工具。
                </p>
              </div>
              <span className="rounded-md border border-[#f4d28f] bg-[#fff7df] px-2 py-1 text-xs font-semibold text-[#925b00]">
                Partner Preview
              </span>
            </div>

            <form className="mt-5 grid gap-5">
              <div className="grid gap-4 md:grid-cols-2">
                <FieldLabel>
                  服务商名称
                  <TextInput defaultValue="Harbour Community Support" />
                </FieldLabel>
                <FieldLabel>
                  主要联系人
                  <TextInput defaultValue="Harbour Intake 团队" />
                </FieldLabel>
                <FieldLabel>
                  服务类型
                  <SelectInput defaultValue="Support Coordination">
                    <option>Support Coordination</option>
                    <option>Personal Care</option>
                    <option>Domestic Assistance</option>
                    <option>Transport</option>
                    <option>Allied Health</option>
                  </SelectInput>
                </FieldLabel>
                <FieldLabel>
                  主要服务区域
                  <TextInput defaultValue="Sydney, Parramatta, Chatswood" />
                </FieldLabel>
                <FieldLabel>
                  服务语言
                  <TextInput defaultValue="English, Mandarin, Cantonese" />
                </FieldLabel>
                <FieldLabel>
                  平均响应时间
                  <SelectInput defaultValue="Same business day">
                    <option>Same business day</option>
                    <option>Within 24 hours</option>
                    <option>Within 2-3 days</option>
                    <option>Not defined yet</option>
                  </SelectInput>
                </FieldLabel>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {[
                  "接新客户",
                  "支持 NDIS",
                  "支持 aged care",
                  "可紧急接单",
                  "有 ABN",
                  "保险资料可上传",
                ].map((item) => (
                  <label
                    key={item}
                    className="flex items-center gap-2 rounded-lg border border-[#dce8e2] bg-[#f7faf8] px-3 py-2 text-sm font-medium text-[#263834]"
                  >
                    <input type="checkbox" defaultChecked className="size-4 accent-[#0f766e]" />
                    {item}
                  </label>
                ))}
              </div>

              <FieldLabel>
                你最想接哪类 referral？
                <TextArea defaultValue="希望优先接 NDIS support coordination、中文家庭咨询、以及需要本周初步电话 intake 的 referral。" />
              </FieldLabel>

              <div className="flex flex-wrap gap-3">
                <ButtonLink href="/provider-assessment/report">
                  生成 readiness snapshot <ArrowRight className="size-4" />
                </ButtonLink>
                <ButtonLink href="/ai-profile" variant="secondary">
                  直接看 AI profile 生成
                </ButtonLink>
              </div>
            </form>
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Sparkles className="size-5 text-[#925b00]" /> Assessment funnel
            </h2>
            <div className="mt-4 grid gap-3">
              {funnel.map((step, index) => (
                <div key={step.id} className="grid gap-3 rounded-lg border border-[#dce8e2] p-4 md:grid-cols-[120px_1fr_170px]">
                  <p className="text-sm font-semibold text-[#0f766e]">
                    Step {index + 1}
                  </p>
                  <div>
                    <h3 className="font-semibold">{step.label}</h3>
                    <p className="mt-1 text-sm leading-6 text-[#40504b]">
                      {step.description}
                    </p>
                  </div>
                  <p className="rounded-lg bg-[#f7faf8] p-3 text-sm font-medium text-[#40504b]">
                    {step.owner}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="grid gap-5">
          <MobileAppFrame
            title="Readiness Check"
            subtitle="Provider 在手机上完成免费评估，适合微信群邀请链接。"
            status="Profile reviewed, not certified"
            tabs={["资料", "接单", "报告"]}
          >
            <div className="rounded-lg border border-[#dce8e2] bg-white p-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <MapPin className="size-4 text-[#0f766e]" /> 服务区域
              </p>
              <p className="mt-2 text-sm leading-6 text-[#40504b]">
                Sydney, Parramatta, Chatswood
              </p>
            </div>
            <div className="rounded-lg border border-[#dce8e2] bg-white p-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Languages className="size-4 text-[#19518d]" /> 语言和家庭适配
              </p>
              <p className="mt-2 text-sm leading-6 text-[#40504b]">
                Mandarin / Cantonese family communication ready.
              </p>
            </div>
            <div className="rounded-lg border border-[#dce8e2] bg-white p-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <TimerReset className="size-4 text-[#925b00]" /> Intake response
              </p>
              <div className="mt-3 rounded-lg bg-[#f7faf8] p-3 text-sm">
                Same business day, urgent referral capacity available.
              </div>
            </div>
            <a
              href="/provider-assessment/report"
              className="block h-9 rounded-lg bg-[#0f766e] text-center text-sm font-semibold leading-9 text-white"
            >
              查看报告
            </a>
          </MobileAppFrame>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <ShieldAlert className="size-5 text-[#925b00]" /> 合规表达边界
            </h2>
            <ul className="mt-4 grid gap-2 text-sm leading-6 text-[#40504b]">
              <li>可以说 Referral-ready profile completed。</li>
              <li>可以说 Profile reviewed by Careslink AI。</li>
              <li>不要说 certified provider 或 guaranteed service。</li>
              <li>报告只给运营建议，不做临床、法律或服务质量结论。</li>
            </ul>
          </Card>

          <Card className="p-5">
            <h2 className="text-lg font-semibold">下一步可商业化</h2>
            <div className="mt-4 grid gap-3">
              {upgradeOffers.map((offer) => (
                <div key={offer.id} className="rounded-lg border border-[#dce8e2] p-3">
                  <p className="font-semibold">{offer.label}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-[#66736f]">
                    {offer.priceSignal}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#40504b]">{offer.outcome}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
