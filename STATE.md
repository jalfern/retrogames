# STATE — forge board snapshot (slot b, 2026-11-23 — the canopy learns to drop)

## This session — SHIPPED
- **#3067 CONTRA — the canopy's frogmen** (PR #3069, squash-merged `2f9af7e`):
  the cabinet's leaping infantry. A harness-man perches on a bough (y 138 —
  shelter above the flat rifle stream), coils (`jlCoil` 10, glint telegraph),
  drops in SILENCE (a perched gunner would add rounds the tuned seed economy
  can't price — seed 7 proved it), staggers on the deck (`jlLand` 12), then
  fights as the plain rifle runner the wheel already answers (+100 via
  `killSoldier`). Camera-relative bough wheel `JL_STATIONS` (leads 170/230/
  290), zero-rng schedule (`jlFirst` 520 / `jlEvery` 560 / jit 90), one man
  aloft (courier law), re-armed at every arcade loop. Fairness pinned by
  geometry: the steep-angle gate (`jlGate` 100) keeps every round it fires
  inside the taught hop answer (worst-angle vy ≈ 1.06 < the 1.2 window — the
  rapGate/#2917 law in the vertical). 15 sim + 3 live legs; mutants
  `frog-blind` + `land-tax` RED by name; sweep seeds 1..12 clear with the
  lane armed (seed 7 pays one honest life — knife-edge bank, denser schedules
  460/500 broke it; 520/560 is the calibrated set). `lob-hall` mutant
  re-anchored past the new gate clause. Suite 452/453 and mutants 219/219
  on the merged code (rebase over #3066 — stitched the contracheck import
  line + README tail); CI `static` green.
- **Never-dry honesty**: THIRD same-source CONTRA rung this cycle (#3064,
  #3066, #3067 — seventh on the kick's history), recorded as an override on
  #3067, not precedent. The directive ordered the never-dry stage (weakest =
  CONTRA score 1, via #2971 only, gap null) and the gap was REAL (the
  cabinet's leaping infantry never existed here). This is exactly the
  third-rung situation slot a warned about — the next -1-weak/-1-gap rung on
  this source MUST pick a different stage or stop. #3053 (kick dedupe) is
  the open question that owns this.

## PLAYABLE on main right now
- `/retrogames/contra` (**frogmen #3067**, name entry #3066, rappellers
  #3064, BARRIER #3060, TOP SOLDIERS #3061, popups #3057, seat carry #3056,
  bed #3047/#3052, CONTINUE #3042, extend #3041, Konami #3037, duck #3038,
  somersault #3035, voice #3000, sorties #2917, loop #2894),
  `/retrogames/minesweeper`, `/retrogames/double-dragon`,
  `/retrogames/floor-boss`, `/retrogames/fire-crew`, `/retrogames/r-type`.

## Board at close
- steer/next/game-queue/building empty; #3067 closed shipped (#3069 merged),
  prod verified by CONTENT (www entry → `Contra-oFWFE2xY.js` carries the
  lane) — the right way: the entry chunk never contains route strings.
- #2971 stays waiting-jon (only Jon closes). Unlabeled #3014/#838/#2827 wait
  for Jon's labels. Dry-shelf unchanged: weak=CONTRA via #2971 only — see
  the override warning above before kicking it again.

## Notes for the next hand
- **Mutant harms must watch the LIFE DELTA, not `pdown`** (#3067 lesson):
  `pdown` only rings when the shared pool empties — with lives 3 the planted
  death lands as `boom kind:'death'` and your loop walks past it. `land-tax`
  survived twice on that bug before the probe measured `gs.lives` drop.
- **Fairness probes need an attribution margin**: land-tax names the harm by
  timing (mutant kills at touchdown+6, base's next leak is +11 — assert
  between, never "dies early"). Parking the hero mid-drop-column measures the
  fall-kill band, which base law shares — not mutant-specific, don't use it.
- Mac flake list unchanged, plus a sighting: #3018-bannerGold is a
  SINGLE-frame gold sampler after a 300 ms poll — under multi-lane box load
  (three dev servers + two agents tonight) it misses the slam window while
  the repeated-poll notch leg in the same block passes. If anyone touches
  it, give it the notch-leg treatment (poll ≤12×120 ms, take the max).
- forge-merge.sh ran CLEAN this slot (#3013 gap did not reproduce — mergeclean
  deleted the remote branch and re-detached the lane itself).
- Frogman seams for reuse: CFG jl* block + `JL_STATIONS` in sim.js; DEV opts
  `frogNow/frogStation/frogOff`; probe `frog={men:[{x,y,ph,rec}],next,n}`;
  sfx `jlin/coil/drop/bound`; DebugKit `FIELD FROGMAN`.

## Slots / ops
- Slot b :5178 stopped via devstop at close. Lane worktree
  `retrogames-forge-contra-leapers` remains (detached at origin/main after
  merge — prunable, symlink node_modules out first). Plumbing `~/Dev/retrogames`
  detached at `origin/main` (`2f9af7e`), no local `main`.
- STATE.md committed to main — a forge game merged this session (#3069).
  Shift report pushed for #3067.

## Open questions
- #3053 (never-dry kick dedupe — awaiting Jon; this session's third rung is
  its evidence), #3054 (QA recorder, lane:qa), #2971 (waiting-jon phone
  take), #1712 (PLAICRAFT S2).
  Live board: https://jalfern.com/retrogames/forge
