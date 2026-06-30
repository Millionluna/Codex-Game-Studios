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
  Send,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  getReferralWorkspaceCopy,
  withLocale,
  type Locale,
} from "@/lib/referral-workspace-i18n";
import type {
  WorkspaceAccountRole,
  WorkspaceSessionSource,
} from "@/lib/referral-workspace-auth";

type PrimaryNavLabel =
  | "workspace"
  | "profile"
  | "health"
  | "materials"
  | "referralPack"
  | "outreach"
  | "accessCode"
  | "accessRequests"
  | "materialUsage";

type LegacyNavLabel =
  | "demoHub"
  | "assessment"
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
  labelKey: LegacyNavLabel;
  icon: LucideIcon;
};

type LocalizedNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const primaryNavItems: PrimaryNavItem[] = [
  { href: "/referral-workspace", labelKey: "workspace", icon: LayoutDashboard },
  {
    href: "/referral-workspace/referral-pack",
    labelKey: "referralPack",
    icon: ClipboardList,
  },
  {
    href: "/referral-workspace/outreach",
    labelKey: "outreach",
    icon: Send,
  },
  {
    href: "/referral-workspace/health",
    labelKey: "health",
    icon: CircleGauge,
  },
  { href: "/referral-workspace/profile", labelKey: "profile", icon: UserRound },
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
  {
    href: "/admin/material-usage",
    labelKey: "materialUsage",
    icon: FileText,
  },
];

