# Project memory

Claude's durable notes for this repository. Auto memory is disabled in
`.claude/settings.json` so that nothing is written outside the project folder; anything
worth remembering between sessions goes here instead, and is committed with the work.
Keep it short — it loads into every session. Decisions with reasoning belong in
`docs/DECISIONS.md`, not here.

## Owner preferences

- Work on `main`; commit and push there. Never a feature branch unless asked.
- Keep Claude memory in the project folder only (this file). Never write to
  `~/.claude/` memory.
- Test alongside each feature; run the full suite before every commit to `main`.
- Keep every npm package on its latest compatible version; record any held-back
  package and why in `docs/DECISIONS.md` (D86).
- Default to subagents for independent work (CLAUDE.md §3).
- Keep the docs current and non-duplicated: each fact in exactly one place (below).

## Docs map — which fact lives where

| Fact                                                      | File                |
| --------------------------------------------------------- | ------------------- |
| Status, dates, test numbers, known issues (K), deviations | `SPRINT-TRACKER.md` |
| Every task, done or open (T-xxx)                          | `docs/TASKS.md`     |
| Every decision and why (Dnn)                              | `docs/DECISIONS.md` |
| Future waves, candidates, product questions (Rn)          | `docs/ROADMAP.md`   |
| Feature spec, schema, IPC, E2E test IDs (En.n)            | `SPRINTS.md`        |
| Inputs only the customer can give                         | `REQUIREMENTS.md`   |
| How to work                                               | `CLAUDE.md`         |

## Environment notes

- Cloud container: run E2E as `xvfb-run -a npx playwright test` after `npm run build`.
  E1.2 and E4.17 fail there only because no OS keyring exists (tracker K11).
- The container runs as root: the packaged binary needs `--no-sandbox`, so run the
  self-test directly: `xvfb-run -a dist/linux-unpacked/rapbooster-advance --self-test --no-sandbox`.
- If `node_modules/electron/dist` is missing after install, run `node install.js` in
  `node_modules/electron`.
- Never run `npx @electron/asar extract-file` from the repo root — it writes
  `package.json` into the working directory and overwrites ours.

## Worktree agents (D98)

- A new worktree may start on an old commit: compare with `main` and `git reset --hard main`.
- Use `cp -al <repo>/node_modules node_modules` — a symlinked `node_modules` makes Turbopack
  fail while `npm run build` **still exits 0**, so E2E silently runs a stale `out/`. Check the
  build output contains the new code before trusting a test run.
- Prisma `findMany` with a large `in: [...]` plus `take` hits "query parameter limit
  exceeded"; leave `take` off `IN`-bounded queries (D111).
