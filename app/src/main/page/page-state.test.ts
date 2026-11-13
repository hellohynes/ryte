import { describe, expect, it } from 'vitest'

import { parsePageState, restoreScript } from './page-state'

const reply = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  path: '/a/page.html',
  scroll: { x: 0, y: 900 },
  areas: [{ key: 'div[2]', x: 0, y: 40 }],
  fields: [
    { key: '#answer', kind: 'input-text', value: 'my answer' },
    { key: 'body[1]/input[2]', kind: 'input-checkbox', value: true },
    { key: '#size', kind: 'select-one', value: 'large' }
  ],
  ...over
})

describe('parsePageState', () => {
  it('takes a real reply as it is', () => {
    expect(parsePageState(reply())).toEqual(reply())
  })

  it('clamps scroll numbers and drops what is not a state', () => {
    expect(parsePageState(reply({ scroll: { x: -5, y: 1e12 } }))?.scroll).toEqual({
      x: 0,
      y: 10_000_000
    })
    expect(parsePageState(reply({ scroll: { x: 'a', y: 1 } }))).toBeNull()
    expect(parsePageState(null)).toBeNull()
    expect(parsePageState('x')).toBeNull()
  })

  it('drops fields of the wrong type, or with a bad key, and keeps the rest', () => {
    const state = parsePageState(
      reply({
        fields: [
          { key: '#ok', kind: 'input-text', value: 'fine' },
          { key: '#n', kind: 'input-text', value: 5 },
          { key: '#c', kind: 'input-checkbox', value: 'yes' },
          { key: '"); alert(1); ("', kind: 'input-text', value: 'x' },
          { key: 'div[1]; x', kind: 'input-text', value: 'x' }
        ]
      })
    )
    expect(state?.fields.map((f) => f.key)).toEqual(['#ok'])
  })

  it('never accepts a password, hidden or file input, even when the page says it is one', () => {
    const lies = ['input-password', 'input-hidden', 'input-file'].map((kind) => ({
      key: '#secret',
      kind,
      value: 'hunter2'
    }))
    expect(parsePageState(reply({ fields: lies }))?.fields).toEqual([])
  })

  it('refuses a reply over the cap, counted in bytes', () => {
    const field = (value: string): unknown => ({ key: '#a', kind: 'textarea', value })
    expect(parsePageState(reply({ fields: [field('x'.repeat(200_000))] }))).not.toBeNull()
    // 100,000 characters, but 300,000 bytes.
    expect(parsePageState(reply({ fields: [field('€'.repeat(100_000))] }))).toBeNull()
  })

  it('builds a restore script that carries a quote-laden value only as JSON', () => {
    const state = parsePageState(
      reply({ fields: [{ key: '#q', kind: 'input-text', value: '"); window.pwned = 1; ("' }] })
    )!
    const script = restoreScript(state)
    expect(script.endsWith(`${JSON.stringify(state)}, false)`)).toBe(true)
  })
})
