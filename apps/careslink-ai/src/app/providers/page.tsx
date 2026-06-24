import { Filter, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { ProviderCard } from "@/components/provider-card";
import { Card, SelectInput, TextInput } from "@/components/ui";
import { providers } from "@/lib/mock-data";

export default function ProviderDirectoryPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="服务商目录"
        title="搜索并分享可信服务商资源"
        description="目录主要用于内部运营、合伙人分享和未来 SEO。早期不强调收费，重点是帮助服务商获得真实 referral 机会。"
      />

      <Card className="mb-5 p-4">
        <div className="grid gap-3 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 size-4 text-[#66736f]" />
            <TextInput className="pl-9" placeholder="搜索服务商、服务类型或区域" />
          </label>
          <SelectInput defaultValue="all">
            <option value="all">全部区域</option>
            <option>悉尼</option>
            <option>帕拉马塔</option>
            <option>黑镇</option>
          </SelectInput>
          <SelectInput defaultValue="all">
            <option value="all">全部服务</option>
            <option>支持协调</option>
            <option>个人护理</option>
            <option>职业治疗</option>
          </SelectInput>
          <SelectInput defaultValue="approved">
            <option value="approved">已审核</option>
            <option>待审核</option>
            <option>已拒绝</option>
          </SelectInput>
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#cfded8] bg-white px-3 text-sm font-semibold">
            <Filter className="size-4" /> 更多筛选
          </button>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {providers.map((provider) => (
          <ProviderCard key={provider.id} provider={provider} />
        ))}
      </div>
    </AppShell>
  );
}
