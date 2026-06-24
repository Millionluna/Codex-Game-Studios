import { ClipboardPlus, MessageSquareText } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card, FieldLabel, SelectInput, TextArea, TextInput } from "@/components/ui";

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
          <form className="grid gap-5">
            <div className="grid gap-4 md:grid-cols-2">
              <FieldLabel>
                客户所在区域
                <TextInput defaultValue="Parramatta" />
              </FieldLabel>
              <FieldLabel>
                需求类型
                <SelectInput defaultValue="Support Coordination">
                  <option value="Support Coordination">支持协调</option>
                  <option value="Personal Care">个人护理</option>
                  <option value="Domestic Assistance">居家清洁与家务协助</option>
                  <option value="Occupational Therapy">职业治疗</option>
                </SelectInput>
              </FieldLabel>
              <FieldLabel>
                语言要求
                <TextInput defaultValue="普通话" />
              </FieldLabel>
              <FieldLabel>
                服务频率
                <TextInput defaultValue="每周" />
              </FieldLabel>
              <FieldLabel>
                资金类型
                <SelectInput defaultValue="NDIS">
                  <option value="NDIS">NDIS</option>
                  <option value="Aged Care">养老护理</option>
                  <option value="Private">自费</option>
                  <option value="Mixed">混合资金</option>
                </SelectInput>
              </FieldLabel>
              <FieldLabel>
                紧急程度
                <SelectInput defaultValue="urgent">
                  <option value="urgent">紧急</option>
                  <option value="normal">普通</option>
                </SelectInput>
              </FieldLabel>
              <FieldLabel>
                联系人
                <TextInput defaultValue="Referral 合作方" />
              </FieldLabel>
              <FieldLabel>
                联系电话
                <TextInput defaultValue="04 0000 0000" />
              </FieldLabel>
              <FieldLabel>
                来源微信群
                <TextInput defaultValue="悉尼养老 Referral 资源群" />
              </FieldLabel>
              <FieldLabel>
                下次跟进时间
                <TextInput type="date" defaultValue="2026-06-24" />
              </FieldLabel>
            </div>
            <FieldLabel>
              需求摘要
              <TextArea defaultValue="帕拉马塔一位普通话 participant 需要紧急支持协调。" />
            </FieldLabel>
            <FieldLabel>
              运营备注
              <TextArea defaultValue="来自微信群讨论。家属希望有双语 intake。" />
            </FieldLabel>
            <button className="inline-flex h-10 w-fit items-center gap-2 rounded-lg bg-[#0f766e] px-4 text-sm font-semibold text-white">
              <ClipboardPlus className="size-4" /> 创建 referral
            </button>
          </form>
        </Card>

        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <MessageSquareText className="size-5 text-[#0f766e]" /> 粘贴消息转结构化
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#5d6d68]">
            后续 AI 可以把原始微信群消息解析成区域、需求类型、紧急程度、语言和联系方式。
            MVP 阶段保留清晰字段，方便运营方逐项确认敏感信息。
          </p>
        </Card>
      </div>
    </AppShell>
  );
}
