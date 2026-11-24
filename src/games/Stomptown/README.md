# STOMPTOWN

Arcade city-breaker, promoted from Jon's prototype (`prototype/stomptown`, issue #3094)
into a full registered title — with its own cast and name: **GROG** the ape, **ZARRA**
the reptile, **FENRIS** the werewolf. No names, characters, credits or audio from any
1980s original ship here; `stompcheck` pins that law.

Art bar: **MODERN** (per the issue — the prototype *is* the look-spec): a dusk vector
city drawn at 1280×720 with `imageSmoothingEnabled = false`, gradient title, neon roof
edges, parallax skyline.

## Files

- `sim.js` — the pure simulation. Zero DOM, zero `Math.random`; every random comes from
  the seed, so seed + pads ⇒ identical `stateHash` (#494). Rules: walk/climb/punch/eat,
  windows (`0.45 FOOD · 0.35 CASH · 0.12 BOMB · 0.08 STUN`), the military (tanks/cars/
  choppers, harder each dawn), revert-and-blimp-rescue (day score rewinds to dawn),
  3 lives (+1 per new city, cap 6), 12-city tour (`end: 'won' | 'over'`).
  `damagePlayer` is exported so the harness can deal an exact hit at a known tick.
- `planner.js` — `plan(gs)`: the autopilot. Attract demo and the harness win-proof are
  the *same* brain.
- `attract.js` — attract copy (lines ≤ 44 chars, `PRESS ANY KEY TO STOMP`).
- `art.js` — DOM-free renderer (sky, skyline rows, towers, rigs, monsters, HUD).
- `index.jsx` — the shell: fixed-timestep loop, input, events→sfx/particles,
  `exposeGame('stomptown')`, `__stomptownTest` DEV hook. `snapshot`/`restore` are
  omitted on purpose (#391): `gs.rng` is a closure JSON cannot copy.
- `../../utils/AudioController.js` carries the `stomptown` music bed (synthesized).

## Rules at a glance

PUNCH towers (300 each, combo-scaled) until they fall flat; facades are climbable —
UP grabs a side, UP/DOWN scale it, ←/→ pushes off, roofs pay down-punches. Smash
windows for loot; EAT fleeing civilians (+16 HP, combo). Empty HP bar → shrink to
human, the news blimp hauls you back at full power but the day's score unwinds to
dawn. Clear all towers to bank +1000 and roll to the next city. Twelve cities = the
tour.

## Verify

```bash
npm run stompcheck            # 69 Node checks: rules, loot statistics, pilot tour win,
                              # determinism, attract-copy + ownership pins
node scripts/stompcheck.mjs --mutate   # 10 mutants, all must die
npm run dev -- --port 5173 --strictPort
# → /retrogames/stomptown
```

The autopilot razes day 1 in ~28 s of world time and wins the whole 12-city tour
(seed 11: score 144 380, 6 lives left) replay hash-for-hash.
