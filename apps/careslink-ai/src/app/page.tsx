import {
  ArrowRight,
  ClipboardCheck,
  FileText,
  KeyRound,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { ButtonLink, Card } from "@/components/ui";
import {
  getLocaleFromSearchParams,
  withLocale,
} from "@/lib/referral-workspace-i18n";

type HomePageProps = {
  searchParams?: Promise<{ lang?: string | string[] }>;
};

const modules = [
  {
    title: "Provider Profile",
    description:
      "Structure provider identity, service area, languages, intake pathway, and referral direction.",
    icon: ClipboardCheck,
  },
  {
    title: "Readiness Diagnosis",
    description:
      "See missing referral communication signals before sharing a profile with referral partners.",
    icon: Sparkles,
  },
  {
    title: "Share Card",
    description:
      "Generate a simple preview card from deterministic templates before saving the profile.",
    icon: FileText,
  },
  {
    title: "Access Code",
    description:
      "Move guided AI materials behind login, review, quota, and access-code controls.",
    icon: KeyRound,
  },
] as const;

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const locale = getLocaleFromSearchParams(params);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <PublicHeader locale={locale} />

      <section className="mx-auto grid min-h-[calc(100svh-76px)] max-w-7xl content-center gap-8 px-4 py-10 sm:px-6 sm:py-12 lg:min-h-[680px] lg:px-8 lg:py-14">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,0.72fr)] lg:items-center">
          <div>
            <p className="text-sm font-semibold text-brand">
              Provider referral workspace
            </p>
            <h1 className="mt-4 max-w-4xl text-balance text-5xl font-semibold leading-[1.02] text-foreground md:text-6xl">
              Build a referral-ready provider profile.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              Create a provider profile and share card in public preview, then
              save it into a logged-in referral readiness workspace.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <ButtonLink href={withLocale("/provider-profile-generator/new", locale)}>
                Create free provider profile
                <ArrowRight className="size-4" aria-hidden="true" />
              </ButtonLink>
              <ButtonLink href={withLocale("/auth/login", locale)} variant="secondary">
                Sign in
              </ButtonLink>
            </div>
          </div>

          <ProductPreviewCard />
        </div>

        <TrustBoundaryCard />
      </section>

      <section className="border-t border-line bg-surface/70 px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
                Funnel
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                One flow from public preview to controlled AI drafting
              </h2>
            </div>
            <a
              href={withLocale("/provider-profile-generator", locale)}
              className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-brand"
            >
              View generator
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {modules.map((module) => (
              <Card key={module.title} className="p-5">
                <module.icon className="size-5 text-brand" aria-hidden="true" />
                <h3 className="mt-4 text-base font-semibold">{module.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {module.description}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function PublicHeader({ locale }: { locale: "en" | "zh-Hans" }) {
  return (
    <header className="border-b border-[#dce8e2] bg-white/90">
      <div className="mx-auto flex min-h-[76px] max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <a href={withLocale("/", locale)} className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-[#0f766e] text-sm font-semibold text-white">
            CL
          </span>
          <span>
            <span className="block text-base font-semibold">CaresLink</span>
            <span className="text-xs text-[#65736f]">Provider growth funnel</span>
          </span>
        </a>
        <nav className="flex flex-wrap items-center gap-3 text-sm font-semibold">
          <a
            href={withLocale("/provider-profile-generator", locale)}
            className="text-[#40504b] hover:text-[#0f766e]"
          >
            Profile generator
          </a>
          <a
            href={withLocale("/auth/register", locale)}
            className="text-[#40504b] hover:text-[#0f766e]"
          >
            Register
          </a>
          <a
            href={withLocale("/auth/login", locale)}
            className="rounded-lg border border-[#cfded8] bg-white px-3 py-2 text-[#263834] hover:bg-[#f0f7f4]"
          >
            Sign in
          </a>
        </nav>
      </div>
    </header>
  );
}

function ProductPreviewCard() {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-[#dce8e2] bg-[#10211f] p-5 text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9ed8c9]">
          Profile preview
        </p>
        <h2 className="mt-2 text-xl font-semibold">Harbour Community Support</h2>
      </div>
      <div className="grid gap-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ["Direction", "Receive + send"],
            ["Area", "Inner West Sydney"],
            ["Languages", "English, Mandarin"],
            ["Status", "Draft preview"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-3">
              <p className="text-xs font-semibold text-[#65736f]">{label}</p>
              <p className="mt-1 text-sm font-semibold text-[#17211f]">
                {value}
              </p>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-[#f4d28f] bg-[#fff7df] p-3 text-sm leading-6 text-[#7a4b00]">
          Free public preview. Save, publish, readiness diagnosis, and guided
          AI materials require login.
        </div>
      </div>
    </Card>
  );
}

function TrustBoundaryCard() {
  return (
    <div className="flex gap-3 rounded-lg border border-[#f4d28f] bg-[#fffaf0] p-4 text-sm leading-6 text-[#40504b]">
      <ShieldAlert className="mt-1 size-5 shrink-0 text-[#925b00]" aria-hidden="true" />
      <p>
        CaresLink does not certify providers, endorse service quality, provide
        clinical advice, provide compliance advice, or guarantee referral
        outcomes.
      </p>
    </div>
  );
}
