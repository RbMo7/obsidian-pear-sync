import Hyperswarm from 'hyperswarm'

export class VaultSwarm {
  #swarm = null
  #drive
  #onPeerCount

  constructor(drive, onPeerCount) {
    this.#drive = drive
    this.#onPeerCount = onPeerCount
  }

  get connectedPeers() {
    return this.#swarm?.connections.size ?? 0
  }

  async start() {
    const discoveryKey = this.#drive.discoveryKey
    if (!discoveryKey) throw new Error('Drive not ready — no discovery key')

    this.#swarm = new Hyperswarm()

    this.#swarm.on('connection', (socket, info) => {
      const isInitiator = info.client
      const stream = this.#drive.replicate(isInitiator, { live: true })
      socket.pipe(stream).pipe(socket)

      socket.on('close', () => {
        this.#onPeerCount(this.#swarm?.connections.size ?? 0)
      })

      this.#onPeerCount(this.#swarm.connections.size)
    })

    this.#swarm.on('error', (err) => {
      console.error('[pear-sync worker] Swarm error:', err)
    })

    this.#swarm.join(toBuffer(discoveryKey), { server: true, client: true })

    // Flush with timeout — DHT bootstrap can be slow on first connect
    // but we need it to actually announce/lookup on the DHT.
    try {
      await Promise.race([
        this.#swarm.flush(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('flush timeout')), 10000)
        ),
      ])
    } catch (err) {
      console.error('[pear-sync worker] swarm flush warning:', err.message)
    }
  }

  async stop() {
    if (this.#swarm) {
      try { await this.#swarm.destroy() } catch {}
      this.#swarm = null
    }
    this.#onPeerCount(0)
  }
}

function toBuffer(arr) {
  if (Buffer.isBuffer(arr)) return arr
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength)
}
