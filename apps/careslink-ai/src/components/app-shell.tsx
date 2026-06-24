import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Archive,
  Building2,
  CircleGauge,
  ClipboardList,
  FileText,
  KeyRound,
  LayoutDashboard,
  Network,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import Link from "next/link";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const primaryNavItems: NavItem[] = [
  { href: "/referral-workspace", label: "Workspace", icon: LayoutDashboard },
  { href: "/referral-workspace/profile", label: "Profile", icon: UserRound },
  { href: "/referral-workspace/health", label: "Readiness audit", icon: CircleGauge },
  { href: "/referral-workspace/materials", label: "Materials", icon: FileText },
  { href: "/referral-workspace/access", label: "Access code", icon: KeyRound },
  { href: "/admin/access-requests", label: "Access requests", icon: ClipboardList },
];

const legacyNavItems: NavItem[] = [
  { href: "/demo", label: "Legacy demo hub", icon: Archive },
  { href: "/provider-assessment", label: "Legacy assessment", icon: ClipboardList },
  { href: "/dashboard", label: "Ops dashboard", icon: LayoutDashboard },
  { href: "/provider-portal", label: "Provider portal", icon: UserRound },
  { href: "/referrals", label: "Referral board", icon: Network },
  { href: "/providers", label: "Legacy provider records", icon: Building2 },
];

function NavGroup({
  label,
  items,
}: {
  label: string;
  items: NavItem[];
}) {
  return (
    <div className="grid gap-1">
      <p className="px-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#65736f]">
        {label}
      </p>
      <div className="flex gap-1 overflow-x-auto pb-1 lg:grid lg:overflow-visible lg:pb-0">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[#40504b] transition hover:bg-[#edf6f3] hover:text-[#0f766e] lg:gap-3"
          >
            <item.icon
              aria-hidden="true"
              className="size-4 shrink-0 text-[#6f817b] transition group-hover:text-[#0f766e]"
            />
            <span className="whitespace-nowrap">{item.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f7faf8] text-[#17211f]">
      <div className="grid min-h-screen min-w-0 lg:grid-cols-[292px_1fr]">
        <aside className="min-w-0 border-b border-[#dce8e2] bg-white/95 px-4 py-3 lg:border-b-0 lg:border-r lg:py-4">
          <Link
            href="/referral-workspace"
            className="flex items-center gap-3 rounded-lg px-2 py-2"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#0f766e] text-sm font-semibold text-white">
              CL
            </span>
            <span className="min-w-0">
              <span className="block truncate text-base font-semibold">
                CaresLink
              </span>
              <span className="text-xs text-[#65736f]">
                Referral profile workspace
              </span>
            </span>
          </Link>

          <nav className="mt-4 grid max-w-full gap-5 lg:mt-6">
            <NavGroup label="Preview v0.1" items={primaryNavItems} />
            <NavGroup label="Legacy demos" items={legacyNavItems} />
          </nav>

          <div className="mt-8 hidden rounded-lg border border-[#dce8e2] bg-[#f5fbf8] p-4 lg:block">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#0f766e]">
              <ShieldAlert className="size-4" aria-hidden="true" />
              Pilot preview
            </div>
            <p className="mt-2 text-sm leading-6 text-[#40504b]">
              This workspace reviews referral communication completeness from
              self-submitted profile information. It does not assess provider
              quality, clinical suitability, compliance status, or service
              outcomes.
            </p>
          </div>
        </aside>

        <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
