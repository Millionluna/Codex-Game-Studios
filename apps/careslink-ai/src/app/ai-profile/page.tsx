import { Bot, Copy, WandSparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card, SelectInput } from "@/components/ui";
import { displayArea, displayLanguage, displayList, displayService } from "@/lib/display";
import { providerProfiles, providers } from "@/lib/mock-data";

export default function AiProfilePage() {
  const provider = providers[0];
  const profile = providerProfiles.find((item) => item.providerId === provider.id)!;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Mock AI 生成器"
        title="生成双语服务商资料文案"
        description="MVP 阶段先使用 deterministic mock 输出，后续可替换为 OpenAI API 或 Supabase Edge Function。"
        actions={
          <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0f766e] px-4 text-sm font-semibold text-white">
            <WandSparkles className="size-4" /> 生成资料
          </button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <Card className="p-5">
          <h2 className="text-lg font-semibold">服务商来源资料</h2>
          <label className="mt-4 grid gap-2 text-sm font-medium">
            选择服务商
            <SelectInput defaultValue={provider.id}>
              {providers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </SelectInput>
          </label>
          <dl className="mt-5 grid gap-3 text-sm">
            <div>
              <dt className="text-[#66736f]">服务</dt>
              <dd className="font-medium">{displayList(provider.serviceTypes, displayService)}</dd>
            </div>
            <div>
              <dt className="text-[#66736f]">区域</dt>
              <dd className="font-medium">{displayList(provider.serviceAreas, displayArea)}</dd>
            </div>
            <div>
              <dt className="text-[#66736f]">语言</dt>
              <dd className="font-medium">{displayList(provider.languages, displayLanguage)}</dd>
            </div>
          </dl>
        </Card>

        <div className="grid gap-4">
          {[
            ["英文服务介绍", profile.englishIntro],
            ["中文服务介绍", profile.chineseIntro],
            ["一句话推荐语", profile.elevatorPitch],
            ["微信群推广文案", profile.wechatCopy],
            ["Referral partner 推荐文案", profile.partnerRecommendation],
            ["分享卡片文案", profile.shareCardCopy],
            ["Profile 页面内容", profile.profilePageCopy],
          ].map(([title, copy]) => (
            <Card key={title} className="p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Bot className="size-4 text-[#0f766e]" /> {title}
                </h2>
                <button className="inline-flex size-9 items-center justify-center rounded-lg border border-[#cfded8]" aria-label={`复制 ${title}`}>
                  <Copy className="size-4" />
                </button>
              </div>
              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[#40504b]">
                {copy}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
