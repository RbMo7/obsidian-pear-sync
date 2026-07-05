// Minimal Bare worker for IPC roundtrip test
Bare.IPC.on('data', (data) => {
  const msg = data.toString().trim()
  if (msg === 'ping') {
    Bare.IPC.write('pong\n')
  } else {
    Bare.IPC.write('echo:' + msg + '\n')
  }
})

// Signal worker is alive
Bare.IPC.write('ready\n')
