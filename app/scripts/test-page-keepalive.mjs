// Built-app check: an HTML page keeps its scroll position, its typed answers and its session across tab switches.
//
// Launches the built app (run `pnpm build` first) hidden, on synthetic notes in a throwaway profile, and drives it
// over the DevTools protocol: no window is shown, no OS automation is used. It takes the shared launch lock so only
// one test app runs at a time, kills the app after 120 s at the latest, and always removes the lock.
//
// Usage: node scripts/test-page-keepalive.mjs [--report <file.json>]
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
  answer.addEventListener('input', () => localStorage.setItem('answer', answer.value))
</script>`

function makeFixtures() {
  const root = mkdtempSync(join(tmpdir(), 'ryte-keepalive-'))
  const notes = join(root, 'notes')
  const userData = join(root, 'userdata')
  mkdirSync(notes)
  mkdirSync(userData)
  for (let i = 1; i <= 6; i += 1) writeFileSync(join(notes, `p${i}.html`), tall(`p${i}`))
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

async function main() {
  await takeLock()
  const { root, userData } = makeFixtures()
  const electron = spawn(require('electron'), ['.', `--remote-debugging-port=${PORT}`], {
    cwd: appRoot,
    env: { ...process.env, RYTE_TEST_HIDDEN: '1', RYTE_USER_DATA_DIR: userData },
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

  let main = null
  try {
    const mainTarget = await until('the app window', async () =>
      (await targets()).find((t) => t.type === 'page' && t.url.startsWith('file:'))
    )
    main = await connect(mainTarget)
    await until('window.ryte', () =>
      main.evaluate('typeof window.ryte?.workspace?.openFile === "function"')
    )

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
    const pageTargets = async () =>
      (await targets()).filter((t) => t.url.startsWith('ryte-page://'))
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
          `({ value: document.getElementById('answer')?.value ?? null, stored: localStorage.getItem('answer'), scroll: Math.round(window.scrollY), marker: window.loadMarker })`
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

    // 1. The reported bug: scroll a page, type an answer, switch away and back.
    await show('p1.html')
    const baseline = rssOfAppProcesses(electron.pid)
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
    const twoViews = rssOfAppProcesses(electron.pid)

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

    // 3. Six HTML tabs: at most four views alive; the oldest is pushed out and loads again where it was.
    for (const name of ['p3.html', 'p4.html', 'p5.html', 'p6.html']) await show(name)
    const alive = await pageTargets()
    check('at most 4 page views alive with 6 HTML tabs', alive.length <= 4, `${alive.length} alive`)
    const fourViews = rssOfAppProcesses(electron.pid)
    check('the view shown longest ago was pushed out', !(await viewOf('p1.html')))
    await goTo('p1.html')
    const back = await settled('p1.html')
    await sleep(500)
    const restored = await readState('p1.html')
    check(
      'a pushed-out page loads again at its scroll position',
      Math.abs(restored.scroll - 900) <= 2,
      `scroll ${restored.scroll}, marker changed: ${back.marker !== before.marker}`
    )

    // 4. Closing a tab ends its view.
    await closePath('p6.html')
    await until('the closed tab view to go', async () => !(await viewOf('p6.html')))
    check('closing a tab destroys its view', true)

    report.memory = { baseline, twoViews, fourViews }
  } catch (error) {
    let state = ''
    try {
      state = await main?.evaluate(
        `(async () => { const s = { tabs: [], activeTabId: null }; const r = document.querySelector('[data-page-stage]')?.getBoundingClientRect(); return JSON.stringify({ active: s.tabs.find((t) => t.id === s.activeTabId)?.sourcePath, tabs: s.tabs.map((t) => t.sourcePath), stage: r && [r.width, r.height], tabsMounted: document.querySelectorAll('.page-tab').length, overlay: !!document.querySelector('dialog[open], [aria-modal=true], [popover]:popover-open') }) })()`
      )
    } catch {
      // No state to add.
    }
    try {
      state +=
        ' views=' +
        (await targets())
          .filter((t) => t.url.startsWith('ryte-page://'))
          .map((t) => t.url.slice(-8))
          .join(',')
    } catch {
      // No targets to add.
    }
    check(
      'run completed',
      false,
      `${error instanceof Error ? error.message : String(error)} ${state ?? ''}`
    )
  } finally {
    clearTimeout(watchdog)
    main?.close()
    if (!exited) electron.kill('SIGKILL')
    await sleep(500)
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
