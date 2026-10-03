# RapBooster Advance — Roadmap

What comes next, and in what order. Forward-looking only: finished work is ticked in
[TASKS.md](./TASKS.md), decisions are in [DECISIONS.md](./DECISIONS.md), live status is in
[SPRINT-TRACKER.md](../SPRINT-TRACKER.md), and inputs only the customer can give are in
[REQUIREMENTS.md](../REQUIREMENTS.md).

> This file was `IMPROVEMENT-PLAN.md` until 2026-10-03. Source comments that cite
> "IMPROVEMENT-PLAN.md Phase 2–5" refer to the phases in [Delivered](#delivered) below.

## Where we are

| Milestone                          | State                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| Sprints 0–4 (the nine screens)     | ✅ Done                                                                         |
| Improvement plan, Phases 0–5       | ✅ Done — see [Delivered](#delivered)                                           |
| Wave D89 — marketing suite         | ✅ Merged 2026-10-03 (D117; SPRINTS.md §15)                                     |
| **Wave 3 — ease of use and inbox** | 🟡 In progress — [below](#wave-3--now)                                          |
| Release                            | 🔴 Blocked on the customer — [TASKS §15](./TASKS.md#15-blocked-on-the-customer) |

## Wave 3 — now

Customer decisions of 2026-10-03 (D122–D125). The goal is that a non-technical user can
install, link a number and run a first campaign without help, and can work the inbox all day.

| Theme          | Features                                                                     | Tasks                  |
| -------------- | ---------------------------------------------------------------------------- | ---------------------- |
| Look and feel  | Design system, light and dark themes, WhatsApp phone preview                 | T-1301                 |
| Help           | Setup wizard, help on every screen, guided tours, Help Center and user guide | T-1312–T-1315          |
| Inbox          | Quick replies, contact side panel with notes, scheduled messages per chat    | T-1303, T-1304, T-1306 |
| Desktop        | Notifications, tray icon, background running, start at login                 | T-1305                 |
| Automation     | Visual chatbot flow builder, welcome and away messages                       | T-1307, T-1308         |
| Audience       | WhatsApp contacts grabber, Excel and vCard import                            | T-1309, T-1310         |
| No typed paths | Native file picker everywhere                                                | T-1311                 |

**Order.** The design system lands first, because every other Wave 3 screen is built on its
components. Then, in parallel worktrees (D98): inbox features · automation builder · audience
imports · help content. Help tours are written last, against the finished screens.

## After Wave 3

1. **Release** — blocked only on the customer's inputs (TASKS §15), then TASKS §16: real
   license API, signed Windows and macOS builds, a verified update, a first real-device test.
2. **Known-gap cleanup** — TASKS §14, cheapest and highest-risk first: test coverage gaps
   (T-1414, T-1415), the graph and audit refresh (T-1421, T-1422), then UX gaps.
3. **Candidates, not yet decided** — each needs a customer yes before it is scheduled:

| Candidate                                                             | Effort | Note                                                           |
| --------------------------------------------------------------------- | ------ | -------------------------------------------------------------- |
| Saved dynamic segments (filters on custom fields), beyond static tags | M      | Static tags first was the accepted default (D127)              |
| Knowledge-base retrieval instead of sending the whole KB every prompt | M–L    | Cuts AI cost on large knowledge bases                          |
| Rich inbox rendering: maps, polls, audio player                       | M      | T-1401                                                         |
| CI on Windows and macOS with a unit-test layer                        | M      | Deferred by the customer (D81)                                 |
| Team or multi-user inbox                                              | L      | **Not planned** — one local user per install (REQUIREMENTS §9) |
| Proxy support per device                                              | M      | Out of scope since SPRINTS §1.2                                |

**Effort:** S ≤ 3 days · M ≈ 1–2 weeks · L > 2 weeks.

## Feature landscape

How the product compares with what desktop WhatsApp marketing tools commonly offer, compiled
from the customer's feature requests of 2026-10-02/03. ✅ built · 🟡 Wave 3 · — not planned.

| Area          | Capability                                                            | Status |
| ------------- | --------------------------------------------------------------------- | ------ |
| Sending       | Bulk campaigns, random delays, sleep-after-N, daily caps              | ✅     |
| Sending       | Spintax, merge tags, rich types (poll, location, voice, buttons)      | ✅     |
| Sending       | Quiet hours, warmup ramp, health auto-pause, typing simulation        | ✅     |
| Audience      | CSV and Google Sheets import, tags, opt-out list, number filter       | ✅     |
| Audience      | Excel and vCard import, WhatsApp contacts grabber                     | 🟡     |
| Groups        | Bulk messaging and creation, member grabber, admin tools, communities | ✅     |
| Broadcast     | Status updates and Channels, scheduled                                | ✅     |
| Automation    | Keyword replies, drip sequences, webhooks, call auto-reject           | ✅     |
| Automation    | Visual chatbot builder, welcome and away messages                     | 🟡     |
| AI            | Several providers, caps, drafts for approval, escalation to a human   | ✅     |
| Inbox         | Unified inbox across 20 numbers                                       | ✅     |
| Inbox         | Quick replies, contact panel, scheduled messages, notifications       | 🟡     |
| Analytics     | Delivered, read and replied per campaign; 7-day dashboard             | ✅     |
| Ease of use   | Setup wizard, guided tours, in-app help                               | 🟡     |
| Collaboration | Multiple agents sharing one inbox                                     | —      |
| Platform      | WhatsApp Business API (Cloud API)                                     | —      |

## Delivered

The 2026-10-02 improvement plan, kept as a one-line record because source comments cite it.

| Phase   | What                                                                             | Tasks                 |
| ------- | -------------------------------------------------------------------------------- | --------------------- |
| 0       | Four confirmed defects (cap stall, duplicate phones, escalation, double history) | T-115                 |
| 1       | Safety defaults: 200/day, quiet hours, health pause, max devices                 | T-1005, T-1007, T-312 |
| 2       | Opt-out / STOP list                                                              | T-203, T-308          |
| 3       | Delivery, read and reply analytics                                               | T-310, T-1010         |
| 4       | Tags and segments                                                                | T-202, T-308          |
| 5       | AI cost and handoff controls                                                     | T-904–T-909           |
| Backlog | Duplicate campaign · AI settings cache                                           | T-311, D114           |

Every open question of that plan (Q1–Q13) was answered by accepting its proposed default
(D127).

## Open questions for the next waves

Product questions that shape Wave 3 and later. Each has a default that is used unless the
customer says otherwise. Release inputs (license API, certificates, branding, feed) are in
[REQUIREMENTS.md](../REQUIREMENTS.md), not here.

| #   | Question                                                             | Default in use until answered                                            |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| R1  | Closing the window: quit, or keep running in the tray?               | Keep running in the tray, with a one-time hint                           |
| R2  | Start at login on by default?                                        | Off; offered in the setup wizard                                         |
| R3  | Quick replies shared across all numbers, or per number?              | Shared, with an optional number filter                                   |
| R4  | Do away messages respect quiet hours?                                | They _are_ the quiet-hours answer; sent at most once per chat per window |
| R5  | Can the chatbot flow builder hand off to the AI bot?                 | Yes, as a final "ask AI" step                                            |
| R6  | Should an excluded tag exclude the phone number everywhere (T-1410)? | Per contact record, as today                                             |
