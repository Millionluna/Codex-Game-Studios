import "server-only";
import { createCommunicationNoteWorkspacePreviewRuntime, type CommunicationNoteWorkspacePreviewBinding } from "./communication-note-workspace-preview.server";
import type { CommunicationNoteWorkspaceDurableEnv } from "./communication-note-workspace-durable.server";

/** Deliberately absent. A trusted Hosted custody installation and its target
 * grants require separate approval/evidence. Env cannot supply this binding. */
const HOSTED_WORKSPACE_READ_BINDING = undefined as CommunicationNoteWorkspacePreviewBinding | undefined;
export const COMMUNICATION_NOTE_WORKSPACE_FORMAL_RUNTIME =
  createCommunicationNoteWorkspacePreviewRuntime({ env: process.env as CommunicationNoteWorkspaceDurableEnv, binding: HOSTED_WORKSPACE_READ_BINDING });
