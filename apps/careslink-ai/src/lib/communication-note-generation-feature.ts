export const CARESLINK_COMMUNICATION_NOTE_GENERATION_API_FEATURE_FLAG =
  "CARESLINK_COMMUNICATION_NOTE_GENERATION_API_ENABLED" as const;
export const CARESLINK_COMMUNICATION_NOTE_GENERATION_UI_FEATURE_FLAG =
  "CARESLINK_COMMUNICATION_NOTE_GENERATION_UI_ENABLED" as const;

/**
 * Compile-time activation latch. The HTTP boundary may exist in source while
 * the durable admission, payload-vault, Points and worker runtime remain
 * unavailable.
 */
export const CARESLINK_COMMUNICATION_NOTE_GENERATION_API_READY = false as const;
/** Independent compile-time consent gate for sending reviewed facts from UI. */
export const CARESLINK_COMMUNICATION_NOTE_GENERATION_UI_READY = false as const;

export type CommunicationNoteGenerationApiEnv = {
  CARESLINK_COMMUNICATION_NOTE_GENERATION_API_ENABLED?: string;
  CARESLINK_COMMUNICATION_NOTE_GENERATION_UI_ENABLED?: string;
};

export function isCommunicationNoteGenerationApiConfigured(
  env: CommunicationNoteGenerationApiEnv =
    process.env as CommunicationNoteGenerationApiEnv,
) {
  return env.CARESLINK_COMMUNICATION_NOTE_GENERATION_API_ENABLED === "true";
}

export function isCommunicationNoteGenerationApiEnabled(
  env: CommunicationNoteGenerationApiEnv =
    process.env as CommunicationNoteGenerationApiEnv,
) {
  const runtimeReady: boolean =
    CARESLINK_COMMUNICATION_NOTE_GENERATION_API_READY;
  return runtimeReady && isCommunicationNoteGenerationApiConfigured(env);
}

export function isCommunicationNoteGenerationUiEnabled(
  env: CommunicationNoteGenerationApiEnv =
    process.env as CommunicationNoteGenerationApiEnv,
) {
  const uiReady: boolean = CARESLINK_COMMUNICATION_NOTE_GENERATION_UI_READY;
  return (
    uiReady &&
    env.CARESLINK_COMMUNICATION_NOTE_GENERATION_UI_ENABLED === "true" &&
    isCommunicationNoteGenerationApiEnabled(env)
  );
}
