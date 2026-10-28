# PICK RUSH — night-shift sorting (issue #1142)

An original arcade sorter: a gantry crane over a moving belt. Grab pieces as
they ride past, drop them in their tagged bins, clear the shift quota before
the clock kills the line. Original IP — the conveyor-and-bins genre, our art,
our names, our rules.

## Engine

- `sim.js` — the whole game, pure and seeded (mulberry32). `step(gs, pads)`
  with `pads` one pad per seat; every random the rules consume comes from the
  seed. The renderer's only spatial contract is `screen = world` at 426×240
  (no camera) — that is what the harness samples.
- **Crane multiplex:** GRAB (A) lowers the claw on its cable → the claw
  auto-clamps anything it touches and auto-hoists to carry height → GRAB
  again over a bin releases. **B/DROP** also releases. **DOWN** feathers the
  claw *while carrying* — the only way to land FRAGILE bottles without
  shattering them (slam-drop impact `vy > 8` breaks glass).
- **Barrels roll:** `rot += v/r` while on the belt; a barrel that is off-axis
  (|sin| of the upright window) at the clamp moment slips out (jaws bounce —
  10-tick cooldown so it reads as a slip, not a stutter).
- **Judging:** correct bin = tag color match (CAN accepts barrels too);
  SCRAP only in the red bin. Wrong bin / dropped load / smashed glass each
  blow one of **three fuses**; the third fires you. Pieces that ride off the
  far end cost −50 and kill the combo (not a fuse — the quota already
  punishes misses). Consecutive good drops ride a combo multiplier;
  `+100 + 25·(combo−1) + 25·shift`.
- **Shifts:** 70 s each, quotas `18/19/20/21`, belt `×1.00→1.42`. Quota
  short at the whistle = fired; clear all four = contract completed.
- **2P:** twin rails (the belt is shared, the rails are not — one crane never
  deadlocks another over a far bin). The foreman (CPU) is the default rival;
  at attract, P opens seat 2 for a human (A/D/S + F), C returns to CPU.
- **The autopilot** (same brain as the attract demo and the CPU seat) leads
  each target for the claw's descent time, feathers fragile goods, and works
  **every other spawn** by parity when a rival shares the rail (≈1:1 banks);
  solo it takes the whole line. Jitter and a rare skip keep it beatable.
- Determinism: seed + pad streams ⇒ identical `state.hash`; the sim reports
  `pos`/`clawY`/`arm2Pos` (motion carriers per #1184) so the boredom map can
  watch the crane really move.

## Verify

```bash
npm run dev                # another terminal
npm run pickcheck          # Node rules + determinism + win proof + real-key drive
npm run pickcheck -- --mutate   # one rule silenced → NAMED checks go red
npm run pickcheck -- --node    # Node-only gates (no browser)
CONTRACT_ONLY=pick-rush npm run contractcheck
```

`pickcheck` proves: clamp/carry/release, bin judging, the glass threshold both
ways, barrel slip vs upright catch, fuse economy, the miss penalty, quota
verdicts, shift speed-up and the win; determinism (twice identical, seeds
differ); the shipped autopilot clears every shift quota with headroom on
seeds 7/101/2027; and in headless Chrome the game boots clean, starts with a
real Space, the cable and cargo pixels sit where the sim says after real
keystrokes, and three wrong-bin drops fired via the DEV kit end the shift and
restart — with zero page errors. A `JUICE` gate proves the `quotaNear` contract
key flips exactly one pick short of quota (the gauge pulse reads it).

## Honest gaps

- Plaicraft/SimReady episode export (labelled grasp-and-place episodes as
  training data) waits on #1141's robot sim kit — the raw material is already
  here: seed + per-seat pad streams + per-drop `hit/miss` labels via the
  `retrogames-rec/v1` recorder.
- No second on-screen touchpad for seat 2 (Jon's rule — keyboard-only 2P).
- One belt pattern only: spawn pacing is seeded, not hand-authored waves.
- Sound is event-synthesized; no per-shift ambience change yet.
