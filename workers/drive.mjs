import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'

export class VaultDrive {
  #store = null
  #drive = null
  #ready = false

  constructor(storePath) {
    this.storePath = storePath
  }

  get ready() { return this.#ready }
  get key() { return this.#drive?.key ?? null }
  get discoveryKey() { return this.#drive?.discoveryKey ?? null }

  /**
   * Init as writer (owner of vault).
   * primaryKey is a 32-byte Buffer derived from the seed phrase.
   * Corestore derives all core keypairs from it deterministically —
   * same primaryKey on any device → same drive key → same discoveryKey → peers find each other.
   */
  async initWriter(primaryKey) {
    this.#store = new Corestore(this.storePath, { primaryKey })
    await this.#store.ready()
    this.#drive = new Hyperdrive(this.#store)
    await this.#drive.ready()
    this.#ready = true
  }

  /**
   * Init as reader (joining someone else's vault via their drive public key).
   * No primaryKey — the store is anonymous, drive is opened by remote key.
   */
  async initReader(driveKey) {
    this.#store = new Corestore(this.storePath)
    await this.#store.ready()
    this.#drive = new Hyperdrive(this.#store, driveKey)
    await this.#drive.ready()
    this.#ready = true
  }

  async writeFile(filePath, data) {
    this.#ensureReady()
    await this.#drive.put(normalise(filePath), data)
  }

  async deleteFile(filePath) {
    this.#ensureReady()
    await this.#drive.del(normalise(filePath))
  }

  async readFile(filePath) {
    this.#ensureReady()
    return (await this.#drive.get(normalise(filePath))) ?? null
  }

  async allFilePaths() {
    this.#ensureReady()
    const files = []
    for await (const entry of this.#drive.list('/')) {
      if (entry.type !== 'directory') files.push(entry.key)
    }
    return files
  }

  // Replication happens at corestore level — exposes all cores (drive + blobs)
  replicate(isInitiator, opts) {
    this.#ensureReady()
    return this.#store.replicate(isInitiator, opts)
  }

  async close() {
    try { if (this.#drive) await this.#drive.close() } catch {}
    try { if (this.#store) await this.#store.close() } catch {}
    this.#ready = false
  }

  #ensureReady() {
    if (!this.#ready) throw new Error('VaultDrive not initialised')
  }
}

function normalise(p) {
  let n = p.replace(/\\/g, '/')
  if (!n.startsWith('/')) n = '/' + n
  return n
}
