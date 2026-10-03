# RapBooster Advance — Tasks

The to-do list: everything done, in progress, remaining and blocked, as checkboxes.

Status and test numbers: [SPRINT-TRACKER.md](../SPRINT-TRACKER.md) · Why things are the way they
are: [DECISIONS.md](./DECISIONS.md) · What each feature must do and its test IDs:
[SPRINTS.md](../SPRINTS.md) · Forward plan: [ROADMAP.md](./ROADMAP.md)

## How to use this file

- **Tick a box in the same commit as the work.** A box is ticked only when the code is merged
  to `main` and its tests pass — not when an agent says it is done.
- One line per task: `ID` · status · title — _owner_ · decisions (`Dnn`, in DECISIONS.md) ·
  tests (`En.n`, in SPRINTS.md) or known issue (`Knn`, in the tracker).
- IDs are `T-<epic><nn>` and are never reused. Old sprint IDs (`T1.1` …) are kept in brackets
  so older commits and notes still resolve.
- New work goes under its epic. A new known gap gets a task in [Known gaps](#14-known-gaps)
  and, if it is a real limitation, a `K` row in the tracker.

**Status:** ✅ done · 🟡 in progress · ⬜ not started · 🔴 blocked on the customer ·
⚪ deferred by decision

**Owners:** _Coordinator_ (the main session) · _<Area> agent_ (a worktree subagent, D98) ·
_Customer_

## Summary

| Epic                                                             | Done | Open |
| ---------------------------------------------------------------- | ---- | ---- |
| [1. Foundation](#1-foundation)                                   | 18   | 0    |
| [2. Audience](#2-audience)                                       | 6    | 0    |
| [3. Campaigns](#3-campaigns)                                     | 13   | 0    |
| [4. Rich messages and templates](#4-rich-messages-and-templates) | 7    | 0    |
| [5. Groups](#5-groups)                                           | 9    | 0    |
| [6. Broadcast](#6-broadcast)                                     | 4    | 0    |
| [7. Inbox and automation](#7-inbox-and-automation)               | 5    | 0    |
| [8. Sequences](#8-sequences)                                     | 5    | 0    |
| [9. AI](#9-ai)                                                   | 9    | 0    |
| [10. Devices and safety](#10-devices-and-safety)                 | 11   | 0    |
| [11. Docs](#11-docs)                                             | 4    | 0    |
| [12. Packaging](#12-packaging)                                   | 8    | 0    |
| [13. Wave 3 — in progress](#13-wave-3--in-progress)              | 1    | 14   |
| [14. Known gaps](#14-known-gaps)                                 | 0    | 27   |
| [15. Blocked on the customer](#15-blocked-on-the-customer)       | 0    | 6    |
| [16. Release](#16-release)                                       | 0    | 7    |

---

## 1. Foundation

- [x] **T-101** ✅ Prisma/Electron packaging spike [T1.1] — _Coordinator_ · D8, D10–D12
- [x] **T-102** ✅ Scaffold, tooling and scripts [T1.2] — _Coordinator_
- [x] **T-103** ✅ Electron shell and security baseline: CSP hashes, permission deny-all, navigation lock [T1.3] — _Coordinator_ · D13, D17 · E1.3
- [x] **T-104** ✅ Database layer, schema, forward-only boot migrator, backups, integrity check [T1.4] — _Coordinator_ · E1.13–E1.13c
- [x] **T-105** ✅ IPC contract, router, sandbox-safe preload, renderer hooks [T1.5] — _Coordinator_ · D16, D18, D39 · E1.14b–e
- [x] **T-106** ✅ UI primitives and tokens [T1.6] — _Coordinator_ · D20
- [x] **T-107** ✅ App shell, sidebar, routes, error boundaries [T1.7] — _Coordinator_ · D21, D22, D27 · E1.10c, E1.10d
- [x] **T-108** ✅ Licensing: service, fingerprint, activation, conflict, gate, offline grace [T1.8] — _Coordinator_ · D23–D25, D64, D65, D88 · E1.1–E1.7, E1.17–E1.21
- [x] **T-109** ✅ Settings — license panel [T1.9] — _Coordinator_ · E1.9b, E1.9c
- [x] **T-110** ✅ Logging, automatic redaction, crash handlers, diagnostics [T1.10] — _Coordinator_ · D29 · E1.15
- [x] **T-111** ✅ Playwright harness and packaged smoke test [T1.11] — _Coordinator_ · D19, D26, D46, D47
- [x] **T-112** ✅ Settings: AI key, sending defaults, backup and restore, clear data, about [T4.3] — _Coordinator_ · D52, D73, D74 · E4.17–E4.21
- [x] **T-113** ✅ Dashboard aggregates [T4.4] — _Coordinator_ · D75 · E4.22
- [x] **T-114** ✅ Hardening: perf profile, `npm run verify` gate [T4.6] — _Coordinator_
- [x] **T-115** ✅ Hardening pass 2026-10-02: four confirmed defects fixed [T4.8] — _Coordinator_ · D76–D78 · E3.29, E3.30, E4.28, E4.29
- [x] **T-116** ✅ Code graph built, `GRAPH_REPORT.md` committed — _Coordinator_ · D83
- [x] **T-117** ✅ Marketing-suite foundation: 16 tables, `shared/contract/*`, 26 wa-service requests, inbound pipeline, scheduler hub — _Coordinator_ · D89, D90, D93
- [x] **T-118** ✅ Post-merge review of the D89 wave: counters, receipts, own-device inbound, pacing, `system:pickFile` — _Coordinator_ · D94–D97 · E5.29, E5.34, E5.69, E6.10

## 2. Audience

- [x] **T-201** ✅ Contact lists, virtualized table, CSV import and export at 50k rows [T2.4] — _Coordinator_ · D35–D37, D67 · E2.11–E2.17, E2.14b, E2.14c
- [x] **T-202** ✅ Tags: CRUD, bulk tag and untag, filter by tag — _Audience agent_ · E5.1–E5.3, E5.16
- [x] **T-203** ✅ Opt-out list with STOP/START keywords, import and export — _Audience agent_ · D105, D127 · E5.4–E5.7, E5.11–E5.13, E5.17
- [x] **T-204** ✅ Verify numbers on WhatsApp with live progress — _Audience agent_ · D111 · E5.14, E5.15, E5.19
- [x] **T-205** ✅ Google Sheets import — _Audience agent_ · D112 · E5.8–E5.10, E5.18
- [x] **T-206** ✅ WhatsApp Business labels mirrored into tags — _Devices agent_ · D113 · E6.65

## 3. Campaigns

- [x] **T-301** ✅ Campaign creation and queue expansion [T3.1] — _Coordinator_ · D77
- [x] **T-302** ✅ Send engine: per-device workers, atomic claim, retries [T3.2] — _Coordinator_ · D42, D43, D45
- [x] **T-303** ✅ Crash-safe resume [T3.3] — _Coordinator_ · K1 · E3.8
- [x] **T-304** ✅ Controls, scheduling, device reassignment [T3.4] — _Coordinator_ · D49
- [x] **T-305** ✅ Campaigns UI and recipients view [T3.5] — _Coordinator_ · D48
- [x] **T-306** ✅ Campaign report CSV [T3.6] — _Coordinator_
- [x] **T-307** ✅ Daily-cap stall and duplicate-phone fixes — _Coordinator_ · D76, D77 · E3.29, E3.30
- [x] **T-308** ✅ Tag audiences, opt-out skips, "skip numbers not on WhatsApp" — _Campaigns agent_ · E5.20–E5.23, E5.33
- [x] **T-309** ✅ Quiet hours park and resume campaigns — _Campaigns agent_ · D126 · E5.24–E5.26
- [x] **T-310** ✅ Delivered, read and replied analytics with reply attribution — _Campaigns agent_ · D97, D127 · E5.28–E5.30
- [x] **T-311** ✅ Duplicate campaign — _Campaigns agent_ · E5.31
- [x] **T-312** ✅ `maxConcurrentDevices` enforced — _Campaigns agent_ · E5.32
- [x] **T-313** ✅ A campaign keeps its own pacing when a setting changes mid-run — _Coordinator_ · E5.34

## 4. Rich messages and templates

- [x] **T-401** ✅ Templates: four types, managed media store, preview [T2.5] — _Coordinator_ · D41 · E2.18–E2.22
- [x] **T-402** ✅ Merge tags shared by preview and send [T2.6] — _Coordinator_ · D40
- [x] **T-403** ✅ Real WhatsApp buttons and lists with text fallback [T4.7] — _Coordinator_ · D70–D72 · E2.23–E2.26
- [x] **T-404** ✅ Link previews resolved once per URL [T4.7] — _Coordinator_ · D68, D69
- [x] **T-405** ✅ Voice, sticker, location, contact, poll, event and product templates — _Rich agent_ · D91 · E5.40–E5.44, E5.47–E5.49
- [x] **T-406** ✅ Spintax with live variation count — _Rich agent_ · D106 · E5.43, E5.45
- [x] **T-407** ✅ Inbox attach menu sends rich messages as manual sends — _Rich agent_ · E5.46, E5.50

## 5. Groups

- [x] **T-501** ✅ Group sync and list [T3.7] — _Coordinator_ · D61
- [x] **T-502** ✅ Bulk group messaging [T3.8] — _Coordinator_
- [x] **T-503** ✅ Bulk group creation [T3.9] — _Coordinator_
- [x] **T-504** ✅ Invite links, join by link or code, group settings — _Groups agent_ · E5.60–E5.62
- [x] **T-505** ✅ Add, remove and promote members; join requests — _Groups agent_ · E5.63–E5.65
- [x] **T-506** ✅ Group member grabber: export members to a contact list — _Groups agent_ · D115 · E5.66
- [x] **T-507** ✅ Communities: create, link, unlink, create a group inside — _Groups agent_ · E5.67
- [x] **T-508** ✅ Bulk create with description, admins-only and join approval — _Groups agent_ · D107 · E5.68
- [x] **T-509** ✅ Groups screen: Manage dialog, join, export, communities tab — _Groups agent_ · E5.69, E5.70

## 6. Broadcast

- [x] **T-601** ✅ Text and image status updates to lists or everyone, minus opt-outs — _Broadcast agent_ · D100 · E5.80, E5.81, E5.87
- [x] **T-602** ✅ Scheduled posts, cancellation, waiting for a disconnected device — _Broadcast agent_ · D100 · E5.82, E5.85, E5.86, E5.88
- [x] **T-603** ✅ WhatsApp Channels: create, follow, post, remove locally — _Broadcast agent_ · E5.83, E5.84, E5.89
- [x] **T-604** ✅ Status & Channels screen — _Broadcast agent_ · E5.90, E5.91

## 7. Inbox and automation

- [x] **T-701** ✅ Inbox: two panes, live ingestion, composer, receipts [T4.1] — _Coordinator_ · D50 · E4.1–E4.8
- [x] **T-702** ✅ Keyword auto-replies with dry-run tester — _Automation agent_ · D103 · E6.1–E6.11
- [x] **T-703** ✅ Signed webhooks with retries — _Automation agent_ · D104 · E6.12–E6.16
- [x] **T-704** ✅ Call auto-reject with optional reply — _Automation agent_ · D116 · E6.17–E6.19
- [x] **T-705** ✅ Our own numbers never trigger automation — _Coordinator_ · D95

## 8. Sequences

- [x] **T-801** ✅ Drip sequences: up to 20 steps with delays, editor — _Sequences agent_ · D99 · E6.20, E6.27
- [x] **T-802** ✅ Enrollment from lists and tags, skipping opt-outs and duplicates — _Sequences agent_ · E6.24
- [x] **T-803** ✅ Stop on reply (optional) — _Sequences agent_ · E6.21, E6.22
- [x] **T-804** ✅ Pause and resume, unenroll, wait for an offline device — _Sequences agent_ · E6.23, E6.25, E6.26
- [x] **T-805** ✅ Live `sequence:changed` push to the Sequences screen — _Coordinator_

## 9. AI

- [x] **T-901** ✅ AI Bot config and auto-reply worker [T4.2] — _Coordinator_ · D53 · E4.9–E4.16, E4.24–E4.27 (see K12)
- [x] **T-902** ✅ Escalation is sticky; model sees each message once — _Coordinator_ · D78 · E4.28, E4.29
- [x] **T-903** ✅ Providers: OpenAI, Anthropic, Gemini, OpenAI-compatible — _AI agent_ · D114 · E6.40–E6.42, E6.50
- [x] **T-904** ✅ Daily caps per device and per chat; usage report — _AI agent_ · D127 · E6.41, E6.42, E6.43
- [x] **T-905** ✅ Approve-before-send drafts in the inbox — _AI agent_ · E6.44, E6.45, E6.49
- [x] **T-906** ✅ Burst coalescing — _AI agent_ · D101 · E6.46
- [x] **T-907** ✅ "After N messages" and "after time" escalation triggers — _AI agent_ · D102 · E6.47
- [x] **T-908** ✅ Replies held in quiet hours, sent after, expired at 24 h — _AI agent_ · D108 · E6.48
- [x] **T-909** ✅ AI replies pushed live into an open inbox thread — _AI agent_ · K10

## 10. Devices and safety

- [x] **T-1001** ✅ `wa-service` utility process and supervisor [T2.1] — _Coordinator_ · D2, D3, D31–D34
- [x] **T-1002** ✅ Baileys session manager: QR, pairing code, backoff, logout [T2.2] — _Coordinator_
- [x] **T-1003** ✅ Devices screen [T2.3] — _Coordinator_ · E2.1–E2.10
- [x] **T-1004** ✅ Mock transport [T2.7] — _Coordinator_ · D6, D51, D72, D92
- [x] **T-1005** ✅ Base sending policy on every device; 200/day and 21:00–09:00 defaults — _Coordinator_ · D89, D126
- [x] **T-1006** ✅ Warmup ramp and automatic warmup conversations — _Devices agent_ · D109 · E6.60, E6.61, E6.67, E6.70
- [x] **T-1007** ✅ Device health breaker with "Resume now" — _Devices agent_ · D110 · E5.27, E6.62
- [x] **T-1008** ✅ Business account detection and product catalog — _Devices agent_ · E6.63, E6.64
- [x] **T-1009** ✅ Typing simulation before automated sends — _Devices agent_ · E6.66
- [x] **T-1010** ✅ Sending & safety settings, 7-day dashboard chart, safety notice — _Devices agent_ · E6.68, E6.69
- [x] **T-1011** ✅ One daily send counter for every sender — _Coordinator_ · D94

## 11. Docs

- [x] **T-1101** ✅ Sprint 0 planning documents [T0.1–T0.7] — _Coordinator_
- [x] **T-1102** ✅ RELEASE.md: build, sign and publish procedure — _Coordinator_
- [x] **T-1103** ✅ Improvement plan, now [ROADMAP.md](./ROADMAP.md) — _Coordinator_
- [x] **T-1104** ✅ README rewritten for the expanded product — _Docs agent_

## 12. Packaging

- [x] **T-1201** ✅ Packaging, signing and auto-update wired (unverified — see T-1602–T-1604) [T4.5] — _Coordinator_ · K6
- [x] **T-1202** ✅ Ship sharp so images get thumbnails — _Coordinator_ · D55, D56, D58
- [x] **T-1203** ✅ Triage every Baileys optional peer in `check-deps` — _Coordinator_ · D60, D91
- [x] **T-1204** ✅ Reject raw control bytes in source — _Coordinator_ · D62
- [x] **T-1205** ✅ Stream media from disk — _Coordinator_ · D63
- [x] **T-1206** ✅ macOS packaging: dmg + zip, arm64 + x64 — _Coordinator_ · D85
- [x] **T-1207** ✅ Latest stable dependencies, three held — _Coordinator_ · D86
- [x] **T-1208** ✅ Migration safety gate `check:migrations` — _Coordinator_ · D90

---

## 13. Wave 3 — in progress

Customer decisions D122–D125 (2026-10-03). Test IDs are assigned when each spec is written
(SPRINTS.md gets a Sprint 6 section).

- [ ] **T-1301** 🟡 Design system: tokens, components, light and dark themes, WhatsApp phone preview — _Design agent_ · D122 · [DESIGN-SYSTEM.md](./DESIGN-SYSTEM.md)
- [x] **T-1302** ✅ Docs restructure: DECISIONS, TASKS, ROADMAP, tracker dashboard — _Docs agent_
- [ ] **T-1303** ⬜ Quick replies (saved snippets in the composer) — _Inbox agent_ · D124
- [ ] **T-1304** ⬜ Contact side panel with notes, tags and campaign history — _Inbox agent_ · D124
- [ ] **T-1305** ⬜ Desktop notifications, tray icon, run in background, start at login — _Coordinator_ · D124
- [ ] **T-1306** ⬜ Scheduled messages per chat — _Inbox agent_ · D124
- [ ] **T-1307** ⬜ Visual chatbot flow builder — _Automation agent_ · D125
- [ ] **T-1308** ⬜ Welcome and away messages — _Automation agent_ · D125
- [ ] **T-1309** ⬜ WhatsApp contacts grabber (save chats and contacts to a list) — _Audience agent_ · D125
- [ ] **T-1310** ⬜ Excel (.xlsx) and vCard (.vcf) import — _Audience agent_ · D125
- [ ] **T-1311** ⬜ Native file picker wired everywhere a path is typed today (contacts CSV, opt-out import, template media, voice, sticker, restore) — _Coordinator_ · D96
- [ ] **T-1312** ⬜ First-run setup wizard: link a device → import contacts → first template → first campaign — _Help agent_ · D123
- [ ] **T-1313** ⬜ Help panel and tooltips on every screen — _Help agent_ · D123
- [ ] **T-1314** ⬜ Interactive guided tours — _Help agent_ · D123
- [ ] **T-1315** ⬜ In-app Help Center and [USER-GUIDE.md](./USER-GUIDE.md) — _Docs agent_ · D123

## 14. Known gaps

Found by the D89 feature agents and the post-merge review. Each is either fixed here or
accepted with a reason in the tracker's known issues.

- [ ] **T-1401** ⬜ Rich messages show only a one-line summary in the inbox thread — no map, poll or audio player — _Inbox agent_ · K13
- [ ] **T-1402** ⬜ No push event for new calls or webhook deliveries; those tables refresh on open or Refresh — _Automation agent_ · K14
- [ ] **T-1403** ⬜ Group settings panel does not prefill the current description (no channel returns it) — _Groups agent_ · K15
- [ ] **T-1404** ⬜ A product template can be sent from a device whose catalog lacks the product — _Rich agent_ · K16
- [ ] **T-1405** ⬜ Verify-numbers progress sends one event per 50-number batch, not at most 1/s — _Audience agent_
- [ ] **T-1406** ⬜ No "tag the whole list" button (the API supports it) — _Audience agent_
- [ ] **T-1407** ⬜ Opt-out list pages with "Load more" instead of virtualization — _Audience agent_
- [ ] **T-1408** ⬜ Group sync does not refresh admins-only, locked and join-approval flags — _Groups agent_ · K17
- [ ] **T-1409** ⬜ A group deleted in WhatsApp stays in the list — _Groups agent_ · K17
- [ ] **T-1410** ⬜ Decide whether an excluded tag applies per phone number rather than per contact record — _Customer_ · K18
- [ ] **T-1411** ⬜ Number check could fall behind a device sending faster than 50 messages/s — _Campaigns agent_
- [ ] **T-1412** ⬜ Devices are assigned round-robin before skips, so skipped rows count toward a device's share — _Campaigns agent_
- [ ] **T-1413** ⬜ Deliveries for a disabled webhook stay pending and are sent late if it is re-enabled — _Automation agent_
- [ ] **T-1414** ⬜ Untested paths: time escalation trigger, OpenAI-compatible provider, AI skip for suppressed numbers — _AI agent_
- [ ] **T-1415** ⬜ Untested paths: keyword rule on a suppressed number, sequence enrollment by contact ids, `sequence.completed` webhook — _Automation agent_
- [ ] **T-1416** ⬜ Mock `createGroup` does not log the description, so E5.68 cannot assert it — _Groups agent_
- [ ] **T-1417** ⬜ Split oversize files: `chatbot/page.tsx` (457 lines), `inbox/page.tsx` (429), `rule-dialog.tsx` (305) — _Coordinator_
- [ ] **T-1418** ⬜ Move per-provider default models and key names into `shared/` (duplicated in main and renderer) — _AI agent_
- [ ] **T-1419** ⬜ `device:syncLabels` only re-reads Business status; no on-demand label fetch — _Devices agent_
- [ ] **T-1420** ⬜ Renumber the two OpenAI-stub specs that collide with E4.24/E4.25 — _Coordinator_ · K12
- [ ] **T-1421** ⬜ Refresh the code graph after the D89 wave (`graphify . --update`) — _Coordinator_ · D83
- [ ] **T-1422** ⬜ Re-run `npm audit` after the D89 wave and re-triage — _Coordinator_ · K7
- [ ] **T-1423** ⬜ Accessibility pass: roles, labels, keyboard navigation — _Design agent_ · D20
- [ ] **T-1424** ⬜ Scheduled daily backups, optionally to a chosen folder — _Coordinator_
- [ ] **T-1425** ⬜ Fuller diagnostics bundle: wa-service state, per-device errors, migration version — _Coordinator_
- [ ] **T-1426** ⬜ Edit or reschedule a draft or scheduled campaign — _Campaigns agent_
- [ ] **T-1427** ⚪ CI on Windows and a unit-test layer — _Coordinator_ · D81

## 15. Blocked on the customer

Each needs an answer in [REQUIREMENTS.md](../REQUIREMENTS.md); nothing else blocks a release.

- [ ] **T-1501** 🔴 License server API: URL, endpoints, request and reply shapes — _Customer_ · REQUIREMENTS §1
- [ ] **T-1502** 🔴 Windows code-signing certificate — _Customer_ · REQUIREMENTS §4 · K3
- [ ] **T-1503** 🔴 Apple Developer ID, notarization credentials and a Mac build machine or macOS CI runner — _Customer_ · REQUIREMENTS §4 · D119
- [ ] **T-1504** 🔴 Branding: icon, publisher name, support URL — _Customer_ · REQUIREMENTS §2
- [ ] **T-1505** 🔴 Update feed URL and hosting — _Customer_ · REQUIREMENTS §3
- [ ] **T-1506** 🔴 GitHub push access for the Claude GitHub App, so each wave can be pushed to `main` — _Customer_ · REQUIREMENTS §8

## 16. Release

- [ ] **T-1601** ⬜ Swap `services/license/http.ts` onto the real API and update the stub contract (E1.17–E1.21) — _Coordinator_ · after T-1501
- [ ] **T-1602** ⬜ Signed Windows installer that installs without a SmartScreen warning — _Coordinator_ · after T-1502, T-1504
- [ ] **T-1603** ⬜ Signed and notarized macOS dmg and zip — _Coordinator_ · after T-1503, T-1504
- [ ] **T-1604** ⬜ Update feed verified: an installed build detects, downloads and installs an update — _Coordinator_ · after T-1505 · K6
- [ ] **T-1605** ⬜ Packaged smoke test (`npm run test:smoke`) on a Windows and a macOS machine for the current tree — _Coordinator_
- [ ] **T-1606** ⬜ First real-device smoke test: one real number, a handful of sends, manual, never in CI — _Customer_ with _Coordinator_
- [ ] **T-1607** ⬜ Version bump, release notes, tracker release history — _Coordinator_ · [RELEASE.md](../RELEASE.md)
