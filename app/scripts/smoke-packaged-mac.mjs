import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Exercise the shipped Electron ABI and ASAR module layout, without launching
// Ryte or opening any user profile, notes, credentials, or on-disk database.
const appPath = resolve(process.argv[2] ?? 'dist/mac-arm64/Ryte.app')
const archive = join(appPath, 'Contents', 'Resources', 'app.asar')
const executable = join(appPath, 'Contents', 'MacOS', 'Ryte')
const probe = String.raw`
  const assert = require('node:assert/strict');
  const { existsSync } = require('node:fs');
  const { createRequire } = require('node:module');
  const archive = process.argv[1];
  const shippedRequire = createRequire(archive + '/package.json');
  for (const name of ['better-sqlite3', 'sqlite-vec']) {
    assert.ok(shippedRequire.resolve(name).startsWith(archive + '/'), name + ' must resolve inside the shipped app');
  }
  const Database = shippedRequire('better-sqlite3');
  const sqliteVec = shippedRequire('sqlite-vec');
  const extension = sqliteVec.getLoadablePath()
    .replace(/\.dylib\.dylib$/, '.dylib')
    .replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2');
  assert.ok(existsSync(extension), 'sqlite-vec extension must exist outside ASAR');
  const db = new Database(':memory:');
  try {
    db.loadExtension(extension);
    assert.equal(typeof db.prepare('SELECT vec_version() AS v').get().v, 'string');
    db.exec('CREATE VIRTUAL TABLE vectors USING vec0(embedding float[3])');
    db.prepare('INSERT INTO vectors(rowid, embedding) VALUES (?, ?)').run(1n, new Float32Array([1, 0, 0]));
    assert.equal(db.prepare('SELECT rowid FROM vectors WHERE embedding MATCH ? AND k = 1')
      .get(new Float32Array([1, 0, 0])).rowid, 1);
    db.exec("CREATE VIRTUAL TABLE notes USING fts5(text); INSERT INTO notes(text) VALUES ('synthetic packaging fixture')");
    assert.equal(db.prepare("SELECT count(*) AS n FROM notes WHERE notes MATCH 'synthetic'").get().n, 1);
    console.log('Packaged native smoke passed: SQLite, sqlite-vec, vector query, keyword query.');
  } finally {
    db.close();
  }
`

const result = spawnSync(executable, ['-e', probe, archive], {
  cwd: tmpdir(),
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_PATH: '' },
  stdio: 'inherit',
  timeout: 30_000
})
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
