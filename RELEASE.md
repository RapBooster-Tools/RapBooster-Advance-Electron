# Release guide

How to produce, sign and publish a RapBooster Advance build for **Windows and macOS**.

> **Windows and macOS are both distribution targets** (tracker D85, 2026-10-02 —
> macOS was dropped on 2026-07-28 and reinstated). The Mac build is a dmg plus a
> zip for each of Apple Silicon (arm64) and Intel (x64).
>
> ⚠ **The release pipeline is wired but unverified.** Every step below is real
> configuration against real tooling, but no signed build has been produced and
> no update has been installed, because that requires credentials from
> [REQUIREMENTS.md](./REQUIREMENTS.md) §2–§4. Treat this document as a plan that
> should work, not as a procedure someone has walked through.

---

## What is missing, and what happens without it

| Needed                            | REQUIREMENTS | Consequence if absent                                                                                         |
| --------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------- |
| App icon, publisher name          | §2           | A placeholder icon ships (`assets/branding/icon.png`), and the installer shows no verified publisher          |
| Update feed URL                   | §3           | `system:checkUpdate` reports "no update server is configured" rather than falsely claiming the app is current |
| Windows code-signing certificate  | §4           | Unsigned `.exe`; Windows SmartScreen warns users the app is unrecognised                                      |
| Apple Developer ID + notarization | §4           | Ad-hoc signed `.app` (D159); users approve it once with "Open Anyway", and Mac auto-update cannot work at all |

None of these block development. All of them block shipping to real users.

---

## Building

```bash
npm ci
npm run build        # typecheck, renderer export, main/preload/wa-service bundles
npm run dist         # NSIS installer for the current platform (Windows)
npm run dist:win     # the same, with the target named explicitly
npm run dist:mac     # dmg + zip, arm64 and x64 — run on a Mac
```

**Mac builds must run on macOS.** `better-sqlite3` and sharp's `@img/sharp-darwin-*`
packages are native, and each architecture needs its own darwin binary. npm
installs only the one for the build Mac's CPU, and
`npm install --cpu=x64 sharp` _replaces_ it rather than adding to it (sharp then
fails to load and `check:deps` stops the build). Install both side by side, at
the versions sharp's `optionalDependencies` list:

```bash
npm ci
npm install --no-save --force @img/sharp-darwin-arm64@<v> @img/sharp-libvips-darwin-arm64@<v> \
  @img/sharp-darwin-x64@<v> @img/sharp-libvips-darwin-x64@<v>
npm run dist:mac
```

`build-mac-all.sh advance` in the parent folder does this for you, with the versions filled in.

The packaged self-test is the check that the native modules really loaded:
`"dist/mac-arm64/RapBooster Advance.app/Contents/MacOS/RapBooster Advance" --self-test`
(and the same under `dist/mac/` for Intel). `npm run test:smoke` finds either.

`npm run pack` produces an unpacked build without an installer — this is what
`npm run test:smoke` drives.

---

## Signing

Signing activates from environment variables; there is nothing to switch on in
the config.

```bash
# .pfx certificate
set CSC_LINK=file:///C:/path/to/certificate.pfx
set CSC_KEY_PASSWORD=<password>
npm run dist:win
```

For an EV certificate on a hardware token, or Azure Trusted Signing, the
configuration differs — supply the details in REQUIREMENTS §4 and this section
gets rewritten against what you actually have.

### macOS

**Without an Apple Developer ID (today, D159)** `npm run dist:mac` ad-hoc signs
the app (`identity: '-'` in `electron-builder.yml`). It runs on any Mac on macOS
13 or later, but Gatekeeper does not know the developer, so the first launch
needs the user's approval:

1. Open the dmg and drag RapBooster Advance to Applications.
2. Open the app. macOS says it cannot verify it; click **Done**.
3. System Settings → Privacy & Security → scroll down → **Open Anyway**, then
   confirm with the Mac password.

On macOS 14 and older, right-click the app → **Open** → **Open** also works. If
macOS ever says the app "is damaged", the signature is broken: run
`codesign --verify --deep --strict "<app>"` on the build machine to find out why
(`xattr -dr com.apple.quarantine "/Applications/RapBooster Advance.app"` gets a
single user past it, but fix the build).

**With an Apple Developer ID**, signing uses a "Developer ID Application"
certificate. In `electron-builder.yml` remove `identity: '-'` and set
`hardenedRuntime: true` and `notarize: true`, then:

```bash
export CSC_LINK=/path/to/developer-id-application.p12
export CSC_KEY_PASSWORD=<password>
export APPLE_ID=<apple id email>
export APPLE_APP_SPECIFIC_PASSWORD=<app-specific password>
export APPLE_TEAM_ID=<10-character team id>
npm run dist:mac
```

The hardened-runtime entitlements are in `assets/branding/entitlements.mac.plist`:
JIT (Electron's V8) and outbound network only.

---

## Publishing an update

1. Bump `version` in `package.json`.
2. Build and sign the Windows installer, and the Mac dmg/zip on a Mac.
3. Upload the installers **and** the generated `latest.yml` (Windows) and
   `latest-mac.yml` plus the Mac `.zip` files (macOS) to the feed
   configured in REQUIREMENTS §3. The metadata file is what `electron-updater`
   reads; the installer alone is not enough.
4. Verify by installing the previous version and letting it check.

Set the feed at runtime with `UPDATE_FEED_URL`, or bake it into
`electron-builder.yml` under `publish.url` once §3 is answered.

### Update behaviour, and why

- Updates **download only when the user asks**, and install on quit.
- Nothing is installed under a running campaign without an explicit choice.

This app runs long sends. Restarting under someone mid-campaign would be worse
than being a version behind.

---

## Release checklist

- [ ] `npm run typecheck` clean
- [ ] `npm run lint` clean
- [ ] `npm run test:e2e` fully green
- [ ] `npm run test:smoke` green against the packaged build
- [ ] Version bumped, `SPRINT-TRACKER.md` release table updated
- [ ] Windows installer signed, installs without a SmartScreen warning
- [ ] Mac app signed and notarized, opens without a Gatekeeper warning on both
      Apple Silicon and Intel; the self-test passes on each
- [ ] Update feed serves the new version, and a previous build upgrades to it
- [ ] A fresh install activates a license, links a device, and sends one test
      message to a number you control
