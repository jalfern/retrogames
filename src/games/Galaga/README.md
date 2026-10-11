# GALAGA

The arcade's scripted-swarm shooter (route `/galaga`). 224×288, fixed 60 Hz,
**zero `Math.random()` in the sim** — the entire game is a pure function of
`(state, input)`, which is what lets the harness audit it in plain Node.

The whole point of this title is the contract between the four modules:

| File | Job | Who proves it |
|------|-----|---------------|
| `paths.js` | every enemy flight is a **named, sampled path** (`zig`, `swoop`, `loop`, `beam`, `carry`, `rejoin`, entries) | `galactcheck` PATH AUDIT — every path is sampled offline: continuity (step ≤ 9 px), entries land exactly on their slot, loops return to their anchor, one-ways exit the bottom |
| `waves.js` | the three stages as scripts (`SWARM / BOSSES / GUARD`), formation math | audit + both harnesses |
| `sim.js` | one `step(gs, input)` — pure. Behavior tree `decide()` per enemy: **captive dives first → tractor beam (once/stage) → dive roster (max 2 divers)** | `galactcheck` LIVE AUDIT (same path audit re-run on the *actual* per-tick positions of a real run), TREE PINS, mutation suite |
| `planner.js` | the autopilot: lane-margin dodging + lead-aim, **lateral only** (the fighter owns one band) | its proven run IS the attract-mode demo, replayed tick-for-tick through the real `step()` |

## The capture chain (the title's actual feature)

The red Flagship runs the `beam` path once per stage; inside the band the
fighter is **captured** (a life, but `escorts` grows). The next stage the
captured fighter flies as a *captive* in the hive's formation — diving first,
shooting at you. Shoot **your own escort** down and it falls as a rescue
pod; catch the pod and you fly the **DOUBLE** (two fighters, two shot pairs).
`galactcheck` runs the chain in Node (79 checks incl. 4 mutants);
`galactplay` runs it in Chrome with **real key events only** (20 checks,
including steering into the visible beam by sampling the canvas the browser
actually painted).

## Rules that came from bugs

- **A dive never targets the wall columns.** `tx` is clamped to `[40, W-40]`
  or the autopilot (lateral-only) can be driven into an undodgeable corner.
- **The timer ends the stage, not the player** (classic rule): escaped bees
  re-form for the next assault.
- **Max 2 simultaneous divers** — pinned by a live-audit rule, and one of the
  four mutants (`diveMin=inf` must also make the audit *unable to observe any
  dive*, which is why the dive probe demands ≥3 dives before it can pass).
- The heist lesson holds: the frame catch-up is capped at **250 ms of world
  per frame**, so a slow runner slows the world instead of skipping it.

## Verify

```bash
npm run galactcheck          # Node: paths, live audit, tree, chain, mutants (~2 s)
npm run galactcheck -- --mutate   # + 4 mutants that MUST die
npm run galactplay           # Chrome, real keys (needs `npm run dev`)
npm run lint:galaga
```

`__galagaTest` (dev only): `probe()` (positions, band x, pt, evLog),
`start()`, `hash()`, `setup({wave, player, lives})`.
