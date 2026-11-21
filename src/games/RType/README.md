# R-TYPE — engine notes (#2808)

Irem's 1987 pod-shooter, built stage by stage. S1 "Armament": the convoy run
and the Phase-1 bio-ship. S2 "the force": the S.E.E.D. pod — capture, plug,
ram, deploy/retrieve — and the LASER charge arm. S3 "bits and the dread": the
bit chain and its orbit shield, plus the stage's second heart — LEG 2 and the
Phase-2 twin-core fortress.

## Verified
```bash
npm run dev -- --port 5178 &      # or any free port + RTYPE_URL / DEV_PORT
node scripts/rtypecheck.mjs       # sim + browser: 84 laws (S1, #2818/#2823 polish, S2, S3)
node scripts/rtypecheck.mjs --mutant   # red as `armour-blind p1 core` + `pod-blind` + `shield-blind`
```
`rtypecheck` covers the S1 laws — camera right-only + the grinding left edge,
one-hit death + mercy + death-reverts-the-arm, capsule cycle, wave charge
tiers, the pod-3 rescue, the Phase-1 maw law and its 20 s cycle, hunter
home-phases, winnability (autopilot clears >= 4 of seeds 1..12 — now THROUGH
both dreads, measured 5/12) — plus the #2818 polish laws, S2 (capture, plug,
ram, deploy→park, recall, grind, death-drop, tiered piercing lance), and S3:
bit capture order (newest at the nose, chain shoved back), the spare-S.E.E.D.
converts to a BIT (never a second shell), chained-vulcan extra streams,
three-is-not-a-wall, the four-bit orbit shield deflects rounds AND hunters
and grinds soft bodies but never bites armour, death strips the chain, LEG 2
handoff after Phase-1's wreck, twin cores gape on their own staggered clocks,
sealed plating eats fire, one core down enrages the survivor (double-speed
vents), both hearts down ⇒ STAGE CLEAR.

## The design decisions worth knowing
- **#2823 polish (QA lane):** capture is a ceremony (merge flash + sparks that
  converge INTO the nose, not just out); the plug pitch rotates per catch so a
  stream eaten by the shell reads as a stream; a plugged hunter pops with a
  cyan ring + white core; a deployed shell keeps a wobbling 1-px energy tether
  to the ship (skip when attached/pilot-down); lance tiers THICKEN with charge
  (4/6/8 px + side-glow) on top of the documented lengths; a fresh deploy gets
  `POD.dockGrace = 10` ticks of air before proximity can re-dock it (commanded
  recall is NOT gated — the B-press law stays instant); and armour clamping the
  shell pushes a `strain` event the shell throttles (8-tick gate) into a
  churning friction grind. None of it draws gs.rng — the tuned stream and the
  winnability law are untouched.
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
  rulebook grinds: hull segments, turrets, mines, pods.
- **Force-pod law (S2)**: states `attached | fly | park | return`. B (or C)
  toggles deploy/recall; a parked shell holds at `camX + W - 14` so it never
  leaves the screen; touching the ship re-docks; armour clamps it
  (`pd.x = wall - rad`) rather than dying — the shell survives by refusal,
  but the left wall still grinds a shell the pilot abandons. Attached, the
  shell burns with the pilot (killShip drops it); a deployed one outlives its
  pilot and can be picked up again next life.
- **POD is a press-verb, so the shell latches it** (`podQ` in index.jsx, the
  Double Dragon kick-queue pattern): synthetic taps from bots complete inside
  one 16 ms sim tick and a level-read would miss them entirely. The edge
  detection lives in the SIM (`gs.bHeld`), the latch lives in the shell —
  keyboard humans and QA bots take the same path.
- **Laser vs wave (both charge arms)**: the capsule cycle is VULCAN → LASER →
  WAVE. The lance is short, fast (6.2 px/tick) and scales by charge tier
  (length 24/42/62, damage 1/2/3 — tier 3 flats a turret); the crescent is
  slow, tall and sweeps a lane. Both pierce; both spend themselves on armour.
  The harness Phase-1 browser leg PULSES the trigger for this reason: with a
  charge arm in hand a dead-held key charges forever and never fires.
