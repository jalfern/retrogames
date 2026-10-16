# CIVILIZATION V — Stage 2 "War"

Firaxis's 2010 4X. Stage 1 shipped the founding loop (explore, settle, work,
grow); Stage 2 adds the combat the issue names: melee and ranged units, cities
that bombard attackers and can be captured, barbarian camps that roam,
production, and the first of the four victories (Domination).

`https://jalfern.com/retrogames/civilization-v`

## What is in the box

```
src/games/CivilizationV/sim.js      pure deterministic sim (no three, no DOM, no Math.random)
src/games/CivilizationV/planner.js  the autopilot — the attract demo AND the harness witness
src/games/CivilizationV/art.js      tilted 3D hex world (three.js): relief, fog, borders, camps, HP bars, arrows, impact FX
src/games/CivilizationV/index.jsx   the shell: renderer, camera, input, HUD, fixed-timestep loop
scripts/civcheck.mjs                Node harness (npm run civcheck) — 89 checks
scripts/civplay.mjs                 Chrome drive with real keys (npm run civplay) — 17 checks
```

## Engine notes

**Hex geometry.** Odd-r offset (pointy-top) grid, 40×25. `neighbors` reads the
parity table; `hexDist` converts to cube once. One unit per tile — enforced
*in battle*: a melee killer marches into the hex its defender just vacated, so
two survivors never share a tile (civcheck §11 proves it).

**Terrain.** Seeded value-noise blob + radial falloff → ocean-ringed
continent; elevation thresholds pick terrain; coast is the land↔sea rim;
forests are seeded thinning; rivers carve downhill from mountains. All
randomness is `mulberry32`/`hash2` off the seed — same seed, byte-identical
world (§2 proves hash-for-hash).

**Combat (Stage 2).** Units carry 100 HP and a combat strength (warrior 8,
archer 11, barbarian 7). Each exchange is deterministic effective-strength
combat: `str × (0.5 + 0.5·hp%) × modifiers`, where defenders get hills +25%,
fortified +25%, city-tile support +50%, and melee attackers crossing a river
are at −10%. Damage per strike ≈ `34·atkEff/(atkEff+defEff)` for the attacker,
`30·defEff/(atkEff+defEff)` retaliation for the defender; up to 4 strikes
resolve a battle. Archers (range 2) take **no retaliation** from targets they
out-reach. Attacking exhausts the unit; a unit that neither moves nor fights
fortifies (+25%) and heals — +12 on home soil (+8 more fortified), +5 abroad.

**Barbarians.** A fifth civ (id 4, always at war) with no cities. World-gen
seeds `CFG.campCount` camps — open land ≥4 hex from any capital seat, ≥6 apart
— that each spew a warrior every `barbSpawn` turns under a global cap
(`barbCap`). Roamers seek the nearest soft target within `barbSeek` and throw
themselves at it. Camps block movement and settlement; burning one (2 warrior
strikes) pays 12 gold and stops its spawn forever.

**Cities at war.** A city defends with `10 + 3·size` walls × its own 0.5–1.0
health scale and bombards the weakest adjacent enemy once per turn (16·hp scale).
When walls hit 0 the city is **captured**: it flips owner at half size, 60
walls, and loses its build queue; a civ that loses its last city is destroyed
(`civDead`). Victory: capital size 4 (Stage-1 milestone), DOMINATION (every
rival civ destroyed) — the first of Civ V's four; loss: capital falls or turn
limit.

**Production.** Cities bank `production` into a queue (max 3 deep). Player:
keys 1/2/3 queue WARRIOR (15) / ARCHER (22) / SETTLER (35) at your first city.
AI cities keep expanding with settlers and, in wartime, mix warriors/archers.
Deliveries wait for a free tile (points keep banking).

**War with the AI.** From turn `warDeclareTurn` a healthy rival (5+ units and
cities) declares war on you on a deterministic `hash2` roll ≤ `warChance`;
attacking any civ's unit or city *is* a declaration. AI military then seeks
targets within 7 hexes (3 while at peace).

**Fog, borders, economy** unchanged from Stage 1 (see civcheck §4–§7): three
per-civ byte arrays, `cityWorkedTiles`/`cityYield`, citizens eat 2, borders
spread in the owner's colour.

**Camera & FX.** Orbit/pan/zoom + raycast pick as Stage 1. New: camp huts with
flickering embers, per-unit HP bars (green→amber→red), arcing arrow projectiles
for ranged strikes, expanding impact rings + sparks, and camera shake on
kills/sieges/captures. All synthesized: clash noise, arrow/hit tones, raze
sweep, war drums, capture fanfare.

## Controls

Click/tap a tile to move; click a hostile hex (unit, camp, enemy city) with a
unit in range to strike it. Keys: Space/Enter end turn · E settle · 1/2/3
queue warrior/archer/settler · arrows orbit/tilt · wheel/pinch zoom · `?` help.
`VirtualControls`: A = END TURN, B = settle; attacking is tapping the hex.

## Verify

```bash
npm run civcheck          # 89 Node checks: boot, determinism, founding, economy, combat (melee/ranged/modifiers), barbarians, cities, domination, production, healing, win/loss/slack
npm run civplay           # Chrome, real keys: attract + settle + end-turn + queue/build + win, camps present, 0 errors
npm run lint:civ          # eslint gate for the game + its scripts
```

`civplay` needs `npm run dev`; against headless IPv4 use
`CIV_URL=http://127.0.0.1:<port>/retrogames/civilization-v npm run civplay`.

**Mutant proof.** In `sim.js` `doAttack`, flip the march-in condition
`if (!ranged && u.alive)` → `if (ranged && u.alive)`: the one-unit-per-tile
battle check (§11) and the autopilot win path go red, restore returns green.
(Stage-1 mutant: centre food `+2→0` breaks growth/win/slack.)

## Honest gaps (Stage 2 boundaries — the deep pass closes these)

- **No tech tree yet.** Science accumulates as a score; no unlocks gate units.
- **No buildings/wonders/city screen.** Production is units-only.
- **One-third of the victories.** Domination + the founding milestone ship;
  science/culture/diplomatic are later stages.
- Combat is deterministic-strength, not Civ V's stacked-odds dice (its feel —
  HP, terrain, fortification, retaliation, march-in — is reproduced; a fixed
  sim can't roll dice and stay reproducible).
- No unit promotions/experience, ZOC, sieges over multiple turns for capitals
  (wall HP stands in), no raze/annex choice, no spies or great people.
- AI declares war on a pseudo-roll rather than evaluating power balance;
  it never makes peace.

These are intentional stage cuts, not omissions of promised Stage-2 behaviour.
