# BUBBLE BOBBLE — engine notes

Taito's 1986 cave clear-out: blow bubbles, trap enemies, pop them for escalating
chains. One screen per cave, one hundred caves, ten themes. Every sprite, tile,
font and note is drawn/synthesized at runtime (`index.jsx` painters +
`AudioController`) — there are zero game assets in this folder, per
`docs/ART.md`.

## File boundaries

| File | Job | Purity |
|------|-----|--------|
| `levels.js` | 100 generated caves: platform/water layout (no ladders — jump-reachable by construction), enemy roster, spawn spread; cave 1 is the arcade's round-1 cave, by hand | pure data + deterministic generator |
| `sim.js` | the whole game as `step(state, inputs)` — physics, traps, chains, letters, water, lightning, Blubba, boss, door | **pure, zero `Math.random()` after seeding; no DOM, no canvas** |
| `planner.js` | the autopilot: rollout-based dodge + graph BFS movement + pop/engage/loot priorities | pure; `plan(seed)` returns a proven script |
| `index.jsx` | React shell: fixed-timestep loop, painters, HUD, attract replay, VirtualControls, DEV hook | the only file that touches the browser |
| `scripts/bobcheck.mjs` | the Node gate: geometry audit of all 100 caves + rule pins + pilot + determinism + mutants | runs with no browser |
| `scripts/bubbleplay.mjs` | Chrome advisory tier: real keys only, pixels vs the sim | verify tier, not the gate |

The sim importing nothing browser-side is the contract: it is why `npm run
bobcheck` can fail a level design before a render exists, and why the attract
demo (`planner.plan(0)` replayed tick-for-tick) is a *proven* run rather than
a scripted animation.

## The rules that are load-bearing

- **Trap, then pop.** An enemy touching an expanding bubble becomes `trapped`
  and rides it up. Touching a trapped bubble pops it, and consecutive pops in
  one cave climb the chain pay table `[100, 200, 300, 400, 500, 1000, 2000,
  3000, 4000, 5000, 6000, 8000, 10000]`; each pop also drops fruit. Trapped
  bubbles **do not age** — a *free* bubble shrinking untouched past ~180 ticks
  bursts and its passenger comes out **angry** (faster, lethal on touch until
  re-trapped) and the chain resets to 0.
- **Chain ≥ 4 drops a transform** (red = fire breath, cyan = twin bubbles,
  green = speed, pink = long bubble — one active at a time, timed). **Chain ≥ 9
  drops LIGHTNING**: zap kills every boss-hp-1 enemy on screen and is the only
  thing that hurts von Blubba.
- **E-X-T-E-N-D.** Every 7th bubble inflated carries one letter in order;
  popping a letter bubble collects it, and completing EXTEND awards a 1UP
  (`kind:'extend'` event — the ledger proves it, not a score bump).
- **Von Blubba.** A cave lingering past `max(2400, 5400 − level·30)` ticks
  spawns Blubba from a top corner. Lightning kills him (+500, 3 caps); after
  3 lightning kills he becomes untouchable and stays.
- **Water** (caves 31–40, 51–70): walkers crossing a water row become **snails**
  (slow, still trappable); leaving water reverts them.
- **Door discipline.** The exit door stays welded shut until `enemies.length
  === 0` *including Blubba*, and `end` requires the player to be at the open
  door. A cave is never winnable by timer.
- **One-way platforms, no ladders.** The arcade has no ladders: up moves pass
  through platforms; `down` drops through; the generator keeps every row
  exactly a jump (2 rows) above a reachable row and each span meeting the one
  below within 2 columns, so every cave is climbable by jumps alone. The cave
  is boxed in by thick side walls and the ceiling: bubbles **bounce** off the
  walls and off the ceiling under the HUD, and a trapped bubble at the
  ceiling drifts along it.
- **Max-size bubbles block your own walk**, exactly like the original's wall
  of bubbles.
- **Bosses** (every 20th cave): 3 direct bubble-hits, +BOSS_POINTS, then the
  roster empties and the door opens.

## Harness honesty

`bobcheck.mjs` (39 checks, in the CI `static` gate as `bobcheck -- --mutate`):

- an **independent** geometry pass over all 100 caves (it re-derives
  reachability from the platform graph **by jumps alone** — no ladders exist —
  without running the sim: the generator promises a two-row jump chain
  floor→apex, and the audit recomputes it rather than trusting the promise);
- a **walls** pass: a bubble blown into the side wall bounces back into the
  field, a trapped bubble at the ceiling drifts along it, and a rising water
  bubble bounces off the ceiling instead of leaving the field;
- rule pins written against hand-made states (trap→pop ledger, escape-angry,
  letter sequence, water→snail revert, fire kill, transform table, lightning
  clears screen, Blubba spawn/caps/untouchable, boss 3-hit, door shut while a
  Blubba lives, one-way and drop-through, max-bubble block);
- the pilot on seed 0 must clear ≥1 cave, produce a real ledger (pops, fruit,
  chain ≥ 2), and die no more than 3 times (lives-1 slack);
- determinism: same seed + same inputs ⇒ identical `stateHash`;
- a testbed win-path that chains all 100 caves through their doors;
- 6 mutants (traps never escape, door opens while enemies live, chain pay
  never escalates, lightning clears Blubba, bubbles stick to the side walls,
  ceiling bubbles stop drifting) that **must** turn the suite red.

## Honest gaps / deviations (flagged for Jon)

1. **The chain pay table and Blubba timing are invented**, not transcribed
   from the arcade ROM (the real table is per-enemy and undocumented here).
   Polish issue asks Jon to confirm or replace.
2. **Pilot ceiling:** the autopilot reliably clears cave 1 on seed 0 (audited,
   hash-for-hash) but not deeper caves — level 2+ needs faster multi-tier
   clears before von Blubba's timer. When Blubba is on screen and the door is
   open, the pilot runs for the door with a dodge-scored rollout (the arcade's
   own answer). Attract = the proven cave-1 run replayed, which is honest but
   short.
3. Cave 1 is the arcade's round-1 cave, re-laid by hand; the other 99 are
   single-screen generated layouts, not the original's hand-authored rooms;
   enemy *kinds* are homages (Zen-Chan/Pulpul/Gouyu analogues:
   walker/hopper/swimmer + Batoya + Pengu), not sprite reproductions.
4. No item-shop, no bonuses timers per fruit decay stages, no two-player *screen*
   split (both dragons share the cave — co-op is the original's shape; P2 is
   keyboard WASD+F, CPU partner mode exists for phones/harness).

## Verify

```bash
npm run bobcheck            # Node, ~2s, 38 checks
npm run bobcheck -- --mutate  # + 3 mutants that must die
npm run bubbleplay          # Chrome, real keys only (needs `npm run dev`)
npm run lint:bob
```
