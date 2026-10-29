import { describe, expect, it } from 'vitest'

import { placeFloating } from './anchored-position'
import { createLayerStack } from './layer-stack'
import { listTarget, scrollTopToReveal } from './list-navigation'
import { rovingTarget } from './roving'
import { isTypeaheadKey, typeaheadMatch, typeaheadStep, type TypeaheadState } from './typeahead'

describe('layer stack', () => {
  it('lets only the most recently opened layer be the top', () => {
    const stack = createLayerStack()
    const dialog = Symbol('dialog')
    const menu = Symbol('menu')
    stack.push(dialog)
    stack.push(menu)
    expect(stack.isTop(menu)).toBe(true)
    expect(stack.isTop(dialog)).toBe(false)
    stack.remove(menu)
    expect(stack.isTop(dialog)).toBe(true)
  })

  it('ignores a layer pushed twice and removing one that is not there', () => {
    const stack = createLayerStack()
    const a = Symbol('a')
    stack.push(a)
    stack.push(a)
    stack.remove(Symbol('other'))
    expect(stack.size).toBe(1)
  })
})

describe('rovingTarget', () => {
  it('wraps at both ends by default', () => {
    expect(rovingTarget('ArrowDown', 2, 3)).toBe(0)
    expect(rovingTarget('ArrowUp', 0, 3)).toBe(2)
  })

  it('stops at the ends when wrap is off', () => {
    expect(rovingTarget('ArrowDown', 2, 3, { wrap: false })).toBe(2)
    expect(rovingTarget('ArrowUp', 0, 3, { wrap: false })).toBe(0)
  })

  it('answers only the arrows of its orientation', () => {
    expect(rovingTarget('ArrowRight', 0, 3, { orientation: 'vertical' })).toBeNull()
    expect(rovingTarget('ArrowDown', 0, 3, { orientation: 'horizontal' })).toBeNull()
    expect(rovingTarget('ArrowRight', 0, 3, { orientation: 'horizontal' })).toBe(1)
    expect(rovingTarget('ArrowLeft', 1, 3, { orientation: 'both' })).toBe(0)
    expect(rovingTarget('ArrowDown', 1, 3, { orientation: 'both' })).toBe(2)
  })

  it('jumps with Home and End and ignores other keys and empty groups', () => {
    expect(rovingTarget('Home', 2, 5)).toBe(0)
    expect(rovingTarget('End', 0, 5)).toBe(4)
    expect(rovingTarget('a', 0, 5)).toBeNull()
    expect(rovingTarget('ArrowDown', 0, 0)).toBeNull()
  })
})

describe('typeahead', () => {
  const labels = ['Copy file', 'Copy file path', 'Rename', 'Show in Finder', 'Move to Trash']

  it('builds a buffer that resets after a pause', () => {
    let state: TypeaheadState = { buffer: '', at: 0 }
    state = typeaheadStep(state, 'r', 1000)
    state = typeaheadStep(state, 'e', 1200)
    expect(state.buffer).toBe('re')
    expect(typeaheadStep(state, 's', 2000).buffer).toBe('s')
  })

  it('does not start a search with a space', () => {
    const state: TypeaheadState = { buffer: '', at: 0 }
    expect(typeaheadStep(state, ' ', 100)).toBe(state)
  })

  it('moves to the next label that starts with the letter, wrapping', () => {
    expect(typeaheadMatch(labels, 'c', 2)).toBe(0)
    expect(typeaheadMatch(labels, 'c', 0)).toBe(1)
    expect(typeaheadMatch(labels, 'm', 0)).toBe(4)
  })

  it('matches a longer prefix from the current item', () => {
    expect(typeaheadMatch(labels, 'copy file p', 0)).toBe(1)
    expect(typeaheadMatch(labels, 'zz', 0)).toBeNull()
  })

  it('cycles when one letter is repeated', () => {
    expect(typeaheadMatch(labels, 'cc', 0)).toBe(1)
  })

  it('treats only a bare printable key as typing', () => {
    expect(isTypeaheadKey({ key: 'a', ctrlKey: false, metaKey: false, altKey: false })).toBe(true)
    expect(isTypeaheadKey({ key: 'a', ctrlKey: false, metaKey: true, altKey: false })).toBe(false)
    expect(isTypeaheadKey({ key: 'Enter', ctrlKey: false, metaKey: false, altKey: false })).toBe(
      false
    )
  })
})

