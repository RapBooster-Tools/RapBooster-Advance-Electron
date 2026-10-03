# RapBooster Advance

An Electron + Next.js desktop application for WhatsApp marketing, built on
[Baileys](https://github.com/WhiskeySockets/Baileys), with a local SQLite database created per
user in the OS application-data directory.

> **Status (2026-10-03): feature-complete through Wave 3, not yet shippable.** Wave 3 —
> light and dark themes, inbox tools, chatbot flows, Excel/vCard import, a WhatsApp contacts
> grabber and desktop notifications — is merged; the help system (setup wizard, tours, Help
> Center) is in progress. Test numbers are in
> [SPRINT-TRACKER.md §6](./SPRINT-TRACKER.md#6-test-results-history). What is missing for a
> release is input only the customer can give: the license server API, code-signing
> certificates (Windows, and an Apple Developer ID with a Mac to build on), branding and an
> update feed. See [REQUIREMENTS.md](./REQUIREMENTS.md), [RELEASE.md](./RELEASE.md) and
> [SPRINT-TRACKER.md](./SPRINT-TRACKER.md).
>
> **Windows and macOS** are both distribution targets (Apple Silicon and Intel). An unsigned
> Windows installer triggers a SmartScreen warning; an unsigned Mac app will not open.

## What it does

Twelve screens behind a license activation gate: **Dashboard** · **Inbox** · **Campaigns** ·
**Sequences** · **Status & Channels** · **WA Groups** · **Devices** · **Contacts** ·
**Templates** · **Automation** · **AI Bot** · **Settings**.

- **Devices:** up to 20 WhatsApp accounts at once, by QR code or pairing code; warmup ramp for
  new numbers, automatic health pause, Business labels and catalog
- **Contacts:** lists with custom fields; CSV, Excel (`.xlsx`), vCard (`.vcf`) and Google
  Sheets import at 50,000-row scale; a WhatsApp grabber that copies the numbers your linked
  phones know — address book and chats, including unsaved numbers — into a list; tags, an
  opt-out list with STOP/START replies, and a check for which numbers are on WhatsApp
- **Templates:** text, media, buttons, lists, polls, locations, contact cards, voice notes,
  stickers, events and products, with `{{Name}}` merge tags and `{Hi|Hello}` spintax
- **Campaigns:** lists and tag audiences, random delays, daily caps, quiet hours, scheduling,
  crash-safe resume, and delivered/read/replied analytics
- **Sequences:** timed drip messages that stop when the contact replies
- **Groups:** bulk messaging and creation, invite links, member management, a member grabber,
  and communities
- **Status & Channels:** status updates and WhatsApp Channel posts, now or scheduled
- **Automation:** visual chatbot flows (menus, questions, hand-off to a person) with a test
  panel, welcome and away messages, keyword auto-replies, signed webhooks, call auto-reject
- **AI Bot:** OpenAI, Anthropic, Gemini or any OpenAI-compatible service, with daily caps,
  approval drafts and hand-off to a person
- **Inbox:** one inbox across every number, with rich attachments, quick replies (type `/`),
  a contact panel with private notes and campaign history, and messages scheduled for later
- **Desktop:** notifications for new messages, a tray icon with live counts, keeps sending in
  the background when the window is closed, optional start at login
- **Look:** light and dark themes that follow Windows or macOS, and a WhatsApp-style phone
  preview; every file is chosen with a normal file dialog
- **Help:** a first-run welcome and a getting-started checklist, a "?" and F1 help on every
  screen, tips beside every setting, guided tours, a Help Center, and a
  [user guide](./docs/USER-GUIDE.md) generated from the same content

Every send — campaign, sequence, group, flow, welcome or away, scheduled message, AI or a
person in the inbox — goes through one pacing engine, so the safety limits always hold.

## Requirements

- **Node.js 22.18 or newer** — `npm run verify` generates the user guide from TypeScript help
  content using Node's built-in type stripping
- **Windows or macOS.** Each platform's installer is built on that platform — the native
  modules are per-OS binaries. See [RELEASE.md](./RELEASE.md).
- No Python or C++ toolchain needed. Electron is pinned to 44.5.1 so the `better-sqlite3`
  prebuilt binaries match its ABI; upgrading Electron without checking that forces a source
  build on every machine.

## Getting started

```bash
npm install          # also runs prisma generate + electron-builder install-app-deps
npm run dev          # Next dev server + Electron, with hot reload
```

The app creates its database at `app.getPath('userData')` on first launch and applies
migrations automatically. Nothing to set up by hand.

By default the app uses the **real** Baileys transport and the **real** license HTTP client —
and since no license server is configured yet (REQUIREMENTS §1), it will gate at activation.

## Running without a license server

Use mock mode. It is the supported way to exercise the whole product before REQUIREMENTS §1 is
answered:

```bash
npm run dev:mock
```

That is `npm run dev` with `LICENSE_SERVICE=mock` and `WA_TRANSPORT=mock` — a deterministic
license server and a fake WhatsApp transport, so **no license server and no real WhatsApp
account are involved**. Set either variable yourself if you want only one of them mocked:

```bash
LICENSE_SERVICE=mock npm run dev     # mock licensing, real WhatsApp
WA_TRANSPORT=mock npm run dev        # real licensing, fake WhatsApp
```

Mocks are opt-in rather than defaulted-on, so nothing can ship with one silently active. The
E2E suite sets them itself.

### Test license keys

The mock decides from the key's **prefix**, so any suffix works — the branch is what matters:

| Key                 | What happens                                                       |
| ------------------- | ------------------------------------------------------------------ |
| `VALID-DEMO-001`    | Activates. This is the one to use for normal testing               |
| `CONFLICT-DEMO-001` | Reports the license is on another machine, then transfers on retry |
| `EXPIRED-DEMO-001`  | Rejected as expired                                                |
| `REVOKED-DEMO-001`  | Rejected as revoked                                                |
| `OFFLINE-DEMO-001`  | Server unreachable — drives the offline grace-period path          |
| anything else       | Rejected as invalid                                                |

Defined in `electron/main/services/license/mock.ts`.

### Driving the fake WhatsApp transport

Devices link instantly and sends succeed by default. These variables let you make it behave
like a bad day, which is where the interesting bugs are:

| Variable             | Default | Effect                                         |
| -------------------- | ------- | ---------------------------------------------- |
| `WA_MOCK_LATENCY_MS` | `0`     | Artificial delay per send                      |
| `WA_MOCK_FAIL_RATE`  | `0`     | Fraction of sends that fail, `0`–`1`           |
| `WA_MOCK_CONNECT_MS` | `50`    | Delay before a linked device reports connected |
| `WA_MOCK_INCOMING`   | `0`     | Inbound messages synthesised per linked device |

```bash
WA_MOCK_FAIL_RATE=0.2 WA_MOCK_LATENCY_MS=400 npm run dev:mock
```

The test-only seams the E2E suite uses are listed in [docs/DECISIONS.md](./docs/DECISIONS.md)
(D92).

Runtime data lives under `%APPDATA%\RapBooster` on Windows and
`~/Library/Application Support/RapBooster Advance` on macOS. Delete that folder to start from a
clean database and an unactivated app.

## Commands

| Command              | What it does                                                                        |
| -------------------- | ----------------------------------------------------------------------------------- |
| `npm run dev`        | Development, with hot reload                                                        |
| `npm run dev:mock`   | Development with the mock license server and mock WhatsApp transport                |
| `npm run verify`     | Format, lint, typecheck, dependency, source and migration checks                    |
| `npm run build`      | Production bundles for main, preload, wa-service and the renderer                   |
| `npm run pack`       | Unpacked build in `dist/`, no installer                                             |
| `npm run dist`       | Installer for the current platform in `dist/` (NSIS on Windows, dmg + zip on macOS) |
| `npm run test:e2e`   | Full Playwright suite against a real Electron instance (325 tests)                  |
| `npm run test:smoke` | Packages the app and runs its self-test — catches asar/native issues                |
| `npm run db:studio`  | Browse the local database                                                           |

Before committing, the gate is `npm run verify && npm run test:e2e && npm run test:smoke`.

## Architecture

Four processes, and the boundaries between them are enforced rules rather than conventions
(see [CLAUDE.md §2](./CLAUDE.md)):

| Process        | Responsibility                                                   |
| -------------- | ---------------------------------------------------------------- |
| **main**       | Owns the database. The only writer. Runs the campaign scheduler  |
| **preload**    | Sandboxed bridge. Exposes one validated `window.api.invoke`      |
| **renderer**   | Next.js static export. No Node access at all                     |
| **wa-service** | Utility process. Owns every Baileys socket and the send throttle |

The rules that matter most:

- **Nothing calls `sock.sendMessage` directly.** Every outbound message goes through the
  throttle scheduler — this is the anti-ban core, and bypassing it risks the user's accounts.
- **Campaign state lives in SQLite, never in memory.** A crash mid-campaign resumes from the
  first pending recipient without re-sending anything already delivered.
- **`wa-service` never writes to the database.** One writer, no lock contention.

## Measured behaviour

Against the packaged Windows build, on the mock transport:

| Metric                                         | Value                                 |
| ---------------------------------------------- | ------------------------------------- |
| Startup (process start → app + database ready) | ~950 ms                               |
| Idle memory, all processes                     | ~530 MB                               |
| Cost of 20 connected devices                   | +13 MB                                |
| Memory drift over a running campaign           | none — falls as the heap is reclaimed |

Reproduce with `npm run pack && node scripts/perf.mjs`, and
`PERF=1 npx playwright test perf-load` for the 20-device profile.

## Documents

| Document                                         | What it is                                                       |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| [SPRINT-TRACKER.md](./SPRINT-TRACKER.md)         | **Start here:** status dashboard, known issues, test history     |
| [docs/TASKS.md](./docs/TASKS.md)                 | Every task, done and remaining, as checkboxes                    |
| [docs/DECISIONS.md](./docs/DECISIONS.md)         | Every decision with its reasoning                                |
| [docs/ROADMAP.md](./docs/ROADMAP.md)             | What comes next                                                  |
| [REQUIREMENTS.md](./REQUIREMENTS.md)             | **Open questions only** — what still blocks shipping             |
| [RELEASE.md](./RELEASE.md)                       | How to build, sign and publish a Windows or macOS update         |
| [SPRINTS.md](./SPRINTS.md)                       | Full specification: screens, schema, IPC contract, E2E test IDs  |
| [docs/DESIGN-SYSTEM.md](./docs/DESIGN-SYSTEM.md) | Themes, tokens and components for building a screen              |
| [CLAUDE.md](./CLAUDE.md)                         | Engineering rules for every coding session                       |
| `design/`                                        | Original HTML prototypes — the feature reference, never imported |

## Known limitations

- **Whether buttons render is WhatsApp's decision, not ours.** Templates send real quick-reply,
  link, call and copy buttons, and interactive templates send a single-select list — but
  WhatsApp can refuse them per recipient without notice, so every interactive send falls back
  to a numbered list automatically. The message always arrives. See REQUIREMENTS §7.9.
- **The AI escalation confidence threshold is stored but not enforced** — no AI provider
  returns a confidence score. The keyword, message-count and time triggers all work.
- **A message in flight during a crash may send twice**, bounded at one per device per crash.
  WhatsApp offers no deduplication primitive that would remove this.
- **Quiet hours apply to every automated reply.** A scheduled message waits for them to end;
  a flow step, welcome or away message that falls inside them is not sent (a flow carries on
  at the customer's next message). With the defaults no away message goes out 21:00–09:00.
- **WhatsApp sometimes hides a contact's number.** Such chats show "Number hidden by
  WhatsApp" until WhatsApp reveals the number, and are then moved onto it automatically.

Full list, with reasoning, in [SPRINT-TRACKER.md §5](./SPRINT-TRACKER.md#5-known-issues).
