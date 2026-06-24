import { Download, Smartphone, WandSparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { ShareCardPreview } from "@/components/share-card";
import { Card, SelectInput } from "@/components/ui";
import { providers, referrals, shareCards } from "@/lib/mock-data";

export default function ShareCardsPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="分享卡片预览"
        title="生成适合微信群和 referral 渠道转发的可信卡片"
        description="MVP 阶段先支持 HTML/CSS 预览。后续可导出 PNG 图片，并接入二维码和渠道追踪链接。"
        actions={
          <>
            <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0f766e] px-4 text-sm font-semibold text-white">
              <WandSparkles className="size-4" /> 生成文案
            </button>
            <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#cfded8] bg-white px-4 text-sm font-semibold">
              <Download className="size-4" /> 后续导出图片
            </button>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[340px_1fr]">
        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Smartphone className="size-5 text-[#0f766e]" /> 卡片设置
          </h2>
          <div className="mt-4 grid gap-4">
            <label className="grid gap-2 text-sm font-medium">
              卡片类型
              <SelectInput defaultValue="provider">
                <option value="provider">服务商分享卡片</option>
                <option value="referral">Referral 需求分享卡片</option>
              </SelectInput>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              渠道
              <SelectInput defaultValue="WeChat">
                <option>WeChat</option>
                <option>WhatsApp</option>
                <option>Xiaohongshu</option>
                <option>LinkedIn</option>
              </SelectInput>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              视觉语气
              <SelectInput defaultValue="trusted">
                <option value="trusted">可信社区服务</option>
                <option value="clinical">正式专业</option>
                <option value="warm">温暖家庭转介</option>
              </SelectInput>
            </label>
          </div>
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          {shareCards.map((card) => (
            <ShareCardPreview
              key={card.id}
              card={card}
              provider={providers.find((provider) => provider.id === card.providerId)}
              referral={referrals.find((referral) => referral.id === card.referralId)}
            />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
