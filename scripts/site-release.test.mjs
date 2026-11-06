import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dmgName, downloadUrl, fillRelease, siteVersion, versionFromRelease } from './site-release.mjs'

const release = (overrides = {}) => ({
  tag_name: 'v0.2.0',
  draft: false,
  prerelease: false,
  assets: [{ name: 'ryte-0.2.0-arm64.dmg' }, { name: 'ryte-0.2.0-arm64.dmg.sha256' }],
  ...overrides
})
const reply = (body, status = 200) => async () => ({ ok: status < 400, status, json: async () => body })

test('fillRelease fills every placeholder', () => {
  const html = '<a href="{{download-url}}">Get</a> Version {{version}} <a href="{{download-url}}">Again</a>'
  assert.equal(
    fillRelease(html, '0.3.1'),
    `<a href="${downloadUrl('0.3.1')}">Get</a> Version 0.3.1 <a href="${downloadUrl('0.3.1')}">Again</a>`
  )
  assert.equal(downloadUrl('0.3.1'), 'https://github.com/hellohynes/ryte/releases/download/v0.3.1/ryte-0.3.1-arm64.dmg')
})

test('fillRelease rejects an unknown placeholder and a bad version', () => {
  assert.throws(() => fillRelease('{{nope}}', '0.2.0'), /Unknown site placeholder/)
  assert.throws(() => fillRelease('{{version', '0.2.0'), /malformed/)
  assert.throws(() => fillRelease('x', '0.2.0-rc.1'), /not a plain x\.y\.z/)
})

test('versionFromRelease needs a vX.Y.Z tag, a published release and the DMG attached', () => {
  assert.equal(versionFromRelease(release()), '0.2.0')
  assert.throws(() => versionFromRelease(release({ tag_name: 'v0.3.0-rc.1' })), /not vX\.Y\.Z/)
  assert.throws(() => versionFromRelease(release({ prerelease: true })), /draft or prerelease/)
  assert.throws(() => versionFromRelease(release({ draft: true })), /draft or prerelease/)
  assert.throws(() => versionFromRelease(release({ assets: [] })), new RegExp(dmgName('0.2.0')))
  assert.throws(() => versionFromRelease(undefined), /not vX\.Y\.Z/)
})

test('siteVersion reads the latest release, and sends the token only when there is one', async () => {
  let sent
  const spy = async (url, init) => {
    sent = { url, init }
    return reply(release())()
  }
  assert.equal(await siteVersion({}, spy), '0.2.0')
  assert.match(sent.url, /\/repos\/hellohynes\/ryte\/releases\/latest$/)
  assert.equal(sent.init.headers.authorization, undefined)
  await siteVersion({ GITHUB_TOKEN: 't' }, spy)
  assert.equal(sent.init.headers.authorization, 'Bearer t')
})

test('siteVersion fails closed when GitHub does not answer or the release is unusable', async () => {
  await assert.rejects(siteVersion({}, reply({}, 403)), /403.*RYTE_SITE_VERSION/)
  await assert.rejects(siteVersion({}, async () => { throw new Error('offline') }), /offline.*RYTE_SITE_VERSION/)
  await assert.rejects(siteVersion({}, reply(release({ assets: [] }))), /no ryte-0\.2\.0-arm64\.dmg/)
})

test('RYTE_SITE_VERSION overrides the lookup and must be x.y.z', async () => {
  const never = async () => assert.fail('must not call GitHub')
  assert.equal(await siteVersion({ RYTE_SITE_VERSION: '1.2.3' }, never), '1.2.3')
  await assert.rejects(siteVersion({ RYTE_SITE_VERSION: 'latest' }, never), /plain x\.y\.z/)
})
