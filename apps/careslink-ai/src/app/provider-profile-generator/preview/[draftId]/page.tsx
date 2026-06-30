import type { Metadata } from "next";
import { ArrowRight, CheckCircle2, FileText, ShieldAlert } from "lucide-react";
import { ButtonLink, Card } from "@/components/ui";
import { getSaveDraftHref } from "@/lib/public-provider-profile-generator";
import {
  getProviderDraftStore,
  resolveProviderDraft,
} from "@/lib/provider-draft-store";
import {
  getLocaleFromSearchParams,
  withLocale,
} from "@/lib/referral-workspace-i18n";
import { withWorkspaceAccount } from "@/lib/referral-workspace-auth";
import {
  PROVIDER_GENERATOR_SOURCE,
  withProviderGeneratorHandoff,
} from "@/lib/referral-workspace-handoff";

type ProviderProfileDraftPreviewPageProps = {
  params?: Promise<{ draftId?: string | string[] }>;
  searchParams?: Promise<{
    lang?: string | string[];
    draftPayload?: string | string[];
  }>;
};

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function ProviderProfileDraftPreviewPage({
  params,
  searchParams,
}: ProviderProfileDraftPreviewPageProps) {
  const routeParams = await params;
  const queryParams = await searchParams;
  const locale = getLocaleFromSearchParams(queryParams);
  const draftId = getFirstParam(routeParams?.draftId) ?? "sample-harbour";
  const draftPayload = getFirstParam(queryParams?.draftPayload);
  const resolvedDraft = await resolveProviderDraft({
    draftId,
    draftPayload,
    store: getProviderDraftStore(),
  });
  const draft = resolvedDraft.draft;
  const workspacePreviewHref = withWorkspaceAccount(
    withLocale(
      withProviderGeneratorHandoff(
        "/referral-workspace/profile",
        {
          source: PROVIDER_GENERATOR_SOURCE,
          draftId: draft.id,
        },
        "draftId",
      ),
      locale,
    ),
    "user-free",
  );

  return (
    <main className="min-h-screen bg-[#f7faf8] px-4 py-6 text-[#17211f] sm:px-6 lg:px-8">
      <section className="mx-auto max-w-6xl">
        <a
          href={withLocale("/provider-profile-generator/new", locale)}
          className="text-sm font-semibold text-[#0f766e]"
        >
          Back to generator
        </a>

        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="grid gap-5">
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0f766e]">
                    Draft provider profile
                  </p>
                  <h1 className="mt-3 text-3xl font-semibold">
                    {draft.profile.name}
                  </h1>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-[#40504b]">
                    {draft.profile.summary}
                  </p>
                </div>
                <span className="rounded-md border border-[#f4d28f] bg-[#fff7df] px-2 py-1 text-xs font-semibold text-[#925b00]">
                  Not published
                </span>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <PreviewField label="Entity type" value={draft.profile.entityType} />
                <PreviewField
                  label="Referral direction"
                  value={draft.profile.referralDirection}
                />
                <PreviewField
                  label="Service areas"
                  value={draft.profile.serviceAreas.join(", ")}
                />
                <PreviewField
                  label="Languages"
                  value={draft.profile.languages.join(", ")}
                />
                <PreviewField label="Intake method" value={draft.profile.intakeMethod} />
                <PreviewField
                  label="Capacity"
                  value={draft.profile.capacityStatus}
                />
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
                <ShieldAlert className="size-5" aria-hidden="true" />
                Trust boundary
              </div>
              <p className="mt-3 text-sm leading-6 text-[#40504b]">
                {draft.boundary}
              </p>
            </Card>
          </div>

          <aside className="grid content-start gap-5">
            <Card className="overflow-hidden">
              <div className="bg-[#10211f] p-5 text-white">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#9ed8c9]">
                  <FileText className="size-4" aria-hidden="true" />
                  Share card preview
                </div>
                <h2 className="mt-3 text-xl font-semibold">
                  {draft.shareCard.title}
                </h2>
                <p className="mt-1 text-xs text-[#cde5df]">
                  {draft.shareCard.channel}
                </p>
              </div>
              <div className="p-5">
                <p className="text-sm leading-6 text-[#40504b]">
                  {draft.shareCard.summary}
                </p>
                <div className="mt-4 grid gap-2 text-sm text-[#263834]">
                  <p>
                    <strong>Service areas:</strong>{" "}
                    {draft.profile.serviceAreas.join(", ")}
                  </p>
                  <p>
                    <strong>Languages:</strong>{" "}
                    {draft.profile.languages.join(", ")}
                  </p>
                </div>
                <div className="mt-5 flex items-center gap-2 rounded-lg bg-[#f5fbf8] p-3 text-sm font-semibold text-[#0f766e]">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  {draft.shareCard.cta}
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <h2 className="text-base font-semibold">Continue in CaresLink AI</h2>
              <p className="mt-2 text-sm leading-6 text-[#5d6d68]">
                Save this draft to edit it, run readiness diagnosis, and request
                guided materials access.
              </p>
              <div className="mt-5 grid gap-3">
                <ButtonLink href={getSaveDraftHref(draft.id, locale)}>
                  Create account and save
                  <ArrowRight className="size-4" aria-hidden="true" />
                </ButtonLink>
                <ButtonLink href={workspacePreviewHref} variant="secondary">
                  Open workspace preview
                </ButtonLink>
              </div>
            </Card>
          </aside>
        </div>
      </section>
    </main>
  );
}

function PreviewField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#dce8e2] bg-[#f8fbfa] p-3">
      <p className="text-xs font-semibold text-[#65736f]">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-[#17211f]">
        {value}
      </p>
    </div>
  );
}

function getFirstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
