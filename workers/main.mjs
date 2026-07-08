import { VaultDrive } from './drive.mjs'
import { VaultSwarm } from './swarm.mjs'
import { generateInvite, parseInvite } from './pairing.mjs'
import b4a from 'b4a'

let drive = null
let swarm = null
let buffer = ''

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

        // Derive 32-byte primaryKey from seed phrase via generic hash (BLAKE2b).
        // Same phrase → same primaryKey → same corestore keypairs → same drive key on any device.
        const primaryKey = b4a.alloc(32)
        cgh(primaryKey, b4a.from(msg.seedPhrase.normalize('NFKC').trim(), 'utf8'))

        drive = new VaultDrive(msg.storePath)

        if (msg.remoteKey) {
          // Reader mode: joining another device's vault
          const remoteKeyBuf = b4a.from(msg.remoteKey, 'hex')
          await drive.initReader(remoteKeyBuf)
        } else {
          // Writer mode: this device owns the vault
          await drive.initWriter(primaryKey)
        }

        send({
          type: 'init-complete',
          key: b4a.toString(drive.key, 'hex'),
          discoveryKey: b4a.toString(drive.discoveryKey, 'hex')
        })

        swarm = new VaultSwarm(drive, (count) => {
          send({ type: 'peer-count', count })
        })
        swarm.start().catch(err => {
          send({ type: 'error', message: 'swarm: ' + err.message })
        })

        break
      }

      case 'upsert-file': {
        if (!drive) { send({ type: 'error', message: 'Not initialised' }); break }
        await drive.writeFile(msg.path, b4a.from(msg.data, 'base64'))
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
        clearInterval(keepalive)
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
