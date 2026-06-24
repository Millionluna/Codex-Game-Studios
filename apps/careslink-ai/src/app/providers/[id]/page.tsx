import { ArrowLeft, Archive, MessageCircle, Share2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { ShareCardPreview } from "@/components/share-card";
import { ButtonLink, Card } from "@/components/ui";
import { providerProfiles, providers, shareCards } from "@/lib/mock-data";
import type { ProviderStatus } from "@/lib/types";

const demoWorkflowLabels: Record<ProviderStatus, string> = {
  approved: "Demo review recorded",
  pending: "Waiting in demo workflow",
  rejected: "Excluded from demo workflow",
};

const demoInsuranceLabels: Record<"missing" | "uploaded" | "verified", string> = {
  missing: "No demo document noted",
  uploaded: "Demo document uploaded",
  verified: "Demo field marked reviewed",
};

const displayList = (values: string[]) => values.join(", ");

export default async function ProviderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const provider = providers.find((item) => item.id === id) ?? providers[0];
  const profile = providerProfiles.find((item) => item.providerId === provider.id);
  const card = shareCards.find((item) => item.providerId === provider.id) ?? shareCards[0];

  return (
    <AppShell>
      <PageHeader
        eyebrow="Legacy demo record"
        title={provider.name}
        description="This older detail view is retained for internal product review of the demo flow. It is not a marketplace listing, public directory entry, or provider endorsement."
        actions={
          <>
            <ButtonLink href="/providers" variant="secondary">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to legacy records
            </ButtonLink>
            <ButtonLink href="/share-cards">
              <Share2 className="size-4" aria-hidden="true" />
              Preview demo share card
            </ButtonLink>
          </>
        }
      />

      <Card className="mb-5 border-[#f4d28f] bg-[#fffaf0] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <ShieldAlert
            className="mt-0.5 size-5 shrink-0 text-[#925b00]"
            aria-hidden="true"
          />
          <div>
            <h2 className="text-base font-semibold text-[#17211f]">
              Legacy demo boundary
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#40504b]">
              This record is legacy demo data only. It does not assess provider
              quality, service outcomes, compliance status, or clinical
              suitability. Internal workflow labels on this page are demo data
              states, not public provider approvals.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <div className="grid gap-4">
          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1 rounded-md border border-[#c8d5cf] bg-[#eef3f1] px-2 py-1 text-xs font-semibold text-[#40504b]">
                <Archive className="size-3" aria-hidden="true" />
                Legacy demo record
              </span>
              <span className="rounded-md border border-[#c8d5cf] bg-white px-2 py-1 text-xs font-semibold text-[#40504b]">
                {demoWorkflowLabels[provider.status]}
              </span>
              <span className="rounded-md border border-[#c8d5cf] bg-white px-2 py-1 text-xs font-semibold text-[#40504b]">
                {provider.membershipPlan} demo plan
              </span>
            </div>
            <p className="mt-4 text-sm leading-6 text-[#40504b]">{provider.intro}</p>
            <dl className="mt-5 grid gap-4 md:grid-cols-2">
              {[
                ["Service types", displayList(provider.serviceTypes)],
                ["Service areas", displayList(provider.serviceAreas)],
                ["Languages", displayList(provider.languages)],
                ["ABN", provider.abn],
                ["Record source", provider.sourceGroupName],
                ["Entered by", provider.createdBy],
                ["Demo insurance field", demoInsuranceLabels[provider.insuranceStatus]],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-[#f7faf8] p-3">
                  <dt className="text-xs uppercase tracking-[0.12em] text-[#66736f]">
                    {label}
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-[#17211f]">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <MessageCircle className="size-5 text-[#0f766e]" aria-hidden="true" />
              Demo-generated profile draft
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#65736f]">
              Legacy generated text from mock data. Do not use it as provider
              quality, compliance, service, or clinical evidence.
            </p>
            <p className="mt-3 text-sm leading-6 text-[#40504b]">
              {profile?.englishIntro}
            </p>
            <p className="mt-3 text-sm leading-6 text-[#40504b]">
              {profile?.chineseIntro}
            </p>
          </Card>
        </div>

        <ShareCardPreview card={card} provider={provider} />
      </div>

      <Link
        href="/referrals/referral-001/matches"
        className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg border border-[#cfded8] bg-white px-4 text-sm font-semibold"
      >
        View demo referral-match context
      </Link>
    </AppShell>
  );
}
