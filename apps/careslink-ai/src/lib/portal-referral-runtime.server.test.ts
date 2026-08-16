import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CARESLINK_PORTAL_REFERRAL_RUNTIME_IMPLEMENTATION_READY,
  isPortalReferralPreviewTargetAllowed,
  isPortalReferralRuntimeEnabled,
  resolveDefaultPortalReferralApi,
  type PortalReferralRuntimeEnv,
} from "./portal-referral-runtime.server";
import { CARESLINK_PRODUCTION_SUPABASE_REF } from "./v1/ndis-shadow-guard";

const PREVIEW_REF = "abcdefghijklmnop";

function enabledPreviewEnv(
  overrides: Partial<PortalReferralRuntimeEnv> = {},
): PortalReferralRuntimeEnv {
  return {
    VERCEL_ENV: "preview",
    SUPABASE_URL: `https://${PREVIEW_REF}.supabase.co`,
    CARESLINK_PORTAL_REFERRAL_EXPECTED_SUPABASE_REF: PREVIEW_REF,
    CARESLINK_PORTAL_REFERRAL_API_ENABLED: "true",
    CARESLINK_PORTAL_REFERRAL_DURABLE_ADAPTER_ENABLED: "true",
    ...overrides,
  };
}

describe("Portal referral runtime latch", () => {
  it("keeps the compile-time implementation latch closed", () => {
    expect(CARESLINK_PORTAL_REFERRAL_RUNTIME_IMPLEMENTATION_READY).toBe(false);
    expect(isPortalReferralRuntimeEnabled(enabledPreviewEnv())).toBe(false);
  });

  it("requires an exact non-Production Preview target", () => {
    expect(isPortalReferralPreviewTargetAllowed(enabledPreviewEnv())).toBe(true);
    expect(
      isPortalReferralPreviewTargetAllowed(
        enabledPreviewEnv({
          CARESLINK_PORTAL_REFERRAL_EXPECTED_SUPABASE_REF: "differentpreviewref",
        }),
      ),
    ).toBe(false);
    expect(
      isPortalReferralPreviewTargetAllowed(
        enabledPreviewEnv({ VERCEL_ENV: "production" }),
      ),
    ).toBe(false);
    expect(
      isPortalReferralPreviewTargetAllowed(
        enabledPreviewEnv({
          SUPABASE_URL: `https://${CARESLINK_PRODUCTION_SUPABASE_REF}.supabase.co`,
          CARESLINK_PORTAL_REFERRAL_EXPECTED_SUPABASE_REF:
            CARESLINK_PRODUCTION_SUPABASE_REF,
        }),
      ),
    ).toBe(false);
  });

  it("fails closed when either runtime flag or target proof is absent", () => {
    for (const env of [
      enabledPreviewEnv({ CARESLINK_PORTAL_REFERRAL_API_ENABLED: "false" }),
      enabledPreviewEnv({
        CARESLINK_PORTAL_REFERRAL_DURABLE_ADAPTER_ENABLED: "false",
      }),
      enabledPreviewEnv({ VERCEL_ENV: "development" }),
      enabledPreviewEnv({ SUPABASE_URL: undefined }),
      enabledPreviewEnv({
        CARESLINK_PORTAL_REFERRAL_EXPECTED_SUPABASE_REF: undefined,
      }),
    ]) {
      expect(isPortalReferralRuntimeEnabled(env)).toBe(false);
    }
  });

  it("returns disabled without inspecting request content", async () => {
    const text = () => {
      throw new Error("request body must stay opaque");
    };
    const request = {
      method: "POST",
      text,
    } as unknown as Request;

    await expect(
      resolveDefaultPortalReferralApi(request, "CREATE_REFERRAL"),
    ).resolves.toEqual({
      ok: false,
      reason: "capability_disabled",
      status: 503,
    });
  });

  it("does not register a memory or mock runtime fallback", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/portal-referral-runtime.server.ts"),
      "utf8",
    );

    expect(source).not.toContain("createMemoryPortalReferralWorkflow");
    expect(source).not.toContain("mock-data");
    expect(source).not.toContain("memory-contract-only");
  });
});
