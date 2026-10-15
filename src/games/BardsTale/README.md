# THE BARD'S TALE

The 1985 first-person RPG, rebuilt whole in code for the arcade. Six heroes walk
out of Skara Brae and down through five seeded dark levels to Mangar's throne.

## Layout

- `sim.js` — the pure heart: state + a discrete command → new state + events.
  No `Math.random`, no clock. Town/dungeon/combat/menu modes, round-based combat
  at range bands, spells, songs, shops, treasure, the tower gate, the win, plus
  `stateHash` and `cloneState` for the harness and the DebugKit prognosis.
- `dungeons.js` — world data + seeded generators. Skara Brae is hand-authored;
  the five depths are mulberry32 mazes (braid / rooms / spiral) with a palette,
  monster table, supplies, ambushes, a strong monster, and — from the catacombs
  down — a locked door.
- `solver.js` — the autopilot. BFS walk, ranged-combat doctrine, town economy
  between dives, and the ascend-after-clear rule. The attract demo and the CI
  witness run this exact code.
- `art.js` — the painter. Coloured raycast corridors (DDA, shaded per palette),
  an overhead town, a fog automap, and animated procedural monster portraits sized
  by range band. No images.
- `sound.js` — maps every meaningful sim event to a synthesized tone through the
  shared `AudioController`.
- `index.jsx` — the arcade shell: fixed-timestep loop, keyboard + clickable HUD,
  attract/pause/over, the DEV hook (`window.__bardsTest`) and DebugKit.

## The locked door is a real chokepoint

From the catacombs down a floor is **locked**: the generator carves a sealed keep
around the goal (the strong monster and the stairs), walls the whole ring, and
reopens exactly one door cell that connects entrance→goal when open and
disconnects them when barred. The key hides outside the keep, reachable while the
door is shut. `bardscheck` re-proves this with its own BFS — a braid loop that
leaks past the door turns the audit red.

## Range bands

Monsters stand at 10/20/30/40 ft (bands 1–4). Steel needs band 1 (`advance`);
the Hunter's bow reaches any band; spells ignore range. Monsters close each round
unless a Lullaby slows them.

## Economy

The Review Board grants the **tower key** only once every one of the five tower
floors is proven (`floorsDone[0..4]`). The gate to Mangar's tower refuses
everyone else. Between dives the town heals/raises (Temple), arms (Garth's),
supplies ale (Tavern), and spends skill points (Board).

## Commands

`left right fwd back use wait potion` · `song:<id>` · `cast:<CODE>` · combat
`attack advance retreat flee target+ target-` · menus `m0`..`m5`.

## Gates

```bash
npm run lint:bards      # eslint, scoped to this game + scripts/lib
npm run bardscheck      # no-random · floor audit · engine pins · proven win ·
                        # slack rule · determinism   (all in Node)
npm run bardsplay       # advisory browser smoke (needs `npm run dev`)
```

`bardscheck` proves the campaign winnable on the live sim and re-proves it
**with the slack rule**: one fewer starting ale, one fewer starting potion, and
both reduced together still reach Mangar and thaw Skara Brae. Two identical runs
produce identical `stateHash`.
