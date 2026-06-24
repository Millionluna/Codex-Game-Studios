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
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  getLocaleLabel,
  getReferralWorkspaceCopy,
  withLocale,
  type Locale,
} from "@/lib/referral-workspace-i18n";

type PrimaryNavLabel =
  | "workspace"
  | "profile"
  | "health"
  | "materials"
  | "accessCode"
  | "accessRequests";

type LegacyNavLabel =
  | "dashboard"
  | "referrals"
  | "providers"
  | "referralSourcePortal"
  | "providerPortal";

type PrimaryNavItem = {
  href: string;
  labelKey: PrimaryNavLabel;
  icon: LucideIcon;
};

type LegacyNavItem = {
  href: string;
  labelKey?: LegacyNavLabel;
  fallbackLabel?: string;
  icon: LucideIcon;
};

type LocalizedNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const primaryNavItems: PrimaryNavItem[] = [
  { href: "/referral-workspace", labelKey: "workspace", icon: LayoutDashboard },
  { href: "/referral-workspace/profile", labelKey: "profile", icon: UserRound },
  {
    href: "/referral-workspace/health",
    labelKey: "health",
    icon: CircleGauge,
  },
  {
    href: "/referral-workspace/materials",
    labelKey: "materials",
    icon: FileText,
  },
  { href: "/referral-workspace/access", labelKey: "accessCode", icon: KeyRound },
  {
    href: "/admin/access-requests",
    labelKey: "accessRequests",
    icon: ClipboardList,
  },
];

const legacyNavItems: LegacyNavItem[] = [
  { href: "/demo", fallbackLabel: "Legacy demo hub", icon: Archive },
  {
    href: "/provider-assessment",
    fallbackLabel: "Legacy assessment",
    icon: ClipboardList,
  },
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/provider-portal", labelKey: "providerPortal", icon: UserRound },
  { href: "/referrals", labelKey: "referrals", icon: Network },
  { href: "/providers", labelKey: "providers", icon: Building2 },
];

function NavGroup({
  label,
  items,
  locale,
}: {
  label: string;
  items: LocalizedNavItem[];
  locale: Locale;
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
            href={withLocale(item.href, locale)}
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

type AppShellProps = {
  children: ReactNode;
  locale?: Locale;
};

export function AppShell({ children, locale = DEFAULT_LOCALE }: AppShellProps) {
  const copy = getReferralWorkspaceCopy(locale);
  const primaryItems = primaryNavItems.map((item) => ({
    ...item,
    label: copy.shell.primaryNav[item.labelKey],
  }));
  const legacyItems = legacyNavItems.map((item) => ({
    ...item,
    label: item.labelKey
      ? copy.shell.legacyNav[item.labelKey]
      : (item.fallbackLabel ?? ""),
  }));

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f7faf8] text-[#17211f]">
      <div className="grid min-h-screen min-w-0 lg:grid-cols-[292px_1fr]">
        <aside className="min-w-0 border-b border-[#dce8e2] bg-white/95 px-4 py-3 lg:border-b-0 lg:border-r lg:py-4">
          <Link
            href={withLocale("/referral-workspace", locale)}
            className="flex items-center gap-3 rounded-lg px-2 py-2"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#0f766e] text-sm font-semibold text-white">
              CL
            </span>
            <span className="min-w-0">
              <span className="block truncate text-base font-semibold">
                {copy.shell.brand}
              </span>
              <span className="text-xs text-[#65736f]">
                {copy.shell.subtitle}
              </span>
            </span>
          </Link>

          <nav className="mt-4 grid max-w-full gap-5 lg:mt-6">
            <NavGroup
              label={copy.common.previewOnly}
              items={primaryItems}
              locale={locale}
            />
            <NavGroup label="Legacy demos" items={legacyItems} locale={locale} />
          </nav>

          <div className="mt-5 grid gap-2 rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#65736f]">
              {copy.shell.language}
            </p>
            <div className="flex flex-wrap gap-2">
              {SUPPORTED_LOCALES.map((supportedLocale) => {
                const isActive = supportedLocale === locale;

                return (
                  <Link
                    key={supportedLocale}
                    href={withLocale("/referral-workspace", supportedLocale)}
                    aria-current={isActive ? "page" : undefined}
                    className={`inline-flex min-h-9 items-center rounded-md border px-3 text-sm font-semibold transition ${
                      isActive
                        ? "border-[#0f766e] bg-[#e6f7f2] text-[#0f766e]"
                        : "border-[#dce8e2] bg-white text-[#40504b] hover:border-[#9ed8c9] hover:text-[#0f766e]"
                    }`}
                  >
                    {getLocaleLabel(supportedLocale)}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="mt-8 hidden rounded-lg border border-[#dce8e2] bg-[#f5fbf8] p-4 lg:block">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#0f766e]">
              <ShieldAlert className="size-4" aria-hidden="true" />
              {copy.shell.pilotPreview}
            </div>
            <p className="mt-2 text-sm leading-6 text-[#40504b]">
              {copy.shell.pilotBoundary}
            </p>
          </div>
        </aside>

        <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
