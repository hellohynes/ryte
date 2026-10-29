# Releasing Ryte for macOS

Ryte currently publishes an Apple Silicon (`arm64`) DMG through GitHub Releases without an Apple-verified developer identity or notarization. The app is ad-hoc signed to seal the packaged bundle. No Apple Developer membership, signing certificate, API key, or Apple secrets are required for this workflow. It is not a Mac App Store build and it does not include Intel support.

## One-time GitHub setup

1. In repository Settings → Environments, create an environment named `release`. It can have no secrets or variables. Add required reviewers only if releases should wait for approval.
2. Confirm GitHub Actions can create releases. The workflow requests `contents: write`; repository settings must not restrict that permission.
3. Make the repository public if people should be able to download the DMG without a GitHub account.

## Icon asset maintenance

Ryte’s custom icon is already included. For a future refresh, provide the source as either:

- a 1024 by 1024 transparent PNG (preferred), or
- an SVG on a square canvas.

Do not bake the macOS rounded-square mask into the source artwork. Regenerate and commit the matching `app/resources/icon.png`, `app/build/icon.png`, and `app/build/icon.icns` from that source while preserving PNG transparency. The application uses the PNG for the development Dock icon; electron-builder uses the `.icns` for the packaged app and DMG.

## Local package check

Build the same unsigned package used by the release workflow from the repository root:

```bash
pnpm dmg:local
```

The resulting file is `app/dist/ryte-<version>-arm64.dmg`. The local command uses an explicit ad-hoc signing identity (`-`), disables notarization and hardened runtime, and runs `codesign --verify --deep --strict` on the staging app before the packaged native search smoke. It removes electron-builder's generated `app/dist/mac-arm64/` staging app only after these checks succeed; use `pnpm build:unpack` when you intentionally need that unpacked app for debugging. The package has no Apple-verified developer identity and is not notarized, so macOS may block its first launch.

Do not set `mac.identity=null` for Apple Silicon packages. That skips signing after electron-builder changes Electron's bundle, leaving it without a valid signature for the packaged app. A successful DMG integrity check or native search smoke does not verify the bundle's signature or Gatekeeper acceptance.

Ad-hoc signatures have no Team ID. With hardened runtime enabled, dyld can reject the Electron Framework with “mapping process and mapped file (non-platform) have different Team IDs,” even when signature verification passes. The ad-hoc package command disables hardened runtime to avoid this launch failure. The shared configuration keeps hardened runtime enabled for Developer ID builds; do not disable it there.

PR CI runs the same package command and packaged native launch smoke before release. This checks signature integrity and actual framework/native-library loading, but does not cover Gatekeeper's treatment of a browser download.

## Publishing a release

Both the local and signed packaging commands run `smoke:packaged` before reporting success. This uses the packaged Electron executable and shipped dependencies to load SQLite and sqlite-vec and execute vector and keyword queries in memory. It does not launch Ryte or access a user profile or notes. The Apple Silicon sqlite-vec binary is a direct optional dependency so the packaging dependency collector includes it; `asarUnpack` keeps it on the filesystem where SQLite can load it.

1. Update `app/package.json` to the intended pre-1.0 version, such as `0.5.0`, record the release highlights in `CHANGELOG.md`, and ensure the current icon assets are included.
2. On the release branch, run the full local check:

   ```bash
   pnpm --dir app validate
   pnpm --dir app smoke:indexer
   pnpm dmg:local
   ```

3. Open, review, merge, and sync the release change to `main`.
4. Create and push a matching annotated tag from synchronized `main`:

   ```bash
   git tag -a v0.5.0 -m "Ryte v0.5.0"
   git push origin v0.5.0
   ```

5. Open the repository's Actions tab and watch **Release macOS**. Approve the `release` environment if required reviewers are configured. The workflow builds an ad-hoc signed Apple Silicon app, verifies its signature, runs the packaged native search smoke, verifies the DMG, generates a SHA-256 checksum, and publishes both files. The release title retains the unsigned label; the notes explain the ad-hoc signature and lack of notarization.
6. Download the DMG through a browser on a clean Apple Silicon Mac so the download receives macOS quarantine metadata. Drag Ryte to Applications and run `codesign --verify --deep --strict --verbose=2 /Applications/Ryte.app`. Launch it using the first-launch steps below, then select a synthetic notes folder and confirm keyword search works without API keys. Include macOS 15.7.4 when checking the reported damaged-app warning. A local unquarantined build alone does not cover this reproduction.

Never retag a published release. Create the next pre-1.0 version instead.

## First launch of an unsigned build

Open the downloaded DMG and drag Ryte to Applications. If macOS blocks the app because its developer cannot be verified, open System Settings → Privacy & Security and use **Open Anyway** for Ryte after attempting to launch it. See [Apple's instructions](https://support.apple.com/102445) for the full flow. The checksum verifies the downloaded file's integrity; it does not provide an Apple-verified developer identity.

### If macOS says “Ryte is damaged”

This warning can refer to the app inside the DMG rather than a corrupt disk image. Ryte 0.5.0 disabled app signing, and downloaded builds also lack notarization. Ad-hoc signing repairs the packaged bundle's signature but does not grant Gatekeeper approval.

Download the DMG and its matching `.dmg.sha256` file from the same Ryte GitHub Release. In Terminal, change to the download directory and verify the checksum (replace `<version>` with the downloaded version):

```bash
shasum -a 256 ryte-<version>-arm64.dmg
```

Compare the full 64-character hash with the hash in the downloaded `.dmg.sha256` file. The checksum file records a `dist/` filename prefix from the build runner; only the hash needs to match. If the hashes differ, delete the download and fetch it again; do not override the warning.

If the checksum matches, you trust that release, and **Open Anyway** is unavailable, remove quarantine from only the installed copy of Ryte:

```bash
xattr -d com.apple.quarantine /Applications/Ryte.app
```

Then launch Ryte from Applications. This bypasses the quarantine check for that copy of Ryte; it does not sign or notarize it. Do not disable Gatekeeper globally. Public downloads need Developer ID signing and notarization to avoid requiring this exception.

## Future signed releases

The local `pnpm --dir app release:mac:arm64` command remains available for signing and notarization. It requires a Developer ID Application certificate exported with its private key as a password-protected `.p12`, plus an App Store Connect Team API key with its `.p8` file, Key ID, and Issuer ID. Its environment check requires `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER`.

The current GitHub workflow does not use that command or any Apple credentials. Switching public releases to signing requires updating the workflow to restore the API key securely, use the signed package command, and run `scripts/verify-mac-release.mjs` before publishing.
