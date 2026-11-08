# GARDEN GUARD

An original lane-defense game in the lineage of a certain 2009 lawn classic
(PC, PopCap) — but its own IP: an autumn orchard raided by goblin **GRUNCH**,
currency is **acorns**, defenders are critters, every sprite is drawn in code.

## Files
- `sim.js` — the pure, deterministic simulation (no DOM): grid, acorn economy,
  card cooldowns, defenders/enemies/projectiles, scarecrow-mowers, the wave
  machine, level progression + unlocks, the autopilot `bot`, and `stateHash`.
  Every random comes from one seed (`roll`/LCG); `Math.random()` is never used
  here, so the harness and the attract demo replay byte-identically.
- `art.js` — procedural look: gradient dusk sky, cottage + scarecrow-mowers
  (a real scarecrow per lane: gold glow while armed, grey and head-tilted once
  spent — #1832), checkerboard lawn with grain, the wooden card tray + acorn
  purse (inset right of the site's top-left chrome — #1832), per-defender and
  per-goblin sprites (walk/eat/slow animation), projectiles, particles hooks,
  cursor (the ghost defender only shows once the keyboard cursor is used —
  #1832), HUD (level + wave bar + five scarecrow pips, in the 28px strip BELOW
  the lawn so nothing paints over row 5 — #1832).
- `index.jsx` — the arcade shell: one fixed-timestep loop, attract (driven by the
  sim's own `bot`), keyboard / pointer / VirtualControls all funneled through the
  same `drivePad` → sim actions, juice (particles + shake), PauseOverlay,
  `window.__gardenTest` DEV hooks and the `window.__game` contract.

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
Five levels; clearing one wipes the lawn, hands a sunlight cache, and unlocks the
next defender; the last ends with the Warlord.

## Verify
```bash
npm run gardencheck                 # pure Node: boot + core rules + winnable on 5 seeds
                                    # + the #1832 newcomer gates (refuse events, art contract)
npm run dev                        # then, another shell:
CONTRACT_ONLY=garden-guard npm run contractcheck   # window.__game contract, determinism
```
`gardencheck` proves it can fail: set `PLANTS.chili.radius` to `0` in `sim.js`
and the "Chili Bomb splashes a cluster" gate goes red (then restore). The #1832
art contract gates the same way: the HUD/tray/scarecrow/ghost assertions run
against a recording mock-canvas, so reverting any of the newcomer layout fixes
turns them red without a browser.

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
  deliberately simple.

## Notes
- State is plain JSON (arrays of plain objects), so the contract's
  `snapshot`/`restore` round-trip cleanly (#381/#391): no functions in sim state.
- `visibility: 'private'` (#379) — awaiting Jon's promotion.
