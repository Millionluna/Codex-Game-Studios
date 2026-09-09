import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { COMMUNICATION_NOTE_REQUEST_DEADLINE_MS, withCommunicationNoteRequestDeadline } from "./communication-note-request-deadline";

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it("does not start work or a timer for an already cancelled page", async () => {
  const parent = new AbortController(), run = vi.fn(); parent.abort();
  await expect(withCommunicationNoteRequestDeadline(parent.signal, run)).rejects.toThrow(/^UNAVAILABLE$/);
  expect(run).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
it("does not start work if the page is cancelled before the operation microtask", async () => {
  const parent = new AbortController(), run = vi.fn();
  const pending = withCommunicationNoteRequestDeadline(parent.signal, run); parent.abort();
  await expect(pending).rejects.toThrow(/^UNAVAILABLE$/);
  expect(run).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
it("settles an in-flight cancellation even when work ignores abort", async () => {
  const parent = new AbortController(), late = deferred<string>();
  const run = vi.fn<(signal: AbortSignal) => Promise<string>>(() => late.promise);
  const pending = withCommunicationNoteRequestDeadline(parent.signal, run);
  const failure = expect(pending).rejects.toThrow(/^UNAVAILABLE$/);
  await Promise.resolve(); parent.abort(); await failure;
  expect(run.mock.calls[0][0].aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
  late.resolve("late result"); await Promise.resolve(); expect(run).toHaveBeenCalledTimes(1);
});
it("observes cancellation triggered synchronously inside the operation", async () => {
  const parent = new AbortController();
  await expect(withCommunicationNoteRequestDeadline(parent.signal, () => {
    parent.abort(); return Promise.resolve("late result");
  })).rejects.toThrow(/^UNAVAILABLE$/);
  expect(vi.getTimerCount()).toBe(0);
});
it.each(["resolve", "reject"] as const)("bounds abort-ignoring work and observes its late %s without retry", async completion => {
  expect(COMMUNICATION_NOTE_REQUEST_DEADLINE_MS).toBe(30_000);
  const parent = new AbortController(), late = deferred<string>();
  const remove = vi.spyOn(parent.signal, "removeEventListener");
  const run = vi.fn<(signal: AbortSignal) => Promise<string>>(() => late.promise);
  const pending = withCommunicationNoteRequestDeadline(parent.signal, run);
  let settled = false;
  void pending.then(() => { settled = true; }, () => { settled = true; });
  const failure = expect(pending).rejects.toThrow(/^UNAVAILABLE$/);
  await vi.advanceTimersByTimeAsync(29_999); expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1); await failure;
  expect(run.mock.calls[0][0]).not.toBe(parent.signal);
  expect(run.mock.calls[0][0].aborted).toBe(true); expect(parent.signal.aborted).toBe(false);
  expect(remove).toHaveBeenCalledWith("abort", expect.any(Function)); expect(vi.getTimerCount()).toBe(0);
  if (completion === "resolve") late.resolve("late result");
  else late.reject(new Error("private late transport failure"));
  await vi.advanceTimersByTimeAsync(30_000); expect(run).toHaveBeenCalledTimes(1);
  // Timeout belongs to the old operation, not to the still-live page.
  await expect(withCommunicationNoteRequestDeadline(parent.signal, async () => "explicit new action")).resolves.toBe("explicit new action");
  expect(vi.getTimerCount()).toBe(0);
});
it.each(["resolve", "reject", "throw"] as const)("cleans the deadline and parent listener on timely %s", async completion => {
  const parent = new AbortController(), failure = new Error("transport failure");
  const add = vi.spyOn(parent.signal, "addEventListener"), remove = vi.spyOn(parent.signal, "removeEventListener");
  const run = vi.fn<(signal: AbortSignal) => Promise<string>>(() => {
    if (completion === "throw") throw failure;
    return completion === "resolve" ? Promise.resolve("value") : Promise.reject(failure);
  });
  const pending = withCommunicationNoteRequestDeadline(parent.signal, run);
  if (completion === "resolve") await expect(pending).resolves.toBe("value");
  else await expect(pending).rejects.toBe(failure);
  expect(remove).toHaveBeenCalledExactlyOnceWith("abort", add.mock.calls[0][1]);
  expect(vi.getTimerCount()).toBe(0);
  parent.abort(); await vi.advanceTimersByTimeAsync(30_000);
  expect(run.mock.calls[0][0].aborted).toBe(false); expect(run).toHaveBeenCalledTimes(1);
});
