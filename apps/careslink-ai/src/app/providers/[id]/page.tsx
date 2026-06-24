import { ArrowLeft, BadgeCheck, MessageCircle, Share2 } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { ShareCardPreview } from "@/components/share-card";
import { ButtonLink, Card, ProviderStatusBadge } from "@/components/ui";
import {
  displayArea,
  displayInsuranceStatus,
  displayLanguage,
  displayList,
  displayService,
} from "@/lib/display";
import { providerProfiles, providers, shareCards } from "@/lib/mock-data";

export default async function ProviderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const provider = providers.find((item) => item.id === id) ?? providers[0];
  const profile = providerProfiles.find((item) => item.providerId === provider.id);
  const card = shareCards.find((item) => item.providerId === provider.id) ?? shareCards[0];

  return (
    <AppShell>
      <PageHeader
        eyebrow="服务商详情"
        title={provider.name}
        description="结构化服务商资料，用于运营审核、referral 匹配和分享卡片生成。"
        actions={
          <>
            <ButtonLink href="/providers" variant="secondary">
              <ArrowLeft className="size-4" /> 返回目录
            </ButtonLink>
            <ButtonLink href="/share-cards">
              <Share2 className="size-4" /> 预览分享卡片
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <div className="grid gap-4">
          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-3">
              <ProviderStatusBadge status={provider.status} />
              <span className="rounded-md bg-[#edf5ff] px-2 py-1 text-xs font-semibold text-[#19518d]">
                {provider.membershipPlan}
              </span>
              {provider.insuranceStatus === "verified" ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-[#e6f7f2] px-2 py-1 text-xs font-semibold text-[#0f766e]">
                  <BadgeCheck className="size-3" /> 保险已验证
                </span>
              ) : null}
            </div>
            <p className="mt-4 text-sm leading-6 text-[#40504b]">{provider.intro}</p>
            <dl className="mt-5 grid gap-4 md:grid-cols-2">
              {[
                ["服务类型", displayList(provider.serviceTypes, displayService)],
                ["服务区域", displayList(provider.serviceAreas, displayArea)],
                ["服务语言", displayList(provider.languages, displayLanguage)],
                ["ABN", provider.abn],
                ["来源群", provider.sourceGroupName],
                ["录入人", provider.createdBy],
                ["保险状态", displayInsuranceStatus(provider.insuranceStatus)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-[#f7faf8] p-3">
                  <dt className="text-xs uppercase tracking-[0.12em] text-[#66736f]">
                    {label}
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-[#17211f]">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <MessageCircle className="size-5 text-[#0f766e]" /> AI 生成资料
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#40504b]">
              {profile?.englishIntro}
            </p>
            <p className="mt-3 text-sm leading-6 text-[#40504b]">
              {profile?.chineseIntro}
            </p>
          </Card>
        </div>

        <ShareCardPreview card={card} provider={provider} />
      </div>

      <Link
        href="/referrals/referral-001/matches"
        className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg border border-[#cfded8] bg-white px-4 text-sm font-semibold"
      >
        查看 referral 匹配上下文
      </Link>
    </AppShell>
  );
}
