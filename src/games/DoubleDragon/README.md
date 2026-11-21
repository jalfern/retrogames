# DOUBLE DRAGON — S1 "Walnuts Street" + S2 "the weapons wall" + S3 "the hideout" + S4 "the second dragon"

Jon's #2795 commission ("both flagships starting with double dragon"), the complete
Technōs 1987 arcade belt-scroller. Issue: #2807 (S1..S4 — this issue's four stages
are all shipped).

## Layout

- `sim.js` — the whole game, DOM-free: waves, enemy FSM (enter/walk/windup/
  attack/back/stagger/down/getup/grab, plus S3's aim/cast for the steel-
  throwers), Billy's move set, stick pickups, the wave-lock camera, scoring,
  the two-stage flow (`enterStage2`, `rescueReady`, Marian's ropes),
  `autopilot` (attract demo + harness brain), `stateHash`. The rng rides IN
  `gs` (`rngState`, `nextId`) so snapshot/restore is byte-exact (#391).
  S4 generalizes the seat: `makeFighter(tag)` — `gs.jimmy` is a second fighter
  on the same physics bank, `targetOf` picks which dragon each thug works,
  `dragonBrain(gs, self)` drives any seat (Billy's autopilot and Jimmy's CPU
  seat are literally the same function), `fighters/activeFighters` feed every
  rule that used to name Billy.
- `art.js` — night-suburb backdrop (sky gradient + stars + moon, parallax house
  silhouettes with lit windows, pylons and sagging wires, chain-link + hedge,
  asphalt with deterministic grain, sodium-lamp glow pools) and the S3 yard —
  corrugated rust wall with riveted sheet joins, transom windows wearing
  sodium light, pipes and valve wheels, swaying chain-lamps, hazard stripes,
  oily concrete, `DD`/`87` graffiti. The pixel fighters
  (one parameterised `fighter()` per palette/pose, incl. the duel lieutenant's
  cap-and-sweep), Marian on the post, HUD, banners, and an original 5×7 arcade
  font (43 glyphs, width-checked).
- `index.jsx` — shell per docs/GAME-SHELL.md: one rAF loop, fixed timestep,
  attract-first, `?` PauseOverlay, `tapStart`, pad, DEV hooks, contract.

## The laws this game lives by (all pinned by `ddragoncheck`)

- **Depth is the dodge.** The street is a band (`DEEP_TOP..DEEP_BOT`); a swing
  only connects when `|dy| <= 8`. That single line IS the genre — `--mutant`
  plants a depth-blind hit and the check names the harm.
- **Arcade lethal.** One clean enemy hit costs a life; 3 lives; 100-tick
  respawn flicker.
- **Telegraphs.** `windup` (12 ticks) precedes every `attack`; hitting a goon
  in the windup staggers their turn away.
- **Crowd law.** At most two goons may windup/attack at once (`attackersMax`).
- **Spin back-heel** fires when a swing is asked for with two live goons within
  radial reach — boots both ways.
- **Grabs** (Amon/Abobo): mash KICK 3× within `grabTimeout` (52 ticks) or the
  knee takes a life.
- **The charge** (#2810): from mid-distance Abobo telegraphs 16 ticks of
  run-up (`chargewind`), then body-checks the lane at 2.8px/t until it leaves
  the frame — depth still decides; a committed dash whooses past an empty lane.
  The autopilot reads the telegraph wider than a punch's and sidesteps.
- **KO flash**: `gs.scoreFlash` rides the HUD (delta popup + three wave ticks);
  juice only — never mixed into `stateHash`.
- **Stick**: armed Amon drops it on KO; reach + damage double; it dies with you.
- **Stage loop**: three waves → banner → Walnuts Street re-runs, score carries.

S2 (the weapons wall, #2807):

- **Contextual PUNCH** — bare = jab; knife = THROW (the delivery, not a wave);
  whip = LASH. KICK stays a kick whatever you hold.
- **Reusable steel** — a thrown knife flies flat down its lane (4 dmg, kills a
  Williams outright) and lands back on the street as a pickup, hit or missed.
- **The whip** — reach 34, catches EVERY standing man on the line, and skips
  downed ones (standing swings don't stomp; the lash doesn't either).
- **Barrels are solid.** Three squat on the street; Billy and the goons must
  ask `blocked()` and walk round them — or hop the waist-high ones (z > 8).
  Three clean hits splinter one: +100, and it spits out the steel inside
  (knife / whip / stick, seeded). Two traps this taught, both pinned: a goon
  slipping off a barrel must move AWAY from its lane (re-deriving the slide
  direction from the current y ping-pongs on the mid-line), and a body in the
  footprint corner has both axes blocked — `stuckFree` slides depth to the
  nearest open lane.
- **One weapon in hand** — walking over a second weapon while armed does
  nothing; death costs what you hold (the stick law, generalized).
- **The stick beat** (#2819 polish) — landed steel stands in the asphalt ~20
  ticks, quivering, before it becomes grabbable; a blade in the ground cannot
  be yanked out. The whip holds a white crack-flash for 4 ticks on the tick
  it bites (`b.lash`); splintered wood reports its spot (`gs.fx`, juice-only)
  so the shell showers staves there, and its cargo clatters out with two
  decaying hops (`p.clatter`). Labels tint per weapon (steel white / leather
  brown / wood gold) and a knife on the street winks steel every 24 frames.

S3 (the hideout, #2807):

- **Two stages, one run** — clearing Walnuts Street opens `stage 2`: the
  industrial yard (crates refill where barrels stood, Marian spawns tied at
  the end, banner announces `STAGE 2 / THE HIDEOUT`), score carried.
- **Casters** — an armed Williams holds mid-field and COCKS a 16-tick aim
  before the blade flies flat down its lane. On the line it costs a life;
  ten deep it whizzes past; a crate between you eats it; and every escaped
  blade lands as pickable steel — reusable in both directions. The depth law
  is the only answer, thrown edition (`blade-blind` mutant guards it).
- **The duel** — the arcade's stage-2 boss is Williams himself: 10 hp, 800
  points, faster than his namesakes, a belt full of knives (reload cooldown
  instead of depletion). The duel wave closes only when he falls, and the
  stage does NOT clear yet — the rescue must be earned.
- **Marian's rescue** (`rescueReady`) — the ropes are untouchable while any
  duelist lives (pinned). Two punches after the win free her: +1000, the
  cheer, then the run loops to Walnuts Street with `cleared` earned.
  `rescue-blind` (a run that can never end) is a named mutant.
- **Stage readout** — the HUD wears `1-1` / `2-1` beside the wave ticks;
  the rescue pays the cabinet's THANKS, BILLY.

S4 (the second dragon, #2807):

- **Co-op is the default seat** (Jon's multiplayer rule): Jimmy Lee fights beside
  Billy on a fresh cabinet — same physics bank, own bank of three lives, CPU-driven
  until a human takes the keys. `?solo=1` declines the partner; the SHELL defaults
  co-op while `sim.makeGame(seed)` defaults solo so every S1..S3 law fixture still
  drives exactly one dragon.
- **The crowd splits by nearest** — a thug commits to the dragon closest and only
  switches when the other gets 24px meaningfully closer; windups, charges, casts
  and grabs finish on the dragon they started with (`ally-blind` mutant guards it).
- **Arcade lethal wears on both seats** — a clean hit costs the seat it finds,
  not Billy by name; lanes, blades and knees all resolve against whoever owns
  the lane.
- **Game over only when both banks run dry** — a drained seat goes dark, the
  partner carries the street, and the fallen dragon rides the **second wind**:
  one life back when the next stage opens (`seat-blind` mutant guards it).
- **Crowd law grows**: two attackers pile on a lone dragon, three with two
  dragons — never four.
- **Marian's ropes answer either dragon's fists**; thrown knives fly from both
  seats and blades take the dragon on the lane.
- **No friendly fire** — dragons share a lane and swing without costing each
  other (deviation from the 1987 board, recorded on the issue: the original had
  no CPU partner, and a CPU seat that could cost you a life is not a partner;
  Jon's phone-play rule points the other way).
- **Drop-in law** (Contra S4): the first touch of a P2 key (WASD · F punch ·
  G kick · V jump) hands Jimmy to a human for the rest of the run. No second
  touchpad (Jon).
- **The crate-corner deadlock** (this stage's hard lesson): a body k-slipping
  around a prop while a lane-chaser pulls the other way froze dragons and a
  Williams for 57,000 ticks on co-op seed 2. Two laws pin the fix — the
  k-slip prefers the depth the body ALREADY wanted, and the brain closes BOTH
  axes toward a target (walk to the target's side of wood; never mash depth
  into it).

#2825 polish (QA) on S3:

- **The cast is HEARD coming** — `aim` rides a rising wind-up whoosh under
  the blip, and the cast itself rings steel (1560 Hz + a noise tick), so a
  pad player can hear the lane they must leave.
- **Throwers keep thrower's distance** — an armed Williams at punching range
  back-pedals and strafes to a fresh angle instead of idling into the fist
  fight (walk FSM; a spinner with its reload still up, or a cornered man,
  still brawls). The duel holds his distance always.
- **The duel announces itself** — the boss wave fires a `duel` cue and a
  `WILLIAMS / THE LIEUTENANT` banner; the lieutenant marches in and HOLDS his
  pose at the frame edge (`gs.duelIntro`, 90 ticks) before the exchange.
- **The yard reports in pine** — crates push `crate_hit`/`crate_break` (a
  heavier thud and split) so stage 2 sounds different from the barrels.
- **Marian lives** — she sways, flicks her hair and blinks while tied; the
  freed cheer hops, waves alternately and floats a pixel heart; the post
  wears its rope coil after the cut.

#2833 polish (QA) on co-op:

- **Jimmy has a personality now** — `dragonBrain(gs, b, ally)` runs the blue
  seat with an ally lens: he hangs half a beat outside a scrap Billy is
  already locked into (circling in at mate.x−30, not piling on), goes for the
  showy spin a notch sooner (reach+14, snapping out on a faster %5 beat), and
  on a quiet street falls in beside his brother — depth matched, a shoulder's
  width behind. Billy's brain stays the sober one; the crowd law, reach law
  and no-friendly-fire law are untouched.
- **The blue seat sounds blue** — seat-centric sim events carry a `_b` suffix
  when Jimmy acts (throw/whip/whoosh/jump/land/pickup/struggle/escape/hit/
  hit_hard/knife_hit) and the shell answers with detuned variants, so the two
  dragons sit apart at an ear. Events never ride `stateHash` (juice law).
  The `one-voice` mutant names a shared-voice regression.
- **Second wind shows its work** — a drained seat revived by `clearField`
  stamps `backAt`; the cabinet blinks its tag and headbands white for 90
  ticks so the fresh life reads at a glance. The blue seat also wears a tiny
  `2P` tag in the HUD gap between the HI score and the band column.
- **Drop-in edge: a falling seat takes no input** — buttons pressed while a
  drained dragon is tumbling must not resurrect input before stand-up;
  `updateFighter` returns at the `out` gate before any pad touch.
- **Rescue manners, honestly scoped** — the cutter answers steel still in the
  air while walking the ropes (duel knives outrun their throwers). Live goons
  can't gate the ropes: `rescueReady` already means the field is empty, so
  the "hold the guards off the post" idea was dead code by construction and
  was removed rather than pinned — guard-holding lives inside the waves, where
  the hang-back law keeps the pair arriving in order.

#2851 partner personality (forge) — the mirror stops being a mirror:

- **Guardian law** — when the seatmate is in a thug's grip, the blue seat
  abandons its own nearest mark and sprints the holder (grip identity is
  `state === 'grab' && tgt === tag`, not the id — fixtures reuse ids). The
  solo autopilot passes no ally, so attract and the WINNABLE stream keep the
  old law and their hashes.
- **Release law** — a grip is only as strong as the thug holding it: when the
  holder is staggered, dropped or killed while gripping a dragon, his prize
  comes loose (idle, unstuck, 24 ticks of mercy i-frames, a blue escape
  sweep). Symmetric across seats — a human P1 breaking a grip frees CPU
  Jimmy, and vice versa. Matches the arcade: hit the grabber, he lets go.
- **Technician's cadence** — the arcade duo split by school, Billy=power /
  Jimmy=technique. The ally seat abandons the mirror's 9-beat hammer-kick
  for a 13-beat jab-jab-cross (13 ⊥ 9): the dragons interleave instead of
  swinging the same bar in lockstep.
- The `guardian-deaf`, `grip-permanent` and `cadence-mirror` mutants name
  each law's collapse.

#2860 a friend's own pad seat (forge) — two humans stop sharing one keyboard:

- **The seat reads slot 2** — the GamepadBridge (#492) lands a second physical
  pad (and LinkPads #893 a linked iPhone) in onePad slot 2; here it merges with
  the keyboard's P2 keys — **either drives, both together union**.
  The mapping mirrors P1's physical layout: d-pad/stick walks the street,
  **A jump · B kick · square/triangle/LB punch** (the slot's third action,
  `boost`, is new plumbing in `slotFieldsFrom`/`GamepadBridge` for pads —
  a phone's Y button already lands on boost). The translation lives in
  `p2pad.js` alone, pinned by the equivalence law: the same stream through
  the keyboard and through slot 2 lands on identical state hashes.
- **Drop-in, same clause** — the first live input on slot 2 (`slotActive`
  counts boost, so punching also seats the friend) takes Jimmy for the run and
  pays the join chime exactly once. Solo runs have no seat; a fallen dragon is
  not resurrected by a wiggle; releasing the pad does NOT hand the seat back
  to the CPU — the keyboard's drop-in law, verbatim.
- The `seat-swap` mutant names the seat's translator breaking (A goes dead
  air while the hop migrates onto B).

## Controls

Arrows walk (UP/DOWN = depth) · SPACE jump · X kick · Z punch · ? ops card.
Pad: JUMP / KICK / PUNCH (`thirdAction`, #2324).
2P drop-in (keyboard): WASD walk · F punch · G kick · V jump.
2P drop-in (pad/phone, #2860): a second gamepad or a linked phone (`?pads=1`
or the PADS pill) — A jump · B kick · square/triangle/LB punch · d-pad walk.

## Verify

```bash
npm run dev -- --port 5173 --strictPort   # one terminal
npm run ddragoncheck                    # 126 checks: boots, laws, casters, duel, rescue, co-op seats, personality (guardian/release/cadence), p2 pad seat, winnable, browser leg
npm run ddragoncheck -- --mutant     # depth/charge/blade-blind, barrel-ghost, rescue-blind, ally-blind, seat-blind, guardian-deaf, grip-permanent, cadence-mirror, seat-swap must go RED (named)
CONTRACT_ONLY=double-dragon npm run contractcheck   # window.__game contract leg
```

Roster notes: joined BOTH lists at once — `scripts/lib/contractGames.mjs`
(and its PATTERNS) and the `nightlybot.mjs` soak roster (#1525 law, the lesson
of nightly 44762398189).

## Honest gaps (the whole commission shipped; what's still short)

- **DISCLAIMER** — the arcade had no CPU partner to imitate: Jimmy's
  personality is designed, not restored (#2851: the guardian law, the
  release law, a 13-beat technician's cadence over #2833's manners).
  Seat-specific throws and post-KO flair are open craft, not fidelity gaps.
- **CLOSED by #2860** — two humans at one keyboard: P2 now also takes a
  friend's own controller — a second gamepad or a linked phone (A jump · B
  kick · square/triangle/LB punch), any input seats them drop-in. Two pairs
  of hands, zero shared keys. (The pure keyboard seat remains WASD+F/G/V.)
- The yard's light pools sway but cast no moving shadows and the floor carries
  no swarf/drip dressing (#2825 items deferred to a future art pass).
- No combos/chain scoring bonuses; the original scores per-KO with a simple
  chain multiplier — carry added, chain not.
- Marian arrives tied (S3) but the game opens without the original's
  kidnapping cutscene — the rescue carries the story instead.
- Enemy knockback is positional, not sprite-true physics; fine at this scale.
- Goons carry knives (S3) but not the whip or stick-and-steel rotations of
  the later arcade waves; the thrown knife is the goon's only cast (and the
  original's goons never threw whip or barrel either).
- The duel's re-arm is a cooldown, not a walk-to-the-body pickup like the
  arcade's knife retrieval.
