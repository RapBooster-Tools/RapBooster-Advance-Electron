# CLAUDE.md — Engineering Instructions

Rules for every coding session in this repository. Read this **before** touching code.

| Document                                         | Purpose                                                               |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| `CLAUDE.md` (this file)                          | How to work — architecture rules, standards, workflow                 |
| [SPRINTS.md](./SPRINTS.md)                       | What to build — spec, schema, IPC contract, algorithms, E2E test IDs  |
| [SPRINT-TRACKER.md](./SPRINT-TRACKER.md)         | Where we are — dashboard, deviations, known issues (K), test history  |
| [docs/TASKS.md](./docs/TASKS.md)                 | What is left — every task as a checkbox, done and open                |
| [docs/DECISIONS.md](./docs/DECISIONS.md)         | Why — every decision (D1…) with its reasoning and status              |
| [docs/ROADMAP.md](./docs/ROADMAP.md)             | What comes next — waves, candidates, product questions                |
| [docs/DESIGN-SYSTEM.md](./docs/DESIGN-SYSTEM.md) | UI tokens, components, themes — read before building a screen (D145)  |
| [docs/USER-GUIDE.md](./docs/USER-GUIDE.md)       | End-user guide (Wave 4, in progress)                                  |
| [REQUIREMENTS.md](./REQUIREMENTS.md)             | Customer inputs still open — answered items move to DECISIONS         |
| [RELEASE.md](./RELEASE.md)                       | How to build, sign and publish a release                              |
| `design/`                                        | Original HTML prototypes — reference only, **never import from here** |

Each fact lives in exactly one of these; link to it rather than copying it.

---

## 1. Project in one paragraph

RapBooster Advance is a licensed Windows and macOS desktop app for WhatsApp marketing: Electron
shell, Next.js renderer, Baileys for WhatsApp, local SQLite per OS user. It connects up to 20
WhatsApp accounts concurrently and runs bulk campaigns, drip sequences, group tools, status and
Channels posts, a unified inbox with quick replies and scheduled messages, chatbot flows,
welcome/away and keyword auto-replies, webhooks and a multi-provider AI responder, with
desktop notifications and a tray. Twelve screens: the prototype's nine (`SPRINTS.md` §2), three
from the Sprint 5 marketing suite (§15); Wave 3 (§16) added flows, imports, desktop and the
design system without new screens. Sprints 0–5 and Wave 3 are done; Wave 4 (help) is in
progress (tracker §1). Every milestone ends with Playwright E2E tests, a commit, and a push to
`main`.

### 1.1 Non-negotiable decisions

Do not revisit these without an explicit customer instruction recorded in `docs/DECISIONS.md`.

| Topic       | Decision                                                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scope       | 9 prototype screens + the marketing suite (D79, D117) + Wave 3 (D122, D124, D125) + help (D123). Number Filter, Group Grabber, Warmup and Spintax are **in** |
| Processes   | main + preload + renderer + `wa-service` utility process                                                                                                     |
| Renderer    | Next.js `output: 'export'`, client-only, no SSR, no API routes                                                                                               |
| Database    | SQLite at `app.getPath('userData')`, Prisma + better-sqlite3, **main is the sole writer**                                                                    |
| WhatsApp    | Baileys, pinned exactly, wrapped behind our own transport interface                                                                                          |
| Concurrency | 20 devices max, **one in-flight message per device**                                                                                                         |
| Licensing   | Remote server, hard gate before the main window exists                                                                                                       |
| AI          | OpenAI, Anthropic, Gemini or OpenAI-compatible; end-user keys via `safeStorage` (D114)                                                                       |
| Platforms   | Windows and macOS, both signed (D85, D119); English-only UI (D118)                                                                                           |
| Branch      | Work on `main`, commit and push at each milestone (D121)                                                                                                     |

---

## 2. Architecture rules

These are invariants. Breaking one is a bug even if tests pass.