describe('list navigation', () => {
  it('pages by ten and clamps', () => {
    expect(listTarget('PageDown', 0, 50)).toBe(10)
    expect(listTarget('PageDown', 45, 50)).toBe(49)
    expect(listTarget('PageUp', 3, 50)).toBe(0)
  })

  it('wraps arrows unless looping is off', () => {
    expect(listTarget('ArrowDown', 4, 5)).toBe(0)
    expect(listTarget('ArrowDown', 4, 5, false)).toBe(4)
  })

  it('keeps the scroll position when the item is already visible, and never goes negative', () => {
    const base = { viewportHeight: 200, itemHeight: 40, margin: 8 }
    expect(scrollTopToReveal({ ...base, scrollTop: 100, itemTop: 130 })).toBe(100)
    expect(scrollTopToReveal({ ...base, scrollTop: 20, itemTop: 4 })).toBe(0)
  })

  it('scrolls only as far as needed to show an item', () => {
    const base = { viewportHeight: 200, itemHeight: 40, margin: 8 }
    expect(scrollTopToReveal({ ...base, scrollTop: 0, itemTop: 100 })).toBe(0)
    expect(scrollTopToReveal({ ...base, scrollTop: 0, itemTop: 300 })).toBe(148)
    expect(scrollTopToReveal({ ...base, scrollTop: 300, itemTop: 100 })).toBe(92)
  })
})

describe('placeFloating', () => {
  const viewport = { width: 800, height: 600 }
  const size = { width: 200, height: 260 }
  const at = (x: number, y: number): { x: number; y: number; width: number; height: number } => ({
    x,
    y,
    width: 0,
    height: 0
  })

  it('puts a menu at the pointer when it fits', () => {
    expect(placeFloating({ anchor: at(120, 80), size, viewport, offset: 0 })).toMatchObject({
      left: 120,
      top: 80
    })
  })

  it('keeps a menu inside the right and top-left edges, opening upward near the bottom', () => {
    // Near the bottom edge the menu opens upward from the pointer instead of sliding over it.
    expect(placeFloating({ anchor: at(790, 590), size, viewport, offset: 0 })).toMatchObject({
      left: 592,
      top: 330,
      side: 'top'
    })
    expect(placeFloating({ anchor: at(-10, -20), size, viewport, offset: 0 })).toMatchObject({
      left: 8,
      top: 8
    })
  })

  it('flips above the anchor when there is no room below and more above', () => {
    const anchor = { x: 100, y: 540, width: 80, height: 24 }
    const result = placeFloating({ anchor, size: { width: 160, height: 120 }, viewport })
    expect(result.side).toBe('top')
    expect(result.top).toBe(540 - 120 - 4)
  })

  it('stays below when neither side has room, rather than flipping to the worse one', () => {
    const anchor = { x: 100, y: 20, width: 80, height: 24 }
    const result = placeFloating({
      anchor,
      size: { width: 160, height: 700 },
      viewport: { width: 800, height: 600 }
    })
    expect(result.side).toBe('bottom')
  })

  it('aligns to the end of the anchor', () => {
    const anchor = { x: 300, y: 100, width: 100, height: 30 }
    const result = placeFloating({
      anchor,
      size: { width: 160, height: 80 },
      viewport,
      align: 'end'
    })
    expect(result.left).toBe(300 + 100 - 160)
    expect(result.top).toBe(100 + 30 + 4)
  })
})
