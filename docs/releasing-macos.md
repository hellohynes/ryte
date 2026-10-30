# Releasing Ryte for macOS

Ryte publishes an Apple Silicon (`arm64`) DMG through GitHub Releases. The app inside is signed with an Apple Developer ID Application certificate and notarized by Apple, so macOS opens a downloaded copy without the "damaged" or "unidentified developer" warnings. It is not a Mac App Store build and it does not include Intel support.

The release workflow reads the signing credentials from the `release` environment of this repository. The sections below cover the one-time setup, a local trial, and the publishing steps.

## One-time setup

### Apple

Needs an Apple Developer Program membership held by you as Account Holder.

1. **Developer ID Application certificate.**
   - In Keychain Access, choose **Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority**. Use your Apple ID email, save to disk, and leave the CA email empty.
   - On `developer.apple.com/account` → **Certificates, IDs & Profiles** → **Certificates** → **+**, choose **Developer ID Application** (not Installer), profile type **G2 Sub-CA**, upload the request, and download the `.cer`.
   - Double-click the `.cer` to add it to your login keychain. If it shows "not trusted", or `security find-identity -v -p codesigning` reports 0 valid identities, install Apple's **Developer ID - G2** intermediate certificate from `https://www.apple.com/certificateauthority/` (`security add-certificates -k ~/Library/Keychains/login.keychain-db DeveloperIDG2CA.cer`). Do not set manual trust on any certificate.
   - Export the certificate (the row that has a private key under it) from **My Certificates** as a `.p12` and choose an export password.
2. **App Store Connect API key.** On `appstoreconnect.apple.com` → **Users and Access** → **Integrations** → **Team Keys**, generate a key with **Developer** access. Download the `.p8` once (Apple will not offer it again) and write down the **Key ID** and the **Issuer ID**.

Keep the `.p8` and the `.p12` password in a password manager. Delete the exported `.p12` after the secrets below are stored. The certificate expires on 2027-11-28; create and export a new one and update `CSC_LINK` and `CSC_KEY_PASSWORD` before then.

### GitHub

1. In repository **Settings → Environments**, create an environment named `release`. Under **Deployment branches and tags**, choose **Selected branches and tags** and add a **tag** rule `v*`, so only a release tag can read the secrets. Add required reviewers only if releases should wait for approval.
2. Add these **environment secrets** to `release`. Never put them in the repository or paste them into issues or chat.

   | Secret | Value |
   |---|---|
   | `CSC_LINK` | The `.p12`, base64 encoded (`base64 -i ryte-developer-id.p12 \| pbcopy`) |
   | `CSC_KEY_PASSWORD` | The `.p12` export password |
   | `APPLE_API_KEY` | The full text of the `.p8` file, including the BEGIN and END lines |
   | `APPLE_API_KEY_ID` | The API key's Key ID |
   | `APPLE_API_ISSUER` | The App Store Connect Issuer ID |

3. Confirm GitHub Actions can create releases. The workflow requests `contents: write`; repository settings must not restrict that permission.
4. Keep the repository public so people can download the DMG without a GitHub account.

## Icon asset maintenance

Ryte’s custom icon is already included. For a future refresh, provide the source as either:

- a 1024 by 1024 transparent PNG (preferred), or
- an SVG on a square canvas.

Do not bake the macOS rounded-square mask into the source artwork. Regenerate and commit the matching `app/resources/icon.png`, `app/build/icon.png`, and `app/build/icon.icns` from that source while preserving PNG transparency. The application uses the PNG for the development Dock icon; electron-builder uses the `.icns` for the packaged app and DMG.

## Local package check

Build the ad-hoc signed package used by pull request CI from the repository root:

```bash
pnpm dmg:local
```

The resulting file is `app/dist/ryte-<version>-arm64.dmg`. The local command uses an explicit ad-hoc signing identity (`-`), disables notarization and hardened runtime, and runs `codesign --verify --deep --strict` on the staging app before the packaged native search smoke. It removes electron-builder's generated `app/dist/mac-arm64/` staging app only after these checks succeed; use `pnpm build:unpack` when you intentionally need that unpacked app for debugging. This package has no Apple-verified identity and is not notarized, so it is for installer checks, not distribution.

Do not set `mac.identity=null` for Apple Silicon packages. That skips signing after electron-builder changes Electron's bundle, leaving it without a valid signature for the packaged app. A successful DMG integrity check or native search smoke does not verify the bundle's signature or Gatekeeper acceptance.

Ad-hoc signatures have no Team ID. With hardened runtime enabled, dyld can reject the Electron Framework with “mapping process and mapped file (non-platform) have different Team IDs,” even when signature verification passes. The ad-hoc package command disables hardened runtime to avoid this launch failure. The shared configuration keeps hardened runtime enabled for Developer ID builds; do not disable it there.

PR CI runs the same package command and packaged native launch smoke before release. This checks signature integrity and actual framework/native-library loading, but does not use signing credentials or cover Gatekeeper's treatment of a browser download.

