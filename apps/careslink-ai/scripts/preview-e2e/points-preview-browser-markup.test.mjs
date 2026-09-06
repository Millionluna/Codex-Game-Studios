import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pointsPreviewDomProbe as probe } from "./points-preview-browser-checks.mjs";

const state = vi.hoisted(() => ({ points: undefined }));
// Mock external data and the shell, not the Points surface or Documents markup.
// This is a DOM contract test, not evidence of a real cookie/session or browser.
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }) => createElement("main", null, children) }));
vi.mock("@/components/referral-workspace-auth-gate", () => ({ ReferralWorkspaceLoginGate: () => null }));
vi.mock("@/components/generated-draft-delete-button", () => ({ GeneratedDraftDeleteButton: () => null }));
vi.mock("@/lib/points-ui-feature.server", () => ({ isCaresLinkV1PointsUiEnabled: () => true }));
vi.mock("@/lib/v1/points-page-data.server", () => ({ resolveCaresLinkV1PointsPageData: async () => state.points }));
vi.mock("@/lib/referral-workspace-session", () => ({ getWorkspaceAccessGateWithServerSession: async () => ({
  status: "signed_in", source: "supabase", account: { id: "22222222-2222-4222-8222-222222222222", role: "provider" },
}) }));
vi.mock("@/lib/account-credit-store", () => ({ getAccountCreditStore: () => { throw new Error("LEGACY_STORE_MUST_NOT_BE_READ"); } }));
vi.mock("@/lib/generated-material-draft-store", () => ({ getGeneratedMaterialDraftStore: () => ({ listGeneratedMaterialDrafts: async () => [] }) }));
vi.mock("@/lib/communication-note-composer-feature", () => ({ isCommunicationNoteComposerEnabled: () => false }));
vi.mock("@/lib/ndis-case-note-companion", () => ({ parseNdisCaseNoteMaterial: () => { throw new Error("NO_DRAFTS_IN_FIXTURE"); } }));
vi.mock("@/lib/referral-workspace-auth", async () => import("../../src/lib/referral-workspace-auth"));
vi.mock("@/lib/referral-workspace-i18n", async () => import("../../src/lib/referral-workspace-i18n"));

import PointsPage from "../../src/app/plan-and-usage/page";
import DocumentsPage from "../../src/app/ai-documents/page";

const ORIGIN = "https://synthetic-browser-preview.vercel.app";
async function render(Page, path, locale, phase, balance) {
  const element = await Page({ searchParams: Promise.resolve({ lang: locale }) });
  const dom = new JSDOM(`<!doctype html><html lang="${locale}"><body>${renderToStaticMarkup(element)}</body></html>`, {
    url: `${ORIGIN}${path}?lang=${locale}`, runScripts: "outside-only",
  });
  try {
    const args = { origin: ORIGIN, phase, locale, balance };
    return dom.window.eval(`(${probe.toString()})(${JSON.stringify(args)})`);
  } finally { dom.window.close(); }
}

describe("browser probe against real server-component content (external data mocked)", () => {
  beforeEach(() => { state.points = { status: "AVAILABLE", unit: "POINTS", availablePoints: 62,
    reservedPoints: 0, serverTime: "2026-09-07T00:00:00.000Z", contractVersion: "v1" }; });
  it.each(["en", "zh-Hans"])("accepts actual Points and Documents content in %s", async (locale) => {
    expect(await render(PointsPage, "/plan-and-usage", locale, "balance", 62)).toBe(true);
    expect(await render(DocumentsPage, "/ai-documents", locale, "documents")).toBe(true);
  });
  it("rejects a real page rendering the other account's balance", async () => {
    state.points.availablePoints = 7;
    expect(await render(PointsPage, "/plan-and-usage", "en", "balance", 62)).toBe(false);
  });
  it.each(["en", "zh-Hans"])("recognizes actual revoked-session recovery content in %s", async (locale) => {
    state.points = { status: "AUTH_REQUIRED", unit: "POINTS" };
    expect(await render(PointsPage, "/plan-and-usage", locale, "revoked")).toBe(true);
    expect(await render(PointsPage, "/plan-and-usage", locale, "balance", 62)).toBe(false);
  });
  it.each(["NOT_READY", "UNAVAILABLE"])("rejects actual %s content as a balance", async (status) => {
    state.points = { status, unit: "POINTS" };
    expect(await render(PointsPage, "/plan-and-usage", "en", "balance", 62)).toBe(false);
  });
});
