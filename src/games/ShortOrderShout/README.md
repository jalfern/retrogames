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

## Polish pass #1292 (QA studio, 2026-10-31)

All renderer/audio, engine untouched (tick hashes unchanged): 2-frame paddle-walk
with smooth glide + turn squash; tossed items spin, catches flash a ring + pop;
serve plates flash + window bump + `+pts` float; quota completion slams a big
stamp. Fire drifts smoke + embers (distinct fast-blink `!` border), ruined pot
smoulders with a slow-blink bubble squiggle — alarm patterns differ by rate AND
shape for color-blind players. New tickets slide in with a bell ding; ketchup
bottle tip-meter tracks the 5-serve streak; attract teases `"CALL OUT ORDERS"`
(voice stage); the seat-select screen states out loud that touch drives seat 1
only (seat 2 wants a keyboard). A 4-bar synthesized diner loop (`dinerBar`,
audio.js) plays under gameplay, ducked ~3 dB while any alarm is active.

## Online lobby (#1291, stage 2)

`?net=host` opens a room (the shared Lobby #1039), friends join with
`?net=join&room=CODE` (QR on the waiting room). The protocol is
`src/games/ShortOrderShout/net.js` (pure, Node-testable):

- Seats: a browser drives the seat its relay slot owns; the host may keep one
  extra keyboard partner seat (P, while the room has space); open seats are CPU.
  Mobile players each own their own seat — VirtualControls feeds the device's
  seat, not always seat 1 (`ownSeat` in index.jsx).
- Lockstep: pads sampled ONCE, `PAD_DELAY`=10 ticks ahead (sampling law #531),
  batched every 2nd tick as byte masks (`{t:'pad',s,k,mm:{seat:[m,m]}}`,
  ~30 Hz/member); the whole-sim hash rides every 60 ticks and must agree with
  EVERY peer (`createSosSync.check`). CPU seats are deterministic — they need no
  wire, only seed + identical state (which lockstep guarantees).
- Desync: mismatch => guests send `{t:'res',e:'req'}`, the host snapshots
  (`snapshotGame`, rng closure peek — additive, hashes unchanged) chunked
  <=380B over `res`; guests restore + rebuild CPU plans and play continues,
  no reload. A dead friend (3 s stall) makes the host re-kick on a fresh seed.
- Walkaway takeover (#1416 gap 2): a seat whose pads stall > `DROP_GRACE` (0.5 s)
  AND whose player left the roster is demoted to CPU at the stalled tick — the
  NET tag flips to a blinking `CPU!`, a hand-off blip sounds (`seatDropFx`),
  and the shift cooks on instead of re-kicking. Every box stalls at the SAME
  tick (relay FIFO delivers the departed's last pad batch before the roster
  change), so the takeover is deterministic; `net.demote` also kills the seat's
  remote pad buffer (gotPad + assemble ignore it) — a straggler pad would
  otherwise outrank the CPU mask and poison the boundary hash. A merely lagging
  seat (still in the roster) stays notice-then-re-kick territory.
- Wire discipline: only FORWARD_TYPES, <=512B, ~93 msg/s worst case (4 members)
  against the relay's 240/s window — proven by `npm run soslinkcheck` (49
  assertions incl. full-shift score equality with the local reference run and
  the walkaway takeover; mutant: neuter `check()` or `demote()` => red).

## Honest gaps

- **Voice/PTT over the relay** (issue item 3) is not wired — the relay is
  data-only and rate-guarded; filed with the QA polish pass. The #1247 record
  path still banks per-seat mic audio.
- **Voice**: the recording path carries raw per-seat voice (#1247 via
  `gameContract.recordStart`); an in-game production voice toggle arrives
  with online stage 2.
- Seats 3–4 are CPU-only locally (a third keyboard pad is what online
  unlocks); the pad is d-pad-only movement (no analog).
- The patty-burn chain (burnt→fire) has no "cool the pan" counterplay
  beyond dousing; stage-2 spice (extra dishes, day/night rush) is QA's
  polish backlog.
