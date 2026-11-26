# DEFENDER — engine notes

Williams arcade, 1981. Side-scrolling wrap-around planet shooter: you fly the
Jupiter fighter above a wireframe landscape, landers dive to abduct the five
humans standing on the surface, and you shoot them down, catch the falling
humans and haul them back to the ground. A human is gone for the rest of the
game once it hits the surface. #1473 seedpin batch 17 restored the dead
terminal (the Feb port could not score, lose a life or die) and put every die
on one seeded stream.

## What's faithful
- **Wrap-around planet** (4000 px world, camera and objects cross the seam).
- **Top radar scanner**: whole-planet dots — white ship, grey landers, red
  mutants, yellow humans — plus the camera window (split when it crosses the seam).
- **Abduction chain** (the signature): a lander dives to a human, hauls it up;
  shot mid-haul the human falls — catch it (+250) and deliver it to the
  surface (+500). A lander that reaches the ground **empty mutates into a
  mutant (1500)** and chases you; a lander that lands holding a human kills it.
- **Arcade score table**: lander 150, mutant 1500, catch 250, delivery 500,
  wave clear 1000, extra ship every 10,000. 3 lives, ~0.5 s death freeze (the
  cabinet holds the wreck on screen) + ~1 s dark + ~2 s blinking respawn grace.
  The grace expires ON THE CLOCK (#3445 — it used to freeze after the dark, so
  the pilot was immortal from its first crash on); then you are mortal again and
  the third wreck ends the run.
  Wave clear resurfaces the wave (8 landers at wave 1, +1 per wave cap 12).
  Friendly fire is real — your own shots kill humans, like the original.
