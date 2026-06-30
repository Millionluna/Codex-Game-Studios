import { ArrowRight, ClipboardCheck, Languages, MapPin } from "lucide-react";
import {
  ButtonLink,
  Card,
  FieldLabel,
  SelectInput,
  TextArea,
  TextInput,
} from "@/components/ui";
import {
  getLocaleFromSearchParams,
  withLocale,
} from "@/lib/referral-workspace-i18n";
import {
  getPublicProviderDraft,
  getPublicProviderDraftPreviewHref,
  getSaveDraftHref,
} from "@/lib/public-provider-profile-generator";

type NewProviderProfileDraftPageProps = {
  searchParams?: Promise<{ lang?: string | string[] }>;
};

export default async function NewProviderProfileDraftPage({
  searchParams,
}: NewProviderProfileDraftPageProps) {
  const params = await searchParams;
  const locale = getLocaleFromSearchParams(params);
  const draft = getPublicProviderDraft("riverside-care-navigation");
  const previewHref = getPublicProviderDraftPreviewHref(draft.id, locale);
  const saveDraftHref = getSaveDraftHref(draft.id, locale);

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <section className="mx-auto max-w-6xl">
        <a
          href={withLocale("/provider-profile-generator", locale)}
          className="text-sm font-semibold text-[#0f766e]"
        >
          CaresLink AI / Provider Profile Generator
        </a>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="p-6 shadow-[var(--shadow-md)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
                  <ClipboardCheck className="size-5" aria-hidden="true" />
                  Public draft
                </div>
                <h1 className="mt-3 text-3xl font-semibold">
                  Create a free provider profile draft
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-[#5d6d68]">
                  This anonymous first version uses a deterministic mock
                  provider profile. It does not save data or call AI until the
                  provider signs in.
                </p>
              </div>
              <span className="rounded-md border border-[#f4d28f] bg-[#fff7df] px-2 py-1 text-xs font-semibold text-[#925b00]">
                No AI cost
              </span>
            </div>

            <form className="mt-6 grid gap-5">
              <div className="grid gap-4 md:grid-cols-2">
                <FieldLabel>
                  <span>Provider name</span>
                  <TextInput defaultValue={draft.profile.name} readOnly />
                </FieldLabel>
                <FieldLabel>
                  <span>Entity type</span>
                  <SelectInput defaultValue={draft.profile.entityType} disabled>
                    <option value="organisation">Organisation</option>
                    <option value="individual">Individual</option>
                  </SelectInput>
                </FieldLabel>
                <FieldLabel>
                  <span>Referral direction</span>
                  <SelectInput
                    defaultValue={draft.profile.referralDirection}
                    disabled
                  >
                    <option value="receive">Receive referrals</option>
                    <option value="send">Send referrals</option>
                    <option value="both">Receive and send referrals</option>
                  </SelectInput>
                </FieldLabel>
                <FieldLabel>
                  <span>Service areas</span>
                  <TextInput
                    defaultValue={draft.profile.serviceAreas.join(", ")}
                    readOnly
                  />
                </FieldLabel>
                <FieldLabel>
                  <span>Languages</span>
                  <TextInput
                    defaultValue={draft.profile.languages.join(", ")}
                    readOnly
                  />
                </FieldLabel>
                <FieldLabel>
                  <span>Intake method</span>
                  <TextInput
                    defaultValue={draft.profile.intakeMethod}
                    readOnly
                  />
                </FieldLabel>
              </div>

              <FieldLabel>
                <span>Profile summary</span>
                <TextArea
                  defaultValue={draft.profile.summary}
                  readOnly
                />
              </FieldLabel>

              <div className="flex flex-wrap gap-3">
                <ButtonLink href={previewHref}>
                  Generate preview
                  <ArrowRight className="size-4" aria-hidden="true" />
                </ButtonLink>
                <ButtonLink href={saveDraftHref} variant="secondary">
                  Save after login
                </ButtonLink>
              </div>
            </form>
          </Card>

          <aside className="grid content-start gap-4">
            <Card className="p-5">
              <MapPin className="size-5 text-brand" aria-hidden="true" />
              <h2 className="mt-3 text-base font-semibold">Public preview only</h2>
              <p className="mt-2 text-sm leading-6 text-[#5d6d68]">
                The draft is not published. Save it after login before using it
                in the referral workspace.
              </p>
            </Card>
            <Card className="p-5">
              <Languages className="size-5 text-[#19518d]" aria-hidden="true" />
              <h2 className="mt-3 text-base font-semibold">Bilingual materials later</h2>
              <p className="mt-2 text-sm leading-6 text-[#5d6d68]">
                Guided AI generation stays behind account, access-code, and
                quota checks.
              </p>
            </Card>
          </aside>
        </div>
      </section>
    </main>
  );
}
