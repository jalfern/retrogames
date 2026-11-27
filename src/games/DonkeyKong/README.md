# DONKEY KONG — engine notes

Williams-style tower climb (1981 lineage): five sloped girders plus the ape's
floor, ladders (four broken ones flicker as bait), barrels that roll down-hill
and randomly dive ladders, jump them for 100, reach her girder for the lap's
1000. Fixed 224×256 world, integer-step physics at 60 Hz.

## Layout (since #1637 batch 27)
- `sim.js` — the WHOLE rule set: `makeRun(seed)` builds the level, player,
  barrels and every die on one mulberry32 stream inside `gs` (#1473 seed-param;
  `?seed=N` replays the exact barrel pattern; `rnd(gs)` is step-identical to
  `seedRng`). `tickDonkeyKong(gs, input)` is what `update()` used to be;
  `stateHash(gs)` is the replay witness.
- `watchStep(gs)` — the WATCH route (Y key). Every tick it replays the game's
  own physics on cloned worlds (dice forked from the state, no `Math.random`)
  and ranks the route instinct plus held candidates. The arcade doctrine is
  code: the girder gap is ~32 px and the jump arc ~40 px, so a kangaroo COULD
  hop the whole tower — the original never did, so jump candidates only
  compete when a barrel is actually near (`barrelThreat`), and progress is
  height-monotone so climbing out always beats hanging on.
- `index.jsx` — shell only: canvas, sound (events stamped by the tick), the
  b24/b26 seat chrome (Y with blips, takeover, tap-to-start, never lingers),
  `__dkTest` DEV hooks and the `exposeGame` contract (`donkeykong`).
- `attract.js` — the shared attract copy cycle (#365 rule 6).

## Verify
```
npm run kongcheck            # rules + seat pins + 24-seed watch sweep
npm run kongcheck -- --mutant # 17 planted bugs, every one must turn it red
npm run kongcheck -- --mutant  # determinism + rule gates + rule mutants
npm run kongdrive              # real Chrome: keys, seat, finale crash, restart
npm run watchcheck -- --only donkeykong   # Y seats/steers/re-seats in Chrome
npm run contractcheck        # the exposeGame contract (in contractGames)
```
Ports: the browser checks read `DEV_PORT` (slot a 5173 / slot b 5178 / QA 5176).

## Honest gaps (vs the arcade original)
- **CLOSED by #3598, phantom-retired in #3618:** the arcade screen loops —
  there is no dedicated second stage to port. The rivet finale (#3598) IS the
  arcade structure (pull, crash, lap banks, board rebuilds); the table of a
  25 m second screen with 8 rivets and section-by-section drops was never
  sourceable in-repo, so it stays shipped history, not a spec. The prose
  below is kept for the record.
- Oil drum is decor; the arcade's flame kills. No score bonus timers, no
  50/100-point distinction for walking past vs jumping over barrels' edges.
- Barrels can take ladders mid-air now (#3622): a falling barrel crossing a
  ladder's span rolls a single BARREL_DIVE_CHANCE, once per barrel per ladder
  (`takenBits`). Two girder-end rungs stand at the right fall-gap corner
  (x=222, R1→dangling foot, R2→ground), so corner-miss barrels meet R2
  mid-air and R1 off the tip. The runner never climbs the barrel-only outer
  rung. (The old silent failure: the edge-check could never set `falling=true`
  — gravity beats it to `vy>0` — so no airborne barrel state existed at all;
  fixed to `vy >= 0`.)
- The arcade's true barrel-drop onto an already-boarded ladder (two barrels
  sharing one span) is still simplified: each span takes only its first
  boarder per tick, and the pair stands at the right corner only — the left
  fall column drifts barrels off-screen before any rung reaches it.
- **CLOSED by #3618:** broken ladders climbed part-way — see Half-rungs
  below. (Was: the original let Mario climb part-way some rounds; barrels and
  the player both refused them outright.)

## Hammer (#2018 — the attract promise kept)
Two mallets ride the right-hand ends of the ground floor and DK's girder
(`gs.hammers`, positions in `buildLevel`). Walking over one empty-handed and
grounded picks it up; carried, Space SWINGS instead of jumping (up / flat /
down, the original's sequence, `gs.swingSeq % 3`) and the ladders refuse you
(the original's trade). A live swing (12 ticks) deletes a barrel in its lane
for the arcade 100 — the kill box is untouched, the hammer extends reach,
never safety. Five swings and it shatters (`HAMMER_SWINGS`); death/lap reset
puts fresh mallets back on the girders. The WATCH route never walks within
reach of a mallet (route centre x ≤ ~185 vs pickup x ≈ 205): the seated
driver stays hands-free — kongcheck pins it (seat-hands-free rule), and the
24-seed floors are unchanged because the seat never touches the mechanic.
Durability is swings-not-ticks: the widely-cited arcade rule; the swing-only
limit also gives a player who grabs badly (by a ladder) an honest escape —
wail five times and jump/climb again.

## Half-rungs (#3618 — the broken ladders became the original's trap)
A broken ladder keeps its lower span. `buildLevel` gives every broken ladder a
`breakY` at `BREAK_FRACS` × span (level order — deterministic, the level still
carries no dice); sound ladders get `breakY === yTop`, so the climb rule is
uniform. Mount a broken ladder's foot with UP and you climb to the break line
and HANG: the last rung holds (`ev.hang`, one thud), the span above is gone,
drawn as snapped uprights and a missing rung-field. DOWN climbs back down and
steps you onto the girder. The top never delivers — bait stays bait.
Doctrine: the WATCH seat and attract demo never trust a broken rung. Only
input tagged `human` (the shell's key path) may mount one — rollout candidates
and greedy arrive untagged, so every seeded seat rollout, every replay hash
and the 24-seed floors ride byte-identical. Take the wheel while a runner
hangs on broken rungs and the sim steps him off onto the girder below —
the route never clings to what it cannot prove. `kongcheck` §half-rungs pins
all of it (geometry, hang, descend, seat refusal, seat step-off, per-ladder
break lines); the drive exercises it with real arrows.
