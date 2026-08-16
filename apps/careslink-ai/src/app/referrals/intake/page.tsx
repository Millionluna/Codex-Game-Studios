import { MessageSquareText } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PortalReferralIntakeControls } from "@/components/portal-referral-workflow-controls";
import { Card } from "@/components/ui";

export default function ReferralIntakePage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Referral 需求录入"
        title="把群里的 referral 需求及时沉淀下来"
        description="运营方可以把微信群消息、合作方电话或分享卡片线索转成结构化 referral，并记录来源和跟进时间。"
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Card className="p-5">
          <PortalReferralIntakeControls />
        </Card>

        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <MessageSquareText className="size-5 text-[#0f766e]" /> 粘贴消息转结构化
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#5d6d68]">
            当前只展示已审核的维州区域、服务类型、私密联系人和摘要字段。运行时能力保持关闭，
            因此本页不会发送或保存任何资料。
          </p>
        </Card>
      </div>
    </AppShell>
  );
}
