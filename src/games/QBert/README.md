# Q*BERT (`/qbert`)

The 1982 Gottlieb lance-less duel: a pyramid of cubes and a bird who only hops
on the diagonals. Every rule lives in `sim.js` — a pure `(state, input)` step
with zero DOM and zero `Math.random`, so `npm run qbertcheck` audits the round
the player actually gets, in plain Node.

## File boundaries

- `sim.js` — the pyramid, hops, flips, hazards, scoring, rounds, `stateHash`.
- `planner.js` — the autopilot (BFS to the nearest cube that still needs a
  flip; freezes rather than hopping at a snake). The attract demo replays this
  exact pilot, tick for tick.
- `art.js` — every sprite: iso cubes (cached per colour), Q*BERT poses, Coily,
  the disc, balls, runners, the slick, the font (with `@ # *` for the balloon).
- `index.jsx` — the shell: fixed 256x224, fixed timestep, attract/over screens,
  single-arrow diagonal input (`padDiagonals`: UP=up-left, RIGHT=up-right,
  LEFT=down-left, DOWN=down-right; pairs still name the exact diagonal; #1196),
  `__qbertTest` DEV hook, DebugKit panel.
- `scripts/qbertcheck.mjs` — the Node gate (static CI). `scripts/qbertdive.mjs`
  — the real-keys browser drive (advisory verify tier).

## Load-bearing rules

1. **Diagonal-only, and the skirt is honest.** Rows are `[1,2,3,4,5,6,4,3]`;
   adjacency is exact-symmetric, and a hop that leaves the board at the skirt
   corners is a fall — while the apex up-hop is *not* a fall, it boards a
   passing disc. Both directions are pinned (`qbertcheck`: symmetry, reachability,
   the fall, and the blocked apex).
2. **The flip is a state machine, not prose.** Round 1: land → green, all 28
   match = clear (the apex counts at start, so 27 flips). Round 2+: every cube
   cycles 0..4 per hop, clear when all match. A green cube re-landed does not
   re-count.
3. **Coily hops toward you, one cube per drop.** Distance strictly closes;
   contact kills; the disc lure removes a snake within two edges (+500) and
   leaves distant ones. The chase, the lure radius and the drop-count-from-flip
   spawn are each pinned against literal numbers.
4. **The harness walker is not the pilot.** The full-round clear is scripted by
   qbertcheck's own BFS, and the pilot is graded separately across 8 seeds:
   clears round 1, ledger event-by-event, hash-for-hash, with lives-1 slack.

## Honest deviations / known gaps (the QA lane's starting list)

- Chain scoring honours 25/50/100 and the original's *timing window*: an up-hop
   landing more than ~1s (CHAIN_WINDOW) after the last resets the up-chain, so a
  slow climb scores singles instead of the heli-jump 100.
- Q*BERT faces the direction he travels on screen: `facing` lives in `sim.js` as
  the sign of each hop's horizontal displacement (not the key pressed). The old
  render rule (`tc >= fc`) pointed him right on every down-left hop and on a
  skirt up-right hop. `qbertcheck` pins all four hop directions, including the
  skirt cases where the row below/above is narrower.
- Coily is a coiled spring, not a stack of bars: `art.js` models the body as
   five oval coils whose stack wiggles by a pure travelling sinusoid
   (`coilX`/`coilY`, pinned in `qbertcheck` — a static stack of bars goes red),
   with a flicking head tongue.
- The flying disc is a real spinning disc, not a bar of dashes: `art.js` models
   its projected half-width as a pure function of the spin frame (`discHalfW`,
   broadside -> edge-on -> broadside, pinned in `qbertcheck` — a static-width
   bar goes red), drawn larger (28px across) as a rimmed, lit, hubbed ellipse
    so it reads as a 1982 spinning disc. The red ball's per-cube bounce-squash
    is modelled the same way: `ballScale` is a pure damped boing (impact
    flatten -> spring past round -> settle) and the painter anchors it to the
    cube surface line (pinned in `qbertcheck` — a static ball goes red).
- The hop is a real leap, not a static figure: `art.js` schedules it with the
  pure `bertFrame(phase, k)` + literal `BERT_GEO` per-frame geometry — the
  up-hop tucks (feet up, body compact) and holds the tuck with a smile at the
  apex, the down-hop stretches, and a down-landing (the sim records
  `lastLandDown`, kept out of `stateHash`) plays the two-frame splayed squash
  for `BERT_LAND_TICKS` before idle. `qbertcheck` pins the schedule and every
   pose's literal bounds — a flat pose set (no tuck, no stretch, no squash)
   goes red.
- The cube tops tile contiguously, the way the 1982 cabinet does: each iso
   cube's side faces run `CUBE_SIDE` (16) below the top diamond — deep enough
   to reach the front neighbour's top edge, which sits one row-pitch (15)
   below at the same x. `sideMargin` in `art.js` is the pure coverage test
   (the minimum of our side-bottom edge over the front top edge, across the
   face); `qbertcheck` pins it >= 1px (an anti-aliasing overlap) and pins the
   old 10px depth red — the shallow face left the background gradient showing
   through as a seam at every cube's bottom corners.
- Levels escalate snake count/speed and switch the flip mode, but there is no
  original point-value table match beyond the documented singles/roundtrip/heli.
  (1-UP every 10,000 is now in: a life per 10k boundary crossed, capped at 9.
  The disc drop destination is now in: a random row across the whole pyramid,
  then a random cube in that row — the original's wider row list, not the old
  apex-or-row-0/1 bias. `qbertcheck` pins both ends: a high RNG roll reaches
   the bottom skirt, a low roll the apex.)
- Hot-seat 2P (alternating turns) is in: each player keeps their own score,
  10,000-point 1-up ledger and lives; only the active player's bird is on the
  board (one keyboard, no second touchpad). When the active player runs out of
  lives the OTHER takes a fresh pyramid keeping their own score and lives, and
  only when BOTH are out does the game end. The HUD brightens the active
  player's score line and shows the active player's lives; `qbertcheck` pins
  the handoff, the per-player 1-up and the both-out game over (a shared life
  pool or a missing handoff goes red).
  Still missing: the bonus-stage green-field.
- Music is an original bouncy riff, not the Gottlieb melody. Its step grid is
  locked to the sim's 60Hz hop cadence (`MUSIC.qbert.step = 0.1` = exactly 2
  steps per 12-tick hop; the 32-step loop = exactly 16 hops), so the bed and
  the hops stay in phase — the old 0.12s grid drifted (5/3 steps per hop) and
  read stiff against the 60Hz clock. `qbertcheck` pins both integers.
