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
npm run watchcheck -- --only donkeykong   # Y seats/steers/re-seats in Chrome
npm run contractcheck        # the exposeGame contract (in contractGames)
```
Ports: the browser checks read `DEV_PORT` (slot a 5173 / slot b 5178 / QA 5176).

## Honest gaps (vs the arcade original)
- No hammer power-up (attract copy mentions it; it was never implemented —
  QA may file this; until then the line is a promise the game doesn't keep).
- Single screen: the arcade's rivet level and the collapse that finishes it.
- Oil drum is decor; the arcade's flame kills. No score bonus timers, no
  50/100-point distinction for walking past vs jumping over barrels' edges.
- Barrels never fall onto ladders they didn't board (onLadder is per-barrel;
  a barrel meeting a ladder mid-air keeps rolling).
- Broken ladders only flicker (the original let Mario climb part-way some
  rounds); barrels and the player both refuse them outright.
