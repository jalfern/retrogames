# STATE — forge board snapshot (slot a, 2026-11-25 — SKYWARD GETS ITS RUNWAY)

## This session — one ship, landed
- Warden TARGET **#3233** REFUSED at claim (studio holds it live, 7 min old — it
  shipped as grind-city tail work while I built). Normal ladder: no steer, `next`
  #1712 waiting-jon, `game-queue` empty, QA MASTER live on mini+studio → no
  borrow → flagship stage spent → never-dry `idle-kick` first said `KICK PINBALL 0`
  — re-derived LIVE after studio claimed #3297 (pinball building-qa) it flipped to
  **`KICK SKYWARD 0 weak`** (score 5). Gap 0's actionable remainder: "no second
  landing strip" (online half stays out of scope). Filed + claimed **#3302**,
  shipped via PR **#3306** merged `f49c239`.
- **SECOND STRIP (Pilotwings landing test, own IP)** — painted runway on the
  south beach (west→east, threshold x −30, len 160, deck 2.6, full-weight corridor
  + k² shoulders ⇒ exact & dry every seed). Soft aligned touchdown inside scores by
  depth: SHORT 150 / MIDDLE 300 / LONG 450 / FULL STRIP 700; crab >0.30 rad =
  scuff 60; hard = tumble (old law); off-strip = mat law **byte-identical**;
  bullseye 1000 stays precision prize (no pad-band point on the strip — pinned).
- **Honesty**: `stripZone`/`stripScore` pure in sim.js; hash inputs unchanged;
  `stateOf` additive (`strip`, `stripD`); autopilot still aims the mat — honesty
  pin 5 seeds, strip-lands = 0. Storm: east end trimmed 150→130 so the cell's
  closest sweep ≈388 m clears the 375 m guard → hard s=0 on the strip.
- Proof: skywardcheck **104/104 (+17 pins)** + **ALL MUTANTS CAUGHT 30/30**
  (4 new: pays-nothing, zone-collapse, alignment-blind, carve-below-deck);
  skywardplay **PASSED** live — wind-crabbed short-final banks FULL STRIP +700
  with HUD callout, zero console errors; contractcheck 857/857; eslint + 3
  gates + build green. Prod verified: `Skyward-Bc-v8L1s.js` carries FULL STRIP;
  play at `/retrogames/skyward`. #3302 shipped+closed. QA tail filed **#3310**.

## Harness lessons (worth one line each)
- idle-kick can flip between reading and claiming when another lane labels a game
  building-qa — ALWAYS re-run it immediately before claim, not just at session start.
- A 14 m strip vs ±2.2 m/s seed wind: long final = drift-off (live leg landed 60).
  Drive legs fly SHORT finals crabbed to a straight ground track
  (`heading = acos(−wind.z/speed)`); single-tick Node pins never see this —
  multi-second live legs are what catch wind-law gaps.
- Zone-boundary test points must leave fp headroom for one physics step
  (frac 0.75 + one tick of speed = next zone); boundaries belong in pure-law
  pins, live legs aim mid-band.
- `teleport` y off a *different* seed's world breaks shoulder-edge spawns (only
  the core deck is seed-exact); read y from the game's own terrain.

## PLAYABLE on main right now
- `/retrogames/skyward` **RUNWAY** zone-scored glider landings (#3306) + storm
  cell drift (#3267) + rain bed (#3295) + engine bed (#3299);
  `/retrogames/grind-city` rail grabs + coping stalls (#3293) + roof line;
  `/retrogames/pinball` TABLE SMITH (#3291) + tilt-nudge (#3296) + kickback;
  `/retrogames/tidal-rush` grabs/flips/handstands + rooms; mario-kart TILT,
  marble-rush, comet-drift pair, ssx, marble-madness, pacman, mario,
  minesweeper/garden-guard/homebody, TIDY BOT, STARRY NIGHT, TOP SOLDIERS,
  DOUBLE DRAGON, RACCOON HEIST, spy-hunter, iron keep, galaga, missile, pucks,
  mines, zork, ultima, king's quest, Joust, Q*bert, forge board.

## Board watch (facts, not questions)
- `game-queue` empty; `next` #1712 waiting-jon (not a work item).
- QA holds live at handoff: #3233 grind-city tail 2 (studio), #3297 pinball tail 3
  (studio), #3281 tidal tricks tail (mini, WIP branch `qa/tidal-rush-tricks-tail`).
- Feedback open: #3310 skyward strip tail (fresh), #3290 smith tail, #3281, #3233,
  #3237, #3272 (items 1+4 shipped via #3295, 2–3 shipped earlier — closable?),
  #2971/#3244 waiting-jon.
- Next builder claim: re-run `idle-kick` LIVE (pinball/skyward/grind-city/tidal
  now carry QA-held tails; skyward README's unowned gaps are plane-landing +
  landing-quality instant judging).

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload (lane:qa, AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions filed this session.

## Slot state at handoff
- Slot a: dev :5173 stopped via `scripts/devstop.sh`. Worktree
  `~/Dev/retrogames-forge-skyward-strip` detached clean at origin/main by merge
  cleanup — remove when convenient.
- Game merged ⇒ STATE.md ships via its own docs/state PR; parked slot-scoped.
- Time-box: ~2 h 15 m of 3 h used.
