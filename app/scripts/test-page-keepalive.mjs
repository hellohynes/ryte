// Built-app check: an HTML page keeps its scroll position, its typed answers and its saved data across tab switches,
// sleep and a restart, and opens like a normal tab (a file from a sibling folder, a web request).
//
// Launches the built app (run `pnpm build` first) hidden, on synthetic notes in a throwaway profile, and drives it
// over the DevTools protocol: no window is shown, no OS automation is used. It takes the shared launch lock so only
// one test app runs at a time, kills each launch after 120 s at the latest, and always removes the lock. The "web"
// is a local http server on 127.0.0.1 that this script starts; the real internet is never used.
//
// Usage: node scripts/test-page-keepalive.mjs [--report <file.json>]
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const require = createRequire(import.meta.url)
const appRoot = resolve(new URL('..', import.meta.url).pathname)
const LOCK = '/private/tmp/ryte-test-launch.lock'
const WATCHDOG_MS = 120_000
const PORT = 9300 + Math.floor(Math.random() * 500)
const reportIndex = process.argv.indexOf('--report')
const reportPath = reportIndex > -1 ? process.argv[reportIndex + 1] : null

const failures = []
const report = { rounds: 0, memory: {}, checks: [] }
function check(name, ok, detail = '') {
  report.checks.push({ name, ok, detail })
  if (!ok) failures.push(`${name} ${detail}`)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`)
}

async function takeLock() {
  const deadline = Date.now() + 10 * 60_000
  for (;;) {
    const made = spawnSync('mkdir', [LOCK], { stdio: 'ignore' })
    if (made.status === 0) return
    if (Date.now() > deadline) throw new Error('could not take the shared launch lock')
    await sleep(5000)
  }
}

const tall = (name) => `<!doctype html><meta charset="utf-8"><title>${name}</title>
<style>body{margin:0;height:6000px}input{display:block;margin:20px;width:300px}</style>
<input id="answer" placeholder="answer">
<script>
  window.loadMarker = Math.random()
  const answer = document.getElementById('answer')
  answer.addEventListener('input', () => localStorage.setItem('answer-' + document.title, answer.value))
</script>`

// A page in pages/ that loads a script and a note from the sibling folder shared/, and a page that asks the local server.
const sibling = `<!doctype html><meta charset="utf-8"><title>s</title>
<script src="../shared/lib.js"></script>
<script>
  window.loadMarker = 1
  window.result = { script: window.siblingScript, note: null, img: null }
  const img = new Image()
  img.onload = () => { window.result.img = img.naturalWidth }
  img.onerror = () => { window.result.img = -1 }
  img.src = '../shared/logo.svg'
  fetch('../shared/note.md').then((r) => r.text()).then((t) => { window.result.note = t }, (e) => { window.result.note = 'ERR ' + e })
</script>`
const web = (port) => `<!doctype html><meta charset="utf-8"><title>net</title>
<script>
  window.loadMarker = 1
  window.result = { body: null }
  fetch('http://127.0.0.1:${port}/ping').then((r) => r.text()).then((t) => { window.result.body = t }, (e) => { window.result.body = 'ERR ' + e })
</script>`

function makeFixtures(port) {
  const root = mkdtempSync(join(tmpdir(), 'ryte-keepalive-'))
  const notes = join(root, 'notes')
  const userData = join(root, 'userdata')
  mkdirSync(notes)
  mkdirSync(userData)
  for (let i = 1; i <= 6; i += 1) writeFileSync(join(notes, `p${i}.html`), tall(`p${i}`))
  mkdirSync(join(notes, 'pages'))
  mkdirSync(join(notes, 'shared'))
  writeFileSync(join(notes, 'pages', 's.html'), sibling)
  writeFileSync(join(notes, 'shared', 'lib.js'), "window.siblingScript = 'loaded'")
  writeFileSync(join(notes, 'shared', 'note.md'), '# Shared note')
  writeFileSync(
    join(notes, 'shared', 'logo.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" width="7" height="7"/>'
  )
  writeFileSync(join(notes, 'net.html'), web(port))
  writeFileSync(join(notes, 'n.md'), `# A note\n\n${'Some synthetic text.\n\n'.repeat(200)}`)
  writeFileSync(
    join(notes, 'c.js'),
    Array.from({ length: 600 }, (_, i) => `const line${i} = ${i}`).join('\n')
  )
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ notesRoot: notes }))
  return { root, notes, userData }
}

