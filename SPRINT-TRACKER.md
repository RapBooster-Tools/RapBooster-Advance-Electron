# RapBooster Advance — Status Tracker

Where the project stands. **Update this in the same commit as the work it describes** — a
tracker that lags the code is worse than no tracker.

| Question                                 | Document                                 |
| ---------------------------------------- | ---------------------------------------- |
| What is the status? (this file)          | `SPRINT-TRACKER.md`                      |
| What is left to do?                      | [docs/TASKS.md](./docs/TASKS.md)         |
| Why is it built this way?                | [docs/DECISIONS.md](./docs/DECISIONS.md) |
| What comes next?                         | [docs/ROADMAP.md](./docs/ROADMAP.md)     |
| What must each feature do? Test IDs?     | [SPRINTS.md](./SPRINTS.md)               |
| What do we still need from the customer? | [REQUIREMENTS.md](./REQUIREMENTS.md)     |
| How do we work?                          | [CLAUDE.md](./CLAUDE.md)                 |

Last updated: **2026-10-03**

---

## 1. Status dashboard

| Milestone                             | Scope                                                                          | Status      | Dates         | E2E (pass / fail / skip) | Commit              |
| ------------------------------------- | ------------------------------------------------------------------------------ | ----------- | ------------- | ------------------------ | ------------------- |
| Sprint 0                              | Documentation                                                                  | 🟢 Complete | 07-27         | n/a                      | `9968d08`           |
| Sprint 1                              | Foundation · licensing · shell                                                 | 🟢 Complete | 07-27 → 07-28 | 28 / 0 / 0               | `f095b16`           |
| Sprint 2                              | Devices · contacts · templates                                                 | 🟢 Complete | 07-28         | 49 / 0 / 0               | `a51bff7`           |
| Sprint 3                              | Campaign engine · groups                                                       | 🟢 Complete | 07-28         | +16, all pass            | `922b14a`           |
| Sprint 4                              | Inbox · AI · settings · dashboard (release proof → Release)                    | 🟢 Complete | 07-28         | 99 / 0 / 1               | —                   |
| Hardening pass                        | Four defects, audit, graph                                                     | 🟢 Complete | 10-02         | 101 / 2 env / 1          | `da61f68`           |
| Dependencies + macOS                  | Latest stable deps, Mac target, in-repo memory                                 | 🟢 Complete | 10-02         | 101 / 2 env / 1          | `c0f5759`           |
| **Wave D89 — marketing suite**        | Foundation + nine feature slices (SPRINTS §15)                                 | 🟢 Complete | 10-02 → 10-03 | 214 / 4 → 2 env / 1      | `e205734` `9981076` |
| **Wave 3 — workspace and automation** | Design system, inbox tools, flows, imports, desktop, LID numbers (SPRINTS §16) | 🟢 Complete | 10-03         | 291 / 2 env / 1, then +7 | `a1a4e73` `0e9dddb` |
| Wave 4 — help system                  | Setup wizard, help on every screen, tours, Help Center (SPRINTS §17)           | 🟢 Complete | 10-03         | 317 / 2 env / 1          | `2f91e58`           |
| Release                               | Signed builds, update feed, real license API                                   | 🔴 Blocked  | —             | —                        | —                   |

All dates 2026. **Legend:** ⬜ Not started · 🟡 In progress · 🟢 Complete · 🔴 Blocked ·
⚪ Deferred. "env" failures are E1.2 and E4.17, which need an OS keyring (K11). Per-task status
is in [docs/TASKS.md](./docs/TASKS.md).

## 2. Current status

