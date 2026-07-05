// Test: hyperdrive with explicit key pair — can we write?
import Corestore from "corestore";
import Hyperdrive from "hyperdrive";
import b4a from "b4a";

const storePath = "/tmp/hd-key-test-" + Date.now();
Bare.IPC.write("start\n");

try {
  const sodium = await import("sodium-universal");
  const csk = sodium.default?.crypto_sign_seed_keypair ?? sodium.crypto_sign_seed_keypair;
  const cgh = sodium.default?.crypto_generichash ?? sodium.crypto_generichash;

  const seed = b4a.alloc(32);
  cgh(seed, b4a.from("test-seed", "utf8"));

  const pk = b4a.alloc(32);
  const sk = b4a.alloc(64);
  csk(pk, sk, seed);

  Bare.IPC.write("keys pk=" + b4a.toString(pk, "hex").substring(0, 16) + "\n");

  const store = new Corestore(storePath);
  await store.ready();
  Bare.IPC.write("store-ready\n");

  try {
    const drive = new Hyperdrive(store, pk, { secretKey: sk });
    await drive.ready();
    Bare.IPC.write("drive-ready\n");
    await drive.put("/t.md", b4a.from("test"));
    Bare.IPC.write("drive-put-ok\n");
    const data = await drive.get("/t.md");
    Bare.IPC.write("drive-get-ok content=" + (data ? b4a.toString(data) : "null") + "\n");
  } catch (e) {
    Bare.IPC.write("error: " + e.message + "\n");
  }

  Bare.IPC.write("done\n");
} catch (err) {
  Bare.IPC.write("fatal: " + err.message + "\n");
}
