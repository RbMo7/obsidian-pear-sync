// Minimal test: does a bundled worker send any data at all?
const PearRuntime = require('pear-runtime')
const path = require('path')

// Use the already-built worker.mjs
const workerPath = path.join(__dirname, '..', 'worker.mjs')
console.log('Worker:', workerPath)
console.log('File size:', require('fs').statSync(workerPath).size)

const worker = PearRuntime.run(workerPath, [])

let gotData = false

worker.on('data', (chunk) => {
  gotData = true
  console.log('DATA:', JSON.stringify(chunk.toString().trim()))
})

worker.on('error', (err) => {
  console.error('WORKER ERROR:', err.message)
})

setTimeout(() => {
  if (!gotData) {
    console.log('NO DATA — worker may have crashed silently')
    // Try to check if bare-sidecar binary exists
    try {
      const bs = require('bare-sidecar')
      console.log('bare-sidecar:', typeof bs)
    } catch(e) {
      console.log('bare-sidecar error:', e.message)
    }
  }
  worker.destroy()
  process.exit(gotData ? 0 : 1)
}, 8000)
