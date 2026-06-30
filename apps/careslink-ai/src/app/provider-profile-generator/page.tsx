import { ArrowRight, ClipboardCheck, FileText, LockKeyhole } from "lucide-react";
import { ButtonLink, Card } from "@/components/ui";
import {
  getLocaleFromSearchParams,
  withLocale,
} from "@/lib/referral-workspace-i18n";

type ProviderProfileGeneratorPageProps = {
  searchParams?: Promise<{ lang?: string | string[] }>;
};

export default async function ProviderProfileGeneratorPage({
  searchParams,
}: ProviderProfileGeneratorPageProps) {
  const params = await searchParams;
  const locale = getLocaleFromSearchParams(params);

  return (
    <main className="min-h-screen bg-[#f7faf8] px-4 py-6 text-[#17211f] sm:px-6 lg:px-8">
      <section className="mx-auto max-w-6xl">
        <a
          href={withLocale("/", locale)}
          className="inline-flex items-center gap-3 text-sm font-semibold text-[#0f766e]"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-[#0f766e] text-xs text-white">
            CL
          </span>
          CaresLink AI
        </a>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0f766e]">
              Public generator
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-normal md:text-5xl">
              Provider Profile Generator
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-[#40504b]">
              Create a free provider profile draft and share card preview before
              opening the logged-in CaresLink AI workspace.
            </p>
            <p className="mt-4 text-sm leading-6 text-[#65736f]">
              不调用 AI，不产生 token 成本。第一版只使用 deterministic
              templates, so public traffic cannot create OpenAI usage.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <ButtonLink href={withLocale("/provider-profile-generator/new", locale)}>
                Start free draft
                <ArrowRight className="size-4" aria-hidden="true" />
              </ButtonLink>
              <ButtonLink href={withLocale("/auth/register", locale)} variant="secondary">
                Save in workspace
              </ButtonLink>
            </div>
          </div>

          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
              <LockKeyhole className="size-5" aria-hidden="true" />
              Public vs workspace boundary
            </div>
            <div className="mt-5 grid gap-3 text-sm leading-6 text-[#40504b]">
              <p>Public site: free draft and share card preview.</p>
              <p>Workspace: login, save profile, readiness diagnosis, access code.</p>
              <p>Guided AI: only after approved access and quota checks.</p>
            </div>
          </Card>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            {
              title: "Profile draft",
              description:
                "Capture entity type, service area, languages, intake, capacity, and referral direction.",
              icon: ClipboardCheck,
            },
            {
              title: "Share card preview",
              description:
                "Preview a concise public-facing card without publishing it yet.",
              icon: FileText,
            },
            {
              title: "Login to continue",
              description:
                "Save, publish, diagnose readiness, and request guided materials in the workspace.",
              icon: LockKeyhole,
            },
          ].map((item) => (
            <Card key={item.title} className="p-5">
              <item.icon className="size-5 text-[#0f766e]" aria-hidden="true" />
              <h2 className="mt-4 text-base font-semibold">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-[#5d6d68]">
                {item.description}
              </p>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
