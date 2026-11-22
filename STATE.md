# STATE — forge board snapshot (slot b, 2026-11-22 late — shipped)

## This session shipped
- **FloorBoss same-frame tap law** (#2966 → PR #2970 → main `d5eac2f`, prod-
  verified in the live chunk). Never-dry stage: idle-kick `KICK FLOOR BOSS 0
  weak` (score 3 = 2 unowned README gaps + feedback #2964; R-TYPE equal-scored
  but QA-held #2952; flagships all owned). The bank promises one pointer per
  row; the shell mutated at click time — two taps in one frame both landed
  before step t+1 while rows said tap1@t+1,tap2@t+2, so legitimate fast-tap
  takes refused on the hash. Fix: solo tap still applies at click (between-
  steps apply == replay-before-step at every hashed checkpoint); a tap that
  finds the bank busy only queues, and the drain applies it at the tick it
  banks on. Latency ≤ one tick; fx unchanged.
  Harvest: `clickOrder` referenced its own initializer (`o` inside its own
  predicate) — EVERY contract-card tap was a silent ReferenceError (dead tap).
  Fixed + open/shipped/expired regression pins.
  Proof: floorbosscheck green — seed 7 OLD shape refuses exactly at checkpoint
  300 via floorBossRows, NEW shape replays clean (301 ticks), source pins;
  mutant `--mutate-taps` dies by name; datasetcheck 66/66; lint×3 + build;
  floorbossplay: card tap lights prio zero page errors, back-to-back taps
  land, existing single-tap legs unchanged.
- **Slot a in parallel:** Contra trainable adapter #2969 (main `9838eab`) +
  its STATE `eec4d14`. Both lanes green.

## PLAYABLE on main right now
- `/retrogames/floor-boss` — fast taps record honestly; contract cards answer
  (this session; Vercel Production on `d5eac2f`).
- `/retrogames/contra` — consent-gated capture, seat-2 law (slot a).
- `/retrogames/r-type` — volley pre-dodge (#2955).

## Board at close
- `game-queue` empty, `steer`/`next` empty. `building`: #1712 PLAICRAFT S2
  (store-data-blocked friend takes; ask #2953). `feedback`: #2964 (FloorBoss
  polish — QA's), #2952 R-TYPE (`building-qa`, QA holds).
- FloorBoss README honest gaps now: the conservative WATCH stamp (deliberate
  #2058 law) — tap-per-frame is CLOSED. Consider a DISCLAIMER marker next
  time the README is touched, so weakestStage doesn't re-kick a decided law.

## Open questions for Jon (links only, #605)
- #2953 — S2 friend-takes invite flow; default: widen adapters (Contra done).
- #2846 — promote CONTRA/R-TYPE/DOUBLE DRAGON public? (due 11-23).
- #2908, #2930 (QA lane) — DD seat laws.

## Harness notes (carry-overs)
- **A/B against HEAD~1 via `git checkout <c> -- file` erases UNCOMMITTED
  work.** Lost a fresh floorbossplay leg this way mid-session (re-added).
  Commit before any checkout-swap experiment; this repo's discipline (commit
  per increment) is what saves you.
- floorbossplay's late rig/quota legs are **machine-load flaky**: under a
  loaded box (parallel lanes, repeated headless runs) the untouched
  origin/main baseline failed the same families at 59–61/96 while this branch
  held 71/99 with its new legs green. Advisory per rule 3 — compare against
  a same-load baseline before blaming a branch.
- Scripted rigs tap faster than a frame; after #2966 such bursts serialize
  one-per-tick by design. Rig legs that need instant multi-place are leaning
  on the old broken superpower — if one ever fails deterministically at low
  load, pace its taps (≥ one tick apart), don't relax the bank law.
- Merge-loop gotcha: local worktree `/Users/jon/Dev/retrogames-fix-smallmodel`
  holds `main` locally, so post-merge `git checkout` of main prints
  "already used by worktree" — harmless; the squash merge lands anyway
  (verify via origin/main log + re-detach).

## Slots / ops
- Slot b port 5178: dev server stopped via `scripts/devstop.sh` ✓.
- Worktrees left: `retrogames-forge-floorboss-tap-drain` (branch merged; dir
  prunable) + older prunable dirs from 11-22 earlier sessions.
- Nightly watch: next scheduled nightly is the first full-suite run over
  `d5eac2f` (career takes + volley + Contra adapter + this fix together).
- Main checkout: detached `origin/main`, STATE.md committed this session
  (#2970 merged) + `statepark.mjs park b`.
