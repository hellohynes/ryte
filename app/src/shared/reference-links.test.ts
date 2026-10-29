import { describe, expect, it } from 'vitest'

import { isReferenceLinkBase, referenceLabel, referenceUrl } from './reference-links'

const bases = {
  ticket: 'https://example.atlassian.net/browse/',
  pullRequest: 'https://github.com/example/repo/pull'
}

describe('referenceUrl', () => {
  it('links a ticket key under the ticket base', () => {
    expect(referenceUrl('DDT-2440', bases)).toBe('https://example.atlassian.net/browse/DDT-2440')
  })

  it('links "PR #252", "PR 252" and "#252" under the pull request base, with or without a slash', () => {
    for (const text of ['PR #252', 'PR 252', 'PR#252', '#252']) {
      expect(referenceUrl(text, bases)).toBe('https://github.com/example/repo/pull/252')
    }
  })

  it('does not link when the matching base is not set', () => {
    expect(referenceUrl('DDT-1', { ...bases, ticket: '' })).toBeNull()
    expect(referenceUrl('PR #1', { ...bases, pullRequest: '' })).toBeNull()
  })

  it('does not link text that is not a ticket key or a pull request number', () => {
    for (const text of ['ddt-1', 'DDT-', 'PR #12/../x', 'DDT-1?next=evil', 'see DDT-1', '']) {
      expect(referenceUrl(text, bases)).toBeNull()
    }
  })

  it('refuses a base that is not a plain https address', () => {
    expect(referenceUrl('DDT-1', { ...bases, ticket: 'http://example.com/browse/' })).toBeNull()
    expect(referenceUrl('DDT-1', { ...bases, ticket: 'javascript:alert(1)//' })).toBeNull()
  })
})

describe('full addresses', () => {
  const none = { ticket: '', pullRequest: '' }

  it('links a GitHub pull request or issue address with no settings, and labels it owner/repo#n', () => {
    const pr = 'https://github.com/hellohynes/ryte/pull/23'
    expect(referenceUrl(pr, none)).toBe(pr)
    expect(referenceLabel(pr)).toBe('hellohynes/ryte#23')
    expect(referenceUrl('https://github.com/dialpad/firespotter/issues/9?x=1#top', none)).toBe(
      'https://github.com/dialpad/firespotter/issues/9'
    )
  })

  it('links an Atlassian Cloud ticket address and labels it with the key', () => {
    const ticket = 'https://dialpad.atlassian.net/browse/DDT-1234'
    expect(referenceUrl(ticket, none)).toBe(ticket)
    expect(referenceLabel(ticket)).toBe('dialpad/DDT-1234')
  })

  it('puts the Atlassian tenant in the label, so a look-alike site cannot pass for yours', () => {
    expect(referenceLabel('https://evil.atlassian.net/browse/DDT-1')).toBe('evil/DDT-1')
    expect(referenceLabel('https://dialpad.atlassian.net/browse/DDT-1')).not.toBe(
      referenceLabel('https://evil.atlassian.net/browse/DDT-1')
    )
  })

  it('links the pull request pages a model is likely to copy: trailing slash, Files, Commits, Checks', () => {
    for (const tail of ['/', '/files', '/commits', '/checks', '/files/']) {
      expect(referenceUrl(`https://github.com/dialpad/ryte/pull/7${tail}`, none)).toBe(
        'https://github.com/dialpad/ryte/pull/7'
      )
    }
    expect(referenceUrl('https://github.com/dialpad/ryte/pull/7/files/extra', none)).toBeNull()
    expect(referenceUrl('https://github.com/dialpad/ryte/issues/7/files', none)).toBe(
      'https://github.com/dialpad/ryte/issues/7'
    )
  })

  it('does not link any other address, and labels it with its host', () => {
    for (const text of [
      'http://github.com/a/b/pull/1',
      'https://github.com.evil.example/a/b/pull/1',
      'https://evil.example/a/b/pull/1',
      'https://user:pw@github.com/a/b/pull/1',
      'https://github.com:8443/a/b/pull/1',
      'https://github.com/a/b/blob/main/x.md',
      'https://github.com/a/b/pull/1/../../x',
      'https://evil.atlassian.net.example/browse/DDT-1',
      'https://dialpad.atlassian.net/browse/ddt-1'
    ]) {
      expect(referenceUrl(text, none)).toBeNull()
    }
    expect(referenceLabel('https://evil.example/a/b/pull/1')).toBe('evil.example')
  })

  it('keeps bare keys and numbers labelled as written', () => {
    expect(referenceLabel('DDT-1')).toBe('DDT-1')
    expect(referenceLabel('PR #12')).toBe('PR #12')
  })
})

describe('isReferenceLinkBase', () => {
  it('accepts an empty value (linking off) and plain https addresses', () => {
    expect(isReferenceLinkBase('')).toBe(true)
    expect(isReferenceLinkBase('https://example.atlassian.net/browse/')).toBe(true)
  })

  it('rejects other schemes, credentials, whitespace, non-strings and overlong values', () => {
    for (const value of [
      'http://example.com/',
      'javascript:alert(1)',
      'file:///etc/passwd',
      'https://user:pass@example.com/',
      'https://exa mple.com/',
      'example.com/browse/',
      42,
      null,
      `https://example.com/${'a'.repeat(300)}`
    ]) {
      expect(isReferenceLinkBase(value)).toBe(false)
    }
  })
})
