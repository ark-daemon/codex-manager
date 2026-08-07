import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Copy assets/
const sourceAssets = path.join(root, "assets");
const outputAssets = path.join(root, "dist-electron", "assets");
await mkdir(outputAssets, { recursive: true });
await copyFile(path.join(sourceAssets, "icon.png"), path.join(outputAssets, "icon.png"));
await copyFile(path.join(sourceAssets, "tray-icon.png"), path.join(outputAssets, "tray-icon.png"));

// Copy build/
const sourceBuild = path.join(root, "build");
const outputBuild = path.join(root, "dist-electron", "build");
await mkdir(outputBuild, { recursive: true });
await copyFile(path.join(sourceBuild, "icon.ico"), path.join(outputBuild, "icon.ico"));
