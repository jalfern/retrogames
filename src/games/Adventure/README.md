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
npm run adventurecheck          # 163 gates: determinism, gate/key/bridge/dragon law,
                                # placed-bridge law, gray dot + sealed-door rite, magnet
                                # attract, dragon respawn, variants, gate-rite affordance,
                                # juice signals, scripted chalice win on 10 seeds, static wiring
npm run adventurecheck -- --mutant   # +42 mutants — every one must turn the suite red
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
- The drop-the-key gate rite keeps no written manual. A first-timer probe
  (#1568: 200 novice seeds x 5000 ticks, seeded random-walk in Node):
  56/200 seeds pick up the gold key, but **0/200 open any castle gate** and
  **0/200 open the secret rite**. The #1572 feel pass added a visible
  threshold mat that glints while the matching key is carried at the gate
  (see Restored below) — teaching where the drop counts; actually performing
  the rite is still the player's discovery, and the secret rite stays
  Robinett's (no hint by design).
- No guidance surface. The original shipped a fold-out map and hint sheet (the
  manual was half the game); this port's only in-game text was `PauseOverlay`'s
  control list. First-timer metrics back the need: median 6/18 rooms seen,
  57.5% of seeds never pick up any item, 0% win. A "?"-tab hint page (castles,
  keys, the drop rite — not the secret) is honest help the original itself gave.
  Restored in the #1572 feel pass item 2 (see below).

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

### Restored in the #1572 feel pass

- The **gate-rite affordance**: a threshold mat sits below each closed
  portcullis (the `GATE_ZONE` in `sim.js` — the drop-the-key law's rect is
  now one shared constant for rule, hint and renderer). Quiet at rest
  (25% alpha of the castle's gate color); while the player stands at the
  threshold carrying the matching key it glints at 90% alpha with a
  blinking white tick — the drop that opens the gate is one Space away.
  The hint lives in the sim as `sim.afford` (the key id, or null), set
  purely from state — it feeds no rule and no dice, so replays are
  byte-identical — and rides in `state().afford` for the harness.

Gated in `adventurecheck`: seven affordance gates (fires only for the
matching key, only inside the zone, only while the gate is closed, silence
after the drop, the full walk-up→glint→open rite, determinism) plus four
mutants (glint removed, any-key fires, zone ignored, glint persists once
open).

- The **guidance tab** (item 2): `PauseOverlay` gained an optional second
  section — the fold-out hint sheet the original cart shipped. A game opts in
  by registering a `guide:` array in `games.js` (a list of strings, or
  `{ color, text }` where color draws a swatch glyph); the guidance renders
  only when a game registers one, so every other game's help screen is
  unchanged. ADVENTURE's guide names the three castles and their matching key
  colors (with gold/black/white swatches), the drop-the-key rite, the
  bridge-over-walls law and the magnet — and deliberately says nothing about
  the gray-dot secret, which stays Robinett's discovery. It rides the existing
  `packPages` pager, so it fits a phone.

Gated in `adventurecheck`: nine guidance gates (the ADVENTURE registry entry
carries a `guide`, names the three castle/key colors, teaches the drop rite,
states the bridge and magnet laws, leaks no secret, and the shared
`PauseOverlay` gates the tab on `game?.guide?.length`) plus four mutants
(drop rite removed, magnet law removed, secret leaked, tab shown for every
game).

### Restored in the #1588 juice pass

The look/juice half of the #1572 polish list (item 4), spun to its own issue.
Three mid-game effects, all pure output computed in the sim from state + tick
(never `rand`) so a pinned seed still replays byte-identical and `stateHash`
(which ignores the new signals) stays a gameplay fingerprint:

- **Dragon maws chew.** While a live dragon hunts with its bite-maw open
  (`sim.chew`), the jaws alternate open/closed on `CHEW_TICKS` — a 2-frame
  chew, not a frozen grin. A calm/distant dragon keeps the closed head; a slain
  dragon keeps its mouth shut.
- **The chalice sparkles in hand.** `sim.sparkle` (true only while the chalice
  is carried) drives a white/yellow star glint on the carried cup — the goal
  item reads as the prize. A dropped chalice, or any other item, stays quiet.
- **Rooms cut with a flash.** The cart redraws each new room hard; crossing a
  doorway now sweeps a bright band top-to-bottom, fading over `ROOM_WIPE_TICKS`
  (`sim.wipe`, armed the instant the room actually changes, never in attract).
  The phase is tick-driven, so screenshots and replays stay stable.

`CHEW_TICKS` / `ROOM_WIPE_TICKS` are exported from `sim.js` as the one source
of truth the renderer reads, so the animation and the harness cannot drift. All
three colours come from the existing 1993 palette (`COLORS.white`/`yellow`) — no
new hues. Gated in `adventurecheck`: twenty-one juice gates (fourteen
sim-behaviour gates — each fires only in its own state: no chew with nothing
hunting, no chew on a corpse, sparkle only for the carried chalice, wipe only
after a real room change and only inside its window, the timeline deterministic
and non-vacuous — plus seven static renderer/palette gates) and nine mutants
(each juice signal removed, made unconditional, or ignored by the renderer — all
turn the suite red).

The boredomaudit/juiceaudit number for `adventure` moves with this (the audit
measures on-screen change through the contract canvas); regenerating the board
is advisory and needs headless Chrome (#737), so the Node gates above are the
merge bar for this change.

## #1845 — the watch seat speaks (#1637 polish)

Y seats the guide with the shared blip (utils/watch.js, one voice in every
pilot — untouched). Stacked after it, the cart's own voice names WHICH driver
took the wheel: V1/V2 sing the fixed-map script note (587 Hz), V3 re-homes
loot so its adaptive route answers at 880 Hz. `watchVoice(sim)` in route.js
branches on the same `sim.variant >= 3` law as `makeRoute` — one brain, two
voices (watchcheck pins the identity; a fork turns V3 red live). Receipts land
in `__advTest.watchVoiceLog()`. When the guide runs out of proven road mid-run
(`r.done` while the run lives on), the canvas now says "NO ROUTE FROM HERE"
for ~1.5s in attract-green — the blip alone was trivia, the words are the
lesson. A run that won or died stays silent (batch-13 suppression law), every
new run clears the lesson; `__advTest.declineMsg()` makes it harness-visible.

## #2255 — two-way doors, stacked gaps, and the key answers the gate (QA pass)

A cold first playthrough (browser, screen-only) confirmed two geometry bugs
and one fidelity gap:

- **Bottom exits did not line up with top exits.** `makeWalls` pushed the
  second bottom-wall segment at `x: 0` instead of `gapL + gapW`, so the bottom
  opening was x 60–160 while the top gap sat at x 60–100 — rooms never
  stacked, and walking straight down landed you beside the next room's top
  gap. One-char-class fix; the gap column is now the same on both sides.
- **One-way doors.** Four rooms declared an EXITS edge on a side their wall
  bricked: OVERWORLD_4.left, OVERWORLD_5.right, BLUE_LAB_1.right (the OW5
  entrance), and SECRET.right — the gap was carved on the WRONG side (left),
  making the easter-egg room a one-way trap. Walking into the neighbour worked
  because the *neighbour's* side was open; walking back collided before the
  transition could fire. All four sides are open now. (Black Foyer's solid
  floor is NOT this bug — that's the by-design bridge door, #1551.)
- **The portcullis answers a carried key.** The 1993 cart raises the gate the
  moment the dot touches it WITH the matching key in hand; the port asked for
  a drop (Space) the original never did. `sim` now opens the gate on
  carried-key contact inside `GATE_ZONE` (key stays in hand), computed after
  the affordance so the mat still gets its teaching glint — dropping the key
  in the zone remains a valid rite. Guide text updated to state the law.

DEFERRED from #2255 (noted honestly): the report's items 4–5 (flat gold start
screen, HUD text over exits/footer) are art/HUD work; the bat-in-game-1
fidelity claim could not be verified against the original's scenario table in
the time box, and removing the bat from V1 would re-pin every determinism
digest — left as-is with the claim parked on the issue.

Gated in `adventurecheck`: nineteen #2255 gates — the no-one-way-doors graph
scan (every declared exit has an open side, Black Foyer exempt as the bridge
door), the top/bottom gap-column equality scan, four walk-the-door round trips
through real transitions (OW1↔OW2 vertical, OW2↔OW4, OW5↔lab1, lair↔???
after the rite), and the carried-key law (opens without a drop, key stays in
hand, walk-through into the foyer, wrong key stays shut) — plus six mutants
(gap x regression, OW4/OW5/SECRET sides re-bricked, lab1 door lost, carried
key ignored).
