import {
  Bot,
  Building2,
  ClipboardCheck,
  Home,
  LayoutDashboard,
  Network,
  PanelLeft,
  Search,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  UserPlus,
  UserRoundCheck,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

const navItems = [
  { href: "/", label: "首页", icon: Home },
  { href: "/demo", label: "谈判 Demo", icon: Sparkles },
  { href: "/provider-assessment", label: "免费评估", icon: ClipboardCheck },
  { href: "/dashboard", label: "合伙人工作台", icon: LayoutDashboard },
  { href: "/admin", label: "平台管理员", icon: ShieldCheck },
  { href: "/referral-source-portal", label: "发 referral 端", icon: Send },
  { href: "/provider-portal", label: "接 referral 端", icon: UserRoundCheck },
  { href: "/hushcare-provider-finder", label: "用户找服务", icon: Search },
  { href: "/providers/onboarding", label: "网络入驻", icon: UserPlus },
  { href: "/providers/review", label: "服务商审核", icon: ClipboardCheck },
  { href: "/ai-profile", label: "AI 资料生成", icon: Bot },
  { href: "/providers", label: "服务商目录", icon: Building2 },
  { href: "/referrals/intake", label: "需求录入", icon: Network },
  { href: "/referrals", label: "Referral 看板", icon: PanelLeft },
  { href: "/share-cards", label: "分享卡片", icon: Share2 },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f7faf8] text-[#17211f]">
      <div className="grid min-h-screen min-w-0 lg:grid-cols-[280px_1fr]">
        <aside className="min-w-0 border-b border-[#dce8e2] bg-white/95 px-4 py-3 lg:border-b-0 lg:border-r lg:py-4">
          <Link href="/" className="flex items-center gap-3 rounded-lg px-2 py-2">
            <span className="flex size-10 items-center justify-center rounded-lg bg-[#0f766e] text-sm font-semibold text-white">
              CA
            </span>
            <span>
              <span className="block text-base font-semibold">Careslink AI</span>
              <span className="text-xs text-[#66736f]">
                Referral 运营系统
              </span>
            </span>
          </Link>

          <nav className="mt-3 flex max-w-full gap-1 overflow-x-auto pb-2 lg:mt-6 lg:grid lg:overflow-visible lg:pb-0">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-[#40504b] transition hover:bg-[#edf6f3] hover:text-[#0f766e] lg:gap-3"
              >
                <item.icon
                  aria-hidden="true"
                  className="size-4 text-[#6f817b] transition group-hover:text-[#0f766e]"
                />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>

          <div className="mt-8 hidden rounded-lg border border-[#dce8e2] bg-[#f5fbf8] p-4 lg:block">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#0f766e]">
              试点模式
            </p>
            <p className="mt-2 text-sm leading-6 text-[#40504b]">
              先服务一个可信业务合伙人，把服务商网络和真实 referral
              流程跑通，再复制给更多渠道方。
            </p>
          </div>
        </aside>

        <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
