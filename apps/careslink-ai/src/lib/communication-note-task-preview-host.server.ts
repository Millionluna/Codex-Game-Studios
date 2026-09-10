import "server-only";
import process from "node:process";
import { isMainThread } from "node:worker_threads";
import { createTaskPreviewPgControlOpener } from "./communication-note-task-preview-control.server";
import { createTaskPreviewSqlBroker } from "./communication-note-task-preview-issuer.server";
import { createCommunicationNoteTaskPreviewService } from "./communication-note-task-preview-service.server";

export const COMMUNICATION_NOTE_TASK_PREVIEW_HOST_READY = false as const;
export const TASK_PREVIEW_HOST_EXIT_DEADLINE_MS = 40000;
type Service = ReturnType<typeof createCommunicationNoteTaskPreviewService>;
type ControlOptions = Parameters<typeof createTaskPreviewPgControlOpener>[0];
const unavailable = () => new Error("Task Preview host unavailable");
let processClaimed = false;

/** Explicit task-only custody/CA dependency. Construction performs no IO and
 * does not install a process owner. This does NOT authenticate an injected
 * provider: its workload, task-specific secret policy and CA provenance still
 * need independent approval. Never relabel/reuse job-status custody or fall
 * back to env/ADC. The connector re-attests the branch on every SQL operation.
 */
export function createTaskPreviewCustodiedService(options: ControlOptions): Service {
  const open = createTaskPreviewPgControlOpener(options);
  return createCommunicationNoteTaskPreviewService({ projectRef: options.projectRef,
    broker: createTaskPreviewSqlBroker(open) });
}

/** Explicit ownership of an otherwise dedicated POSIX Node main process.
 * NEVER invoke in Next.js, a shared web process, or a Worker thread. No listener
 * is installed by importing this module. No request transport is installed.
 * A trusted entry point supplies the service; the capability is an accident
 * guard, not authentication. One lifecycle per process; a fresh process must
 * recover the durable epoch before exposing custody after process loss.
 *
 * SIGKILL/host death/event-loop stalls cannot be cleaned up by these handlers.
 * An independent external supervisor must detect them and await actual process
 * closure before starting a successor; this module does not install one.
 */
export function ownTaskPreviewServiceProcess(service: Service,
  capability: "TASK_PREVIEW_DEDICATED_NODE_PROCESS") {
  if (capability !== "TASK_PREVIEW_DEDICATED_NODE_PROCESS" || !isMainThread || process.platform === "win32" ||
      processClaimed || service.health().state !== "NEW" ||
      (typeof process.send === "function" && !process.connected)) throw unavailable();
  processClaimed = true;
  let completed = false, stopping = false;
  // Forced exit is always failure/unknown cleanup; never an acknowledgment.
  let deadline: ReturnType<typeof setTimeout> | undefined = setTimeout(() => process.exit(1), TASK_PREVIEW_HOST_EXIT_DEADLINE_MS);
  const stop = () => {
    if (!completed && !stopping) {
      stopping = true; clearTimeout(deadline);
      deadline = setTimeout(() => process.exit(1), TASK_PREVIEW_HOST_EXIT_DEADLINE_MS);
    }
    return service.stop(); // closes admission synchronously, then joins/drains
  };
  const onStop = () => { void stop(); };
  const hasIpc = typeof process.send === "function";
  process.on("SIGTERM", onStop); process.on("SIGINT", onStop);
  if (hasIpc) process.on("disconnect", onStop);
  const finished = service.finished.then(outcome => {
    completed = true; clearTimeout(deadline); deadline = undefined;
    process.removeListener("SIGTERM", onStop); process.removeListener("SIGINT", onStop);
    if (hasIpc) process.removeListener("disconnect", onStop);
    // Never overwrite an earlier nonzero exit code with a successful drain.
    if (outcome.state !== "STOPPED" || !outcome.cleanupConfirmed) process.exitCode = 1;
    else if (process.exitCode === undefined) process.exitCode = 0;
    // Release only this process's inherited IPC channel, not arbitrary handles.
    if (hasIpc && process.connected) process.disconnect();
    return outcome;
  });
  const ready = service.start().then(() => {
    if (stopping || completed || service.health().state !== "READY") throw unavailable();
    clearTimeout(deadline); deadline = undefined;
  }).catch(async () => {
    await stop(); throw unavailable();
  });
  void ready.catch(() => {}); // owner still receives a rejected ready promise
  return Object.freeze({ ready, finished, stop, custody: service.custody, health: service.health });
}
