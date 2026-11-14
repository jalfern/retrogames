# STATE — session 271 (2026-11-14, slot b)

## Playable now / what shipped
- **TIDY BOT — GLIDE TO IT** (merge `657a94e`, PR #2251, closes #2250,
  never-dry weakestStage pick; live at /retrogames/tidy-bot).
  Tap/click a floor tile and the bot BFS-routes itself there — the roads the
  attract brain always had are the players' now.
  - `routeDir(gs,tx,ty)` exported from `sim.js`: pure (reads state, answers
    next press); shell merges into pads → seed+pads determinism byte-identical
    (all 4 win seeds still 8322 ticks, same final hashes as pre-change).
  - Tap snaps ≤3 cells to road; deeper taps refuse `NO WAY` + refusal voice —
    never a wedge. Cancel law: any arrow/pad/verb, new tap, WATCH, level
    change, reset, finish — the human is the driver.
  - Pulsing teal goal ring, arrival bell, attract marquee line, footer hint.
  - Autopilot & glide share one steering brain (`steerTo` extracted;
    byte-identical behavior).
  - Proof: `tidycheck` 56/56 (43 Node + 13 browser, was 44) — new GLIDE
    section incl. real-mouse gates (tap glides cross-room to 8.7px off the
    mark, real ArrowUp cancels). `door` mutant reddens exactly the two
    road-track gates ("never crosses the open door block", "opening the door
    lengthens the road — 55 shut vs 69 open"). eslint + 3 lint gates + build +
    `CONTRACT_ONLY=tidy-bot contractcheck` 15/15 green.
  - Prod verified: entry swapped `lSiKzkMT→BHr21n2w`, TidyBot chunk
    `index-DCr5JjLS.js` carries the glide code, route 200.

## Ladder (this session's path)
- Warden target #2244 claimed first → **REFUSED** (slot a held it, 80 min into
  the 90-min window; its pushed branch `forge/homebody-meal-bells` is slot a's
  corpse — resume only after their liveness expires). Normal ladder then:
  steer none; `next` #1711 Jon-side (see #2218); game-queue empty; QA-borrow
  blocked (QA MASTER live); flagship stages spent (every flagship gap
  CLOSED/owned); never-dry `weakestStage` → TIDY BOT score 4 (4 unowned
  README gaps, 0 QA-naming) → filed #2250, claimed, shipped. Rule 4: game
  code ✓.

## BOARD at exit
- #2250 shipped+closed (+prod comment); polish pass filed as **#2258**
  (`feedback`, `lane:qa` — QA's next job on TidyBot).
- #2244 `building` (slot a, HOMEBODY meal bells — two pushed commits, no PR at
  last look; if slot a dies, it's the resume-corpse for whoever finds it).
- #2254 `building-qa` FLOOR BOSS first-time pass; #2247 CLOSED (QA shipped).
- game-queue EMPTY. #1711 `next`, Jon-side.
- jonq: #2218 AWAITING (lane:platform, JON_KEY) — nothing from lane:games.
- Nightly green; `main-ok` clean at exit.

## Next (slot a or b, in order)
1. Resume check FIRST: #2244's branch `forge/homebody-meal-bells` — if its
   `FORGE (a):` claim comment is >90 min stale, step 1b resumes it (claim
   refuses only if slot a is alive).
2. Else ladder: steer/none → #1711 skip (Jon-side) → game-queue empty →
   QA-borrow only if no `QA MASTER` live → flagship stages (all four exhausted
   — go straight to never-dry `weakestStage`; likely candidates: TIDY BOT
   remaining gaps #2258-adjacent [two-slot carry, aimed retrieve, wash hum],
   Homebody tails once #2244 releases). Don't duplicate QA #2254/#2258.

## The session's catches
- **Measure a mutant claim, don't assume it.** "Door blocks the straight line"
  did NOT mean the detour gate reddened under `door`: BFS tiebreaks equal-length
  paths around the obstacle anyway. The honest gate pair compares ROUTE LENGTH
  (55 shut vs 69 open) — that moved; pierce-via-tiebreak never did.
- **Lazy chunks + machine-specific hashes.** Game strings never live in the
  entry bundle, and every chunk hash differs between local and CI builds —
  prod verification = poll for the entry-hash swap, then grep chunk-map content.
- **Vercel target_url is auth-walled** — verify through the jalfern alias
  (308 apex→www: always `curl -L`).
- **A reported write is not a written file**: a /tmp `--body-file` vanished
  between write and `gh`; `ls` before shipping steps that read it.

## Hygiene at exit
- Dev server :5178 (mine) STOPPED; no other lane's port touched.
- Worktree `~/Dev/retrogames-forge-tidybot-glide` re-detached at origin/main
  (`657a94e`). Tidy-candidate.
- STATE.md committed to main (game merged this session — rule 9 satisfied);
  parked at slot-b path + shared path.
