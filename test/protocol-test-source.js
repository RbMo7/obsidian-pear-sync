// Test: full IPC protocol against SOURCE worker file (not bundled)
const PearRuntime = require("pear-runtime");
const path = require("path");

const workerPath = path.join(__dirname, "..", "workers", "main.mjs");
console.log("Worker:", workerPath);

let buffer = "";
let passed = 0;
let failed = 0;

function send(worker, msg) {
  console.log("  →", msg.type);
  worker.write(JSON.stringify(msg) + "\n");
}

function check(worker) {
  const lines = buffer.split("\n");
  buffer = lines.pop();

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const msg = JSON.parse(t);
    console.log("  ←", msg.type, msg.key ? msg.key.slice(0, 12) + "..." : "");

    switch (msg.type) {
      case "init-complete":
        passed++;
        console.log("  ✓ INIT — key:", msg.key.slice(0, 16) + "...");
        const data = Buffer.from("hello protocol test").toString("base64");
        send(worker, { type: "upsert-file", path: "/test/protocol.md", data });
        break;

      case "upsert-done":
        passed++;
        console.log("  ✓ UPSERT —", msg.path);
        send(worker, { type: "get-invite" });
        break;

      case "invite":
        passed++;
        console.log("  ✓ INVITE —", msg.invite.slice(0, 24) + "...");
        send(worker, { type: "shutdown" });
        break;

      case "shutdown-complete":
        passed++;
        console.log("  ✓ SHUTDOWN");
        finish();
        break;

      case "error":
        failed++;
        console.log("  ✗ ERROR:", msg.message);
        finish();
        break;

      default:
        console.log("  ? UNKNOWN:", msg.type);
    }
  }
}

function finish() {
  console.log(`\nPassed: ${passed}  Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

const worker = PearRuntime.run(workerPath, []);

worker.on("data", (d) => {
  buffer += d.toString();
  check(worker);
});

worker.on("error", (e) => console.error("  ERR:", e.message));

setTimeout(() => {
  send(worker, {
    type: "init",
    seedPhrase: "protocol-test-seed",
    storePath: "/tmp/pear-protocol-test-" + Date.now(),
  });
}, 500);

setTimeout(() => {
  if (passed === 0) {
    console.log("  ✗ TIMEOUT — no response");
    failed++;
    worker.destroy();
    finish();
  }
}, 15000);
