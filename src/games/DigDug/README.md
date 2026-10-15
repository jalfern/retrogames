# DIG DUG (`/dig-dug`)

The 1982 Namco pump: dig tunnels, harpoon and inflate the Pookas until they
pop, drop the boulders, and catch the last one running. Every rule lives in
`sim.js` — a pure `(state, input)` step with zero DOM and zero `Math.random`
(spawn order rotates by seed), so `npm run dugcheck` audits the round the
player actually gets, in plain Node.

## File boundaries

- `sim.js` — the grid, harpoon/pump, enemies, Fygar fire, rocks, veggies,
  rounds, `stateHash`.
- `planner.js` — the autopilot: a forward **rollout** of the real sim scores
  every move (the model is the game, not a hand-drawn threat ring). The
  attract demo replays this exact proven run, tick for tick.
- `levels.js` — the three round rosters, rock/veggie placement, point tables.
- `index.jsx` — the shell: fixed 288x224, fixed timestep, attract/over
  screens, the `__dugTest` DEV hook, DebugKit panel.
- `scripts/dugcheck.mjs` — the Node gate (static CI). Run `-- --mutate` for
  the mutant arm.

## Load-bearing rules

1. **The pump chain is a stage machine.** Hook a SOLID enemy (stage 1), each
   further pump press inflates one stage, stage 4 pops, open-air kills pay
   half of layer 0 (`300/2 = 150` for a Fygar — the number Jon's QA note
   caught floating over the attract title), deep dirt pays the classic big
   numbers (Fygar layer 3 = 1200). Ghost (underground) enemies cannot be
   hooked. Each stage pin is against a literal number in `dugcheck`.
2. **Rocks fall only when their support column empties**, crush everything
   they pass (`300 * (layer+1) * n` each), and veggies sprout only after the
   SECOND dropped rock.
3. **Fygar fire runs straight down an open row**; leaving the row dodges it.
   The last survivor re-inflates, drops the harpoon and flees to the top
   corner.
4. **Spawns never stack.** Two live enemies on one tile read as a single
   blob (the round-2 double Fygar sat stacked ~70 ticks before splitting).
   A spawn therefore rotates to the nearest clear air column and retries next
   tick if all three are occupied — `dugcheck` replays all 9 graded runs and
   fails on any pair within 6px for 10+ consecutive ticks (side-by-side
   tunnel walking is legitimate and is not flagged).
5. **The pilot dodges with the game itself.** Every dodge/approach step is a
   48-tick rollout of the real `step()` with the move held: a hunter rounding
   the corner, Fygar fire, a rock on the column — all of it is the game, so
   the check demands a deathless full clear on every spawn rotation (seeds
   0-8), plus the lives-1 slack on round 1. The v1 flood-scored dodger lost
   on six of nine rotations because it only saw dirt.

## Honest deviations / known gaps (the QA lane's starting list)

- Enemies spawn from the air row in three seeded corner columns, not from the
  original's ground holes; the last survivor's corner lap is a simplification
  of the original's re-entry.
- No 2-player hot-seat, no hi-score table beyond the local 8-entry board.
- Music/SFX are synthesized riffs in the original's rhythm, not the Namco
  melodies (per the no-assets rule).
- The pilot is the demo, not a promise about player deaths: a fresh human
  game starts with 3 lives and the classic's death/restart loop.
