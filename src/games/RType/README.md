# R-TYPE — engine notes (#2808)

Irem's 1987 pod-shooter, built stage by stage. S1 "Armament": the convoy run
and the Phase-1 bio-ship. S2 "the force": the S.E.E.D. pod — capture, plug,
ram, deploy/retrieve — and the LASER charge arm.

## Verified
```bash
npm run dev -- --port 5178 &      # or any free port + RTYPE_URL / DEV_PORT
node scripts/rtypecheck.mjs       # sim + browser: 51 laws incl. the #2818 polish laws
node scripts/rtypecheck.mjs --mutant   # red as `armour-blind p1 core` + `pod-blind`
```
`rtypecheck` covers the S1 laws — camera right-only + the grinding left edge,
one-hit death + mercy + death-reverts-the-arm, capsule cycle, wave charge
tiers, the pod-3 rescue, the Phase-1 maw law and its 20 s cycle, hunter
home-phases, winnability (autopilot clears >= 4 of seeds 1..12) — plus the
#2818 polish laws and S2: capture (blue capsule → pod), the plug (bullets
AND hunters die at the shell), the ram (larva/turret/gun-pod crush;
hull-plates refuse the pod and it never crosses), deploy→park at the screen
edge, recall (or fly into it), the left wall grinding a parked shell, death
burning an attached pod, and the laser: tap no-things, held release looses a
tiered piercing lance that rakes a line of turrets.

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

## Known gaps (S3+)
Bits and the shield formation (S3), Phase-2 twin-core boss (S3), co-op with a
CPU wingman (S4), core speed-up after 1000, Stage 2 "Dobkeratops", the full
capsule list beyond three arms (Options, Double, Speed Up, Half-Capsules).
The registry entry is `private` until Jon promotes it (#379).

## Harness
- `scripts/rtypecheck.mjs` — 51 sim+browser laws, two named mutants
  (`armour-blind p1 core`, `pod-blind`).
- `__rTest` DEV hook: `probe()` (incl. pod state + x) / `setup({…})`
  (`force`, `spawnFCap`, `toPhase1`, `openMouth`, `coreHp`, …) / `start()`.
- DebugKit (F1): GIVE POD, POD OUT/IN, GIVE LASER, TO PHASE-1, OPEN MAW.
- Contract id `r-type` in `contractGames.mjs` (GAMES + PATTERNS — the pattern
  taps `b` every 97 ticks) and the nightly soak roster (`nightlybot.mjs`).
