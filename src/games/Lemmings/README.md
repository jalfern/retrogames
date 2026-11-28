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
    next floor — decide step / wall / fall. Matter: AIR/DIRT/STEEL/WATER.
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
  - Skills: BLOCKER, BOMBER, CLIMBER, DIGGER, **FLOATER** (#3827). Climber,
    digger and floater are flags for life — re-granting any of them refuses
    rather than burning supply (#422). The floater's parachute caps descent at
    `CFG.floatSp` and makes no landing height fatal. The solver's
    `candidates()` never offers FLOATER, so every level's proven solution,
    load-bearing proofs and slack margin ride the four original mechanics; the
    two floaters per level are pure player-side slack.
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
                           # supply discipline), slack, determinism,
                           # readability, #470
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
- Blockers never wake: the original turns a blocker back into a walker once
  another lemming climbs over him; here the block is permanent. Levels are
  designed for permanent blocks, so the fix must land with a re-solve.
- Fatal fall distance is 7 tiles; the original kills past ~3. Tightening it
  changes THE SPIRE's descent margins — re-prove with the slack loop, never
  by eye. (Floaters already ignore it entirely, as in the original.)
- Float-while-digging (the original's floating lemming chews straight down
  through dirt while descending) does not port to the horizontal-tunnel digger;
  it needs either a second dig mode or a rethink of the dig model.
- The attract demo never opens a parachute — the solver doesn't need floaters,
  so the demo shows four skills while the game offers five.
- Water is static: no level currently carries a second pond, nothing flows
  into one, and a bomb that punches a wall INTO a pond drains nothing — the
  original never flowed either, but it had ponds everywhere; THE SPIRE has one.

## Closed

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
