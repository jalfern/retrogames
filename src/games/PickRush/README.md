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
npm run pickrush-export    # the Plaicraft corpus: data/pickrush/ (episodes + drops + summary)
CONTRACT_ONLY=pick-rush npm run contractcheck
```

`pickcheck` proves: clamp/carry/release, bin judging, the glass threshold both
ways, barrel slip vs upright catch, fuse economy, the miss penalty, quota
verdicts, shift speed-up and the win; the authored line (shift-1 streams are
the table on every seed, kinds arrive per shift-era, the pacing breathes
burst→breather, the waves feed quota + 18, wave names ride the event ledger;
the wave lamp row's source index names its slot and never exceeds the wave
length, and the CLEAR card owns the breather free of the marquee (#2223);
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

Mutants: `PICK_MUT=judge|glass|roll|quota|wave|amb|vis|whip|tell|aim|rec|perfect|spoil|voice|ease|feather` — `wave` collapses the table
to one shift's waves; `amb` flattens the ambience eras (#2234); `vis` freezes the
bin meters (#2678); `tell` silences the grab-read telegraphs (#2684); `aim` blinds
rival intent and ring ownership (#2690); `rec` makes the export's label law lie
(a correct-bin land stops being a hit) and 9 EXPORT gates go red by name (#2734);
named gates go red. (`vis` reddens the meters AND the #2739 interiors it feeds — 6 gates; `voice` reddens 2.)

## Bin interiors & a voice per bin (#2739 — QA polish pass)

- **Stacked silhouettes:** the fill meter counts, the INTERIOR now shows WHAT
  landed. Each drop event pushes its kind beside the same raw count that
  climbed the meter (`pushBinKind` in `visuals.js`), and the painter draws
  real tiny silhouettes — `drawItem(kind)` from the belt's own palette — so
  the CAN bin shows barrels among the cans and the top row squashes as
  pieces settle. Stack length ≡ meter fill by law; when a pallet thunks full
  the stack becomes a compressed ghost pancake (`ghost`/`settle`, 14 ticks)
  before the empty bin reads empty. Paint-only — sim/hash never see it.
- **A thud per bin:** the correct-drop thud (#2214) used to be one fixed
  sheet-metal 120 Hz. `DROP_THUD` gives every bin its own voice — CRATE 110
  pine knock, CAN 124 tin ring, BOTTLE 147 light tick (glass lands softest),
  COIL 98 rubber thunk, SCRAP 87 deep clatter — with per-bin gain, so which
  bin you hit is audible. Combo ≥ 4 adds a bright 2093→2637 double-tink: the
  streak is heard, not just counted. Pure derivation, zero rng — the same
  drop always sounds the same.
- **Self-heal:** the meter is the truth — a rewound raw (new game before any
  wrap, where the `raw < base` branch can't see it) truncates stale
  silhouettes down to the fill it mirrors; the below-base heal clears stack,
  ghost and settle silently, like the #2678 restart heal.
- **Proven:** pickcheck §INTERIOR (STACK-MIRROR climb/wrap, SETTLE ghost +
  fade, both STACK-HEAL paths, LINE-PUSH/LINE-MIRROR/LINE-KINDS over seed
  7's whole line — stack === fill every bin every tick, CAN's live stack IS
  the tail of its real drop kinds, VOICE-PIN literals + VOICE-SET distinct
  notes + DOUBLE-TINK combo gate + three SOURCE pins). `PICK_MUT=voice`
  (all bins one note) reddens 2 gates by name.

## Carriage weight, the feather lesson & a teaching attract (#2755 — QA polish 2)

- **Crane inertia (render-only):** the carriage PAINT rides a heavy spring off
  the sim clock (`stepCrane` in `visuals.js`, stepped in `whipSim` beside the
  #2678 cable). A press deepens a trailing lag (spins up over ~5 ticks to
  ~2.2 px behind); a release glides out over ~a dozen ticks with a small
  rail-flex rebound (measured +0.33 px past rest) and lands EXACTLY on the sim
  position — so the mid-run gantry leans and settles while the cable whip
  rides along, yet the #1184 PIXELS sampling law and every state hash are
  untouched. The ease is rig-zeroed in the contract `reset` (the #2754
  paint-timing law). Contract key `ease`; DEV eye `ease()`.
- **First-shift feather lesson:** glass arrives on the second shift, yet the
  slam meter only speaks once you're already carrying. The first fragile the
  claw lifts by then arms a one-time lesson — a down-chevron + `FEATHER` under
  the carriage — that fades on its own 150-tick clock and never arms again
  (`stepFeatherCue`; gone by shift 3, once per run, play-only — attract never
  teaches). Contract key `feather`; gates drive the SAME law thumbs get.
- **Teaching attract:** the old demo rotation (`1337 + n%97`) opened every game
  at shift 1, where none of the risk laws exist — the demo needed minutes
  before a slip or a feathered glass land. The attract now spins three
  MEASURED seeds (1427, 1766, 1873) pre-rolled to tick 8350 (the busy era), so
  five seconds of the demo shows all three laws: barrel slips @85–303 ticks,
  feathered bottle lands @168–591, upright barrel catches @179–1176, and every
  seed still clears the whole contract. Attract-only staging — play always
  starts at shift 1.
- **Proven:** pickcheck §INERTIA (SIM-PURE twin hashes, TRAIL ≥1.2 px, ramped
  EASE-IN, EASE-OUT glide ≥3 ticks, REBOUND ≥0.25 px, CLAMP, REST exact) +
  §FEATHER (FIRE on the era's first carry, ERA window, DECAY clock, ONCE +
  LEARNED) + §DEMO-REP (per-seed law counts + law-clock + contract clear,
  union, and the old `% 97` counter gone). Live Chrome: `INERTIA-PIXELS`
  (real held stroke trails ≥1 px) + `INERTIA-REST` (settles onto the sim
  line) + `FEATHER-INK` (caption really painted under the carriage); the
  existing PIXELS-at-rest gates keep holding — the ease converges to zero.
  `PICK_MUT=ease` reddens 4 named gates, `PICK_MUT=feather` reddens 2.

## Honest gaps

- Plaicraft/SimReady episode export (labelled grasp-and-place episodes as
  training data) — **CLOSED by #2734** (see §Plaicraft episode export): live
  takes bank through the #1141 kit with a per-drop label track, and
  `npm run pickrush-export` produces the replay-verified corpus.
- **DISCLAIMER** — No second on-screen touchpad for seat 2 (Jon's rule — keyboard-only 2P).
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
- Per-bin fill bars + bin-full thunk and cable whip on gantry reversal —
  **CLOSED by #2678** (`visuals.js`, see §Bin life & cable whip); the
  wave-completion tell was CLOSED by #2223 as its own lamp row (see below),
  the quota gauge keeps its own pulse.
- Still open from #2214: wobble/rotation telegraphs for glass clusters and
  barrel pairs — an off-axis grab or a shatter risk on the belt carries no
  pre-warning today. — **CLOSED by #2684** (see §Grab-read telegraphs): the
  catch ring says *now* whether jaws bite, the jaw arc says *this descent
  slips*, and the slam column says *this fall shatters* until feathered
  green. (Adjacent CLOSED by #2690, see §Rival intent & ring ownership:
  what the foreman crane is diving on now reads on the rails.)

## Wave read & rhythm (#2223 — QA polish pass)

- **Wave-progress pips:** a lamp row on the wall between belt and bins — one
  lamp per piece in the wave on the line. Still-coming pieces glow ice-blue,
  pieces that have ridden in go dark, and through the breather the row previews
  the next wave, full and lit. Purely read from `gs.wave` (sim untouched); the
  contract carries `waveTotal`/`waveSpawned`. Chrome gate `PIPS` samples the
  row's device rect and counts two lamps' worth of ink going dark as two
  pieces ride in; Node gate `PIP-SOURCE` pins the index against the wave length.
- **Per-wave pitch step:** the wave cue's PITCH rides the slot in the shift's
  line — each later wave in the cycle steps a whole tone up (0/+2/+4 st, motif
  resets on wrap), so the shift's rhythm is audible as well as visible. The
  wave event gained `wi` (the announced slot); `WAVE-STEP` checks name ≡ slot
  in Node and the stepped frequencies live (`PICK_MUT`-style proof: pinning
  `wi: 0` reddens `WAVE-STEP` by name). `SHIFT-CARD` proves the CLEAR card
  and the marquee can never share the screen: bands 94–114 vs 56–74, and the
  first marquee of shifts 2–4 lands 197–297 ticks clear of the card's 46-tick
  life. RUSH HOUR at ×1.42 playtested seat-0: pieces ride 61–69 px apart (the
  carriage is 22 px wide), zero faults on seeds 1/7/101/2027 — no gap slack
  needed; the tightness reads but is never unfair.
- **WAVE-INK paint-sync:** the gate sampled 34 ms after the pump; under
  multi-lane load a frame takes 60–120 ms so the canvas often still showed the
  post-reset frame (red twice on main 2026-11-14, deterministic under load).
  The gate now waits for a real painted frame (double-rAF + settle);
  thresholds and colors untouched.

## Bin life & cable whip (#2678 — never-dry polish)

- **Fill meters:** every bin carries a tag-coloured ink column on its right
  wall — landed pieces climb it one twelfth at a time. At 12 the bin thunks
  (one low sine + noise hit), flashes its whole rim in its tag colour, and
  the column wraps to empty. `gs.binFill` stays the lifetime count (PIECES
  and state hashes never see the wrap); the visual counter lives in
  `visuals.js` and heals silently when a new game drops the raw counts.
- **Cable whip:** the hoist cable hangs on a light spring (`BIN_VIS.spring`,
  ζ≈0.29) instead of the old speed-tilt. Steady slides settle at the classic
  ±4 px trailing tilt; a reversal makes the head WHIP past it (measured
  +5.8 px on live Chrome) before hanging straight again. Stepped in `doSim`
  at sim rate (paint-rate stepping starved the spring to a crawl on software
  render), and in the contract tick too, so bots and replays see the cable
  move like thumbs do.
- **Proven:** pickcheck `JUICE` (Node — exact 12-cap, no double-thunk,
  restart heal, thunks === Σ floor(binFill/12) over a full autopilot line,
  twin-seed SIM-CLEAN, spring overshoot/clamp/settle) plus live
  `WHIP-SPRING` / `WHIP-PIXELS` / `WHIP-REST` / `METER` / `METER-FULL`
  (contract state + canvas sampling, real keyboard reversals). `PICK_MUT=vis`
  (bins never fill) reddens its 3 gates — plus the #2739
   interiors it starves, 6 in all; `PICK_MUT=whip` (dead spring)
  reddens 2.
- **Also here:** the carried-CAN pixel gate waits for a PAINTED frame instead
  of a fixed 34 ms — same #2136 lesson as WAVE-INK above; the chase loop
  never yields to rAF, so loaded boxes sampled stale canvas bits.

## Grab-read telegraphs (#2684 — never-dry polish, #2214 tail)

- **Catch ring:** every barrel on the belt wears a hoop that mirrors the jaw
  law — green while `barrelUpright` (a clamp this tick WOULD bite; the window
  is ~27 % of the roll cycle and flips every few frames at late-shift speed),
  dark red while off-axis. It imports `barrelUpright` straight from the sim
  (the sim exports the predicate now — one source, so the paint can never
  drift from the jaws). `catchRing` state rides the contract as `barrelTell`.
- **Jaw warn:** a claw descending whose grab-window load is an off-axis
  barrel grows a red arc on its jaws for the whole descent — *this* dip
  slips; abort (A) or re-time. The lead-timed chase puts the crane at the
  meeting point, so the arc is a short ~2-frame confirmation; the ring is the
  approach tell (green/red the whole ride).
- **Slam meter:** fragile cargo carried over a bin column paints a pip
  column from cargo to the lip: red while the projected landing exceeds
  `BREAK_VY`, green inside the feather zone. Carry height lands at 9.0
  against a law of 8.0 — *every* high release shatters, and now the player
  sees why. The projection re-runs the sim's DISCRETE fall (`vy += GRAV;
  y += vy`), not √(v0²+2ad): the naive continuous form cries wolf in the
  dy 60–63 boundary band where the Euler fall actually arrives at exactly
  8.0, which the law accepts. `slamTell` rides the contract.
- **Fragile glint:** bottles on the belt twinkle a shoulder spark — the
  risk is taught before the grab, ahead of the carried column.
- **Proven:** pickcheck §TELL (Node — RING-TRUTH ring ≡ `barrelUpright` on
  every barrel frame of seed 7's whole line (876 ok / 2376 off states);
  RING-PREDICTS pinned off-axis slips / upright clamps clean with the ring
  and jaw states agreeing all the way; SLAM-LAW at both ends + a 13-height
  sweep where the tell's colour IS the physics verdict — 4 red heights
  shatter, 9 green land; SLAM-SILENT where the column has no meaning;
  TELL-PURE idempotent reads with the state hash unmoved) plus live
  `BARREL-RING` / `BARREL-STATE` / `SLAM-TELL` (canvas annulus sampling,
  real contract-driven feather to green then a clean score). The DEV eye's
  `tells()` pairs every ring with an independently written upright verdict.
  `PICK_MUT=tell` (the belt goes mute) reddens 6 named gates.

## Travel & prediction polish (#2694 — QA pass 2)

- **Travel ghost column:** fragile glass in the air with no bin under it now
  paints a dim pulsing column at its TAGGED HOME bin (pip column + ghost lip),
  coloured by the same discrete Euler-fall verdict the live slam meter uses —
  so you can pre-feather across the gap and arrive at the bin already green.
  Over a bin column it goes silent (`travelTell === null` — one column, one
  story). Contract key `travelTell: [impact, safe, bin, dx]`.
- **Jaw-warn went predictive:** the arc no longer reads the present pose — it
  mirrors the meeting. From the press tick it projects the barrel n discrete
  ticks ahead (`rot += vb/BARREL_R`, belt speed and claw speed imported from
  the sim, n whole ticks — never a continuous formula, #2684's catch) and
  warns if the load WILL be off-axis when the tip reaches the attempt window.
  Two consequences, both honest: the ~2-frame landing arc became a full
  press-to-landing warning (head-start with time to abort), and a barrel
  off-axis NOW that the roll rights before the attempt stays quiet (the old
  present-tense arc cried wolf there). `ATTEMPT_TIP`, `BARREL_R` and `beltV`
  are now exported from the sim so paint and gates mirror the same constants.
- **Crack-spark glint:** the fragile twinkle grew from two pixels to a hot
  core with four short arms trading shoulders — distinct at 2× (docs/ART.md).
- **Colour-blind law:** the ring's verdict pair and the barrel core moved into
  `visuals.js` (`RING_OK`/`RING_OFF`/`BARREL_CORE`) so pickcheck's §CB gate
  can prove them apart under a deuteranopia transform (Machado 1.0 + CIE76):
  ok/off ΔE 40.6, ok/core 34.9, off/core 15.4, ring/glass-marquee 72.6
  (the marquee glass hex is pinned from the painter's source so a palette edit
  without a re-check goes red). The ring additionally carries lineWidth + blink
  redundancy.
- **Proven:** §PREDICT (PREDICT-TRUTH: arc ≡ an independently re-spelled
  meeting mirror every tick, both seats, seed 7's whole line, 0 lies;
  PREDICT-EXTENDS: 154 warned frames land above the attempt window;
  PREDICT-HEADSTART: 26/26 slips already warned the tick before), §TRAVEL
  (DEST/FEATHER/HANDOFF + PURE: 171 gap frames read idempotent, hash-clean,
  never the wrong home), §CB; RING-PREDICTS(ok) rewritten to let the barrel
  roll naturally (quiet ⇔ upright at the attempt). `PICK_MUT=tell` reddens
  15 named gates (was 6).

## Rival intent & ring ownership (#2690 — QA polish pass)

- **Intent beacon:** while the foreman's autopilot is locked on a piece, his
  carriage beacon stops blinking identity and burns steady under a halo in the
  target's bin-tag colour, and a marching dashed lead line runs from the
  carriage to the piece he's hunting — 2P race-reading at a glance. The tell
  reads the autopilot's `target` memory (a motion carrier, never hashed —
  #1184 family) through `craneAim` in `visuals.js`; a human partner's crane
  carries no memory and paints nothing. Null while carrying (the slam meter
  owns that story) and when the memory goes stale (piece grabbed, landed, or
  off the line end — the filter mirrors the brain's own reach rule).
- **Ring ownership:** the catch ring's near-blink splits by claim —
  `ringClaim` says `mine` when MY empty claw is lowering into the grab
  window (fast 8-tick blink), `rival` when only the other crane converges
  (slow 16-tick), and mine wins ties. Two cranes converging on one barrel
  now say *who's first* instead of both flashing. `rivalAim` and `ringClaim`
  ride the contract for bots/replays.
- **Proven:** pickcheck §AIM — AIM-TRUTH over seed 7's whole 2P line: every
  live intent named a live odd-parity piece, and at rest it IS the brain's
  pick, re-derived in the *pre-step frame* the brain actually saw (`arm.vx`
  + one belt delta — the #2214 drift family again: compared post-step it
  cries wolf on window-edge ticks; successive odd pieces sit ≥120 px apart,
  so a 6 px tolerance forgives drift and still catches a wrong-piece lie);
  AIM-PURE idempotent reads, hash unmoved; CLAIM-TRUTH on built geometry
  (null/rival/mine-tie/loaded-drops-claim). Chrome: AIM-BEACON samples the
  canvas corridor between carriage and cargo for the tag-hued lead line;
  CLAIM-FLIP flips `rival`→`mine` on the contract as the geometry changes,
  with the DEV eye re-deriving inline. `PICK_MUT=aim` reddens 2 Node gates
  by name; `PICK_MUT=tell` reddens 8 (the whole telegraph family + these).

## Plaicraft episode export (#2734 — never-dry polish, the #1141 kit's fifth game)

- **Live takes bank.** Every shift you actually play records through the kit
  (`createEpisode` → `retrogames-rec/v1` + `episode` block): seed, one pad
  per seat per tick, checkpoint hashes, slot sources resolved at stop
  (`human`/`model` for the watched claw, `human`/`cpu` for seat 2), and the
  **label track** — the sim's own judging verdict for every drop
  (`{t, ok, why, kind?, seat?, bin?, pts?}`; `drop` = the tagged bin caught
  it = hit; `wrong`/`shatter`/`slip` = miss). The recorder sits outside the
  sim (hashes untouched, attract silent); storage failure degrades to
  silence. The harness never banks: every contract `reset()` drops the live
  recorder, so QA bots and replays leave the store empty.
- **Player-visible honesty.** A REC beacon (dashcam red, the house fuse-pulse
  cadence) blinks under the HUD while your take is kept, and the game-over
  card spells out the take: `TAKE BANKED — HITS n · MISSES m · EPISODES
  STORED k`. Consent model is the house one: takes live in localStorage
  (`retrogames-episodes`, capped 50) and leave the phone only through an
  explicit export.
- **Sim events carry the truth.** `slip/miss/shatter/wrong/drop` gained the
  `kind`/`seat` fields a label needs (`seat: it.lastSeat ?? …` — the crane
  that had it). Events never rode `stateHash`, so determinism and every
  historical seed stream are untouched.
- **The corpus.** `npm run pickrush-export` → `data/pickrush/`:
  practice seeds 0..11 + held-out 100..107 (the #1625 split discipline),
  each the full authored line completed by `planner()` — the crane law
  WITHOUT the autopilot's seeded habits. The autopilot draws `gs.rng` at
  every retarget (jitter ±3, skip 3 %); those draws pace the spawns through
  the shared stream, and a pad stream carries pads, not draws — captured
  with the autopilot, replay respawned the line differently (first lie:
  seed 0, tick 210). So the corpus brain is RNG-free **by law**, and
  `EXPORT-RNG-FREE` counts the draws to hold it (48 vs 92 by tick 2000).
- **Proven:** `pickcheck` §EXPORT — per seed (7/101/2027): VALIDATE, REPLAY
  (`verifyRecording`, hash-exact), LABELS-TRUTH (every label re-derived with
  the law written INLINE against the file's own pads re-walked, first lie
  quoted verbatim), HITS-CORRECT (Σhit ≡ ΣbinFill — `gs.correct` resets per
  shift, `binFill` is the lifetime ledger), WIN, SHAPE; plus JSONL round-
  trip through `exportEpisodes`. Chrome: REC-LIVE (real Space + real keys
  record), REC-BANKED (storage, labels counted, pads per seat per tick,
  seed honest), REC-NOICE (contract drives end the shift and bank nothing).
  `PICK_MUT=rec` (drop stops being a hit) reddens 9 EXPORT gates by name.
- **Corpus honesty:** the planner never mis-bins or slams glass, so corpus
  misses are barrel slips only — an accurate profile of a precise model at
  rotating cargo; the `wrong`/`shatter` labels come from human takes.

## Perfect shift (#2742 — never-dry polish, the mastery the risk laws teach)

The arcade pays clean rounds more (Tapper, 1983). PICK RUSH's law:

- **Sheet:** every seat carries `arm.clean` — true when the seat has committed
  no spoiling fault since the last whistle. The spoiling classes are the
  sim's own failure ledger: `miss` (piece off the belt end — unowned, spoils
  EVERY seat: the line is shared), `wrong`, `shatter`, `floor` (each spoils
  only the crane recorded on the item's `lastSeat`). A grip SLIP excuses —
  jaws bouncing off a rolling barrel loses nothing, and #2684's telegraphs
  already tell you not to try it.
- **Pay:** at the shift whistle, if quota cleared, every clean seat banks
  `PERFECT_PAY[shift]` = 200/250/300/350 — into `gs.score` AND its own seat
  bank; the sheet resets for the new shift. The last shift pays before the
  win closes the book. Quota short pays nothing — a clean sheet never buys
  the shift.
- **Moment:** `perfect` sim event (seat/shift/pts), a rising triangle sparkle
  (C6-E6-G6-C7) over the whistle, gold particles, a `PERFECT SHIFT +n /
  CLEAN SHEET` sub-line under the CLEAR card, and `PERFECT SHIFTS ×k (+Σ)`
  in gold on the over card.
- **Hygiene:** zero rng — the payout is pure bookkeeping of events the rules
  already emit (`CLEAN-NO-RNG` counts draws at the whistle). `clean` is
  derived state; nothing new joins `stateHash` — the score the hash already
  mixes is the whole footprint.
- **Proof:** `pickcheck` §CLEAN SHIFT — 21 gates: fire (exact Δ into score
  and bank), ladder amounts by literal, final-shift-before-win, one bust gate
  per fault class, slip-excused, per-seat independence in 2P, reset at the
  whistle, short-never-pays, no-rng, determinism, autopilot wins intact, and
  `CLEAN-AUTO` proves the CPU banks the moment too (measured 7×0 101×1
  2027×1 — the demo shows the law). Chrome `CLEAN LIVE`: the DEV ledger
  (`__pickrushTest.perfects()`) reads honest at the first tick of play.
  `PICK_MUT=perfect` (reward dies) reddens 5 named gates;
  `PICK_MUT=spoil` (misses forgiven) reddens 2 by name.
- **Corpus:** `data/pickrush/summary.json` regenerated — every seed banks
  exactly +500 (shift 2 is the miss-free stretch; both planner seats clear
  it clean). Drop counts untouched; hashes are #2742 hashes, replay-verified
  ALL.
