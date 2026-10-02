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

| Needed                            | REQUIREMENTS | Consequence if absent                                                                                                         |
| --------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| App icon, publisher name          | §2           | A placeholder icon ships (`assets/branding/icon.png`), and the installer shows no verified publisher                          |
| Update feed URL                   | §3           | `system:checkUpdate` reports "no update server is configured" rather than falsely claiming the app is current                 |
| Windows code-signing certificate  | §4           | Unsigned `.exe`; Windows SmartScreen warns users the app is unrecognised                                                      |
| Apple Developer ID + notarization | §4           | Unsigned `.app`; Gatekeeper refuses to open it ("damaged" / "unidentified developer"), and Mac auto-update cannot work at all |

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
packages are native, and each architecture needs its own darwin binary. On an
Apple Silicon Mac, install both before building so the x64 build has one too:

```bash
npm ci
npm install --no-save --os=darwin --cpu=x64 sharp
npm run dist:mac
```

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

Needs an Apple Developer Program membership. Signing uses a "Developer ID
Application" certificate; notarization runs automatically when the Apple
credentials are present and is skipped otherwise.

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
