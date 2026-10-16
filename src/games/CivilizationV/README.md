# CIVILIZATION V — Stage 1 "The Founding"

Fireaxis's 2010 4X, opened at its first and purest decision: **where to make your
home.** Stage 1 of the deep pass on issue #295 ships the founding loop — explore
through the fog, settle a capital, work its ring, grow. Tech tree, war units,
wonders and the four victories are the next stages.

`https://jalfern.com/retrogames/civilization-v`

## What is in the box

```
src/games/CivilizationV/sim.js      pure deterministic sim (no three, no DOM, no Math.random)
src/games/CivilizationV/planner.js  the autopilot — the attract demo AND the harness witness
src/games/CivilizationV/art.js      tilted 3D hex world (three.js), instanced relief + fog + borders
src/games/CivilizationV/index.jsx   the shell: renderer, camera, input, HUD, fixed-timestep loop
scripts/civcheck.mjs                Node harness (npm run civcheck) — 42 checks
scripts/civplay.mjs               Chrome drive with real keys (npm run civplay) — 14 checks
```

## Engine notes

**Hex geometry.** Odd-r offset (pointy-top) grid, `CFG.W × CFG.H = 40 × 25`.
`neighbors(c,r)` reads the parity table; `hexDist` converts to cube once. One
unit per tile; `findPath` is a BFS over passable, unoccupied hexes.

**Terrain.** Seeded value-noise blob + radial falloff → continent ringed by
ocean. Elevation thresholds pick ocean/coast/grass/plains/desert/hills/mountain;
coast is re-classified as any tile adjacent to land↔sea; forests are seeded
thinning over grass/plains; rivers carve downhill from mountains to the sea. A
capital seat is the walkable tile maximising (grass + river + fertile-neighbour
count) around each civ's region seed. All randomness is `mulberry32`/`hash2` off
the seed — freeze the seed and the world is byte-identical (civcheck §2 proves it
hash-for-hash, and an autopilot replay lands on the same state hash).

**Fog of war.** Per civ, three `Uint8Array`s over the map: `explored` (ever
seen), `visible` (seen right now), `fog`. Unseen tiles paint near-black; seen-
but-not-current paint dimmed; current paint full. Reveal radius on settle/move/
city. `art.js` drives per-instance colour off these arrays.

**Cities & the economy.** `canFound` requires passable land, no other unit (the
settler may stand on its own tile — `self` must be passed), no existing city, and
`≥ minCitySpacing (3)` hexes from any city. `cityWorkedTiles` = centre + the
best `(size−1)` neighbours by food then production. `cityYield` sums those plus
inherent centre yields (`+2 food, +2 production, +1 gold`, the Civ-V city-centre
floor) plus river/landmarks. Each citizen eats 2 food; a surplus banks into
`storedFood`, and the city gains a citizen when `storedFood ≥ growBase +
growStep*(size−1)`. `resolveCiv` runs on every END TURN — which is why a city
grows even if the player only presses Space.

**Borders.** `spreadBorders` claims unowned tiles within a city's radius in the
owner's id; radius grows a step at culture thresholds. `art.js` tints owned
tiles toward the civ colour.

**AI.** Each rival gets the same reactive `decide`-style turn in `aiTurn`: move
the settler to good ground, found, then grow; capitals bank production into new
settlers once they reach size 2 and the treasury can pay. Capitals reach size 4
across the continent on the shipped scenarios. (Deeper AI — units, war, tech —
arrives with those stages.)

**Win / lose (Stage 1).** Win: your capital reaches size `4` (`capitalSizeToWin`)
before turn `40`. Lose: the turn limit passes first (or, later, the capital
falls — there is no war yet, so turn-limit is the only loss path today; civcheck
§9 forces it).

**Camera.** Perspective, orbit (`az`/`el`) + pan target + zoom distance; drag
rotates, wheel/pinch zooms, arrows tilt/rotate. `pickTile` raycasts the
instanced hex mesh to a tile index (`instanceId`).

## Verify

```bash
npm run civcheck          # 42 Node checks: boot, rules, winnable, determinism, loss, slack
npm run civplay           # Chrome, real keys: attract + settle(E) + end-turn(Space) + win, 0 errors
npm run lint:civ          # eslint gate for the game + its scripts
```

`civplay` needs `npm run dev`; against headless IPv4 use
`CIV_URL=http://127.0.0.1:<port>/retrogames/civilization-v npm run civplay`.

**Mutant proof.** Set the inherent centre food `out.f += 2` → `+= 0` in `sim.js`:
civcheck goes red on growth + win + slack (38/42), restore returns it green. The
growth economy is load-bearing and the harness sees it.

## Honest gaps (Stage 1 boundaries — the deep pass closes these)

- **No war / units yet.** Warriors scout but do not fight; no city defense, no
  barbarians. Combat is the next stage.
- **No tech tree.** Science accumulates as a score; there are no unlocks.
- **One victory.** Size-4 capital is the Stage-1 milestone. Domination / science
  / culture / diplomatic victories are later stages.
- **AI cities build settlers but not buildings/wonders.**
- **Tile yields are an approximation** of the Civ V table (no improvements,
  resources, Great People, religion, trade routes, golden ages, era score).
- Fog uses explored/visible tiers, not the original's per-civ spy visibility.
- Cities claim a hex ring, not the original's exact culture-radius algorithm.

These are intentional stage cuts, not omissions of promised Stage-1 behaviour.
