# ADVENTURE — engine notes

Atari 2600 cartridge (Warren Robinett, 1993): 19 connected rooms, three
color-coded castles with portcullis gates plus an open Blue keep, blue/red
labyrinths, three dragons, an item-swapping bat, and the quest — carry the
chalice (either of the cart's two) to the Gold Castle.

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
chalice). #3482: the world holds 9 item *instances* but the duplicate chalice
shares its twin's KIND — carrying both cups is still one distinct item, the
ceiling stays 8.

## Harness

```bash
npm run adventurecheck          # 223 gates: determinism, gate/key/bridge/dragon law,
                                # placed-bridge law, gray dot + sealed-door rite, magnet
                                # attract, dragon respawn, variants, gate-rite affordance,
                                # juice signals, seam law (#3441) + exact sprite-box
                                # admission (#3552), Blue Castle + duplicate
                                # chalice (#3482), scripted chalice win on
                                # 10 seeds, static wiring
npm run adventurecheck -- --mutant   # +60 mutants — every one must turn the suite red
npm run lint:adventure
```

`feedbackcheck` polices the seed-pin law repo-wide (floor 53 after this
batch). The scripted route lives in `adventurecheck.mjs` and wins at tick
1721 for every seed (dice move only dragons/bats, which the route outruns).

## Honest gaps (vs the original)

- **CLOSED by #3441, box tightened by #3552:** collisions ignored exact
  room-warp edges — dragons never followed between rooms. The seam law now runs:
  a living, jaw-open dragon whose `DRAGON_BOX` body rect genuinely overlaps the
  doorway rect (gap span 60–100 vertical / 70–120 side) warps through with the
  dot at the mirror entry, so the chase — bite *and* sword-turn — is judged
  inside the new room (see "#3552 — exact sprite-rect admission at the seam"
  below; #3552 replaced the anchor ± `DRAGON_FOLLOW_SLACK` band with the
  hardware-overlap law the 2600 enforced). (The wanderer half CLOSED by
  **#3489** — idle dragons hold a seeded heading and cross seams through open
  doorways on their own.)
- The original duplicates the **chalice** (a second one sits in its Blue
  Castle); this 18-room port keeps a single chalice and no Blue Castle. Note
  the #1545 gap list's "two bridges" was a misremembering — the original has
  ONE bridge (cartridge record, verified 2026-11); its duplication is the
  chalice, not the bridge. **CLOSED by #3482** — see "Restored in #3482".
