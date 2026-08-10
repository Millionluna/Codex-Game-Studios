import { describe, expect, it } from "vitest";
import {
  CARESLINK_PRODUCTION_SUPABASE_REF,
  getCaresLinkV1NdisShadowTimeoutMs,
  resolveCaresLinkV1NdisShadowGuard,
} from "./ndis-shadow-guard";

const branchRef = "jtkicyqwdabhjzhdutve";

function enabledEnv() {
  return {
    VERCEL_ENV: "preview",
    CARESLINK_V1_SHADOW_ENABLED: "true",
    CARESLINK_V1_NDIS_DUAL_WRITE_ENABLED: "true",
    CARESLINK_V1_NDIS_SHADOW_READ_ENABLED: "true",
    CARESLINK_V1_SHADOW_EXPECTED_SUPABASE_REF: branchRef,
    SUPABASE_URL: `https://${branchRef}.supabase.co`,
  };
}

describe("NDIS shadow runtime guard", () => {
  it("enables dual-write and read only for an explicitly matched Preview branch", () => {
    expect(resolveCaresLinkV1NdisShadowGuard(enabledEnv())).toEqual({
      enabled: true,
      dualWriteEnabled: true,
      shadowReadEnabled: true,
      targetSupabaseRef: branchRef,
      reason: "enabled",
    });
  });

  it.each([
    [{ ...enabledEnv(), VERCEL_ENV: "production" }, "production_environment"],
    [{ ...enabledEnv(), VERCEL_ENV: undefined }, "non_preview_environment"],
    [
      { ...enabledEnv(), CARESLINK_V1_SHADOW_ENABLED: "false" },
      "master_disabled",
    ],
    [
      {
        ...enabledEnv(),
        CARESLINK_V1_NDIS_DUAL_WRITE_ENABLED: "false",
      },
      "dual_write_disabled",
    ],
    [
      {
        ...enabledEnv(),
        CARESLINK_V1_SHADOW_EXPECTED_SUPABASE_REF: "anotherbranchref12345",
      },
      "target_unverified",
    ],
  ])("fails closed for %o", (env, reason) => {
    expect(resolveCaresLinkV1NdisShadowGuard(env)).toMatchObject({
      enabled: false,
      dualWriteEnabled: false,
      shadowReadEnabled: false,
      reason,
    });
  });

  it("denies the known Production Supabase ref even in a misconfigured Preview", () => {
    expect(
      resolveCaresLinkV1NdisShadowGuard({
        ...enabledEnv(),
        CARESLINK_V1_SHADOW_EXPECTED_SUPABASE_REF:
          CARESLINK_PRODUCTION_SUPABASE_REF,
        SUPABASE_URL: `https://${CARESLINK_PRODUCTION_SUPABASE_REF}.supabase.co`,
      }),
    ).toMatchObject({
      enabled: false,
      reason: "production_target_denied",
    });
  });

  it("does not enable shadow-read independently of dual-write", () => {
    expect(
      resolveCaresLinkV1NdisShadowGuard({
        ...enabledEnv(),
        CARESLINK_V1_NDIS_DUAL_WRITE_ENABLED: "false",
        CARESLINK_V1_NDIS_SHADOW_READ_ENABLED: "true",
      }),
    ).toMatchObject({
      enabled: false,
      shadowReadEnabled: false,
    });
  });

  it("clamps the server-only timeout", () => {
    expect(getCaresLinkV1NdisShadowTimeoutMs({})).toBe(1_500);
    expect(
      getCaresLinkV1NdisShadowTimeoutMs({
        CARESLINK_V1_NDIS_SHADOW_TIMEOUT_MS: "1",
      }),
    ).toBe(250);
    expect(
      getCaresLinkV1NdisShadowTimeoutMs({
        CARESLINK_V1_NDIS_SHADOW_TIMEOUT_MS: "99999",
      }),
    ).toBe(5_000);
  });
});
