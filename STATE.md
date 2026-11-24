# STATE — forge board snapshot (slot b, 2026-11-24 — PINBALL rung 2 shipped, #3169)

## This session — one ship
- **#3169 — PINBALL rung 2 (right ramp · firelane · lock tower · MULTIBALL)**
  SHIPPED: PR #3175 merged `a765162`; Vercel green, live lazy chunk
  `Pinball-D9BoQTfS.js` carries the game. Never-dry pick: `weakestStage`
  score 6 (TidalRush phantom-skipped — #3104 IS its commission, slot a
  live; GrindCity gaps restated in #3167 → owned).
- Engine law kept (#3103): rung 2 grew the shared engine with generic
  primitives (one-way gate, rollover, capture pocket, multi-ball loop with
  per-ball drain/save, empty-table feed); CABINET ONE only adds TABLE data.
  `gs.bx/by/vx/vy` are now primary-ball proxies — every rung-1 consumer
  untouched.
- Rules: RAMP 25×MULT up-only ×2 + 500 set · Firelane entered only over the
  dome gate (3×25 + sweep 100) · lock 500, lock 3 → MULTIBALL 1000 (awarded
  pre-x2) · pack x2, 5 s ball-save (one), lock-in-pack = extra ball paid at
  pack end · only the last ball home costs a game ball.
- Harness: `pinballcheck` 41 → **71** — gate laws both directions, up-only
  rollover math, capture-doesn't-cost-a-ball + feed, save-vs-packdrain,
  pack-end payout, hash covers tower+pack, per-ball fuzz containment +
  never-empty, scripted **human line** (3 medium plunges → MULTIBALL, zero
  teleports). Mutant: flip gate segment order → 4 rung-2 checks die.
- **Seed pin fixed**: `stateOf` now carries `seed` (integer) — the known
  `contractcheck pinball` nightly failure from #3116/#3103 should clear with
  the next nightly (contractcheck 14/14 locally).
- Rule 4: COUNTER RESET — game code merged.

## PLAYABLE on main right now
- **`/retrogames/pinball`** — rung 2 live (Space/arrows, hold Space =
  plunger, B nudge; ? pause; pad on phone). Medium plunger notch (meter just
  off the bottom) feeds the firelane — first lock is reachable on the first
  ball; three locks ignite MULTIBALL.
- `/retrogames/grind-city`, `/retrogames/marble-rush`, `/retrogames/skyward`
  (THUNDERPASS), `/retrogames/tidal-rush`, `/retrogames/stomptown`,
  `/retrogames/short-order-shout`, ssx, marble-madness, pacman, mario,
  forge board, TIDY BOT (#3085), STARRY NIGHT (#3082), TOP SOLDIERS (#3067),
  DOUBLE DRAGON, R-TYPE, RACCOON HEIST, spy-hunter, iron keep, galaga,
  missile, pucks, mines, zork, ultima, king's quest, Joust, Q*bert.

## Board watch (facts, not questions)
- Slot a holds **#3104** (TIDAL RUSH rung 3, claimed 15:37Z) and its recent
  comments kept #3107 (MARBLE RUSH stage 2, still `game-queue`) unclaimable
  from this slot all session.
- **heldDirs blind spot**: `idle.mjs heldGames/heldDirs` match titles only,
  so open building **#3104 ("jet-ski racer") does NOT read as holding dir
  `TidalRush`** — weakestStage ranked TIDAL RUSH first until reasoned away
  by hand (#3103 closed = its commission; STATE says rung 1 shipped there).
  A rename or title alias on #3104 would fix the derivation at the source.
- #3107 stays OPEN + `game-queue` (five shelves shipped of ten).
- **#3178 filed** (`feedback`) — QA polish pass for PINBALL (attract
  show-off, multiball loudness on phones, phone HUD density).
- No `steer`, no `halt`, no new `waiting-jon` from slot b this shift.

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload; does the big build need one?
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).

## Next queued
- Oldest `game-queue`: **#3107 stage 2** (shelves 6–10 + stage-2 verbs) —
  held by slot a's recent comments until its lock lapses.
- Then the flagship/never-dry rungs again: pinball rung 3 (orbit, magnet,
  DMD, table-select) is honest gaps only — file from the README if the
  never-dry rung lands back on PINBALL.

## Slot / board state at handoff
- Slot b: #3175 merged with full cleanup (remote branch gone, lane detached);
  #3169 shipped+closed; #3178 filed; shift report pushed; STATE.md ships via
  its own PR; dev :5178 stopped via devstop.sh.
- Worktree `~/Dev/retrogames-forge-pinball-rung2` detached at origin/main at
  handoff; frame-strip PNGs live in /tmp/forge (intentionally untracked).
- main-ok green at exit.
