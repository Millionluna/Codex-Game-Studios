import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

const chunksRoot = join(process.cwd(), ".next/static/chunks");
const buildIdPath = join(process.cwd(), ".next/BUILD_ID");
const forbiddenMarkers = [
  "composition.communication.openai.synthetic-preview.2026-09-01.m1r.v1",
  "SOURCE_PRODUCT_RUNTIME_COMPOSITION_NOT_ACTIVATED",
  "1227ff3dac4283749b62b8af953dea02d51da31f3edc0a9d4c3c62a9a1364af0",
  "M1R_SECRET_SENTINEL_MUST_NEVER_ESCAPE",
  "identities.communication.openai.synthetic-preview.2026-09-01.m1s.v1",
  "SOURCE_PRODUCT_RUNTIME_IDENTITIES_NOT_ACTIVATED",
  "4c33184016b7335e39918715b79351673141c3f41c966b34b5b7a617d0a44db2",
  "M1S_SECRET_SENTINEL_MUST_NEVER_ESCAPE",
  "platform-adapters.communication.openai.synthetic-preview.2026-09-01.m1t.v1",
  "SOURCE_PRODUCT_RUNTIME_PLATFORM_ADAPTERS_NOT_ACTIVATED",
  "0ff4bcf1c82575d037793c344c9679d10b6c8018abd3b0b050d040860100624c",
  "M1T_SECRET_SENTINEL_MUST_NEVER_ESCAPE",
];

if (!existsSync(buildIdPath) || !existsSync(chunksRoot)) {
  throw new Error("M1r/M1s/M1t client-boundary check requires a completed Next.js build");
}

const chunkFiles = walkFiles(chunksRoot).filter((file) =>
  [".js", ".mjs", ".json", ".map"].includes(extname(file)),
);
if (chunkFiles.length === 0) {
  throw new Error("M1r/M1s/M1t client-boundary check found no static chunk files");
}
for (const file of chunkFiles) {
  const source = readFileSync(file, "utf8");
  const marker = forbiddenMarkers.find((candidate) => source.includes(candidate));
  if (marker) {
    throw new Error(`M1r/M1s/M1t server-only marker leaked into client chunk: ${marker}`);
  }
}

process.stdout.write(
  `M1r/M1s/M1t client boundary passed across ${chunkFiles.length} static chunk files.\n`,
);

function walkFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });
}
