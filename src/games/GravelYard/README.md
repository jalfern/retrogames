# GRAVEL YARD — engine notes (#1253)

Original co-op heavy-metal sandbox: a golden-hour gravel yard where the
information is cut three ways. The DIGGER sees the pile and its wet seams, the
SCREEN plant wears the grade chart but knows no orders, the TRUCK owns the order
board at the gate. The chain is the game: cut gravel, dump it into the shaker's
hopper, batch it through the gate into the two graded bays, load, tip at the
customer trailer before the order lapses. Pure sim:
`src/games/GravelYard/engine.js` (Node-importable, zero DOM).

## The yard (16x9 grid, 32 px tiles)

```
rows 1-3   GRAVEL PILE cols 2-4 (six cells, 4 units each; wet seams seeded)
rows 1-2   SCREEN PLANT cols 7-9; south face: hopper feed (8,3), console (9,3)
           stand cells (8,4)/(9,4) directly south — face north to work
col 11     bays: COARSE (11,1), FINES (11,2) — load from the col-12 lane
col 14     ORDER BOARD (14,4), customer trailer DOCK (14,7); tip spots (13,7),(14,6)
row 0/8 +  fences; a dug-out pile cell becomes driveable flat ground
cols 0/15
```

## Core rules (all tick-deterministic; all randomness from `mulberry32(seed)`)

- **One law for all seats**: arrows drive where you face; A works the cell you
  face (dig at the pile, load at a bay, cycle the gate at the console stand);
  B releases (bucket into the hopper, bed at the dock, and it JOGS a jammed
  screen). The operator seat (seat 3) also uses LEFT/RIGHT to cycle the gate.
- **Grades**: gate WIDE separates ~75% coarse, MEDIUM ~50%, NARROW ~20%.
  A batch needs hopper ≥ 2 and takes 120+15·units ticks. Rates: coarse 30C/u,
  fines 22C/u, plus a punctuality bonus (≤40C) per filled order.
- **Wet seams**: digging a wet cell puts wet units in the hopper; a wet batch
  rolls a jam (25% per wet unit, cap 90%) ~1s in. A jam FREEZES the batch —
  jog it (B) `1 + wet` times. 60 ticks after the shift starts, a spare load
  tips onto the pile every 15 s (never onto a parked machine).
- **Refusals**: tipping a grade no open order wants is REFUSED — a strike, and
  three strikes ruin the shift. The load stays in the bed. Mixed loads are
  refused at the bay instead (no mixing). Bay overflow (-$ at spill) and
  lapsed orders (-20C) cost credit but not strikes.
- **Shift**: 10 800 ticks (180 s). Orders print from t=120 every ~20-30 s,
  2 open max, 3-7 units each. Quota 600C = CLEAN SHIFT.
- `state.hash` = FNV-1a over the serialized sim (never over `fx`, which is
  render/audio sugar; `Math.random()` only drives dust puffs and audio jitter).

## Seats (#494)

Seat 1 = DIGGER (you), seat 2 = TRUCK, seat 3 = SCREEN OPERATOR. Select 1-3
hands at the select screen; unfilled seats run CPU crew members that emit ONLY
pads — the same keys a human emits. P makes the truck seat human (WASD + F/G).
Radio callouts are the info channel: `TRUCK` shouts orders (what its board
sees), `SCREEN` shouts jams/spill/batch results, `DIGGER` shouts wet seams.
Solo you play by ear — that is the design rule of #1253.

Known CPU reference results (engine seeds): the full CPU crew makes quota on
**8/8 seeds** (663-985C vs 600); with one unit less on EVERY pile cell
(slack rule) it still wins **7/8**; a two-handed crew (digger by pad, rest
CPU) wins 8/8. `simulate(seed, players)` in the engine is the reference driver.

## Harness

- `npm run gravelcheck` — 44 engine assertions (layout, determinism, dig/dump/
  batch/gate/jam/load/tip/refuse/strike/orders/overflow, win + slack) plus
  browser boot, contract determinism, the in-browser CPU-brain proof and
  frame checks. Needs `npm run dev` (DEV_PORT, default 5173).
  `GY_SKIP_BROWSER=1 npm run gravelcheck` skips the browser half.
- `npm run gravelplay` — real-key drive: attract→select→play, walk/dig/dump the
  first link of the chain with real keystrokes, drawn pixels must agree with the
  sim position, pause/resume, shift-end over screen, SPACE restart, tap-to-start.
  Screenshots land in /tmp/forge-gy-*.png.
- Mutant proof: delete `gs.strikes++` in `tip()` and gravelcheck goes red on
  "wrong grade at gate refused + strike" and "three refusals ruin the shift";
  restore = green.
- `npm run contractcheck` includes `gravel-yard` (`scripts/lib/contractGames.mjs`).
- DEV hooks: `window.__gyTest` ({state, screen, start, press, release, hash}).
  `window.__game` per the standard contract; `sources()` reports live seat kinds.

## Honest gaps

- **Online seats through the lobby = stage 2** (same as the kitchen #1291): the
  sim is lockstep-ready (seed + pad streams) and `sources()` could mark
  `remote`, but no lobby/relay wiring here today; 2P is shared-keyboard.
- **Voice (#1247)**: the recording path banks raw per-seat mic audio via
  `gameContract.recordLiveTick`; an in-game push-to-talk that steers the CPU
  crew like GAUNTLET's voice calls (#1249) is the natural next stage — the
  radio channel already carries the exact utterances a grammar would mirror.
- The screen operator seat is CPU-only locally (a third keyboard scheme would
  crowd the pad); model seats drive it through the contract.
- The tip delivers against the OLDEST matching order; per-order pinning is a
  polish candidate.
- Movement is d-pad-only (no analog stick); CPU crews never reverse (all
  forward routing), so tight squeezes are handled by replanning, not backing up.
