# CIVILIZATION V — Stage 4 "Land"

Firaxis's 2010 4X. Stage 1 shipped founding, Stage 2 war, Stage 3 the arrow of
progress; Stage 4 settles the map itself: workers break ground, improvements
take real turns, and the resources underfoot — luxuries and strategics — decide
which era's units a city may field.

`https://jalfern.com/retrogames/civilization-v`

## What is in the box

```
src/games/CivilizationV/sim.js      pure deterministic sim (no three, no DOM, no Math.random)
src/games/CivilizationV/planner.js  the autopilot — the attract demo AND the harness witness
src/games/CivilizationV/art.js      tilted 3D hex world (three.js): relief, fog, borders, camps, roads,
                                    farms, mines, resource tokens, HP bars, arrows, siege, FX
src/games/CivilizationV/index.jsx   the shell: renderer, camera, input, HUD, research + worker panels
scripts/civcheck.mjs                Node harness (npm run civcheck) — 185 checks
scripts/civplay.mjs                 Chrome drive with real keys (npm run civplay)
```

## Engine notes

**Workers and improvements.** WORKER is a civilian (cost 20, ungated) that
builds on tiles inside your borders, one job at a time: Farm (needs Pottery)
+2 food on grass / +1 on plains, Mine (needs Masonry) +1 production on hills
(+1 more with Engineering, as in the original), Road (needs The Wheel). Each
job takes real turns (farm/mine 2, road 1): the first turn of toil leaves the
plot unfinished. The city's worked-ring always tills the juiciest tiles, so a
finished farm changes the capital's growth. Barbarians pillage every
improvement and road they march over — and an improvement under a dead or
marched-off worker's feet is abandoned.

**Resources.** Six luxuries (Wine, Gems, Silver, Dyes, Incense, Spices) and two
strategics (Horses, Iron) scatter on fitting terrain, spread apart. A resource
counts when it is inside your borders and land-connected: the civilisation's
road-and-territory network, grown outward from its cities, must touch it. Each
unique connected luxury pays +1 gold +1 culture empire-wide (happiness proper
is Stage 5 — this is the honest stand-in, and the README says so). Connected
strategics feed the city that holds them (+1 food grazing / +1 production
smithing) and gate two real Civ V units:

- **Chariot Archer** — The Wheel + connected Horses: str 9, range 2, moves 3.
- **Legion** — Bronze Working + connected Iron: str 12, the ancient Wall.

Queueing a unit whose resource is missing is refused by name (`requires
Horses`), in the sim — so the browser, the harness and the AI all obey it.
Strategic seams stay hidden on the map until the era's tech is known, exactly
as the original conceals them.

**Roads move armies.** Any unit marching onto a road pays half a move, so a
road net is a force multiplier for defence — and a tempting target for
raiders.

**AI.** Rival workers farm, mine and road toward their own unconnected seams;
their war ladders now field Legions and Chariot Archers when the land and the
era both allow it. The witness commits the player economy-first (Pottery →
The Wheel → arms), trains a labourer and works the capital ring, so the attract
demo shows Stage 4 by itself.

**Determinism.** Improvements, roads, in-progress builds, resource ownership and
each civ's connected set all fold into `stateHash`; same-seed replays stay
hash-for-hash (§2), and the autopilot still wins the shipped scenarios (§8,
now turn 15–17 — the farms pay for the labourer).

## Controls

Click/tap a tile to move; a hostile hex to strike. Keys: Space/Enter end turn ·
E settle · 1/2/3 warrior/archer/settler · 4 worker · C catapult ·
**W** opens/closes the WORK panel · F farm · M mine · O road ·
**T** research panel · **R** next tech · arrows orbit/tilt · wheel/pinch zoom ·
`?` help. `VirtualControls`: A = END TURN, B = settle.

## Verify

```bash
npm run civcheck          # 185 Node checks: boot, determinism, founding, economy, combat, barbarians,
                          # cities, production, tech (§16-18), improvement gates (§19), build turns +
                          # yields + roads + pillage (§20), resources reveal/connect/pay (§21),
                          # resource-gated units + end-to-end labour (§22), win/loss/slack
npm run civplay           # Chrome, real keys: panel W/F/O, worker trains and builds, 0 errors
npm run lint:civ          # eslint gate for the game + its scripts
```

`civplay` needs `npm run dev`; against headless IPv4 use
`CIV_URL=http://127.0.0.1:<port>/retrogames/civilization-v npm run civplay`.

**Mutant proofs.**
1. In `sim.js` `connectedResources`, replace the network walk with "every tile
   counts" (`for (let i = 0; ...)`) → §21/§22 go red (179/185); restore = 185.
2. Carried from Stage 3: the queue gate mutant still reds §17.

## Honest gaps (stage boundaries — later stages close these)

- **Luxuries pay gold, not happiness.** Unhappiness and the happiness-balanced
  border come in Stage 5 with policies.
- **8 resource types, 3 improvements.** Pasture/Landing Site/quarries and the
  full Civ V resource board grow with the later eras.
- **Connection is land-linked** (borders or roads); Civ V's strict
  road-only connection plus trade-unit convoys is a later refinement.
- Workers are not captured, improvements cannot be repaired automatically, and
  roads do not speed AI pathing (only the player's move cost halves).
- Still no buildings/city screen, no great people, no diplomatic victories.

These are intentional stage cuts, not omissions of promised Stage-4 behaviour.