> **2026-10-03.** Wave 3 is merged (`a1a4e73`): a light/dark design system, inbox quick
> replies, a contact panel with notes and scheduled messages, visual chatbot flows, welcome
> and away messages, Excel and vCard import, a WhatsApp contacts grabber that covers chats,
> file pickers everywhere, and desktop notifications with a tray and background running
> (SPRINTS §16, D130–D149). Follow-ups fixed two real bugs: a LID's digits were shown and
> used as a phone number (D129), and a bundle change left every device unable to connect
> (D150). The merged tree passes 291 of 294 E2E tests: two need an OS keyring (K11), one is
> the PERF-gated skip; the 7 LID tests pass.
>
> **Then (same day):** Wave 4, the help system, is merged (`2f91e58`, SPRINTS §17,
> D153–D157): help on every screen ("?" and F1), tips beside every setting, guided tours, a
> first-run welcome with a self-ticking checklist, a Help Center and a generated user guide.
> Customer decisions since: welcome/away and then every customer reply ignore quiet hours,
> which now hold campaign-style sending only (D151, D152); Remove device deletes a device and
> its data, archiving one that campaign reports reference (D158). The full suite at
> `2f91e58`: 317 of 322 pass — K11's two, one PERF skip, and two test races fixed after.
>
> **Now:** the known gaps in [TASKS §14](./docs/TASKS.md#14-known-gaps) and the release
> blockers below.
>
> **Blocked on the customer, and the only thing between this and a release:** the license
> server API, a Windows signing certificate, an Apple Developer ID with a Mac build machine,
> branding, the update feed URL, and GitHub push access
> ([TASKS §15](./docs/TASKS.md#15-blocked-on-the-customer), K6). Until then `npm run dev:mock`
> runs the whole product with no license server and no real WhatsApp account.
>
> **Not yet re-done since the D89 wave:** the packaged smoke test on Windows and macOS (T-1605;
> the self-test now checks the wa-service entry, the `.xlsx` worker and the tray icon, K24), the
> code-graph refresh (T-1421) and an `npm audit` re-triage (T-1422). Tray, notifications and
> tapped WhatsApp buttons still need a real Windows and macOS machine (K25).

## 3. Measured performance

Packaged Windows build, mock transport, measured at T4.6 (2026-07-28). Reproduce with
`node scripts/perf.mjs` and `PERF=1 npx playwright test perf-load`. The sampler filters on this
repo's own Electron executable path; filtering on the process name folds the editor into the
total.

| Metric                                        | Measured                            |
| --------------------------------------------- | ----------------------------------- |
| Startup, process start → app + database ready | cold 954 ms · warm 942 ms (923–965) |
| Idle memory, all app processes                | ~530 MB                             |
| 20 devices connected                          | 546 MB (**+13 MB** for 20 sockets)  |
| 2,000 contacts imported                       | 548 MB                              |
| Memory over 40 s of a running campaign        | 531 → 489 MB (**falls**; no leak)   |

Not re-measured since the D89 wave added warmup, sequences and the scheduler hub, or since
Wave 3. One Wave 3 figure: during a 50,000-row `.xlsx` import the worst IPC round trip is
0.73 s (E8.48, D139).

## 4. Deviations log

Anything built differently from [SPRINTS.md](./SPRINTS.md), and whether the spec was updated.

| #   | Date       | Deviation                                                                                                                                                  | Why                                                           | Spec updated?                                |
| --- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------- |
| DV1 | 2026-07-28 | Hand-written UI primitives instead of the shadcn CLI (T1.6)                                                                                                | D20, D145                                                     | Yes — §7 now points to docs/DESIGN-SYSTEM.md |
| DV2 | 2026-07-28 | Throttle in `wa-service`, campaign worker loop in main (§3.1 put both in `wa-service`)                                                                     | D42                                                           | Yes — §3.1 diagram, 2026-10-03               |
| DV3 | 2026-07-28 | Per-recipient view is a dialog, not a `/campaigns/[id]` route (T3.5)                                                                                       | D48                                                           | No                                           |
| DV4 | 2026-10-02 | IPC contract split by domain into `shared/contract/*.ts`, assembled into the one `ipcContract` in `shared/ipc.ts`                                          | D89                                                           | Yes — §15 and CLAUDE.md §2.2                 |
| DV5 | 2026-10-02 | Scope expanded beyond §1.2: opt-outs, analytics, tags (D79), then Spintax, Warmup, Group grabber, number filter and the rest of the marketing suite (D117) | D79, D117                                                     | Yes — §1.2 revised, Sprint 5 added as §15    |
| DV6 | 2026-10-02 | macOS is a target again; §1.1 had recorded it as dropped                                                                                                   | D85                                                           | Yes — §1.1                                   |
| DV7 | 2026-10-03 | Desktop preferences are `app.<field>` rows in the `Setting` table, cached in memory, rather than a table or file of their own                              | D143                                                          | Yes — §16.2                                  |
| DV8 | 2026-10-03 | Automation lists Chatbot flows first but still opens on Keyword rules                                                                                      | The default is unchanged; existing users and specs land on it | Yes — §16.1                                  |
| DV9 | 2026-10-03 | Light, dark and System themes and a collapsible sidebar; §7 specified light only and a fixed 200px sidebar                                                 | D122, D145                                                    | Yes — §7 note                                |

## 5. Known issues

Carried forward until fixed or explicitly accepted with a reason. Open items have a task in
[docs/TASKS.md](./docs/TASKS.md).

| #   | Found | Issue                                                                                                                                               | Severity            | Status and next step                                                                                            |
| --- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| K1  | S3    | A message in flight during a crash may send twice — at most one per device per crash                                                                | Accepted            | SPRINTS §6.4. WhatsApp has no dedup primitive. Sequences share the bound (D99)                                  |
| K2  | S1    | ~~Spike-only `SpikeProbe` table in the baseline migration~~                                                                                         | ✅ Resolved         | Regenerated in T1.4; E1.13 asserts it is absent                                                                 |
| K3  | S1    | Builds are unsigned (the default-icon warning is fixed)                                                                                             | Blocked on user     | T-1502, T-1503                                                                                                  |
| K4  | S3    | Intermittent E2E launch timeouts, ~1 per 2 full runs, always a launch wait                                                                          | Environmental       | Passes in isolation. Deliberately not masked with retries. Re-check on a quieter machine or CI                  |
| K5  | S4    | ~~`settings:get/set` had no handler~~                                                                                                               | ✅ Resolved         | Found by E4.17; implemented in T4.3                                                                             |
| K6  | S4    | The release pipeline has never run end to end: no signed installer, no update installed                                                             | Blocked on user     | Config complete, packaged build green. T-1602–T-1604                                                            |
| K7  | S4    | `npm audit`: 4 high under `--omit=dev`, all in the Prisma CLI (dev-only, verified absent from `app.asar`)                                           | Accepted            | sharp, js-yaml, fast-uri fixed (D82). Re-triage after the D89 wave and Wave 3 (`read-excel-file` added): T-1422 |
| K8  | S4    | ~~Link previews never worked~~                                                                                                                      | ✅ Resolved         | D68                                                                                                             |
| K9  | S4    | ~~A NUL byte hid `transport/baileys.ts` from grep~~                                                                                                 | ✅ Resolved         | D61, D62                                                                                                        |
| K10 | S4    | ~~AI replies not pushed to an open inbox thread~~                                                                                                   | ✅ Resolved         | `bot-send.ts` pushes `message:received` (T-909)                                                                 |
| K11 | S4    | E1.2 and E4.17 fail on Linux hosts with no OS keyring (secret stored with the `plain:` marker)                                                      | Environmental       | The documented degrade path working; Windows always has DPAPI                                                   |
| K12 | S4    | `ai-openai.spec.ts` reuses E4.24/E4.25, which SPRINTS §12.3 assigns to smoke and regression                                                         | Open                | T-1420                                                                                                          |
| K13 | D89   | Inbox rich messages are labelled cards (Wave 3) with no map, poll result, audio player or thumbnail                                                 | Open                | T-1401                                                                                                          |
| K14 | D89   | No push event for new calls or webhook deliveries; those tables refresh on open                                                                     | Open                | T-1402. Nothing polls                                                                                           |
| K15 | D89   | The group settings panel does not prefill the current description                                                                                   | Open                | T-1403 — no channel returns it                                                                                  |
| K16 | D89   | A product template can be sent from a device whose catalog lacks that product                                                                       | Open                | T-1404                                                                                                          |
| K17 | D89   | Group cache drift: sync does not refresh admins-only/locked/join-approval; a deleted group lingers                                                  | Open                | T-1408, T-1409. Flags refresh whenever metadata is read                                                         |
| K18 | D89   | An excluded tag excludes a contact record, not the phone number: the same number in another list is still messaged                                  | Open (customer)     | T-1410, ROADMAP R6                                                                                              |
| K19 | D89   | A restart during AI burst coalescing means that burst gets no bot reply                                                                             | Accepted            | D101 — never two replies                                                                                        |
| K20 | D89   | A warmup conversation interrupted by a crash is not retried                                                                                         | Accepted            | D109 — warmup traffic, already counted                                                                          |
| K21 | D89   | A sequence send that times out marks the enrollment `failed` instead of retrying                                                                    | Accepted            | D99 — at-most-once over a possible duplicate                                                                    |
| K22 | W3    | Away messages obey quiet hours: with the defaults none goes out 21:00–09:00, most of the closed time                                                | Resolved            | D151: sent during quiet hours, cap still applies (E8.37b)                                                       |
| K23 | W3    | A welcome parked by quiet hours or the cap is dropped and never retried                                                                             | Open                | T-1432. D133 — a late welcome reads as a glitch                                                                 |
| K24 | W3    | The self-test now asserts the `.xlsx` worker, `read-excel-file`, the tray icon and the wa-service entry, but has not run on a packaged Wave 3 build | Open                | T-1605 — after the help-system merge. D150                                                                      |
| K25 | W3    | Tray clicks, OS notifications, start at login and tapped buttons/list rows are verified only on the mock and headless Linux                         | Open (needs device) | T-1442, REQUIREMENTS §10                                                                                        |
| K26 | W3    | Windows shows no unread count; the taskbar button only flashes                                                                                      | Open                | T-1441                                                                                                          |
| K27 | W3    | Incoming photos and videos show as "Photo or video"; a scheduled audio file is sent as a document                                                   | Open                | T-1435                                                                                                          |
| K28 | W3    | A contact whose number WhatsApp never reveals stays "Number hidden by WhatsApp"                                                                     | Accepted            | D129 — repaired automatically when the number appears; never guessed                                            |

## 6. Test results history

One row per milestone, with the real numbers including failures. Every run re-runs every earlier
suite. "n/r" means the check was not recorded for that run.

| Date       | Milestone                | New | Regression | Total                             | Typecheck | Lint | Packaged smoke | Notes                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------- | ------------------------ | --- | ---------- | --------------------------------- | --------- | ---- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-07-27 | 1 (partial)              | 5   | n/a        | 5 pass / 0 fail                   | ✅        | ✅   | ✅             | T1.1, T1.2 complete; T1.11 harness up                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-07-27 | 1 (partial)              | 3   | 5          | 8 pass / 0 fail                   | ✅        | ✅   | ✅             | T1.4 complete. Adds E1.13, E1.13b, E1.13c (real two-launch restart)                                                                                                                                                                                                                                                                                                                                                |
| 2026-07-28 | 1 (partial)              | 5   | 8          | 13 pass / 0 fail                  | ✅        | ✅   | ✅             | T1.3 + T1.5 complete. Adds E1.3 (CSP), E1.14b–e (IPC contract, allowlist, path containment). Stable across 2 consecutive runs                                                                                                                                                                                                                                                                                      |
| 2026-07-28 | 1 (partial)              | 2   | 13         | 15 pass / 0 fail                  | ✅        | ✅   | ✅             | T1.6 + T1.7 complete. Adds E1.10c (all nine routes navigate, zero console errors) and E1.10d (active nav state). Stable across 2 consecutive runs                                                                                                                                                                                                                                                                  |
| 2026-07-28 | 1 (partial)              | 10  | 15         | 25 pass / 0 fail                  | ✅        | ✅   | ✅             | T1.8 complete. Adds the full licensing suite: E1.1–E1.7, E1.9, E1.11, E1.14f. Stable across 2 consecutive runs                                                                                                                                                                                                                                                                                                     |
| 2026-07-28 | **1 (complete)**         | 3   | 25         | **28 pass / 0 fail**              | ✅        | ✅   | ✅             | T1.9 + T1.10 + T1.11. Adds E1.9b, E1.9c, E1.15 (redaction). Two flaky specs fixed at the root — see D28. **Stable across 3 consecutive runs**                                                                                                                                                                                                                                                                      |
| 2026-07-28 | 2 (partial)              | 7   | 28         | 35 pass / 0 fail                  | ✅        | ✅   | ✅             | T2.1 + T2.2 + T2.7. wa-service verified inside the packaged asar                                                                                                                                                                                                                                                                                                                                                   |
| 2026-07-28 | 2 (partial)              | 2   | 35         | 37 pass / 0 fail                  | ✅        | ✅   | ✅             | T2.3 Devices screen. Stable across 2 consecutive runs                                                                                                                                                                                                                                                                                                                                                              |
| 2026-07-28 | 2 (partial)              | 6   | 37         | 43 pass / 0 fail                  | ✅        | ✅   | ✅             | T2.4 contacts backend. E2.12 imports 50,000 rows; E2.16 asserts the <500ms search budget. Stable across 2 runs                                                                                                                                                                                                                                                                                                     |
| 2026-07-28 | 2 (partial)              | 1   | 43         | 44 pass / 0 fail                  | ✅        | ✅   | ✅             | T2.4 contacts UI. E2.17 asserts virtualization holds <100 rows in the DOM at 10,000 contacts. Stable across 2 runs                                                                                                                                                                                                                                                                                                 |
| 2026-07-28 | **2 (complete)**         | 5   | 44         | **49 pass / 0 fail**              | ✅        | ✅   | ✅             | T2.5 + T2.6. Preload gap fixed (D39). **Stable across 2 consecutive runs**                                                                                                                                                                                                                                                                                                                                         |
| 2026-07-28 | **4 (customer answers)** | 6   | 93         | **99 pass / 0 fail / 1 skipped**  | ✅        | ✅   | ✅             | T4.7. Adds E2.14b, E2.14c (country code), E2.23–E2.26 (real buttons, lists, group payloads, the button editor). The skip is the PERF-gated 20-device profile                                                                                                                                                                                                                                                       |
| 2026-10-02 | **4 (hardening pass)**   | 4   | 99         | **101 pass / 2 fail / 1 skipped** | ✅        | ✅   | ✅ self-test   | Adds E3.29, E3.30, E4.28, E4.29, each shown failing on the pre-fix build. E3.16 now asserts one queue row (D77). The 2 failures are E1.2 and E4.17 — no OS keyring in the Linux cloud container (K11); they fail identically on the untouched baseline (97 pass / 2 fail). Packaged self-test run directly with `--no-sandbox`, because the container runs as root; `npm run test:smoke` itself cannot run as root |
| 2026-10-02 | Dependencies + macOS     | 0   | 104        | **101 pass / 2 fail / 1 skipped** | ✅        | ✅   | ✅ self-test   | Electron 44.5.1, Baileys rc14 (D86). The 2 failures are K11, identical to baseline                                                                                                                                                                                                                                                                                                                                 |
| 2026-10-02 | D89 foundation           | 0   | 104        | 99 pass before 2 fixes            | ✅        | ✅   | n/r            | `6e59421`. After the fixes the affected suites (settings, campaigns, daily cap) ran 20/20; the full suite was not re-run until the merge                                                                                                                                                                                                                                                                           |
| 2026-10-03 | **D89 wave, merged**     | 115 | 104        | **214 pass / 4 fail / 1 skipped** | n/r       | n/r  | n/r            | 219 tests. Failures: E1.2, E4.17 (K11) and E5.69, E6.10 — both fixed in `9981076`, 30/30 on re-run. Each agent's own suite was green in its worktree                                                                                                                                                                                                                                                               |
| 2026-10-03 | **Wave 3, merged**       | 75  | 219        | **291 pass / 2 fail / 1 skipped** | ✅        | ✅   | n/r            | `a1a4e73`, 294 tests, 19.7 min. New: E7.1–E7.10, E8.1–E8.73 (E8.49 unused), E6.1b. The 2 failures are E1.2 (with E1.7) and E4.17 — K11, no OS keyring. Lint: 0 errors, the known `useVirtualizer` warning. Self-test runs after the help-system merge (T-1605)                                                                                                                                                     |
| 2026-10-03 | LID numbers + fixes      | 7   | 62         | 7 pass + 62/62                    | n/r       | n/r  | n/r            | `0e9dddb`, 301 tests. E8.80–E8.86, with automation, group-tools, sprint-4-inbox and audience re-run. Full suite not re-run                                                                                                                                                                                                                                                                                         |
| 2026-10-03 | Quiet hours D152         | 1   | 121        | 120 pass / 1 fail                 | ✅        | ✅   | n/r            | `22fb3f9`. Ten affected suites. The failure was E5.41 under load; the whole rich-messages spec then ran 11/11. E6.10, E6.48 rewritten, E8.37b added                                                                                                                                                                                                                                                                |
| 2026-10-03 | **Wave 4, merged**       | 21  | 301        | **317 pass / 4 fail / 1 skipped** | ✅        | ✅   | ✅ self-test   | `2f91e58`, 322 tests, 19.4 min. New: E9.1–E9.20 (+ tooltip check in E9.7). Failures: E1.2, E4.17 (K11); E8.29 and E1.21 were test races, fixed in the next commit and re-run 2× (flows 42/42, license-http 2× green). Packaged self-test passed at `0e9dddb` (wa-service entry, xlsx worker, tray icon)                                                                                                            |
| 2026-10-03 | Remove device D158       | 3   | 40         | 43 pass                           | ✅        | ✅   | n/r            | `b458bd4`, 325 tests. E6.71–E6.73 with sprint-2-devices, devices-suite and help                                                                                                                                                                                                                                                                                                                                    |

## 7. Decision log

Moved to [docs/DECISIONS.md](./docs/DECISIONS.md) on 2026-10-03 — D1 onward, same IDs.

## 8. Release history

| Version | Date | Platform | Signed | Notes               |
| ------- | ---- | -------- | ------ | ------------------- |
| —       | —    | —        | —      | _(no releases yet)_ |

## 9. How to update this file

In the same commit as the work:

1. §1: set the milestone's status, dates, real E2E numbers and commit.
2. §2: rewrite the narrative so it is true today — short; detail belongs elsewhere.
3. Tick the task in [docs/TASKS.md](./docs/TASKS.md); add new work there.
4. Record any decision in [docs/DECISIONS.md](./docs/DECISIONS.md) with its reasoning.
5. §4: anything built differently from SPRINTS.md, and whether the spec was updated.
6. §5: anything unfinished or newly discovered — fixed or explicitly accepted, never dropped.
7. §6: a row with the real test numbers, **including failures**.
8. Update "Last updated" at the top.
