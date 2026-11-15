# GARDEN GUARD

An original lane-defense game in the lineage of a certain 2009 lawn classic
(PC, PopCap) — but its own IP: an autumn orchard raided by goblin **GRUNCH**,
currency is **acorns**, defenders are critters, every sprite is drawn in code.

## Files
- `sim.js` — the pure, deterministic simulation (no DOM): grid, acorn economy,
  card cooldowns, defenders/enemies/projectiles, scarecrow-mowers, the wave
  machine, level progression + unlocks, the level-clear acorn shower (#2336
  `SHOWER`: seven fast-falling drops that all bank inside the ceremony window),
  the autopilot `bot`, and `stateHash`.
  Every random comes from one seed (`roll`/LCG); `Math.random()` is never used
  here, so the harness and the attract demo replay byte-identically.
- `art.js` — procedural look: gradient dusk sky, cottage + scarecrow-mowers
  (a real scarecrow per lane: gold glow while armed, grey and head-tilted once
  spent — #1832), checkerboard lawn with grain, the wooden card tray + acorn
  purse (inset right of the site's top-left chrome — #1832), **framed portrait
  plates on the cards** (#2328: each defender posed at card scale on a soil
  mound under its own dusk hue — treeline, low sun, drifting cloud — inside a
  beveled, riveted frame that gilds when selected; breathing on the sim clock,
  deterministic), per-defender and per-goblin sprites (walk/eat/slow animation),
  projectiles, particles hooks, cursor (the ghost defender only shows once the
  keyboard cursor is used — #1832), HUD (level + wave bar + five scarecrow pips,
  in the 28px strip BELOW the lawn so nothing paints over row 5 — #1832), and
   the **level-clear ceremony** (#2336: gold wash + sparkle rain + the new
   defender's portrait plate presented big and centre-lawn on a ribbon board).
- `index.jsx` — the arcade shell: one fixed-timestep loop, attract (driven by the
  sim's own `bot`), keyboard / pointer / VirtualControls all funneled through the
  same `drivePad` → sim actions, juice (particles + shake), PauseOverlay,
  `window.__gardenTest` DEV hooks and the `window.__game` contract.
- `sound.js` — the pure sound spine (#2336): the bed name and the win/lose sting
  mapping as data + a recorder-friendly `endCue`, so gardencheck §6 can prove
  both endings from real runs without a browser. The shell does the scheduling.

## Controls
- **Tap a card (or 1–6)** then **tap a tile** to plant. On the pad: arrows move
  the planter, ✿/SPACE plants or digs, ↻/B cycles the hand.
- Tap a falling acorn to bank it early, or let it settle and bank itself.
- **T / E** toggles the trowel — tap a plant to dig it back up.
- Each lane has a scarecrow-mower that fires once, then that gate holds or falls.

## Defenders (unlock order)
Daisy (economy) · Squirrel (shooter) · **L2** Hedgerow (wall) · **L3** Chili Bomb
(splash) · **L4** Frostcap (slow) · **L5** Pumpkin Catapult (lob).
Enemies: Grunt · Sprinter · Pup (swarm) · Brute · **Warlord** (final-wave boss).
Five levels; clearing one rains an acorn shower, dances a new-defender card on
the lawn (#2336), wipes, hands a sunlight cache, and unlocks the next defender;
the last ends with the Warlord.

## Verify
```bash
npm run gardencheck                 # pure Node: boot + core rules + winnable on 5 seeds
                                    # + the #1832 newcomer gates (refuse events, art contract)
                                    # + the #2328 card-portrait contract (8 gates)
                                    # + the #2336 sound spine (17 gates: bed pattern,
                                    #   win/lose sting mapping, recorder-driven real runs)
                                    # + the #2336 clear ceremony (12 gates: the acorn
                                    #   shower pays out inside the ~3s window, the look
                                    #   on the mock canvas, determinism, shell wiring)
                                    # + the #2336 goblin posture (9 gates: per-type
                                    #   silhouette proportions, ear poke, the streaming
                                    #   scarf, gait liveness, determinism)
npm run dev                        # then, another shell:
CONTRACT_ONLY=garden-guard npm run contractcheck   # window.__game contract, determinism
```
`gardencheck` proves it can fail: set `PLANTS.chili.radius` to `0` in `sim.js`
and the "Chili Bomb splashes a cluster" gate goes red (then restore). The #1832
art contract gates the same way: the HUD/tray/scarecrow/ghost assertions run
against a recording mock-canvas, so reverting any of the newcomer layout fixes
turns them red without a browser. The #2328 portrait contract is proved the
same way — rewiring the tray back to an icon stamp turns 6 of its 8 gates red
(layered fills, soil mound, rivets, double frame, gild, liveness).

## Newcomer pass (#1832)
A first-time player pass found: refused plants were silent (now a toast + buzz +
card shake — the sim emits `refuse` events from its single canonical plant path,
and the autopilot's pre-checks keep the attract demo silent), the planter's
ghost defender read as a broken plant (now hidden until the keyboard cursor is
used), site chrome sat on the playfield (the HUD moved into the strip below the
lawn, the tray inset right of the corner chrome, the attract WATCH button into
the flow so it can't cover the subtitle), the scarecrow-mowers read as porch
lamps (now real scarecrows, grey when spent, with five pips in the HUD), and
there was no in-play how-to (a first-wave hint line until the first plant).

## Honest gaps
- **No puzzle-slack solver.** This is a real-time strategy title, not a
  deterministic puzzle with a perfect solver, so FORGE's slack rule (re-solve
  every level with one fewer supply) does not apply — there is no closed-form
  solution to shrink. Winnability is instead proven by the depth-first autopilot
  clearing all five levels on five seeds.
- Sun drops auto-bank shortly after landing (tap to bank sooner). This is the
  mobile-friendly choice, and keeps the bot/harness able to drive the economy.
- Card art in the tray reuses the small defender icons; portrait frames are
  deliberately simple. **CLOSED by #2328** — cards are now posed portraits on
  soil under dusk skies, in beveled riveted frames (see `art.js`
  `drawCardPortrait`); the tray cards no longer call `drawPlantIcon`.

## Sound pass (#2336)
The polish report claimed `AudioController` was "never imported" — that part was
stale: per-action SFX landed with #1839. What the lawn genuinely lacked was a
**bed** and **end stings**. Now:
- `MUSIC.garden` — an original autumn-folk bed (G-major chord-tone skip over a
  boom-chick bass, composed for this build) starts with the lawn and stops at
  the finish and on unmount, so no other tab inherits it.
- Win → the fleet's `playFanfare`; lose → a four-note minor fall (330→165 Hz),
  lower and sadder than the breach sweep so defeat reads differently from a
  lost lane. The mapping lives in `sound.js` as data so gardencheck §6 drives a
  REAL won run and a REAL breached run through a recorder and counts the cues.
  Failure-proved: emptying the win mapping reddens two gates.

## Clear ceremony (#2336 gap 4)
A cleared level used to unlock quietly. Now the ~3.2s between `clear` and the
next raid is the dance moment: an acorn shower rains the lawn (7 fast drops,
each banking inside the window — `SHOWER` in `sim.js`), gold wash + sparkle rain
over the board, and the newly unlocked defender's portrait plate presented big
and centre-lawn on a gilded ribbon (`drawClearCeremony` in `art.js`, reusing
the #2328 plate so the presentation and the tray card are the same object).
The attract demo shows the ceremony when its autopilot clears a level.
Failure-proved: short-circuiting `drawClearCeremony` and dropping the `shower`
event reddens 4 of the 12 gates (shower fires, glitter, big card, final wash).

## Goblin posture (#2336 gap 5)
The five raiders used to be one round blob at five sizes. `art.js` now carries a
`POSE` table — per-type body proportions, head-set, leg stride/gait rate and ear
size, with the face (eyes/teeth/ears) hanging off the head-set so the pose
carries it: the **Grunt** stands upright (ry>rx), the **Sprinter** runs low and
long with a deep forward pitch and a red scarf streaming behind it, the **Pup**
is a round ball on stubby legs with huge upright ears and a fast skitter gait,
the **Brute** hunches broad under its helmet, and the **Warlord** towers on
straight legs with horns off its tall head. The old per-type gear (helmet, club,
horns, shield, tuft, belly, tails) rides the new head/body anchors.
Failure-proved: flattening the `POSE` table back to one blob reddens 6 of the 9
gardencheck §8 gates (silhouette aspect ratios, ear poke, scarf, uniqueness).

## Notes
- State is plain JSON (arrays of plain objects), so the contract's
  `snapshot`/`restore` round-trip cleanly (#381/#391): no functions in sim state.
- `visibility: 'private'` (#379) — awaiting Jon's promotion.
