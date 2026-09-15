#!/usr/bin/env node
/**
 * Copies the v86 WebAssembly runtime from the installed `v86` npm package into
 * `public/v86/` so the app can run fully self-hosted (no CDN dependency).
 *
 * This is OPTIONAL: by default the app loads `v86.wasm` and the SeaBIOS/VGA
 * BIOS images from jsDelivr at runtime. Run `npm run sync:v86` only if you want
 * fully local artifacts (e.g. offline development or a locked-down CSP).
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = dirname(require.resolve("v86/package.json"));
const outDir = join(root, "public", "v86");
mkdirSync(outDir, { recursive: true });

for (const name of ["v86.wasm", "v86-fallback.wasm"]) {
  copyFileSync(join(pkgDir, "build", name), join(outDir, name));
  console.log(`copied ${name} -> public/v86/${name}`);
}
console.log("Done. Point the app's wasmPath setting at /v86/v86.wasm to use it.");