- `qbertdive` rides the advisory tier (like `joustdive`/`tetrisplay`), not the
  PR gate.

## Q*BERT

**Q*BERT** (`/qbert`) is the 1982 Gottlieb cube-hop: a 28-cube isometric
pyramid (rows 1-6 + skirt 4,3), diagonal-only hops, every landing flips the
cube top — round 1 is all-green (apex counts, 27 to go), round 2+ is the
5-colour cycle (clear when all match). Coily drops at flip 9 and strictly
closes on you; the apex up-hop boards a disc and a snake within two edges
follows it off (+500); red balls ricochet the edges, Ugg/Wrongway run rows
(round 2+), Sam & Slick wipe green back (round 3+); the "@!#?@!" balloon
rides every death. `sim.js` is pure and `planner.js`'s proven pilot drives the
attract demo; `npm run qbertcheck` grades the pilot with its OWN walker as
referee (71 checks: geometry literals, chase/lure radius, chain ledger 25/50/100,
pilot clears round 1 with lives-1 slack on 8 seeds, hash-for-hash). Verify with
`npm run qbertcheck` (`static` gate) and `npm run qbertdive` (Chrome, real
arrow keys — singles and pairs; advisory tier). Note: at the apex, up-diagonals are the disc
attempt — the way off the top is down-diagonal (the harness learned this the
honest way).
