# Graph Report - RapBooster-Advance-Electron  (2026-10-02)

## Corpus Check
- 135 files · ~126,120 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 3, .jsonc 1, .toml 1)

## Summary
- 1368 nodes · 2929 edges · 77 communities (66 shown, 11 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 79 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `69ca6db1`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- support.js
- manager.ts
- main/index.ts
- Button
- package.json
- devDependencies
- react
- contact.ipc.ts
- CLAUDE.md — Engineering Instructions
- getPrisma
- wa-bridge.ts
- wa-service/index.ts
- baileys.ts
- device.ipc.ts
- scripts
- compilerOptions
- ipc.ts
- responder.ts
- TemplatesPage
- compilerOptions
- MockTransport
- shared/types.ts
- ref_node_fs
- AppError
- router.ts
- template-message.ts
- ThrottleScheduler
- chatbot/page.tsx
- group-runner.ts
- transport/types.ts
- dependencies
- ai-openai.spec.ts
- 11.1 Tasks
- check-deps.mjs
- app-shell.tsx
- Communities (76 total, 9 thin omitted)
- RapBooster Advance — Sprint Tracker
- RapBooster Advance
- settings/page.tsx
- 10.1 Tasks
- 2. Screen inventory
- @playwright/test
- toast-provider.tsx
- perf.mjs
- cleanupUserDataDir
- RapBooster Advance — What I still need from you
- 12.1 Tasks
- 6. Core algorithms
- link-preview.ts
- campaign-engine.ts
- ref_node_child_process
- RapBooster Advance — Sprint Plan
- settings.ipc.ts
- .prettierrc.json
- ref_node_path
- 1.3 Request and response shapes
- Release guide
- useIpc.ts
- Section 1 — License Server API ⬜
- Graph Report - RapBooster-Advance-Electron  (2026-10-02)
- eslint.config.mjs
- sprint-4-settings.spec.ts
- RapBooster Advance — Improvement Plan
- 3. Architecture
- 5. IPC contract
- chatbot.ipc.ts
- create-campaign-dialog.tsx
- 4. Database schema
- electron.vite.config.ts
- overrides
- tsconfig.json
- prisma

## God Nodes (most connected - your core abstractions)
1. `getPrisma()` - 75 edges
2. `Communities (76 total, 9 thin omitted)` - 68 edges
3. `Button()` - 37 edges
4. `AppError` - 31 edges
5. `bootUi()` - 27 edges
6. `react` - 27 edges
7. `scripts` - 25 edges
8. `get()` - 24 edges
9. `registerHandler()` - 24 edges
10. `useIpcQuery()` - 24 edges

## Surprising Connections (you probably didn't know these)
- `4.2 Settings keys` --references--> `apiKey()`  [INFERRED]
  SPRINTS.md → electron/main/services/ai/responder.ts
- `6. Testing` --references--> `MockLicenseService`  [INFERRED]
  CLAUDE.md → electron/main/services/license/mock.ts
- `9. Common pitfalls in this codebase` --references--> `isEncryptionAvailable()`  [INFERRED]
  CLAUDE.md → electron/main/services/secure-store.ts
- `T4.1 — Inbox` --references--> `Message`  [INFERRED]
  SPRINTS.md → renderer/app/(app)/inbox/page.tsx
- `God Nodes (most connected - your core abstractions)` --references--> `get()`  [INFERRED]
  GRAPH_REPORT.md → design/support.js

## Import Cycles
- None detected.

## Communities (77 total, 11 thin omitted)

### Community 0 - "support.js"
Cohesion: 0.06
Nodes (75): boot(), bundledBlob(), cdnScriptFor(), collectProps(), compileAttr(), compileTemplate(), contentKey(), createComponentFactory() (+67 more)

### Community 1 - "manager.ts"
Cohesion: 0.06
Nodes (52): registerLicenseHandlers(), appVersion(), computeFingerprint(), deviceFingerprint(), deviceName(), primaryMac(), HttpLicenseConfig, HttpLicenseService (+44 more)

### Community 2 - "main/index.ts"
Cohesion: 0.07
Nodes (63): APP_ORIGIN, APP_SCHEME, registerAppScheme(), rendererRoot(), resolveFlattenedSegment(), serveRendererBundle(), createBackup(), listBackups() (+55 more)

### Community 3 - "Button"
Cohesion: 0.11
Nodes (23): ContactsPage(), RouteError(), RootError(), FILTERS, Recipient, RecipientsDialog(), TONE, ContactTable() (+15 more)

### Community 4 - "package.json"
Cohesion: 0.06
Nodes (34): author, description, license, main, name, private, version, clsx (+26 more)

### Community 5 - "devDependencies"
Cohesion: 0.06
Nodes (34): devDependencies, clsx, concurrently, date-fns, electron, electron-builder, electron-vite, eslint (+26 more)

### Community 6 - "react"
Cohesion: 0.17
Nodes (20): date-fns, lucide-react, react, CampaignsPage(), DevicesPage(), relative(), WAGroupsPage(), EMOJI (+12 more)

### Community 7 - "contact.ipc.ts"
Cohesion: 0.12
Nodes (28): RFC-4180, duplicatePolicy(), parseData(), parseFields(), refreshCount(), registerContactHandlers(), requireList(), serializeContact() (+20 more)

### Community 8 - "CLAUDE.md — Engineering Instructions"
Cohesion: 0.07
Nodes (30): 10. Quick reference, 1.1 Non-negotiable decisions, 1. Project in one paragraph, 2. Architecture rules, 3.1 When to fan out, 3.2 When NOT to fan out, 3.3 Rules for delegating, 3. Multi-agent working mode (+22 more)

### Community 9 - "getPrisma"
Cohesion: 0.19
Nodes (8): applyConnectionPragmas(), applyFilePragmas(), getPrisma(), registerCampaignHandlers(), serialize(), campaignEngine, counters(), toCsvValue()

### Community 10 - "wa-bridge.ts"
Cohesion: 0.12
Nodes (14): EventHandler, Pending, ServiceState, waBridge, isEventEnvelope(), WaEventKind, WaEvents, WaMessage (+6 more)

### Community 11 - "wa-service/index.ts"
Cohesion: 0.10
Nodes (9): createTransport(), emit(), main(), post(), backoffDelay(), SessionManager, Transport, WaEventEnvelope (+1 more)

### Community 12 - "baileys.ts"
Cohesion: 0.11
Nodes (15): BaileysTransport, buildButtonsMessage(), buildListMessage(), hydratedButton(), mimeFor(), nativeFlowButton(), Session, toJid() (+7 more)

### Community 13 - "device.ipc.ts"
Cohesion: 0.31
Nodes (9): sessionsDir(), startWaService(), authDirFor(), recoverDeviceSessions(), registerDeviceHandlers(), requireDevice(), serialize(), emitToAll() (+1 more)

### Community 14 - "scripts"
Cohesion: 0.08
Nodes (25): scripts, build, build:renderer, check:deps, check:source, db:generate, db:migrate, db:studio (+17 more)

### Community 15 - "compilerOptions"
Cohesion: 0.08
Nodes (24): compilerOptions, allowJs, baseUrl, esModuleInterop, incremental, isolatedModules, jsx, lib (+16 more)

### Community 16 - "ipc.ts"
Cohesion: 0.07
Nodes (27): Contact, AssertEqual, campaign, campaignRecipient, chat, chatbotConfig, contact, contactList (+19 more)

### Community 17 - "responder.ts"
Cohesion: 0.16
Nodes (22): buildMessages(), buildSystemPrompt(), ChatbotSettings, GOAL_HINT, HistoryMessage, parseKnowledge(), parseProducts(), shouldEscalate() (+14 more)

### Community 18 - "TemplatesPage"
Cohesion: 0.36
Nodes (6): emptyButton(), TemplatesPage(), close(), create(), reset(), validateButtons()

### Community 19 - "compilerOptions"
Cohesion: 0.09
Nodes (22): compilerOptions, baseUrl, esModuleInterop, exactOptionalPropertyTypes, isolatedModules, lib, module, moduleResolution (+14 more)

### Community 20 - "MockTransport"
Cohesion: 0.16
Nodes (6): MockSession, MockTransport, num(), recordSend(), OutgoingMessage, RemoteGroup

### Community 21 - "shared/types.ts"
Cohesion: 0.11
Nodes (25): Phase 3 — Delivery and reply analytics · M, zod, Message, BUTTON_TYPE_HINT, BUTTON_TYPE_LABEL, ButtonDraft, INTERACTIVE_TYPES, TYPE_LABEL (+17 more)

### Community 22 - "ref_node_fs"
Cohesion: 0.24
Nodes (4): activateWith(), launchLicensed(), launchWith(), LoggedSend

### Community 23 - "AppError"
Cohesion: 0.15
Nodes (23): mediaDir(), parseButtons(), persistIncoming(), registerChatHandlers(), serializeChat(), serializeMessage(), registerGroupHandlers(), registerHandler() (+15 more)

### Community 24 - "router.ts"
Cohesion: 0.12
Nodes (20): Handler, registered, UNGATED, api, channels, events, RapBoosterApi, Window (+12 more)

### Community 25 - "template-message.ts"
Cohesion: 0.33
Nodes (7): buildTemplateMessage(), parseOptions(), TemplateRow, withIds(), extractTags(), RenderResult, renderTemplate()

### Community 26 - "ThrottleScheduler"
Cohesion: 0.19
Nodes (6): DailyCapReachedError, DEFAULT_THROTTLE, DeviceState, localDay(), ThrottleConfig, ThrottleScheduler

### Community 27 - "chatbot/page.tsx"
Cohesion: 0.13
Nodes (12): AIBotPage(), Config, DELAY_PRESETS, Field(), GOALS, INDUSTRIES, LANGUAGES, Panel() (+4 more)

### Community 28 - "group-runner.ts"
Cohesion: 0.20
Nodes (6): GroupJobProgress, groupRunner, ProgressListener, groupName(), groupNamePreview(), SuffixRule

### Community 29 - "transport/types.ts"
Cohesion: 0.21
Nodes (9): SessionCallbacks, SessionState, TransportEmitter, DisconnectKind, OutgoingDocument, OutgoingMedia, OutgoingText, TransportEvents (+1 more)

### Community 30 - "dependencies"
Cohesion: 0.14
Nodes (14): dependencies, baileys, better-sqlite3, electron-log, electron-updater, @hapi/boom, libphonenumber-js, link-preview-js (+6 more)

### Community 31 - "ai-openai.spec.ts"
Cohesion: 0.13
Nodes (4): requests, StubReply, requests, StubReply

### Community 32 - "11.1 Tasks"
Cohesion: 0.14
Nodes (14): 11.1 Tasks, 11.2 Acceptance criteria, 11.3 E2E tests, 11.4 Risks, 11. Sprint 3 — Campaign engine and groups, T3.1 — Campaign creation and expansion, T3.2 — Send engine, T3.3 — Crash-safe resume (+6 more)

### Community 33 - "check-deps.mjs"
Cohesion: 0.14
Nodes (10): absent, baileys, declaredPeers, mediaEnum, pkg, problems, required, root (+2 more)

### Community 34 - "app-shell.tsx"
Cohesion: 0.24
Nodes (9): next, AppGroupLayout(), AppShell(), NavLink(), ALL_NAV, FOOTER_NAV, NavItem, PRIMARY_NAV (+1 more)

### Community 35 - "Communities (76 total, 9 thin omitted)"
Cohesion: 0.03
Nodes (68): Communities (76 total, 9 thin omitted), Community 0 - "support.js", Community 10 - "wa-bridge.ts", Community 11 - "wa-service/index.ts", Community 12 - "baileys.ts", Community 13 - "main/index.ts", Community 14 - "scripts", Community 15 - "compilerOptions" (+60 more)

### Community 36 - "RapBooster Advance — Sprint Tracker"
Cohesion: 0.15
Nodes (13): 10. Test results history, 11. Release history, 12. How to update this file, 1. Overview, 2. Sprint 0 — Documentation, 4. Sprint 2 — Devices, contacts, templates, 5. Sprint 3 — Campaign engine and groups, 6. Sprint 4 — Inbox, AI bot, settings, dashboard, release (+5 more)

### Community 37 - "RapBooster Advance"
Cohesion: 0.17
Nodes (12): Architecture, Commands, Documents, Driving the fake WhatsApp transport, Getting started, Known limitations, Measured behaviour, RapBooster Advance (+4 more)

### Community 38 - "settings/page.tsx"
Cohesion: 0.12
Nodes (14): formatDate(), Row(), Section(), SettingsPage(), STATUS_TONE, CAMPAIGN_TONES, CampaignStatusPill(), DEVICE_LABELS (+6 more)

### Community 39 - "10.1 Tasks"
Cohesion: 0.17
Nodes (12): 10.1 Tasks, 10.2 Acceptance criteria, 10.3 E2E tests, 10.4 Risks, 10. Sprint 2 — Devices, contacts, templates, T2.1 — `wa-service` utility process, T2.2 — Baileys session manager, T2.3 — Devices screen (+4 more)

### Community 40 - "2. Screen inventory"
Cohesion: 0.17
Nodes (12): 2.0 License Activation — Sprint 1, 2.0b License Conflict dialog — Sprint 1, 2.1 Dashboard — Sprint 4, 2.2 Inbox — Sprint 4, 2.3 Campaigns — Sprint 3, 2.4 WA Groups — Sprint 3, 2.5 Devices — Sprint 2, 2.6 Contacts — Sprint 2 (+4 more)

### Community 41 - "@playwright/test"
Cohesion: 0.22
Nodes (4): @playwright/test, APP_READY_TIMEOUT_MS, test, launchWithInbound()

### Community 42 - "toast-provider.tsx"
Cohesion: 0.22
Nodes (8): metadata, RootLayout(), viewport, Level, Toast, ToastContext, ToastProvider(), TONES

### Community 43 - "perf.mjs"
Cohesion: 0.20
Nodes (9): best, binary, child, samples, timer, timings, treeRssMb(), warm (+1 more)

### Community 44 - "cleanupUserDataDir"
Cohesion: 0.21
Nodes (3): cleanupUserDataDir(), newUserDataDir(), Fixture

### Community 45 - "RapBooster Advance — What I still need from you"
Cohesion: 0.20
Nodes (10): Already decided — no action needed, RapBooster Advance — What I still need from you, Section 2 — Branding and Identity ⬜, Section 3 — Update Feed ⬜, Section 4 — Code Signing ⬜, Section 5 — OpenAI / AI Bot ⬜, Section 6 — Defaults already in effect ⬜, Section 7 — Anything I have not asked about ⬜ (+2 more)

### Community 46 - "12.1 Tasks"
Cohesion: 0.18
Nodes (11): 12.1 Tasks, 12.2 Acceptance criteria, 12.3 E2E tests, 12.4 Risks, 12. Sprint 4 — Inbox, AI bot, settings, dashboard, release, T4.1 — Inbox, T4.2 — AI Bot, T4.3 — Settings, remaining sections (+3 more)

### Community 47 - "6. Core algorithms"
Cohesion: 0.20
Nodes (10): 6.1 Throttle scheduler — the anti-ban core, 6.2 Campaign worker loop, 6.3 Atomic claim, 6.4 Crash recovery, 6.5 Device connection state machine, 6.6 Merge tags, 6.7 CSV import pipeline, 6.8 License state machine (+2 more)

### Community 48 - "link-preview.ts"
Cohesion: 0.28
Nodes (7): cache, Entry, firstUrl(), inFlight, remember(), resolveLinkPreview(), baileys

### Community 49 - "campaign-engine.ts"
Cohesion: 0.25
Nodes (7): bumpDailyCount(), CampaignCounters, claimNext(), isDailyCapError(), isRetryable(), isStale(), ProgressListener

### Community 50 - "ref_node_child_process"
Cohesion: 0.22
Nodes (5): NAMES, problems, child, env, mockEnv

### Community 51 - "RapBooster Advance — Sprint Plan"
Cohesion: 0.22
Nodes (9): 13. Cross-sprint definition of done, 14. Dependency manifest, 1.1 Locked decisions, 1.2 Explicitly out of scope, 1. Product definition, 7. Design system, 8. Sprint 0 — Documentation, RapBooster Advance — Sprint Plan (+1 more)

### Community 52 - "settings.ipc.ts"
Cohesion: 0.36
Nodes (7): dailyCapPerDevice(), readNumber(), registerSettingsHandlers(), SENDING_DEFAULTS, encryptValue(), isEncryptionAvailable(), Surprising Connections (you probably didn't know these)

### Community 53 - ".prettierrc.json"
Cohesion: 0.25
Nodes (7): endOfLine, overrides, printWidth, semi, singleQuote, tabWidth, trailingComma

### Community 55 - "1.3 Request and response shapes"
Cohesion: 0.25
Nodes (8): 1.3 Request and response shapes, Activate — request, Activate — response when the key is already in use on another machine (the "conflict" case), Activate — response when the key is invalid / expired / revoked, Activate — success response, Deactivate — request and response, Transfer — request and response, Validate / heartbeat — request and response

### Community 56 - "Release guide"
Cohesion: 0.29
Nodes (7): Building, Publishing an update, Release checklist, Release guide, Signing, Update behaviour, and why, What is missing, and what happens without it

### Community 57 - "useIpc.ts"
Cohesion: 0.21
Nodes (7): ActivationPage(), Conflict, REJECTION_COPY, relativeTime(), QueryState, Settled, SerializedError

### Community 58 - "Section 1 — License Server API ⬜"
Cohesion: 0.29
Nodes (7): 1.1 Connection, 1.2 Endpoints, 1.4 Outcome mapping, 1.5 Device identity, 1.6 Policy, 1.7 Anything else, Section 1 — License Server API ⬜

### Community 60 - "Graph Report - RapBooster-Advance-Electron  (2026-10-02)"
Cohesion: 0.22
Nodes (8): Community Hubs (Navigation), Corpus Check, Graph Freshness, Graph Report - RapBooster-Advance-Electron  (2026-10-02), Import Cycles, Knowledge Gaps, Suggested Questions, Summary

### Community 61 - "eslint.config.mjs"
Cohesion: 0.40
Nodes (4): @eslint/js, eslint-plugin-react-hooks, globals, typescript-eslint

### Community 63 - "RapBooster Advance — Improvement Plan"
Cohesion: 0.22
Nodes (9): Customer direction (2026-10-02), Open questions, Phase 0 — Confirmed defects (done), Phase 1 — Safety defaults · M, Phase 2 — Opt-out / STOP list · M, Phase 4 — Tags and segments · L, Phase 5 — AI cost and handoff controls · M, RapBooster Advance — Improvement Plan (+1 more)

### Community 64 - "3. Architecture"
Cohesion: 0.40
Nodes (5): 3.1 Process model, 3.2 Security baseline, 3.3 Repository layout, 3.4 Filesystem layout at runtime, 3. Architecture

### Community 65 - "5. IPC contract"
Cohesion: 0.40
Nodes (5): 5.1 Shape, 5.2 Invoke channels, 5.3 Event channels (main → renderer, push only), 5.4 Error taxonomy, 5. IPC contract

### Community 66 - "chatbot.ipc.ts"
Cohesion: 0.83
Nodes (3): loadOrCreate(), parseKeywords(), registerChatbotHandlers()

### Community 69 - "4. Database schema"
Cohesion: 0.50
Nodes (4): 4.1 Enumerations, 4.2 Settings keys, 4.3 Why `Contact.data` is a JSON blob, 4. Database schema

### Community 71 - "overrides"
Cohesion: 0.67
Nodes (3): link-preview-js, overrides, baileys

## Knowledge Gaps
- **531 isolated node(s):** `semi`, `singleQuote`, `trailingComma`, `printWidth`, `tabWidth` (+526 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 662 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `God Nodes (most connected - your core abstractions)` connect `AppError` to `support.js`, `main/index.ts`, `Button`, `react`, `getPrisma`, `Graph Report - RapBooster-Advance-Electron  (2026-10-02)`?**
  _High betweenness centrality (0.160) - this node is a cross-community bridge._
- **Why does `getPrisma()` connect `getPrisma` to `manager.ts`, `main/index.ts`, `chatbot.ipc.ts`, `contact.ipc.ts`, `device.ipc.ts`, `responder.ts`, `campaign-engine.ts`, `settings.ipc.ts`, `AppError`, `group-runner.ts`?**
  _High betweenness centrality (0.100) - this node is a cross-community bridge._
- **Why does `Graph Report - RapBooster-Advance-Electron  (2026-10-02)` connect `Graph Report - RapBooster-Advance-Electron  (2026-10-02)` to `Communities (76 total, 9 thin omitted)`, `settings.ipc.ts`, `AppError`?**
  _High betweenness centrality (0.098) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `getPrisma()` (e.g. with `client()` and `God Nodes (most connected - your core abstractions)`) actually correct?**
  _`getPrisma()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `semi`, `singleQuote`, `trailingComma` to the rest of the system?**
  _531 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `support.js` be split into smaller, more focused modules?**
  _Cohesion score 0.060678962844159315 - nodes in this community are weakly interconnected._
- **Should `manager.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05939629990262902 - nodes in this community are weakly interconnected._