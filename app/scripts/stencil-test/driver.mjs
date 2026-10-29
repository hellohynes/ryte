// Helpers for driving the gallery with real input. Key and mouse events go through
// `webContents.sendInputEvent`, because a synthetic KeyboardEvent does not trigger native behavior such
// as Escape closing a modal dialog. Waits use timers: requestAnimationFrame does not run in a hidden window.
// Electron names a few keys differently from the DOM's `event.key`.
const ELECTRON_KEYS = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Enter: 'Return'
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function createDriver(win) {
  const contents = win.webContents

  const driver = {
    sleep,

    /** Waits for the gallery to render and for web fonts to finish, so layout is settled. */
    async ready() {
      await driver.waitFor(
        "document.querySelector('#demo-dialog-open') !== null",
        'gallery to render',
        10000
      )
      await driver.waitFor('document.fonts.status === "loaded"', 'fonts to load', 10000)
    },

    /** Evaluates an expression in the page and returns its value. */
    eval: (js) => contents.executeJavaScript(js, true),

    /** Polls a page expression until it is truthy. */
    async waitFor(js, label = js, timeout = 3000) {
      const end = Date.now() + timeout
      while (Date.now() < end) {
        if (await driver.eval(js)) return
        await sleep(25)
      }
      throw new Error(`Timed out waiting for: ${label}`)
    },

    /** Presses and releases a key by its DOM name ("Escape", "ArrowDown", "Enter", "a"). */
    async key(name, modifiers = []) {
      const keyCode = ELECTRON_KEYS[name] ?? name
      contents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
      // Characters, and Enter (which activates a button on keypress), also need a char event.
      if (name.length === 1) contents.sendInputEvent({ type: 'char', keyCode, modifiers })
      if (name === 'Enter') contents.sendInputEvent({ type: 'char', keyCode: '\r', modifiers })
      contents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
      await sleep(60)
    },

    async type(text) {
      for (const char of text) await driver.key(char)
    },

    async mouse(type, x, y, button = 'left') {
      contents.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), button, clickCount: 1 })
    },

    /** Moves the pointer without pressing. */
    async hover(x, y) {
      contents.sendInputEvent({ type: 'mouseMove', x: Math.round(x), y: Math.round(y) })
      await sleep(40)
    },

    async clickAt(x, y, button = 'left') {
      await driver.hover(x, y)
      await driver.mouse('mouseDown', x, y, button)
      await driver.mouse('mouseUp', x, y, button)
      await sleep(80)
    },

    /**
     * The center of an element, scrolled into view first. Waits until its position stops changing, because
     * fonts and images still loading on a slow machine shift the layout under a click.
     */
    async center(selector) {
      let previous = null
      for (let attempt = 0; attempt < 40; attempt++) {
        const point = await driver.eval(`(() => {
          const el = document.querySelector(${JSON.stringify(selector)})
          if (!el) return null
          el.scrollIntoView({ block: 'center', behavior: 'instant' })
          const r = el.getBoundingClientRect()
          return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
        })()`)
        if (point && previous && point.x === previous.x && point.y === previous.y) {
          // A hidden window paints only when asked, and input is hit-tested against the last painted
          // frame, so a click right after a scroll can land on the old content. Painting first fixes it,
          // and the element at the point must be the target before we click.
          await contents.capturePage({ x: 0, y: 0, width: 1, height: 1 })
          const hit = await driver.eval(`(() => {
            const el = document.querySelector(${JSON.stringify(selector)})
            const at = document.elementFromPoint(${point.x}, ${point.y})
            return !!el && !!at && (el === at || el.contains(at))
          })()`)
          if (hit) return point
        }
        previous = point
        await sleep(50)
      }
      throw new Error(`No stable, hittable element for ${selector}`)
    },

    async click(selector, button = 'left') {
      const { x, y } = await driver.center(selector)
      await driver.clickAt(x, y, button)
    },

    /**
     * Clicks until a page condition holds, up to a few times. For the click that opens something: a press
     * that did not register is retried, while a button that really does nothing still fails the scenario.
     */
    async clickUntil(selector, js, label, attempts = 3) {
      for (let attempt = 1; attempt <= attempts; attempt++) {
        await driver.click(selector)
        try {
          await driver.waitFor(js, label, 1500)
          return
        } catch (error) {
          if (attempt === attempts) throw error
        }
      }
    },

    /** What has focus, as "#id" or "tag: text", for readable failures. */
    active: () =>
      driver.eval(`(() => {
        const el = document.activeElement
        if (!el || el === document.body) return 'body'
        return el.id ? '#' + el.id : el.tagName.toLowerCase() + ': ' + (el.textContent || '').trim().slice(0, 24)
      })()`),

    /** Focuses an element from script, then presses Tab-less keys from there. */
    focus: (selector) => driver.eval(`document.querySelector(${JSON.stringify(selector)}).focus()`),

    popoverOpen: (selector) =>
      driver.eval(
        `document.querySelector(${JSON.stringify(selector)})?.matches(':popover-open') === true`
      ),

    dialogOpen: (selector) =>
      driver.eval(`document.querySelector(${JSON.stringify(selector)})?.open === true`)
  }
  return driver
}

export function assert(condition, message) {
  if (!condition) throw new Error(message)
}

export function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    )
  }
}
