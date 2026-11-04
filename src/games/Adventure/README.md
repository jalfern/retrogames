# ADVENTURE — engine notes

Atari 2600 cartridge (Warren Robinett, 1993): 18 connected rooms, three
color-coded castles with portcullis gates, blue/red labyrinths, three
dragons, an item-swapping bat, and the quest — carry the chalice to the
Gold Castle.

## Engine

- `sim.js` — the whole simulation, pure and seeded (#1473 batch 18). One
  mulberry32 stream (`seedRng(seed)` injected by the shell) drives every
  gameplay dice roll: dragon wander, bat course-change. The shell regenerates
  it at **every human start**, honoring `?seed=N` (`seedFromQuery()`), so a
  filed seed replays the exact world. Attract-mode wander runs on its own
  fixed stream (`seedRng(1979)` in `index.jsx`) — pre-start draws never
  consume the pinned stream.
- `index.jsx` — drawing (160×192 world, `imageSmoothingEnabled` off by the
  pixel look), input, sound (events raised by the sim: pickup/gate/slay/
  death/steal/win → `audioController`), attract overlay, terminals.
- Gates: drop the matching key in front of a gate (its room, `y<60`,
  `x∈(40,120)`) and it opens for the whole run. The bridge passes walls:
  while carried, movement adds `d×0.3` *after* collision — enough to leak
  through the black foyer's stone floor into the Red Maze.

### The b18 restoration — openable gates

The Feb shell gave the castle exteriors `makeWalls(false, …)` — a
**full-width solid top wall** — and then added the gate rect as *extra*
collision. Opening a gate could therefore never let anyone in: the foyers
(Gold Foyer, Black Foyer, Red Maze access) were permanently locked, and the
room-level reachability BFS proves the chalice could not come home (one
bridge, three wall crossings needing it). Fixed per the port's own comment
("Gate blocks the top opening"): gate rooms now have a normal top GAP and
the gate rect blocks it while closed. A pinned-key gate is the only way
through (the pre-port clamp at `y<0` for gate rooms stands).

## Score honesty

The 1993 cart has **no score counter**; nothing about the score appears
on-screen. The production report's `score` is a report-only progress metric
— **distinct items picked up this run (0..7)** — so a filed feedback report
can pinpoint a run (Britannia's moons-visited precedent, #1473). A full win
scores 4 (bridge, black key, white key, chalice).

## Harness

```bash
npm run adventurecheck          # 45 gates: determinism, gate/key/bridge/dragon law,
                                # magnet attract, dragon respawn, scripted chalice
                                # win on 10 seeds, static wiring
npm run adventurecheck -- --mutant   # +9 mutants — every one must turn the suite red
npm run lint:adventure
```

`feedbackcheck` polices the seed-pin law repo-wide (floor 53 after this
batch). The scripted route lives in `adventurecheck.mjs` and wins at tick
1721 for every seed (dice move only dragons/bats, which the route outruns).

## Honest gaps (vs the original)

- One bridge, not two — the original had a second one; the single bridge is
  enough now that gates open properly, but it can only be placed once.
- No pen-shaped dragon sounds, no dot reward in the secret room (the room
  exists, its easter egg does not).
- Collisions ignore exact room-warp edges (dragons never follow between rooms).

### Restored in the #1545 polish pass

- The magnet **attracts** nearby loose items toward the player while carried
  (was decoration you could carry) — `MAGNET_RANGE` / `MAGNET_PULL` in `sim.js`.
- A slain dragon **respawns** to its lair after a delay (was dead for the whole
  run) — `DRAGON_RESPAWN_TICKS` in `sim.js`.

Both are gated in `adventurecheck` (a gate each, plus a mutant that re-removes
the behavior and must turn the suite red). The scripted chalice route is
unaffected: it never carries the sword (no slays → no respawns) nor the magnet.
