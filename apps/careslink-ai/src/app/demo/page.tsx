import { ArrowRight, Archive, CircleGauge, LayoutDashboard, Network } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { ButtonLink, Card } from "@/components/ui";

const legacyLinks = [
  {
    href: "/provider-assessment",
    label: "Legacy assessment demo",
    detail:
      "Older readiness flow retained for comparison while the referral workspace is tested.",
  },
  {
    href: "/dashboard",
    label: "Legacy ops dashboard",
    detail:
      "Earlier internal dashboard for referrals, provider records, and pipeline notes.",
  },
  {
    href: "/provider-portal",
    label: "Provider portal demo",
    detail:
      "Older receive-side portal surface with profile and material examples.",
  },
  {
    href: "/referrals",
    label: "Referral board",
    detail:
      "Operational referral list from the earlier demo stack.",
  },
  {
    href: "/providers",
    label: "Legacy provider records",
    detail:
      "Older demo record list kept for internal product review; it is not a public directory or provider endorsement.",
  },
  {
    href: "/referral-source-portal",
    label: "Referral source portal",
    detail:
      "Older send-side referral source surface for comparing workflow direction.",
  },
];

export default function DemoHubPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Legacy demos"
        title="CaresLink demo hub"
        description="The current preview starts with the referral profile workspace. These older surfaces remain available for review, but they are secondary to the v0.1 profile and readiness flow."
        actions={
          <ButtonLink href="/referral-workspace">
            Open v0.1 workspace <ArrowRight className="size-4" />
          </ButtonLink>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
            <LayoutDashboard className="size-5" aria-hidden="true" />
            Primary preview
          </div>
          <h2 className="mt-3 text-xl font-semibold text-[#17211f]">
            Referral Profile Workspace v0.1
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#40504b]">
            The v0.1 workspace shows a free self-submitted profile, referral
            communication readiness signals, locked guided material previews,
            and access-code gated AI drafting.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <ButtonLink href="/referral-workspace">Workspace</ButtonLink>
            <ButtonLink href="/referral-workspace/profile" variant="secondary">
              Profile
            </ButtonLink>
            <ButtonLink href="/referral-workspace/health" variant="secondary">
              Readiness audit
            </ButtonLink>
            <ButtonLink href="/referral-workspace/access" variant="secondary">
              Access
            </ButtonLink>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#925b00]">
            <CircleGauge className="size-5" aria-hidden="true" />
            Boundary
          </div>
          <p className="mt-3 text-sm leading-6 text-[#40504b]">
            CaresLink uses self-submitted profile details to review referral
            communication completeness. The preview does not assess provider
            quality, clinical suitability, compliance status, or service
            outcomes.
          </p>
        </Card>
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
          <Archive className="size-5" aria-hidden="true" />
          Secondary surfaces
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {legacyLinks.map((link) => (
            <Card key={link.href} className="p-4">
              <h3 className="text-base font-semibold text-[#17211f]">
                {link.label}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[#65736f]">
                {link.detail}
              </p>
              <a
                href={link.href}
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#0f766e] hover:text-[#0b5f59]"
              >
                Open surface <ArrowRight className="size-4" aria-hidden="true" />
              </a>
            </Card>
          ))}
        </div>
      </section>

      <Card className="mt-6 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
          <Network className="size-5" aria-hidden="true" />
          Planned workspace links
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <ButtonLink href="/referral-workspace/materials" variant="secondary">
            Materials
          </ButtonLink>
          <ButtonLink href="/admin/access-requests" variant="secondary">
            Access requests
          </ButtonLink>
        </div>
      </Card>
    </AppShell>
  );
}
