import "server-only";

export const COMMUNICATION_NOTE_WORKSPACE_FEATURE_FLAG = "CARESLINK_COMMUNICATION_NOTE_WORKSPACE_ENABLED" as const;
type WorkspaceEnv = Readonly<{ CARESLINK_COMMUNICATION_NOTE_WORKSPACE_ENABLED?: string }>;

/** UI/routing opt-in only; it never installs a database reader or writer. */
export function isCommunicationNoteWorkspaceEnabled(env: WorkspaceEnv = process.env as WorkspaceEnv) {
  return env[COMMUNICATION_NOTE_WORKSPACE_FEATURE_FLAG] === "true";
}
