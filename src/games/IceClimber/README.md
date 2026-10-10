# ICE CLIMBER CO-OP

`/ice-climber` — the arcade's first local-2P title. Two climbers bore a frozen
massif from the inside; every tile punched is gone forever.

The issue (#70) named the two muscles this title exists to stretch, and both
are load-bearing at the sim level, not the skin level:

- **MUTABLE TILEMAP.** The shaft is not authored — it is created by punching.
  A climber may only rise into a cell that is no longer `ICE`
  (`sim.js: stepClimber`), so the level's playable geometry is the player's
  own edit history. The audit counts real tile deletions (69 across the three
  mountains) and the `dig=false` mutant strands the solver on the floor.
- **SECOND SIMULTANEOUS INPUT PATH.** `step(g, {a, b})` takes one input
  vector per climber per tick, one key set each (Arrows+Space, W/A/D+F), and
  `iceplay` holds both key sets down at once and grades both bodies moving.
  `VirtualControls` grew an optional `secondPad` prop (bottom-center, default
  off — no other game changes) so a phone can host P2 too.

## Why co-op is geometry, not decoration

Physics constants are the level design: jump rise is `jumpV²/2g ≈ 2.1`
cells; THE STACK's carrot shelf hangs 3 cells over the summit shelf. A solo
climb tops out at 2.1. Standing on a partner's head adds the climber's own
height (1.5): `1.5 + 2.1 = 3.6 ≥ 3`. `icecheck --mutate shoulder=false`
re-runs the real solver and proves the summit becomes unwinnable. The
condor (summit 2) patrols a fixed band that stops short of the ice column at
col 7 — the pocket — and its patrol period is what the autopilot phases its
climb against; a downed climber is only revived by a partner's touch, so on
summit 3 a dead partner is a dead run. That is the revive being load-bearing,
and the audit pins it (`revive=false` must fail the forced-accident pin).

## Files

- `sim.js` — pure physics: two climbers, one shared tick, the punch rule,
  the shoulder rule, condors, revive. Zero DOM, zero RNG. `CFG` switches
  (`dig`, `shoulder`, `revive`, …) exist only so the harness can prove each
  rule load-bearing.
- `levels.js` — mountains CARVED from solid ice (the Lemmings/BoulderDash
  house style): a corridor under the massif, one punchable shaft column, a
  PLAT summit shelf the climb pops through, and a carrot.
- `planner.js` — the co-op autopilot: closed-loop macros over the real
  physics (walk, bore-with-wall-drift, condor-phased climb launch, the
  head-stand hop). It is the attract demo, the PROGNOSIS action, and the
  witness the audit grades. `replay(meta, script, advanceAt)` is the
  determinism contract — hash-equal, and a flipped input tick is not.
- `scripts/icecheck.mjs` — the Node audit (33 checks, 5 mutants).
- `scripts/iceplay.mjs` — the browser proof (17 checks): simultaneous keys,
  tiles deleted by real keystrokes, paint-follows-physics, a stack-jump win
  won with real fingers, condor down, partner revive, pause door.

## The rules worth remembering

- **The climb exit is a flank check, not a trigger.** You keep rising only
  while the column means "up" (ice to punch, shelf to pass, ice at the
  shoulder, or a ≥8-cell bore capped by snow). The same check that releases
  the climber onto the summit shelf is what denies a free pole under THE
  STACK's carrot shelf — the 2-cell gap fails the depth scan.
- **Wall drift is authored into the route, not the map.** The bore column
  (8) hugs the far ice wall because the autopilot drifts right only while
  its body is inside the band — that drift is why punching opens *straight*
  onto the shelf instead of back into the shaft.
- **Jump edges are latched in the shell (`jEdge`).** A CDP tap fires
  keydown+keyup inside one inter-frame gap; an unheld edge dies between two
  sim steps. The engine must admit the key — the lesson `runnerplay` learned
  and this title re-learned.
- **`advanceAt` lives in the planner, not the sim.** Level advances happen
  between recorded ticks; a replay that advanced "on clear" desynced by two
  no-op ticks the autopilot pushed after its own carrot grab. Reproducing
  the solve means reproducing the planner's bookkeeping, not just the physics.
