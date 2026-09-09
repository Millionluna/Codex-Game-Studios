import { describe, expect, it, vi } from "vitest";
import { consumeJobStatusCustodyValue } from "./communication-note-job-status-custody-consumer.server";
vi.mock("server-only", () => ({}));

function harness() {
  const controller = new AbortController();
  const use = vi.fn(async (secret: string) => { void secret; return "RESOURCE"; });
  const dispose = vi.fn(async (resource: string) => { void resource; });
  const consume = vi.fn(async (callback: (secret: string) => Promise<void>) => { await callback("SYNTHETIC_SECRET"); });
  return { controller, input: { signal: controller.signal, consume, use, dispose } };
}
describe("single callback custody resource ownership", () => {
  it("returns only the used result after custody successfully finishes", async () => {
    const { input } = harness();
    await expect(consumeJobStatusCustodyValue(input)).resolves.toBe("RESOURCE");
    expect(input.use).toHaveBeenCalledOnce(); expect(input.dispose).not.toHaveBeenCalled();
  });
  it("denies zero callbacks", async () => {
    const { input } = harness(); input.consume.mockImplementation(async () => {});
    await expect(consumeJobStatusCustodyValue(input)).rejects.toThrow("Job status credential custody unavailable");
    expect(input.use).not.toHaveBeenCalled();
  });
  it("denies swallowed duplicate callbacks and disposes the first result", async () => {
    const { input } = harness(); input.consume.mockImplementation(async callback => {
      await callback("FIRST"); await callback("SECOND").catch(() => {});
    });
    await expect(consumeJobStatusCustodyValue(input)).rejects.toThrow();
    expect(input.use).toHaveBeenCalledOnce(); expect(input.dispose).toHaveBeenCalledExactlyOnceWith("RESOURCE");
  });
  it("disposes a connection if custody fails after callback completion", async () => {
    const { input } = harness(); input.consume.mockImplementation(async callback => {
      await callback("SECRET"); throw new Error("PRIVATE_PROVIDER_ERROR");
    });
    await expect(consumeJobStatusCustodyValue(input)).rejects.toThrow("Job status credential custody unavailable");
    expect(input.dispose).toHaveBeenCalledExactlyOnceWith("RESOURCE");
  });
  it("does no secret work if already aborted", async () => {
    const { input, controller } = harness(); controller.abort();
    await expect(consumeJobStatusCustodyValue(input)).rejects.toThrow(); expect(input.consume).not.toHaveBeenCalled();
  });
  it("rejects late credential delivery after an uncooperative custody call is aborted", async () => {
    const { input, controller } = harness(); let deliver!: (secret: string) => Promise<void>;
    input.consume.mockImplementation(async callback => { deliver = callback; await new Promise(() => {}); });
    const pending = consumeJobStatusCustodyValue(input); controller.abort(); await expect(pending).rejects.toThrow();
    await expect(deliver("LATE_SECRET")).rejects.toThrow(); expect(input.use).not.toHaveBeenCalled();
  });
  it.each(["abort", "unawaited"])("closes a late physical result after %s", async mode => {
    const { input, controller } = harness(); let finish!: (value: string) => void;
    input.use.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    if (mode === "unawaited") input.consume.mockImplementation(async callback => { void callback("SECRET"); });
    const pending = consumeJobStatusCustodyValue(input);
    if (mode === "abort") controller.abort();
    await expect(pending).rejects.toThrow(); finish("LATE_RESOURCE");
    await vi.waitFor(() => expect(input.dispose).toHaveBeenCalledExactlyOnceWith("LATE_RESOURCE"));
  });
});
