# RapBooster Advance — Decision Log

The single record of every decision made on this project, with its reasoning. Read it before
re-opening a question: if a decision is here, it was made deliberately.

Status: [SPRINT-TRACKER.md](../SPRINT-TRACKER.md) · Work list: [TASKS.md](./TASKS.md) ·
Rules: [CLAUDE.md](../CLAUDE.md) · Spec: [SPRINTS.md](../SPRINTS.md)

## How to use this file

- **One entry per decision**, numbered `Dnn` and never renumbered (source comments cite them
  as "tracker Dnn"; D84 explains the one renumbering that happened). New entries take the next
  free number.
- Each entry: **ID · date · status — decision.** _Why:_ the reasoning. _Then:_ the
  consequences the code and docs must live with.
- **Status** is `Accepted`, `Superseded by Dnn` (no longer true — read the newer entry) or
  `Amended by Dnn` (still true, with a change). Never delete a superseded entry.
- Entries are grouped by area; the area is a reading aid, not part of the ID.
- Record the decision **in the same commit** as the code it describes.

| Area                                                                          | Entries                                                                                                           |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [Product scope and customer decisions](#product-scope-and-customer-decisions) | D1, D66, D79–D81, D85, D117–D128, D151, D152                                                                      |
| [Architecture](#architecture)                                                 | D2–D4, D13–D16, D18, D31–D34, D39, D40, D42, D89, D93, D94, D130, D144, D146                                      |
| [WhatsApp and anti-ban](#whatsapp-and-anti-ban)                               | D6, D7, D45, D49, D61, D63, D68, D70, D71, D76, D77, D95, D97, D99, D100, D107, D109–D111, D116, D129, D134, D147 |
| [Data](#data)                                                                 | D5, D8, D35–D37, D41, D43, D50, D73, D74, D90, D112, D113, D115, D136, D137, D139, D140, D148                     |
| [Security and licensing](#security-and-licensing)                             | D17, D23–D25, D29, D52, D64, D65, D88, D104, D105                                                                 |
| [AI and automation](#ai-and-automation)                                       | D53, D54, D78, D101–D103, D108, D114, D131–D133                                                                   |
| [UX](#ux)                                                                     | D20–D22, D28, D44, D48, D67, D75, D96, D106, D135, D141–D143, D145, D153–D157                                     |
| [Packaging and release](#packaging-and-release)                               | D12, D55, D58, D62, D150                                                                                          |
| [Dependencies](#dependencies)                                                 | D9–D11, D56, D57, D59, D60, D69, D82, D86, D91, D138                                                              |
| [Process and testing](#process-and-testing)                                   | D19, D26, D27, D30, D38, D46, D47, D51, D72, D83, D84, D87, D92, D98, D149                                        |

---

## Product scope and customer decisions

Decisions the customer made. Code follows them; they change only on a new customer instruction.

- **D1** · 2026-07-27 · Superseded by D79, D117 — Scope frozen to the prototype's nine screens;
  Number Filter, Group Grabber, Warmup and Spintax out. _Why:_ none appeared in the mockups.
  _Then:_ the scope later grew twice (D79, D117); all four are now built.
- **D66** · 2026-07-28 · Superseded by D85 — macOS dropped as a distribution target. _Why:_
  customer chose Windows only. _Then:_ no application code was Windows-specific, which is what
  made D85 a configuration change.
- **D79** · 2026-10-02 · Accepted — Scope change: an opt-out/STOP list, delivery and reply
  analytics, tags and segments, and AI cost and handoff controls. _Why:_ the customer's
  priorities after Sprint 4. _Then:_ built in the D89 wave; recorded as a deviation from
  SPRINTS.md §1.2 (tracker §4).
- **D80** · 2026-10-02 · Amended by D126 — Conservative anti-ban defaults for new installs: a
  daily cap and a quiet-hours window, both editable. _Why:_ an account banned on day one cannot
  be recovered. _Then:_ values fixed by D126.
- **D81** · 2026-10-02 · Accepted — CI and a unit-test layer deferred. _Why:_ customer
  decision. _Then:_ the Playwright suite, run locally, stays the gate.
- **D85** · 2026-10-02 · Accepted — macOS reinstated: dmg + zip, arm64 + x64, hardened runtime,
  auto-notarization when Apple credentials exist. _Why:_ customer instruction. _Then:_
  `dist:mac`, Mac paths in smoke/perf, and the macOS window lifecycle (closing the window keeps
  campaigns running). zip is required because electron-updater installs Mac updates from it.
- **D117** · 2026-10-02 · Accepted — Scope expanded to every Baileys-capable marketing feature:
  Spintax, Warmup, Group grabber and drip sequences revisited and **in**; keyword replies,
  webhooks, Google Sheets import, status and Channels, group admin tools, number checks and
  multiple AI providers added. _Why:_ customer instruction. _Then:_ built as the D89 wave;
  SPRINTS.md §15 specifies it.
- **D118** · 2026-10-02 · Accepted — English-only UI. _Why:_ customer decision. _Then:_ no i18n
  layer; copy may be written inline.
- **D119** · 2026-10-02 · Accepted — Windows **and** macOS are both release targets (confirms
  D85). _Then:_ a Mac build machine and an Apple Developer ID are now launch blockers
  (REQUIREMENTS §4).
- **D120** · 2026-10-02 · Accepted — Every dependency on its latest stable release, holding back
  only what cannot move (D86). _Then:_ held packages and why are listed in D86; re-check each
  wave.
- **D121** · 2026-10-02 · Accepted — Process: always work on `main`; subagents by default for
  independent work; Claude memory kept in the repository (D87). _Then:_ CLAUDE.md §3 and §10.
- **D122** · 2026-10-03 · Accepted — UI: a modern design system with light and dark themes and
  a WhatsApp phone preview for messages. _Then:_ built in Wave 3 (T-1301, D145); spec in
  [DESIGN-SYSTEM.md](./DESIGN-SYSTEM.md).
- **D123** · 2026-10-03 · Accepted — Help: a first-run setup wizard, help on every screen,
  interactive guided tours and a full user guide. _Why:_ the users are not technical. _Then:_
  Wave 4 (T-1312–T-1315, SPRINTS.md §17); [USER-GUIDE.md](./USER-GUIDE.md).
- **D124** · 2026-10-03 · Accepted — Inbox: quick replies, a contact side panel with notes,
  desktop notifications with a tray icon and background running, and scheduled messages per
  chat. _Then:_ built in Wave 3 (T-1303–T-1306; D134, D135, D142–D144).
- **D125** · 2026-10-03 · Accepted — Automation: a visual chatbot flow builder, welcome and away
  messages, a WhatsApp contacts grabber, and Excel and vCard import. _Then:_ built in Wave 3
  (T-1307–T-1310; D130–D133, D136–D140).
- **D126** · 2026-10-02 · Accepted — Safety defaults: 200 sends per device per day and quiet
  hours 21:00–09:00, applied to existing installs that never changed the setting, with a
  one-time notice. _Then:_ `services/sending-policy.ts`; the dashboard shows the notice once.
- **D127** · 2026-10-02 · Amended by D152 — Every proposed default in the improvement plan (Q1–Q13)
  accepted: opt-out words STOP, UNSUBSCRIBE, बंद with a confirmation; suppression global;
  72-hour reply attribution; "read" shown as a lower bound; static tags first; AI caps 500 per
  device and 20 per chat per day; approve-before-send off; tokens plus an editable price; AI
  replies held during quiet hours. _Then:_ these are the shipped defaults.
- **D128** · 2026-10-03 · Accepted — The contacts grabber fetches from WhatsApp **chats** as
  well as the address book, with a source filter (everyone / saved contacts / chats). _Why:_
  customer instruction; the address book misses everyone who messaged the user without being
  saved, often the leads a business most wants. _Then:_ Baileys forwards history-sync and
  upserted 1:1 chats (LID chats kept only when WhatsApp supplies the phone mapping), the inbox
  records every inbound 1:1 chat, and `WaContact` carries `inAddressBook`, `hasChat`,
  `lastChatAt` (additive migration `20261003110000`).
- **D151** · 2026-10-03 · Superseded by D152 — Welcome and away messages go out **during quiet
  hours**; the daily cap, pacing and typing still apply. _Why:_ customer decision; they answer
  someone who has just written, and an away message held until morning has missed its purpose.
  _Then:_ widened the same day by D152. Amends D133; resolves K22 and T-1433.
- **D152** · 2026-10-03 · Accepted — **Quiet hours are for campaign-style sending only**:
  campaigns, drip sequences, bulk group sends and warmup. Everything that answers a customer (AI
  bot, chatbot flows, keyword rules, welcome/away, call auto-reply, opt-out confirmation) and
  everything the user scheduled for a chosen time (scheduled inbox messages, status and channel
  posts) goes out at any hour. The daily cap, pacing and typing still apply to all automation;
  typed inbox replies stay exempt from both. _Why:_ customer instruction ("AI replies should
  also be working always, quiet hours only for campaigns"). _Then:_ `quietHoursExempt` on
  `message:send`, `status:post` and `channel:post`; the throttle skips only the quiet-hours
  check for it. Exemption is opt-in per send, so new code that forgets the flag waits rather
  than sending at night. `sendBotMessage` always sets it. AI replies are held only by the cap
  (E6.48). E6.10 and E8.37b now assert replies in quiet hours. Supersedes the "AI replies held
  during quiet hours" default in D127.

## Architecture

- **D2** · 2026-07-27 · Accepted — Baileys runs in a dedicated `utilityProcess` (`wa-service`),
  never in main. _Why:_ 20 sockets of continuous crypto would stall window management and IPC;
  a Baileys crash stays isolated. _Then:_ supervised and restarted by main (D33).
- **D3** · 2026-07-27 · Accepted — `wa-service` never writes to SQLite; main is the sole writer.
  _Why:_ one writer means no lock contention and one place for transactions and audit. _Then:_
  `wa-service` reports results over MessagePort and main persists them.
- **D4** · 2026-07-27 · Accepted — Per-recipient queue rows rather than an in-memory list.
  _Why:_ the only way pause, resume and crash recovery can be correct. _Then:_ counters are
  always recomputed from `CampaignRecipient`.
- **D13** · 2026-07-27 · Accepted — The renderer is served over a custom `app://` scheme, not
  `file://`. _Why:_ the static export uses absolute `/_next/...` paths that 404 under `file://`
  on nested routes; a real origin also makes a strict CSP possible. _Then:_ path traversal is
  contained in `app-protocol.ts`.
- **D14** · 2026-07-27 · Accepted — `scripts/copy-renderer.mjs` copies the export to
  `out/renderer` at build time. _Why:_ Next cannot export outside its directory. _Then:_ the
  unpackaged and packaged layouts are identical, so E2E exercises the shipped load path.
- **D15** · 2026-07-27 · Accepted — The renderer load path keys on `ELECTRON_RENDERER_URL`, not
  `app.isPackaged`. _Why:_ `isPackaged` is false under Playwright and would have sent tests
  down a dev-only path. _Then:_ no dev server means production behaviour.
- **D16** · 2026-07-28 · Accepted — Channel names live in a zod-free `shared/channels.ts`.
  _Why:_ the sandboxed preload cannot `require` zod. _Then:_ a compile-time `AssertEqual` in
  `shared/ipc.ts` keeps the two lists identical.
- **D18** · 2026-07-28 · Accepted — IPC handlers resolve a discriminated result and never throw.
  _Why:_ Electron stringifies a thrown `Error`, destroying the typed taxonomy. _Then:_ no call
  site needs try/catch.
- **D31** · 2026-07-28 · Accepted — `wa-service` is built as an extra entry of the main bundle
  (`out/main/wa-service/index.js`). _Why:_ same externals, must ship inside the asar; a
  separate config would drift.
- **D32** · 2026-07-28 · Accepted — Baileys is imported lazily, only for the real transport.
  _Why:_ the mock must not pay to load it, and a Baileys import failure must not break tests.
- **D33** · 2026-07-28 · Accepted — A missed health ping kills `wa-service` rather than
  waiting. _Why:_ a wedged process never exits on its own. _Then:_ hangs take the tested
  restart path.
- **D34** · 2026-07-28 · Accepted — `system:waServiceState` added. _Why:_ the service is `up`
  before a late-mounting renderer subscribes, so a banner must read current state on first
  paint.
- **D39** · 2026-07-28 · Accepted — The preload converts an unhandled-channel rejection into
  the error envelope. _Why:_ channels may be declared before their handler; the
  never-rejects guarantee must hold anyway. Found by E2.21.
- **D40** · 2026-07-28 · Accepted — Merge-tag rendering lives in `shared/`, used by preview and
  send. _Why:_ two implementations would disagree, and the failure (preview ≠ sent) shows up
  only after thousands of messages.
- **D42** · 2026-07-28 · Accepted — The throttle lives in `wa-service`; the campaign worker loop
  lives in main. _Why:_ the worker needs the database, and pacing at the socket boundary means
  no caller can bypass it. _Then:_ deviation DV2 from SPRINTS §3.1.
- **D89** · 2026-10-02 · Amended by D130 — Marketing-suite architecture. (1) The IPC contract is split
  by domain into `shared/contract/*.ts` and spread into the single `ipcContract` in
  `shared/ipc.ts`. (2) One inbound pipeline, `services/inbound.ts`, in a fixed order:
  own-device skip → opt-out → reply attribution → sequence stop → `message.received` webhook →
  keyword rules → AI; each step isolated so one failure cannot silence the rest. (3) One
  scheduler hub, `services/scheduler.ts`: a single one-minute tick runs every time-driven job
  in sequence. (4) `manual` sends — a person replying in the inbox — skip quiet hours, the daily
  cap and typing simulation. (5) The inbound sender is resolved from a LID to E.164 through
  Baileys' alternate JIDs. (6) The base sending policy is pushed to every device on connect and
  whenever it changes. _Why:_ nine features were built in parallel on one shared layer; the
  order and the single clock are what keep them from interfering. Before (6), a device no
  campaign had touched ran with no daily cap at all. _Then:_ new automation slots into the
  pipeline or registers a scheduler job — never a timer of its own.
- **D93** · 2026-10-02 · Accepted — `settings:setSendingDefaults` takes a partial patch; callers
  are typed with `IpcRequestInput` (zod input) and handlers with the parsed output. _Why:_ a
  screen edits only the fields it shows, and zod defaults make input and output types differ.
- **D94** · 2026-10-03 · Accepted — The daily send counter is persisted in exactly one place,
  `wa-bridge` `onSent`, for every accepted `message:send`, `status:post` and `channel:post`.
  _Why:_ four features kept private copies, and AI, keyword-rule and group sends were never
  counted, so a restart handed devices extra allowance.

- **D130** · 2026-10-03 · Accepted — The inbound pipeline (D89) gains two steps. Order:
  own-device skip → opt-out → reply attribution → sequence stop → `message.received` webhook →
  **welcome/away** → **chatbot flows** → keyword rules → AI. Welcome and away are sent
  _alongside_ whatever follows and never stop it; a flow that answers, or a chat already in a
  flow, stops keyword rules and the AI. _Why:_ a customer halfway through a menu must get the
  menu's next step, not a keyword reply to the word they typed; a greeting is not an answer.
  _Then:_ amends D89. E8.25, E8.26.
- **D144** · 2026-10-03 · Accepted — `services/desktop.ts` owns macOS `activate`, and one
  `showWindow()` in `index.ts` serves the tray, a notification click and a second launch
  (`requestSingleInstanceLock`). _Why:_ `index.ts` also recreated a window on `activate`, so
  one Dock click could open two windows. _Then:_ any new "bring the app forward" path calls
  `showWindow()`; nothing else creates the main window. E8.62, E8.73.
- **D146** · 2026-10-03 · Accepted — Update ("patch") schemas are built with `patchOf()` in
  `shared/contract/common.ts`, never with `.partial()` on a schema that has defaults. _Why:_
  zod 4 applies `.default()` inside `.partial()`, so `rule:update { id, enabled }` — the rules
  list's on/off switch — silently reset match type, devices, priority and cooldown. _Then:_
  `rule:update` and `flow:update` use it (E6.1b). The remaining `.partial()` schemas
  (`settings:setSendingDefaults`, `quickReply:update`, `app:setPrefs`) have no defaults; adding
  one means switching to `patchOf()`. CLAUDE.md §9.

## WhatsApp and anti-ban

- **D6** · 2026-07-27 · Accepted — The mock transport was built in Sprint 2, before the campaign
  engine. _Why:_ nothing after it could be tested without risking a real account.
- **D7** · 2026-07-27 · Accepted — No Baileys fork (`baileys-pro`, `baileys-antiban`, …).
  _Why:_ our pacing is auditable; forks add supply-chain risk to the most sensitive dependency.
- **D45** · 2026-07-28 · Accepted — The daily cap counts successful sends only. _Why:_ a failed
  send never reached WhatsApp.
- **D49** · 2026-07-28 · Accepted — A dropped device's **pending** rows are reassigned; sent and
  in-flight rows are not. _Why:_ only pending work is safe to move. _Then:_ with no device
  left the campaign pauses with a reason instead of stalling at 80%.
- **D61** · 2026-07-28 · Amended by D129 — Group admin detection compares normalized JIDs
  (`jidNormalizedUser`), not string prefixes. _Why:_ prefix matching treated +9198765432100 as
  +919876543210 and offered admin actions that then failed.
- **D63** · 2026-07-28 · Accepted — Media and documents stream from disk (`{ url: path }`),
  never through a Buffer. _Why:_ a 15 MB video peaked at 30.9 MB buffered vs 11.8 MB
  streamed; buffered, 20 devices breach the 800 MB budget.
- **D68** · 2026-07-28 · Accepted — Link previews on for every text message, resolved once per
  URL (6-hour cache, 200 entries, failures cached, concurrent sends share one fetch). _Why:_
  customer chose "always on"; Baileys' default fetches per message, which would hit a site 50k
  times per campaign. _Then:_ `wa-service/link-preview.ts`.
- **D70** · 2026-07-28 · Accepted — Button and interactive templates send real WhatsApp buttons
  and lists, built with `generateWAMessageFromContent` + `relayMessage`. _Why:_ customer
  instruction; Baileys 7 removed the button keys from `sendMessage` but kept the protobufs.
  _Then:_ shape chosen by capability; per-kind caps enforced by us because WhatsApp drops an
  over-limit message silently.
- **D71** · 2026-07-28 · Accepted — Every interactive send falls back to numbered text if it
  cannot be built or relayed. _Why:_ rendering is WhatsApp's per-recipient decision; a campaign
  must never silently stop delivering.
- **D76** · 2026-10-02 · Accepted — A daily-cap hit returns the row to `pending` without
  charging an attempt; the scheduler tick restarts parked campaigns. _Why:_ capped campaigns
  stayed `running` with no workers until relaunch, and cap hits burned retries. _Then:_
  "parked" is derived from SQLite, never tracked in memory. E3.29.
- **D77** · 2026-10-02 · Accepted — Queue expansion de-duplicates on the normalized phone across
  all batches; the first list wins. _Why:_ one number in two lists is two contacts, and
  messaging it twice is what gets accounts reported. E3.16, E3.30.
- **D95** · 2026-10-03 · Accepted — Inbound messages from our own linked numbers never trigger
  automation; they are stored and shown only. _Why:_ warmup sends real messages between our
  devices, and the bot and keyword rules would otherwise answer each other forever and count
  them as campaign replies.
- **D97** · 2026-10-03 · Accepted — A read receipt implies delivery, and every receipt pushes
  `campaign:progress` with the campaign's real status. _Why:_ the dashboard could show more
  reads than deliveries (E5.29), and engagement only updated on remount.
- **D99** · 2026-10-02 · Accepted — The sequence tick starts one detached run behind a module
  guard; rows stuck in `sending` over 10 minutes return to `active`; a send timeout marks the
  enrollment `failed` rather than retrying. _Why:_ a throttle-paced batch can take minutes and
  must not hold up campaigns, posts and webhooks; failing on timeout keeps at-most-once rather
  than risking a duplicate. _Then:_ same accepted bound as K1.
- **D100** · 2026-10-02 · Accepted — Status and channel posts are `ScheduledPost` rows claimed by
  a compare-and-set on status, at most one per device per tick, held with a reason while the
  device is offline or health-paused. Status audiences are the chosen lists (or every contact,
  max 10,000) minus suppressed numbers. _Why:_ one blocked device must not starve the others,
  and a restart rebuilds everything from the table.
- **D107** · 2026-10-02 · Accepted — Bulk group-create settings (description, admins-only, join
  approval) are held in memory per job. _Why:_ `GroupCreateJob` has no column for them and
  create jobs are never resumed. _Then:_ add a `settings` JSON column if resume is ever built.
- **D109** · 2026-10-02 · Accepted — Warmup: a 10-day cap ramp (20, 30, 40, 55, 70, 90, 110,
  135, 160, 200), plus automatic conversations (default 6 a day) between two of our own
  connected warmup devices — 2–4 turns from 16 everyday scripts, 20–90 s apart, outside quiet
  hours or within 08:00–22:00. _Why:_ new numbers that jump straight to volume get banned.
  _Then:_ every warmup send counts toward the cap; a conversation lost to a crash is not retried.
- **D110** · 2026-10-02 · Accepted — Device health breaker: over the last 20 sends, a failure
  rate of 50% (after at least 10) or 3 "blocked" errors pauses the device for one hour,
  persisted in `healthPausedUntil` so it survives a restart. _Why:_ a device being rate-limited
  must stop before it is banned. _Then:_ "Resume now" on the Devices screen clears it.
- **D111** · 2026-10-02 · Accepted — Number verification: one job per list, batches of 50
  through `number:check` on the throttle's lookup queue; queries bounded by an `IN` list carry
  no `take`. _Why:_ Prisma can split a large `IN` list only without `take` ("query parameter
  limit exceeded" at 1,000).
- **D116** · 2026-10-02 · Accepted — Call auto-reject: every call is stored as a `CallEvent`;
  the optional reply is an automated send, and a reply blocked by quiet hours or the cap is
  dropped, not queued. _Why:_ a "sorry I missed your call" hours later reads as spam.

- **D129** · 2026-10-03 · Accepted — A LID (`<id>@lid`) is never a phone number. WhatsApp
  addresses many people by a LID; its digits were shown as the number, and `chatE164` turned
  them into `+<digits>` — possibly a stranger's real number — which then fed opt-out checks,
  profiles and calls. Now a `LidResolver` per account (`wa-service/transport/lid.ts`, shared
  by the Baileys and mock transports) resolves in order: a number WhatsApp hands over (message
  key `remoteJidAlt`/`participantAlt`, contact or member `phoneNumber`), pairs it has learned
  (history-sync `lidPnMappings`, contacts, chats, group members, `lid-mapping.update`), then
  Baileys' store (`signalRepository.lidMapping`). One-to-one chats are filed under the
  phone-number JID whenever the number is known. An unresolved LID is stored as the stand-in
  `<id>@lid`, never E.164, and shown as "Number hidden by WhatsApp" (`shared/phone-display.ts`).
  When the transport's `lidMapping` event reveals the number, `services/lid-repair.ts` renames
  the hidden chat onto it or merges it into the existing chat (Chat foreign keys cascade on
  update; `KeywordRuleHit` and `AiUsage` are moved by hand), and moves opt-outs and
  `CallEvent.from`. A STOP from a hidden number is honoured at once. Group admin detection
  also matches our own LID, and members and join requests resolve. A hidden caller stays
  hidden; `rejectCall` uses the offer's own JID, remembered per call id in the transport.
  _Why:_ messaging or suppressing the wrong number is the worst error a bulk sender can make.
  _Then:_ `Chat.phone` indexed (migration `20261003130000`); amends D61. E8.80–E8.86.
- **D134** · 2026-10-03 · Accepted — Scheduled messages are **automated** sends, not manual
  ones: `ScheduledMessage` rows, claimed by one conditional UPDATE (`scheduled` → `sending`, so
  a Cancel that lands first wins), up to 50 per scheduler tick, sent through `message:send`
  without `manual`. They obey the delay, the daily cap and quiet hours (a parked send returns
  to `scheduled`); an opted-out number fails with a reason; rows left `sending` by a crash are
  recovered at boot. _Why:_ D89 (4) exempts a person typing in the inbox; at send time nobody
  is there, so the message is automation like any other. _Then:_ E8.12–E8.15; the duplicate
  bound is K1's.
- **D147** · 2026-10-03 · Accepted — Baileys inbound parsing reads tapped replies:
  `buttonsResponseMessage`, `templateButtonReplyMessage`, `listResponseMessage` and
  `interactiveResponseMessage` carry the tapped label (or the option id) as the message body,
  and flows match a menu reply by number, title or option id. _Why:_ the body was empty, so on
  a real connection flows and keyword rules never understood a tap. _Then:_ E8.31 covers it on
  the mock only; real-device confirmation is T-1442.

## Data

- **D5** · 2026-07-27 · Accepted — `Contact.data` is a JSON blob with promoted `name`/`phone`.
  _Why:_ lists have arbitrary columns; EAV needs a join per field at 50k rows.
- **D8** · 2026-07-27 · Accepted — Prisma stays; the Drizzle fallback was not needed. _Why:_
  the T1.1 spike passed in a packaged asar build; Prisma 7 ships no engine binary.
- **D35** · 2026-07-28 · Accepted — `skipDuplicates` is unsupported on SQLite, so duplicates are
  filtered with one indexed `IN` query per 1,000-row batch, then `createMany`.
- **D36** · 2026-07-28 · Accepted — CSV parsing is hand-written and streams line by line.
  _Why:_ common parsers want to own the stream; RFC 4180 cases are asserted by E2.15.
- **D37** · 2026-07-28 · Accepted — Import mapping is explicit, not positional. _Why:_ a column
  reorder would silently shuffle every contact's data.
- **D41** · 2026-07-28 · Accepted — Template media is copied into a managed store. _Why:_ a
  scheduled campaign must still send after the user moves the original. A failed copy deletes
  the template.
- **D43** · 2026-07-28 · Accepted — Row claiming uses one raw SQL statement. _Why:_ Prisma
  issues SELECT then UPDATE, leaving a window for a double send.
- **D50** · 2026-07-28 · Accepted — Inbound messages are ignored if the id already exists.
  _Why:_ WhatsApp redelivers on reconnect. E4.1b.
- **D73** · 2026-07-28 · Accepted — A restore verifies the backup before touching the live
  database, and snapshots the current one first. _Why:_ restoring a corrupt file over working
  data turns a recoverable situation into loss. E4.20b.
- **D74** · 2026-07-28 · Accepted — Clear-all-data backs up first and keeps devices and the
  license. _Why:_ the user may have meant something narrower.
- **D90** · 2026-10-02 · Accepted — Migration safety gate. Prisma's diff added columns by
  rebuilding tables with `DROP TABLE`; under our transactional, `foreign_keys=ON` migrator that
  cascade-deleted every chat and message on a populated database (reproduced). Migrations are
  now hand-written `ALTER TABLE … ADD COLUMN`, and `scripts/check-migrations.mjs` (part of
  `npm run verify`) refuses any table drop or foreign-key toggle unless the line above says
  `-- allow-drop: <reason>`. _Why:_ the failure is silent and destroys customer data.
  _Then:_ never apply a generated migration unread; test against a populated database.
- **D112** · 2026-10-02 · Accepted — Google Sheets import downloads the sheet's public CSV export
  (tab from `#gid=`), 20 s timeout, 20 MB cap, and feeds the same pipeline as CSV import. A
  private sheet gets a "share as anyone with the link" instruction. _Why:_ no OAuth app or
  Google credentials to manage. _Then:_ the temp file is always deleted.
- **D113** · 2026-10-02 · Accepted — WhatsApp Business labels mirror into `wa_label` tags keyed
  `deviceId:labelId`; a name clash becomes "Name (WA)". _Why:_ labels then work everywhere
  tags do (filters, campaign audiences) without a second concept.
- **D115** · 2026-10-02 · Accepted — Group member export builds a de-duplicated contact list,
  excluding our own number and hidden LID-only participants; names are the phone numbers.
  _Why:_ WhatsApp group metadata carries no names.

- **D136** · 2026-10-03 · Accepted — vCard import uses our own reader (2.1, 3.0, 4.0, folded
  lines, QUOTED-PRINTABLE) and makes **one row per card**: the mobile number (else the
  preferred one, else the first) in `Phone`, every other number in `Other phones`. _Why:_ one
  row per number would message the same person once per number they own — the duplicate a
  bulk sender must avoid; only five fields are needed, so a library adds nothing. E8.40,
  E8.44, E8.45.
- **D137** · 2026-10-03 · Accepted — `.xlsx` import reads the first sheet in a
  `worker_threads` worker that posts rows in chunks of 1,000. Numbers are kept as the text the
  cell stores, never a float, so a 12-digit phone number survives exactly; dates become ISO
  strings. `.xls` and other types are refused with a plain-English instruction. _Why:_ an
  `.xlsx` is parsed whole, which for 50,000 rows is seconds of CPU that would freeze main.
  _Then:_ the worker ships as its own chunk; the packaged self-test reads a small workbook
  through it (T-1429).
  E8.41–E8.43, E8.46, E8.48.
- **D139** · 2026-10-03 · Accepted — The import pipeline yields one macrotask
  (`setImmediate`) after every 1,000-row batch. _Why:_ rows already in memory and the
  synchronous SQLite driver resolve entirely in microtasks, which starved every IPC call for
  the whole import. Worst IPC latency during a 50,000-row `.xlsx` import is now 0.73 s. E8.48.
- **D140** · 2026-10-03 · Accepted — The WhatsApp contacts grabber exports into a **new**
  list, de-duplicated by normalized phone across every chosen phone (read in phone order, so
  copies are adjacent and nothing is held in memory; the first name found wins), in
  1,000-row transactions; a failed export deletes the half-filled list. Opted-out numbers are
  **imported but never messaged**, and the user is told how many. _Why:_ suppression is
  enforced at send time for every list (D105), so dropping them would add nothing and hide
  who they are. E8.54, E8.55, E8.59.
- **D148** · 2026-10-03 · Accepted — A group chat is named from `Group.name` (else "Group"),
  and an inbound push name never renames it. _Why:_ `persistIncoming` renamed the group to
  whichever member wrote last, which also made group notifications show a person's name.

## Security and licensing

- **D17** · 2026-07-28 · Accepted — The CSP pins build-time hashes of Next's inline scripts.
  _Why:_ the alternatives were `'unsafe-inline'` or nonces a static export cannot produce;
  hashing fails closed.
- **D23** · 2026-07-28 · Accepted — The license gate is enforced twice: the window entry route
  and an IPC guard that refuses every non-license channel. E1.14f.
- **D24** · 2026-07-28 · Accepted — Rejected activations and conflicts are not persisted; only
  a successful bind writes a record.
- **D25** · 2026-07-28 · Accepted — License-cache tamper detection is an HMAC keyed to the
  machine fingerprint, documented as evidence, not DRM. Real enforcement is server-side.
- **D29** · 2026-07-28 · Accepted — Redaction lives in an `electron-log` hook, not at call
  sites. _Why:_ call-site discipline eventually fails; `console.*` in main routes through it.
- **D52** · 2026-07-28 · Accepted — `settings:get` never returns a secret, even encrypted; it
  reports a masked placeholder. _Why:_ a readable key ends up in a screenshot or bug report.
- **D64** · 2026-07-28 · Accepted — An unparseable license-server reply maps to `unreachable`
  (grace), never `invalid`. _Why:_ a CDN page, a 429 or a proxy must not lock out a paying
  customer. Explicit rejections still apply immediately.
- **D65** · 2026-07-28 · Accepted — The real `HttpLicenseService` is tested against a local stub
  that pins the assumed wire contract (E1.17–E1.21). _Then:_ when the real API arrives, the
  difference surfaces as a failing test.
- **D88** · 2026-10-02 · Accepted — The license fingerprint uses the OS username when `uid` is
  negative. _Why:_ Windows reports -1, so every user on a machine shared one identity.
- **D104** · 2026-10-02 · Accepted — Webhooks: a 32-byte secret, encrypted at rest and shown
  once; each POST signed `X-RapBooster-Signature: sha256=<hmac>`; 10 s timeout, no redirects;
  retries after 1 m, 5 m, 30 m, 2 h and 6 h, then failed; finished deliveries deleted after 30
  days; payloads and URLs never logged. _Why:_ receivers must be able to verify us, and a
  down endpoint must not be hammered.
- **D105** · 2026-10-02 · Accepted — Opt-out: a whole message equal to a keyword (any case)
  suppresses the number globally; the confirmation goes out as a `manual` send so quiet hours
  and the cap cannot block it; START lifts only `stop_keyword` entries, never a manual or
  imported one. _Why:_ an opt-out is a legal and ban-risk matter; a contact must not be able to
  undo an opt-out the business recorded.

## AI and automation

- **D53** · 2026-07-28 · Accepted — Auto-reply failures produce distinct codes
  (`AI_KEY_MISSING`, `AI_KEY_INVALID`, `AI_RATE_LIMITED`, `AI_TIMEOUT`), never a silent skip.
- **D54** · 2026-07-28 · Superseded by D102 — Only the keyword escalation trigger enforced.
- **D78** · 2026-10-02 · Accepted — Escalation is sticky until `chat:resumeBot`; the escalation
  message goes through the throttle; history excludes the message being answered. _Why:_ the
  bot talked over the human, and the model saw the new message twice. E4.28, E4.29.
- **D101** · 2026-10-02 · Accepted — Per-chat coalescing (default 5 s): a burst gets one model
  call that reads all of it; a superseded call returns `coalesced`, re-checked after the model
  answers. State is in memory. _Why:_ three quick messages must not cost three calls or three
  replies. _Then:_ a restart during the wait means that burst gets no bot reply — never two.
- **D102** · 2026-10-02 · Accepted — Escalation triggers on keywords, after N messages or after
  elapsed time, counted from `escalatedAt` so a chat handed back is not re-escalated at once.
  The confidence trigger stays unenforced: no provider returns a confidence score. _Then:_
  supersedes D54.
- **D103** · 2026-10-02 · Accepted — Keyword rules: text is trimmed, lower-cased and
  whitespace-collapsed; `exact` ignores surrounding punctuation; `starts_with` and `contains`
  need a Unicode-aware whole-word boundary ("spices" never matches "price"); rules run by
  priority, then oldest. A rule that matched but did not send (cooldown, suppressed number,
  parked by quiet hours or cap, failed send) still keeps the AI silent. _Why:_ a business that
  wrote a rule for a word does not want a model improvising an answer to it.
- **D108** · 2026-10-02 · Accepted — A reply held by quiet hours or the cap is kept as a draft
  and sent by the scheduler; it expires after 24 h, or is discarded if the chat was escalated,
  opted out or answered by a person. _Why:_ a day-old bot reply is worse than none.
- **D114** · 2026-10-02 · Accepted — Multiple AI providers behind one `complete()`: OpenAI and
  OpenAI-compatible through the OpenAI SDK, Anthropic and Gemini through `fetch` (no new SDK
  dependencies). Keys go in headers, never URLs; Gemini Flash runs with `thinkingBudget: 0`;
  config is cached in memory and invalidated on change, keys are read fresh. _Why:_ customer
  scope (D117) without adding dependencies.

- **D131** · 2026-10-03 · Accepted — One pure step function, `runStep` in
  `services/flows/run.ts`, decides every flow step; the engine (real chats) and
  `flow:simulate` (the builder's Test panel) both call it, and the graph schema in
  `shared/flow.ts` is shared by the contract and the engine. Menus match by number, title or
  option id; anything else gets the menu's "didn't understand" text and the menu again;
  question answers become `{{variables}}` that win over contact fields of the same name;
  handoff reuses `escalate()`. Replies are serialised per chat. _Why:_ what the customer
  receives must be exactly what the user saw when testing. E8.21–E8.25, E8.30, E8.35.
- **D132** · 2026-10-03 · Accepted — A chat's place in a flow is one `FlowSession` row,
  refreshed on each step and valid for **30 minutes** (`FLOW_SESSION_MINUTES`); the scheduler
  deletes expired ones and the next message starts fresh. A send parked by quiet hours or the
  cap leaves the session where it was. Switching a flow off or deleting it **ends its
  sessions**; a duplicated flow starts off. _Why:_ a customer who left mid-menu must not have
  a later "1" read as a menu choice, and a flow the user turned off must stop answering now,
  not in half an hour. E8.29, E8.33.
- **D133** · 2026-10-03 · Amended by D151 — Welcome and away messages (Setting `autoreply.config`,
  both off by default). Welcome: once per chat, on its first inbound message. Away: outside
  the weekly hours (this computer's time zone), at most once per cooldown per chat (default
  12 h). Each is **stamped before sending** with a conditional update (`Chat.welcomedAt`,
  `Chat.lastAwayAt`), so of two simultaneous messages only one can win. Both are automated
  sends: quiet hours and the cap apply, and a parked one is dropped, not queued (as D116). A
  dropped away message is un-stamped so the next message may try again; a welcome is not,
  because a welcome mid-conversation reads as a glitch. Never sent to groups, chats opted out
  of auto-replies, or suppressed numbers. _Then:_ with the default quiet hours no away message
  goes out 21:00–09:00 (K22, ROADMAP R4), and a welcome lost to quiet hours is gone (K23,
  T-1432). E8.36–E8.39.

## UX

- **D20** · 2026-07-28 · Amended by D145 — Hand-written UI primitives instead of the shadcn CLI. _Why:_
  the CLI wants to own the layout of a single-app root. Deviation DV1. _Then:_ the Wave 3 design
  system (D145) modernised them; they are still hand-written.
- **D21** · 2026-07-28 · Accepted — The `app://` handler resolves Next's dot-flattened RSC
  payload paths. _Why:_ every client-side navigation 404'd and silently fell back to a full
  load. Amended by D27.
- **D22** · 2026-07-28 · Accepted — The sidebar uses `useSelectedLayoutSegment`, not
  `usePathname`, which did not update in a persisted layout of a static export.
- **D28** · 2026-07-28 · Accepted — `refreshGate()` reloads only when the lock state changes.
  _Why:_ reloading on every revalidation destroyed open dialogs and typed input.
- **D44** · 2026-07-28 · Accepted — `deviceIds`/`listIds` dropped `.min(1)` from zod. _Why:_
  messages users read come from the handler, not a generic validation error.
- **D48** · 2026-07-28 · Accepted — The per-recipient view is a dialog, not a `/campaigns/[id]`
  route. _Why:_ a static export cannot prerender unknown ids. Deviation DV3.
- **D67** · 2026-07-28 · Accepted — No default country code; every import asks for a dial
  prefix (or "numbers already include it"). _Why:_ customer decision; a wrong default is silent
  and 50,000 rows wide. E2.14b, E2.14c.
- **D75** · 2026-07-28 · Accepted — The dashboard refetches on campaign, device and message
  events. _Why:_ it is the landing route and is usually already mounted. E4.22.
- **D96** · 2026-10-03 · Amended by D141 — A native file picker (`system:pickFile`) for every file
  input; non-technical users never type a path. _Then:_ every screen wired in Wave 3 (D141,
  T-1311).
- **D106** · 2026-10-02 · Accepted — Spintax (`{a|b}`) is rendered before merge tags, so
  customer data is never spun; a brace group with no `|` keeps its braces; nesting capped at
  20; `\{ \} \|` escape. _Then:_ a literal `\|` in old templates now sends as `|`.

- **D135** · 2026-10-03 · Accepted — Quick replies are shared by every number and rendered in
  main with the shared merge-tag renderer (D40), from the newest contact record with the
  chat's number, falling back to the chat's name and number so `{{Name}}` is never blank.
  Inserting one never sends: the text lands in the composer and the person presses Send, so
  it goes out as a manual reply. Shortcuts are unique. E8.1–E8.5.
- **D141** · 2026-10-03 · Accepted — `FilePickerField` (`renderer/components/common`) over
  `system:pickFile` replaces every typed path: contact import, opt-out import, broadcast
  media, template media, voice note and sticker; inbox and scheduled attachments use the same
  picker. _Then:_ no screen takes a typed path; amends D96. Restoring a backup has no screen
  yet (T-1438). E8.17, E8.47.
- **D142** · 2026-10-03 · Accepted — Desktop notifications for inbound messages, only while
  the app is not in front: at most one per chat per 10 s, and more than three chats inside
  that window collapse into one "N new messages". The 80-character preview reaches the OS
  notification and nothing else — never a log line, never the test seam. A click opens that
  chat (`app:navigate`). The macOS Dock shows the unread total; Windows flashes the taskbar
  button. _Why:_ a busy inbox must not bury the screen, and message content is customer data
  (CLAUDE.md §5.2). E8.61–E8.66.
- **D143** · 2026-10-03 · Accepted — Background running and start at login. Defaults:
  notifications on; run in background on (closing hides to the tray, with a one-time notice);
  start at login off. Start at login registers on Windows with `--hidden` and on macOS with
  `openAtLogin` (a login launch is detected by `wasOpenedAtLogin`); it is a no-op on Linux,
  under E2E and in an unpackaged dev run. A `--hidden` launch starts in the tray. The tray
  shows "N devices connected · M campaigns running", Open, Pause all campaigns and Quit.
  Preferences are `app.<field>` rows in `Setting`, cached in memory because the close handler
  is synchronous (DV7). _Why:_ campaigns send only while the app runs (ROADMAP R1, R2).
  E8.60, E8.67–E8.69, E8.71–E8.73.
- **D145** · 2026-10-03 · Accepted — The theme system ([DESIGN-SYSTEM.md](./DESIGN-SYSTEM.md)):
  every colour is a token in `globals.css`, redefined under `[data-theme='dark']`; `<html>`
  carries `data-theme` (shown) and `data-theme-preference` (chosen: light, dark, or system —
  the default, which follows the OS live). An inline bootstrap script, admitted by its CSP
  hash, applies the choice from `localStorage` **before first paint**. `system:setThemeSource`
  sets `nativeTheme.themeSource`, so the OS title bar follows, and the window background
  colour follows the theme. The sidebar is grouped (Overview · Messaging · Audience ·
  Automation · Setup) and collapsible. _Why:_ only a synchronous read beats the first paint,
  and the choice is a per-machine cosmetic, so losing it costs only the default. _Then:_
  amends D20; SPRINTS.md §7 "light theme only" no longer holds (DV9). E7.1–E7.10.
- **D153** · 2026-10-03 · Accepted — Help content has one source: typed data in
  `renderer/help/` (per-screen topics, field tips, glossary, troubleshooting, safety rules,
  tours, getting-started). The help drawer, InfoTips, tours, Help Center and
  `docs/USER-GUIDE.md` are all rendered from it; the guide is generated by
  `npm run docs:guide` and `check:guide` (in `verify`) fails when it is stale. _Why:_ the
  customer wants no learning curve, and two copies of the same help drift apart within a
  sprint. _Then:_ every help claim was checked against the code (E9.15 asserts every tour target
  and `data-help` id exists); the generator uses Node's built-in type stripping, so no new
  dependency.
- **D154** · 2026-10-03 · Accepted — Onboarding is real in production and off under test: with
  `NODE_ENV=test` and no `RB_ONBOARDING=1`, `app:getPrefs` reports onboarding completed and
  every tour seen (`toursSeen: ['*']`) — only while the value was never saved. _Why:_ ~300
  existing specs would otherwise meet a welcome dialog and tour prompts. _Then:_ E9.1 proves
  the default, E9.16–E9.20 opt in; E8.60's expected defaults changed with it.
- **D155** · 2026-10-03 · Accepted — The getting-started checklist ticks itself from real data
  (devices, contacts, templates, campaigns, auto-replies) and keeps only its dismissed state, in
  the Setting row `help.checklist`. The welcome dialog shows the daily cap and quiet hours that
  are actually configured. _Why:_ a checklist the user must tick by hand is ignored; one that
  reflects reality teaches. _Then:_ E9.18.
- **D156** · 2026-10-03 · Accepted — Escape on an open tooltip is handled by a native listener
  on the trigger. _Why:_ React handles events at its root — here the document, where Dialog
  listens too — so a React `stopPropagation` ran too late and Escape also closed the dialog
  behind the tooltip. _Then:_ E9.7 asserts it; the help drawer uses the same technique.
- **D157** · 2026-10-03 · Accepted — `npm run typecheck` runs `next typegen renderer` first.
  _Why:_ the build typechecks before Next generates its typed routes, so the first build after
  adding a route always failed (the help route did). _Then:_ cross-platform (no shell
  redirects in npm scripts — Windows runs them in cmd).

## Packaging and release

- **D12** · 2026-07-27 · Accepted — The packaged build is verified by a `--self-test` flag on the
  shipped entry. _Why:_ native-module and asar breakage only reproduces in a real package.
- **D55** · 2026-07-28 · Accepted — `sharp` is a direct production dependency, pinned exactly.
  _Why:_ Baileys declares it as an optional _peer_; electron-builder walks only our graph, so
  every packaged build sent images with no thumbnail, silently. CLAUDE.md §8 cites this.
- **D58** · 2026-07-28 · Accepted — The thumbnail check lives in the packaged self-test, and
  `scripts/check-media-deps.mjs` asserts the declaration. _Why:_ only a packaged run proves
  sharp ships and loads from outside the asar.
- **D62** · 2026-07-28 · Accepted — Raw control characters are rejected from source by
  `scripts/check-source.mjs`. _Why:_ one NUL byte made `transport/baileys.ts` invisible to grep
  for four sprints and hid D61's bug.

- **D150** · 2026-10-03 · Accepted — Main finds the wa-service entry by probing a candidate
  list (`wa-service-path.ts` `waServicePath()`, like `migrationsDir()`), never `__dirname`
  alone, and the packaged self-test asserts the entry exists. _Why:_ when the self-test began
  importing the tray module, Rollup moved `wa-bridge` into a shared chunk, `__dirname` became
  `out/main/chunks`, wa-service was looked up at `chunks/wa-service/index.js` and crashed, and
  every `device:connect` failed. _Then:_ CLAUDE.md §9 — no module imported by two entries
  resolves a sibling file from `__dirname`.

## Dependencies

- **D9** · 2026-07-27 · Superseded by D86 — Baileys version (7.x RC vs 6.7.x) left to the
  customer. _Then:_ pinned exactly to `7.0.0-rc14`.
- **D10** · 2026-07-27 · Superseded by D86 — Electron held at 42.7.1 for better-sqlite3
  prebuilds. Now 44.5.1 with better-sqlite3 13.
- **D11** · 2026-07-27 · Superseded by D86 — better-sqlite3 pinned to 12.11.1 for the Prisma
  adapter's range. Now 13 with an `overrides` entry.
- **D56** · 2026-07-28 · Accepted — sharp chosen over jimp. _Why:_ Baileys' jimp branch checks
  `typeof Jimp === 'object'`, but jimp exports a function, so it is unreachable. Revisit if a
  later Baileys fixes it.
- **D57** · 2026-07-28 · Superseded by D82 — sharp pinned at 0.35.3; the guard refuses anything
  below 0.35.0 or a caret range (libvips CVEs).
- **D59** · 2026-07-28 · Superseded by D68 — Link previews deliberately left off.
- **D60** · 2026-07-28 · Amended by D91 — Every Baileys optional peer must be triaged in
  `scripts/check-deps.mjs`. _Why:_ two silent-degradation bugs (D55, D59) came from swallowed
  dynamic imports.
- **D69** · 2026-07-28 · Superseded by D86 — `link-preview-js` pinned at 4.0.4 above Baileys'
  stale `^3` range (SSRF advisory), with an `overrides` entry. Now 5.0.0, same override.
- **D82** · 2026-10-02 · Accepted — sharp 0.35.3 → 0.35.5; js-yaml and fast-uri updated in the
  lockfile. _Why:_ new advisories in the shipped graph (K7).
- **D86** · 2026-10-02 · Accepted — Every dependency on its latest stable release, three held:
  `typescript` 5.9.3 (typescript-eslint supports `<6.1`), `vite` 7.3.6 (8 needs electron-vite 6,
  still beta), `prisma` 7.10.0 (8 is an RC). Notable: Electron 44.5.1, Baileys `7.0.0-rc14`,
  better-sqlite3 13 (override past the adapter's `^12`, proven by the packaged self-test),
  link-preview-js 5, Next 16.3, React 19.3. _Why:_ customer instruction (D120).
- **D91** · 2026-10-02 · Accepted — `audio-decode` ships so voice notes carry a waveform;
  asserted by `scripts/check-deps.mjs` and the packaged self-test. _Why:_ D60 triaged it as not
  needed while media was image/video only; voice notes changed that.

- **D138** · 2026-10-03 · Accepted — `read-excel-file` `9.3.10`, pinned exactly, reads
  `.xlsx` (D137). _Why:_ customer scope (D125); it reads a sheet into rows and lets us keep
  numbers as their stored text. The npm `xlsx` (SheetJS) package is frozen at an old release
  with open advisories. _Then:_ asserted by the packaged self-test (T-1429).

## Process and testing

- **D19** · 2026-07-28 · Accepted — The E2E fixture awaits `firstWindow()`, which only exists
  after the database boot, before yielding.
- **D26** · 2026-07-28 · Accepted — E2E activates through the real UI rather than seeding the
  database, so the gate cannot rot.
- **D27** · 2026-07-28 · Accepted — The flattened-payload resolver is recursive; route groups
  add nesting levels.
- **D30** · 2026-07-28 · Accepted — Activation E2E asserts the input value before clicking,
  waiting for hydration rather than adding a test hook.
- **D38** · 2026-07-28 · Superseded by D47 — Launch timeout raised to 60 s.
- **D46** · 2026-07-28 · Accepted — A global warm-up launch before the suite, so the first test
  does not absorb the cold-disk cost.
- **D47** · 2026-07-28 · Accepted — Launch timeouts unified in `fixtures/constants.ts`.
- **D51** · 2026-07-28 · Accepted — Inbound test traffic is driven by env vars on the mock
  transport, never a "simulate" IPC channel. _Then:_ production ships no test surface.
- **D72** · 2026-07-28 · Accepted — The mock records every send to `WA_MOCK_SEND_LOG`, and
  campaigns and group sends share one payload builder. _Why:_ nothing could assert what was
  sent; it immediately exposed group sends dropping media.
- **D83** · 2026-10-02 · Accepted — `GRAPH_REPORT.md` is committed; it and `graphify-out/` are
  excluded from Prettier and markdownlint.
- **D84** · 2026-10-02 · Accepted — Duplicate decision ids renumbered: restore, clear-data and
  dashboard became D73–D75; the sharp entries kept D55–D57 because code cites them.
- **D87** · 2026-10-02 · Accepted — Claude memory lives in the repository only: auto memory off,
  `~/.claude/CLAUDE.md` excluded, notes in `.claude/memory/MEMORY.md` imported by CLAUDE.md.
  _Why:_ customer instruction; a committed file follows the repo between machines.
- **D92** · 2026-10-02 · Amended by D149 — E2E-only seams and defaults. Under `NODE_ENV=test` quiet
  hours and typing simulation default **off** (otherwise results depend on the wall clock).
  Honoured only under test: `RB_TICK_MS`, `RB_PICK_FILE`, `RB_SHEETS_BASE_URL`,
  `RB_WEBHOOK_BACKOFF_MS`, `RB_WARMUP_FORCE`. Mock transport seams: `WA_MOCK_INJECT`,
  `WA_MOCK_ACTION_LOG`, `WA_MOCK_INVALID_SUFFIX`, `WA_MOCK_BUSINESS` (plus D72's
  `WA_MOCK_SEND_LOG`). _Then:_ specs that cover quiet hours or typing switch them on
  explicitly; a stray variable in production does nothing.
- **D98** · 2026-10-03 · Accepted — Parallel agents work in git worktrees. Each worktree must
  first be reset onto `main` (they can start on an old commit) and use a hard-linked
  `node_modules` (`cp -al`), never a symlink: Turbopack rejects the symlink and `npm run build`
  then fails **while exiting 0**, leaving a stale `out/` that E2E silently tests. _Then:_
  CLAUDE.md §3.4.
- **D149** · 2026-10-03 · Accepted — Wave 3 E2E seams, all inert unless `NODE_ENV=test`:
  `RB_FLOW_SESSION_MS` (shortens the 30-minute flow session, minimum 500 ms), `RB_NOTIFY_LOG`
  (notifications are written to a file as `{title, chatId}` — never the body — instead of
  reaching the OS) and `globalThis.__rbDesktop` (desktop internals for the tray and close
  specs). The mock transport also emits a fixed address book and chat list through the new
  `contacts` event. _Why:_ D92's rule — a stray variable in production does nothing. _Then:_
  amends D92; CLAUDE.md §9.
