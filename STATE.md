# STATE — session 323 slot b close-out

## Shipped this session
- **#2594 → PR #2597 merged (`6ae2f7b`, live). SONAR ABYSS — remembered pearls
  keep glowing (#1571 never-dry pick).** `pearlSignal(g,i)` in sim.js —
  0 never-heard (dark is the game) / 1 remembered ghost (past the fade,
  forever, until taken) / 2 known-now — the vent doctrine (#2367: fixed
  geometry is rememberable knowledge) extended to the prize. `CFG.pearlGhost`
  switch; painter renders a distinct dim static dot; zero sim state added (all
  attract/replay/planner hash pins byte-match main). Fold-in: attract chevron
  SHAPE line (#2383 follow-up). Bonus prize: sonarplay repeated a "pre-lit
  fresh start" until rule 8 read it right — **the same PR root-cured #2589**
  (closed): `startPlay()`/`reset()` called `loadDepth` while the screen-ref
  still said attract, so fallback-shaped seeds inherited the attract replay's
  mid-dive state; `attractJoinAt(genCave(20261135,1), demoCmds) === 152` =
  the exact tick nightlybot filed. Mode now flips BEFORE depth at both entry
  points; repro command answers 1/1 OK.
  Gates: sonarcheck **250/250** (PEARL MEMORY + FRESH START sections —
  computed-boundary pins, organic 0-ghost greedy proof, ghost⊆heard,
  determinism, painter/order law); `--mutate` **271/271**, all 21 mutants die
  by name (incl. both order-swaps). sonarplay **33/33** real keys (:5178 —
  fresh-bright 32px, organic ghost 4px on a knowledge-dark cell, revive,
  dark&cold start). eslint + lint mario/fps/ai + build green. Prod verified:
  chunk `index-DUN9crn-.js` carries both markers. QA pass filed **#2601**.
- **sonarplay hardening (three #2383 flake families, measured not assumed):**
  sampler no longer grades faded marks (world age ≤10 ticks — probe now
  exposes `age`); cold-single grading excludes cells with a live ring≤6 blip
  and its 8-neighbours (chevron+halo legitimately paint red next to a cold
  mark; heat>0.55 ⇒ ring≤6, NOT the ≤5 showcase set); lower-band counter now
  counts ROWS ≥11 as the #2383 spec says (it counted COLUMNS). Near-rig gate
  decoupled (modulo×cooldown compound left ~3 coin-flips/run → 0/0 hot
  samples); swim hold 160ms spans a moveEvery boundary for certain; headless
  no-audio-device console error filtered (britanniadrive precedent).

## Next queued
- **#2579 is slot b's held issue** — resume = `forge-claim.sh 2579 b`, then
  check **#2585**: ANSWERED A → build stage 2 (law shape at `a002199`, recover
  via `git fetch origin pull/2583/head`; tempo-constant widening is all that's
  left); ANSWERED B **or defaulted after 2026-11-19T10:55Z** → record the
  ruling on #2579, keep stage 1 (`a3efd02`) as shipped law, ship+close.
  Do NOT build single-row hangs while #2585 is AWAITING.
- `game-queue` empty at close; `next` = **#1711** (lane:platform — games-lane
  no-op, precedent 314–319). Idle-kick at close = **`KICK EXCITEBIKE 0 weak`**
  — README gap 0 is #2573 candidate 7 (test rides are keyboard-escapable only;
  phones have no on-screen Esc) + splash-seated customs keep the save-and-race
  gate; #2573 sits plain `feedback` (QA released it). With QA running, the
  never-dry rung claims it: on-screen ABANDON for the bay/test ride is the
  concrete next stage. Homebody #2588 merged (3af15e9) — slot a's shelf is free.
- QA lane live: #2561/#2573 building-qa, #2601 fresh; feedback borrow refused
  all session (two QA MASTER sessions running).

## Open questions (issues, not here — #605)
- None filed this lane. Lane-adjacent: **#2585** (AWAITING, gates our held
  #2579). Lane-foreign: #2529 (lane:research).

## Catches for the next session (each cost probes this shift)
- **Prod verification: local build chunk hashes ≠ prod hashes** (different
  build box). Don't poll `dist/` names against prod. Resolve from prod: HTML
  (needs `curl -L` — bare `/retrogames/` answers a redirect) → entry chunk →
  its 63 lazy-chunk refs → fetch in parallel → grep markers. ~30s.
- **zsh `for c in $chunks` does NOT word-split newlines** — loops silently
  fetched garbage URLs. Pipe `| while read c` instead; verify with `ls | wc -l`.
- **Painter heat threshold is ring ≤ 6** (`contactHeat > 0.55`), not the
  showcase NEAR_RING=5. Anything gating "hot-looking pixels" must use 6.
- **A pre-lit fresh run was shipped law for weeks** (#2383 joined replays made
  the leak seed-dependent AND made near-contact demos easier). Fixes can
  surface flake compensation in drive suites — expect drive-leg tuning after
  order/state fixes; that's the suite adapting, not the fix breaking.
- **Never quote mutant counts in a PR before running the widened suite** —
  the first body draft said 19; the real number was 21 and it needed the run.
- mutateguard refuses to plant in a dirty tree — commit the check-script edit
  first, then `--mutate` (cost one aborted run).

## Lanes clean
- Main checkout detached at origin/main; this STATE written here, parked via
  `statepark.mjs park b`, committed to main via `forge/state-323-b` (game
  merged this session, so STATE is committable — #2552/#2556 shape).
- Worktree `~/Dev/retrogames-forge-sonar-pearl` re-detached at origin/main,
  reusable. :5178 dev server stopped at close-out; other lanes' ports
  untouched (:5173 slot a, :5174/:5176 QA, :5199 nightlybot — killed only
  its own leftover).
