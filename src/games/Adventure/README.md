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
- Bridge law (#1551): crossing a solid wall *with* the bridge **places it on
  that wall** (`placeBridgeAt`) — the hands are empty again, the bridge stays
  on the wall side (re-pickable), and the crossing is recorded in
  `sim.bridged` as passable for the rest of the run, both directions. The
  original's one bridge works this way: it stays where it is set and keeps
  the gap crossed, so it can never strand itself past the wall it made.
- Secret door (#1551): the Dragon Lair ↔ ??? gap is a sealed barrier
  (`sim.secretOpen`) until the dot rite: carry the gray dot to the door end
  (`x<24`) with two or more other objects lying in the room → the barrier
  opens for the run and the `secret` event fires. The ??? room shows
  "Created by Warren Robinett" in continuously changing colors.

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

The original cart has **no score counter**; nothing about the score appears
on-screen. The production report's `score` is a report-only progress metric
— **distinct items picked up this run (0..8, the 8th being the gray dot)** —
so a filed feedback report can pinpoint a run (Britannia's moons-visited
precedent, #1473). A full win scores 4 (bridge, black key, white key,
chalice).

## Harness

```bash
npm run adventurecheck          # 59 gates: determinism, gate/key/bridge/dragon law,
                                # placed-bridge law, gray dot + sealed-door rite,
                                # magnet attract, dragon respawn, scripted chalice
                                # win on 10 seeds, static wiring
npm run adventurecheck -- --mutant   # +14 mutants — every one must turn the suite red
npm run lint:adventure
```

`feedbackcheck` polices the seed-pin law repo-wide (floor 53 after this
batch). The scripted route lives in `adventurecheck.mjs` and wins at tick
1721 for every seed (dice move only dragons/bats, which the route outruns).

## Honest gaps (vs the original)

- Collisions ignore exact room-warp edges (dragons never follow between rooms).
- The original duplicates the **chalice** (a second one sits in its Blue
  Castle); this 18-room port keeps a single chalice and no Blue Castle. Note
  the #1545 gap list's "two bridges" was a misremembering — the original has
  ONE bridge (cartridge record, verified 2026-11); its duplication is the
  chalice, not the bridge.
- The original is a silent cart; the #1545 "pen-shaped dragon sounds" item has
  no documented counterpart to restore. New sim events (`bridge`, `secret`)
  carry synthesized audio where the port adds meaning (placement, door rite).
- No variant selector. The original cart opens on a "SELECT GAME" dot-matrix
  screen with 30+ numbered variants (item placement, dragon speed, difficulty);
  this port ships exactly ONE fixed ruleset — no variant knob exists in
  `attract.js`, `index.jsx` or `sim.js` (grep-verified #1568). A variant table
  (at least slow/fast dragons + seeded-layout shuffle) is owed.
- The drop-the-key gate rite has zero discoverability. A first-timer probe
  (#1568: 200 novice seeds x 5000 ticks, seeded random-walk in Node):
  56/200 seeds pick up the gold key, but **0/200 open any castle gate** and
  **0/200 open the secret rite** — nothing distinguishes "drop the key inside
  the gate zone" (`sim.js` gate law: `!key.carried`, y<60, x∈(40,120)) from a
  dead drop. The pad's only verb is a generic drop; the zone is invisible.
  A visual affordance at gate thresholds (a mat, a glint) is the owed fix.
- No guidance surface. The original shipped a fold-out map and hint sheet (the
  manual was half the game); this port's only in-game text is `PauseOverlay`'s
  control list. First-timer metrics back the need: median 6/18 rooms seen,
  57.5% of seeds never pick up any item, 0% win. A "?"-tab hint page (castles,
  keys, the drop rite — not the secret) is honest help the original itself gave.

### Restored in the #1545 polish pass

- The magnet **attracts** nearby loose items toward the player while carried
  (was decoration you could carry) — `MAGNET_RANGE` / `MAGNET_PULL` in `sim.js`.
- A slain dragon **respawns** to its lair after a delay (was dead for the whole
  run) — `DRAGON_RESPAWN_TICKS` in `sim.js`.

Both are gated in `adventurecheck` (a gate each, plus a mutant that re-removes
the behavior and must turn the suite red). The scripted chalice route is
unaffected: it never carries the sword (no slays → no respawns) nor the magnet.

### Restored in the #1551 polish pass

- The bridge is **placed, not consumed**: crossing a wall with it leaves it on
  the wall it spans, the crossing stays open for the run, and the bridge is
  re-pickable from the wall (the original bridge law — the single bridge can
  no longer strand itself past the Red Maze floor).
- The **secret-room easter egg**: the one-pixel gray dot sealed along the
  south wall of the Red Maze (the bridge-only room — the original's sealed
  catacombs chamber), invisible outside the Red Maze and not
  magnet-attracted. The dot + two or more other objects at the sealed door
  (Dragon Lair left wall) opens the barrier — the original's rite — and
  reveals the creator's room: "Created by Warren Robinett" in continuously
  changing colors. New sim events `bridge` (placement) and `secret` (door
  opens) drive `audioController` in `index.jsx`.

Gated in `adventurecheck`: five placed-bridge gates and nine dot/door gates,
plus five mutants (stranded bridge, magnet-on-dot, rite threshold, removed
barrier, visible dot).
