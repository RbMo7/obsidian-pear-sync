import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import { cp, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const prod = process.argv[2] === "production";
const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Plugin bundle (runs in Obsidian / Electron / Node.js) ──────────
async function buildPlugin() {
  const ctx = await esbuild.context({
    entryPoints: ["src/main.ts"],
    bundle: true,
    outfile: "main.js",
    format: "cjs",
    target: "es2020",
    platform: "node",
    external: ["obsidian", "electron", ...builtins],
    logLevel: "info",
    sourcemap: prod ? false : "inline",
    treeShaking: true,
    minify: prod,
  });
  return ctx;
}

async function copyWorkers() {
  // Copy worker source files alongside main.js so PearRuntime can find them.
  // Workers are NOT bundled — Bare resolves imports from node_modules directly.
  const src = join(__dirname, "workers");
  const dest = join(__dirname, "workers");  // same dir during dev

  // In production or for vault install, we'd copy to the plugin dir.
  // During development, workers/ is already in the right place.
  if (!existsSync(dest)) {
    await mkdir(dest, { recursive: true });
  }
}

const ctx = await buildPlugin();

if (prod) {
  await ctx.rebuild();
  await copyWorkers();
  ctx.dispose();
  process.exit(0);
} else {
  await ctx.watch();
}
