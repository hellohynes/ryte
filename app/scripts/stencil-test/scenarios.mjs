// Keyboard contract scenarios, written against the WAI-ARIA Authoring Practices keyboard tables. Each
// one drives the built gallery with real input and asserts on focus, open state, and placement.
// `covers` names the Stencil components a scenario is the keyboard contract for; `pnpm check:stencil`
// fails when a component with keyboard or top-layer behavior is covered by none.
import { assert, assertEqual } from './driver.mjs'

const INSIDE_DIALOG = "document.querySelector('#demo-dialog').contains(document.activeElement)"

export const scenarios = [
  {
    name: 'Dialog opens modal, keeps Tab inside, closes on Escape, and returns focus',
    covers: ['StDialog'],
    async run(d) {
      await d.clickUntil(
        '#demo-dialog-open',
        "document.querySelector('#demo-dialog').open",
        'dialog to open'
      )
      assert(
        await d.eval("document.querySelector('#demo-dialog').matches(':modal')"),
        'the dialog should be modal'
      )
      assert(
        await d.eval(INSIDE_DIALOG),
        `focus should move into the dialog, got ${await d.active()}`
      )
      for (let i = 0; i < 8; i++) {
        await d.key('Tab')
        assert(await d.eval(INSIDE_DIALOG), `Tab ${i + 1} left the dialog for ${await d.active()}`)
      }
      // Backward Tab, away from the first control: wrapping off the first control is the browser's own
      // behavior and differs between displays, so the contract is only that it stays inside the dialog.
      await d.key('Tab')
      await d.key('Tab', ['shift'])
      assert(await d.eval(INSIDE_DIALOG), `Shift+Tab left the dialog for ${await d.active()}`)
      await d.key('Escape')
      await d.waitFor("!document.querySelector('#demo-dialog').open", 'dialog to close')
      assertEqual(await d.active(), '#demo-dialog-open', 'focus after the dialog closes')
    }
  },
  {
    name: 'Dialog closed by unmounting it still returns focus to the opener',
    covers: ['StDialog'],
    async run(d) {
      await d.click('#demo-mounted-open')
      await d.waitFor("document.querySelector('#demo-mounted')?.open", 'dialog to mount open')
      await d.key('Escape')
      await d.waitFor("!document.querySelector('#demo-mounted')", 'dialog to unmount')
      await d.sleep(100)
      assertEqual(await d.active(), '#demo-mounted-open', 'focus after the dialog unmounts')
    }
  },
  {
    name: 'Dialog: a press on the scrim dismisses it, a press inside does not',
    covers: ['StDialog'],
    async run(d) {
      await d.clickUntil(
        '#demo-dialog-open',
        "document.querySelector('#demo-dialog').open",
        'dialog to open'
      )
      await d.click('#demo-dialog input')
      assert(await d.dialogOpen('#demo-dialog'), 'a click inside the panel closed the dialog')
      await d.clickAt(6, 6)
      await d.waitFor("!document.querySelector('#demo-dialog').open", 'scrim click to close it')
    }
  },
  {
    name: 'Escape closes only the top layer: a menu in a dialog before the dialog',
    covers: ['StDialog', 'StMenu', 'StPopover'],
    async run(d) {
      await d.clickUntil(
        '#demo-dialog-open',
        "document.querySelector('#demo-dialog').open",
        'dialog to open'
      )
      await d.click('#demo-dialog-menu-button')
      await d.waitFor(
        "document.querySelector('#demo-dialog-menu').matches(':popover-open')",
        'menu to open'
      )
      assertEqual(await d.active(), 'button: Duplicate', 'first menu item focused')
      await d.key('Escape')
      await d.waitFor(
        "!document.querySelector('#demo-dialog-menu').matches(':popover-open')",
        'menu to close'
      )
      assert(await d.dialogOpen('#demo-dialog'), 'Escape closed the dialog along with the menu')
      await d.key('Escape')
      await d.waitFor("!document.querySelector('#demo-dialog').open", 'dialog to close')
    }
  },
  {
    name: 'Menu: arrows, Home/End and wrapping skip disabled items',
    covers: ['StMenu', 'StMenuItem'],
    async run(d) {
      await d.click('#demo-menu-open')
      await d.waitFor(
        "document.querySelector('#demo-menu').matches(':popover-open')",
        'menu to open'
      )
      assertEqual(await d.active(), 'button: Copy file', 'first item focused on open')
      await d.key('ArrowDown')
      assertEqual(await d.active(), 'button: Rename', 'ArrowDown')
      await d.key('End')
      assertEqual(await d.active(), 'button: Move to Trash', 'End')
      await d.key('ArrowDown')
      assertEqual(await d.active(), 'button: Copy file', 'ArrowDown wraps to the first item')
      await d.key('ArrowUp')
      assertEqual(await d.active(), 'button: Move to Trash', 'ArrowUp wraps to the last item')
      await d.key('Home')
      for (let i = 0; i < 3; i++) await d.key('ArrowDown')
      assertEqual(await d.active(), 'button: Sort by date', 'third ArrowDown')
      await d.key('ArrowDown')
      assertEqual(await d.active(), 'button: Move to Trash', 'the disabled item is skipped')
    }
  },
  {
    name: 'Menu: typing jumps to the next item starting with that letter',
    covers: ['StMenu'],
    async run(d) {
      await d.click('#demo-menu-open')
      await d.waitFor(
        "document.querySelector('#demo-menu').matches(':popover-open')",
        'menu to open'
      )
      await d.key('r')
      assertEqual(await d.active(), 'button: Rename', 'typing r')
      await d.sleep(650)
      await d.key('m')
      assertEqual(await d.active(), 'button: Move to Trash', 'typing m after a pause')
    }
  },
  {
    name: 'Menu: a space typed while jumping does not activate the item',
    covers: ['StMenu'],
    async run(d) {
      await d.click('#demo-menu-open')
      await d.waitFor(
        "document.querySelector('#demo-menu').matches(':popover-open')",
        'menu to open'
      )
      await d.type('sort b')
      assertEqual(await d.active(), 'button: Sort by name', 'typing "sort b"')
      assert(
        await d.eval("document.querySelector('#demo-menu').matches(':popover-open')"),
        'the space closed the menu'
      )
      assert(
        !(await d.eval(
          "document.querySelector('#overlays').textContent.includes('chose:')&&!document.querySelector('#overlays').textContent.includes('chose: —')"
        )),
        'the space chose an item'
      )
    }
  },
  {
    name: 'Menu: Enter chooses, closes the menu, and returns focus to the trigger',
    covers: ['StMenu', 'StMenuItem'],
    async run(d) {
      await d.click('#demo-menu-open')
      await d.waitFor(
        "document.querySelector('#demo-menu').matches(':popover-open')",
        'menu to open'
      )
      await d.key('ArrowDown')
      await d.key('Enter')
      await d.waitFor(
        "!document.querySelector('#demo-menu').matches(':popover-open')",
        'menu to close'
      )
      assert(
        await d.eval("document.querySelector('#overlays').textContent.includes('chose: rename')"),
        'the item was not chosen'
      )
      assertEqual(await d.active(), '#demo-menu-open', 'focus after choosing')
    }
  },
  {
    name: 'Menu: Tab and Escape close it; a press outside closes it; the trigger toggles',
    covers: ['StMenu'],
    async run(d) {
      const open = "document.querySelector('#demo-menu').matches(':popover-open')"
      await d.click('#demo-menu-open')
      await d.waitFor(open, 'menu to open')
      await d.key('Tab')
      await d.waitFor(`!(${open})`, 'Tab to close the menu')
      assertEqual(await d.active(), '#demo-menu-open', 'focus after Tab')
      await d.click('#demo-menu-open')
      await d.waitFor(open, 'menu to reopen')
      await d.key('Escape')
      await d.waitFor(`!(${open})`, 'Escape to close the menu')
      await d.click('#demo-menu-open')
      await d.waitFor(open, 'menu to reopen again')
      await d.clickAt(6, 6)
      await d.waitFor(`!(${open})`, 'an outside press to close the menu')
      await d.click('#demo-menu-open')
      await d.waitFor(open, 'menu to reopen a third time')
      await d.click('#demo-menu-open')
      await d.waitFor(`!(${open})`, 'the trigger to close its own menu')
    }
  },
  {
    name: 'Context menu opens at the pointer and closes on Escape',
    covers: ['StMenu', 'StPopover'],
    async run(d) {
      const { x, y } = await d.center('#demo-context-area')
      await d.clickAt(x, y, 'right')
      await d.waitFor(
        "document.querySelector('#demo-context-menu').matches(':popover-open')",
        'context menu to open'
      )
      const box = await d.eval(`(() => {
        const r = document.querySelector('#demo-context-menu').getBoundingClientRect()
        return { left: r.left, top: r.top }
      })()`)
      assert(Math.abs(box.left - x) <= 2, `left ${box.left} should be at the pointer ${x}`)
      assert(Math.abs(box.top - y) <= 2, `top ${box.top} should be at the pointer ${y}`)
      assertEqual(await d.active(), 'button: Copy', 'first item focused')
      await d.key('Escape')
      await d.waitFor(
        "!document.querySelector('#demo-context-menu').matches(':popover-open')",
        'context menu to close'
      )
    }
  },
  {
    name: 'Popover sits below its anchor, closes on Escape and outside press, and returns focus',
    covers: ['StPopover'],
    async run(d) {
      await d.click('#demo-popover-open')
      await d.waitFor(
        "document.querySelector('#demo-popover').matches(':popover-open')",
        'popover to open'
      )
      const gap = await d.eval(`(() => {
        const a = document.querySelector('#demo-popover-open').getBoundingClientRect()
        const p = document.querySelector('#demo-popover').getBoundingClientRect()
        return { below: p.top - a.bottom, left: p.left - a.left }
      })()`)
      assert(gap.below >= 0 && gap.below < 16, `popover should sit just below, offset ${gap.below}`)
      assert(
        Math.abs(gap.left) <= 1,
        `popover should align to the anchor start, offset ${gap.left}`
      )
      await d.click('#demo-popover input')
      assertEqual(await d.active(), 'input: ', 'focus moves into the popover')
      await d.key('Escape')
      await d.waitFor(
        "!document.querySelector('#demo-popover').matches(':popover-open')",
        'Escape to close the popover'
      )
      assertEqual(await d.active(), '#demo-popover-open', 'focus after the popover closes')
      await d.click('#demo-popover-open')
      await d.waitFor("document.querySelector('#demo-popover').matches(':popover-open')", 'reopen')
      await d.clickAt(6, 6)
      await d.waitFor(
        "!document.querySelector('#demo-popover').matches(':popover-open')",
        'an outside press to close the popover'
      )
    }
  },
  {
    name: 'Popover follows its anchor when the page scrolls',
    covers: ['StPopover'],
    async run(d) {
      await d.click('#demo-popover-open')
      await d.waitFor(
        "document.querySelector('#demo-popover').matches(':popover-open')",
        'popover to open'
      )
      await d.eval('window.scrollBy({ top: 120, behavior: "instant" })')
      await d.sleep(150)
      const gap = await d.eval(`(() => {
        const a = document.querySelector('#demo-popover-open').getBoundingClientRect()
        const p = document.querySelector('#demo-popover').getBoundingClientRect()
        return p.top - a.bottom
      })()`)
      assert(
        gap >= 0 && gap < 16,
        `the popover should stay below its anchor after scrolling, gap ${gap}`
      )
    }
  },
  {
    name: 'Tooltip shows on hover after a pause and on keyboard focus, and hides on Escape',
    covers: ['StTooltip'],
    async run(d) {
      const tip = "document.querySelector('.st-tooltip')"
      const { x, y } = await d.center('#demo-tooltip-trigger')
      await d.hover(x, y)
      await d.sleep(150)
      assert(
        !(await d.eval(`${tip}.matches(':popover-open')`)),
        'the tooltip showed before its delay'
      )
      await d.waitFor(`${tip}.matches(':popover-open')`, 'the tooltip after hovering')
      assertEqual(await d.eval(`${tip}.getAttribute('role')`), 'tooltip', 'tooltip role')
      assertEqual(
        await d.eval(
          "document.querySelector('#demo-tooltip-trigger').getAttribute('aria-describedby') === " +
            `${tip}.id`
        ),
        true,
        'the control is described by the tooltip'
      )
      await d.hover(6, 6)
      await d.waitFor(`!${tip}.matches(':popover-open')`, 'the tooltip to hide on leave')
      await d.key('Tab')
      await d.focus('#demo-tooltip-trigger')
      await d.waitFor(`${tip}.matches(':popover-open')`, 'the tooltip on keyboard focus')
      await d.key('Escape')
      await d.waitFor(`!${tip}.matches(':popover-open')`, 'Escape to hide the tooltip')
    }
  },
  {
    name: 'Toasts stack to three, announce by tone, and dismiss',
    covers: ['StToaster'],
    async run(d) {
      const toaster = "document.querySelector('.st-toaster')"
      await d.click('#demo-toast')
      await d.waitFor(`${toaster}.matches(':popover-open')`, 'the toaster to open')
      assertEqual(
        await d.eval(`${toaster}.querySelector('.st-toast').getAttribute('role')`),
        'status',
        'role'
      )
      await d.click('#demo-toast-danger')
      await d.waitFor("document.querySelectorAll('.st-toast').length === 2", 'a second toast')
      assertEqual(
        await d.eval(
          "document.querySelector('.st-toast[data-st-tone=danger]').getAttribute('role')"
        ),
        'alert',
        'a danger toast announces as an alert'
      )
      for (let i = 0; i < 3; i++) await d.click('#demo-toast')
      assertEqual(await d.eval("document.querySelectorAll('.st-toast').length"), 3, 'toasts shown')
      await d.eval(
        "document.querySelectorAll('.st-toast button[aria-label=Dismiss]').forEach((b) => b.click())"
      )
      await d.waitFor(`!${toaster}.matches(':popover-open')`, 'the toaster to close when empty')
    }
  },
  {
    name: 'Disclosure toggles with Enter and Space',
    covers: ['StDisclosure'],
    async run(d) {
      const open = "document.querySelector('#demo-disclosure').open"
      await d.focus('#demo-disclosure summary')
      await d.key('Enter')
      await d.waitFor(open, 'Enter to open the disclosure')
      await d.key(' ')
      await d.waitFor(`!${open}`, 'Space to close the disclosure')
    }
  },
  {
    name: 'Segmented control moves and selects with arrows, Home and End; one tab stop',
    covers: ['StSegmented'],
    async run(d) {
      const checked =
        "document.querySelector('.st-segmented [aria-checked=true]').textContent.trim()"
      assertEqual(
        await d.eval('document.querySelectorAll(\'.st-segmented [tabindex="0"]\').length'),
        1,
        'tab stops in the group'
      )
      await d.focus('.st-segmented [aria-checked=true]')
      const first = await d.eval(checked)
      await d.key('ArrowRight')
      assert((await d.eval(checked)) !== first, 'ArrowRight did not change the selection')
      assertEqual(await d.active(), `button: ${await d.eval(checked)}`, 'focus follows selection')
      await d.key('End')
      assertEqual(await d.eval(checked), 'Dark', 'End selects the last option')
      await d.key('ArrowRight')
      assertEqual(await d.eval(checked), 'System', 'ArrowRight wraps to the first option')
      await d.key('Home')
      assertEqual(await d.eval(checked), 'System', 'Home selects the first option')
    }
  },
  {
    name: 'Checkbox toggles with Space',
    covers: ['StCheckbox'],
    async run(d) {
      const box = '.st-checkbox:not([data-st-disabled]) input'
      await d.focus(box)
      const before = await d.eval(`document.querySelector('${box}').checked`)
      await d.key(' ')
      assertEqual(
        await d.eval(`document.querySelector('${box}').checked`),
        !before,
        'checked after Space'
      )
    }
  }
]
