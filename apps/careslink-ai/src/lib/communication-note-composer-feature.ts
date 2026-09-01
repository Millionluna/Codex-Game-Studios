export const CARESLINK_COMMUNICATION_NOTE_COMPOSER_FEATURE_FLAG =
  "CARESLINK_COMMUNICATION_NOTE_COMPOSER_ENABLED" as const;

type CommunicationNoteComposerEnv = {
  CARESLINK_COMMUNICATION_NOTE_COMPOSER_ENABLED?: string;
};

export function isCommunicationNoteComposerEnabled(
  env?: CommunicationNoteComposerEnv,
) {
  const value = env
    ? env.CARESLINK_COMMUNICATION_NOTE_COMPOSER_ENABLED
    : process.env.CARESLINK_COMMUNICATION_NOTE_COMPOSER_ENABLED;
  return value === "true";
}
