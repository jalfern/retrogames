# SPACE INVADERS

**Bar: RETRO.** Taito 1978, the formation shooter (route `/invaders`). The
world is a fixed **224×256** grid (the original's rotated-panel resolution),
integer-scaled to the canvas with smoothing off, fixed 60 Hz timestep. The
overlay palette is honored: red score zone + red top row + red saucer, green
base line, cyan spare cannons, everything else white on black; the descending
four-tone march accelerates as the fleet shrinks.

## Modules

| File | Job | Proven by |
|------|-----|-----------|
| `sim.js` | one `step(state, input, rand)` — **zero `Math.random`**, every dice roll (invader fire, shooter choice, UFO arrival) drawn from the injected `rand` stream; the saucer's bounty is the shot-count table, not a roll | `npm run invaderscheck` (76 checks incl. 15 mutants proven RED→GREEN) |
| `index.jsx` | render (pixel sprites from bit-rows, 2-frame march), input, seed lifecycle, attract autopilot, harness contract | eslint + `feedbackcheck` laws |
| `attract.js` | attract screen frames | intact from the original port |

## Terminal model (restored in #1473 batch 13)

The first port (Feb 2026) had **no terminal at all**: a hit, a landing or a
cleared wave silently re-initialised, and `score` was a dead field. This
batch rebuilt the original's honest end-of-run model:

- Rows score **30 / 20 / 20 / 10 / 10** top-to-bottom (squid / crab / crab /
  octopus / octopus — the machine's literal score table, #3517); the mystery
  UFO banks 50/100/150/300.
- **Three lives**; a hit clears the screen's shots, blinks the cannon, holds
  the formation in place (original behavior) and respawns after 90 ticks.
- **A landing ends the game** — with lives left on screen, `done=true`. So
  does the third death. The score you die with is the score you report.
- **The wave table (#3517)**: wave 1 opens the base formation **11 x 5 = 55**,
  wave 2 returns the top **44** (bottom octopus row stays home), wave 3+ the
  top **33**; every wave starts 8px lower per wave (max +48), marches faster
  (`0.8 + 0.25·wave`), and fires more often (capped 5%/tick).
- **The speed law (#3517)**: `marchSpeed = waveSpeed(wave) x clamp(0.3·sqrt(55/n), 0.3, 3)`
  — the full fleet CRAWLS at 0.3x base, the march accelerates as the fleet
  thins (the cabinet's interrupt timer ran ∝ aliens on screen), peaking at
  ~2.3x on wave 1 (sqrt(55); the 3x cap binds only from wave 3). The same
  function drives `step` and the WATCH lead prediction — one law, one brain.
  Without it the 55-wide wall (only ~42 px of sweep between the walls) lands
  ~tick 777, before fifty-five one-shot kills can fit; the player missile
  moved 5 -> 8 px/t (the cabinet's ~3:1 ratio over the 2.5 bombs) for the
  same reason.
- **The machine step (#3573)**: the march is released in whole **2px steps**
  (`MARCH_STEP`), not a continuous slide — `marchSpeed` now sets only *how
  often* a step fires (the substep carry lives in `marchAcc`, so average
  px/tick is the #3517 law exactly; measured drift over 600 idle ticks is
  1px, less than one step). A fast thin fleet releases several steps in one
  tick (the cabinet's timer shortened past the frame the same way). The
  column lands **flush** on the wall — integer geometry plus the flush clamp
  make overscroll impossible — then drops 8px and reverses on the same step
  event: the cabinet's jerk. `marchEvents`/`marchDrops` are monotonic, and
  the descending four fires on those ticks (index.jsx gates the #1906
  ∝fleet rate law on step edges — sound and march share one clock, as on
  the machine).

## The forts (#1495)

The original's four destructible bunkers, restored to the sim:

- Four forts of **2x2 bricks** (11x8 cells = 22x16 px each), dome corners
  cut, a 6x4 slot in the crown, at x = 23/75/127/179 on the line y = 208 —
  between the fleet and the player. Green, like the original's overlay.
- **A shot eats exactly one brick and is lost.** The 1px column is swept
  from the previous to the current position (a 5px shot skips brick rows),
  scanned from the leading edge; a pixel on a brick boundary tries the
  right-hand neighbour. A hollow path (slot or chewed gap) lets the shot
  through to what is behind the fort.
- **The forts shield the player:** a falling invader shot that meets a brick
  is consumed by the fort. The fleet's fire chews the forts down for free.
- **A descended invader grinds the bricks it walks over** (original
  overwrite) — the last rows of a run eat the forts before the landing
  ends the game.
- **A cleared wave does NOT rebuild the forts** — only a new game restores
  them (original behavior).

The contract state reports `bunkerBricks` (0–328); DebugKit gains a
"Wipe forts" action and the brick count on the status line.

## Seed pinning (#1473)

`seedRng(seed)` (mulberry32, gameContract) drives all sim entropy; the seed is
regenerated at **every human start** (the attract demo runs the same sim), and
`?seed=N` replays the exact world. Production report:
`{ tick, score, done, seed, lives, wave }`. The harness contract
(`id: 'invaders'`) ships `reset/tick/state/canvas`; `snapshot/restore`
omitted — the rand closure can't JSON round-trip (#391).

## Verify

```bash
npm run invaderscheck          # Node: boot, rules, wave table, speed law, winnable,
                             #   determinism, contract, + WITNESS: the WATCH brain
                             #   clears wave 1 on 20/20 seeds (slowest ~1534 at the
                             #   #3573 step grid), + §13 machine-step granularity
npm run invaderscheck -- --mutant  # 19 mutants (incl. flat-march and frozen growth
                             #   table, #3517; #3540 crossing + HOLD; #3573 off-grid
                             #   step, dropped carry, deleted flush clamp, parallel
                             #   metronome) must all go red
npm run invadersdrive          # real Chrome real keys: attract, start, arrows, fire,
                             #   landing death, restart-to-attract, zero page errors
npm run watchcheck -- --only invaders  # seat pilot: one-tap ▶ WATCH, Y seat/takeover,
                             #   blips, idle-hands proof (browser, needs dev server)
npm run feedbackcheck          # the seedpin law incl. this title
```

## WATCH (#1637 batch 18; hardened batch 19)

Y seats `watchRoute` from `sim.js` — the SAME brain the attract demo drives
and `invaderscheck`'s WITNESS clears 20/20 seeds with (no forked brain: the
old local attractInput is deleted). The route stands in columns clear of the
falling shots and leads the march, shooting the lowest unshielded invader;
any driving key or a tap hands the wheel back (shared blips).

Batch 19 closed the seed-1462 stall: law 3's meeting point sits ~17 px into
the marching column, which often hung directly above a fort — law 2's
shield-free pick then spent shot after shot on a brick (511 ticks, one kill).
Now the target choice prefers, among equal-lowest invaders, one whose LEAD
point is also shield-free, and the fire gate refuses to shoot through a fort
unless the chosen target itself hides behind one (then brick-biting is the
endgame). Both halves are pinned: the stall-gap witness line (<=450 ticks)
turns red when either is deleted.

Batch 20 made the route RE-AIM and FOLD the bounce. Re-aim: row-dominant
aiming marched the ship while another invader sat already aligned over open
sky (~500 green-gate ticks per seed) — the route now takes an aligned shot
the tick it appears, keeping the descent law whenever nothing is lined up.
Fold: a straight lead is fiction once the column reverses mid-flight (measured
miss bursts ran the inter-kill gap to 236), so the meeting point predicts the
bounce — march to the edge, then travel back for the rest of the shot's
flight. Measured: slowest clean clear 1857 → **1265**, inter-kill stall
236 → 172, pins tightened to 1400 / 220 with the new lines proven red on
deletion, plus a fort-preservation pin (6215/6560 bricks standing at clear;
deleting b19's aim tiebreak chews it to 6108).

## Batch #3540 — aim while travelling

Batch 20 cut the mis-aiming; what remained was the pilot FREEZING instead of
travelling. Two static rules caused it, both measured in the seed-1924 (197 t)
and seed-2001 traces:

- **Time-aware lane crossing** — `pathOpen` blocked the walk if ANY band bullet
  sat in a column between the ship and the goal, even one with 50+ ticks to
  live. Now the bullet's clock is compared with ours: it grinds the whole 8-px
  hull, killing until `(PLAYER_Y + PLAYER_H − y)/2.5`; we clear the lane's band
  at `(|lx − pc| + 8)/3`. Cross behind the clock and the shot lands after we
  have walked past. (First cut timed to the hull TOP and let seed 2001 die with
  lives > 0 — the kill window is hull-DEEP.)
- **HOLD, don't flee** — when no goal was reachable within ±48 px, the old
  fallback sprinted to the wall OPPOSITE the shots. Seed 2001's endgame
  ping-ponged 88..148 for ~500 ticks, finally landing two invaders that died
  nowhere. If our column is free we now HOLD: every bullet leaves the band
  within ~30 t, so holding always costs less than the lost commute.

Measured: 20/20 clean, 0 deaths, worst stall
197 → **128**, slowest clear 1506 → **1443**, bricks at clear 5902/6560.
Pins tightened 1600/220 → **1500/150**; deletions measured — crossing 189 (and
seed 1770 lands), re-aim 193, fold 686, HOLD 1651 (seed 1308 lands) — all
still red, with the two new laws pinned by static lines and two new mutants
(15/15 mutants die).

**#3547 40-seed soak (not closed):** k = 0..39 (seeds 1000 + k*77), live sim,
same witness walk — 40/40 clean, 0 deaths, no seed lands with lives left,
slowest clear 1460 t (pin 1500), slowest stall 172 t (seed 3618, k = 34) —
one fresh seed past the 150 pin the 20-seed witness never saw; seed 3156 (k =
30) lands at 149. The double-alley case is NOT called closed — the stall is
recorded here rather than silently loosening the pin or the gap line (#3547).

## Polish batch #1906 (2026-11-10)

Mid-game feel, from the issue list (QA polish pass):

- **Kill value popups** — the original flashes 10/20/30 where the invader
  died; the saucer pops its paid bounty. Blinking 8px text decor in
  index.jsx (sim stays pure), driven by the score delta.
- **March flutter** — the march rate now tracks the REMAINING fleet
  (`max(3, round(2 + n*0.95))` ticks), not a frac of 32: the last pair
  chatters at 3-tick steps like the arcade.
- **Saucer warble** — a UFO overhead silences the march and plays a
  250/340 Hz warble instead (arcade law: the march stops for the saucer).
- **Shot-count bounty** — `ufoBounty(shots)`: >=15 ->300, >=10 ->150,
  >=5 ->100, else 50; shots fired while the saucer is on screen are
  counted in the sim. The dice is gone — the saucer adds **zero entropy**
  to the stream (arrival timing still rides `rand`). Removing the bounty
  draw shifted the stream: WITNESS re-measured on 20 seeds — slowest clean
  clear 1312 (pin 1400), worst stall 172 (pin 220), bricks 6213/6560
  (pin 6200). All pins held; none was loosened.
- **WATCH re-aim tell** — between kills the seat holds position re-aiming
  through the shot pattern; a blinking cyan target tick over the cannon
  sells the pause as intent, not stall (#1906 comment, batch-19 ask).
- **Attract losing moment** — ART.md attract law: the demo no longer loops
  wave 1 forever. The route dies on waves 3-9 across the WITNESS seeds;
  the attract holds its own GAME OVER beat ~2.5 s before restarting.

Skipped from #1906 (deliberate): per-row explosion sprites and cluster
bunker-nibble. One shot eating ONE brick is the load-bearing law behind
`fortBlocks`, the b19 fire gate and the 6200-brick WATCH pin — changing
decay granularity rewires the proven route and needs its own session.

## Honest gaps

- **CLOSED by #3540:** ~~between kills the worst seed pauses ~3.3 s
  (196 ticks, shot-tempo + re-alignment, pinned <= 220) crossing dense shot
  patterns.~~ — time-aware lane crossing + HOLD fallback: worst pause ~2.1 s
  (128 t, pinned <= 150), slowest clear 1443 (pinned <= 1500). The WATCH
  route clears wave 1 on all 20 WITNESS seeds (0 deaths; one shot on screen
  means ~1.4x the 32-invader era's runway).
- **CLOSED by #3517:** ~~4 rows × 8 = 32 invaders; the original opens with 55
  and grows per wave.~~ — 11x5 = 55 opening, growth table 55/44/33, five-band
  score table, cabinet thinning speed law and 3:1 missile ratio (see Terminal
  model).
- **CLOSED by #3573:** ~~The march is continuous px/tick; the cabinet moved
  in discrete 2px steps on an interrupt timer; the step granularity is not
  yet the machine's.~~ — whole-step release: integer 2px ticks with a
  carry-exact average (the #3517 law owns the cadence, not the width),
  flush landings on the wall, and the descending four fired on the step
  ticks (see "The machine step").
- **BLOCKED**: the cabinet's drop was a wave-stepped row count; ours is a flat 8px
  per edge — the half of the old granularity line #3573 leaves open. The wave-stepped
  claim itself is UNVERIFIED in-repo: no period ROM or timing sheet here defines the
  drop, and the network boundary says don't guess. Flat 8px stands until material lands.
- **CLOSED by #3530**: ~~one spare cannon per 100-point crossing, cap 5, with its
  jingle and the BONUS stamp~~ — the spare cannon shipped (the line was stale: it was
  written before the shipping pass). What remains is not a gap but Jon's question: the
  cabinet's dip-switched one-life-at-1000 headline is UNVERIFIED in-repo and never
  re-tuned silently — left to Jon (#3547 open question).
- **DISCLAIMER**: no tilt/coin mechanics — browser-realistic coin / tilt is out of
  scope (the cabinet's coin box is hardware, not a browser feature); one UFO type,
  faithful to the cabinet (both decided by #3547's DO-NOT-FIX).
- **BLOCKED**: sound is the synthesized descending four + effect blips (studio audio
  law); the original's exact march waveform is absent — no period audio material in
  repo defines it, and #3582 judged the closer two-pulse envelope an unprovable
  re-tune, not owed against ART.md (the bonus-life jingle IS shipped).
