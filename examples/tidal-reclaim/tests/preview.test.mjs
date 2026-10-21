import { request } from 'node:http'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createServer } from 'vite'

let server
let port
beforeAll(async () => {
  // Own cacheDir: sharing node_modules/.vite would replace the running Preview server's optimized deps (504s).
  server = await createServer({ configFile: 'vite.config.ts', cacheDir: 'node_modules/.vite-preview-test', server: { host: '127.0.0.1', port: 0 } })
  await server.listen()
  port = server.httpServer.address().port
})
afterAll(async () => { await server?.close() })

function readSource(host) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path: '/src/main.ts', headers: { host } }, response => {
      response.resume()
      response.on('end', () => resolve(response.statusCode))
    })
    req.on('error', reject)
    req.end()
  })
}

it.each(['localhost', '127.0.0.1'])(
  'allows source requests through the supported preview host %s', async host => {
    expect(await readSource(host)).toBe(200)
  },
)
it.each(['attacker.example', 'manus.computer.attacker.example'])(
  'rejects source requests from untrusted Host %s', async host => {
    expect(await readSource(host)).toBe(403)
  },
)
