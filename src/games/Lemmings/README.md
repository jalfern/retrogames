# LEMMINGS-LITE

Four skills, one crowd, a solver that proves every ledge is solvable before it
ships. The original: Lemmings (DMA Design, Amiga, 1991). The cut is by design
(issue #65 asked for a lite build): one-click skill assignment, agent-per-entity
sim, deterministic replay — the gate is a Node solver that may only speak like a
player (`{tick,id,skill}` commands, no peeks), so a level the solver cannot
clear with its own supplies fails the build.

## Engine

- `sim.js` — pure forward model (no DOM). AIR/DIRT/STEEL/WATER; per-lemming
  state machines (walk/fall/climb/dig/block/bomb/corpse) stepped in id order.
  `solve()` is the same greedy planner attract mode replays; `replay()` applies
  a recorded script (a command lands on the tick AFTER its stamp) and lemcheck
  demands bit-identical hashes. **Determinism is the contract**: anything the
  solver can see, the player can reproduce.
- Rules that carry the game: climbers need DIRT handholds (steel refuses,
  overhangs refuse); the digger TUNNELS one tile at a time so the swarm follows
  single file; bombs clear dirt only, chain other bombers, and corpses block
  walkers; a fatal fall is > `CFG.maxFall`; **water drowns** (#3828) — chest or
  feet in a WATER cell kills from any height, water is not ground, and neither
  dig nor blast yields it. THE SPIRE's west-foot pond turns the old free west-
  pacing of failed climbers into a drain.
- `levels.js` — levels CARVED from solid rock in code (IronKeep lesson), each
  with a `proves:` list lemcheck re-solves at zero supply (a skill you can take
  away is decoration) and a slack pass (one fewer of every supply the winning
  script consumes must still win — lemcheck's slack loop is the reference
  implementation AGENTS.md points at).
- `index.jsx` — canvas painter + shell. Original look: sky gradient, parallax
  ridges, clouds; the skill panel docks below the playfield (`layout.js`);
  attract replays the solver script with a cursor ghost; SPACE/tap assigns.
  All audio synthesized at runtime via `audioController` (the drown is a soft
  splash + descending "oooh", never a harsh splat; drowned lemmings sink — no
  corpse left floating).
- VirtualControls dispatches Arrows/Space; the pad's "A" assigns the selected
  skill. DEV hooks: `window.__lemTest` (probe/hint/give/teleport/kill) and
  `exposeGame` per docs/GAME-SHELL.md.

## Verify

```bash
npm run lemcheck            # ~2 s, no browser: solve all levels, rule pins,
                          # water rules, slack, determinism, readability, #470
npm run lemcheck -- --map 2 # ASCII view of a level
npm run lemcheck -- --mutate # four load-bearing CFG bugs back, must go red
npm run lemplay           # real Chrome: keys/taps only, start→play→die→restart,
                          # pond pixels + live drown through the input path
```

The `--mutate` suite mutates CFG values only; the drown guard itself was
proved breakable by hand (comment `if (inWater(g, L))` in `step()` → four
§water pins red, restored). Note `#3440` lineage: keep sim rules breakable —
every pin here has survived a manual mutation.

## Honest gaps

- Blockers never wake: the original turns a blocker back into a walker once
  another lemming climbs over him; here the block is permanent. Levels are
  designed for permanent blocks, so the fix must land with a re-solve.
- Fatal fall distance is 7 tiles; the original kills past ~3. Tightening it
  changes THE SPIRE's descent margins — re-prove with the slack loop, never
  by eye.
- No OH-NO! — the original screams it over every death; deaths here are only
  the per-cause synth stings, no shared death cry or oh-no text sprite.
- Water is static: no level currently carries a second pond, nothing flows
  into one, and a bomb that punches a wall INTO a pond drains nothing — the
  original never flowed either, but it had ponds everywhere; THE SPIRE has one.
- No BUILT stack steps (the builder's 12-step ladder) — 4-skill cut by issue
  #65 (**DISCLAIMER** — the -LITE is the issue's brief, not an accident).
