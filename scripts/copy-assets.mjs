import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const sourceAssets = path.join(root, "assets");
const outputAssets = path.join(root, "dist-electron", "assets");
await mkdir(outputAssets, { recursive: true });

async function safeCopy(filename) {
  try {
    const src = path.join(sourceAssets, filename);
    const dst = path.join(outputAssets, filename);
    await copyFile(src, dst);
  } catch {
    // Ignore missing optional assets
  }
}

await safeCopy("app-icon.ico");
await safeCopy("app-icon.icns");
await safeCopy("tray-icon-16.png");
await safeCopy("tray-icon-16x16.png");
await safeCopy("tray-icon-32.png");
await safeCopy("tray-icon-32x32.png");
await safeCopy("icon.png");
await safeCopy("tray-icon.png");
await safeCopy("notification-icon.png");

// Copy build/
const sourceBuild = path.join(root, "build");
const outputBuild = path.join(root, "dist-electron", "build");
await mkdir(outputBuild, { recursive: true });

async function safeCopyBuild(filename) {
  try {
    const src = path.join(sourceBuild, filename);
    const dst = path.join(outputBuild, filename);
    await copyFile(src, dst);
  } catch {
    // Ignore
  }
}

await safeCopyBuild("icon.ico");
await safeCopyBuild("icon.icns");
await safeCopyBuild("icon.png");
