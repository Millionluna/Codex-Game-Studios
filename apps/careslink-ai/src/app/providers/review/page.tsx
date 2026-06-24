import { Check, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card, ProviderStatusBadge } from "@/components/ui";
import { displayArea, displayInsuranceStatus, displayList, displayService } from "@/lib/display";
import { providers } from "@/lib/mock-data";

export default function ProviderReviewPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="服务商审核"
        title="服务商进入可信网络前先审核"
        description="运营方可以在审核前检查服务匹配度、来源渠道、保险状态、接单能力、ABN 和语言覆盖。"
      />
      <Card className="overflow-x-auto p-5">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.12em] text-[#66736f]">
            <tr>
              <th className="py-2">服务商</th>
              <th>状态</th>
              <th>服务</th>
              <th>区域</th>
              <th>来源</th>
              <th>保险</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e5eee9]">
            {providers.map((provider) => (
              <tr key={provider.id}>
                <td className="py-4">
                  <p className="font-semibold">{provider.name}</p>
                  <p className="mt-1 font-mono text-xs text-[#66736f]">
                    ABN {provider.abn}
                  </p>
                </td>
                <td>
                  <ProviderStatusBadge status={provider.status} />
                </td>
                <td>{displayList(provider.serviceTypes, displayService)}</td>
                <td>{displayList(provider.serviceAreas, displayArea)}</td>
                <td>{provider.sourceGroupName}</td>
                <td>{displayInsuranceStatus(provider.insuranceStatus)}</td>
                <td>
                  <div className="flex gap-2">
                    <button className="inline-flex size-9 items-center justify-center rounded-lg bg-[#e6f7f2] text-[#0f766e]" aria-label="通过服务商">
                      <Check className="size-4" />
                    </button>
                    <button className="inline-flex size-9 items-center justify-center rounded-lg bg-[#fff0f0] text-[#a33a3a]" aria-label="拒绝服务商">
                      <X className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </AppShell>
  );
}
