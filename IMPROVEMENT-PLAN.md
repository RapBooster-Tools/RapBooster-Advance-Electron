# RapBooster Advance — Improvement Plan

Post-Sprint-4 roadmap. Drafted 2026-10-02 from a code survey and the customer's answers in
the same session. Status lives in [SPRINT-TRACKER.md](./SPRINT-TRACKER.md); this file is the
plan and the questions it still depends on.

**Effort:** S ≤ 3 days · M ≈ 1–2 weeks · L > 2 weeks.

## Customer direction (2026-10-02)

| Question                            | Answer                                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------- |
| Fix the four confirmed bugs now?    | **Yes, all four** — done, see Phase 0                                                        |
| Which capabilities matter most?     | **All four:** opt-out/STOP list · delivery + reply analytics · tags & segments · AI controls |
| Anti-ban defaults for a new install | **Conservative:** a default daily cap and a quiet-hours window, both editable                |
| CI and a unit-test layer            | **Not now** — the plan stays on product work; the E2E suite remains the gate                 |

Each of the four capabilities touches features scoped out in SPRINTS.md §1.2 (unsubscribe
handling, delivery analytics, tags/segments). Choosing them is a scope change; it is
recorded in the tracker's decision log.

---

## Phase 0 — Confirmed defects (done)

All four were confirmed against the code before fixing, and each has an E2E spec.

| #   | Defect                                                                                                                                     | Fix                                                                                                                                                   | Test  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| B1  | A campaign that hit the daily cap stayed `running` and never resumed until the app restarted; each cap hit also consumed a retry attempt   | Cap hits return the row to `pending` without charging an attempt; the scheduler tick restarts parked campaigns once a device has headroom             | E3.29 |
| B2  | One phone number in two selected lists was messaged twice in the same campaign — the unique key is per contact, and those are two contacts | Queue expansion de-duplicates on the normalized phone across all batches                                                                              | E3.30 |
| B3  | After escalation the bot kept replying to the next message, and the configured escalation message was never sent                           | Escalated chats are skipped until the user clicks **Resume bot** in the inbox (`chat:resumeBot`); the escalation message is sent through the throttle | E4.29 |
| B4  | The incoming message reached OpenAI twice — once from history, once as the new turn                                                        | History excludes the message being answered                                                                                                           | E4.28 |

---

## Phase 1 — Safety defaults · M

Decided: conservative defaults. **Needs the numbers confirmed (Q1–Q3).**

- **Default daily cap** of 200 sends per device per day for new installs (currently
  unlimited, `DEFAULT_THROTTLE.dailyCap: 0`). Settings warns when it is set to unlimited.
- **Quiet hours**, default 21:00–09:00 local. A time-window gate in
  `electron/wa-service/throttle.ts`; campaigns park outside the window and resume through
  the same mechanism B1 added for the daily cap.
- **Device health auto-pause.** A per-device breaker that pauses sending when the recent
  failure rate spikes or "blocked"/"not-authorized" errors cluster, with a health badge on
  the Devices screen. Today `consecutiveFailures` only drives reconnects.
- **`sending.maxConcurrentDevices` is saved but never read.** The Settings screen offers it;
  `campaign-engine.ts` ignores it. Enforce it, or remove the control.

## Phase 2 — Opt-out / STOP list · M

- A global `Suppression` table keyed by normalized phone, with the reason and the source
  (STOP reply, manual, import).
- Campaign expansion skips suppressed numbers and records them as `skipped`, so the report
  shows why they were not messaged.
- Inbound STOP keywords add the sender automatically and optionally send one confirmation.
- Contacts screen: view, add, remove, import and export the list.

## Phase 3 — Delivery and reply analytics · M

- `CampaignRecipient.deliveredAt` / `readAt` from WhatsApp receipts. The receipt handler in
  `electron/main/index.ts` currently updates only inbox `Message` rows.
- Reply attribution: an inbound message from a recipient within the attribution window
  counts as a reply to that campaign.
- Campaign detail and CSV report gain delivered, read and replied columns; the dashboard
  gains a 7-day sent/failed/replied trend and per-device usage against the cap.

