import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PortalReferralAssignmentQueue } from "@/components/portal-referral-assignment-controls";
import { ReferralCard } from "@/components/referral-card";
import { ButtonLink, Card } from "@/components/ui";
import { displayReferralStatus } from "@/lib/display";
import { referrals } from "@/lib/mock-data";
import { isPortalReferralAssignmentRuntimeEnabled } from "@/lib/portal-referral-runtime.server";
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
  const assignmentEnabled = isPortalReferralAssignmentRuntimeEnabled();

  if (assignmentEnabled) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="Referral assignment"
          title="Authorized assignment queue / 已授权分配队列"
          description="本页仅在独立 Preview assignment gate 通过后读取当前运营范围内的 canonical referrals。队列只显示分配所需 metadata，不显示私密摘要或联系人。"
        />
        <PortalReferralAssignmentQueue enabled={assignmentEnabled} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Referral 看板"
        title="从新需求到完成结果，跟踪每个 referral 状态"
        description="这是未来收费和分成的核心：每个 referral 都记录来源、匹配、联系、接受、完成和跟进数据。"
        actions={<ButtonLink href="/referrals/intake">新建 referral</ButtonLink>}
      />

      <Card className="mb-4 border-[#f0d28a] bg-[#fffaf0] p-4">
        <p className="text-sm font-semibold text-[#7a4b00]">
          Legacy demo board / 旧版演示看板
        </p>
        <p className="mt-1 text-sm leading-6 text-[#6c5a38]">
          下方数量、状态列和卡片来自本地 mock，不是 Preview
          数据库或 canonical Referral。真实 list adapter 尚未接入，所有新流程保持关闭。
        </p>
      </Card>

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
