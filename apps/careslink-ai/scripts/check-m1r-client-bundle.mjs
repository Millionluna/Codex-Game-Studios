import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

const chunksRoot = join(process.cwd(), ".next/static/chunks");
const buildIdPath = join(process.cwd(), ".next/BUILD_ID");
const forbiddenMarkers = [
  "composition.communication.openai.synthetic-preview.2026-09-01.m1r.v1",
  "SOURCE_PRODUCT_RUNTIME_COMPOSITION_NOT_ACTIVATED",
  "1227ff3dac4283749b62b8af953dea02d51da31f3edc0a9d4c3c62a9a1364af0",
  "M1R_SECRET_SENTINEL_MUST_NEVER_ESCAPE",
  "identities.communication.openai.synthetic-preview.2026-09-01.m1s.v2",
  "SOURCE_PRODUCT_RUNTIME_IDENTITIES_NOT_ACTIVATED",
  "98a25545a0d2998b136453d1703dea747467cd1ebf2f1ba443121125f27df08a",
  "M1S_SECRET_SENTINEL_MUST_NEVER_ESCAPE",
  "platform-adapters.communication.openai.synthetic-preview.2026-09-01.m1t.v2",
  "SOURCE_PRODUCT_RUNTIME_PLATFORM_ADAPTERS_NOT_ACTIVATED",
  "d1cbf263a7c6704f8cf24e58555c24ae2c45f4450b00b37d0f0897ecded76a6d",
  "M1T_SECRET_SENTINEL_MUST_NEVER_ESCAPE",
  "gcp-adapters.communication.openai.synthetic-preview.2026-09-01.m1u.v1",
  "SOURCE_GCP_PROVIDER_ADAPTERS_NOT_ACTIVATED",
  "5a0b358626f1864cd13584e4abadf79254e5d365911b28586666e58a76c76c36",
  "M1U_SECRET_SENTINEL_MUST_NEVER_ESCAPE",
];

if (!existsSync(buildIdPath) || !existsSync(chunksRoot)) {
  throw new Error("M1r/M1s/M1t/M1u client-boundary check requires a completed Next.js build");
}

const chunkFiles = walkFiles(chunksRoot).filter((file) =>
  [".js", ".mjs", ".json", ".map"].includes(extname(file)),
);
if (chunkFiles.length === 0) {
  throw new Error("M1r/M1s/M1t/M1u client-boundary check found no static chunk files");
}
for (const file of chunkFiles) {
  const source = readFileSync(file, "utf8");
  const marker = forbiddenMarkers.find((candidate) => source.includes(candidate));
  if (marker) {
      throw new Error(`M1r/M1s/M1t/M1u server-only marker leaked into client chunk: ${marker}`);
  }
}

process.stdout.write(
  `M1r/M1s/M1t/M1u client boundary passed across ${chunkFiles.length} static chunk files.\n`,
);

function walkFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });
}