1. **The renderer never touches Node.** No `fs`, no `child_process`, no direct database access,
   no `require`. `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Every
   piece of data crosses through `window.api`.
2. **`ipcContract` in `shared/ipc.ts` is the only contract.** Domain channels are defined in
   `shared/contract/*.ts` and spread into it; names are mirrored in `shared/channels.ts`. Every
   channel has a zod request schema and a zod response schema, validated in both directions.
   Adding a channel means editing the contract first, then the handler, then the caller.
3. **Baileys never runs in the main process.** It lives in `wa-service`. Main talks to it over
   MessagePort and knows nothing about sockets.
4. **`wa-service` never writes to SQLite.** It asks main to persist and reports results. One
   writer, no lock contention, one place to audit.
5. **Nothing calls `sock.sendMessage` directly.** Every outbound WhatsApp action — campaign
   message, group message, inbox reply, scheduled message, flow step, AI reply — goes through
   the throttle scheduler in `wa-service/throttle.ts`. This is the anti-ban core; bypassing it
   risks the user's accounts.
6. **Campaign state lives in SQLite, never in memory.** Counters are recomputed from
   `CampaignRecipient` rows. A process restart must be able to rebuild everything from the
   database alone.
7. **Nothing polls.** Progress and status reach the renderer as push events. No `setInterval`
   in the renderer to check whether something finished.
8. **Never import from `design/`.** Those prototypes are a feature reference. The customer
   confirmed the UI is rebuilt cleanly, not copied.
9. **One inbound pipeline, one clock.** Automation that reacts to a message is a step in
   `services/inbound.ts`, in its fixed order; anything time-driven registers a job with
   `services/scheduler.ts`. No feature owns a timer (D89, D130).

---

## 3. Multi-agent working mode

Use subagents by default wherever the work genuinely fans out. This is the customer's explicit
instruction — but fan out on _independent_ work, not on everything, because parallel agents
editing the same file produce conflicts that cost more than they save.

### 3.1 When to fan out

| Situation                                       | Agents                                                                | Example                                                                     |
| ----------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Exploring unfamiliar code                       | 1–3 **Explore** agents in parallel, each with a distinct search focus | "find every IPC handler" + "find every place devices are queried"           |
| Independent feature modules in one sprint       | One implementation agent per module                                   | Sprint 2: contacts · templates · devices screen — three separate file trees |
| Writing the E2E suite                           | A dedicated test-authoring agent, given the acceptance criteria       | Sprint 3's 25 specs                                                         |
| Pre-commit review                               | A review agent over the diff                                          | Every sprint, before pushing                                                |
| Investigating a failure with several hypotheses | One agent per hypothesis                                              | "is it the migrator, the adapter, or asar?"                                 |

Launch parallel agents **in a single message with multiple tool calls** — sequential launches
waste the benefit entirely.

### 3.2 When NOT to fan out

Keep these serial — they touch shared state and parallel edits will collide:

- Anything editing `shared/ipc.ts`, `shared/contract/*`, `shared/channels.ts`, `shared/types.ts`
  or `shared/errors.ts`.
- Prisma schema changes and migrations.
- `electron-builder` / packaging configuration.
- The throttle scheduler and campaign worker — one correctness-critical mind, not three.
- Any task where agent B needs agent A's output.

### 3.3 Rules for delegating

- Give each agent the **file paths and context it needs** — a cold agent that re-derives the
  architecture wastes more than it produces.
- Tell each agent explicitly which files it owns and which it must not touch.
- Never let two concurrent agents write the same file.
- Verify what agents report. A returned "done" is a claim, not a result — check the diff and
  run the tests yourself.

### 3.4 Worktree agents

Parallel implementation agents each work in their own git worktree under `.claude/worktrees/`
(D98). Every agent, before anything else:

1. **Reset onto `main`.** A new worktree can start on an old commit; compare
   `git log --oneline -1` with `main` and `git reset --hard main` if they differ.
2. **Hard-link `node_modules`:** `cp -al <repo>/node_modules node_modules`. Never a symlink —
   Turbopack rejects it and `npm run build` then **fails while exiting 0**, leaving a stale `out/`
   that E2E silently tests. Confirm the build output contains the new code.
3. Commit on the worktree branch; do not push. The coordinator merges, re-runs the full suite on
   the merged tree, and records results in the tracker.

---

## 4. Graphify — codebase knowledge graph

[Graphify](https://github.com/Graphify-Labs/graphify) builds a queryable knowledge graph of the
codebase using local tree-sitter parsing (deterministic, no LLM, nothing leaves the machine for
code files). Use it to orient before touching unfamiliar areas instead of grepping blindly.

### 4.1 Setup, once per machine

```bash
uv tool install graphifyy       # or: pipx install graphifyy
graphify install                # registers the /graphify skill with the assistant
```

### 4.2 Use

```bash
/graphify .                     # build the graph (run once the scaffold exists)
/graphify . --update            # re-extract only changed files — run at the end of each sprint
graphify extract . --code-only  # local AST pass only, no API key needed

graphify query "what connects the campaign worker to the throttle scheduler?"
graphify path "CampaignWorker" "ThrottleScheduler"
graphify explain "SessionManager"
```

### 4.3 Conventions for this repo

- Build the graph at the end of **Sprint 1**, then refresh with `--update` at the end of every
  sprint — it is part of the definition of done.
- **Commit** `GRAPH_REPORT.md` (useful diffable summary). **Git-ignore** `graphify-out/`.
- Before modifying a subsystem you did not write, run `graphify explain "<Thing>"` and
  `graphify path` between it and whatever you are about to connect it to. It is faster and more
  complete than a grep sweep, and it surfaces `INFERRED` edges a grep cannot.
- Re-running the code layer costs nothing (no LLM), so refresh freely rather than working from
  a stale graph.

---

## 5. Production-readiness standards

This app sends messages on behalf of real businesses from accounts that can be permanently
banned. "Works on my machine" is not the bar.

### 5.1 Error handling

- Every IPC handler maps failures onto the `shared/errors.ts` taxonomy (`SPRINTS.md` §5.4).
  A raw `Error` reaching the renderer is a bug.
- Each error carries a `userMessage` (safe to display) and a `detail` (logged, never shown raw).
- **No silent catches.** `catch {}` and `catch (e) { /* ignore */ }` are forbidden. If a failure
  is genuinely ignorable, log it at `debug` with a comment saying why.
- Every process installs global handlers: `uncaughtException`, `unhandledRejection`, and in main
  also `render-process-gone` and `unresponsive`.
- Every renderer route has an error boundary with a retry action.

### 5.2 Logging

- `electron-log` in all three processes, rotating under `userData/logs` (5 MB × 5 files).
- Structured entries: timestamp, level, process tag, correlation id, message, context.
- **Redaction is mandatory and automatic**: license keys, API keys, and phone numbers (keep the
  last 4 digits) are scrubbed by the logger itself, not by each call site. Assume every log
  file will eventually be emailed to support.
- Log every IPC call with channel and duration at `debug`; every send outcome at `info`; every
  reconnect at `warn`.
- Never log message _content_ — it is customer data.

### 5.3 Database

- Migrations are **forward-only** and applied at boot by our own migrator; the Prisma CLI must
  never be required at runtime.
- **Automatic timestamped backup before every migration**, retaining the last 5.
- `PRAGMA integrity_check` on boot with a documented recovery path.
- WAL mode, `foreign_keys=ON`, `busy_timeout=5000`.
- Every multi-row write is a transaction. Bulk operations batch at 1,000 rows.
- No unbounded `findMany` — always a `take` and a cursor.
- Index every foreign key and every column used in a `WHERE status = …`.
- Test migrations against a **populated** database, not an empty one.
- **Never apply a generated migration unread.** Prisma rebuilds tables with `DROP TABLE`, which
  under our transactional `foreign_keys=ON` migrator cascade-deletes child rows. Write
  `ALTER TABLE … ADD COLUMN` by hand; `npm run check:migrations` enforces it (D90).

### 5.4 WhatsApp safety

This is where careless code costs the user their accounts.

- Every send goes through the throttle scheduler. No exceptions, no "just this once".
- **One in-flight message per device.** Parallelism comes from more devices, never from
  concurrent sends on one account.
- Respect the configured random delay, sleep-after-N, and daily cap — all of them, always.
- Reconnect with exponential backoff (`min(60s, 2^n)` + jitter) and a circuit breaker after 10
  consecutive failures. **Never busy-loop a reconnect** — it looks like an attack to WhatsApp.
- `DisconnectReason.loggedOut` is terminal: purge the auth folder, require re-linking. Every
  other reason is retryable.
- Persist `creds.update` immediately, always. A dropped credential update means a re-scan.
- Automated tests use the **mock transport**. Never point CI at a real WhatsApp account.

### 5.5 Resilience

- `wa-service` is supervised: health-pinged, crash-detected, restarted with backoff, and its
  state rebuilt from SQLite.
- On boot, reset `CampaignRecipient` rows stuck in `sending` back to `pending`, then resume any
  `running` campaign from its first `pending` row (`SPRINTS.md` §6.4).
- Sends are keyed on `CampaignRecipient.id` with `@@unique([campaignId, contactId])`, so a
  contact can never be queued twice.
- The known, accepted limitation — one possible duplicate per device per crash — is documented
  in `SPRINTS.md` §6.4 and tracker K1. Do not paper over it; do not make it worse.
- Graceful shutdown stops workers, closes sockets, checkpoints WAL, and flushes logs.

### 5.6 Security

- License cache and AI provider keys encrypted with Electron `safeStorage`. If `safeStorage` is
  unavailable, degrade explicitly and tell the user — never store plaintext silently.
- **No secrets in the renderer, in logs, or in git.** Signing certificates and
  `REQUIREMENTS.local.md` are git-ignored.
- Strict CSP (`default-src 'self'`). `setWindowOpenHandler` denies everything.
  `will-navigate` blocked outside the app origin. `shell.openExternal` allowlisted.
- Validate every IPC payload with zod — treat the renderer as untrusted input even though we
  wrote it.
- Run `npm audit` each sprint and resolve or explicitly accept each finding.
- Never commit a real license key, phone number, or API key — not even in a test fixture.

### 5.7 Performance budgets

Testable numbers, not aspirations:

| Budget                                 | Target                                        |
| -------------------------------------- | --------------------------------------------- |
| Cold start to activation screen        | < 3 s                                         |
| Contacts table, 50,000 rows            | Smooth scroll, no dropped frames              |
| Contact search across 50,000 rows      | < 500 ms                                      |
| CSV import, 50,000 rows                | Completes with progress, UI stays interactive |
| 20 connected devices + active campaign | < 800 MB RSS                                  |
| Campaign progress events               | Batched — max 1/second per campaign           |

Techniques: virtualized tables and message threads, cursor pagination, batched transactional
writes, SQL aggregation for counters, worker threads for CSV parsing.

### 5.8 Code quality

- TypeScript `strict`. **No `any` at an IPC boundary** — ever.
- No `TODO`, `FIXME`, or commented-out code in a commit. Unfinished work goes in
  `docs/TASKS.md` (and the tracker's known issues if it is a limitation), not in the source.
- Match the surrounding style — naming, comment density, file organization.
- Comments explain _why_, not _what_. Graphify extracts `NOTE`/`WHY` comments as first-class
  graph nodes, so use those prefixes for decisions worth surfacing.
- One responsibility per file. If an IPC handler module exceeds ~300 lines, split it by domain.
- Shared types live in `shared/`, never duplicated across processes.

---

## 6. Testing

- **Playwright via `_electron.launch()`** — real Electron, not a mocked DOM.
- Isolated `userData` per run; database reset between specs.
- `MockLicenseService` and the mock transport injected by environment variable.
- Screenshot, video and trace on failure.
- Test IDs come from `SPRINTS.md` (E1.1, E2.4, …) — keep the spec and the suite in sync.
- **Every sprint re-runs every earlier suite.** A regression is a blocker, not a footnote.
- `npm run test:smoke` packages the app and verifies the packaged binary launches — run every
  sprint, because native-module and Prisma packaging regressions surface nowhere else.
- Never write a test that talks to a real WhatsApp account or the real license server.

---

## 7. Workflow

### 7.1 Starting a sprint

1. Read `SPRINT-TRACKER.md` (status, known issues), the milestone's epic in `docs/TASKS.md`,
   and the relevant area of `docs/DECISIONS.md`.
2. Read the sprint's section in `SPRINTS.md` in full.
3. Confirm the REQUIREMENTS sections that sprint depends on are actually filled.
4. Refresh the graph (`/graphify . --update`) and orient with `graphify explain` if the area is
   unfamiliar.
5. Mark the sprint 🟡 in the tracker.

### 7.2 During a sprint

- Follow the task order in `SPRINTS.md` — spikes and blockers are deliberately sequenced first.
- Fan out to subagents per §3 where the work is independent.
- Write the E2E test alongside the feature, not at the end.
- If you must build something differently from the spec, record it in the tracker's deviations
  log and say whether `SPRINTS.md` was updated to match. **Do not silently diverge.**
- Record every non-obvious choice in `docs/DECISIONS.md` in the same commit as the code.

### 7.3 Finishing a sprint

Every item in `SPRINTS.md` §13 must hold. In short:

```bash
npm run typecheck && npm run lint && npm run test:e2e && npm run test:smoke
graphify . --update
```

Then tick the tasks in `docs/TASKS.md`, add decisions to `docs/DECISIONS.md`, and update
`SPRINT-TRACKER.md` — status, real test numbers including failures, deviations, known issues —
and commit everything in one commit.

### 7.4 Git

- Work on `main` (the customer's instruction in the README).
- Conventional commits: `feat(campaigns): add crash-safe resume`.
- One push per sprint completion, with the tracker updated in the same commit.
- Never force-push. Never commit secrets, `node_modules`, build output, or `graphify-out/`.

---

## 8. Dependency policy

- **Baileys is pinned exactly** — no `^`, no `~`. Upgrading is a deliberate task with a full
  regression run, never an incidental `npm update`. It is wrapped behind our transport
  interface so an upgrade touches one file.
- No Baileys forks or wrappers (`baileys-pro`, `baileys-antiban`, `mahiru-baileys`). Our
  anti-ban pacing is in `SPRINTS.md` §6.1, is auditable, and does not add supply-chain risk to
  the most security-sensitive dependency in the app.
- Prefer the dependencies already listed in `SPRINTS.md` §14. Adding one outside that list
  needs an entry in `docs/DECISIONS.md` explaining why.
- Native modules (`better-sqlite3`, `sharp`) must rebuild for each target OS and arch and be listed in
  `asarUnpack` — a `.node` binary cannot be `dlopen`'d from inside an asar. Verify in the
  packaged smoke test, not just in dev.
- **A peer dependency of a dependency does not get packaged.** npm hoists peers to the root, so
  development always finds them, but electron-builder packages by walking _our_ production
  dependency graph — where they are unreachable. If a dependency needs an optional peer at
  runtime, declare it in our own `dependencies` or it will exist in every dev run and no
  shipped build. This cost us a real bug (tracker D55): Baileys resolves `sharp` this way for
  image thumbnails, so packaged builds sent every image with no thumbnail and no dimensions.
  It was silent — Baileys logs that failure at debug level and carries on.
- **When a dependency swallows its own failures, assert the outcome in the packaged
  self-test.** Anything guarded by `import(...).catch(() => {})` or a `try/catch` that only
  logs will not fail a build, will not fail E2E, and will not appear in any log anyone reads.
  `electron/main/self-test.ts` is the right place, because it runs inside the real package.

---

## 9. Common pitfalls in this codebase

Things that will bite, listed so nobody rediscovers them the expensive way.

| Pitfall                                         | Correct approach                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| Calling `sendMessage` outside the scheduler     | Always go through `throttle.acquire()` first                                       |
| Incrementing campaign counters in memory        | Recompute from `CampaignRecipient` with `GROUP BY status`                          |
| Polling for campaign progress from the renderer | Subscribe to the `campaign:progress` event                                         |
| Writing to SQLite from `wa-service`             | Send a message to main and let it persist                                          |
| Reconnecting in a tight loop                    | Exponential backoff + jitter + circuit breaker                                     |
| Treating every disconnect as fatal              | Only `DisconnectReason.loggedOut` is terminal                                      |
| Loading all contacts to render a table          | Cursor pagination + virtualization                                                 |
| Parsing a 50k CSV on the main thread            | Stream it in a worker, insert in batches of 1,000                                  |
| Logging a phone number or license key           | The logger redacts automatically — never bypass it                                 |
| Assuming `safeStorage` is available             | Check `isEncryptionAvailable()` and degrade explicitly                             |
| Testing against a real WhatsApp account         | Use the mock transport — a ban is unrecoverable                                    |
| `.partial()` on a zod schema with defaults      | zod 4 fills the defaults in; build patches with `patchOf()` (D146)                 |
| Naming a group chat from the sender's push name | Name it from `Group.name`; a push name is one member (D148)                        |
| Trusting a dependency's worker or asset in dev  | Assert it in `self-test.ts` — only the package proves it ships                     |
| A test-only env var or global seam              | Guard it with `NODE_ENV === 'test'` so it is inert in production (D92, D149)       |
| Resolving a sibling file from `__dirname`       | Probe a candidate list — Rollup may move a shared module into `chunks/` (D150)     |
| Treating a `@lid` JID's digits as a phone       | Resolve through `LidResolver`; unresolved stays `<id>@lid`, shown as hidden (D129) |
| Escape in a popover also closing the dialog     | React's root is the document; stop it with a native listener on the trigger        |
| A new route failing the first typecheck         | `npm run typecheck` runs `next typegen` first; keep it that way                    |

---

## 10. Memory

Claude's memory lives in this repository only. Auto memory is off (`.claude/settings.json`),
and user-level `~/.claude/CLAUDE.md` files are excluded so that a personal file on one
machine cannot change how the project is built on another. Durable notes go in
`.claude/memory/MEMORY.md`, imported here and committed with the work:

@.claude/memory/MEMORY.md

---

## 11. Quick reference

```bash
npm run dev           # Electron + Next dev server with HMR
npm run dev:mock      # …with the mock license server and mock WhatsApp transport
npm run build         # Build all processes
npm run dist          # Package the installer for this OS (NSIS / dmg+zip)
npm run verify        # Format, lint, typecheck, deps/source/migration checks
npm run typecheck     # tsc --noEmit across all tsconfigs
npm run lint          # ESLint
npm run test:e2e      # Playwright against a dev build
npm run test:smoke    # Package, then verify the packaged binary launches
npm run db:migrate    # Generate a migration from schema.prisma — then hand-edit it (D90)
npm run check:migrations  # Refuse table drops and foreign-key toggles
npm run db:studio     # Inspect the local database
graphify . --update   # Refresh the knowledge graph
```

Runtime data lives under `app.getPath('userData')` — `%APPDATA%\RapBooster` on Windows,
`~/Library/Application Support/RapBooster Advance` on macOS.
Layout is in `SPRINTS.md` §3.4.
