import { VaultDrive } from './drive.mjs'
import { VaultSwarm } from './swarm.mjs'
import { generateInvite } from './pairing.mjs'
import b4a from 'b4a'

let drive = null
let swarm = null
let buffer = ''

// Prevent event-loop exit — Bare exits when nothing is pending.
// The IPC listener should suffice, but a timer guarantees it.
const keepalive = setInterval(() => {}, 30000)

function send(msg) {
  Bare.IPC.write(JSON.stringify(msg) + '\n')
}

async function handleMessage(msg) {
  try {
    switch (msg.type) {

      case 'init': {
        const sodium = await import('sodium-universal')
        const cgh = sodium.default?.crypto_generichash ?? sodium.crypto_generichash
        const csk = sodium.default?.crypto_sign_seed_keypair ?? sodium.crypto_sign_seed_keypair

        // Derive a seed from the phrase, then generate a valid ed25519 key pair
        const seedBuf = b4a.from(msg.seedPhrase, 'utf8')
        const seed = b4a.alloc(32)
        cgh(seed, seedBuf)

        const publicKey = b4a.alloc(32)
        const secretKey = b4a.alloc(64)
        csk(publicKey, secretKey, seed)

        drive = new VaultDrive(msg.storePath)
        await drive.init({ publicKey, secretKey })

        send({
          type: 'init-complete',
          key: b4a.toString(drive.key, 'hex'),
          discoveryKey: b4a.toString(drive.discoveryKey, 'hex')
        })

        // Swarm — start in background for peer discovery
        // This also keeps the event loop alive (Bare exits on idle)
        swarm = new VaultSwarm(drive, (count) => {
          send({ type: 'peer-count', count })
        })
        swarm.start().catch(err => {
          console.error('[pear-sync worker] swarm error:', err)
        })

        break
      }

      case 'upsert-file': {
        if (!drive) { send({ type: 'error', message: 'Not initialised' }); break }
        const dataBuf = b4a.from(msg.data, 'base64')
        await drive.writeFile(msg.path, dataBuf)
        send({ type: 'upsert-done', path: msg.path })
        break
      }

      case 'delete-file': {
        if (!drive) { send({ type: 'error', message: 'Not initialised' }); break }
        await drive.deleteFile(msg.path)
        send({ type: 'delete-done', path: msg.path })
        break
      }

      case 'get-invite': {
        if (!drive?.key) { send({ type: 'error', message: 'Drive not ready' }); break }
        send({ type: 'invite', invite: generateInvite(drive.key) })
        break
      }

      case 'shutdown': {
        if (swarm) await swarm.stop()
        if (drive) await drive.close()
        send({ type: 'shutdown-complete' })
        break
      }

      default:
        send({ type: 'error', message: `Unknown command: ${msg.type}` })
    }
  } catch (err) {
    send({ type: 'error', message: `[${msg.type}] ${err.message}` })
  }
}

Bare.IPC.on('data', (chunk) => {
  buffer += chunk.toString()
  const lines = buffer.split('\n')
  buffer = lines.pop()
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed) handleMessage(JSON.parse(trimmed))
  }
})

Bare.IPC.on('error', (err) => {
  console.error('[pear-sync worker] IPC error:', err)
})
