import { describe, expect, it } from 'vitest'

import { parseLocalAddress, parseTypedLocalAddress } from './local-address'

describe('parseLocalAddress', () => {
  it.each([
    ['http://localhost:5173', 'http://localhost:5173'],
    ['http://127.0.0.1:3000/app', 'http://127.0.0.1:3000'],
    ['http://[::1]:8080', 'http://[::1]:8080'],
    ['https://localhost:8443/', 'https://localhost:8443']
  ])('%s is local', (input, origin) => {
    expect(parseLocalAddress(input)?.origin).toBe(origin)
  })

  it.each([
    'http://0.0.0.0:5173',
    'http://localhost.example.com:5173',
    'http://example.com',
    'http://user@localhost:5173',
    'file:///etc/passwd',
    'ftp://localhost:21',
    'ryte-file://x/y',
    'localhost:5173',
    ''
  ])('%s is not local', (input) => {
    expect(parseLocalAddress(input)).toBeNull()
  })

  it('fills in the default port', () => {
    expect(parseLocalAddress('http://localhost')?.origin).toBe('http://localhost:80')
    expect(parseLocalAddress('https://127.0.0.1')?.origin).toBe('https://127.0.0.1:443')
  })

  it('keeps the same origin for any path, query or fragment', () => {
    const origins = ['http://localhost:5173', 'http://localhost:5173/a/b?x=1#top'].map(
      (url) => parseLocalAddress(url)?.origin
    )
    expect(new Set(origins)).toEqual(new Set(['http://localhost:5173']))
  })

  it('treats localhost and 127.0.0.1 as different origins', () => {
    expect(parseLocalAddress('http://localhost:5173')?.origin).not.toBe(
      parseLocalAddress('http://127.0.0.1:5173')?.origin
    )
  })
})

describe('parseTypedLocalAddress', () => {
  it('takes a bare address as http', () => {
    expect(parseTypedLocalAddress('localhost:5173')?.url).toBe('http://localhost:5173/')
    expect(parseTypedLocalAddress(' 127.0.0.1:3000/x ')?.origin).toBe('http://127.0.0.1:3000')
  })

  it('refuses ordinary text and other hosts', () => {
    expect(parseTypedLocalAddress('meeting notes')).toBeNull()
    expect(parseTypedLocalAddress('example.com:5173')).toBeNull()
    expect(parseTypedLocalAddress('file:///tmp/a')).toBeNull()
  })
})
