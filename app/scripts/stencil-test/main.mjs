// Electron main process for the Stencil keyboard contract tests. Loads the built gallery in a hidden
// window and runs each scenario against a fresh page. Exits 1 if any scenario fails.
import { app, BrowserWindow } from 'electron'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createDriver } from './driver.mjs'
import { scenarios } from './scenarios.mjs'

const root = resolve(fileURLToPath(import.meta.url), '../../..')
const site = resolve(root, 'out/stencil')
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml'
}

// A built page uses module scripts, which Chromium will not load from file://, so serve it locally.
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname
  try {
    const file = resolve(site, `.${path === '/' ? '/index.html' : path}`)
    if (!file.startsWith(site)) throw new Error('outside the build')
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
    response.end(await readFile(file))
  } catch {
    response.writeHead(404).end()
  }
})
let page = ''

app.dock?.hide()

// The tests need real input, which a hidden window still receives; a visible one would steal focus.
async function freshWindow() {
  const win = new BrowserWindow({
    // CI's virtual display is smaller than a laptop; STENCIL_TEST_SIZE=1024x642 reproduces it.
    width: Number(process.env.STENCIL_TEST_SIZE?.split('x')[0] ?? 1280),
    height: Number(process.env.STENCIL_TEST_SIZE?.split('x')[1] ?? 900),
    show: false,
    webPreferences: { backgroundThrottling: false }
  })
  await win.loadURL(page)
  win.webContents.focus()
  const driver = createDriver(win)
  await driver.ready()
  await driver.eval("document.documentElement.dataset.theme = 'light'")
  return { win, driver }
}

// An uncaught error in the main process opens a native dialog and hangs a headless run; report it.
process.on('uncaughtException', (error) => {
  console.error(error)
  app.exit(1)
})

// Electron holds 'ready' until an ES module entry finishes loading, so nothing here awaits at the top level.
async function main() {
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  page = `http://127.0.0.1:${server.address().port}/`

  const only = process.argv.slice(2).find((arg) => !arg.startsWith('-'))
  let failed = 0
  let ran = 0

  // One window per Electron process is reliable; scenarios reload the page for a clean state instead.
  const { win, driver } = await freshWindow()
  for (const scenario of scenarios) {
    if (only && !scenario.name.includes(only)) continue
    ran++
    try {
      await win.webContents.reloadIgnoringCache()
      await driver.ready()
      await driver.eval("document.documentElement.dataset.theme = 'light'")
      win.webContents.focus()
      // The first press after a load can only focus the page, so spend one on empty space.
      await driver.clickAt(2, 2)
      await driver.clickAt(2, 2)
      await scenario.run(driver)
      console.log(`  ✓ ${scenario.name}`)
    } catch (error) {
      failed++
      const state = await driver
        .eval(
          `JSON.stringify({ active: document.activeElement?.id || document.activeElement?.tagName, viewport: [innerWidth, innerHeight], scrollY, fonts: document.fonts.status })`
        )
        .catch(() => 'unavailable')
      console.log(`  ✗ ${scenario.name}\n      ${error.message}\n      page state: ${state}`)
    }
  }

  console.log(`\n${ran - failed} of ${ran} keyboard contracts passed.`)
  app.exit(failed === 0 && ran > 0 ? 0 : 1)
}

app.whenReady().then(main)
