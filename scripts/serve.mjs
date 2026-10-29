// Serves a folder of static files for local preview. Usage: node scripts/serve.mjs <folder> <port> [--stencil <url>]
// With --stencil, a request under /stencil that the folder cannot answer goes to the running Stencil
// gallery at <url> (the preview folder does not contain the built gallery); if it is not running, a
// short page says how to start it.
// Listens on loopback only. Open http://localhost:<port>/; the 127.0.0.1 address is the backup.
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'

const [folder, portArg, ...flags] = process.argv.slice(2)
const port = Number(portArg)
const stencilUrl = flags[0] === '--stencil' ? flags[1] : undefined
if (!folder || !Number.isInteger(port)) {
  console.error('Usage: node scripts/serve.mjs <folder> <port> [--stencil <url>]')
  process.exit(1)
}
const root = resolve(folder)
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.woff2': 'font/woff2'
}

const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
    let file = join(root, normalize(path))
    if (!file.startsWith(root)) throw new Error('outside the folder')
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html')
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
    response.end(await readFile(file))
  } catch {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname
    if (stencilUrl && /^\/stencil(\/|$)/.test(path)) return sendStencil(response)
    response.writeHead(404, { 'content-type': 'text/plain' }).end('Not found')
  }
})

async function sendStencil(response) {
  const running = await fetch(stencilUrl, { signal: AbortSignal.timeout(500) }).then(
    (reply) => reply.ok,
    () => false
  )
  if (running) return void response.writeHead(302, { location: stencilUrl }).end()
  response
    .writeHead(404, { 'content-type': 'text/html; charset=utf-8' })
    .end(
      `<!doctype html><meta charset="utf-8"><title>Stencil is not running</title>` +
        `<body style="font:16px system-ui;max-width:36rem;margin:4rem auto;padding:0 1rem">` +
        `<h1>Stencil is not running</h1><p>The preview serves only the landing page. ` +
        `Start the gallery with <code>pnpm site:stencil</code> (it opens at ${stencilUrl}), ` +
        `or run <code>pnpm site:serve</code> to preview the full deploy build including /stencil/.</p></body>`
    )
}

// "localhost" can resolve to ::1 or 127.0.0.1, so listen on both loopback addresses.
const hosts = ['127.0.0.1', '::1']
let listening = 0
for (const host of hosts) {
  const instance = host === hosts[0] ? server : createServer(server.listeners('request')[0])
  instance.once('error', (error) => {
    if (host === hosts[0]) {
      console.error(`Could not listen on port ${port}: ${error.message}`)
      process.exit(1)
    }
  })
  instance.listen(port, host, () => {
    if (++listening === 1) {
      console.log(`Serving ${folder} at http://localhost:${port}/  (backup: http://127.0.0.1:${port}/)`)
    }
  })
}
