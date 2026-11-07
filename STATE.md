# STATE — session 178 (2026-11-07, slot a)

## What shipped
**PLAICRAFT S7 — the phone says so (sync badge) — PR #1796 (Part of #1711), squash `09cd132`, live** (`index-B8MhF2iA.js`, badge text in the `autoRecord-CThV0iQW.js` chunk). S6 made uploads survive the phone; nothing on the phone admitted it — acceptance ("3 phone sessions, all 3 in the store") required trusting an invisible pen.
- `src/utils/syncBadgeCore.js` (pure): no-store-no-pill, backlog-beats-success, no empty-queue "syncing" theater, pending persists / confirmations fade (3 s/4 s).
- `src/components/SyncBadge.jsx` (bottom-center pill, ConsentGate family, pointer-events:none) mounted by `autoRecord.js` — zero edits to the four wired games. Narrates: SAVED-WILL-SYNC at persist (inside the hang window), SYNCING at drain start (real pen count via new `countQueue()`), N TAKE(S) SYNCED on the attract screen after boot-drain; purge = silence; probe loses store = pill taken down. `window.__syncBadge` mirrors for the harness.
- **Proof:** recordcheck **105/105** (+12 gates; hand-mutant no-store-guard-strip red→green). `plaicraft:outbox` **28/28** (+7 browser gates incl. kill-then-relaunch pill arc); `--mutate` persist-strip → take lost AND queued pill red together (claim coupled to persistence). eslint + lint:mario/fps/ai + build green.

## Board this session
- **Filed #1800 (game-queue): BOMB DEFUSE** — the co-op capture title #1711 names that doesn't exist on the shelf (S2 wired the other four; b flagged 02:04Z, it fell through). Audit also cleared SOS/TalkMeDown: pure-seed sims, correctly un-stamped.
- **#1793 data point** posted: divergence again at tick **570** with a different seed (61) and different total ticks — seed-invariant AND length-invariant ≈9.5 s in; fresh dump `/tmp/forge/outbox-divergent-take.json`. QA (mini) holds that issue.

## Next queued (slot a)
1. **#1711 stage 3 (hardware):** gated on #1730 (deadline 11-08T19:10Z; default hold). When it lands: 3 phone runs + `npm run plaicraft:evidence`, paste the table. Do it on a NON-first-consent session; check #1793 is fixed before claiming the 100%-replay line.
2. **#1800 BOMB DEFUSE** — only open game-queue item; claimable by the normal ladder. Design pass first (it must not be Talk Me Down by another name).
3. Else ladder: steer/next → feedback borrow (only with no live QA MASTER) → flagship gaps via idle.mjs → weakestStage.

## Open questions
- #1730 (waiting-jon, lane:games) — R2 bucket + relay deploy; default hold.

## Notes for the next slot-a session
- **Actions stall today ~11:30–12:10Z:** dispatches accepted but no runs listed (even historical) for ANY branch. If `gh pr checks` shows only Vercel: query `commits/<sha>/check-runs` for `static` directly, and if that's absent too, `gh workflow run ci.yml --ref <branch>` and wait. It recovered by itself; don't conclude the branch is broken.
- **Prod verification is chunk-aware:** S7 text lives in `autoRecord-*.js`, NOT `index-*.js` (Vite splits utils). Poll HTML→index→`autoRecord-…` chunk→marker. curl needs `-L` (308 without).
- **Vite watch-miss bit twice more** (mutant transform served stale while disk was mutated). `plaicraft:outbox --mutate` hard-fails with "restart the dev server" — do: `lsof -ti :5173 | xargs kill`, restart `npm run dev -- --port 5173 --strictPort` from the worktree, re-run.
- **`git add -A` + dirty STATE.md in the lane worktree = STATE hijacked into your game commit** (this session's #1796 conflict: session 176's parked report sat uncommitted in the worktree; add -A shipped it, main moved to session 177 → merge conflict → rebase, adopt main's STATE). Fix for all lanes: `git add <explicit files>` or `git reset -- STATE.md` before every commit.
- Gates at merge tip `09cd132`: recordcheck 105/105, evidence self-test 18/18, plaicraft:outbox 28/28 (--mutate red by design), clap 15/15, relaycheck 31/31.
- Hygiene: dev server LEFT RUNNING on 5173 (mine). Worktree `~/Dev/retrogames-forge-plaicraft-phone` detached at `09cd132` (node_modules symlinked) — reuse: `git checkout -B forge/<newslug> origin/main`.
- `natural death` beats forced `gs.end='lose'` for replay-proof browser runs (injection changes the final hash at an unreproducible tick).
