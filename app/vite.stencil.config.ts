import dns from 'node:dns'
import { resolve } from 'path'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

// Resolve localhost to 127.0.0.1 first, so http://localhost:6002 and http://127.0.0.1:6002 both work.
dns.setDefaultResultOrder('ipv4first')

// Print http://localhost first, with the 127.0.0.1 address as the backup, instead of only the IP.
function localhostUrls(): Plugin {
  return {
    name: 'stencil-localhost-urls',
    configureServer(server) {
      const printUrls = server.printUrls.bind(server)
      server.printUrls = () => {
        const local = server.resolvedUrls?.local ?? []
        if (server.resolvedUrls) {
          server.resolvedUrls.local = local.map((url) => url.replace('127.0.0.1', 'localhost'))
        }
        printUrls()
        for (const url of local) server.config.logger.info(`  ➜  Backup: ${url}`)
      }
    }
  }
}

// The Stencil gallery: `pnpm stencil` serves it, `pnpm stencil:build` writes it to out/stencil.
export default defineConfig({
  root: resolve('src/renderer/src/stencil/gallery'),
  base: './',
  resolve: { alias: { '@renderer': resolve('src/renderer/src') } },
  plugins: [vue(), localhostUrls()],
  server: { host: 'localhost', port: 6002, strictPort: true },
  build: { outDir: resolve('out/stencil'), emptyOutDir: true }
})
