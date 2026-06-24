import { Archive, Filter, Search, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { ProviderCard } from "@/components/provider-card";
import { Card, SelectInput, TextInput } from "@/components/ui";
import { providers } from "@/lib/mock-data";

export default function ProviderDirectoryPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Legacy demo records"
        title="Legacy provider records"
        description="This older record view is retained for internal product review of the demo flow. It is not a marketplace, public provider directory, or provider endorsement."
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
              These are legacy demo records only. This page is not a public
              provider directory, provider endorsement, quality assessment,
              service assessment, compliance assessment, or clinical
              suitability assessment. CaresLink does not assess provider
              quality on this surface.
            </p>
          </div>
        </div>
      </Card>

      <Card className="mb-5 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#40504b]">
          <Archive className="size-4" aria-hidden="true" />
          Internal demo record filters
        </div>
        <div className="grid gap-3 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 size-4 text-[#66736f]" />
            <TextInput
              className="pl-9"
              placeholder="Search legacy records, services, or areas"
            />
          </label>
          <SelectInput defaultValue="all">
            <option value="all">All demo areas</option>
            <option>Sydney</option>
            <option>Parramatta</option>
            <option>Blacktown</option>
          </SelectInput>
          <SelectInput defaultValue="all">
            <option value="all">All demo services</option>
            <option>Support Coordination</option>
            <option>Personal Care</option>
            <option>Occupational Therapy</option>
          </SelectInput>
          <SelectInput defaultValue="all">
            <option value="all">All internal workflow states</option>
            <option>Demo review recorded</option>
            <option>Waiting in demo workflow</option>
            <option>Excluded from demo workflow</option>
          </SelectInput>
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#cfded8] bg-white px-3 text-sm font-semibold">
            <Filter className="size-4" aria-hidden="true" />
            More filters
          </button>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {providers.map((provider) => (
          <ProviderCard key={provider.id} provider={provider} />
        ))}
      </div>
    </AppShell>
  );
}
