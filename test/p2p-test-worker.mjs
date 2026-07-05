// Test: can the worker import holepunch modules and init a Hyperdrive?
import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import Hyperswarm from 'hyperswarm'
import b4a from 'b4a'

// Corestore stores data in a subdir of the current working dir
// during dev. In production this is set by the plugin.
const storePath = '/tmp/pear-sync-test-' + Date.now()

Bare.IPC.write(JSON.stringify({ type: 'log', msg: 'starting init' }) + '\n')

try {
  const store = new Corestore(storePath)
  await store.ready()
  Bare.IPC.write(JSON.stringify({ type: 'log', msg: 'corestore ready' }) + '\n')

  const drive = new Hyperdrive(store)
  await drive.ready()
  Bare.IPC.write(JSON.stringify({ type: 'log', msg: 'hyperdrive ready' }) + '\n')

  // Write a test file
  await drive.put('/test.txt', b4a.from('hello pear-sync'))
  const data = await drive.get('/test.txt')
  const content = data ? b4a.toString(data) : 'null'

  Bare.IPC.write(JSON.stringify({
    type: 'init-complete',
    key: b4a.toString(drive.key, 'hex'),
    discoveryKey: b4a.toString(drive.discoveryKey, 'hex'),
    testContent: content,
    storePath
  }) + '\n')

  // Test Hyperswarm import (don't actually join — just confirm import works)
  const swarm = new Hyperswarm()
  Bare.IPC.write(JSON.stringify({
    type: 'swarm-created',
    swarmType: typeof swarm
  }) + '\n')
  await swarm.destroy()

  // Cleanup
  await drive.close()
  await store.close()

} catch (err) {
  Bare.IPC.write(JSON.stringify({
    type: 'error',
    message: err.message,
    stack: err.stack
  }) + '\n')
}

// Wait a moment so IPC flushes
setTimeout(() => {}, 100)
