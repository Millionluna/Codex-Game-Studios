import "next/dist/server/node-environment-baseline";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import { config } from "./proxy";

describe("CaresLink request Proxy matcher", () => {
  it.each([
    "/",
    "/ai-documents",
    "/ai-documents/communication-note",
    "/plan-and-usage",
    "/referral-workspace/profile",
    "/admin/access-requests",
    "/auth/callback?code=redacted",
    "/api/guided-materials/share-card",
    "/api/materials/document.svg",
    "/v1/points/wallet",
    "/v1/files/client.js",
    "/_next/staticky/page",
    "/_next/data/build-id/plan-and-usage.json",
    "/plan-and-usage?_rsc=preview-navigation",
  ])("matches session-bearing route %s", (url) => {
    expect(doesProxyMatch(url)).toBe(true);
  });

  it.each([
    "/_next/static/chunks/app.js",
    "/_next/image?url=%2Fcareslink-hero.png&w=1080&q=75",
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml",
    "/manifest.webmanifest",
    "/careslink-ai-logo.svg",
    "/careslink-hero.png",
    "/fonts/careslink.woff2",
  ])("excludes static asset %s", (url) => {
    expect(doesProxyMatch(url)).toBe(false);
  });
});

function doesProxyMatch(url: string) {
  // Next 16.2.9 still exports the pre-rename helper name even though it tests
  // proxy.ts matcher configuration.
  return unstable_doesMiddlewareMatch({ config, url });
}
