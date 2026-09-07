import { create } from "fontkit";
import type { Font, Fontkit } from "pdf-lib/es/types/fontkit";

/** pdf-lib expects the older stream-shaped subset API. Fontkit 2 fixes the
 * CJK embedding errors seen with @pdf-lib/fontkit 1.1.1 and exposes encode().
 * Bridge only that serialization surface; never load files or Node streams. */
export const communicationNotePdfFontkit: Fontkit = {
  create(bytes) {
    // Fontkit's browser build accepts Uint8Array; its DefinitelyTyped signature
    // is Node-only. This cast does not create/use a browser Buffer global.
    const font = create(bytes as Parameters<typeof create>[0]);
    if (!("createSubset" in font)) throw new Error("font collections are not supported");
    const createSubset = font.createSubset.bind(font);
    font.createSubset = () => {
      const subset = createSubset();
      return Object.assign(subset, {
        encodeStream() {
          const listeners: Record<string, (value?: unknown) => void> = {};
          const stream = { on(event: string, listener: (value?: unknown) => void) { listeners[event] = listener; return stream; } };
          queueMicrotask(() => {
            try { listeners.data?.(subset.encode()); listeners.end?.(); }
            catch (error) { listeners.error?.(error); }
          });
          return stream;
        },
      });
    };
    // Fontkit 2 keeps the runtime font/glyph contract. The only API change used
    // by pdf-lib is the subset serialization bridge above, tested with real PDFs.
    return font as unknown as Font;
  },
};
