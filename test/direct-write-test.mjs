// Minimal test: init drive, write file, read back
import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import b4a from 'b4a'

const storePath = '/tmp/direct-write-test-' + Date.now()

Bare.IPC.write('started\n')

try {
  const store = new Corestore(storePath)
  await store.ready()
  Bare.IPC.write('store-ready\n')

  const drive = new Hyperdrive(store)
  await drive.ready()
  Bare.IPC.write('drive-ready key=' + b4a.toString(drive.key, 'hex') + '\n')

  await drive.put('/test.md', b4a.from('hello world'))
  Bare.IPC.write('put-ok\n')

  const data = await drive.get('/test.md')
  const content = data ? b4a.toString(data) : 'null'
  Bare.IPC.write('get-ok content=' + content + '\n')

  await drive.close()
  await store.close()
  Bare.IPC.write('done\n')
} catch (err) {
  Bare.IPC.write('error: ' + err.message + '\n')
}
