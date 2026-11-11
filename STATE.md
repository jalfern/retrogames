# STATE — session 222 (2026-11-11, slot a)

## Shipped this session
**ASTEROIDS: the hunter — WATCH batch 26** — PR #2000 squash-merged to main
(Part of #1637; issue stays open, multi-stage). Whole tick lifted verbatim into
`src/games/Asteroids/sim.js` (makeRun/tickAsteroids/stateHash; dice ride
gs.rngState, mulberry32 steps identical to seedRng). watchStep scores the
greedy play + 12 candidates by replaying the game's OWN physics on cloned
worlds (dice forked from (seed,tick,rngState)): survival ttc-quadratic ≫
kills-in-horizon ≫ lead-aim shaping.

Sweep 40 seeds × 120 s: 40/40 byte-equal replays, 0 game-overs, 35
zero-death, waves 2–4, worst seed 6560. Gates: asteroidscheck 46/46, mutants
13/13 (11 battery + 2 anchor-false-verdicts re-verified on clean tree — see
corpse note), watchcheck asteroids 260/260 live seat, contractcheck 14/14
(newly wired), watchphonecheck 464/464, watchpillcheck 214/214, attractcheck
694/694, lint gates + build + static green. QA polish pass filed as #2001.

## The three laws the driver needed (each a stall, not a crash)
- **Hold candidates 10 ticks** before greedy continuation: a 1-tick turn can't
  bend a 70-tick future; all-ties fell to candidate order and the ship fired
  into empty space beside the last rock (2 min stalled at score 3020).
- **Dodge only what arrives**: quadratic time-to-collision ≤ 45 ticks. Fleeing
  pebbles that never reach the hull made the driver orbit the last rock forever.
- **Lead the target + angular fire window**: solve |Δ+v·t|=B·t; rotation is
  quantized 0.08 rad, so a distant pebble must be CLOSED before a hit is
  geometrically possible (window = max(0.05, size/dist)).

## Ladder trail
TARGET #1637 claimed slot a (claim had lapsed at session-220 end; warden
re-assigned). No halt/steer; `next` #1711 stays Jon-side (#1730). Queue empty.

## Collision log (read before touching this branch or port)
Warden double-kick #1782 RECURRED: a second slot-a session (pid 50660, kicked
03:58Z-ish, target #1997 which it shipped) worked INSIDE this lane's space —
it rebased forge/watch-b26 at 04:09 (content was disjoint, harmless) and ran
its own asteroidscheck --mutant concurrently, which left a PLANT CORPSE
(ttc<2) in my sim.js and produced two false "anchor missing" mutant verdicts
in mine. Scrubbed `git checkout -- src/games/Asteroids/sim.js`, anchors
re-verified dead on the clean tree, ownership announced on #1637. If you are
that instance: this lane shipped b26; re-verification only, please.

## Next queued (slot a)
1. Fresh ladder: halt/steer/next/queue games-first. #1711 Jon-side.
2. **#1637 batch 27 (WATCH)** — remaining unseated with no proven driver:
   **DonkeyKong / Centipede / Pitfall** (registry-oldest = DonkeyKong, but it
   has NO sim.js — whole-engine lift + driver in one session; budget ~3 h).
   b25/b26 template: lift whole tick → Node sweep pinned floors → seat (Y +
   blips + never-linger) → watchcheck pilot + source pins → README gaps.
   b26 laws apply: hold candidates, honest ttc, lead + angular window.
3. QA (#2001 ASTEROIDS polish, saucers/hyperspace/heartbeat) belongs to the
   QA lane (#1019 rule), not builder lanes.

## Notes for the next slot-a session
- Check for plant corpses before trusting ANY check run: `git status
  --porcelain` + grep anchors while a sibling may be running. node_modules
  (incl .vite) is symlinked/shared — browser suites flake when two lanes'
  Chrome runs hit one box (tapstart failed on DIFFERENT untouched games two
  runs in a row: environmental, rerun once, move on).
- Mutant lesson: pick mutants that break FLEET-VISIBLE laws. "Suicidal
  rollout" and "ghost aim" survived — those laws barely move 60 s metrics
  (total 66.7k healthy vs 64.3k/64.7k broken). ttc-window/wrap-eye/hold
  collapse all die loudly (zeroDeath + wavesBanked floors catch them).
- Fast-sweep mode (ASTEROID_SWEEP=fast, 12 seeds × 60 s) is what mutant
  children run — floors scale there (zero≥9, waves≥SEEDS-1, min≥2500).

## Open questions
- None.
