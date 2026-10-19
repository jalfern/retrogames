# MAGIC CARPET — engine notes

Bullfrog Productions, MS-DOS, 1994 (#489). First-person carpet flight over a
seeded rolling world; gather mana to your castle until the world returns to
equilibrium. RETRO bar: everything drawn at 320×200, nearest-scaled, all art and
audio synthesized at runtime.

## Layout

- `sim.js` — the pure deterministic machine: seeded heightmap (value-noise fbm +
  three cones over a 512u wrapping map), carpets, monsters, wizard, spells, mana
  economy, `autopilot()` (drives the attract demo AND the harness), `stateHash()`.
  No browser APIs in here — the harness imports it directly.
- `art.js` — rect-composed pixel sprites (wizard, tower, castle stages, giant,
  wolf, cow, hut, pearl, grimoire, balloon) + biome table.
- `index.jsx` — the shell: per-column voxel terrain march (adaptive step,
  silhouette top + occluder distance per column used to clip sprites behind
  hills), checker dither + slope shade + haze, dusk sky with parallax sun and
  clouds, carpet corners/hands/crosshair, the blue-stone HUD (radar, mana bar,
  hearts, spell slots), the fixed-timestep loop, the `?` pause, VirtualControls,
  DEV hooks, and the `window.__game` contract.

## Rules that are load-bearing (each is a carpetcheck assertion)

- One mana pool: possessing a pearl banks it into the castle store instantly
  ("the balloons fly it home" — the original's transport is abstracted to zero
  friction so the economy reads on a phone). Casting SPENDS the store.
- Win: store ≥ 180 (QUOTA). The level's supply is ~390 (56 pearls ≈ 224,
  monster bounties 68, the wizard's hoard 90 + whatever he absorbs), so the
  wizard is optional but a ~200-mana spell budget is not.
- Mana conservation: `mana + alive pearls + wizard hoard` changes only by
  monster bounty (+) and spell cost (−). Killing the wizard scatters his hoard
  as pearls.
- Acquisition risk: each grimoire has 1 book, 80% learn chance per touch with a
  90-tick cooldown; failures stay in the world and are retryable.
- Two hands: left (Space/A) and right (X/Z/B); 1–6 assign left, Q cycles right.
- The carpet cannot crash: it banks (turning bleeds 78% of speed) and
  auto-rises over ridges; holding down bottoms out above terrain, never below.
- Death: with mana in the castle you respawn at its gates (shield, full HP);
  with an empty store the flight is over. The castle regenerates HP in range.
- Fire that touches ground leaves scorch marks; wolves respawn from scorch marks
  on a 360-tick clock (while the monster cap holds).

## Verify

```
npm run dev                # another terminal
npm run carpetcheck        # 21 checks: boot, determinism, conservation, risk,
                           # death/respawn, hoard scatter, equilibrium ×2 seeds,
                           # plus a headless-Chrome contract pass
CONTRACT_ONLY=magic-carpet npm run contractcheck
```

Mutation proof (done, 2026-10-18): changing the win check to
`gs.mana >= QUOTA * 100` turns both equilibrium checks red and nothing else;
restored after.

## Honest gaps (the polish pass owns these)

- One world per flight — the original's 45 spherical worlds, level select and
  castle-spell menu are out of scope; scoring is banked mana + kills + time bonus.
- Six spells, not twenty. No clone/dissolve/shatter/invisibility.
- Telekinesis holds and throws but carries only one creature and the throw
  doesn't knock over towers.
- The wizard is one AI; the original ran five rival wizards per world.
- No anaglyph/stereo mode, no 3D sound. `?` pause carries the rules instead.
- Terrain is bilinear-height voxels with dither, not the original's 4-bit
  palette-cycling water.
