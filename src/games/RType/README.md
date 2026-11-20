# R-TYPE — S1 "Armament" engine notes (#2808)

The first stage of the 1988 Irem side-scroller: the biomech cruiser **Phase 1**
looms out of the convoy, its maw cycles open on a timer, and the pod force
escorts you to the core.

## Verified
```bash
npm run dev -- --port 5178 &      # or any free port + RTYPE_URL
node scripts/rtypecheck.mjs       # sim + browser: 41 checks incl. the #2818 polish laws
node scripts/rtypecheck.mjs --mutant   # red as `armour-blind p1 core`
```
`rtypecheck` covers: the camera law (right only, the left edge grinds), one-hit
death + mercy + death-reverts-the-arm, the capsule cycle (Red → Laser → Wave
→ Options + Double, Wave charges 1–4), the pod-3 rescue, the Phase-1 law
(core armoured while the maw is shut), the 20-second maw cycle at the locked
camera, hunter home-phases (lasers straighten after ~4 s, divers after one
pass, larvae die when the carrier dies), and the winnability proof (autopilot
clears ≥ ⅓ of seeds 1..12).

## The design decisions worth knowing
- **#2818 polish (QA lane):** pods ease into their hover (speed bleeds to a
  creep, bob ramps in from the settle); volley gaps are arithmetic per pod,
  never a fixed 170; the maw announces its cycle (`mawopen`/`mawshut` events
  → horn / seal-clank); a broken core sends the hull recoiling right under a
  death roll with rakes across its face; mercy reads as a ghost + shield
  outline, not a vanished ship. These stay RNG-free on purpose: gs.rng draws
  are byte-identical to the tuned baseline, so the winnability law measures
  the same waters the forge calibrated.
- **`src/games/RType/sim.js` is DOM-free and seed-deterministic** — all random
  rides `gs.state.rng` (mulberry32). The React shell is thin; the contract
  harness (`__rTest`) and the nightly bot drive the same sim.
- **Camera lock**: the right stop is `camX + W - margin`; latched when the
  hull nose reaches the screen. While latched the camera only creeps at the
  hull's own 0.9 px/tick; it clears when the core dies (the dreadnought's
  death roll carries the edge away) — and un-latching grinds everything the
  rulebook grinds: hull segments, turrets, mines included.
- **The maw law** has three parts, all from the arcade: open for 3 s on a 20 s
  cycle while locked; fire-lane shots (|dy| < 10) only damage the core while
  open; pods halt at the camera's right edge rather than fly off-screen, and
  will not shoot from behind the camera.
- **Missiles home for 4 s then straighten** — a missile can never loop back
  across the screen; that budget is the difference between Irem fair and
  impossible.
- **Autopilot = lane potential field** (shared by attract and the winnability
  proof): scores candidate lanes by time-to-impact across bullets, divers,
  missiles, slabs and larvae, suppresses launchers at lane height, and dives
  into the maw lane in Phase 1 while strafing the cycle in Phase 2.
- **Art** is 320×224 nearest-neighbour, all hand-laid pixel tables in
  `art.js` — including a 5×7 font for the HUD (the repo bans font *assets*;
  drawing glyphs by hand is how the arcade did its overlay anyway).

## Known gaps (S2+)
Core speed-up after 1000, Stage 2 "Dobkeratops", the full capsule list
(Speed Up, Half-Capsules), the Flash/Laser weapon trade-off tuning, co-op.
The registry entry is `private` until the arcade introduction lands.

## Harness
- `scripts/rtypecheck.mjs` — sim laws + browser leg + mutant proof
  (`armour-blind p1 core`, planted by flipping the maw check in `sim.js`).
- `__rTest` DEV hook: `probe()` / `setup({…})` / `autopilot(on)` — setup can
  warp to Phase 1, open the maw, arm the reactor core early, spawn the pod
  force or the cap.
- Contract id `r-type` in `contractGames.mjs` (GAMES + PATTERNS) and the
  nightly soak roster (`nightlybot.mjs`).
