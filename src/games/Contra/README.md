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
3.2 px/tick, telegraphed by a flashing scope glint while the shot charges —
and since #2905 they WALK: after every shot each nest shifts to its next
perch, so the crossfire moves between volleys) and three **grenade soldiers**
(armoured two-hit vests that lob arcing bombs and nothing else — the cabinet's
bandoliers carry no rifle, #2905 — the bombs detonate where they hit the
ground, and being airborne over the landing beats them).

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

## What S5 is — the arcade loop (#2894)

The cabinet's second wind: **the run doesn't end at STAGE CLEAR — stage 1 comes
back faster**. The gate dies, the fanfare plays, and the world rebuilds: same
seed, score carried, the gun the run carried — and every PRESSURE tempo raised
by one notch (`loopK`, a pure staircase: x1.00 at loop 1, +0.10 a pass, pinned
at x1.30 from loop 4). What speeds up: soldier/turret/sniper/depot/cannon rearm
intervals, the gate's door spill, the grenadiers' throw cadence, walker pace,
the core shutter cycle (`coreT` advances by k — both windows shorten, the duty
ratio stands), courier traffic and the snipers' perch shuffle (#2905). What
never speeds up: hero physics, enemy
round SPEEDS, and the torrent. That's a law, not a mercy — the lane-aim law
says a hop is always the answer to an aimed round, and `hopBand` is tuned to
these exact paths; the loop compresses flight TIME, never flight paths. The
first cut scaled bullet speeds too and the zero-latency honest autopilot died on
half the seeds at only x1.12 — that's how the tuning was proven rather than
guessed. Surviving a pass pays the classic loop courtesy: **+1 shared life,
banked to five** (seed 6 clears loop 1 at 0 lives left; without the bank the
same seed cannot carry loop 2). Loop 1 is byte-identical to the pre-loop game
(pinned through 5 winning autopilot seeds); loops 2, 3 and every capped loop
sweep 12/12 clears. The HUD marks the pass in gold under the 2UP tag, the clear
screen promises `STAGE 1 STRIKES BACK — LOOP n`, and one attract line tells the
player the loop exists before they ever see it.

