# SHORT ORDER SHOUT — engine notes (#1248)

Original co-op cook-up: an all-night diner cut in two by a pass counter.
1–4 seats via the player-slot rules (#494): seat 1 is you, seat 2 can share
the keyboard (WASD + F/G), CPU cooks play by the same pads a human emits,
and any seat can be a model through the contract. Pure sim:
`src/games/ShortOrderShout/engine.js` (Node-importable, zero DOM).

## Kitchen map (13x7 grid, 24 px tiles)

```
row 0   COOLER(0-1)  BOARD(4)  BURNER(6,7)  POT(9)  TAP(11)   <- wall row
row 1-2 the LINE walkway (station fronts are row 1)
row 3   PASS COUNTER cols 0..10 solid; the gap is cols 11-12
row 4-6 the PASS side; service WINDOW at (0,5)
```

Cooks never cross the counter except through the gap. Tossed items fly OVER
it (only walls stop them) — the runner at post (6,4) catches line throws.

## Core rules (all tick-deterministic; all randomness from `mulberry32(seed)`)

- **One item per cook.** A = contextual use of the cell you face; B = toss.
- **MELT**: bun on board → tomato sliced on it → seared patty → carry/slide
  to the window. Tomato garnish pays +25.
- **SOUP**: potato into the pot, tomato → rolling boil needs TWO stirs spaced
  < 80 f; miss a stir window and it boils over (ruined pot: rinse, refill).
- **Burners**: sear 210 f → ready window 180 f → burnt → FIRE; fire spreads
  to the sibling burner after 360 f. Cup of water from the tap douses it.
- **Dirt**: anything landing on the floor goes dirty; stations refuse dirty
  ingredients until rinsed at the tap.
- **Tickets**: first at 2 f, then every ~10–16 s (faster late); 3 open max;
  serve = base (100/120) + tip (0–100, remaining fraction). 3 expired =
  fired. Shift = 9000 ticks (150 s), quota 900 = CLEAN SHIFT.
- `state.hash` = FNV-1a over the serialized sim (never over `fx`, which is
  render/audio sugar).

## CPU cooks (the attract demo, the partner, the RL sparring seat)

`cpuPlan(gs, seat)` ranks jobs (serve > fire > pot > grab seared > board
carry > sear > actionable-restock) and emits ONLY pads; `makeCpuEmitter`
walks a BFS path (seat-parity order to dodge mutual deadlock), holds each
direction press until the move actually lands, bumps to face the station,
then taps its action. With a partner, seat 0 plays LINE and throws finished
dishes south over the counter to the seat-1 RUNNER waiting at (6,4) — the
same hand-off humans are designed to do. `needs()` + `actionable()` gate
restocking so cooks never stockpile what no station can accept.

Known CPU reference results (engine seeds): 2P CPU pair reaches quota on
8/8 checked seeds; solo on >=6/8 (the solo tax is the counter circuit).

## Harness

- `npm run soscheck` — 30 engine assertions (layout, determinism, the whole
  soup/burner/dirt/serve rulebook, win, solo slack) + browser boot, contract
  determinism and frame checks. Needs `npm run dev` (DEV_PORT, default 5173).
  `SOS_SKIP_BROWSER=1 npm run soscheck` skips the browser half.
- `npm run sosplay` — real-key drive: attract→select→play, walk + grab with
  real keystrokes, drawn pixels must agree with the sim position, firing,
  restart, pause; zero page errors. Screenshots land in /tmp/forge.
- Mutant proof: neuter `p.stir < p.need && p.since >= STIR_GAP` (boil-over)
  and soscheck goes red on "unattended boil => ruined"; restore = green.
- `npm run contractcheck` includes `short-order-shout`
  (`scripts/lib/contractGames.mjs`).
- DEV hooks: `window.__sosTest` ({state, screen, start, press, release}).
  `window.__game` per the standard contract; `sources()` reports the live
  seat kinds so captures record `retrogames-rec` headers correctly, and the
  contract's #1247 voice path banks raw per-seat mic audio (consent prompt
  on real activation) into v2 files.

## Honest gaps

- **Online seats through the lobby = stage 2 (#1291).** The slots expose `remote`
  and the sim is lockstep-ready (seed + pad streams), but the lobby/relay
  wiring is not done here; 2P is local keyboard today.
- **Voice**: the recording path carries raw per-seat voice (#1247 via
  `gameContract.recordStart`); an in-game production voice toggle arrives
  with online stage 2.
- Seats 3–4 are CPU-only locally (a third keyboard pad is what online
  unlocks); the pad is d-pad-only movement (no analog).
- The patty-burn chain (burnt→fire) has no "cool the pan" counterplay
  beyond dousing; stage-2 spice (extra dishes, day/night rush) is QA's
  polish backlog.
