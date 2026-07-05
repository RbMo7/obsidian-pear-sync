// Standalone test for the new bridge (spawn Bare binary directly)
const path = require("path");
const fs = require("fs");

const pluginDir = path.resolve(__dirname, "..");
const platform = process.platform;
const arch = process.arch;
console.log("Platform:", platform, "Arch:", arch);

const binaryPath = path.join(
  pluginDir,
  "node_modules",
  "bare-sidecar",
  "prebuilds",
  `${platform}-${arch}`,
  arch === "arm64" ? "bare" : "bare"
);
console.log("Binary path:", binaryPath);
console.log("Binary exists:", fs.existsSync(binaryPath));
console.log("Workers path:", path.join(pluginDir, "workers", "main.mjs"));
console.log("Workers exists:", fs.existsSync(path.join(pluginDir, "workers", "main.mjs")));
