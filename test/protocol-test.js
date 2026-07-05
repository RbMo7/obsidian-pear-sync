// Test the full NDJSON IPC protocol against the bundled worker.mjs
const PearRuntime = require('pear-runtime')
const path = require('path')

const workerPath = path.join(__dirname, '..', 'worker.mjs')
console.log('Worker bundle path:', workerPath)

let buffer = ''
let passed = 0
let failed = 0

function send(worker, msg) {
  const str = JSON.stringify(msg) + '\n'
  console.log('  →', msg.type, msg.path || '')
  worker.write(str)
}

function check(worker) {
  const lines = buffer.split('\n')
  buffer = lines.pop()

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const msg = JSON.parse(trimmed)
    console.log('  ←', msg.type, msg.path || msg.invite?.slice(0, 20) || '')

    switch (msg.type) {
      case 'error':
        failed++
        console.log('✗ ERROR:', msg.message)
        break

      case 'init-complete':
        passed++
        console.log('✓ INIT — key:', msg.key.slice(0, 16) + '...')
        // Now write a test file
        const testData = Buffer.from('hello from ipc test').toString('base64')
        send(worker, { type: 'upsert-file', path: '/test/hello.md', data: testData })
        break

      case 'upsert-done':
        passed++
        console.log('✓ UPSERT —', msg.path)
        // Request invite
        send(worker, { type: 'get-invite' })
        break

      case 'invite':
        passed++
        console.log('✓ INVITE —', msg.invite)
        // Shutdown
        send(worker, { type: 'shutdown' })
        break

      case 'shutdown-complete':
        passed++
        console.log('✓ SHUTDOWN')
        finish()
        break

      default:
        console.log('? UNEXPECTED:', msg.type)
    }
  }
}

function finish() {
  console.log(`\n---`)
  console.log(`Passed: ${passed}, Failed: ${failed}`)
  process.exit(failed > 0 ? 1 : 0)
}

const worker = PearRuntime.run(workerPath, [])

worker.on('data', (chunk) => {
  buffer += chunk.toString()
  check(worker)
})

worker.on('error', (err) => {
  console.error('Worker error:', err)
  failed++
  finish()
})

// Send init after a short delay to let worker start
setTimeout(() => {
  send(worker, {
    type: 'init',
    seedPhrase: 'test-seed-phrase-42',
    storePath: '/tmp/pear-sync-protocol-test-' + Date.now()
  })
}, 500)

setTimeout(() => {
  console.log('✗ TIMEOUT')
  failed++
  worker.destroy()
  finish()
}, 15000)
