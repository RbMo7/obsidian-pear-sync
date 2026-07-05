import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'

export class VaultDrive {
  #store
  #drive = null
  #ready = false

  constructor(storePath) {
    this.storePath = storePath
    this.#store = new Corestore(storePath)
  }

  get ready() { return this.#ready }
  get drive() { return this.#drive }
  get key() { return this.#drive?.key ?? null }
  get discoveryKey() { return this.#drive?.discoveryKey ?? null }

  async init(driveKey) {
    await this.#store.ready()

    if (driveKey && typeof driveKey === 'object' && 'publicKey' in driveKey && 'secretKey' in driveKey) {
      // Create the core directly with the full key pair, bypassing hyperdrive's
      // constructor which doesn't forward secretKey to corestore.get().
      // This gives us a deterministic, writable drive from a seed phrase.
      const core = this.#store.get({
        key: driveKey.publicKey,
        publicKey: driveKey.publicKey,
        secretKey: driveKey.secretKey,
        exclusive: true,
      })
      await core.ready()

      // Now we need a Hyperbee on top — import it and create one
      const HyperbeeMod = await import('hyperbee')
      const Hyperbee = HyperbeeMod.default || HyperbeeMod
      const bee = new Hyperbee(core, {
        keyEncoding: 'utf-8',
        valueEncoding: 'json',
        metadata: { contentFeed: null },
      })

      // Create hyperdrive from the pre-made bee via the internal _db option
      this.#drive = new Hyperdrive(this.#store, null, { _db: bee })
      await this.#drive.ready()
    } else if (driveKey && driveKey instanceof Uint8Array) {
      this.#drive = new Hyperdrive(this.#store, driveKey)
      await this.#drive.ready()
    } else {
      this.#drive = new Hyperdrive(this.#store)
      await this.#drive.ready()
    }
    this.#ready = true
  }

  async writeFile(filePath, data) {
    this.#ensureReady()
    const norm = normalise(filePath)
    await this.#drive.put(norm, data)
  }

  async deleteFile(filePath) {
    this.#ensureReady()
    const norm = normalise(filePath)
    await this.#drive.del(norm)
  }

  async readFile(filePath) {
    this.#ensureReady()
    const norm = normalise(filePath)
    return (await this.#drive.get(norm)) ?? null
  }

  async listFiles(prefix = '/') {
    this.#ensureReady()
    const entries = []
    for await (const entry of this.#drive.list(prefix)) {
      entries.push({ path: entry.name, isFolder: entry.type === 'directory' })
    }
    return entries
  }

  async allFilePaths() {
    this.#ensureReady()
    const files = []
    for await (const entry of this.#drive.list('/')) {
      if (entry.type !== 'directory') files.push('/' + entry.name)
    }
    return files
  }

  async getVersion() {
    this.#ensureReady()
    return this.#drive.version
  }

  replicate(isInitiator, opts) {
    this.#ensureReady()
    return this.#drive.replicate(isInitiator, opts)
  }

  async close() {
    try {
      if (this.#drive) await this.#drive.update()
      await this.#store.close()
    } catch {}
    this.#ready = false
  }

  #ensureReady() {
    if (!this.#ready || !this.#drive) {
      throw new Error('VaultDrive not initialised')
    }
  }
}

function normalise(filePath) {
  let norm = filePath.replace(/\\/g, '/')
  if (!norm.startsWith('/')) norm = '/' + norm
  return norm
}
