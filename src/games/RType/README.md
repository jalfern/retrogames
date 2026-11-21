# R-TYPE — engine notes (#2808)

Irem's 1987 pod-shooter, built stage by stage. S1 "Armament": the convoy run
and the Phase-1 bio-ship. S2 "the force": the S.E.E.D. pod — capture, plug,
ram, deploy/retrieve — and the LASER charge arm. S3 "bits and the dread": the
bit chain and its orbit shield, plus the stage's second heart — LEG 2 and the
Phase-2 twin-core fortress. S4 "the second pilot": co-op, per R-Type II (Irem
1989) where simultaneous two-player play was born — a CPU wingman by default,
a human seat on the keyboard (Jon's multiplayer rule, no second touchpad).

## Verified
```bash
npm run dev -- --port 5178 &      # or any free port + RTYPE_URL / DEV_PORT
node scripts/rtypecheck.mjs       # sim + browser: 130 laws (S1, #2818/#2823 polish, S2, S3, #2831/#2835 polish, S4, #2841 polish)
node scripts/rtypecheck.mjs --mutant   # red as `armour-blind p1 core` + `pod-blind` + `shield-blind` + `pool-blind` + `cargo-blind` + `salvo-blind` + `vent-blind`
```
`rtypecheck` covers the S1 laws — camera right-only + the grinding left edge,
one-hit death + mercy + death-reverts-the-arm, capsule cycle, wave charge
tiers, the pod-3 rescue, the Phase-1 maw law and its 20 s cycle, hunter
home-phases, winnability (autopilot clears >= 4 of seeds 1..12 — now THROUGH
both dreads, measured 4/12) — plus the #2818 polish laws, S2 (capture, plug,
ram, deploy→park, recall, grind, death-drop, tiered piercing lance), and S3:
bit capture order (newest at the nose, chain shoved back), the spare-S.E.E.D.
converts to a BIT (never a second shell), chained-vulcan extra streams,
three-is-not-a-wall, the four-bit orbit shield deflects rounds AND hunters
and grinds soft bodies but never bites armour, death strips the chain, LEG 2
handoff after Phase-1's wreck, twin cores gape on their own staggered clocks,
sealed plating eats fire, one core down enrages the survivor (double-speed
vents), both hearts down ⇒ STAGE CLEAR. The #2831 polish pass adds six more:
FIRE×bits spread-fans the vulcan (the flank bit shoots outward, the nose stays
true; the orbit sweeps both wings), LASER×bits widens the lance (a 9-px offset
is clean bare, dead with three), WAVE×bits broadens the crescent (18 px off
the line needs four), a deflected round flashes the bit white and the strain
fades, and a hunter swatted off the orbit bursts AT THE BIT ('hunterring' at
the bit's position, shell strained) — and S4: the wing joins as a CPU pilot
 behind seat one in the opposite lane (nose never crossed), one hit hangs ONE
 wreck (dual pools, independent mercy), GAME OVER only when both pools burn,
 the wing fights on its own account, capsules held over both hulls go to seat
 one, per-hull S.E.E.D./bit gear (the spare-seed law holds per hull), Bydo
 guns take the nearer hull (decoy), pad2 flies a human seat / dead-stick holds
 the line / V resumes the brain, and co-op clears 12/12 seeds against the 4/12
 solo floor (9/12 since the #2841 wing earned its hazard pay). The #2835 polish pass adds the stage-2 signature: LEG 2 fields
 BIT CARRIERS (armoured `bitpod` ferries on script-authored y/n — no rng),
 kill one (fire or shell ram) and its 2–3 bits spill as chainable capsules
 (`bitfree`), the orbit grinds larvae but the carrier shrugs the shield
 (armour law holds); the Phase-2 mass SWAYS ±6 px on pure tick sine (rides
 core hit windows, guns and hash — aiming law tracks it), ports ALTERNATE
 aimed 3-shot salvos fired at the OPEN transition, 30 ticks after the port
 horn (the next salvo port glints), a burned port's turn inherits to the
 enraged survivor; the twin-core wreck WALKS port-to-port from the last
 fallen heart across 380 ticks (~2× Phase-1) with the seam advancing while
 plating sheds in rows, and STAGE CLEAR waits for the whole walk.

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
- **#2831 polish (QA lane):** the bit×arm matrix ships — the gun reshapes
  around the chain: vulcan streams FAN outward by the firing bit's offset
  (`vy`, clamped ±0.5; orbiting bits sweep both wings), the laser lance
  widens by +2 px per bit (`q.wy` stamped at release — hit boxes and art
  agree), and the wave crescent broadens by +2 px half-height per bit
  (`q.hx`). Deflects are no longer silent erases: the bit that ate a round
  flashes white and shudders (`bt.flash` — a juice countdown written by the
  sim, read by `drawBit`, never hashed, so contract replay and the RNG
  stream stay byte-identical); grinding a larva strains the bit too
  (flash 5); and a hunter popped by the orbit bursts as a cyan ring AT THE
  BIT (`hunterring` event; `lastHit` moved from the missile's corpse to the
  bit's body). The autopilot never carries bits, so the winnability floor
  (5/12) still measures the waters the forge calibrated.
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
- **Co-op seat (S4)**: `gs.wing === null` by default — every S1–S3 stream,
  hash shape and the 5/12 winnability floor stay byte-identical until
  `enableCoop(gs)` (the shell seats co-op at the seat AND in the attract).
  The wing is a FULL pilot: own lives (3), own arm (capsules cycle per hull,
  death reverts it), own S.E.E.D. and bit chain, own mercy flicker; one hit
  hangs one wreck and only both-pools-burned raises the curtain (a dark seat
  reads `SEAT DARK` on the HUD and is not reborn by a stage clear).
  `wingBrain` scores candidate lanes — bullets, divers, hunters, slabs, guns
  — the way autopilot does, but on PURE tick arithmetic: zero gs.rng draws,
  so the stream the S1–S3 laws calibrate never shifts. Capsule courtesy:
  seat one takes any capsule the hulls share. Decoy law: turrets, divers and
  hunters acquire the NEARER hull — crowding the wing makes it bait. Any of
  WASD/F/G hands the seat to a human; V relieves them and the brain resumes.
  Co-op winnability measures 9/12 seeds post-#2841 (was 12/12 — a wing that
  fetches cargo and hunts vents is also a wing that walks into fire): the
  harness pins co-op strictly above the solo floor, and the solo law still
  proves the harder floor stands alone.
- **#2841 polish (QA lane):** the wing fights like a partner now. CARGO LAW:
  a capsule the wing reaches strictly first (seat one keeps every tie, and a
  gaped vent outranks loot) gets fetched — lane commits only if `riskAt`
  reads the loot lane survivable. VENT-HUNT: with the fortress open, ty0
  snaps to the gaped core's lane (sway included), so seat two's stream bites
  the throat instead of spraying formation. FORMATION DRIFT: on a quiet lane
  the wing eases 8 px toward its partner and falls back to station when the
  lane heats. POD HAND-OFF: gear stays per-hull UNASKED, but pressing POD
  with a bare hull calls the wing's spare shell over — it flies to seat one's
  nose and hands itself on dock (`force` ceremony at the caller; the original
  passed pods between pilots). Dark-seat rescue rides the same two rails:
  with seat one down the courtesy gate lifts (the wing fetches freely) and
  the spare goes to the partner when they return. The HUD now carries
  `SEAT 2 : WASD+F` by the dual pools for the whole CPU flight — the drop-in
  keys should be found mid-run, not from attract memory. P1's own death
  already shakes harder than the wing's (die 6 vs wingdie 3) — the loss
  asymmetry the playtest asked for was standing.

## Known gaps (S5+)
Core speed-up after 1000, Stage 2 "Dobkeratops", the full capsule list beyond
three arms (Options, Double, Speed Up, Half-Capsules), and an armed
Williams-style duelist for variety. #2835 closed the last three #2831 carry-overs
(bit pods, Phase-2 port salvos + body sway, the walking port-to-port death);
what is still thin there: carriers never answer back (no launched interceptors
when fired upon), salvos fly straight once loosed, and the autopilot does not
pre-dodge the volley lane — it eats some of what the cabinet's pilot would
side-step. The wing (S4) got its partner-pass in #2841 (fetch, vent-hunt,
drift, called hand-off); still open: the wing brain never deploys its shell
on its own initiative (a human seat two can, via G), and a dark seat gets no
free life — seat-two flavour left for a later pass.
The registry entry is `private` until Jon promotes it (#379).

## Harness
- `scripts/rtypecheck.mjs` — 130 sim+browser laws, seven named mutants
  (`armour-blind p1 core`, `pod-blind`, `shield-blind`, `pool-blind`,
  `cargo-blind`, `salvo-blind`, `vent-blind`).
- `__rTest` DEV hook: `probe()` (incl. pod/bits/shield/leg/p2 + wing/wingX/
  wingY/wingLives/wingHuman/wingPod/wingBits/wingShield/p1out) / `setup({…})`
  (`force`, `spawnFCap`, `spawnBCap`, `giveBits`, `toPhase1`, `toPhase2`,
  `openMouth`, `openVents`, `coreHp`, `p2hp`, `y`, `wingLives`, `wingOut`,
  `wingHuman`, `wingInv`, `wingY`, `giveWingPod`, `giveWingBits`,
  `spawnCapWing`, `coopOff`, `spawnBitPod:{y,n,x}`, `p2Port`, …) / `start()`.
  Probe also reports `bitpods`, `sway`, `p2port`, `p2dying`, `p2last` (#2835).
- DebugKit (F1): GIVE POD, POD OUT/IN, GIVE BITS, TO PHASE-2, OPEN VENTS,
  SPAWN BIT POD, GIVE LASER, TO PHASE-1, OPEN MAW, P2 SEAT IN/OUT, +1 WING LIFE, WING OUT,
  GEAR THE WING.
- Contract id `r-type` in `contractGames.mjs` (GAMES + PATTERNS — the pattern
  taps `b` every 97 ticks) and the nightly soak roster (`nightlybot.mjs`).
