// Test: create keyed drive, set key pair on core, then write
import Corestore from "corestore";
import Hyperdrive from "hyperdrive";
import b4a from "b4a";

const storePath = "/tmp/hd-keypair-test-" + Date.now();
Bare.IPC.write("start\n");

try {
  const sodium = await import("sodium-universal");
  const cgh = sodium.default?.crypto_generichash ?? sodium.crypto_generichash;
  const csk = sodium.default?.crypto_sign_seed_keypair ?? sodium.crypto_sign_seed_keypair;

  const seed = b4a.alloc(32);
  cgh(seed, b4a.from("test-seed-42", "utf8"));

  const pk = b4a.alloc(32);
  const sk = b4a.alloc(64);
  csk(pk, sk, seed);

  Bare.IPC.write("pk=" + b4a.toString(pk, "hex").substring(0, 16) + "\n");

  const store = new Corestore(storePath);
  await store.ready();

  // Create drive with public key only (read-only initially)
  const drive = new Hyperdrive(store, pk);
  await drive.ready();
  Bare.IPC.write("drive-ready writable=" + drive.writable + "\n");

  // Set the key pair on the underlying core
  drive.core.setKeyPair({ publicKey: pk, secretKey: sk });
  Bare.IPC.write("keypair-set\n");

  // Now try writing
  await drive.put("/test.md", b4a.from("hello via keypair"));
  Bare.IPC.write("put-ok writable=" + drive.writable + "\n");

  // Read back
  const data = await drive.get("/test.md");
  Bare.IPC.write("get-ok content=" + (data ? b4a.toString(data) : "null") + "\n");

  await drive.close();
  await store.close();
  Bare.IPC.write("done\n");
} catch (err) {
  Bare.IPC.write("fatal: " + err.message + "\n");
}
