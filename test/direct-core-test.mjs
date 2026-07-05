// Test: corestore.get with key + secretKey (NO name)
import Corestore from "corestore";
import b4a from "b4a";

const storePath = "/tmp/hd-corekey-test-" + Date.now();
Bare.IPC.write("start\n");

try {
  const sodium = await import("sodium-universal");
  const cgh = sodium.default?.crypto_generichash ?? sodium.crypto_generichash;
  const csk = sodium.default?.crypto_sign_seed_keypair ?? sodium.crypto_sign_seed_keypair;

  const seed = b4a.alloc(32);
  cgh(seed, b4a.from("test-seed", "utf8"));
  const pk = b4a.alloc(32);
  const sk = b4a.alloc(64);
  csk(pk, sk, seed);

  const store = new Corestore(storePath);
  await store.ready();

  const core = store.get({ key: pk, publicKey: pk, secretKey: sk, exclusive: true });
  await core.ready();
  Bare.IPC.write("ready writable=" + core.writable + "\n");

  if (core.writable) {
    await core.append(b4a.from("hello from keyed core"));
    Bare.IPC.write("append-ok len=" + core.length + "\n");
    const data = await core.get(0);
    Bare.IPC.write("get-ok data=" + (data ? b4a.toString(data) : "null") + "\n");
  } else {
    Bare.IPC.write("not writable\n");
  }

  Bare.IPC.write("done\n");
} catch (err) {
  Bare.IPC.write("fatal: " + err.message + "\n");
}