- **Maw law** (S1, still the stage's heart): open ~3 s on a ~20 s cycle while
  locked; fire-lane shots only damage the core while it gapes.
- **Missiles home for 4 s then straighten** — a hunter can never loop back
  across the screen; that budget is the difference between Irem fair and
  impossible.
- **Autopilot = lane potential field** (shared by attract and the winnability
  proof): scores lanes by time-to-impact across bullets, divers, missiles,
  slabs and larvae, suppresses launchers at lane height, dives into the maw
  lane while strafing the cycle. The charge arms release when the lane
  breathes (`pad.a = risk > 18` for wave AND laser). It never deploys the
  pod — attached plugging is pure upside for it; human pod-work is on top
  of the proven floor.
- **Art** is 320x224 nearest-neighbour, all hand-laid pixel tables in
  `art.js` — including a 5x7 font for the HUD (the repo bans font *assets*).
  The S.E.E.D. is a cyan ball with a band walking down it (rotation sells
  it); the force capsule is the weapon capsule's silhouette in blue with a
  white spark. Beware `Date.now() >> 2` for animation frames — >2^31 ms
  overflows int32 into negative indices and `drawImage(undefined)` throws
  every frame.

- **Bit chain (S3)**: slots `nose → tail → top → bottom`, newest-first (the
  original shoves the older drones down the line). A spare S.E.E.D. converts
  into a bit — the pin that read "pays points, not a second shell" in S2
  evolved honestly with the stage. With four aboard the bits stop riding and
  ORBIT at r=15 (`bitPos` writes px/py once per tick so draw and collision
  never disagree): the shield erases bullets and hunters within r+8 of a bit,
  grinds larvae, and still refuses armour (plates are not flesh). Every bit
  also draws its own vulcan stream from where it rides. Death strips the whole
  chain — bits are power armour, like the pod.
- **Two-leg stage (S3)**: Phase-1's death cascade hands to `startLeg2` — field
  resets, `WAVES2` scrolls 520 world-units, and the camera locks on the
  PHASE-2 fortress (`CORE_Y = [92, 148]`). Each core vents on its own clock
  (first gapes staggered 130/185 ticks; a gape ~110 ticks on a ~190-tick
  cycle); shots wound only an OPEN core, everything else clanks. The first
  core down enrages the survivor — its clock runs at double speed. The stage
  clears only when both hearts stop; `loopStage` rebuilds the leg-1 schedule
  (the loop re-runs both dreads). `__rTest.setup({ toPhase2 })` demolishes
  any live Phase-1 first — a stale `camLock` would otherwise swallow the
  fortress (the harness caught exactly that).
- **Autopilot** additions: hunts the open vent (`targetY` snaps to the gaped
  core, mid-line when both seal), and never thrusts into the fortress face.
  It never uses bits/shield — winnability (5/12) is the pod-less floor.

## Known gaps (S4+)
Co-op with a CPU wingman (S4), core speed-up after 1000, Stage 2
"Dobkeratops", the full capsule list beyond three arms (Options, Double,
Speed Up, Half-Capsules), the bit×arm modification matrix (Fire/Laser/Wave
bits reshaping the shot — S3 ships the generic extra streams), and an
armed Williams-style duelist for variety.
The registry entry is `private` until Jon promotes it (#379).

## Harness
- `scripts/rtypecheck.mjs` — 84 sim+browser laws, three named mutants
  (`armour-blind p1 core`, `pod-blind`, `shield-blind`).
- `__rTest` DEV hook: `probe()` (incl. pod/bits/shield/leg/p2) / `setup({…})`
  (`force`, `spawnFCap`, `spawnBCap`, `giveBits`, `toPhase1`, `toPhase2`,
  `openMouth`, `openVents`, `coreHp`, `p2hp`, `y`, …) / `start()`.
- DebugKit (F1): GIVE POD, POD OUT/IN, GIVE BITS, TO PHASE-2, OPEN VENTS,
  GIVE LASER, TO PHASE-1, OPEN MAW.
- Contract id `r-type` in `contractGames.mjs` (GAMES + PATTERNS — the pattern
  taps `b` every 97 ticks) and the nightly soak roster (`nightlybot.mjs`).