## Trying a signed build on your Mac

To prove the credentials work without publishing anything, set the five values in one terminal (the secrets stay in that shell only) and build:

```bash
cd app
export CSC_LINK="$HOME/path/to/ryte-developer-id.p12"
read -s "CSC_KEY_PASSWORD?p12 password: "; export CSC_KEY_PASSWORD
export APPLE_API_KEY="$HOME/path/to/AuthKey_XXXXXXXXXX.p8"
export APPLE_API_KEY_ID="XXXXXXXXXX"
export APPLE_API_ISSUER="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
pnpm release:mac:arm64
```

`release:mac:arm64` checks that all five values are present, then builds, signs, notarizes, staples, and runs the packaged native smoke. The notarization wait depends on Apple and can take several minutes; a first submission from a new account can take much longer. Then verify:

```bash
RELEASE_VERSION=<version> node scripts/verify-mac-release.mjs
spctl -a -t exec -vv dist/mac-arm64/Ryte.app     # accepted, source=Notarized Developer ID
xcrun stapler validate dist/mac-arm64/Ryte.app   # The validate action worked!
```

The DMG file itself is not separately signed or stapled; Gatekeeper judges the notarized app inside it.

## Publishing a release

Version rules are in the Versioning Policy in `CHANGELOG.md`.

1. Update `app/package.json` to the intended version and record the release highlights in `CHANGELOG.md`.
2. On the release branch, run the full local check:

   ```bash
   pnpm --dir app validate
   pnpm --dir app smoke:indexer
   pnpm dmg:local
   ```

3. Open, review, merge, and sync the release change to `main`.
4. **Dry run.** Push a tag with a suffix from synchronized `main`, for example `v0.1.0-rc.1` for version `0.1.0`:

   ```bash
   git tag -a v0.1.0-rc.1 -m "Ryte v0.1.0 dry run 1"
   git push origin v0.1.0-rc.1
   ```

   The **Release macOS** workflow builds, signs, notarizes, and verifies exactly as for a real release but publishes nothing. It uploads the DMG as the `ryte-dry-run-dmg` workflow artifact, kept for three days. Download it in a browser on a clean Apple Silicon Mac and confirm it opens without a warning. Then delete the dry-run tag (`git push origin :refs/tags/v0.1.0-rc.1` and `git tag -d v0.1.0-rc.1`); it was never a published release.
5. **Release.** Create and push the matching annotated tag from synchronized `main`:

   ```bash
   git tag -a v0.1.0 -m "Ryte v0.1.0"
   git push origin v0.1.0
   ```

6. Watch **Release macOS** in the repository's Actions tab. Approve the `release` environment if required reviewers are configured. The workflow runs the same steps, then verifies the app and DMG with `scripts/verify-mac-release.mjs`, generates a SHA-256 checksum, and publishes both files as a GitHub release.
7. Download the DMG through a browser on a clean Apple Silicon Mac so the download receives macOS quarantine metadata. Drag Ryte to Applications, open it, and confirm there is no Gatekeeper warning. Run `codesign --verify --deep --strict --verbose=2 /Applications/Ryte.app` and `spctl -a -t exec -vv /Applications/Ryte.app`, then select a synthetic notes folder and confirm keyword search works without API keys.

Never retag a published release. Fix a bad release with the next patch version.

## When a release build fails

- **"A notarized Ryte release requires: …"**: a secret is missing or empty in the `release` environment. Check the five names in the table above.
- **0 valid identities, or "not trusted"**: Apple's Developer ID G2 intermediate is missing from the keychain. Install it as described under One-time setup.
- **Notarization status "Invalid"**: run `xcrun notarytool log <submission-id> --key … --key-id … --issuer …` to see which file Apple rejected. A native library that is not signed is the usual cause.
- **The workflow cannot read the secrets**: the `release` environment only allows tags matching `v*`.
- **The app opens but shows only a menu bar and no window**: the renderer process is crashing at startup (look for `Ryte Helper (Renderer)` reports in `~/Library/Logs/DiagnosticReports`). Under the hardened runtime, each Chromium helper app needs `com.apple.security.cs.allow-jit` and `com.apple.security.cs.allow-unsigned-executable-memory` in its own entitlements; they are not inherited from the main executable. They come from `app/build/entitlements.mac.inherit.plist`, and `scripts/verify-mac-release.mjs` fails a build whose helpers lack the JIT entitlement. A signature that verifies and a notarization that succeeds do not prove the app launches, so always run a dry run and open the downloaded DMG before the real tag.

## If macOS shows a warning for a release

A signed and notarized release should open without one. Check the download against the `.sha256` file from the same release (`shasum -a 256 ryte-<version>-arm64.dmg`); if the hashes differ, delete the download and fetch it again. If the hashes match and macOS still blocks the app, open an issue and do not override the warning.
