# DOUBLE DRAGON — S1 "Walnuts Street" + S2 "the weapons wall" + S3 "the hideout" + S4 "the second dragon"

Jon's #2795 commission ("both flagships starting with double dragon"), the complete
Technōs 1987 arcade belt-scroller. Issue: #2807 (S1..S4 — this issue's four stages
are all shipped). A run now opens the way the arcade did: the kidnapping movie (#2891).

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
  sodium light, pipes and valve wheels, swaying chain-lamps (the cast law —
  pools and grounded shadows ride them), hazard stripes, oily concrete with
  seeded swarf and a leaking drum, `DD`/`87` graffiti. The pixel fighters
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
- **Chain scoring** (#2882): consecutive takes multiply the payout — 1st KO
  ×1, then ×2, ×3, capped ×4 (Abobo pays 4000 at the cap). A take is a fighter
  KO or a barrel/crate splinter; pickups, stage bonuses and the rescue pay
  flat. The chain dies the moment a seat eats a blow (`playerDies`) or the
  ~3 s window (`chainWindow`, 180 ticks) lapses without a new take; stage
  transitions carry the score, never the streak. `chain`/`chainT` ride
  `stateHash` (pure arithmetic, zero `gs.r`); the ×N HUD tag rides the flash.
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
- **The cast law** (#2877) — the swaying chain-lamps are the yard's key
  light: the warm pools ride their lamp's sway, and every grounded shadow
  (dragons, goons, Marian, crates, drums, spilled steel) leans AGAINST the
  lamp overhead, per-spot phase. The street's sodium fittings are dead — the
  cast gates off outside the yard. Shadows are juice: they ride the render
  clock, never the sim, never `stateHash`. Same pass: 28 frozen-hash swarf
  chips by the oil seeps, and one leaking drum keeps a 72-tick drip beat.
  `same-phase`, `street-on`, `shimmer` name the harms if it breaks.

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

#2863 seat greet, join shout, rumble parity (QA) — the blue seat sells itself:

- **Wake greet** — while slot 2 is alive (`connectedSlots() >= 2`) and the seat
  is still the CPU's and up, the HUD blinks `READY` under the blue `2P` tag
  (202,14; blink 24-on/16-off on `gs.tick`). A sleeping slot, a human seat, or
  a downed seat (which keeps its own READY at 254,14) never greet. Pure art.js
  law: five pins in `ddragoncheck` cover wake/sleep/dark/held/down.
- **Join shout** — every path that seats a human (`p2Seat` from pad/phone, the
  WASD keys, the dbg hook) routes through one `seatJoin`: chime + pad-2 rumble
  + `JOIN_T` (48) ticks of flare — a white core cross on Jimmy, four `#8fd0ff`
  brackets springing outward, and a blinking `PLAYER 2` on the banner row.
  The timer is shell state, never `gs` — outside `stateHash`, replay-safe.
- **Rumble parity** — `gamepadMap.rumbleSlot(slot, ms, strength)` is the twin
  of `rumble()`: slot n's nth-connected-pad actuator (same pad order as the
  GamepadBridge's slot numbering; slot 1 byte-identical to `rumble`). DD pays
  it: Billy's bites/deaths on pad 1; the blue seat's jabs, knockdowns falls and
  deaths on pad 2 — and only while a human holds the seat (the CPU's fists
  never buzz a pocket).

#2857 partner-personality read (forge) — the guardian laws now read like game-feel:

- **Guardian telegraph** — a dragon sprinting the thug who grips his brother
  wears seat-tinted speed lines off the trailing shoulder (`p.guard`, 8 ticks,
  re-stamped each tick he actually closes — a seat that ignores the grip earns
  no promise; honest like the blade law). The guard clock rides the fighter,
  never `stateHash`.
- **Grip-break impact** — when the release law fires, `gs.gripFx` reports where
  the hold broke; the shell answers with a white flash and seat-tinted sparks at
  the holder, and the freed seat throws a 9-tick arms-up relief pose (both the
  partner-freeing and the mash-freeing paths pay it).
- **Cadence readability** — the blue seat's bare jab bites as `jab_b` (294 Hz,
  snappier than the shared 233 `hit_b`) and every bare hit he lands rocks the
  thug with a wider stagger wobble (`e.wob` 7 vs Billy's 4; the draw sways 3 px
  vs 2). Technique vs power at an eye and an ear; Billy's sounds are untouched.
- **Post-KO flair** — the seat whose fist drops a fighter struts for 20 ticks:
  wrist flick (white spark) then a cocked shoulder check, with a snap `flair`
  (880 Hz red / 1175 Hz blue). A barrel or crate splinter pays score but never
  the pose — it is a KO strut (`flair-dead` mutant guards it).
- **Steel outranks the sprint** — the blade-dodge sits above the guardian law in
  the brain, and the ropes-phase QA leg (real keystrokes, duel knife still in
  the air) proves the CPU guardian keeps its lives on the way to the rescue.
- **Drop-in honesty fix** (this leg found it): the keyboard seat-take was not
  gated on P2's keys — *any* key was stealing Jimmy from his CPU for the rest
  of the run (arrows from P1 included, and the p2join chime rang on them).
  `isP2` now guards the seat line; the pad seat (#2860) is unaffected.
- The `glint-deaf` and `flair-dead` mutants name the two tells going dark.

#2889 guardian-read polish (forge) — the blue seat's tells survive the phone:

- **Chevron glint** — the guardian sprint's speed-lines were 3×2 dashes, exactly
  the shape a dock-zoomed phone averages into grey. The trail is chevrons now:
  3 wide, **5 tall**, apex toward the seat, arms swept back, at 10/16/22 px off
  the trailing shoulder. The 3-px spine is the extent that survives downscale;
  the deeper trail keeps marks lit when the outermost clips at a screen edge.
  Shimmer and the shoulder spark keep their guard-clock laws (`glintMarks` is
  pure geometry, pinned). `glint-flat` names a regression to thin marks.
- **Relief ties the HUD** — while the freed seat wears the arms-up pose, his
  blue `2P` tag blinks white on the same clock (lit on the odd ticks of the
  9-count), so the grip-break is told twice: arms on the street, tag in the
  corner. `tag-deaf` names the two halves splitting.
- **The strut walks** — the arcade let the KO pose finish through a step-back.
  Under the flourish rides a render-only back-step: one step (5 px) out in four
  ticks, held through the flick and the shoulder check, easing home in the last
  three — zero snap whether it finishes or a swing cuts it. The shadow stays
  planted (the #2857 wobble law); x truth is untouched, inputs are never
  delayed — non-blocking by construction. `strut-frozen` names the pose nailed
  to the floor.
- **KO squash** — a knocked-down man lands FLAT: the widest, lowest frame is
  the impact tick, easing back over an 8-tick beat (the #2897 proven width —
  a 2-tick beat got stepped over whole on a loaded box's frame rate, caught
  in the debug session, and the easing reads better: classic squash-and-
  stretch). About the feet; paint only — down still pins, positions never move.
  `squash-missing` names the weightless landing.
- **Phone mix** — `jab_b` kept its F#4 identity (294 Hz) but left the square
  for a triangle: the square's 3rd harmonic beat the pickup chime's 880 Hz
  middle note by 2 Hz, and on a phone's thin midrange a punch and the steel
  reward smeared into one buzz. The triangle drops that harmonic ~9.5 dB; the
  noise transient steps 0.02 → 0.03 to keep the snap. `mix-clash` replants
  the square and the source-law pin goes red. (Honest note: measured, not
  listened on a physical device — the fresh-ears pass stands until a pair of
  human ears says otherwise.)
- All five remain juice: none move `stateHash` (the #2857 juice-law pin holds).

## Controls

Arrows walk (UP/DOWN = depth) · SPACE jump · X kick · Z punch · ? ops card.
Pad: JUMP / KICK / PUNCH (`thirdAction`, #2324).
2P drop-in (keyboard): WASD walk · F punch · G kick · V jump.
2P drop-in (pad/phone, #2860): a second gamepad or a linked phone (`?pads=1`
or the PADS pill) — A jump · B kick · square/triangle/LB punch · d-pad walk.
`?nointro=1` declines the opening movie (#2891) — any key skips it anyway.

## The opening movie (#2891 — the kidnapping of Marian)

Technōs opened its arcade by stating the crime; so does this board, between
"PRESS ANY KEY" and the first wave:

- **A fixed script, not a game** — the movie rides `gs.intro`: the dragons
  stroll, the Black Warriors arrive (negative ids — the run's id stream never
  notices), Abobo takes Marian overhead (HELP! bubble), the dragons charge and
  LAND TWO KOS before the swarm answers, MARIAN TAKEN! stands over the emptying
  street. Determinism: zero `gs.r`, zero collisions — step() routes the whole
  game around the curtain.
- **Residue-free (the curtain law)** — at the last tick the street resets to
  exact spawn truth and `gs.tick` rewinds to 0: the run that watched the whole
  movie is **bit-identical** to the run that never played one (`stateHash`
  parity, pinned). Skipped runs land the same way.
- **Any input lifts the curtain** — after a 30-tick grace (the start tap
  settles), any key/pad press skips the movie AND lands as a real input: skip
  into gameplay, never eat the press.
- **Opt-in at sim level** — `makeGame(seed)` carries no intro: contract,
  replays' law fixtures and the seeded autopilot streams are untouched. The
  shell's human start arms it (`startPlay(introOn())`); `?nointro=1` declines
  at the cabinet. `__ddTest.start()` and `__game.reset` go straight to the
  street so harness legs never wait on a cartoon.
- **A new sound per beat** — the gang's arrival rides `wave`, Marian cries
  (`scream`, a two-part wail), the snatch is the `grabbed` growl, the caption
  pays a three-note descent (`taken`, with a shake); the curtain itself rings
  the stage sweep.
- The `movie-frozen`, `skip-deaf`, `crime-unnamed` and `curtain-stuck` mutants
  name the four ways an opening can rot.

#2897 polish (forge) on the opening movie:

- **The caption punches in** — MARIAN TAKEN! rides an eight-frame white beat
  (fast decay, first three frames ≥0.45 alpha so a software-rendered frame
  cannot step over it) and stands 124 ticks — a back-row hold — still clearing
  ~34 ticks before the curtain.
- **The street empties like the arcade's** — Amon is the straggler: still
  walking east, half out of frame, as the caption clears, gone six ticks
  before the curtain (`straggle-gone` mutant guards the empty-tail collapse).
- **KO tumble fragments, fixed at the root** — `R()` mirrors a rect's position
  but not its extent, and the down/dying sprawl is the one pose wide enough
  that at `face === -1` the head drew ~12px away from the torso against the
  asphalt (QA item 2, the same geometry under the "limbs detached" complaint).
  Down and dying now mirror extents for real (`scale(face,1)`), and the tumble
  SETTLES: an 8-tick pivot-and-flail, then the flat axis-aligned sprawl holds
  while the body fades — no held rotation fuzzing pixel edges. Both dragons
  and every goon benefit, live KOs included.
- **HELP! survives the phone** — the talk box wears a dark outline ring,
  roomier padding and a 2-frame ±1px jitter (the coin-op box wobbles as it
  talks); a 1px cream sliver downscales to nothing, an outlined box doesn't.
- **A panicked run that reads panicked** — Marian's sprint is now a 3-frame
  cycle (stretch / airborne / gather) with the skirt trailing and two streams
  of hair flicking behind her; at 1.1px/t the old 2-frame legs read as a
  stroll (QA item 4).
- The `straggle-gone` mutant names the tail collapse; the settle, the flash
  paint, the box outline/jitter and the stride airborne beat are pinned by
  five sim pins + five browser pixel legs.

#2935 weight-true knockback (forge) — hits move bodies by their weight:

- **The weight ladder** — every landed blow imparts a velocity authored in
  `CFG.knock` by strike kind: whip lash < bare jab < stick steel < spin <
  kick < flying knee (peak slides ≈ 2.5 / 5 / 6 / 5.3-per-leg / 7 / 9 px),
  divided by the man's MASS (`knock.mass`: Williams 1, Amon 1.15, duel 1.35,
  Abobo 1.7 — giants barely rock). The impulse decays with friction every
  tick, in any state — stagger reels, downed bodies skid, dying men travel.
- **Away from the striker** — the shove runs down the line of the fist
  (`sign(e.x − hero.x)`), not away from whatever way the goon faces; the spin
  back-heel shoves the crowd OUTWARD, left goes left, right goes right.
- **Depth is never the push axis** — the impulse is x-only, no k-slip on the
  shove: being hit cannot change your lane; `|dy| <= 8` stays the whole dodge
  answer (#2807's core law, untouched).
- **The street is solid, the screen is a wall** — the slide obeys `blocked()`
  (a man punched at a barrel is pressed to the wood, never through it) and
  lives inside the arena margins the thug footwork already keeps
  (`camX±16`, the thrower-retreat bounds). #found this the hard way: the
  first build parked a thug *past* Billy's camera-edge reach and three
  winnable seeds could never end the wave.
- **Down is a skid, not a glide** — flat bodies ride `downFriction` (0.62):
  short and sharp, ~1.6× the initial push. Long enough to read as thrown
  down, short enough that the classic stomp-the-downed-man beat still
  reaches him (and the stomp's foot PINs — it shoves nobody: 0 impulse).
- **The struggle shoves** — the release law (#2851) gained the push it
  visually promised: tearing free of a grip drives the grabber off the seat.
- **Hashed truth** — `kb` rides `stateHash` (same hash means the same
  future); zero rng rides the shove; pressed streams replay hash-for-hash.
- Winnability re-measured on the new physics: S1 seeds 1..12 12/12, the full
  run 12/12, co-op seeds 1..6 6/6. `knock-flat` and `bounds-off` mutants
  name the harm if the weight or the wall goes dark.

## Verify

```bash
npm run dev -- --port 5173 --strictPort   # one terminal
npm run ddragoncheck                    # 260 checks: boots, laws, casters, duel, rescue, co-op seats, personality (guardian/release/cadence), p2 pad seat, yard art (cast/swarf/drip), partner read (glint/relief/flair/jab/wobble/ropes-phase), the opening movie (gates/story-order/curtain-hash/skip/grace + #2897 flash/hold/straggler pins and settle/flash/box/jitter/stride pixel legs), weight-true knockback (ladder/mass/depth/outward/wood/bounds/shove/hash), #2889 tells (chevron geometry/reach/shimmer, strut drift curve, KO squash gate/ease, relief clock + 2P-tag ink, phone-mix source-law, + browser legs for every tell), winnable, browser legs
npm run ddragoncheck -- --mutant     # depth/charge/blade-blind, barrel-ghost, rescue-blind, ally-blind, seat-blind, guardian-deaf, grip-permanent, cadence-mirror, seat-swap, same-phase, street-on, shimmer, chain-frozen, glint-deaf, flair-dead, movie-frozen, skip-deaf, crime-unnamed, curtain-stuck, straggle-gone, knock-flat, bounds-off, glint-flat, strut-frozen, squash-missing, tag-deaf, mix-clash must go RED (named)
CONTRACT_ONLY=double-dragon npm run contractcheck   # window.__game contract leg
```

Roster notes: joined BOTH lists at once — `scripts/lib/contractGames.mjs`
(and its PATTERNS) and the `nightlybot.mjs` soak roster (#1525 law, the lesson
of nightly 44762398189).

## Honest gaps (the whole commission shipped; what's still short)

- **DISCLAIMER** — the arcade had no CPU partner to imitate: Jimmy's
  personality is designed, not restored (#2851: the guardian law, the
  release law, a 13-beat technician's cadence over #2833's manners, #2857's
  read: glint, relief, flair). Seat-specific throws remain open craft.
- **CLOSED by #2857** — the partner-personality read: the guardian sprint
  shows its coming (seat-tinted glint trail), grip breaks flash and pay a
  relief pose, the blue jab has its own bite and a wider wobble, and every
  own-hand KO gets its 20-tick strut — all juice, all hash-pure, with the
  ropes-phase guardian proven end-to-end on real keystrokes.
- **CLOSED by #2860** — two humans at one keyboard: P2 now also takes a
  friend's own controller — a second gamepad or a linked phone (A jump · B
  kick · square/triangle/LB punch), any input seats them drop-in. Two pairs
  of hands, zero shared keys. (The pure keyboard seat remains WASD+F/G/V.)
- **CLOSED by #2877** — the yard now breathes: pools ride the swaying lamps,
  every grounded shadow leans anti-phase with its lamp (#2825's deferred art
  pass), the concrete carries seeded swarf by the seeps, and one drum leaks
  on a 72-tick beat.
- **CLOSED by #2882** — the board pays flurries now: consecutive takes
  multiply the payout ×2/×3/×4, capped at ×4, and a hit or a ~3 s lapse cools
  the chain back to ×1 (see the chain law above).
- **CLOSED by #2891** — the arcade's opening: the kidnapping of Marian now
  plays between "press any key" and wave 1 — scripted cast, the lift, two KOs
  of the dragons' own, MARIAN TAKEN!, any-key skip, and a curtain law that
  leaves the run bit-identical to a no-movie start (hash-pinned, 17 pins +
  4 mutants + 8 browser legs).
- **CLOSED by #2897** — the opening movie's phone pass: the caption rides a
  white flash and a back-row hold, the street empties with a straggler, the
  KO sprawl mirrors its extents for real (the face===-1 fragment fix) and
  settles in 8 ticks, HELP! gets its outline + jitter, and Marian's panicked
  stride gets an airborne frame with streaming hair.
- **CLOSED by #2935** — knockback is weight-true now: every landed blow imparts
  velocity by its own weight and the man's mass (jab rocks ~5px, a kick drives
  ~7, the flying knee ~9; Abobo takes a third of the shove), knockdowns skid
  short and sharp on asphalt friction, dying men travel, the struggle shoves
  the grabber off the seat — and the screen keeps its wall (see the weight
  ladder below).
- **CLOSED by #2889** — the guardian-read QA round: the rescue glint is a
  chevron trail that survives dock zoom, the freed blue seat's relief blinks
  his own HUD tag, the KO strut takes its step back, knockdowns land with an
  easing squash beat, and the jab's phone-mix clash with the pickup chime is
  gone (triangle timbre, F#4 kept). A physical-device fresh-ears listen
  remains open craft — the fix is measured, not heard.
- Goons carry knives (S3) but not the whip or stick-and-steel rotations of
  the later arcade waves; the thrown knife is the goon's only cast (and the
  original's goons never threw whip or barrel either).
- The duel's re-arm is a cooldown, not a walk-to-the-body pickup like the
  arcade's knife retrieval.
