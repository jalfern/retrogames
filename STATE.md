# STATE — session 189 (2026-11-09, slot a)

## What shipped
**WATCH batch 13 — COMET DRIFT GP + COMET DRIFT HD seat the certified
autopilot** — squash `e95c213` (PR #1859, Part of #1637). Y feeds
`decide()` (CometDrift/sim.js — the brain cometcheck races to victory with,
"autopilot wins the 5-lap GP from P7", #1687-certified drift ladder, and both
attract demos' own route) through the attract-demo flag `st.plan`; any driving
key takes over (shared blips), the finish flag releases silently, CUP legs
reset it like a run. Attract ▶ WATCH + #1654 hint on both titles. No netplay
family — #1656 gate no-op. Coverage **50 -> 52**.
Evidence: watchcheck pilots 169/169 x2 (seat/advance/takeover/re-seat/resume),
phone slice 175/175 x2, watchphonecheck 367/367 (tripwire 49->51), 9 new
source pins incl. no-forked-brain, cometcheck GREEN, contract 15/15 x2,
lint:mario/fps/ai + build green. Mutant: seat toggle off -> 7 gates RED,
restored. Prod: entry `index-DrW5UJCr.js` carries the batch-13 registry copy.
Live: https://jalfern.com/retrogames/comet-drift · /comet-drift-hd

## Session bookkeeping
- **#1637** stays open + `building` (multi-stage; 13 batches in, ~28 unseated).
- Along the way fixed a **pre-existing snapshot/restore defect** both comet
  titles carried: `g.marks`/`markAge` Maps vanished through the JSON
  round-trip (#391 family) — now entry-pair serialized; contractcheck was
  14/15 GP before, 15/15 both after.
- **`cometdrifthdcheck` is RED ON MAIN** (`0439ffd`, before this branch):
  crashes `spanPx.toFixed` at the run-off-band gate (line ~587, sandbank
  `band.has` true but spanPx null). MANUAL_CHECKS/advisory — did not block
  #1859 (required check `static` was green). Flagged on #1637 for its owner;
  do not blindly re-run hoping for green.
- #1711 remains `next` and still hardware-held (session 188's audit stands).

## Next queued (slot a)
1. **WATCH batch 14** on #1637 (claim resume: `scripts/forge-claim.sh 1637 a`):
   strongest triage from this session — **SONAR** (`planRun`/`planStep` in
   Sonar/sim.js; sonarcheck proves 20/20 clean crossings + vent-win +
   deterministic replay; planCache already exists in index.jsx) and **BOULDER
   DASH** (`planRun`/`planStep` in sim.js; attract header: demo is "literally a
   REPLAY of the planner's own proven" route; dashcheck exists — verify its win
   gate before seating). TALK ME DOWN (`solvePad` engine.js) needs its win-proof
   checked in tmd-smoke first.
2. Warden may assign another issue — the claim ladder in FORGE.md step 2 wins
   over this list at claim time.

## Notes for the next slot-a session
- Worktree `~/Dev/retrogames-forge-watch-b13` = merged; reuse pattern:
  `git checkout -B forge/watch-rollout-b14 origin/main` (node_modules symlinked).
  Dev server 5173 stopped at session end.
- **Racer-family seat shape (batch 13, commit 2):** seat = toggle `st.plan`
  (the attract-demo drive flag). A first cut added a `watchingRef` OR into the
  decide feed — the LIVE pilot stayed green when the OR was cut: dead code,
  removed. Lesson: let the mutant attack the NEW seam, and distrust green under
  mutation as loudly as red.
- **watchcheck advance metric for loop racers:** expose `len: T.len` in the DEV
  probe and compare `(b.score - a.score + a.len) % a.len > 500` — `score` is
  loop-progress (grid sits just before the line), naive deltas read a lap-line
  crossing as backwards.
- Stale-lane hazard: slot a's port 5173 was held by the batch-12 session's
  zombie dev server (strictPort start died silently, curls answered from the
  OLD worktree). Check `lsof -nP -iTCP:5173` + cwd of the holder before
  blaming your own code for "missing" DEV hooks.
- watchcheck/pilots need dev server + `DEV_PORT=5173`; cometcheck ~60s Node;
  source pins run even under `--only`, so per-title runs still gate the pins.

## Open questions
- None. (#1637 roll continues mechanically; nothing taste/priority to ask.)
