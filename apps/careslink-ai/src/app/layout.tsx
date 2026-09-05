import type { Metadata } from "next";
import { Suspense } from "react";
import { DocumentLanguageSync } from "@/components/document-language-sync";
import { SafeVercelAnalytics } from "@/components/safe-vercel-analytics";
import { CARESLINK_AI_NOINDEX_ROBOTS } from "@/lib/seo-policy";
import "./globals.css";

const DOCUMENT_LANGUAGE_BOOTSTRAP = `(() => {
  try {
    const locale = new URLSearchParams(window.location.search).get("lang");
    const pathname = window.location.pathname.replace(/\\/+$/, "");
    const supportedLocales = new Set(
      pathname === "/ai-documents/communication-note"
        ? ["en", "zh-Hans", "zh-Hant"]
        : ["en", "zh-Hans"],
    );
    document.documentElement.lang = supportedLocales.has(locale) ? locale : "en";
  } catch {
    document.documentElement.lang = "en";
  }
})();`;

export const metadata: Metadata = {
  title: {
    default: "CaresLink AI",
    template: "%s | CaresLink AI",
  },
  description:
    "Guided AI documents and referral operations for Australian care providers.",
  robots: CARESLINK_AI_NOINDEX_ROBOTS,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: DOCUMENT_LANGUAGE_BOOTSTRAP }}
        />
      </head>
      <body className="flex min-h-full flex-col">
        <Suspense fallback={null}>
          <DocumentLanguageSync />
        </Suspense>
        {children}
        <SafeVercelAnalytics />
      </body>
    </html>
  );
}
