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
- **The authored line (#2210):** each shift cycles a named sequence of waves
  (`WAVES` in `sim.js`) instead of one flat seeded hum. A wave fixes the kind
  ORDER (authored — seed 7 and seed 2027 run the identical shift-1 script) and
  its intra-wave spacing; `rest` is the longer breather between waves, so the
  line breathes in sections. Only ±5 ticks of seeded jitter ride on top. Kinds
  arrive by era (bottles shift 2, barrels shift 3, scrap shift 4), and each
  incoming wave announces itself at the belt mouth (#2214): a lit marquee banner
  — dark plate, amber rim, blinking corner lamps, a light sweep — plus a cue
  whose VOICE matches the wave family (`waveFamily` in `sim.js`: glass shimmers
  high, heavies knock low, scrap gets grit, steady twinkles; glass outranks
  barrels because that's the wave where a hard drop costs a fuse).

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
verdicts, shift speed-up and the win; the authored line (shift-1 streams are
the table on every seed, kinds arrive per shift-era, the pacing breathes
burst→breather, the waves feed quota + 18, wave names ride the event ledger);
determinism (twice identical, seeds differ); the shipped autopilot clears
every shift quota with headroom on seeds 7/101/2027; and in headless Chrome
the game boots clean, starts with a real Space, the cable and cargo pixels sit
where the sim says after real keystrokes, and three wrong-bin drops fired via
the DEV kit end the shift and restart — with zero page errors. A `JUICE` gate
proves the `quotaNear` contract key flips exactly one pick short of quota (the
gauge pulse reads it). `AMB` gates the per-shift ambience (#2234): zone map,
tightening cadence (beeps 540/420/330), the exact early-floor schedule, era
bleed and the play-only door in Node, plus Chrome proofs that attract stays
silent, the running early floor beeps once at its tick, and forcing shift 4
drops the bed into graveyard chatter. `CUE FAMILY` pins every announcement's family against a
name-by-name table (glass > heavy > grim > steady) written independently of the
sim's derivation; `WAVE-INK` samples the canvas at the breather tick and proves
the marquee is actually PAINTED — caption ink and plate rim, not just an event.
Landing juice (#2214): a correct drop adds a low sheet-metal thud under the
ding, a deeper first-frame squash (0.32) with a faster recovery, a rim dip on
the struck bin and a light shake; smash gets three bright after-tinkles.

Mutants: `PICK_MUT=judge|glass|roll|quota|wave|amb` — `wave` collapses the table
to one shift's waves; `amb` flattens the ambience eras (#2234); named gates go red.

## Honest gaps

- Plaicraft/SimReady episode export (labelled grasp-and-place episodes as
  training data) — the raw material is already here: seed + per-seat pad
  streams + per-drop `hit/miss` labels via the `retrogames-rec/v1` recorder.
  (Note corrected #2234: this no longer "waits on #1141" — that kit SHIPPED;
  what's left is wiring PICK RUSH drops through `scripts/plaicraft-export.mjs`,
  an episode-pipeline task, not a feel task.)
- No second on-screen touchpad for seat 2 (Jon's rule — keyboard-only 2P).
- Sound is event-synthesized; no per-shift ambience change yet. — **CLOSED by
  #2234** (`ambience.js`: three eras keyed to the shift — early floor with a
  distant forklift chirp + far metal roll, glass era adds a pneumatic hiss and
  wakes a belt-speed sub-harmonic, graveyard peak adds relay chatter at the
  tightest cadence (beeps 540→420→330 ticks); the motor hum deepens
  0.05→0.07 per shift and the shift whistle gets an air-brake whoosh. Pure
  schedule — sim/autopilot/hash never see it; attract and over stay silent.
  `pickcheck` gates it: AMB zone/cadence/schedule/era-bleed/play-door in Node
  + attract-silent, live beep and graveyard-chatter proofs in Chrome;
  `PICK_MUT=amb` goes red on two named gates.)
- Still open from #2214 (rolled into #2223, the next PickRush polish): per-bin
  fill bars + bin-full thunk, cable whip on gantry reversal, wobble/rotation
  telegraphs for glass clusters and barrel pairs, and a wave-completion tick on
  the quota gauge.
