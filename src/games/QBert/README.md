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
  arrow-pair input, `__qbertTest` DEV hook, DebugKit panel.
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

- Chain scoring honours 25/50/100 but the original's *timing window* between
  chained hops is simplified: any consecutive hops chain (originals required
  roughly a one-second window).
- Levels escalate snake count/speed and switch the flip mode, but there is no
  original point-value table match beyond the documented singles/roundtrip/heli,
  no 1UP every 10k, no alternating hot-seat 2P, no bonus-stage green-field,
  and the disc drop destination is apex-or-row-0/1 (original picks from a wider
  random row list).
- Music is an original bouncy riff, not the Gottlieb melody.
- `qbertdive` rides the advisory tier (like `joustdive`/`tetrisplay`), not the
  PR gate.
