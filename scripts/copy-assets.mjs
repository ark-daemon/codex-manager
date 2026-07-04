import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceDir = path.join(root, "assets");
const outputDir = path.join(root, "dist-electron", "assets");

await mkdir(outputDir, { recursive: true });
await copyFile(path.join(sourceDir, "icon.png"), path.join(outputDir, "icon.png"));
await copyFile(path.join(sourceDir, "tray-icon.png"), path.join(outputDir, "tray-icon.png"));
