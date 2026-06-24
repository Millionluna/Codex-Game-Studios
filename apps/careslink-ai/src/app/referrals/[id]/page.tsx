import { ArrowRight, CalendarClock, MessageSquarePlus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { ButtonLink, Card, ReferralStatusBadge, TextArea } from "@/components/ui";
import {
  displayArea,
  displayFrequency,
  displayFundingType,
  displayLanguage,
  displayList,
  displayService,
} from "@/lib/display";
import { providers, referrals } from "@/lib/mock-data";

export default async function ReferralDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const referral = referrals.find((item) => item.id === id) ?? referrals[0];
  const assignedProvider = providers.find(
    (provider) => provider.id === referral.assignedProviderId,
  );

  return (
    <AppShell>
      <PageHeader
        eyebrow="Referral 详情"
        title={`${displayArea(referral.clientArea)} · ${displayService(referral.needType)}`}
        description={referral.summary}
        actions={
          <ButtonLink href={`/referrals/${referral.id}/matches`}>
            查看匹配 <ArrowRight className="size-4" />
          </ButtonLink>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Card className="p-5">
          <div className="flex flex-wrap gap-3">
            <ReferralStatusBadge status={referral.status} />
            <span className="rounded-md bg-[#fff7df] px-2 py-1 text-xs font-semibold text-[#925b00]">
              {referral.urgent ? "紧急" : "普通优先级"}
            </span>
            <span className="rounded-md bg-[#edf5ff] px-2 py-1 text-xs font-semibold text-[#19518d]">
              {displayFundingType(referral.fundingType)}
            </span>
          </div>

          <dl className="mt-5 grid gap-4 md:grid-cols-2">
            {[
              ["区域", displayArea(referral.clientArea)],
              ["语言", displayList(referral.languageRequirements, displayLanguage)],
              ["频率", displayFrequency(referral.frequency)],
              ["来源群", referral.sourceGroupName],
              ["联系人", `${referral.contactName} · ${referral.contactPhone}`],
              ["已分配服务商", assignedProvider?.name ?? "未分配"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-[#f7faf8] p-3">
                <dt className="text-xs uppercase tracking-[0.12em] text-[#66736f]">
                  {label}
                </dt>
                <dd className="mt-1 text-sm font-medium">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-5">
            <label className="grid gap-2 text-sm font-medium">
              跟进备注
              <TextArea defaultValue={referral.notes} />
            </label>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CalendarClock className="size-5 text-[#0f766e]" /> 跟进控制
          </h2>
          <p className="mt-2 text-sm text-[#5d6d68]">
            下次跟进：{referral.followUpDate}
          </p>
          <div className="mt-4 grid gap-2">
            {["标记已联系", "标记已接受", "标记已完成", "标记无法服务"].map(
              (label) => (
                <button
                  key={label}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#cfded8] bg-white px-3 text-sm font-semibold"
                >
                  <MessageSquarePlus className="size-4" /> {label}
                </button>
              ),
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