*Fidelity note (#237 rule): the 1987 arcade cabinet's own memory here is a
Mission-8 credits ending; this repo's honest-gap spec said "the arcade loops
stage 1 with faster settings", so the loop is built as the spec says, and the
disagreement is recorded on #2894.*

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
- **Perch-drift law (#2905):** each tree-line nest owns three canopy perches
  (home, −34/+6, +30/−7 relative to its table position) on a FIXED rotation —
  zero gs.r draws, the courier/cascade law reused: same seed, same crossfire.
  The shift starts the instant the round leaves (muzzle-flash frame) and walks
  `PERCH_RELOC = 30` ticks advanced by `gs.lk` (loop tempo, like the walker
  pace) — it settles ~80 ticks before the next glint at k = 1 and still ~50 at
  k = 1.3: **the aim is frozen while the telegraph flashes, and no round ever
  leaves a moving nest.** The depot-roof nest is exempt — its `sn.x === dp.x`
  identity IS the roof-blown-off law. The vest grenadier throws only: the
  rifle branch of the soldier-fire law is gated on `!s.nade` (cabinet fidelity
  — the advancing bandolier lobs, it never sprays flat rounds).
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
  snipers, lane, nade vest hp; #2894: `gs.loop`/`gs.lk` ride the hash too;
  #2905: every sniper's perch index and mid-shift leg ride it — a replay that
  skips a nest's walk diverges loudly). Events stay unhashed, per Joust's law.
- **#2894 harness surface**: `makeGame(seed, loop)` starts at any pass; the DEV
  `setup({ loop: n })` retargets tempo mid-run (probe carries `loop`, `lk`,
  `seed`); DebugKit grows a `LOOP +1` cheat. Loop math is exported for checks:
  `loopK`, `LOOP_STEP`, `LOOP_CAP`, `LOOP_LIFE_BONUS`, `LOOP_LIVES_MAX`.
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
   #2852 polish: the jettison SNAPS (`recoil: 6` — the load hangs a beat while
   the hooks flick open, then drops), and touchdown kicks a `dust` event with a
   12-tick sand speck puff (`puff`) at the deck line; the rotor draws a
   translucent disc sweep under two counter-phase blade lines, and the fly-in
   carries three delayed low thumps (~6 Hz rotor beat).
- **Gate pierce law (#2854)**: the fortress gate's cannon housings no longer
  swallow piercing rounds. An `f`/`l` round meeting a housing sparks once and
  **keeps flying** (`hits` tags `'g' + gi` — one take per housing per beam,
  the soldiers/turrets/snipers/carriers law verbatim). Ordinary rounds still
  spark and stop dead at the mount, and the core branch is untouched: the
  shuttered core remains the ONE weak point — opening it is still the fight.
  Zero `gs.r` draws; the winnable-seeds pin stands unchanged. A laser bought
  from the depot now rewrites the gate fight exactly like it rewrites the
  jungle: line a beam through the guns and it reaches past them.
- **Gate guns cave (#2880)**: the gate's outer guns are answered. Each cannon
  housing is an arms-depot slab — `hp: 10`, spark per hit, **ten rounds cave
  it**: a named `boom` and +300, and that gun is silent for the rest of the
  fight (`dead` skips the firing cadence), its charge glow dies and the slab
  draws blackened with a cracked muzzle, ember flicker and a rising smoke
  wisp; half-dented armour shows spalled concrete before the cave. A caved
  housing stops intercepting rounds altogether (the mount was the armour, not
  the wall — arcade planes don't block shots), and takes no pierce "one take"
  either. Live housings keep the armour law and the #2854 pierce law verbatim,
  and the shuttered core stays the ONE win: guns are an answer, not a second
  door. `hp`/`dead` ride `stateHash` (a replay that caves a gun diverges
  loudly); zero `gs.r` — hits are deterministic, the cadence rnd untouched.
- **Scripted finale + vine carriers (#2885)**: two laws from the waterfall.
  (1) When the core falls, the gate dies SCRIPTED: `CASCADE` is an ordered
  site list — near gun, wall foot tier, spawn arch, far gun, mid tier, parapet
  tier, core housing, and the heart last — one blast every `cascadeStep` (8)
  ticks. Zero `gs.r`: the same fire walks the same wall on every seed (pinned
  cross-seed, `r` untouched through the whole dying phase). (2) The gorge's
  hanging vines (`VINES`, falls only): rope-swing arcs on pure tick math
  (period 96, amp 1.1 rad — tips sweep ±~70 px and rise ~44 px). The reach
  law: catch a tip AIRBORNE with the jump key HELD (intent) while the body is
  in the tip box; grounded contact never grabs. A rider hangs (one-armed
  pose, fire still live), and the vine FLINGS them at the far apex at least
  `vineCarryMin` (20 px) above the catch, momentum and all — an alternate
  line up the climb; jump releases early with the swing's speed, and
  `vineRideMax` guarantees nobody hangs past one swing. The torrent still
  takes a low rider — hazard law untouched. `seatStep` carries the whole law,
  so the blue seat rides under the identical code; riders and tips ride
  `stateHash`. The 12-seed autopilot sweep still clears 12/12 — its pulse
  taps (never holds) so the demo line keeps its feet, and when it DOES catch
  a vine on a launch tick the arc drops it on the climb (4 seeds show a vine
  ride in attract — the mechanic advertises itself).
- **#3035 the somersault (ART bar 2 — falls animate)**: the arcade jump is a
  forward roll, and it now rolls here. `seatStep` carries a presentation clock
  `rollT` on each seat (precedent: `walk`): the jump line arms it at 1, the head
  of seatStep advances it while airborne, ground clears it, and the vine catch
  zeroes it — a hanging rider never tumbles. Walking off a ledge or pressing
  through a platform never arms it: the tumble is reserved for the jump, so it
  KEEPS meaning. `SOMERSAULT_TICKS` (37) is the observed Euler arc
  (2·|jumpV|/grav minus the jump tick) — the body completes exactly one turn as
  the feet land, and the harness pins constant-to-arc so physics drift can't
  split them. `drawPlayer` rotates legs, torso, head and bandana tails about the
  body centre (±2π over the span, flipped by facing); the GUN ARM draws OUTSIDE
  the rotation, at the live `ax/ay` — mid-jump aimed fire is Contra's signature
  and the drawn sprite must keep matching the logical aim. Structural law: both
  seats run the same seatStep, so the blue soldier somersaults too (pinned on
  his own jump event). Referee law: `rollT` is absent from `stateHash` by design
  (states differing only in rollT hash identically — pinned), consumes zero
  `gs.r`, and the whole autopilot sweep clears exactly as before the change.
- **#3038 the duck — the cabinet's three ground profiles**: `posture` per seat
  (0 stand | 1 kneel | 2 prone) lives in the shared `seatStep`, so the blue seat
  ducks under the identical code (structural law). DOWN on the ground cycles the
  profile one step per fresh press (holding latches; flat is the floor), UP
  stands; a jump stands you back up (and rolls the somersault), mid-air is
  never ducked, and DOWN+jump on a walkway keeps its drop-through meaning —
  the press-through never kneels. What the profile changes: the muzzle comes
  down with the body (`duckMuzzle` 16/11/6 — the drawn arm lines up at the same
  mark) and fires LEVEL (a ducked rifle never points up or down; UP is spent
  standing); travel halves to a crawl (`duckSpeed` — the trade); and the hit
  box shrinks with the drawn body (`duckCenter/halfH/halfW`: tops at 27/17/8
  px over the deck, a prone body stretching 9 px wide). Every gun in the game
  leads the chest line (lane−14) locked at the shot, so the tiers fall out like
  the cabinet's: a chest round kills stand and kneel and passes OVER prone; a
  head-high round kills stand and sinks under the kneel. Fairness is the same
  shape the hop teaches — duck AFTER the telegraph, never before the aim locks —
  and the ground answers back: the blast radius is measured off the lowered
  belly (deck+2.5 of 30 px — a grenade at your feet still takes a flat body),
  soldier contact is the feet law (a boot runs over a crawl), the torrent is
  untouched. `posture` rides `stateHash` (profile moves hit boxes and muzzles —
  a replay that silently un-ducks diverges loudly), consumes zero `gs.r`, and
  the honest autopilot never presses DOWN grounded (pinned across seeds), so
  every pre-duck seed, replay and twin law stands byte-for-byte. Bonus from the
  seam: the #3000 `AIM DOWN` shout now takes the wingman to a knee — what the
  words actually mean. Audio: a soft fabric dip per profile change, the mirror
  chirp on standing; one attract line on each console teaches the duck.
- Audio: every new action synthesized via `audioController` — the MG's ripping
  pop, the firebar's breath, the laser's falling zap, the sniper's crack and
  the lob's whistle answer the existing set.
- Keyboard: Arrows move + aim all 8 ways (down aims only airborne — DOWN on
  the ground is the duck: press once to kneel, again to lie prone, UP stands;
  low profiles fire level and crawl at half speed),
  SPACE/Z or the pad's A jumps — and HELD through a swinging vine tip in the
  canyon, it GRABS the vine (tap again to fly off). X/C or the pad's B fires.
  `?` pauses.
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
                                       #   cargo-jettison, carrier-impervious,
                                       #   housings-eat-beams, cascade-random,
                                       #   vine-deadwood, vine-sink, loop-dead,
                                       #   loop-overdrive, loop-blind, voice-flat,
                                       #   gunship-impervious, stiff-hop,
                                       #   roll-on-step, duck-deaf,
                                       #   prone-immortal, no-crawl-price,
                                        #   extend-deaf, carry-blind
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
**snipers fire, fast and telegraphed** · #2905 **one nest fires from three
perches on the fixed rotation · the aim is frozen while the glint flashes (no
mid-telegraph shuffle, no shot from a moving nest) · the roof nest is exempt,
one origin forever · the vest throws and never rifles** · **grenades arc and
detonate on the
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
errors · **#2842 ceremony polish: cling-rappel pose + touchdown dust · a
chopper silhouette hovers the rope and flies the wingman out (the vanishing
seat has an exit) · the 2UP tag blinks-in all the way down the rope and
gold-blinks the last two seconds of patience before the wingman takes the
seat back · p2gone answers its fall with a rising handoff chirp (6 tag-state
pins)** · **#2847 pod carriers: deterministic fly-in (zero gs.r — soldier wake
timing byte-identical to a carriers-free run) · letters cover the wheel and
both bands fly across seeds · two-hit airframe (+500) jettisons its lettered
pod · pod falls, settles at the deck, delivers its gun on contact · capture is
per-seat · contact non-lethal · the band never eats ground fire · one courier
over the jungle at a time · an untouched courier escapes with its pod and
reschedules · the waterfall clears the sky · couriers ride the hash · live
courier and deck-pod delivery in the browser** · **#2854 gate pierce law: a
laser and the firebar spark through a cannon housing and keep flying, each
housing one take per beam · ordinary rounds still die at the mount · a beam on
the SHUT shutter still dies there (the ONE weak point never moved)** ·
**#2885 scripted finale: the dying gate's blast list walks the CASCADE sites
position-by-position, guns first and the heart last, byte-identical on every
seed with gs.r untouched through the whole countdown · #2885 vine carriers:
reach law (airborne + jump held + tip box; grounded never grabs), carrier law
(flung ≥ vineCarryMin above the catch with upward momentum), structural law
(the blue seat rides the same seatStep), hazard law intact (the torrent takes
a low rider), riders ride the hash · live canyon paints vines over a
bare-canyon pixel baseline · live grab, live release, and the script-length
finale countdown through real keys** · **#2902 loop presentation: the resume is
an interstitial — LOOP banner gold on screen while the world's tick stands
still, then the stage resumes one notch hotter; the heads row gold-flashes the
banked +1; the loop-4 sky reads redder than loop 1 live; the LOOP tag paints on
its warm plate (loop 1 shows nothing) — plus the sim-side law: heatSky/
heatMuzzle byte-base through loop 2, one notch at loop 3, capped at loop 4;
loopVoice unity → x1.06 → x1.12 → capped x1.18; hash-clean (palette and voice
consume zero gs.r); attract teaches one LOOP 2 pass with the banner and cycles
back to loop-1 copy** · **#2917 second air layer: the door grinds before the
hull (telegraph lands gsTelegraph before lift-off, zero gs.r — soldier wake
timing byte-identical to a sortie-free run) · one sortie at a time · the hull
is lane-aimed, pinned-speed and SHALLOW (every gs round satisfies |vy| ≤
gsVyMax < the autopilot's 1.2 hop window) and fires only over the fortress at
a grounded hero · three rounds down the airframe (+400, spark per hit, named
fireball) · pierce one take per hull per beam · contact kills either seat
while a grounded flat shot passes under the band · falls clears the sky ·
hangar, schedule and airframe ride the hash · live: the door grinds and the
gunship paints sky pixels over a sortie-free baseline, and a pinned hull takes
three rounds through real keys** · **#3035 somersault: the clock arms with the
jump event and exactly one 37-tick revolution completes as the feet land · a
ledge step-off and a platform drop-through ride the arc upright (the tumble is
reserved for the jump, so it keeps meaning) · the vine catch zeroes the roll ·
the blue seat clock arms on HIS jumps too (structural) · states differing only
in rollT hash identically and autopilot streams twin (presentation outside the
referee) · live: bandana red crosses the feet line mid-arc through real keys
(the static tuck could never invert), on both arm-states, while the AIM-UP hops
carry cold-dark barrel ink over the pivot that the flat hops do not — the body
turns and the aim does not** · **#3038 the
duck: DOWN cycles stand->kneel->prone on fresh presses and latches, UP stands ·
a jump stands (the somersault still rolls), air never ducks, DOWN+jump still
drops through · the profile crawls at half speed and its rounds leave LEVEL at
deck+11 (kneel) / deck+6 (prone) · the profile takes the hit: a chest-line
round kills stand and kneel and passes OVER prone; a head-high round kills stand
and sinks under the kneel · the ground stays lethal: a deck blast (outside the
contact band) takes the prone hero and a soldier runs over a flat body · posture
rides stateHash and the autopilot logs ZERO DOWN presses — every pre-duck seed
stream twins · the blue seat kneels under HIS pad through the same seatStep, and
shouted AIM DOWN takes the wingman to a knee · live: two real ArrowDown presses
land posture 2 and the paint follows — bandana red inside 9 px of the deck with
the top of the column empty, ArrowUp sends it back to the crown** · **#3041 the
score extend: crossing 30,000 pays +1 to the shared pool and advances the mark
one rung (first 30k, then +50k) · at the 99 cap the mark advances and no salute
is owed · one rung per tick, oversized jumps paid on consecutive ticks ·
arcadeLoop carries the mark with the score · zero gs.r and hash-clean · every
honest loop-1 clear lands below the mark so no pre-extend byte moves · live: a
real kill crosses the mark, the pool grows and EXTRA LIFE paints gold on the
salute band** · zero page
errors.

## Honest gaps

- **CLOSED by #3000**: Contra opens the mic — the wingman takes shouted orders
  (`AIM UP / AIM DOWN / AIM LEVEL`, `FOLLOW / HOLD / SPREAD`) through a pure
  grammar + honest sim seam; every call banks as `voiceCmd` (seat 1) and the
  consent-gated raw track rides the take, so Contra joined the voice games
  (#1711 S5 lineage). See the #3000 note below.
- One pad on phones (**DISCLAIMER** — open, by law): the blue seat is desktop-keyboard only
  (Jon's rule — no second touchpad, #2058), so a phone friend's take is hero + CPU
  wingman; the wingman's CPU hands never produce training rows (#2058).
  Spoken orders (#3000) are the law-abiding second channel the arcade's
  co-op talk actually was — the pad row still stays hero-only. NOT BUILDABLE:
  a second on-screen pad is a non-feature by Jon's own rule — the honest fix
  for it (shouted orders) already shipped, so this must not re-score on the
  never-dry ladder (#2488 marker law).

- **CLOSED by #2837**: seat ceremony shipped — drop-in rappels in at the
  hero's side (never puppeteers the standing wingman) and a seat idle 10 s
  returns to the wingman brain; see the Seat ceremony law above.
- **CLOSED by #2847**: flying pod carriers shipped — low gunships ferry one
  lettered capsule each across the jungle; two rounds down the courier and its
  pod drops to the deck, obeying the capsule pickup law verbatim. See the Pod
  carriers note below.
- **CLOSED by #2854**: gate pierce law shipped — fire and laser spark through
  the cannon housings and keep flying (one take per housing per beam, the
  bodies law verbatim); ordinary rounds still spark and stop dead, and the
  shuttered core remains the ONE weak point. See the Gate pierce law note above.
- **CLOSED by #2852**: pod-carrier polish shipped — the rotor reads as a
  blurred disc (translucent sweep + two counter-phase blade lines), jettison
  snaps (6-tick cable recoil with hook-open frames), the pod kicks a sand puff
  on touchdown (`dust` event + specks), and the fly-in gains a ~6 Hz rotor
  beat. The original's SECOND air layer (mid-boss gunships, hangar door) was
  still standing after this pass — it shipped next in #2917 (see the second
  air layer note below).
- **CLOSED by #2880**: the gate's outer guns are answered — each cannon
  housing takes the depot slab law (ten rounds, spark per hit), caving with a
  named blast and +300; the gun falls silent, the muzzle light dies and the
  wreck smokes. A caved housing stops eating rounds (pierce included); the
  shuttered core stays the ONE weak point. See the Gate guns cave note above.
- **CLOSED by #2885**: the waterfall's two signature absences shipped — the
  dying gate now blows at SCRIPTED sites position-by-position (guns, wall
  tiers, heart last; zero gs.r, identical every seed), and the gorge carries
  four hanging vines: airborne + jump held catches a swinging tip, the arc
  flings the rider at least vineCarryMin above the catch, jump releases
  early. Both seats, hash-clean, torrent law verbatim. The ORIGINAL's full
  vertical set (mid-boss gunships, hangar door) shipped next in #2917 — see
  the second air layer note below.
- **CLOSED by #2894**: the arcade loop shipped — STAGE CLEAR no longer falls back to
  attract: stage 1 rebuilds at LOOP n with the pressure tempo raised (k = 1 + 0.10
  per pass, pinned x1.30 from loop 4): soldier/turret/sniper/depot/cannon rearm,
  the door spill, the nade cadence, walker pace, the shutter cycle and courier
  traffic all run at k. Round SPEEDS and the torrent stand pinned — the lane-aim
  law is the fairness spine and the hop window is tuned to those paths; k
  compresses flight TIME, not flight paths. Score carries, the shared pool carries
  plus the loop courtesy (+1 life, banked to 5), the gun carries, the seed is kept,
  and the HUD marks the pass in gold. The honest autopilot clears every seed on
  every loop — the loop never becomes unwinnable.
- **CLOSED by #2905**: the tree line walks and the bandolier keeps its fire
  honest — each canopy nest rotates through three fixed perches after every shot
  (zero rng, frozen aim during the telegraph, roof exempt), and the vest
  grenadier is lob-only like the cabinet's: the rifle branch no longer answers
  for `nade` soldiers.
- **CLOSED by #2902**: the arcade loop now SPEAKS — see "#2902 What the loop
  looks and sounds like" below.
- **CLOSED by #3035**: the somersault jump shipped — the cabinet turns the hero
  a full revolution through every jump (ART bar 2: falls animate); ours hung a
  static tuck. `rollT` per seat arms on the jump event, clears on landing and on
  a vine catch, and never arms for a step-off or a drop-through; the body paints
  one 37-tick turn while the gun arm holds the live 8-way aim. Presentation is
  provably outside the referee: rollT never enters `stateHash`, zero `gs.r` —
  every physics pin, replay and twin law stands byte-for-byte.
- **CLOSED by #3038**: the cabinet's duck shipped — DOWN on the ground cycles
  stand → kneel → prone, UP stands, and the whole body obeys: the muzzle drops
  to deck+11 / deck+6 and fires level, travel becomes a half-speed crawl, and
  the profile takes the hit (a chest-line round eats stand and kneel and passes
  over a flat body; a head-high round sinks under the kneel). The ground stays
  honest — deck blasts are measured off the lowered belly, soldier contact is
  the feet law, the torrent never moved — and the honest autopilot never ducks,
  so every tuned seed stream runs byte-for-byte (pinned: zero DOWN presses).
  See #3038 in the engine notes below.
- **CLOSED by #2917**: the SECOND air layer shipped — a hangar mouth in the
  fortress parapet grinds open (the attack is telegraphed by the door, never
  born on screen), one armoured gunship sorties at a time, patrols the arena
  sky and works the deck with lane-aimed down-rounds at pinned, SHALLOW speed
  (the hop is always the answer), takes three rounds with a spark per hit and
  a named fireball (+400), and the pierce law applies verbatim. The shuttered
  core stays the ONE weak point; schedule, altitude and rearm jitter are pure
  seed/tick arithmetic (zero `gs.r`), and the honest autopilot still clears
  12/12 loop-1 seeds — the fairness findings are in the engine note below.

- **CLOSED by #3037**: the most famous instruction in arcade history is real here —
  `↑ ↑ ↓ ↓ ← → ← → B A` typed at the attract screen starts the run with **30** in
  the shared pool. Referee-clean: a pure sim-side detector (`konamiFeed`, zero
  `gs.r`), the prize enters only at `makeGame(seed, loop, lives)` (default 3 keeps
  every shelf pin byte-for-byte; lives already ride `stateHash`, so armed runs are
  honest replays), and the loop carries a >5 pool un-clamped (≤5 carries exactly
  as before). Attract teaches it, the typed notes glint gold, a `THIRTY UP!` salute
  rides the hot start, and the pad rides the attract screen with a `B` button so a
  phone can type it. See the #3037 note at the foot of this README.

## #2917 The second air layer — hangar sorties at the gate

Konami's gate kept its sky armed: while the heart beats behind the shutter, a
bay in the parapet sends out an attack plane. The stage's sim spine:

- **Telegraph first, always.** The door cycle is `open → launchAt → hull`: the
  mouth grinds for `gsTelegraph` (34) ticks — beacon blinking, ribbed shutter
  rising into the lintel, bay floor glowing — and only then does the hull drop
  out of the mouth. Nothing is ever born from a shut door (the spawn-doors'
  law, promoted to the sky).
- **One sortie at a time** — the courier law (#2847) verbatim. The next door
  cycle is armed `gsNext` (480) plus seed jitter, faster on hotter loops —
  but by `sortieK` = HALF the tempo ramp (`1 + (k−1)/2`), not by k itself.
  Schedule, altitude choice and rearm jitter are all seed/tick arithmetic:
  **zero `gs.r` draws** (pinned — the tuned autopilot stream and every
  rng-driven law byte-for-byte stand), and door, schedule and airframe all
  ride `stateHash`.
- **The strafe law (fairness by construction).** The hull's rounds fly at
  `eBulletSpeed` — pinned since #2894 — and are lane-aimed at the nearer
  grounded hero, but `gsVyMax` (1.0) caps how steep a hull round ever dips:
  it always lands in the flat-shot family the game already teaches the answer
  to (the autopilot's hop window is `|vy| < 1.2`). The hull only fires while
  OVER the fortress (`x > wallX`) — never from directly overhead, so every
  round gets the long flight — and only at a GROUNDED target, the snipers'
  law verbatim: shooting at a hero who has already made the move the game
  teaches is a tax, not a shot.
- **The airframe is shootable armour** — three rounds (`gsHp`), spark per hit,
  white flash, scorch at two, flame-and-smoke at one, named fireball +
  `gsScore` (400) at zero. FIRE/LASER pierce one take per hull per beam
  (#2854 law); contact with the hull kills either seat (the runner law — this
  is a weapon, not cargo), while the band (`gsAlt` 52..70) sits above a
  grounded hero's flat aim and below his hop apex, so an aimed hop under a
  passing sortie survives by design.
- **The fairness finding (why the threat bends, not the brain).** Three
  autopilot additions were tried during this stage's tuning and EACH LOST
  seeds (12/12 → 11, 10, 8): an arrival-hop for hull rounds, a wall-pin hop
  fallback, and hull-priority fire that pulled the brain out of its patrol
  band. So the THREAT moved instead — the `gsVyMax` cap, the over-the-fortress
  firing window, the grounded-target law and `gsRearm` 320 (a strafe, not a
  torrent) were tuned until the UNCHANGED autopilot cleared 12/12 again. The
  autopilot is the calibration standard; a threat that needs a new brain
  answer is a threat that needs a softer schedule. The finding repeated at
  heat: the sim-core draft ramped sortie cadence by the full tempo k, and the
  capped-loop bank (loops 4 and 9) died on seeds 6 and 9 — the hull's shallow
  round arrives at the wall where there is no road, on top of the cannons'
  already-hot rearm. `sortieK` halved the ramp and the bank cleared 12/12
  again, loop 1 untouched. Cadence is the dial; the brain and the bullet are
  not.
- **Two traps for the next hand** (from the draft PR): `gsFirstShot` (40) must
  stay under the fortress-crossing time (~65 ticks at k=1) or the hull
  silently never fires — a pin must catch that; and the autopilot must not
  change to accommodate new threats.

## #2902 What the loop looks and sounds like (presentation)

The cabinet-era language for "the stage comes back hotter", all derived from
`gs.loop` at the shell (the sim can't lie about the heat — and none of it
consumes `gs.r`, so replay determinism and every pre-loop pin stand):

- **The resume is an interstitial**: STAGE CLEAR hands back PLAY with a banner
  slam — wipe bars sweep in from both edges, `LOOP n` lands oversized and
  settles, and `STAGE 1 STRIKES BACK — TEMPO x1.20` reads under it
  (`drawLoopBanner`). The world is HELD for `LOOP_FX` (110) beats while it
  reads — the two quiet beats before the jungle starts moving. The sim is not
  ticked during the hold, so the resumed run's tick stream is identical to a
  banner-less resume (the autopilot seeds don't even notice).
- **The bank celebrates**: the shared-pool heads row flashes gold while the
  banner holds — the +1 loop courtesy landing is something you see.
- **Heat you can see**: the jungle sky runs one notch redder at loop ≥3
  (`heatSky`, capped two notches from loop 4, mirroring LOOP_CAP), and the
  soldiers'/snipers' muzzle flashes drain green toward red-hot from loop ≥2
  (`heatMuzzle`). Loop 1/2 return the exact base palette byte-for-byte.
- **Heat you can hear**: enemy reports (rifle/turret/sniper/cannon/depot slit)
  rise in pitch `loopVoice` = +6% a pass, capped x1.18 with the tempo — tied
  to `gs.loop`, never rng. The resume itself gets an ascending call with a
  snare slap under the slam frame.
- **Attract teaches the loop**: the demo survives its endings (it used to
  freeze on its last frame forever — found and fixed here), and a demo win
  rebuilds the SAME seed at loop 2: the banner slams over the attract jungle,
  the autopilot runs ~15 s of the hot stage, then attract copy returns.
- **Phone legibility**: the `LOOP n` HUD tag sits on a warm dark plate with a
  gold border — 8px gold over the bright jungle sky was the wash-out the QA
  pass flagged at phone scale.

Law that still stands (and is pinned): the loop tempo (`loopK`) is the ONLY
gameplay escalator. Nothing in the presentation scales round speeds, the
torrent, or the hop-fairness spine.


## PLAICRAFT trainable adapter (#1712, Contra next per #2953)

Contra is the second trainable game in the store — the same contract Gauntlet
enforces, proved end-to-end by `npm run plaicraft:datasetcheck` (scripted
human, not just a stub):

- **Consent gates recording, never play**: Contra's arcade law is *any key takes
  the seat*, so play never waits on paperwork. The question goes up at the
  human's first press and `beginRun()` only ships bytes the stored grant covers
  (mid-take grant records from that tick; declined → plays exactly the same).
  Recorded ticks are pad-pair banks — the autopilot demo that runs before the
  first press never enters a take (the Gauntlet rule the store rejects machine
  takes on).
- **Pad pairs as labels**: every recorded tick banks `[pad1, pad2]` — the 9
  boolean buttons VirtualControls dispatches per seat. The adapter maps pad1 →
  seat 0 and pad2 → seat 1 with `model.js`'s honest 67-feature vector (vision
  mask: enemies outside the live viewport are zeroed; the raw sim never enters
  a row).
- **Drop-in ceremony**: P2 joins mid-level like the arcade — `rules.seat2`
  records the tick of each successful `dropIn` (first drop, the death-out at
  `seatIdle` 600, and the loop-boundary re-drop after the score screen). Row
  law: seat rows exist exactly between claim and release; a seat-1 row between
  seatIdle and re-drop is refused. The claim latches at the keydown that calls
  `dropIn` (auto-repeat is blocked, so re-claims are always fresh presses).
- **Loops carry**: stage 8 win loops to stage 1 in-run (`sim.js` `arcadeLoop`,
  the score/lives+bonus/gun carry), so one take spans loops; the recorder never
  ends a take at a loop boundary (#2958: endings are run states, a `clear`
  screen is a scene).
- **One file, two paths**: the DEV `__game.buttons` recorder and the production
  recorder arm through the same spec (`recSpec`) — same law online as in QA.
 - **#3000 voice**: `voiceCmd` banks spoken wingman orders (intents, `seat: 1`);
   the raw mic track rides the take through the auto layer, honestly declared
   `voice: { slots: [0] }` — one device mic covers the thumb seat; the wingman
   seat is CPU by law and a "voice" claimed for him would be a wallhack.

## #3000 The wingman who answers — shouted orders (#1711 S5 voice lineage)

The cabinet's co-op was two men talking over the gunfire; phones get one
touchpad (Jon's rule), so the words ARE the second gunner's channel. Words
steer the CPU wingman — the Gauntlet partner model (#1249), applied to Contra.

- **Pure grammar** (`voicecalls.js`, contracheck-pinned like FireCrew's
  voiceradio): two channels, each shout replaces only its own —
  aim (`AIM UP` / `AIM DOWN` / `AIM LEVEL`) and formation
  (`FOLLOW` / `HOLD` / `SPREAD`). Specificity: aim first ("aim up the ladder"
  moves the barrel, not the feet); sky threats rank ABOVE the word "down"
  ("bring the gunship down" points the barrel UP at the plane). Bare
  directions and commandless verbs REFUSE — the wingman acts on orders, not
  guesses ("up!" is a jump or a climb, and "aim" without a height is a
  shrug). An unrecognized shout banks `ok:false, why:'NO CALL'` and keeps
  every channel's last order.
- **The order seam** (`sim.js` `applyCall(gs, intent)`): two slots
  `gs.orderAim`/`gs.orderForm` (+ `gs.holdX`), defaults `level`/`follow` =
  today's stance — **an un-spoken run is the pre-#3000 game byte-for-byte**
  (twins hash-identical, pinned), orders ride `stateHash` (a replay cannot
  silently drop a shout), and `applyCall` consumes **zero `gs.r`** — a shout
  cannot bend the seed. `arcadeLoop` resets orders: a new stage starts with
  nothing said.
- **Obedience stays honest**: `allyBrain` obeys only inside what it already
  sees (it never reads `gs.r` or off-screen state — same rule as before), an
  aim order moves the BARREL, never the hop/dodge decisions (pad.a untouched —
  the fairness spine is pad-and-threat only), and a HUMAN in the blue seat
  keeps his own hands (orders steer the brain, not a person's pad).
- **Survival outranks the shout**: HOLD stands at its post (clamped to the
  live screen — an order is always keepable at least to the visible line) and
  SELF-RELEASES when the scroll reaches the post (the board took his position;
  wingman autonomy, pinned: stands ~24 ticks, drift ≤ 2px, then chases). In
  the falls, formation is IGNORED — the torrent law out-ranks the shout
  (pinned: a held seat's climb is byte-identical to the un-spoken twin; a
  held seat there is a drowned seat).
- **Mic law reuse, no new asks**: the #1711 auto-record gate is the consent
  surface — a stored voice grant arms recognition at human start (plus
  `acquireListenBadge` — LISTEN ≠ REC, #1427); desktop `V` toggles the radio,
  reusing the stored grant before the #1247 prompt (#2985 pattern); permission
  dying mid-run disarms loudly ('NO MIC, NO RADIO'); GAME OVER / unmount kill
  the mic — it never stays hot. No speech engine (Safari, headless) = the
  channel honestly reports UN-ARMED and play is untouched.
- **The take remembers**: every heard phrase banks through `recordVoiceCmd`
  (#1249) as `{t, said, intent|null, ok, dir?, why?, seat:1}` — seat 1, the
  seat the words steer — and the consent-gated raw track rides the take
  (motion-only takes are over). Words bank as INTENTS, never as fake pads —
  seat rows stay human-only (#2058).
- **Presentation**: the banner echoes every call under the HUD strip (ART
  one-message law) — gold for obeyed (`AIM UP`), grey-green for refused
  (`NO CALL`); a gold notch blinks above the wingman while `AIM UP` holds the
  sky; ack chirp / refuse knock via `audioController` (ART bar 4); one attract
  line teaches the order set (touch copy says the mic, not the keyboard).
- **Harness**: `npm run contracheck` grew 20 #3000 pins — grammar (27 calls +
  9 refusals), honesty (zero `gs.r`), defaults + loop reset, the invariant
  twin law, hash divergence, SPREAD/FOLLOW/HOLD dynamics (scripted drill,
  seeds 1..12 — seed 9 dies holding, so the drill names a survivor), the
  falls override, AIM UP diagonals (0 vs 541 up-rounds), the human-seat
  override, and a browser leg: headless reports un-armed, `__contraTest.say`
  drives the mic seam, and a contract capture banks `voiceCmd`. Named
  mutants: `voice-deaf` (the seam ignores aim shouts — "the radio became
  theater") and `drift-hug` (defaults drift — every pre-voice pin stands on
  sand); both die by name.

`scripts/plaicraft-dataset.mjs#contraRows` replays take actions against the
headless sim (`sim.js` + `sim.run`) and rebuilds with `arcadeLoop` at the
victory boundary; a take whose claimed drops the sim never performs is refused.
Named mutants (`--mutant` 10–12): adapter bypass, drop-in-law ignore, and
loop-carry skip all fail loudly. Known gaps: one pad on phones (by law, and
#3000's spoken orders are the second channel that law allows); voice capture
itself shipped in #3000 — the pad takes stay labeled AND the words bank.

## QA #3019 — the refuse knock survives the phone (2026-11-23, studio)

`callNo` was a lone 180 Hz triangle; #3016 raised its gain but small phone
speakers physically roll off below ~250 Hz, so the fundamental cannot be made
audible by volume. The knock now carries a 330 Hz octave at slightly lower
gain (0.055 vs 0.08, 50 ms vs 70 ms) — still one dry "nothing to obey" tap,
but its harmonic rides above the rolloff knee. Pinned by a `contracheck` leg
that spies oscillator births around `say()` (synchronous slice — race-free):
refuse schedules exactly [180, ≥250], the ack's 620 Hz sweep is untouched.

## #3037 The Konami code — the legend and the referee (never-dry stage)

Kicked from the #1571 ladder (`KICK CONTRA -1 weak` via feedback #2971; every README
gap CLOSED at kick time), the gap was scoped live from the cabinet: the one signature
rule the shelf was still missing was Konami's own — `↑ ↑ ↓ ↓ ← → ← → B A`, typed at
the attract screen, starts the run with **30 lives** in the shared pool.

- **The shell owns the typing, the sim owns the law.** `konamiFeed(progress, key)`
  is pure arithmetic in sim.js — the harness pins it in Node — and the shell just
  forwards attract-screen keydowns into it. `gs` is untouched until
  `startPlay(lives)`: the attract demo runs byte-identical while a finger types
  (zero `gs.r`, zero hash perturbation off-sequence).
- **Where the prize lands.** `makeGame(seed, loop = 1, lives = 3)` — a third arg
  whose default IS the old constant, so every pre-Konami pin, replay and dataset
  byte stands; `lives` already rode `stateHash`, so armed runs are honest replays.
  Absurd pools clamp to 99 (the HUD's numeric form).
- **The loop carry law.** `arcadeLoop` banks the courtesy only while the pool is
  at or below `LOOP_LIVES_MAX`; a bigger pool carries whole (30 marches through the
  arcade loop). Value-identical at ≤5 — but this is a real law change, and one
  existing browser leg silently encoded the old clamp (it compared pools across two
  stages, leaning on the harness's 99-sentinel normalizing to 5 at every boundary).
  It now asserts `min(5, lives-at-win + 1)` from the observed win pool: identical
  at every value the pre-Konami game could reach, honest at the new ones.
- **The entry law.** At attract the NEXT correct note is swallowed (an NES title
  swallowed arrows too); a slip resets the count (a stray `↑` restarts it at 1, the
  behaviour every kid learned by heart); any other press starts as it always did;
  and the completing press doubles as the start press — the any-key law IS the
  start button in this arcade — so the seat is taken hot. Touch: the pad rides the
  attract screen (arrows + `A`=Space + `B`) and the pad is excluded from
  tap-to-start so typing can't double-fire it; a background tap still starts.
- **Seat 2 law untouched.** The code is one hero's typing: `KeyA` at attract is
  the code's last note — during play it remains P2's left and `dropIn` is
  play-only. The HUD head row gains the gold numeric form past seven heads (30
  soldier icons would run off the 384px grid).

**Trap for the next hand:** kProg lives only at attract — `startPlay` and `endTo`
reset it. Never feed the detector during play: that would hand out lives mid-run,
and it doesn't help the #1712 bank either (pad pairs know nothing of cheats and
must stay that way — the typing happens before `beginRun`, by construction).

## #3041 The score extend — the cabinet pays its 1UP (never-dry stage)

Kicked from the #1571 ladder (`KICK CONTRA -1 weak`, second pass; every README
gap CLOSED at kick time, the point coming from feedback #2971 — a `waiting-jon`
trainable-adapter artifact), the gap was scoped live from the cabinet: the run
could earn points forever but never earned anything for them. The arcade pays
**extra lives for score** — the Konami instruction card's documented prize is
the **30,000-point extend**. That rule now stands here:

- **The rule.** Crossing `gs.nextExt` (first mark 30,000) adds **+1 to the
  shared pool** and advances the mark by `EXT_STEP` (50,000). Fidelity note
  per the #237 rule: the first mark is the manual's; the repeat rung is the
  era-typical Konami staircase — the exact repeat interval is not documented
  in the repo, recorded here rather than guessed silently. The pool caps at
  99 (the HUD's numeric form, `makeGame`'s clamp): at the cap the mark still
  advances and no salute is owed — a rule that lies about paying is worse
  than a cap.
- **Referee-clean.** The crossing check sits at the head of `step`: pure
  arithmetic, **zero `gs.r`** (pinned — a paid tick and an unpaid twin advance
  the seed identically), and `nextExt` rides `stateHash` (a replay that
  silently skips an extend diverges loudly). One mark per tick; the biggest
  single award in the game (+5000, the core) cannot outrun a 50,000 rung, and
  the harness pins that an oversized jump is paid on consecutive ticks, never
  skipped or doubled.
- **The mark belongs to the RUN.** `arcadeLoop` carries `nextExt` with the
  score — a rung spent in loop 2 is never re-sold at the stage boundary
  (named mutant `carry-blind` dies for trying).
- **Byte stability.** The honest autopilot's loop-1 clear score tops out at
  19,900 (pinned across seeds 1..12) — below the first mark — so every
  pre-extend seed stream, twin law, pin and PLAICRAFT dataset byte stands
  untouched. Konami 30-lives pools ride the rule too (extends add to any pool
  under 99; the loop carry law from #3037 — pools >5 carry whole — is
  untouched).
- **Presentation.** The sim banks an `extra` event; the shell rides it with a
  gold `EXTRA LIFE!` plate on the salute band (y 58..76, the Konami salute's
  band — the code lands at attract, the extend lands in play, and both guard
  each other), the #2902 heads-row gold flash re-used for the landing, and a
  three-note rising sting shorter than the code's salute. One attract line in
  each copy set teaches the mark. DebugKit gained `ARM EXTEND` (stands the
  score one kill below the mark) so the whole rule is phone-checkable in
  seconds.
- **Harness.** `contracheck` grew 8 sim legs (marks, crossing, cap, one-rung-
  per-tick, loop carry, zero-rng twin, hash divergence, loop-1 score ceiling)
  and 3 live legs (a real kill crosses the mark through held keys on a fixed
  seed — pool, mark and salute all bank; the plate paints gold; zero page
  errors). Named mutants: `extend-deaf` (the mark never pays — the 1UP is
  folklore) and `carry-blind` (the mark resets at the boundary — the same
  life is re-sold every loop). Both die by name.

**Trap for the next hand:** the crossing check MUST sit at the head of `step`,
before the death-freeze return — a kill that crosses while the body is frozen
still owes its life on the next live tick, and a check parked after the freeze
would delay it exactly one death and break twin determinism at the boundary.
