export type CaresLinkV1ShadowEnv = {
  CARESLINK_V1_SHADOW_ENABLED?: string;
};

export const CARESLINK_V1_SHADOW_FLAG = "CARESLINK_V1_SHADOW_ENABLED";

export function isCaresLinkV1ShadowEnabled(
  env: CaresLinkV1ShadowEnv = process.env as CaresLinkV1ShadowEnv,
) {
  return env.CARESLINK_V1_SHADOW_ENABLED === "true";
}
