# DEFENDER — engine notes

Williams arcade, 1981. Side-scrolling wrap-around planet shooter: you fly the
Jupiter fighter above a wireframe landscape, landers dive to abduct the five
humans standing on the surface, and you shoot them down, catch the falling
humans and haul them back to the ground. A human is gone for the rest of the
game once it hits the surface. #1473 seedpin batch 17 restored the dead
terminal (the Feb port could not score, lose a life or die) and put every die
on one seeded stream.

## What's faithful
- **Wrap-around planet** (4000 px world, camera and objects cross the seam).
- **Top radar scanner**: whole-planet dots — white ship, grey landers, red
  mutants, yellow humans — plus the camera window (split when it crosses the seam).
- **Abduction chain** (the signature): a lander dives to a human, hauls it up;
  shot mid-haul the human falls — catch it (+250) and deliver it to the
  surface (+500). A lander that reaches the ground **empty mutates into a
  mutant (1500)** and chases you; a lander that lands holding a human kills it.
- **Arcade score table**: lander 150, mutant 1500, catch 250, delivery 500,
  wave clear 1000, extra ship every 10,000. 3 lives, ~0.5 s death freeze (the
  cabinet holds the wreck on screen) + ~1 s dark + ~2 s blinking respawn grace.
  Wave clear resurfaces the wave (8 landers at wave 1, +1 per wave cap 12).
  Friendly fire is real — your own shots kill humans, like the original.
- **Feel (#1531)**: thrust hums while accelerating, diving landers flash a
  flickering tractor beam at their target with a low telegraph pulse, wave
  fanfares ramp pitch per wave, lander/mutant sprites pulse, humans shuffle on
  a 2-frame walk, radar dots flicker on the scanner.
- **Look** (docs/ART.md, RETRO): black starfield with twinkle, white mountain
  wireframe, grey lander shells with tractor bar, red diamond mutants, small
  yellow humanoids, thrust flame, red/yellow score sheet under the radar.
- Attract mode flies the route on its own (chase + shoot) and is invulnerable;
  any key or tap starts (b16 pattern).

## Seed pinning (#1473)
`src/games/Defender/sim.js` is the whole simulation, pure and deterministic:
terrain, human placement, wave field, abduction/mutation jitter and explosion
particles all come from one `seedRng(seed)` (mulberry32). Human starts honor
`seedFromQuery()`; the feedback report carries `{tick,score,done,seed,lives,wave}`
and the QA drive contract is `exposeGame` id `defender`
(reset/tick/state/canvas). `snapshot`/`restore` omitted — the rand closure is
not JSON-serializable (#391).

## Verify
```
npm run defendercheck            # Node: determinism, score law, rescue chain, deaths, terminal,
                               #   + WITNESS: the WATCH patrol survives 20/20 seeds @150 s
npm run defendercheck -- --mutant   # pre-port bugs re-planted; every mutant must go red
npm run watchcheck -- --only defender  # seat pilot: one-tap ▶ WATCH, Y seat/takeover,
                               #   blips, idle-hands proof (browser, needs dev server)
npm run feedbackcheck          # floor law now 55 report+pin titles
npm run attractcheck           # attract layout rules
npm run lint:defender
npm run dev -- --port 5178 --strictPort   # slot b port; /retrogames/defender
```

## WATCH (#1637 batch 18)

Y seats `watchRoute` from `sim.js` — the SAME patrol the attract demo flies
and `defendercheck`'s WITNESS audits on 20 seeds (no forked brain; the old
local attractInput is deleted). The patrol chases the nearest enemy into firing
line, climbs clear of the terrain and holds altitude out of the dark. Any
driving key or a tap hands the wheel back (shared blips).

## Honest gaps

- The WATCH patrol is honest-proven, not perfect: WITNESS 20/20 survive a
  150 s patrol (min 4750 banked, 19/20 clear ≥1 wave) but it grazes ~1 hit
  per patrol and plays no defence of the abducted humans — tightening the
  route is a batch-19 candidate; the gate pins what is MEASURED, not wishes.
- No smart bomb, no hyperspace, no meteor-swarm bonus (documented 1981
  features left out of this port; the original's bonus table values 250/500/
  1000/10k are honored for what IS here).
- A hauled human dies near the top of the screen instead of the lander
  circling back down with it (original re-descends; simplification).
- Collisions within ~20 px of the wrap seam are skipped (20 px bodies on a
  4000 px world — the miss window is 0.5 %).
- Terrain collision is ship-only; landers clip the mountains visually by design
  (they hover above the ground line).
- Two-player mode not ported (original: alternating turns).
