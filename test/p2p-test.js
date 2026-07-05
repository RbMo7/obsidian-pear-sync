// Test: can the worker import and run hyperdrive + hyperswarm?
const PearRuntime = require('pear-runtime')
const path = require('path')

const workerPath = path.join(__dirname, 'p2p-test-worker.mjs')
console.log('Worker path:', workerPath)

let buffer = ''
let passed = 0
let failed = 0

function check() {
  const lines = buffer.split('\n')
  buffer = lines.pop()

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const msg = JSON.parse(trimmed)
    console.log('  ←', msg.type, msg.msg || '')

    switch (msg.type) {
      case 'log':
        console.log('  [worker]', msg.msg)
        break
      case 'init-complete':
        passed++
        console.log('✓ DRIVE INIT OK')
        console.log('  key:', msg.key.slice(0, 16) + '...')
        console.log('  discoveryKey:', msg.discoveryKey.slice(0, 16) + '...')
        console.log('  testContent:', msg.testContent)
        console.log('  storePath:', msg.storePath)
        if (msg.testContent === 'hello pear-sync') {
          passed++
          console.log('✓ READBACK OK')
        } else {
          failed++
          console.log('✗ READBACK MISMATCH:', msg.testContent)
        }
        break
      case 'swarm-created':
        passed++
        console.log('✓ HYPERSWARM IMPORT OK')
        finish()
        break
      case 'error':
        failed++
        console.log('✗ ERROR:', msg.message)
        console.log('  stack:', msg.stack)
        finish()
        break
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
  check()
})

worker.on('error', (err) => {
  console.error('Worker error:', err)
  failed++
  finish()
})

setTimeout(() => {
  console.log('✗ TIMEOUT')
  failed++
  worker.destroy()
  finish()
}, 20000)
