// IPC roundtrip test: spawn a Bare worker, send ping, expect pong
const PearRuntime = require('pear-runtime')
const path = require('path')

const workerPath = path.join(__dirname, 'test-worker.mjs')
console.log('Worker path:', workerPath)

let buffer = ''
let ready = false
let passed = 0
let failed = 0

function check() {
  const lines = buffer.split('\n')
  buffer = lines.pop() // keep incomplete line

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    console.log('  ←', trimmed)

    if (trimmed === 'ready') {
      ready = true
      console.log('  → ping')
      worker.write('ping\n')
    } else if (trimmed === 'pong') {
      passed++
      console.log('✓ ROUNDTRIP OK')
      console.log('  → shutdown')
      worker.write('shutdown\n')
    } else if (trimmed === 'echo:shutdown') {
      console.log('✓ SHUTDOWN OK')
      passed++
      setTimeout(() => {
        worker.destroy()
        printResult()
      }, 200)
    } else if (trimmed.startsWith('echo:')) {
      passed++
      console.log('✓ ECHO OK')
    } else {
      console.log('? UNEXPECTED:', trimmed)
    }
  }
}

function printResult() {
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
})

worker.on('close', () => {
  console.log('Worker closed')
})

setTimeout(() => {
  if (!ready) {
    console.log('✗ TIMEOUT — worker never became ready')
    failed++
    worker.destroy()
    printResult()
  }
}, 10000)
