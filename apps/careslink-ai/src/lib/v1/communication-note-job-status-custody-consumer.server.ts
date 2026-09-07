import "server-only";

/** Raw credentials enter only the callback. Custody must await exactly one
 * invocation. Late results are disposed after abort/failure; none are cached.
 * Clearing references is not a promise to erase immutable JavaScript strings.
 */
export async function consumeJobStatusCustodyValue<Secret, Value>(input: {
  signal: AbortSignal;
  consume(callback: (secret: Secret) => Promise<void>): Promise<void>;
  use(secret: Secret): Promise<Value>;
  dispose?(value: Value): Promise<void>;
}): Promise<Value> {
  const unavailable = () => new Error("Job status credential custody unavailable");
  let called = false, complete = false, invalid = false, closed = false;
  let result: { value: Value } | undefined;
  const dispose = async () => {
    const owned = result; result = undefined;
    if (owned) await input.dispose?.(owned.value);
  };
  let stop = () => {};
  try {
    if (input.signal.aborted) throw unavailable();
    const pending = input.consume(secret => {
      const consuming = (async () => {
        if (called || closed || input.signal.aborted) { invalid = true; throw unavailable(); }
        called = true;
        result = { value: await input.use(secret) };
        if (closed || input.signal.aborted) { await dispose(); throw unavailable(); }
        complete = true;
      })();
      void consuming.catch(() => {});
      return consuming;
    });
    // A provider may ignore cancellation. Its eventual rejection is observed;
    // callback scope checks prevent late credential use/resource escape.
    void pending.catch(() => {});
    await Promise.race([pending, new Promise<never>((_, reject) => {
      stop = () => reject(unavailable());
      input.signal.addEventListener("abort", stop, { once: true });
      if (input.signal.aborted) stop();
    })]);
    if (!complete || invalid || input.signal.aborted || !result) throw unavailable();
    const value = result.value; result = undefined;
    return value;
  } catch { try { await dispose(); } finally { throw unavailable(); } }
  finally { closed = true; input.signal.removeEventListener("abort", stop); }
}
