import { describe, expect, it } from 'vitest'

import { MAX_STATE_BYTES, parsePageState, restoreScript } from './page-state'

const reply = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  path: '/a/page.html',
  scroll: { x: 0, y: 900 },
  areas: [{ key: 'div[2]', x: 0, y: 40 }],
  fields: [
    { key: '#answer', kind: 'input-text', value: 'my answer' },
    { key: 'body[1]/input[2]', kind: 'input-checkbox', value: true },
    { key: '#many', kind: 'select-multiple', value: ['a', 'b'] }
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

  it('drops fields of the wrong type, with a bad key, or too long, and keeps the rest', () => {
    const state = parsePageState(
      reply({
        fields: [
          { key: '#ok', kind: 'input-text', value: 'fine' },
          { key: '#n', kind: 'input-text', value: 5 },
          { key: '#c', kind: 'input-checkbox', value: 'yes' },
          { key: '"); alert(1); ("', kind: 'input-text', value: 'x' },
          { key: 'div[1]; x', kind: 'input-text', value: 'x' },
          { key: '#big', kind: 'textarea', value: 'x'.repeat(70_000) }
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

  it('cuts a state over the cap down by dropping the largest values first', () => {
    const big = (key: string, n: number): unknown => ({
      key,
      kind: 'textarea',
      value: 'x'.repeat(n)
    })
    const state = parsePageState(
      reply({
        fields: [
          big('#a', 60_000),
          big('#b', 60_000),
          big('#c', 60_000),
          big('#d', 60_000),
          big('#e', 60_000),
          big('#s', 10)
        ]
      })
    )
    expect(JSON.stringify(state).length).toBeLessThanOrEqual(MAX_STATE_BYTES)
    expect(state?.fields.map((f) => f.key)).toContain('#s')
    expect(state?.fields.length).toBeLessThan(6)
  })

  it('builds a restore script that carries a quote-laden value only as JSON', () => {
    const state = parsePageState(
      reply({ fields: [{ key: '#q', kind: 'input-text', value: '"); window.pwned = 1; ("' }] })
    )!
    const script = restoreScript(state)
    expect(script.endsWith(`})(${JSON.stringify(state)})`)).toBe(true)
    expect(script).not.toContain('"); window.pwned = 1; ("')
  })
})
