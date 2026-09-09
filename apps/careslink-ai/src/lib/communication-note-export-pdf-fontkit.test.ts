import { afterEach, describe, expect, it, vi } from "vitest";
const create = vi.hoisted(() => vi.fn());
vi.mock("fontkit", () => ({ create }));
import { communicationNotePdfFontkit } from "./communication-note-export-pdf-fontkit";
afterEach(() => vi.clearAllMocks());
type TestStream = { on(event: string, listener: (...args: unknown[]) => void): TestStream };

describe("Fontkit 2 subset serialization bridge", () => {
  it("preserves glyph inclusion and emits one encoded chunk before end", async () => {
    const bytes = new Uint8Array([1, 2, 3]), encode = vi.fn(() => bytes), includeGlyph = vi.fn();
    create.mockReturnValueOnce({ createSubset: () => ({ encode, includeGlyph }) });
    const subset = communicationNotePdfFontkit.create(new Uint8Array()).createSubset();
    const data = vi.fn(), end = vi.fn(), error = vi.fn();
    subset.includeGlyph(1); expect(includeGlyph).toHaveBeenCalledWith(1);
    (subset.encodeStream() as unknown as TestStream).on("data", data).on("end", end).on("error", error);
    expect(encode).not.toHaveBeenCalled(); await Promise.resolve();
    expect(data).toHaveBeenCalledExactlyOnceWith(bytes); expect(end).toHaveBeenCalledTimes(1);
    expect(data.mock.invocationCallOrder[0]).toBeLessThan(end.mock.invocationCallOrder[0]); expect(error).not.toHaveBeenCalled();
  });
  it("sends serialization failure to the error listener without a partial chunk or end", async () => {
    const failure = new Error("synthetic");
    create.mockReturnValueOnce({ createSubset: () => ({ encode: () => { throw failure; } }) });
    const data = vi.fn(), end = vi.fn(), error = vi.fn();
    const stream = communicationNotePdfFontkit.create(new Uint8Array()).createSubset().encodeStream() as unknown as TestStream;
    stream.on("data", data).on("end", end).on("error", error);
    await Promise.resolve(); expect(error).toHaveBeenCalledExactlyOnceWith(failure);
    expect(data).not.toHaveBeenCalled(); expect(end).not.toHaveBeenCalled();
  });
  it("rejects a font collection", () => {
    create.mockReturnValueOnce({ fonts: [] });
    expect(() => communicationNotePdfFontkit.create(new Uint8Array())).toThrow("font collections are not supported");
  });
});
