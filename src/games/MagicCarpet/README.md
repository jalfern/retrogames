# MAGIC CARPET — engine notes

Bullfrog Productions, MS-DOS, 1994 (#489; fidelity rework #1041). First-person
carpet flight over seeded rolling worlds; fly mana home to your castle until every
vault reaches its quota. RETRO bar: everything drawn at 320×200, nearest-scaled,
all art and audio synthesized at runtime.

## Layout

- `sim.js` — the pure deterministic machine: seeded heightmap (value-noise fbm +
  three cones over a 512u wrapping map) that spells DEFORM (craters, flooding),
  three worlds (`LEVELS`: quota, wizard hoard/HP, pearl count), carpet, monsters,
  wizard, spells, vault economy, `autopilot()` (drives the attract demo AND the
  harness), `stateHash()`. No browser APIs in here — the harness imports it directly.
- `art.js` — rect-composed pixel sprites (wizard, tower, castle stages, giant,
  wolf, cow, hut incl. burning + rubble, pearl, grimoire, balloon) + biome table.
- `index.jsx` — the shell: per-column voxel terrain march (adaptive step,
  silhouette top + occluder distance per column used to clip sprites behind
  hills), checker dither + slope shade + haze, dusk sky with parallax sun and
  clouds, carpet corners/hands/crosshair + carried-orb halo, the blue-stone HUD
  (radar, VAULT bar with per-world ticks, CARRY pouch, hearts, spell slots,
  WORLD n/3), the fixed-timestep loop, the `?` pause, VirtualControls, DEV hooks,
  and the `window.__game` contract.

## Rules that are load-bearing (each is a carpetcheck assertion)

- Bank-by-delivery: pearls follow the carpet (magnet 16u) into the carried
  pouch; hovering within 26u of the castle drains 3/tick into the vault. The
  VAULT is the score and the win check; carrying never wins by itself.
- Death spills the pouch (`spilled`), the vault endures: with vault > 0 you
  respawn at the gates (high, shielded, 240-tick spawn-invulnerable); with an
  empty vault the flight ends.
- Three worlds (`LEVELS`, quotas 115/160/175): banking the quota regenerates the
  whole world (terrain, pearls, huts, monsters, fresh wizard hoard); spells
  learned and the carried pouch transfer; clearing world 3 wins.
- Terrain reshape: every blast punches a crater into the heightmap (`crater()`,
  quadratic falloff; fireball r14d10, lightning r10d8, tower fall r18d11).
  Craters sunk below WATER flood with the sea. Wizard death craters his tower.
- Fire: blasts scatter scorch marks and ignite nearby huts; a burning hut falls
  to rubble after 200 ticks; wolves respawn from scorch marks on a 360-tick
  clock (while the monster cap holds).
- Mana conservation: `vault + pouch + alive pearls + wizard hoard` moves only by
  monster bounty (+), spell cost and spills (−); a world reset rebases it (the
  harness reads the `level` event's `reset` payload + new world's supply).
- Acquisition risk: each grimoire flutters toward you within 18u and has one
  book, 80% learn chance per touch with a 90-tick cooldown; failures stay in
  the world and are retryable.
- Two hands: left (Space/A) and right (X/Z/B); 1–6 assign left, Q cycles right;
  casting SPENDS the carried pouch, not the vault.
- The carpet cannot crash: it banks (turning bleeds 78% of speed, turn 0.065)
  and auto-rises over ridges; holding down bottoms out above terrain, never below.
- Wolves only bite carpets flying low (within 10u of the ground) — altitude is
  armor, like the original. Giants keep 55u off your castle; respawn is safe.
- Charge-glide: holding boost (`inp.boost`; Shift, or a held ▲ in the shell)
  flies at 1.6× cruise with turns dampened to 0.55× — wider radius, no mana.

## Verify

```
npm run dev                # another terminal
npm run carpetcheck        # 30 checks: boot, determinism, three-world win,
                           # delivery/spill/death, craters (fire + lightning),
                           # hut burn-to-rubble, conservation across worlds,
                           # acquisition risk, charge-glide, hoard scatter,
                           # plus a headless-Chrome pass
CONTRACT_ONLY=magic-carpet npm run contractcheck
```

Mutation proof (done, 2026-10-25): changing the win check to
`gs.bank >= gs.quota * 100` turns the three equilibrium checks red and nothing
else; restored after. Balance: autopilot wins 60/60 seeds (slowest ~26.5k ticks).

## Honest gaps (the polish pass owns these)

- Six spells, not twenty. No clone/dissolve/shatter/invisibility/volcano, and
  no raise-terrain spell (the original's later games added one; MC1 itself only
  craters and floods).
- Three worlds, not the original's 45; no level-select or castle-spell menu;
  scoring is banked mana + kills + clears + time bonus.
- One rival wizard per world; the original ran five, each growing its own castle.
- Telekinesis holds and throws but carries only one creature and the throw
  doesn't knock over towers.
- Village populations are decorative huts — no villagers, no convert/burn moral
  economy, no prisoners.
- No anaglyph/stereo mode, no 3D sound. `?` pause carries the rules instead.
- Terrain is bilinear-height voxels with dither, not the original's 4-bit
  palette-cycling water.