async function targets() {
  const response = await fetch(`http://127.0.0.1:${PORT}/json`)
  return response.json()
}

async function connect(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true })
    socket.addEventListener('error', rejectOpen, { once: true })
  })
  let next = 0
  const waiting = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    const entry = waiting.get(message.id)
    if (!entry) return
    waiting.delete(message.id)
    if (message.error) entry.reject(new Error(message.error.message))
    else entry.resolve(message.result)
  })
  return {
    async evaluate(expression) {
      const id = (next += 1)
      const done = new Promise((resolveCall, rejectCall) =>
        waiting.set(id, { resolve: resolveCall, reject: rejectCall })
      )
      socket.send(
        JSON.stringify({
          id,
          method: 'Runtime.evaluate',
          params: { expression, awaitPromise: true, returnByValue: true }
        })
      )
      const result = await done
      if (result.exceptionDetails)
        throw new Error(
          result.exceptionDetails.exception?.description ?? result.exceptionDetails.text
        )
      return result.result.value
    },
    close: () => socket.close()
  }
}

async function until(label, probe, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await probe().catch(() => null)
    if (value) return value
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`)
    await sleep(100)
  }
}

const rssOfAppProcesses = (appPid) => {
  const out = spawnSync('ps', ['-axo', 'pid=,ppid=,rss=,command='], { encoding: 'utf8' }).stdout
  const rows = out
    .split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/))
    .filter(Boolean)
    .map(([, pid, ppid, rss, command]) => ({ pid: +pid, ppid: +ppid, rss: +rss, command }))
  const renderers = rows.filter(
    (row) => row.ppid === appPid && row.command.includes('--type=renderer')
  )
  return {
    renderers: renderers.length,
    rssMb: Math.round(renderers.reduce((sum, row) => sum + row.rss, 0) / 1024)
  }
}

/** The helpers that drive the app window and the page views of one launch. */
function makeDriver(main) {
  // The window keeps its own copy of the tabs, so tabs are driven through its own controls, as a click would.
  const run = (body) => main.evaluate(`(() => { ${body} })()`)
  const tabButton = (path) =>
    `[...document.querySelectorAll('[role=tab]')].find((b) => b.title === ${JSON.stringify(path)})`
  const hasTab = (path) => run(`return !!${tabButton(path)}`)
  const activeTitle = () =>
    run(`return document.querySelector('[role=tab][aria-selected=true]')?.title ?? null`)
  const openFile = async (path) => {
    const stem = path.replace(/\.[^.]+$/, '')
    await until(`the sidebar row of ${path}`, () =>
      run(
        `return [...document.querySelectorAll('[role=treeitem]')].some((r) => /^${stem}(\\.[a-z]+)?$/.test(r.textContent.trim()))`
      )
    )
    await run(
      `[...document.querySelectorAll('[role=treeitem]')].find((r) => /^${stem}(\\.[a-z]+)?$/.test(r.textContent.trim())).click()`
    )
  }
  const focusPath = (path) => run(`${tabButton(path)}.click()`)
  const closePath = (path) =>
    run(`document.querySelector('[aria-label=${JSON.stringify('Close ' + path)}]').click()`)
  const pageTargets = async () => (await targets()).filter((t) => t.url.startsWith('ryte-page://'))
  const viewOf = async (name) => (await pageTargets()).find((t) => t.url.endsWith(`/${name}`))
  const withView = async (name, fn) => {
    const target = await until(`the view of ${name}`, () => viewOf(name))
    const client = await connect(target)
    try {
      return await fn(client, target)
    } finally {
      client.close()
    }
  }
  const readState = (name) =>
    withView(name, async (client, target) => ({
      id: target.url,
      ...(await client.evaluate(
        `({ value: document.getElementById('answer')?.value ?? null, stored: localStorage.getItem('answer-' + document.title), scroll: Math.round(window.scrollY), marker: window.loadMarker })`
      ))
    }))
  const settled = (name) =>
    until(
      `${name} to load`,
      async () => (await readState(name)).marker !== undefined && (await readState(name))
    )
  const show = async (path) => {
    await openFile(path)
    if (path.endsWith('.html')) await settled(path)
    else await until('the note tab to be active', async () => (await activeTitle()) === path)
    await sleep(300)
  }
  const goTo = async (path) => {
    if (!(await hasTab(path))) return show(path)
    await focusPath(path)
    await sleep(600)
  }
  return {
    run,
    hasTab,
    openFile,
    closePath,
    pageTargets,
    viewOf,
    withView,
    readState,
    settled,
    show,
    goTo
  }
}

/** Starts the built app on the profile and waits for its window. Every launch has its own 120 s watchdog. */
async function launch(userData) {
  const electron = spawn(require('electron'), ['.', `--remote-debugging-port=${PORT}`], {
    cwd: appRoot,
    env: {
      ...process.env,
      RYTE_TEST_HIDDEN: '1',
      RYTE_USER_DATA_DIR: userData,
      // A few synthetic pages never come near the memory budget, so a low ceiling makes the oldest views sleep.
      RYTE_TEST_KEPT_CEILING: '4',
      RYTE_TEST_KEPT_BUDGET_MB: process.env.RYTE_TEST_KEPT_BUDGET_MB ?? ''
    },
    stdio: 'ignore'
  })
  let exited = false
  electron.once('exit', () => {
    exited = true
  })
  const watchdog = setTimeout(() => {
    console.error('watchdog: killing the app after 120 s')
    electron.kill('SIGKILL')
  }, WATCHDOG_MS)
  const app = {
    electron,
    main: null,
    exited: () => exited,
    // A normal quit through the browser endpoint, so the app flushes what pages saved, as when a person quits.
    async quit() {
      const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
      const browser = new WebSocket(version.webSocketDebuggerUrl)
      await new Promise((resolveOpen) =>
        browser.addEventListener('open', resolveOpen, { once: true })
      )
      browser.send(JSON.stringify({ id: 1, method: 'Browser.close' }))
      await until('the app to quit', async () => exited, 8000).catch(() => electron.kill('SIGTERM'))
      await until('the app to quit', async () => exited, 5000).catch(() => undefined)
    },
    kill() {
      clearTimeout(watchdog)
      app.main?.close()
      if (!exited) electron.kill('SIGKILL')
      return sleep(500)
    }
  }
  try {
    const mainTarget = await until('the app window', async () =>
      (await targets()).find((t) => t.type === 'page' && t.url.startsWith('file:'))
    )
    app.main = await connect(mainTarget)
    await until('window.ryte', () =>
      app.main.evaluate('typeof window.ryte?.workspace?.openFile === "function"')
    )
  } catch (error) {
    await app.kill()
    throw error
  }
  return app
}

/** Runs `steps` on one launch of the app. A failure is reported as a failed check, and the app is always stopped. */
async function inApp(userData, name, steps) {
  let app = null
  try {
    app = await launch(userData)
    await steps(app, makeDriver(app.main))
  } catch (error) {
    let views = ''
    try {
      for (const target of (await targets()).filter((t) => t.url.startsWith('ryte-page://'))) {
        const client = await connect(target)
        const text = await client.evaluate('document.documentElement.outerHTML.slice(0, 120)')
        client.close()
        views += ` [${target.url.slice(-12)}: ${text}]`
      }
    } catch {
      // No targets to add.
    }
    check(
      `${name} completed`,
      false,
      `${error instanceof Error ? error.message : String(error)} views=${views}`
    )
  } finally {
    await app?.kill()
  }
}

async function main() {
  await takeLock()
  const listen = (server) =>
    new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen)).then(
      () => server.address().port
    )
  // Another local server that the approved one redirects to: a page must never be moved there.
  let landings = 0
  const landing = createServer((_request, response) => {
    landings += 1
    response.end('landing')
  })
  const landingPort = await listen(landing)
  // Stands in for the internet: a page may ask it for something, and it answers across origins.
  let awayRequests = 0
  const server = createServer((request, response) => {
    if (request.url === '/away') {
      awayRequests += 1
      response.writeHead(302, { Location: `http://127.0.0.1:${landingPort}/landing` })
      response.end()
      return
    }
    response.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain' })
    response.end('pong')
  })
  const port = await listen(server)
  const { root, userData } = makeFixtures(port)
  try {
    await inApp(userData, 'run', async (app, driver) => {
      const { run, closePath, pageTargets, viewOf, withView, readState, settled, show, goTo } =
        driver

      // 1. The reported bug: scroll a page, type an answer, switch away and back.
      await show('p1.html')
      const baseline = rssOfAppProcesses(app.electron.pid)
      await withView('p1.html', (client) =>
        client.evaluate(
          `(() => { const a = document.getElementById('answer'); a.value = 'my answer'; a.dispatchEvent(new Event('input')); window.scrollTo(0, 900); return true })()`
        )
      )
      await sleep(200)
      const before = await readState('p1.html')
      check(
        'p1 scrolled and answered before leaving',
        before.value === 'my answer' && before.scroll === 900,
        JSON.stringify(before)
      )
      await show('n.md')
      await goTo('p1.html')
      const after = await readState('p1.html')
      check(
        'same view and session after one switch',
        after.id === before.id && after.marker === before.marker,
        `${before.id} -> ${after.id}`
      )
      check(
        'typed answer unchanged after one switch',
        after.value === 'my answer' && after.stored === 'my answer',
        JSON.stringify(after)
      )
      check('scroll unchanged after one switch', after.scroll === 900, `scroll ${after.scroll}`)

      // 2. Ten rounds between two pages and a note.
      await show('p2.html')
      await withView('p2.html', (client) =>
        client.evaluate(
          `(() => { const a = document.getElementById('answer'); a.value = 'second'; a.dispatchEvent(new Event('input')); window.scrollTo(0, 1700); return true })()`
        )
      )
      for (let round = 1; round <= 10; round += 1) {
        await goTo('n.md')
        await goTo('p1.html')
        const one = await readState('p1.html')
        await goTo('p2.html')
        const two = await readState('p2.html')
        const ok =
          one.id === before.id &&
          one.value === 'my answer' &&
          one.scroll === 900 &&
          two.value === 'second' &&
          two.scroll === 1700
        report.rounds = round
        if (!ok) {
          check(`round ${round}`, false, JSON.stringify({ one, two }))
          break
        }
        if (round === 10) check('ten rounds between two pages and a note', true)
      }
      const twoViews = rssOfAppProcesses(app.electron.pid)

      // 2b. Notes and code files: does a tab switch keep where the text was scrolled to?
      const scrollerScript = `const el = [...document.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 200 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY) && e.clientWidth > 300)`
      for (const path of ['n.md', 'c.js']) {
        await goTo(path)
        await sleep(500)
        const set = await run(
          `${scrollerScript}; if (!el) return null; el.scrollTop = 700; return Math.round(el.scrollTop)`
        )
        await goTo('p1.html')
        await goTo(path)
        await sleep(500)
        const now = await run(`${scrollerScript}; return el ? Math.round(el.scrollTop) : null`)
        check(
          `${path} tab keeps its scroll across a tab switch`,
          set !== null && set > 0 && Math.abs(now - set) <= 2,
          `set ${set}, after ${now}`
        )
      }

      // 3. Six HTML tabs with the test ceiling of four: at most four views alive; the oldest sleeps and loads again where it was.
      for (const name of ['p3.html', 'p4.html', 'p5.html', 'p6.html']) await show(name)
      const alive = await pageTargets()
      check(
        'at most 4 page views alive with 6 HTML tabs and a ceiling of 4',
        alive.length <= 4,
        `${alive.length} alive`
      )
      const fourViews = rssOfAppProcesses(app.electron.pid)
      check('the view shown longest ago went to sleep', !(await viewOf('p1.html')))
      await goTo('p1.html')
      const back = await settled('p1.html')
      await sleep(500)
      const restored = await readState('p1.html')
      check(
        'a page that went to sleep loads again at its scroll position',
        Math.abs(restored.scroll - 900) <= 2,
        `scroll ${restored.scroll}, marker changed: ${back.marker !== before.marker}`
      )
      check(
        'what the page saved survives its sleep',
        restored.stored === 'my answer',
        `stored ${restored.stored}`
      )

      // 4. Closing a tab ends its view.
      await closePath('p6.html')
      await until('the closed tab view to go', async () => !(await viewOf('p6.html')))
      check('closing a tab destroys its view', true)

      // 5. A page opens like a normal tab: a file of a sibling folder, and a request to a web server.
      await run(
        `const row = [...document.querySelectorAll('[role=treeitem]')].find((r) => /^pages$/.test(r.textContent.trim())); if (row?.getAttribute('aria-expanded') !== 'true') row?.click()`
      )
      await show('s.html')
      const sibling = await until('the sibling files to load', () =>
        withView('s.html', (client) =>
          client.evaluate(
            'window.result.note !== null && window.result.img !== null && window.result'
          )
        )
      )
      check(
        'a page loads a script, a note and a picture from a sibling folder',
        sibling.script === 'loaded' && sibling.note === '# Shared note' && sibling.img === 7,
        JSON.stringify(sibling)
      )
      await show('net.html')
      const reply = await until('the web request to finish', () =>
        withView('net.html', (client) => client.evaluate('window.result.body'))
      )
      check('a page fetches from a web server', reply === 'pong', String(reply))

      report.memory = { baseline, twoViews, fourViews }

      await app.quit()
    })
    // The same profile again, with a local address already approved and open that the server redirects away.
    const origin = `http://127.0.0.1:${port}`
    writeFileSync(
      join(userData, 'localhost-approvals.json'),
      JSON.stringify({ version: 1, origins: [origin] })
    )
    const workspacePath = join(userData, 'workspace.json')
    const workspace = JSON.parse(readFileSync(workspacePath, 'utf8'))
    const tab = { id: 'away-tab', title: '127.0.0.1', viewMode: 'preview', url: `${origin}/away` }
    writeFileSync(
      workspacePath,
      JSON.stringify({ ...workspace, tabs: [...workspace.tabs, tab], activeTabId: tab.id })
    )
    await inApp(userData, 'restart', async (_app, driver) => {
      await until('the approved local tab to ask the server', async () => awayRequests > 0)
      await sleep(1500)
      check(
        'a redirect from an approved local address does not move the view to another address',
        landings === 0,
        `${landings} requests reached the other server`
      )
      await driver.goTo('p1.html')
      const back = await driver.settled('p1.html')
      check(
        'what the page saved survives a restart',
        back.stored === 'my answer',
        `stored ${back.stored}`
      )
    })
  } finally {
    server.close()
    landing.close()
    rmSync(root, { recursive: true, force: true })
    spawnSync('rmdir', [LOCK], { stdio: 'ignore' })
  }
}

await main()
if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report.memory))
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`)
  process.exit(1)
}
console.log('\nall page keep-alive checks passed')
