import { describe, expect, it } from 'vitest'

import { isAllowedLocalRequest } from './local-rules'

const origin = 'http://localhost:5173'

describe('isAllowedLocalRequest', () => {
  it('allows the approved origin over http and its live-reload socket', () => {
    expect(isAllowedLocalRequest('http://localhost:5173/', origin)).toBe(true)
    expect(isAllowedLocalRequest('http://localhost:5173/src/main.js?t=1', origin)).toBe(true)
    expect(isAllowedLocalRequest('ws://localhost:5173/?token=abc', origin)).toBe(true)
  })

  it.each([
    ['another port', 'http://localhost:3000/'],
    ['127.0.0.1 for a localhost approval', 'http://127.0.0.1:5173/'],
    ['an internet host', 'https://example.com/'],
    ['a look-alike host', 'http://localhost.example.com:5173/'],
    ['the secure scheme on the same port', 'https://localhost:5173/'],
    ['a web socket to another port', 'ws://localhost:3000/'],
    ['credentials in the address', 'http://user@localhost:5173/'],
    ['ryte-file', 'ryte-file://notes/secret.md'],
    ['ryte-page', 'ryte-page://0123456789abcdef0123456789abcdef/index.html'],
    ['file', 'file:///etc/hosts']
  ])('cancels %s', (_name, url) => {
    expect(isAllowedLocalRequest(url, origin)).toBe(false)
  })

  it('allows the default port when the address leaves it out', () => {
    expect(isAllowedLocalRequest('http://localhost/', 'http://localhost:80')).toBe(true)
    expect(isAllowedLocalRequest('wss://localhost/', 'https://localhost:443')).toBe(true)
  })
})
