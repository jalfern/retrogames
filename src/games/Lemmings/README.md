# LEMMINGS-LITE — engine notes

Lemmings (DMA Design, Amiga, 1991), cut to its load-bearing parts: a stream of
mindless walkers, one-click skill assignment, fatal falls and drowning ponds,
and a solver that proves every ledge is actually crossable. The -LITE is by
design (issue #65 asked for a cut-down build). Bar: **RETRO** (docs/ART.md) —
Amiga palette and proportions, 48×27 logical tiles, `imageSmoothingEnabled =
false`. The gate is a Node solver that may only speak like a player
(`{tick,id,skill}` commands, no peeks), so a level it cannot clear with its own
supplies fails the build.

## Engine

- `sim.js` — the whole game as a pure forward model: no DOM, no React, no
  canvas. Plain Node imports it, and that is the gate: every level proof and
  the attract replay run on exactly the code the browser runs.
  - Geometry: a lemming's feet sit on a row boundary (`y = k` ⇒ row `k` is the
    ground under it, body = row `k−1`). The three cells ahead — foot, chest,
    next floor — decide step / wall / fall. Matter: AIR/DIRT/STEEL/WATER/PLANK.
  - Agent-per-entity: each lemming is a small state machine (walk/fall/climb/
    dig/block/bomb/corpse) stepped in id order ⇒ the game is a deterministic
    function of (level, grid, command list). `stateHash` pins that; the attract
    demo IS the solver's recorded script, replayed, hash-checked.
    **Determinism is the contract**: anything the solver can see, the player
    can reproduce.
  - Rules that carry the game: climbers need DIRT handholds (steel refuses,
    overhangs refuse); the digger TUNNELS one tile at a time so the swarm
    follows single file; bombs clear dirt only, chain other bombers, and
    corpses block walkers; a fatal fall is > `CFG.maxFall`; **water drowns**
    (#3828) — chest or feet in a WATER cell kills from any height, water is
    not ground, and neither dig nor blast yields it.
  - Skills: BLOCKER, BOMBER, CLIMBER, DIGGER, **FLOATER** (#3827),
    **BUILDER** (#3863). Climber, digger and floater are flags for life —
    re-granting any of them refuses rather than burning supply (#422). The
    floater's parachute caps descent at `CFG.floatSp` and makes no landing
    height fatal. The solver's `candidates()` never offers FLOATER, so every
    level's proven solution, load-bearing proofs and slack margin ride the
    four original mechanics; the two floaters per level are pure player-side
    slack. BUILDER shares the law (#3863): `candidates()` never offers it and
    never spends planks, so proven scripts replay unchanged — its 12-plank
    cargo is the sixth skill's player-side slack (see Builder below).
- `levels.js` — levels CARVED from solid rock in code (IronKeep lesson), each
  with a `proves:` list lemcheck re-solves at zero supply (a skill you can take
  away is decoration) and a slack pass (one fewer of every supply the winning
  script consumes must still win — lemcheck's slack loop is the reference
  implementation AGENTS.md points at).
- `index.jsx` — canvas painter + shell. Original look: sky gradient, parallax
  ridges, clouds; the floater rides a striped canopy even while walking, as in
  the original (#3827); the skill panel docks at the top edge (`layout.js`,
  clear of the pad zone); attract replays the solver script with a cursor
  ghost; SPACE/tap assigns. All audio synthesized at runtime via
  `audioController` (deploy is a swoosh, the drown a soft splash + descending
  "oooh", never a harsh splat; drowned lemmings sink — no corpse floating).
- VirtualControls dispatches Arrows/Space; the pad's "A" assigns the selected
  skill; skill buttons ride Digit1–5 / pad slots. DEV hooks:
  `window.__lemTest` (probe/hint/give/teleport/kill) and `exposeGame` per
  docs/GAME-SHELL.md.

## Verify

```bash
npm run lemcheck            # ~2 s, no browser: solve all levels, rule pins
                           # (water rules, float immunity / slow descent /
                           # supply discipline, #3853 attract parachute), slack,
                           # determinism, readability, #470
npm run lemcheck -- --mutate  # planted load-bearing CFG bugs, each must go red
npm run lemcheck -- --map 2 # ASCII view of a level
npm run dev -- --port 5178 --strictPort   # then:
npm run lemplay            # real Chrome: keys/taps only, start→play→die→
                          # restart, pond pixels + live drown, Digit5 → FLOATER
```

The `--mutate` suite mutates CFG values only; the drown guard and the float
immunity clause were each additionally proved breakable by hand (comment the
guard out → the matching pins go red, restore → green). Keep sim rules
breakable — every pin here has survived a manual mutation.

## Honest gaps

- BUILDER is missing — the original's sixth skill (a 12-plank staircase that
  turns a crowd into a ladder). It is the one skill this engine has no
  plank-platform concept for; adding it means placed-cell geometry the solver
  must learn to reason about (and a re-solve of every level).
- Float-while-digging (the original's floating lemming chews straight down
  through dirt while descending) does not port to the horizontal-tunnel digger;
  it needs either a second dig mode or a rethink of the dig model.
- **DISCLAIMER** (#3859): water NEVER flows and never will — the 1991
  original's water is static; draining ponds are a Lemmings 2 mechanic.
  What the original DID have, ponds everywhere, shipped in #3859; flowing
  water is out of scope by fidelity, not an open gap.

## Closed

- #3864 — blocker-wake: the block is one-shot like the original. A CLIMBER
  treats a blocker ahead as a handhold — mounts his head, lands on the far
  side (ground if ground, the pond if that's what the far side is) — and any
  live body crossing the head line spends the block: `releaseBlocker` puts the
  blocker back to `walk` in the direction he faced when he blocked (at a pond
  rim that walks him under — the original judges the player's shoreline).
  `traffic` keeps turning non-climbers; corpse-blocking untouched. THE SPIRE
  ships `block: 1` so the law is live on the marquee board: the solver spends
  it at the west pond rim (attract shows the line) and SPIRE carries block +
  climb together, so a player can open their own line — climb over your own
  blocker, watch it wake. Re-solve: all four levels win with slack,
  load-bearing proofs and determinism unchanged; three new pins (climb-over +
  release, head-line landing, uncrossed-line-holds) with the release neutered
  as the red drift. **CLOSED by #3864**

- #3859 — ponds everywhere: three of four boards were drought-dead and the
  solver could not even SEE a pond rim (its edge test was AIR-only, so no
  autopilot or attract replay would ever block one). Now every level carries
  open water — THE DOOR and THE LEDGE voids have shores at the walking row,
  so the punishing east walk ends in the original's drown (splash, sink,
  tone) instead of a silent splat below the map; THE SPIRE gained a second
  body, a bay east of the exit plinth; THE MASSIF's pace-ground west of the
  massif drowns dawdlers at the west foot, and the level ships a second
  BLOCKER because holding that rim is now load-bearing solver work (slack
  rule — the solver spends one there in its winning script). The edge rule:
  `candidates()` reads WATER at foot level as floor-gone — a blocker is
  offered at the pond rim, and the blocker's own footing must be `solid`,
  never a pond cell; CLIMB stays AIR-only (nothing to grip across water).
  Winning scripts held: all four levels win with slack, loads-bearing and
  determinism proofs replay unchanged (void deaths switch cause fall→drown,
  counts identical). **CLOSED by #3859**

- #3853 — attract-parachute: the demo now spends its OWN float charges showing
  the fifth skill. `attract.js` exports a pure picker (`demoFloatPick`): an
  unsripted lemming caught airborne gets the canopy first (DOOR opens one
  mid-air at the step-off); after a 5 s grace the first unsripted walker wears
  one, and the canopy auto-opens on its next fall by the sim's own law. Two
  canopies per level cycle, never over the pond (floaters drown — mockery, not
  rescue), never a script target (proven lines are never re-timed), and the
  player's supply is untouched because `startPlay` rebuilds the level.
  lemcheck pins the picker, the per-level demo replays (win + canopy + supply
  cap) and a live Chrome run paints the striped canopy (16 cream + 8 red px).
  **CLOSED by #3853**
- #3849 — fatal fall distance: `CFG.maxFall` was 7, the original kills past ~3.
  Now 3 — falls off the spire kill, floaters become precious. THE SPIRE's east
  stair dropped its last step ~6 tiles to the floor (the old lax value hid it);
  carved down to ground level and re-solved (win 4/4, climb still load-bearing,
  slack holds at climb 5; MASSIF/DOOR/LEDGE proved unaffected pre-claim). The
  fatal pin is now **absolute** — 4 tiles must die, a stepped descent lands
  within 3 — because the old relative pin (`maxFall + 1`) stayed green at 7 and
  could not catch drift; mutation `maxFall = 7` covers the same hole. **CLOSED by #3849**
- #3844 — OH NO! death cry: a shared two-syllable synth wail (worried "OH",
  falling "NO!", sawtooth) answers EVERY death batch — fall, drown, bomb — under
  the per-cause stings, and a hand-drawn 5×7 bitmap `OH NO!` sprite pops on the
  corpse, rising and fading on the WORLD clock (FF-true, cap 4, oldest recycled).
  Death events carry `x,y` for the sprite; `lemcheck`'s OH NO! section pins all
  three causes plus the shell wiring. **CLOSED by #3844**
- #3827 — FLOATER skill (parachute: capped descent, no fatal landings, canopy
  on show while walking, Digit5/L1, deploy swoosh). **CLOSED by #3827**
- #3828 — water + drown rule, THE SPIRE's west-foot pond. **CLOSED by #3828**
- #422 — docked skill bar, badges, hover ring, re-grant guard. **CLOSED by #422**
- #432 — press/preview/release pointer gesture. **CLOSED by #432**
- #470 — visible assign result (grant flash, refusal sound, charge accounting).
  **CLOSED by #470**
- #1637 — WATCH autopilot replay with sound. **CLOSED by #1637**
