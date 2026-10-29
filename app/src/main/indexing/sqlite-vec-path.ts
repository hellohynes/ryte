/**
 * Electron can require JavaScript from app.asar, but SQLite loads extensions
 * through the filesystem. electron-builder puts vec0.dylib in app.asar.unpacked,
 * so translate only that archive segment before calling loadExtension().
 */
export function resolveSQLiteVecLoadablePath(loadablePath: string): string {
  return loadablePath
    .replace(/\.dylib\.dylib$/, '.dylib')
    .replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2')
}
