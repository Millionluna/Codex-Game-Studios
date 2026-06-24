import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { ReferralCard } from "@/components/referral-card";
import { ButtonLink, Card } from "@/components/ui";
import { displayReferralStatus } from "@/lib/display";
import { referrals } from "@/lib/mock-data";
import type { ReferralStatus } from "@/lib/types";

const columns: ReferralStatus[] = [
  "New",
  "Pending Match",
  "Matched",
  "Contacted",
  "Accepted",
  "Completed",
];

export default function ReferralBoardPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Referral 看板"
        title="从新需求到完成结果，跟踪每个 referral 状态"
        description="这是未来收费和分成的核心：每个 referral 都记录来源、匹配、联系、接受、完成和跟进数据。"
        actions={<ButtonLink href="/referrals/intake">新建 referral</ButtonLink>}
      />

      <div className="grid gap-4 xl:grid-cols-3 2xl:grid-cols-6">
        {columns.map((status) => {
          const items = referrals.filter((referral) => referral.status === status);
          return (
            <Card key={status} className="min-h-60 p-3">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">{displayReferralStatus(status)}</h2>
                <span className="rounded-md bg-[#eef3f1] px-2 py-1 text-xs font-semibold text-[#40504b]">
                  {items.length}
                </span>
              </div>
              <div className="grid gap-3">
                {items.map((referral) => (
                  <ReferralCard key={referral.id} referral={referral} />
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
