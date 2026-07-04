import fs from "node:fs/promises";
import path from "node:path";

const preloadCjs = path.resolve("dist-electron", "electron", "preload.cjs");

try {
  await fs.access(preloadCjs);
} catch {
  console.error("postbuild-electron: preload.cjs is missing — TypeScript compilation may have failed.");
  throw new Error("preload.cjs not found");
}