- **Feel (#1531)**: thrust hums while accelerating, diving landers flash a
  flickering tractor beam at their target with a low telegraph pulse, wave
  fanfares ramp pitch per wave, lander/mutant sprites pulse, humans shuffle on
  a 2-frame walk, radar dots flicker on the scanner.
- **Presentation (#1907)**: kills read by COLOR — landers pop green, mutants
  burst red, the wreck burns orange, a lost human sparks gold, and the
  lander→mutant turn flashes a green ring (a rand-free burst, so the seedpin
  stream never shifts by a single draw). The rescue chain is staged end to
  end: the tractor stays lit through the haul, a pod released from a dead
  hauler tumbles under a flapping chute, the player carries on a visible
  harness with kicking legs, and catches/deliveries pop `+250` / `+500
  RESCUED` where they happen (naming b19's patrol behaviour). Wave clear gets
  a shock ring + `WAVE CLEARED` banner with a `GET READY` countdown tell; the
  radar player dot blinks big when the camera window crosses the seam; thrust
  layers a rising harmonic so speed is audible; and when the patrol holds fire
  to spare a human, a yellow bracket off the nose says WHY.
- **Wave clock (#3453)**: the per-wave pressure timer — 60 s counted on the
  WAVE row; at zero it blinks red/yellow and the LANDERS go urgent
  (URGENT_LANDER_SPEED = 1.5×: steeper dives, faster hauls) until the wave
  turns over. A two-voice rising klaxon announces it; the death freeze pauses
  the clock, and the whole mechanic is rand-free, so the seed stream cannot
  shift.
- **Look** (docs/ART.md, RETRO): black starfield with twinkle, white mountain
  wireframe, grey lander shells with tractor bar, red diamond mutants, small
  yellow humanoids, thrust flame, red/yellow score sheet under the radar.
- **Smart bomb (#3443 — Jon's #2016 answer A, "port it. Smart bomb on the
  B/secondAction button, 3 per wave")**: B (Shift / pad **BOMB**) vaporizes
  every hostile inside the 1000 px screen window — wrap-aware, centered on the
  fighter, a quarter of the planet like the cabinet's view. Kills pay the
  normal table, a bombed hauler drops its human *falling* (catchable), and the
  blast never touches the pilot or a foot soldier. Stock 3, refilled on every
  wave beat (icons under the radar, left of the spare-ships row); edge-
  triggered (held ≠ stream), wasted presses suppressed while dead, and the
  whole press path is rand-FREE — the seed stream cannot shift, `watchRoute`
  never presses, so the WITNESS replay is byte-identical with the bomb aboard.
  White screen-wash + subsonic boom.
- Attract mode flies the route on its own (chase + shoot) and is invulnerable;
  any key or tap starts (b16 pattern).

## Seed pinning (#1473)
`src/games/Defender/sim.js` is the whole simulation, pure and deterministic:
terrain, human placement, wave field, abduction/mutation jitter and explosion
particles all come from one `seedRng(seed)` (mulberry32). Human starts honor
`seedFromQuery()`; the feedback report carries `{tick,score,done,seed,lives,wave}`
and the QA drive contract is `exposeGame` id `defender`
(reset/tick/state/canvas). `snapshot`/`restore` omitted — the rand closure is
not JSON-serializable (#391).

## Verify
```
npm run defendercheck            # Node: determinism, score law, rescue chain, deaths, terminal,
                               #   §grace (#3445: the grace burns to zero on the clock alone, a
                               #   second crash lands nudged-free, ArrowDown reaches GAME OVER,
                               #   attract invulnerability pinned BY COPY)
                               #   + WITNESS: survival CLAIMED — 20/20 on both 20-seed sets,
                               #     banks/waves/rescues re-pinned, haul guns + speeder +
                               #     close-out + momentum laws each tested directly, and the
                               #     copy claim pinned to the witness (#3456 stage 3) —
                               #     plus the s4 column-dash and full-box brace band (#3456 s4)
npm run defendercheck -- --mutant   # pre-port + stage-2/3/4 bugs re-planted; every mutant must go red
npm run defenderplay               # Chrome, REAL keys: Shift spends one bomb, pixels flash
                               #     white, held ≠ stream, the WATCH seat never bombs, and
                               #     the crash law pinned both sides (#3445 grace freeze)
npm run watchcheck -- --only defender  # seat pilot: one-tap ▶ WATCH, Y seat/takeover,
                               #   blips, idle-hands proof (browser, needs dev server)
npm run feedbackcheck          # floor law now 55 report+pin titles
npm run attractcheck           # attract layout rules
npm run lint:defender
npm run dev -- --port "$DEV_PORT" --strictPort   # your lane's port; /retrogames/defender
```

## WATCH (#1637 batch 18; defends the humans since batch 19)

Y seats `watchRoute` from `sim.js` — the SAME patrol the attract demo flies
and `defendercheck`'s WITNESS audits on 20 seeds (no forked brain; the old
local attractInput is deleted). The patrol ranks the planet's jobs: a lander
HAULING a human outranks everything (shoot it and the human drops recoverable),
a diving lander is next, then nearest threats; a falling human is flown into
(+250) and carried down the elevator to the surface (+500); the guns hold
when a walking human stands in the laser line closer than the target. The
patrol still climbs clear of the terrain and stays out of the dark. Any
driving key or a tap hands the wheel back (shared blips). Since #3445 the seat
is **mortal**, and since #3456 the planet is honest too (hunt mutants actually
move and the landerless wave runs its speeders — see Honest gaps). **The claim
is re-earned: the patrol survives 20/20 on both audit sets** (witness +
untuned holdout) at the 150 s horizon, banks min 26,900 + 15,550, clears
waves on every seed and hauls 52 + 47 deliveries — all still mortal (84 honest
lives spent across 40 runs, worst seed bleeds 6; WITNESS pins the claim to
the witness so copy and measurement cannot drift apart).

## Honest gaps

- **#3497 (2026-11-26) — the mid-horizon ridge + the L/R interlock.** The
  stage-4 autopsy's surviving terrain column closed: every remaining terrain
  death pressed `up` at the killing tick while a ridge **mid-horizon** gained
  faster than the climb — invisible to the canyon rule, which reads the
  horizon's END. The fix runs the race instead of a height threshold (the
  rejected max-rise shape): project this hull BRAKING AND CLIMBING and break
  the line only when even that best line grinds the wireframe inside the
  horizon. Survivors of that fix then died a new shape — the autopsy read
  `left+right` together: braced, the dash cap demanded the opposite key from
  the facing press, thrust cancelled to ~0 and the package parked in the ±16
  kill box. The interlock: **inside hop distance (huntD < 80) the cap yields
  to the facing press** — the dash into the laser line is the weapon. Honest
  measure: SURVIVED 20/20 + 20/20, diedHauling 2 + 4, terrain deaths
  **1 + 3** (autopsy baseline 6 + 3), lives spent 37 + 47 with the storm
  fleet live. The surviving terrain deaths (three holdout seeds: low cruise
  into fast risers at vx ≈ 3, braking horizon too short to see the spike)
  stay honestly open — widening the projection re-buys the brace-timing loss
  v1 of the interlock measured (minScore 35,850→20,200).
- **#3456 stage 4 (2026-11-26) — the overhead pocket.** This stage read the
  killing ticks themselves (`npm run watchmeasure -- --autopsy` dumps position,
  velocity, killer approach and the route's own presses at every death). The
  remaining package deaths all sat in the same geometric hole: a diver ON the
  column (|bx| < 18, |by| 11–15, kvy ±2…3) — the horizontal laser cannot
  answer a hunter directly above or below, and the vertical race was lost
  before it started (climb is 0.5/tick, a speeder dives at 3). Two fixes:
  the brace hop band reaches **17**, covering the whole ±16 kill box (the old
  ±14 band watched deaths at by 15), and a **column-dash** — an overhead
  closer gets the column broken at full cruise (trackers cap at 2.4) with
  height held, the elevator resuming once the lane clears. Honest measure:
  SURVIVED 20/20 + 20/20, lives spent 22 + 24 → **21 + 15**, diedHauling
  3 + 7 → **1 + 3**, enemy deaths 12 + 17 → 11 + 11, banks min
  43,500 + 35,850, worst seed 3 + 3 (still mortal). Two candidates were
  measured and REJECTED: hopping away-from-hunter unconditionally (holdout
  deliveries fell to 34, under the 35 floor) and judging the canyon by the
  horizon's high point instead of its end (lives 36 → 48). The surviving
  terrain deaths press `up` into ridges that rise faster than 0.5/tick at
  dash speed — the mid-horizon turn wants a smarter rule than a blunt
  height test (closed by #3497 above, still honest about its column).
- **#3456 stage 3 (2026-11-26) — the patrol earns its survival back.** Two
  fidelity facts drove the stage. **(1) The arcade fighter never mutes its guns
  while carrying** — the port's haul block returned before the gun rule, so the
  package was silent *and* braked (±1.2 px/tick against a mutant's 2.4 cap);
  diedHauling 12 + 11 was the predictable result. Guns are now live during the
  elevator (same flat-line law, same walking-human veto), with a turn-and-brace
  on any hostile entering the package's airspace. **(2) The 1981 endgame:**
  when the wave's last lander dies, the surviving mutants speed up —
  `SPEEDER_SPEED` 3.0 with hotter drive, a rand-free transition edge, a
  hot-orange sprite/radar tell and a rising alarm; the route answers with the
  last-hunter close-out (face the lone survivor when it is already level and
  at clean range) instead of trailing it past the horizon. The stage's real
  find was the **momentum law**: every autopsy death was velocity committed by
  *earlier* ticks that a contact-distance reaction cannot null — the crossfire
  band, the haul brace and the vertical aim now read the hull's PROJECTED
  position, and the aim refuses to climb or dive into a contact column.
  Honest measure: SURVIVED 20/20 + 20/20, diedHauling 4 + 6, waves 20/20 +
  20/20, catches 62 + 49, deliveries 57 + 43, banks min 18,900 + 12,800,
  lives spent 20 + 19. The survival copy claim is back — pinned to the
  witness in `defendercheck`, and the `worstSeedHits >= 3` law keeps frozen
  grace (#3445's shape) impossible under it. Superseded by stage 4 above.
- **Stage 2 (same arc, #3456) — the planet woke up.** Hunt-state mutants never
  integrated position (statues) — fixed; watchRoute gained the terrain seat,
  canyon turn, pulsed descents, valley-site veto, hover-kill, fresh-facing gate
  and the hauler-outranks-the-duel law. Honest measure then: survived 19 + 16,
  banks 9,650 + 5,950. Superseded by stage 3 above.
- **CLOSED by #3443** — the smart bomb is in (Jon's #2016 answer A, "port it.
  Smart bomb on the B/secondAction button, 3 per wave"): B vaporizes every
  hostile inside the wrap-aware 1000 px screen window at table value, haulers
  drop their human falling (catchable), the blast spares pilot and humans,
  stock refills to 3 on the wave beat; edge-triggered and rand-free — the bomb
  draws nothing from the seed stream (its own re-measure was byte-identical,
  honest *then*: the grace freeze was still live; #3445's honest burn moved the
  floors — see the gap above). The mock option is retired. **The Meteor Storm
  is IN (#3453):** every fifth wave is the bonus wave — twelve rocks in a
  fixed westbound column at 8 px/tick, 250 each, and all twelve inside 5 s
  pays the cabinet's 5,000 ALL CLEAR. Contact kills (the wrap law reads it),
  laser and smart bomb vaporize at table value, no landers share a storm, and
  rocks that cross the planet unseen burn up so every storm ends; the deal is
  rand-free, so the seed stream cannot shift. **Still out: hyperspace** — B is
  the bomb and the pad has no third action; that ergonomics call is Jon's.
- The hauled human is lost at the top — and that IS the arcade law (#3453,
  re-verified): the lander carries its catch to the top "at which point they
  turn into fast-moving mutants"; mutants are the captured humans turned
  hostile. An earlier note here wrongly claimed the cabinet re-descends with
  its catch — no top turn exists. The port now mutates the top-reached hauler
  on the spot (the pre-fix shell survived as a wandering lander); the save
  window is the ascent — shoot the hauler, catch the falling human (+250).
- The wrap seam is not a dead zone: lasers, friendly fire, catch, ship contact,
  the lander's descent and the bomb blast are all wrapDelta-aware — pinned in
  defendercheck's wrap-seam section (#3453).
- Terrain collision is ship-only; landers clip the mountains visually by design
  (they hover above the ground line).
- Two-player mode not ported (original: alternating turns).
