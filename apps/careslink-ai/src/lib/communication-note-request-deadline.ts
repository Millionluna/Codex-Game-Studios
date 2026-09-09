export const COMMUNICATION_NOTE_REQUEST_DEADLINE_MS = 30_000;

/** Bound one client request including its response body. Cancellation is not a
 * server rollback: callers must treat an interrupted write as an unknown result.
 * The child signal leaves the page alive to show recovery; the race also settles
 * when a transport ignores abort. This helper never retries the operation. */
export async function withCommunicationNoteRequestDeadline<T>(
  parent: AbortSignal, run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (parent.aborted) throw new Error("UNAVAILABLE");
  const controller = new AbortController();
  const abort = () => controller.abort();
  let rejectCancelled!: (reason: Error) => void;
  const cancelled = new Promise<never>((_resolve, reject) => { rejectCancelled = reject; });
  const onAbort = () => rejectCancelled(new Error("UNAVAILABLE"));
  controller.signal.addEventListener("abort", onAbort, { once: true });
  parent.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, COMMUNICATION_NOTE_REQUEST_DEADLINE_MS);
  try {
    // Defer run until both race participants are observed, including sync throws
    // or a parent abort triggered from inside the operation.
    const result = await Promise.race([Promise.resolve().then(() => {
      if (controller.signal.aborted) throw new Error("UNAVAILABLE");
      return run(controller.signal);
    }), cancelled]);
    if (parent.aborted || controller.signal.aborted) throw new Error("UNAVAILABLE");
    return result;
  } finally {
    clearTimeout(timer);
    parent.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", onAbort);
  }
}
