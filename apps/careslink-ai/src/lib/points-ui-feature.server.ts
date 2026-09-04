import "server-only";

export const CARESLINK_V1_POINTS_UI_FEATURE_FLAG =
  "CARESLINK_V1_POINTS_UI_ENABLED" as const;

export type CaresLinkV1PointsUiEnv = Readonly<{
  CARESLINK_V1_POINTS_UI_ENABLED?: string;
}>;

export function isCaresLinkV1PointsUiEnabled(
  env: CaresLinkV1PointsUiEnv = process.env as CaresLinkV1PointsUiEnv,
) {
  return env[CARESLINK_V1_POINTS_UI_FEATURE_FLAG] === "true";
}
