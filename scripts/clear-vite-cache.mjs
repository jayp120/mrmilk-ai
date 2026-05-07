import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const cacheDir = resolve(process.cwd(), "node_modules", ".vite");

try {
  await rm(cacheDir, { recursive: true, force: true });
  console.log(`[vite-cache] cleared ${cacheDir}`);
} catch (error) {
  console.error(`[vite-cache] failed to clear ${cacheDir}`);
  console.error(error);
  process.exit(1);
}