- **DISCLAIMER** (audited #3552): the original is a silent cart; the #1545
  "pen-shaped dragon sounds" item has no documented counterpart to restore.
  All eight sim event kinds (nine push sites: pickup, gate ×2, slay, death,
  steal, bridge, secret, win) already carry synthesized audio in `index.jsx` —
  the bullet sat in Honest gaps as a note, not owed work. New sim events
  (`bridge`, `secret`) carry synthesized audio where the port adds meaning
  (placement, door rite).
- **CLOSED by #1572 — retro-marked in #3552:** the original cart opens on a
  "SELECT GAME" dot-matrix screen with 30+ numbered variants (item placement,
  dragon speed, difficulty). The line was grep-verified at #1568 but predates
  its own fix: `VARIANTS` (V1 CLASSIC / V2 FAST / V3 SHUFFLE) and
  `DEFAULT_VARIANT` live in `sim.js`; the dot-matrix SELECT GAME page, the
  arrow pick and the `?variant=N` pin live in `attract.js`/`index.jsx`.
- **CLOSED by #3766 — audit:** the drop-the-key gate rite keeps no written
  manual. A first-timer probe
  (#1568: 200 novice seeds x 5000 ticks, seeded random-walk in Node):
  56/200 seeds pick up the gold key, but **0/200 open any castle gate** and
  **0/200 open the secret rite**. The #1572 feel pass added a visible
  threshold mat that glints while the matching key is carried at the gate
  (see Restored below) — teaching where the drop counts; actually performing
  the rite is still the player's discovery, and the secret rite stays
  Robinett's (no hint by design). The claim was stale as written: the SAME
  #1572 pass shipped its item 2 — the guidance tab (registered `guide:` in
  `games.js`) names the three castles and their key colors and states the
  drop-the-key law ("Walk its matching key up to a gate and it rises — or
  drop the key in front (Space)"), pinned by nine `adventurecheck` guidance
  gates (incl. "teaches the drop rite" and a drop-rite-removed mutant). The
  rite HAS a written manual on the shelf; #1568 measured the pre-#1572 cart.
- **CLOSED by #1572 — retro-marked in #3552:** no guidance surface. The
  original shipped a fold-out map and hint sheet (the manual was half the game);
  this port's only in-game text was `PauseOverlay`'s
  control list. First-timer metrics back the need: median 6/18 rooms seen,
  57.5% of seeds never pick up any item, 0% win. A "?"-tab hint page (castles,
  keys, the drop rite — not the secret) is honest help the original itself gave.
  Restored in the #1572 feel pass item 2 (see below).

## Restored in the #1545 polish pass

- The magnet **attracts** nearby loose items toward the player while carried
  (was decoration you could carry) — `MAGNET_RANGE` / `MAGNET_PULL` in `sim.js`.
- A slain dragon **respawns** to its lair after a delay (was dead for the whole
  run) — `DRAGON_RESPAWN_TICKS` in `sim.js`.

Both are gated in `adventurecheck` (a gate each, plus a mutant that re-removes
the behavior and must turn the suite red). The scripted chalice route is
unaffected: it never carries the sword (no slays → no respawns) nor the magnet.

## Restored in the #1551 polish pass

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

## Restored in the #1572 feel pass

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

## Restored in the #1588 juice pass

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

## #3441 — dragons follow through the door (room-warp seam law)

Rooms are the dot's cage, not the dragons'. The 1979 chase never skidded to a
halt at the room line: run through a doorway with a dragon at your heels and it
comes through with you, the bite landing inside the new room. The Feb shell pinned
dragons with `clamp(10, GW−20)` and a wander branch that could not change room, so
doors were hard walls for them.

The law (`sim.js`, arithmetic only — **no dice**): when `tryTransition` warps the
dot A→B, every living dragon left in A that is *hunting* (`mouthOpen` — the port's
own <30 px jaw law, so idle wanderers never self-leave a room) and *aligned* on
the doorway (vertical warp: anchor x inside the shared gap column 60–100 ±
`DRAGON_FOLLOW_SLACK`; horizontal warp: anchor y inside the side-gap band 70–120 ±
slack — #2255 aligned every seam column, so the seam the dot used is the
follower's door too) enters B at the mirror entry: `y = GH−20` after an up-warp,
`y = 10` after down, `x = GW−20`/`10` for left/right, parallel axis preserved.
(*#3552 superseded the alignment clause with exact sprite-rect admission — see
"#3552 — exact sprite-rect admission at the seam"; the mirror-entry law stands.*)

**Why passability needs no re-check:** the dot just crossed that seam, and every
barrier this port owns — portcullis, sealed secret door, stone floor — opens for
the *run*, not the tick. A seam crossed once is crossable by the follower in the
same instant (the foyer case is a gate, and gates answer open when the dot gets
through them).

Same-tick consequences, and they are the fun part: dragon AI runs after the
transition, so a follower lands at your heels and `dist < 8 && mouthOpen` bites
the tick you both arrive — too slow through the door is a death *in the new room*
— while the #1545 sword law turns the follow into a slay (`dist < 14`) the moment
you face it. Multi-dragon rooms become reachable for the first time (a follower
visiting a resident), the original's signature chaos with no new entity kinds.

Determinism note: seed replay stays self-consistent, but dice timing shifts where
a followed dragon takes the chase branch (0 draws) instead of wander (2) — every
digest, scripted-win and terminal gate re-ran green unchanged, and the playtest's
skilled-route win rate with the law live is 98% (failures are the pre-existing
"no bridge" class only).

Gated in `adventurecheck`: ten #3441 gates — a real-walk repro (start at
Rhindle's jaw in the lair, run up: OW5 room change, Rhindle at `GH−20`, heels
bite), a no-dice hash pair, misalignment stays (12 px past the column), jaw-shut
stays, a left-warp mirror into lab1 with y preserved, the sword-turn slay after
a follow, and the raised-portcullis foyer follow — plus three mutants (alignment
deleted, jaw-shut follow, deep landing).

## #3482 — the Blue Castle and the duplicate chalice (never-dry stage)

The cart duplicates the enchanted grail: a second chalice sits in the **Blue
Castle**, an open keep (no portcullis, no foyer) that this port never had. It
ships now:

- **Room 19 — Blue Castle**: hung east of Blue Labyrinth 2 (the cart parks the
  keep beside the blue catacombs). Every side bricked except the west door at
  the standard side gap; LAB_2's east pocket (past the x90 pillar, down the
  x141–156 column) keeps the gap lane walkable both ways (#2255 reciprocity —
  the two-way door gate covers the new seam).
- **The duplicate (`chalice2`)**: same item, same laws — magnet attracts it,
  the bat can steal it, it sparkles in hand, dragons guard it by the seam law,
  and delivering **either** cup to the Gold Castle wins (the cart's duplication
  law: both are the Grail).
- **Pinned, not shuffled**: the cartridge record sits it in the keep, so the
  V3 shuffle neither re-homes it (`pin`, zero dice) nor deals the keep out to
  anything else. Pinned on 20/20 seeds.
- **Score honesty unchanged**: score counts distinct KINDS — both chalices are
  `chalice`, so the ceiling stays 8 and the winning route still scores exactly
  4 (bridge, black key, white key, one cup).
- **Guidance**: the `?` tab names the Blue Castle and the either-cup law (the
  gray-dot secret still stays Robinett's).

Gated in `adventurecheck`: seventeen #3482 gates — instance count, the
duplicate sits home on a fresh run, open-keep structure, west
door two-way, BFS there and home, pin-through-shuffle (20 seeds), keep never
dealt out, duplicate wins / magnet does not, kind-honest score (both cups, one
point), sparkle on either cup, seam-follow through the new door — plus five
mutants (duplicate loses the win, pin ignored, keep bricked, score counts
instances, duplicate loses its glint).

## #3489 — dragons roam, and the guide learns to wait (polish pass)

The cart's dragons own the whole world; until now these only hunted the room
they guard. `sim.js` adds the roam law: an idle (non-hunting, jaw-shut) dragon
holds a seeded heading on the #1560 course-change rhythm, drifts at half hunt
pace (`ROAM_SCALE`), and crosses room seams **through open doorways only**
(`SEAM_CHANCE` at the edge, mirrors of the player's barrier law — closed gates
and the sealed secret door stay sealed for dragons too). Constants exported:
`WANDER_REROLL / ROAM_SCALE / SEAM_CHANCE / DRAGON_BOX`. Barrier audit: 40
seeds × full quest, 0 breaches; replays byte-equal; mirror entries match #3441.

`route.js` mobility v3 — with roam, the waypoint script can be pushed off its
road, so the planner answers the world instead of the map:

- **arm-first** — goldKey → Gold Castle → sword is the cart's own opening;
  Yorgle flees the gold key by his own law, so the corridor becomes prey and
  most door-waits vanish.
- **calm-entry** — never step onto a resident without the blade; wait at the
  doorstep for the far side to empty.
- **window-pin EVICT** — collision jitter lies to per-tick pin checks; the
  guide now evicts on a 24-tick no-progress window toward the nearest calm door.
- **decoy post** — the bat's swap law is room-bound (it takes a loose item it
  bumps *inside the player's room*), so chasing its pixel is wasted motion:
  march to the bat's room (or its calm doorstep), plant spare currency on open
  floor, and let dwell-time do the trade. The haul lands where the decoy lay.
  Currency is filtered — a key spends only after its gate is already open.
- **shared wait-credit** — every world-wait (guard cycle, trade burst, theft
  recovery) draws from ONE pool per drive (`CREDIT`, 30k) instead of fresh caps
  per attempt: a hoarding bat can no longer burn the whole 60k budget in ten
  stacked waits. Lives beside the sim in a WeakMap — the guide still emits
  inputs only.
- **either cup** — #3482's duplicate made two cups win; `fetchGrail` now
  fetches the nearer one and never trades a cup away to re-fetch its twin.
- **edge-drop safety** — a drop on a door threshold spawned items INSIDE the
  wall band (y=194 on a 192-tall room — dead keys, dead quests, seeds 6/8 V1);
  the guide releases only on open floor.

Gated in `adventurecheck`: V1/V2/V3 route wins 10/10 (was 8/10 on V1), zero
deaths on the pinned 30, seed 6 still recovers late (>2.2k), determinism and
the inputs-only law untouched; mutants (wait-credit starved to 1 tick) turn
four gates red.

Honest gaps from this pass: on seeds OUTSIDE the pinned contract (11–30 spot
probe) the bridge fetch still loses ~10% of runs to a bat that camps the haul
behind den doors (why `bridge`/`red floor`); and roam uses the cart's own dice
stream, so adding roam re-pinned every replay hash.

## #3524 — roam-era polish round 2 (bat dens, patient decoy)

- **Locked rooms out of the shuffle pool** — seeds 21/22 dealt the BRIDGE
  itself into Red Maze 1 (reachable only WITH the bridge → dead quest).
- **Patient currency** — a planted bait IS the trade: a round that finds its
  own decoy still on the floor skips the errand and re-sits the wait instead
  of abandoning the plant exactly when a den-camped bat comes out.
- **One bait per post** — a spare lying on OPEN floor at the post suppresses
  a second plant; spares inside wall bands are junk, not bait (a bridge
  ghost once blocked every plant).
- **Swap-timing grab** — the tick the bat swaps, empty the hand and drive
  onto the freed cell: swapTimer=180 is the whole window before the
  re-steal, so never march cross-map to a stale room entry.
- **Armed wait** — the decoy wait watches the BAT and the BAIT, never the
  hand: an armed guide standing beside a live decoy with the bat IN the room
  holds the wait (the old stray-break died on tick 1, 16 rounds straight,
  seed 2 V3, with the bat sitting swap-ready), while an absent bat keeps
  the instant break (the broad form regressed seed 4 by 12k ticks sitting
  waits at empty posts).

Gated in `adventurecheck` 212/0 (route wins V1/V2/V3 10/10). Left open by
design: the wanderer-heading look (still the plain dot) rides a follow-up.

## #3552 — exact sprite-rect admission at the seam (never-dry stage)

The honest remainder of #3441, named by that pass itself: *"the follow box is
anchor-based, not the original's exact sprite-rect overlap."* `seamFollow`
admitted any hunter whose 10 px **anchor** sat in gap ± `DRAGON_FOLLOW_SLACK`
— top/bottom gap 60–100 admitted anchors 50–110, so a dragon whose body
(10×10) stood entirely beside the opening (anchor 100–110 = rect 110–120)
phase-followed through solid stone. The 2600 knew only hardware sprite-rect
overlap, and this port already owns `rectsOverlap` for every other contact —
the seam was the one place a body could pass through a wall.

The law (`sim.js`, arithmetic only — still no dice): a hunting, living dragon
left in room A follows the dot A→B iff its `DRAGON_BOX` rect genuinely
**overlaps** the doorway rect of the seam used — `d.x ∈ (GAP_L−BOX, GAP_L+GAP_W)`
vertical (exactly `(50,100)`), `d.y ∈ (SIDE_GAP_Y−BOX, SIDE_GAP_Y+SIDE_GAP_H)`
side (exactly `(60,120)`). Mirror entry, parallel-axis preservation and the
jaw gate are untouched. `DRAGON_FOLLOW_SLACK` is deleted — nothing else read it.

**Honest measurement:** the outcome-relevant difference from the slack era is
exactly one 10-px band per axis (anchors 100–110 / 120–130 — the left/top edges
differ only at a corner touch, and dragons take a wander step before admission,
so a single-pixel edge is not honestly testable). Two leak pins (anchor 105 and
125 must NOT follow), one mirror-entry pin, and four over-tightening guards
(anchors 95/52/115/62 must still follow) ride the seam on both axes.
A slack-regression mutant (`exact admission → anchor±10`) dies on the leak pins,
and the alignment-deletion mutant still pours the room through the door.

**README hygiene (why-weakest audit):** this stage was picked because ADVENTURE
scored weakest (13 = parseGaps count, zero open QA naming it) — but the score
was inflated by stale bullets: the variant-selector gap shipped in #1572
(SELECT GAME + `VARIANTS` exist), the silent-cart note was a note, and four
`### Restored in …` subsections sat **inside** `## Honest gaps`, so `parseGaps`
(parsed to the next `##`) counted nine restored features as open gaps. Fixed
here: the subsections are level-2 headings now, shipped notes carry CLOSED /
DISCLAIMER markers — the picker sees one real gap (the gate-rite manual, with
the 0/200 first-timer metrics) instead of thirteen. (That last gap CLOSED at
the #3766 audit above — the picker now sees none.)

Gated in `adventurecheck` 223/0 (+7 §3552 pins; route wins V1/V2/V3 10/10) and
`advedrive` 10/10 real Chrome. Left open: none — the drop-the-key gate rite
manual claim closed with the #3766 audit above (the guide tab shipped with
#1572); the gate-rite bullet was the last honest gap and is now marked CLOSED.
