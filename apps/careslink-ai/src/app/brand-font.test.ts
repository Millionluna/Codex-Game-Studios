import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("CaresLink AI brand typography", () => {
  it("uses one serif stack for the root, document, sans and mono tokens", () => {
    const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
    const styles = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(layout).not.toContain("next/font/google");
    expect(layout).not.toContain("Geist");
    expect(styles).toContain(
      '--font-brand: "Iowan Old Style", "Palatino Linotype", "Book Antiqua",',
    );
    expect(styles).toContain(
      'Palatino, "Noto Serif SC", "Songti SC", STSong, SimSun, Georgia, serif;',
    );
    expect(styles).toContain("--font-document: var(--font-brand);");
    expect(styles).toContain("--font-sans: var(--font-brand);");
    expect(styles).toContain("--font-mono: var(--font-brand);");

    const explicitFamilies = [...styles.matchAll(/font-family:\s*([^;]+);/g)].map(
      (match) => match[1].trim(),
    );

    expect(explicitFamilies.length).toBeGreaterThan(0);
    expect(explicitFamilies).toEqual(
      expect.arrayContaining(["var(--font-brand)", "var(--font-document)"]),
    );
    expect(
      explicitFamilies.every(
        (family) =>
          family === "var(--font-brand)" || family === "var(--font-document)",
      ),
    ).toBe(true);
  });
});
