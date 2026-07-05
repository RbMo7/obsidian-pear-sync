// Test: spawn Bare worker directly (no pear-runtime)
const { spawn } = require("child_process");
const path = require("path");

const pluginDir = path.resolve(__dirname, "..");
const bareBinary = path.join(
  pluginDir, "node_modules", "bare-sidecar", "prebuilds",
  "darwin-arm64", "bare"
);
const workerPath = path.join(pluginDir, "workers", "main.mjs");
const storePath = "/tmp/spawn-test-" + Date.now();

console.log("Binary:", bareBinary);
console.log("Worker:", workerPath);

const proc = spawn(bareBinary, [workerPath], {
  stdio: ["pipe", "pipe", "pipe", "overlapped"],
});

const ipc = proc.stdio[3];

// Forward stderr
proc.stderr.on("data", (d) => process.stderr.write("[worker] " + d));

let buf = "";
let passed = 0;

function send(msg) {
  console.log("  →", msg.type);
  ipc.write(JSON.stringify(msg) + "\n");
}

ipc.on("data", (chunk) => {
  buf += chunk.toString();
  const lines = buf.split("\n");
  buf = lines.pop();
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const msg = JSON.parse(t);
    console.log("  ←", msg.type, msg.key ? msg.key.slice(0, 12) + "..." : "");
    switch (msg.type) {
      case "init-complete":
        passed++;
        send({ type: "get-invite" });
        break;
      case "invite":
        passed++;
        console.log("  INVITE:", msg.invite.slice(0, 24) + "...");
        send({ type: "shutdown" });
        break;
      case "shutdown-complete":
        passed++;
        console.log(`\nPassed: ${passed}/3`);
        proc.kill();
        process.exit(0);
        break;
      case "error":
        console.log("  ERROR:", msg.message);
        proc.kill();
        process.exit(1);
        break;
    }
  }
});

setTimeout(() => {
  send({
    type: "init",
    seedPhrase: "spawn-test-seed",
    storePath,
  });
}, 500);

setTimeout(() => {
  console.log("TIMEOUT");
  proc.kill();
  process.exit(1);
}, 15000);