## Phase 4 — Tags and segments · L

- `Tag` and `ContactTag` tables (contacts today carry only a JSON `data` blob), bulk tag and
  untag from the contacts table, and a tag column on CSV import.
- The campaign dialog targets lists **and/or** tags, with exclusions — for example, "all of
  list A, minus tag `customer`".
- Expansion stays batched at 1,000 rows and keeps B2's phone de-duplication.

## Phase 5 — AI cost and handoff controls · M

- Record `usage` tokens per reply; Settings shows today's and this month's usage, with an
  estimated cost.
- Caps: AI replies per device per day and per chat per day. Coalesce bursts — three quick
  messages get one reply, not three model calls.
- Handoff: an **Escalated** filter in the inbox and an optional approve-before-send mode,
  where drafts wait for a click.
- AI replies and escalation messages appear in an open inbox thread only after a refresh;
  push them live like inbound messages.
- The "after N messages" and "after elapsed time" escalation triggers can be enforced today;
  only the confidence trigger is impossible (D54).

---

## Backlog — engineering, not yet scheduled

| Item                                                                                               | Effort |
| -------------------------------------------------------------------------------------------------- | ------ |
| Scheduled daily backups, optionally to a user-chosen folder (today: pre-migration and manual only) | S      |
| Fuller diagnostics bundle: wa-service state, per-device errors, migration version, zipped          | S      |
| First-run checklist: link device → import contacts → create template → launch                      | S      |
| Duplicate campaign; edit or reschedule a draft or scheduled campaign                               | S–M    |
| Cache AI settings in memory — six-plus `setting` reads per inbound message                         | S      |
| Accessibility pass: roles, labels, keyboard navigation (D20's Radix primitives never landed)       | M      |
| Knowledge-base retrieval instead of sending the whole knowledge base with every prompt             | M–L    |
| CI on Windows and a Vitest layer for pure functions — **deferred by customer, 2026-10-02**         | M      |

## Still blocked on the customer

Unchanged, and still the only things between the code and a shippable release: license
server API (REQUIREMENTS §1), Windows code-signing certificate (§4), branding (§2), update
feed (§3). Without the first, only the mock license server works; without the second,
SmartScreen warns on install.

---

## Open questions

Answer inline and the phase moves to ready.

| #   | Phase | Question                                                                                               | Proposed default                              |
| --- | ----- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| Q1  | 1     | Daily cap for new installs?                                                                            | 200 per device per day                        |
| Q2  | 1     | Quiet-hours window, and does it also hold back AI auto-replies? (Manual inbox replies are never held.) | 21:00–09:00; AI replies held too              |
| Q3  | 1     | Apply the new defaults to existing installs that never changed the setting, or to fresh installs only? | Existing installs too, with a one-time notice |
| Q4  | 2     | Which words opt someone out? Hindi or regional equivalents?                                            | STOP, UNSUBSCRIBE, बंद                        |
| Q5  | 2     | Send a confirmation after an opt-out, and with what text?                                              | Yes: "You've been unsubscribed."              |
| Q6  | 2     | Is suppression global, or per device or business?                                                      | Global                                        |
| Q7  | 3     | Reply attribution window?                                                                              | 72 hours                                      |
| Q8  | 3     | Many recipients disable read receipts, so "read" undercounts. Show it anyway?                          | Show it, labelled "at least"                  |
| Q9  | 4     | Static tags only, or also saved dynamic segments (filters on custom fields)?                           | Static tags first                             |
| Q10 | 5     | AI reply caps per device per day and per chat per day?                                                 | 500 / 20                                      |
| Q11 | 5     | Approve-before-send: off by default, or on for new users?                                              | Off                                           |
| Q12 | 5     | Should cost estimates use a built-in OpenAI price table, which goes stale, or show tokens only?        | Tokens plus an editable price per 1M tokens   |
| Q13 | —     | Order of Phases 2–5? The proposal is cheapest-first and lowest-risk-first.                             | 1 → 2 → 5 → 3 → 4                             |
