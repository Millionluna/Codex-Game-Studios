import { redirect } from "next/navigation";
import {
  getLocaleFromSearchParams,
  withLocale,
} from "@/lib/referral-workspace-i18n";

type HomePageProps = {
  searchParams: Promise<{ lang?: string | string[] }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const locale = getLocaleFromSearchParams(params);

  redirect(withLocale("/referral-workspace", locale));
}