const legacyNavItems: LegacyNavItem[] = [
  { href: "/demo", labelKey: "demoHub", icon: Archive },
  {
    href: "/provider-assessment",
    labelKey: "assessment",
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
  workspaceAccountId,
}: {
  label: string;
  items: LocalizedNavItem[];
  locale: Locale;
  workspaceAccountId?: string;
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
            href={withOptionalWorkspaceAccount(
              withLocale(item.href, locale),
              workspaceAccountId,
            )}
            className="group flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:bg-brand-soft hover:text-brand lg:gap-3"
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
  languageSwitcherHref?: string;
  workspaceAccountId?: string;
  workspaceRole?: WorkspaceAccountRole;
  workspaceSessionSource?: Exclude<WorkspaceSessionSource, "none"> | "public";
};

type AppShellCopy = {
  common: {
    previewOnly: string;
    trustBoundary: string;
  };
  shell: {
    brand: string;
    subtitle: string;
    language: string;
    pilotPreview: string;
    pilotBoundary: string;
    primaryNav: Record<PrimaryNavLabel, string>;
    legacyNav: Record<LegacyNavLabel | "groupHeading", string>;
  };
};

export function AppShell({
  children,
  locale = DEFAULT_LOCALE,
  languageSwitcherHref = "/referral-workspace",
  workspaceAccountId,
  workspaceRole,
  workspaceSessionSource = "public",
}: AppShellProps) {
  const copy = getAppShellCopy(locale);
  const isDemoSession = workspaceSessionSource === "demo";
  const showLegacyDemoNav =
    isDemoSession &&
    process.env.NEXT_PUBLIC_CARESLINK_SHOW_LEGACY_DEMO_NAV === "true";
  const effectiveWorkspaceAccountId = isDemoSession
    ? workspaceAccountId
    : undefined;
  const primaryItems = getPrimaryNavItemsForRole(workspaceRole).map((item) => ({
    ...item,
    label: copy.shell.primaryNav[item.labelKey],
  }));
  const legacyItems = legacyNavItems.map((item) => ({
    ...item,
    label: copy.shell.legacyNav[item.labelKey],
  }));

  return (
    <div className="taito-page min-h-screen overflow-x-hidden text-foreground">
      <div className="grid min-h-screen min-w-0 lg:grid-cols-[272px_1fr]">
        <aside className="min-w-0 border-b border-[#ded6c8] bg-white/88 px-4 py-3 backdrop-blur lg:border-b-0 lg:border-r lg:py-4">
          <Link
            href={withOptionalWorkspaceAccount(
              withLocale("/referral-workspace", locale),
              effectiveWorkspaceAccountId,
            )}
            className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-[#f5f1e8]"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#181715] text-sm font-semibold text-white">
              CL
            </span>
            <span className="min-w-0">
              <span className="block truncate text-base font-semibold">
                {copy.shell.brand}
              </span>
              <span className="text-xs text-[#635f57]">
                {copy.shell.subtitle}
              </span>
            </span>
          </Link>

          {primaryItems.length > 0 || showLegacyDemoNav ? (
            <nav className="mt-4 grid max-w-full gap-5 lg:mt-6">
              {primaryItems.length > 0 ? (
                <NavGroup
                  label={
                    isDemoSession
                      ? copy.common.previewOnly
                      : copy.shell.primaryNav.workspace
                  }
                  items={primaryItems}
                  locale={locale}
                  workspaceAccountId={effectiveWorkspaceAccountId}
                />
              ) : null}
              {showLegacyDemoNav ? (
                <NavGroup
                  label={copy.shell.legacyNav.groupHeading}
                  items={legacyItems}
                  locale={locale}
                />
              ) : null}
            </nav>
          ) : null}

          <div className="mt-5 grid gap-2 rounded-lg border border-[#ded6c8] bg-[#faf7f0] p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#635f57]">
              {copy.shell.language}
            </p>
            <div className="flex flex-wrap gap-2">
              {SUPPORTED_LOCALES.map((supportedLocale) => {
                const isActive = supportedLocale === locale;

                return (
                  <Link
                    key={supportedLocale}
                    href={withLocale(languageSwitcherHref, supportedLocale)}
                    aria-current={isActive ? "page" : undefined}
                    className={`inline-flex min-h-9 items-center rounded-md border px-3 text-sm font-semibold transition ${
                      isActive
                        ? "border-[#181715] bg-white text-[#181715]"
                        : "border-[#ded6c8] bg-white text-[#4d4942] hover:border-[#bdb29f] hover:text-[#181715]"
                    }`}
                  >
                    {getAppShellLocaleLabel(supportedLocale)}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-[#ded6c8] bg-[#faf7f0] p-4 shadow-[var(--shadow-sm)] lg:mt-8">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#181715]">
              <ShieldAlert className="size-4" aria-hidden="true" />
              {isDemoSession ? copy.shell.pilotPreview : copy.common.trustBoundary}
            </div>
            <p className="mt-2 text-sm leading-6 text-[#4d4942]">
              {copy.shell.pilotBoundary}
            </p>
          </div>
        </aside>

        <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function getAppShellLocaleLabel(locale: Locale) {
  return locale === "zh-Hans" ? "简体中文" : "English";
}

function getAppShellCopy(locale: Locale): AppShellCopy {
  if (locale === "zh-Hans") {
    return {
      common: {
        previewOnly: "仅预览",
        trustBoundary: "使用边界",
      },
      shell: {
        brand: "CaresLink",
        subtitle: "Referral Pack 工作区",
        language: "语言",
        pilotPreview: "试点预览",
        pilotBoundary:
          "仅用于一般商业资料和运营支持。不提供市场撮合、预约、服务商背书或推荐，也不提供临床、法律、照护、监管或合规建议。",
        primaryNav: {
          workspace: "工作区",
          profile: "资料",
          health: "阻碍",
          materials: "材料",
          referralPack: "材料包",
          outreach: "跟进",
          accessCode: "访问",
          accessRequests: "访问申请",
          materialUsage: "材料使用",
        },
        legacyNav: {
          groupHeading: "旧版演示",
          demoHub: "旧版演示中心",
          assessment: "旧版评估",
          dashboard: "仪表盘",
          referrals: "转介",
          providers: "服务商",
          referralSourcePortal: "转介方入口",
          providerPortal: "服务商入口",
        },
      },
    };
  }

  const fallback = getReferralWorkspaceCopy(locale);

  return {
    common: {
      previewOnly: "Preview only",
      trustBoundary: "Use boundary",
    },
    shell: {
      ...fallback.shell,
      pilotBoundary:
        "General business profile and operational support only. Provider review is required before using any saved profile or material draft.",
    },
  };
}

function getPrimaryNavItemsForRole(
  workspaceRole: WorkspaceAccountRole | undefined,
) {
  if (workspaceRole === "provider") {
    return primaryNavItems.filter((item) =>
      [
        "workspace",
        "profile",
        "health",
        "materials",
        "referralPack",
        "outreach",
        "accessCode",
      ].includes(item.labelKey),
    );
  }

  if (workspaceRole === "admin") {
    return primaryNavItems.filter((item) =>
      ["accessRequests", "materialUsage"].includes(item.labelKey),
    );
  }

  return [];
}

function withOptionalWorkspaceAccount(
  href: string,
  workspaceAccountId: string | undefined,
) {
  const [hrefWithoutHash, hash] = href.split("#", 2);
  const [pathname, query = ""] = hrefWithoutHash.split("?", 2);

  if (!workspaceAccountId || !allowsWorkspaceAccount(pathname)) {
    return href;
  }

  const queryParams = new URLSearchParams(query);

  queryParams.set("account", workspaceAccountId);

  const hrefWithAccount = `${pathname}?${queryParams.toString()}`;

  return hash === undefined ? hrefWithAccount : `${hrefWithAccount}#${hash}`;
}

function allowsWorkspaceAccount(pathname: string) {
  return (
    pathname === "/referral-workspace" ||
    pathname.startsWith("/referral-workspace/") ||
    pathname === "/admin/access-requests" ||
    pathname === "/admin/material-usage"
  );
}
