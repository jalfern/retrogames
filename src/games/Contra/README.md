# CONTRA — Jon's #1530 commission, staged

Konami's arcade run-and-gun (1987), RETRO bar (docs/ART.md): 384x224 native,
everything generated in code. Filed and built as #2779, one PR per stage:

- **S1 — the jungle** (merged `8b6dd17`): horizontal scroll, 8-way run-and-gun,
  SPREAD capsule, soldiers/turrets/TNT, attract, `contracheck`.
- **S2 — the base** (merged `8ada95b`): the waterfall vertical section + the
  boss gate with the destructible core — stage 1's real finish.
- **S3 — the weapon wall** (merged `086554e`, #2788): the capsule wheel (S/M/F/L),
  the MACHINE GUN stream, the FIREBAR, the LASER, tree-line snipers, grenade
  soldiers — plus the S3.5 arms depot (`bb56470`, #2791).
- **S4 — two-seat co-op** (this): the blue soldier. A CPU ally fights beside
  you by default; on a desktop keyboard a second player claims his seat any
  time with WASD + F (jump) + G fire — and stands up from it by simply
  standing up (the seat comes back to the wingman; #2837).

## What S3 is

The original's most recognizable system: flying capsules that carry LETTERED
weapons. Catch the capsule and your gun becomes its letter — SPREAD (5-way),
MACHINE GUN (a 20-round/s stream), FIRE (a slow flame ball that undulates and
pierces), LASER (the fastest round, also piercing). The weapon still dies with
you: capture kills the wheel back to the rifle. The capsule draws its kind AND
its altitude on spawn — low (stand), mid (hop), high (full jump) — closing the
old honest gap that the capsule "flew at one height".

The jungle also recruits the cabinet's ambushers: four tree-line **snipers**
(crouched in canopy nests, long range, the fastest aimed round in the game at
3.2 px/tick, telegraphed by a flashing scope glint while the shot charges) and
three **grenade soldiers** (armoured two-hit vests, lob arcing bombs that
detonate where they hit the ground — being airborne over the landing beats it).

## What S4 is

The cabinet's other half: **a second soldier in blue**. He is fielded from the
drop — shadowing your shoulder, shooting his own rifle cadence, hopping the
same rounds you hop, taking the same hazards — and any moment a human touches
WASD/F/G on the same keyboard the seat is claimed: the blue `2UP` tag in the
HUD starts answering the pad, and the CPU hands over for the rest of the run.
That ordering is
Jon's multiplayer rule: CPU ally by default (phones keep working — there is no
second touchpad), two players as the desktop option.

The laws the blue seat lives under, all proven in `contracheck`:
- **Shared physics, structurally**: both seats run the SAME `seatStep()` —
  run, 8-way aim, coyote, one-way ledges, hop, fire cadence. Identical physics
  is not a promise, it's the same load-bearing function.
- **Shared pool (#2814, the cabinet's law)**: ONE life bank serves BOTH seats —
  any death, hero's or blue's, drains the shared counter. A seat that dies with
  the pool empty is down for good and leaves the HUD; GAME OVER lands the
  arcade way — the instant both seats are down (`seatsDown()`). A partner who
  volunteers can cost the team a life, exactly like the machine. The blue
  death still never freezes the world — his tumble counts down inside the live
  step while the hero keeps running.
- **Respawn at your side**, not where he fell (arcade drop-in), with i-frames
  and a clean rifle; in the falls he never respawns below the torrent.
- **Climb by feet, retreat by road** (#2798): a falls target must be reachable
  from his FEET (apex-window), never steered by a shelf that is only in reach
  from mid-air — chasing one walked him into the same gap-grave at x=172 on
  most seeds; the desperate hop fires only when NOTHING above is reachable;
  and he never fall back into a round still in the road (the hero's zigzag
  law, ported — spawn-door side excepted, where the hop answers instead). The
  12-seed sweep check demands no repeated identical ally grave.
- **Nearest-hero aim law**: enemies lead the NEARER live hero's lane — put the
  blue soldier on a walkway and the sniper's round re-leads from down-sloppy
  to flat (proven by the vy delta).
- **Capsules are per seat**: whoever touches the letter takes the gun; the
  other keeps his.
- **Honest brain**: `allyBrain` sees only visible state (positions, bullets,
  hero's lane), never `gs.r`, never off-screen enemies — the same rule the
  autopilot obeys, so the ally is as good (and as fooled) as a fair player.
- **Seat ceremony (#2837)**: drop-in ARRIVES — the first P2 touch doesn't
  puppeteer the standing wingman where he is; he pulls out and a fresh soldier
  rappels in at the hero-side spot (`allySideSpot`, the same shoulder law as
  the death respawn), clean rifle, `inv` covering descent + the usual grace.
  And a pad-claimed seat nobody drives for `seatIdle` = 600 live ticks (10 s
  of no held key, no tap) hands itself back to the wingman brain — cost-free,
  position and gun kept, 60-tick mercy window, `p2gone` chirp. Presence
  (any P2 press) resets the patience; harness-pinned seats (`human` without
  `padClaim`) are immune; a re-touch arrives on the rope again; and a touch
  during the blue tumble skips the respawn wait entirely.

## Engine notes

- **S4 `gs.p2`**: the seat object mirrors `gs.p` field-for-field (lane, cool,
  weapon, inv, dead, safe) so every hazard loop simply iterates both seats.
  `step(gs, pad, pad2)` — `pad2` is read only once the seat is human-claimed;
  until then `allyBrain(gs)` returns the pad, and it is deterministic: same
  seed, same fight, hash-stable (`stateHash` extended over the p2 fields and
  every bullet's owner `o`).
- **Shared pool (#2814) — the divergence is closed:** S4 shipped two banks
  (hero 3, blue 3) because the two-bank law was easy to pin; the original
  Konami cabinet shares ONE pool between both seats. Fidelity beats
  provability (AGENTS.md), so the cabinet rule now ships: `gs.lives` is the
  single pool, `killPlayer`/`killAlly` both drain it, and GAME OVER lands when
  both seats are down. Proving moved with the rule: `contracheck` pins that a
  blue death costs the pool, that a hero down leaves the partner running the
  run, and that GAME OVER needs both seats down — and the mutant set grew:
  `one-bank-lie` (seat 2 ignored — hero down ends the run) plus
  `blue-death-is-free` (the volunteer costs nothing — the partner becomes an
  immortal tank). Seed 1 taught the honest cost: with one pool, rounds aimed at
  the i-framed hero sail through to the partner's chest, so the partner now
  **hops the arc, not the line** (the dodge judges a round's height AT
  ARRIVAL — `pred = b.y + b.vy·min(eta,16)` — the same law ported into the
  autopilot, plus **stay-in-line** (never outrun a live hero into the uncleared
  kill zone) and **watch-your-back** (turn and shoot the walker that got
  behind the nose gun). Seeds 1..12 still clear, determinism intact.
- **`hopBand` 46→40** (S4 re-tune): the autopilot/ally hop window in px. At 46
  the ally jumped too early under the falls' gun lines and three sweep seeds
  stalled; 40 wins all 36 sweep seeds (the hero's own autopilot hops marginally
  later too — the attract demo shows it).
- **Phases carry the partner**: `enterFalls`/`makeBoss` place blue with 60-frame
  spawn grace (the arriving gunner shouldn't get him free), and the falls
  climb uses the hero's target-shelf index (`gs.apT`) as his line, dropping to
  his own lowest-reachable-shelf logic when the hero is out.
- **S3.5 the arms depot (#2790)**: a shootable emplacement at x 1700 — 10-hit
  slab (cracks deepen, embers glow), aimed slit gun (lane-aim law), a hatch
  that spills one vest-grenadier at a time ONLY with the spill point inside the
  view (door law + spawn-shield), a roof sniper that falls with it; its death
  pays a volley of M/F/L capsules at three altitudes (+1000, same courier
  physics). Pierce included — walls are walls.
- **Lane-aim law (S3, new):** enemies aim at the hero's LAST GROUNDED line
  (`p.lane`), never at the airborne body; snipers additionally fire only at
  grounded targets. Formalizes the S2 autopilot lesson ("flat aimed rounds are
  HOPPED, not out-run") into a sim law: a hop is always the answer to an aimed
  round. Without it the first S3 build killed seeds with rounds aimed at heroes
  mid-jump — a dodge the cabinet never demands.
- **Pierce tracking** rides the bullet: fire/laser bullets carry `hits` (stable
  index keys into soldiers/turrets/barrels), each body takes a piercing round
  once. Plain rounds stay single-target — piercing belongs to the wheel.
- The MG's stream is a cadence change (`fireCoolMachine: 3`), not a new
  projectile; the firebar's undulation rewrites `vy` from a per-bullet phase
  (`ph += 0.42`, `vy = vy0 + sin(ph) * 1.5`) — deterministic, no rng per tick.
- Grenades ride the existing `eb` stream with `gr: true` + gravity `+0.16` and
  detonate via the existing `boom()` at the ground line (blast law unchanged:
  symmetric — the pit can eat the thrower's friends too).
- #2782 polish pass (S1+), ratchet camera/torrent, the armored gate and the
  S2 autopilot lessons all stand — see git history and the S2 notes in
  `origin/forge/contra-waterfall`.
- `sim.js` is the whole truth, pure Node: fixed 60 Hz `step(gs, pad)`. Every
  sim random rides `gs.r`; `stateHash` = FNV-1a over the rounded state
  (extended in S3 for weapon/bullet kinds, pierce counts, capsule kind,
  snipers, lane, nade vest hp). Events stay unhashed, per Joust's law.
- **Phases**: `gs.phase` jungle | falls | boss. Snipers and grenades are
  jungle-only — the canyon and the gate keep their own roster.
- **Pod carriers (#2847)**: `gs.carriers` — one courier at a time, scheduled
  on seed/tick arithmetic (`nextCarrier`, letter and altitude derived from
  `gs.seed ^ carrierN`) with ZERO `gs.r` draws: the tuned autopilot stream and
  every rng-driven law byte-for-byte survive. The band (`CARRIER_ALT` =
  [150, 164], box 16×9) sits ABOVE the gun-line — a plane never eats a round
  aimed at the ground; taking it is a deliberate up-aim or a hop. Two hits
  (`carrierHp`), +500, `cargo` event; the jettisoned pod (`gs.pods`) falls
  with light chute gravity (`podGrav` 0.06, cap 1.6) to the deck line
  (`ground − 2`), and the capsule pickup law applies verbatim per seat (same
  touch box, capture kills the wheel). Contact is non-lethal — cargo, not a
  weapon; an untouched courier escapes WITH its pod and reschedules (+380..620
  ticks). The canyon clears the sky; carriers and pods ride `stateHash`.
- Audio: every new action synthesized via `audioController` — the MG's ripping
  pop, the firebar's breath, the laser's falling zap, the sniper's crack and
  the lob's whistle answer the existing set.
- Keyboard: Arrows move + aim all 8 ways (down aims only airborne),
  SPACE/Z or the pad's A jumps, X/C or the pad's B fires. `?` pauses.
  Seat 2 (drop-in): WASD + F jump + G fire — the first touch claims the seat.
  `warpFalls`/`warpBoss` construct phases properly (DEV hooks + DebugKit);
  DebugKit gained CYCLE WHEEL and P2: HUMAN SEAT cheat buttons.

## Verify

```bash
npm run dev -- --port 5173 --strictPort   # another terminal
npm run contracheck                      # sim core + browser leg
npm run contracheck -- --mutant        # replants spawn-shield, sealed-core,
                                       #   silent-MG, non-piercing-beam,
                                       #   impervious-depot, one-bank-lie,
                                       #   blue-death-is-free, never-release,
                                       #   cargo-jettison, carrier-impervious
CONTRACT_ONLY=contra npm run contractcheck   # the window.__game contract
```

`contracheck` proves (S3 additions bolded): boot · determinism (seed+pads
twice, other seed differs) · the 8-way law · run/jump/gravity · rifle vs
SPREAD counts · capsule→SPREAD and death→revert · one-hit death + respawn
i-frames · barrel chains · the stage fights back on every seed tested · no
spawn shield (both axes, **soldiers and snipers**) · the gate is a door not a
wall · the torrent drowns · the ratchet never retreats · shelf one-way +
honest-hop geometry · open-core hits and shut-shutter armor · core destruction
ends stage 1 with the bonus · the door caps and the cannons talk · **MG
streams at least twice the rifle** · **laser is the fastest round** · **fire
undulates across its line** · **FIRE and LASER pierce; the rifle stops at the
first body** · **capsules grant every letter and the draw covers the wheel** ·
**snipers fire, fast and telegraphed** · **grenades arc and detonate on the
ground; the vest eats two rounds** · **winnable: autopilot clears
jungle+falls+boss on seeds 1..12 with the new roster**, not cherry-picked ·
GAME OVER path · attract self-demo · real keys start/run/jump/fire/die/
restart · **live MG stream and live capsule letter in the browser** · live
warp + armor law · **capsule letters are crisp 5x5 bitmap stamps, not fonts**
(#2789 salvage: S17/M13/F12/L9 pixel counts, wheel inks, no text APIs) ·
**S4 co-op: the blue seat fires unasked and advances ·
earns an attributable kill with the hero silent · the sniper re-leads the
nearer blue lane (down-solo vs flat-coop) · capsules and kills are per seat ·
#2814 shared pool: a blue death costs the shared counter · a hero down leaves
the partner running the run · GAME OVER needs BOTH seats down · the blue death never freezes the world · respawn
lands at the hero's side · pad2 drives a claimed seat · live drop-in with
KeyA · #2837 seat ceremony: the rappel arrives at the hero-side spot (never
where the wingman stood) with mercy and a clean rifle · drop-out fires exactly
at patience, cost-free · one touch resets the patience · harness-pinned seats
immune · arrival beats the death tumble · ceremony hash-stable · zero page
errors · **#2847 pod carriers: deterministic fly-in (zero gs.r — soldier wake
timing byte-identical to a carriers-free run) · letters cover the wheel and
both bands fly across seeds · two-hit airframe (+500) jettisons its lettered
pod · pod falls, settles at the deck, delivers its gun on contact · capture is
per-seat · contact non-lethal · the band never eats ground fire · one courier
over the jungle at a time · an untouched courier escapes with its pod and
reschedules · the waterfall clears the sky · couriers ride the hash · live
courier and deck-pod delivery in the browser** · zero page errors.

## Honest gaps

- **CLOSED by #2837**: seat ceremony shipped — drop-in rappels in at the
  hero's side (never puppeteers the standing wingman) and a seat idle 10 s
  returns to the wingman brain; see the Seat ceremony law above.
- **CLOSED by #2847**: flying pod carriers shipped — low gunships ferry one
  lettered capsule each across the jungle; two rounds down the courier and its
  pod drops to the deck, obeying the capsule pickup law verbatim. See the Pod
  carriers note below.
- Lasers/fire pierce bodies but are still consumed by the gate armor housings
  (the jungle's emplacement is now shootable — the gate's outer guns are next).
- The cascade blasts at the gate are random around the wall rather than
  scripted position-by-position; the waterfall has one gunner set and one
  hazard (the rising torrent), while the original also put the odd hanging
  vine/carrier on the way up.
- The arcade loops stage 1 with faster settings after the kill; here the run
  ends at STAGE CLEAR and returns to attract — a looped second pass is
  post-S4 territory.
- Sniper nests sit on fixed perches; the original drifted aim between a few
  tree positions. The vest grenadier fires a rifle too while advancing; the
  cabinet's grenadiers were lob-only.
