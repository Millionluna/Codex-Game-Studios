import "server-only";
import type { CommunicationNoteWorkspaceRuntime } from "./communication-note-workspace.server";

/** Deliberately absent. Env flags cannot install a connection, caller grant,
 * or runtime. Hosted capability binding needs a separate approved step. */
export const COMMUNICATION_NOTE_WORKSPACE_FORMAL_RUNTIME =
  undefined as CommunicationNoteWorkspaceRuntime | undefined;
