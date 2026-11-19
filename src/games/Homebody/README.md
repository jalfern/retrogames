# HOMEBODY — an original people sim (in the spirit of The Sims, PC 2000)

Own IP, names and art — no EA/Maxis assets or trademarks. Two residents, five
needs, one suburban lot, one clock. Tap to command; lifetime wish = win.

## Files
- `sim.js` — the whole game as pure rules (browser-free): map, needs decay per
  sim-hour, BFS point-and-command, interactions, work/pay/career, buy mode with
  `keepsOpen` connectivity guard, the visitor, thoughts, faint/lose, win at
  `WIN_CONTENT`, `stateHash`, `autoStep` (attract autopilot = harness bot).
- `art.js` — everything drawn: baked ground/wallpaper/plank textures, per-piece
  furniture sprites, people with walk cycles and a spinning mood kite, night
  tint + lit windows, needs panel with icon bars, catalog cards, thought bubbles.
- `index.jsx` — the shell: fixed-timestep loop, attract demo, pause, pointer +
  keyboard + stick routes into the same sim commands, audio on every event.

## Time model
1 sim hour = 5 real seconds (`HOUR_SEC`). Day 06:00–22:00 drains needs at full
rate; night (22:00–06:00) halves decay and sleep in the bed recovers energy and
freezes the rest. Workdays run the clock ×8 while a rostered resident is out
(Otto odd days, Mira even), pay at 17:00, career rank every two workdays.
The player's speed dial (#2227) multiplies the whole world above this model —
see §Speed dial.

## Rules worth knowing
- Physical needs (hunger, energy, bladder) left red for `COLLAPSE_AT` sim-seconds
  collapse into a faint; both residents down at once = lose. Sad/bored is not
  fatal — the original doesn't kill you for it either.
- Every solid placement runs `keepsOpen`: gate, residents and every piece's use
  spots must stay reachable from the front door, or the placement is refused.
  (This guard earned its scar: a 2-tile bed once sealed a 2-row bedroom and the
  whole sim starved in an unreachable house.)
- Spare Room (#1806, deepened by #2689): card 14 / `R` in buy mode, §300,
  two per lot. The lot overlay `s.wings` (with `s.ext` as its count — the
  number #1806 shipped) replaces lawn with rooms the tick the hammer falls:
  east-wing instances `eastWing(r0)` (3×4 planks, brick walls, a punched
  doorway, two east windows) and the Garden Room `GARDEN` (2×4 planks on the
  back lawn, door through the house's south wall at (8,2)). #2689's anchor
  law: an east site is legal exactly when its door cell (r0+2,11) meets a
  house-floor cell west of it (`links`) — rows 0,1,2,4,5; a pointed cursor
  (col ≥ 11) slides the anchor to its row (illegal rows snap to the nearest
  legal), an unpointed kit keeps the classic row 2 (muscle memory, marquee
  and the autopilot's `place(s, 0, 0)` all stay byte-identical — the bot
  never buys kit two, so no-tap autoplay hashes unchanged). Ground is asked
  through `groundOf(s, r, c)` everywhere the sim walks or guards, so
  `keepsOpen`, BFS, the attract bot and manual movement all treat every wing
  as built; each room's own door-side cell may never be blocked once it
  holds furniture; every hammer passes `keepsWing` — the new walls flood test
  first (kerb gate, residents, solid-piece targets must stay reachable). The
  wings ride `stateHash`: `ext` plus a loop mixing which rooms stand and where
  (`id`/anchor row), twin seeds stay one world.
- Move-in (#1814, riding both wings since #2689): buying a kit arms
  `s.roomReact = 2`; the moment each resident is otherwise idle they path once
  through the doorway to a glance cell in the newest wing (preferred cells are
  the geometry's own `react`, any free room cell as fallback — #2689 moved them
  from the old `ROOM_REACT` constant onto each wing). Arrival pays a thought
  line, +0.15 fun, a `room-see` event and a banner — once per resident per
  hammer; a player interrupting the walk re-offers it later. Each wing's
  windows (from the wing geometry — one source for the bake and the glow)
  light warm after dusk like the house's own. The attract bot buys the kit
  second so the demo sells the reflow (kit two was the player's until #2721 gave
  it a purse — the round money buys it, so the bot buys it too; see §Kit-two
  economy window).
- Bonds (#1817): `s.rel = { house, fern }` climb while people actually talk —
  Fern-chat +0.07/s while a resident chats beside her, household co-presence
  +0.05/s while both residents are unengaged within 2 tiles of each other.
  Levels ACQUAINTED / FRIENDLY / FRIENDS / FAMILY at 12 / 30 / 60: every
  level-up fires one thought-log line, +2 contentment and a `rel-up` event.
  Fern's level widens the topic pool (4→9 lines), extends her hang
  (+6 s/level) and pulls her next visit earlier (−1 h/level, floor 8);
  house ≥ FRIENDS turns payday into a shared toast (+1 once/day). Both meters
  fade every sim-hour (−0.4 house, −0.7 fern — absence from Fern stings
  faster) and ride `stateHash`. The needs panel gained a BONDS row: heart =
  the two residents, leaf = Fern, four pips each, gold pulse at FAMILY.
  Fade is −0.02/−0.035 per hour, not −0.4/−0.7: at this clock an hour is
  5 real seconds, and a fade above ~0.08/s would outrun chat growth outright
  — the ladder would exist on paper and die on the phone (caught by the
  drive pass, not the node gates).
- Spats & Make-ups (#2070): the bond can fall now. Two idle residents within
  reach (≤2 tiles) both running needs-avg under 0.4 (`moodOf` 0 — the same
  band the mood kite shows) **spat**: house −8 (crossing an edge down fires
  `rel-down` and the panel pip visibly drops), −0.12 social each, a grudge
  sets, `spats++`, at most once per 40 s window. While the grudge holds the
  pair is in **cold war** — proximity builds nothing, only absence cools.
  The one thaw: the same reach with both tempers up (needs-avg over 0.7)
  **makes up** — +6 house, +1 content, grudge cleared, once per spat. No rng
  in the triggers, so every seed stays deterministic; `spats`/`grudge` ride
  `stateHash`. Tells: the panel heart runs ash-dark while the grudge lasts,
  a spat lands with banner + sour buzzer + red sparks + a screen jolt, the
  thaw answers with a warm major chord. Honesty (#237): The Sims *orders*
  insults and compliments; spats here are a law of neglected living, not a
  button — romance landed (#2131) and so did third-party relationships
  (#2588, §Neighbours who meet); the pair's own quarrel shipped in #2604 (§Neighbours SPAT),
  and a long chat now walks the lot on a fixed circuit in #2611 (§Neighbours stroll).
- Spat polish (#2076): the quarrel now stages itself ON the lot. `s.spatFx`
  (2.4 s, real clock, view-only) arms at the crack: both residents get a
  storm puff with a gold bolt over the head, knifed brows and a shaking
  away-lean; while the grudge holds after the puff fades, the pair stands a
  sullen away-lean with averted eyes (computed from the partner's side in the
  shell — the sim rules are untouched). The make-up pays heart particles
  (the BONDS glyph, pink in-palette) over the pair instead of the generic
  panel sparkle. And the hourly neglect fade now rides `relSub` — a bond
  sinking below an edge from ABSENCE demotes through the same `rel-down`
  event a spat uses: one tell per crossing, silent mid-level, quiet at the
  zero floor. The attract marquee teaches the law: red needs flare tempers,
  a spat cracks BONDS, filling both side by side thaws.
- Cold-war chatter (#2135): the silence between crack and thaw now speaks. While
  a grudge holds and the pair stands in reach, a sour line lands every
  `GRUDGE_COOL_CD` (14 s; the first `GRUDGE_FIRST_CD` 8 s after the crack, never
  on top of the spat line) — `grudge-cool` event + log line + a fading bubble.
  Spoken lines now appear ON the lot: every coo, insult, spat, make-up, cool beat
  and neighbour chat pushes/uses an event with the pair midpoint and renders as a
  `drawSay` bubble (cream plate, tail, real-clock fade). Fern's chat crossing
  finally crosses — the threshold read `0.06 · dt` (the social rate, a typo) and
  could never fire against a fixed `dt`; Ivy's honest check was the model. And the
  word is legible before it lands: a pulsing gold ring under whoever `courtTarget`
  will address, painted only when the command is ready (cooldown closed, buy mode
  closed) — with the marquee teaching `C coos, X cuts`. Target *choice* is the
  #2235 law below; the nearest/partner-first `courtTarget` law is the fallback.
- Contentment: +1/+2 per satisfied need (2 = everyone healthy), +1 chat, +3
  payday, +1 per happy ambience hour. 80 grants the wish.
- Autonomy (needs self-service, clocking in) runs only in `demo` mode — attract
  and the harness. A player who does nothing watches, and then buries.

- Feel (#1823): walkers pay a `step` event per footfall (~18 px) carrying the
  ground underfoot (`groundOf`), so planks creak, gravel crackles and lawn
  muffles; every refused `place` emits `refuse` at the offending cell and the
  shell flashes it red. View-only — the sim rules under placement are untouched.

- Second neighbour (#2143): Ivy — the market gardener — rides her own clock
  (`s.ivy/ivyAfter/ivyGap`, window 12:00–19:00, arrival hour clamped ≤18 so a
  late schedule can never strand her). She enters at the gate toward the kitchen
  and chats on Fern's reach ring; `rel.ivy` grows 0.055/s (slower than Fern, on
  purpose) and fades 0.03/sim-hour through `relSub` — demotions ride the same
  `rel-down` event. Her ladder beats: linger `40+rng·40+8·lv` (+8 s/level,
  harder than Fern's +6) and return −1 h/level (floor 12). FRIENDS+ she arrives
  with a market basket: household hunger +0.18, +1 content; FAMILY adds
  honey-money §15 and a second point; the basket is state (`gift`) and rides
  `stateHash` with `rel.ivy` and her presence. Court addresses her (coo pays
  COO_BOND, insult cuts INSULT_DROP with no household grudge); autonomy routes
  the lonely resident to the NEAREST visitor (chat goals carry `v`); the sofa
  bonus counts any company; `roomClear` refuses the wing on top of her. Look:
  plum dress `#a3579b`, plum-dark hair, a woven basket that swings on the walk,
  `flower IVY` BONDS row with the FAMILY gold-pulse, gift arpeggio + toast,
  marquee beat, `RING IVY` debug hook.
- Visitor choreography (#2154): when both neighbours share the lot, chat is
  arbitrated once per tick (`arbitrateVisitors`, before `updateVisitor`/
  `updateIvy`) and BOTH chat blocks just read `v.claim`. Law: a visitor chats
  with the NEAREST eligible resident (Manhattan ≤2, not fainting, not working
  — the old loop let the LAST resident in array order win); a resident pays
  only ONE visitor per tick; a resident contested by both pays the CLOSER
  visitor, the loser falling back to its own next-nearest. A tie gives Fern,
  the first neighbour, the ear (#2143's order). When arbitration actually
  splits a pair, a three-way `think` line sells the neighbourhood as one
  scene, alternating `TRI_LINES` wording on a `TRI_TELL_CD` (7 s) world-clock
  throttle — `s.triTell`/`s.triHits` freeze with the sim and ride `stateHash`.
  Court targeting (`courtTarget`) is the player's side of the line and is
  untouched by the choreography.
- Neighbours who meet (#2588): the web, not the spoke — Fern and Ivy form
  their OWN bond (`rel.neigh`) while they share the lot, the third-party
  tail #2070 left open. `updateNeighbours` runs at the end of the visitor
  chain (claims already settled by `arbitrateVisitors`, after `updateHouseBond`
  so the documented five-deep pin stays whole). Law: both hang, BOTH unclaimed,
  Manhattan ≤ 2 (`NEIGH_REACH`, the household co-presence ring mirrored) →
  `rel.neigh +0.05/s`; exactly one claimed and ≤ 4 (`NEIGH_GLANCE_REACH` —
  gossip carries further than walk-talk) → `+0.02/s`; both hosts have an ear,
  or the pair is silent by reach → nothing. Idle and apart → the MEET-UP:
  etiquette honours #2154's tie law (the first neighbour stays home), so Ivy
  paths to a free cell beside Fern (`NEIGH_MEET_CD` retries) and, while the
  pair are free, NEITHER visitor auto-re-homes to sofa/stove — company beats
  the furniture. The ladder is the shared one (12/30/60, rel-up/rel-down ride
  the existing plumbing, crossings pay +2 content like every rung, a rotation
  of `NEIGH_LINES` exchanges bubbles on an 11 s throttle). Cross-warmth —
  friend of my friend: at rung 1+ each neighbour chats **25% deeper** with the
  household (Fern 0.07→0.0875·dt, Ivy IVY_CHAT×1.25, additive relAdds so the
  base lines stay byte-identical below the rung). Absence cools it softest of
  all: −0.02/sim-hour via `relSub`. The BONDS panel gained a `twin`-leaf
  NEIGH row (teal #3aa08a — distinct from Fern-green and Ivy-plum at phone
  scale; bondRows is the one source, `bondsPix` reads it). No rng anywhere —
  rotation and proximity only, every seed replays exact.
- Neighbour view pass (#2599): the pair's identity, painted. All view-only —
  sim.js economy untouched (pin-proved: it never hears of these tells).
  (1) **Pair bubbles wear the pair** — a line spoken *between* the guests
  (`neigh` events, and pair spat/makeup lines) renders as a split-rim bubble:
  Fern-green left half, Ivy-plum right (#4fae5f/#a3579b, `PAIR_HUES` — the
  same hues the rows and dresses paint), and two tinted tails instead of one:
  two voices, one plate. Resident chatter keeps the cream/brown idiom.
  (2) **Pair reunions sparkle teal** — a `makeup` with `who:'neigh'` lifts
  twin-leaf particles (the NEIGH glyph in flight, #3aa08a/#7fd0c0) where the
  household's thaw pays hearts; banner and chord shared. (3) **The guests
  sulk too** — while `neiGrudge` holds, Fern and Ivy borrow the #2076 idiom:
  a storm puff for 2.4 real s after the crack, then a sullen away-lean
  (computed from the partner's side, paint-only — the meet-up law stays
  frozen by law, the pathing honesty of #2604 untouched).
  (4) **Cross-warmth is visible** — `bondRows` marks the FERN and IVY rows
  `warm` when `rel.neigh ≥ NEIGH_WARM_AT`, and the panel breathes a teal
  diamond beside them — the 25% law taught from the panel. (5) **The meet-up
  speaks** (#2635) — Ivy's arrival across the pair ring puts a pumping
  raised-arm wave on Fern, one soft 784 Hz note and three teal glints; cold
  branches outrank it, it decays on the real clock. (6) **The cold war murmurs**
  — while `neiGrudge` holds, the pair trades one sour line every
  `NEIGH_MURMUR_CD` (24 s, first after `GRUDGE_FIRST_CD`), a `grudge-cool`
  tagged `who:'neigh'` — the view's existing pair-hue bubble + low tones render
  it; lines rotate on a counter (no rng), the clocks ride no hash, and the
  murmur builds/pays nothing (peoplecheck proves the 60 s cold bond delta is
  zero). (7) **The attract sells the pair on its own beat** — while the NEIGH
  marquee line is the copy on screen and Fern hangs at an empty gate, the demo
  rings Ivy in (`ivyAfter` pulled to now, the #2143 clock law on demoG), once
  per demo run; `AttractMessage` gained the optional `onIndex` beat tap other
  titles never see. Gates: peoplecheck §NEIGH VIEW (28) + the live
  `homebodydrive` pair-plate leg (murmur bubble pixels, `pairCold` rig hook).
- Court pick (#2235): when the reach ring is CONTESTED, the player chooses the
  ear. `courtReach(s)` lists everyone the word can find (partner pushed first,
  fainting and leaving excluded — the old candidate law); when two or more share
  the ring, a tap on one of them (`courtPickSet(s, k)`, wired in `pointerPx`
  BEFORE the switch/walk idioms, 18 px like the resident switch) makes that
  person the preferred addressee — `courtTarget` returns them over the nearer
  auto-pick, so coo/affection/insult all pay the chosen bond, and the #2135
  gold ring moves to prove it. The pick lives until that person leaves the ring:
  `courtTick` (every live step) expires it, and a stale pick falls through to
  the nearest law the same instant — a return does not resurrect it. An
  uncontested ring picks nobody (solo taps keep switch/walk untouched — the
  doctrine of no second pad holds: the existing tap IS the second verb).
  `s.courtPick` rides `stateHash`. Marquee line + registry controls teach it.
- Thumb court (#2171): the pad has no third button (AGENTS.md), so the second
  court order rides press-DURATION on the first. An A/Space press that lands on
  a person with no object near calls `courtHoldArm(s)` (arms `s.holdT = 0`,
  view tells a `#e23b2e` heat arc over the addressed head, closing over the
  window); the frame loop feeds `courtTick(s, SIM_MS)` every live step, and
  reaching `HOLD_INSULT_MS` (600) hurls the insult MID-hold on the exact
  `court(s,'insult')` path; releasing first calls `courtTap(s)` and lands the
  coo on the `court(s,'coo')` path. The word — fired or refused — spends the
  hold, so one press pays exactly once; a keyup on the attract/pause/death
  screens is silent. The clock is WORLD ms like `cmdCd` (freezes with the sim,
  rides `stateHash`), and the shared `CMD_CD` economy, the grudge law and the
  #2070 human exit are untouched. Keyboard keeps its dedicated C/X; the pad
  contract (`VirtualControls` A=Space + one ⚒) is unchanged. Attract line +
  registry controls teach the hold.
- First-time player pass (#2253): a cold player lost both residents on day 1
  in ~2 minutes with nothing on screen saying what to do. Three laws answer it.
  (1) The morning grace — while `s.day === 1 && s.hour < 12` every hourly decay
  runs at `DAY1_GRACE` (0.5); at noon the normal law takes over, because a
  whole-day halving re-phases the seeded autopilot's evening and stranded seed
  20261023's wish (the WINNABLE gate caught it).
  (2) The amber prompt — a need crossing `AMBER_AT` (0.45, above RED_AT) pushes
  a one-shot `amber` event naming the fix (`NEED_HINT`: hunger→FRIDGE, energy→
  BED, fun→TV, social→PHONE, bladder→TOILET); the stamp `p.wasAmber[n]` re-arms
  only past 0.5, so it teaches once per slide, never spams.
  (3) The order ping — every successful `cmdUse` arms `s.orderPing` (target-cell
  centre + label + 1.6 real seconds) and the shell names the tap in a toast
  (`✓ FRIDGE`), so a registered order is visible the instant it lands. The
  event banner also moved off the house centre (`H/2-90`) to the front lawn
  (y=348) — it used to paint over the residents at exactly the wrong moment —
  and the pad's A button finally says ✓ (`aLabel` in the registry; it had been
  falling back to FIRE). Residents still collapse when ignored — the grace
  teaches, it never plays for you. `s.noWander` is a test-only hold that pins
  the seeded 0.6%/s idle stroll for the stillness gate.
- Ivy polish pass part 2 (#2240): four small laws that make the second
  neighbour feel real. (1) The set-down — a basket Ivy carries in (gift at
  lv ≥ 2; the honey jar only at FAMILY lv ≥ 3, decided AT THE DOOR because
  rel drifts below the edge mid-walk) gets physically set down when she
  reaches her kitchen spot — fridge → stove → front step → her cell — for a
  low triangle-pair thunk (150/95 Hz) + filtered noise, distinct from the
  gate bell. Staging `giftFx`/`giftAt`/`giftHoney` is view-only like spatFx
  (off stateHash): the basket paints on the people's depth line and fades on
  GIFT_LAND_T (5 real seconds, hop + squash up front). No hunger re-pay —
  the visit's gift economics still pay at the door.
  (2) Timbres — VISIT_TIMBRE (sim.js, pure data, gateable in Node): Fern
  keeps the historic 660→880 two-bell + light steps; Ivy rings a three-note
  lilt that lands DOWN (587→988→740) with lower, slower basket-steps
  (208@460 / 165@585). The shell plays the tables verbatim.
  (3) The stranded rescue — scheduleIvy can roll ivyAfter=19 at ivy lv 0,
  and the arrival test `hour ≥ ivyAfter+gap && hour < 19` then never passes
  again while nothing re-rolls until a visit ends: those seeds never show
  Ivy for the whole run (seed 5). The attract bot rings her exactly once,
  and ONLY when her own schedule can no longer land (pulled to now, gap 0).
  Seeds whose Ivy already comes keep their untouched clock — an unconditional
  pull, and a forced “stroll to Ivy's chat ring”, were both built and CUT:
  each tipped WINNABLE seed 7 (it wins main by exactly §10) out of the win.
  Autonomy's lonely-resident nearest-visitor law (#2143) is the honest walk.
  (4) The per-guest hello — chatT belonged to the resident and Fern always
  spent the 2.4 s crossing first, so Ivy's ring never got a bubble however
  long they hung. arbitrateVisitors re-arms chatT when the claim switches
  (`p.chatWith`), and the honest dt crossing (#2135) survives — the meters
  never relied on the bubble. The BONDS panel now paints via bondRows(s)
  (art.js) so the painter and the phone-scale probe cannot drift apart.

## Rooms with purpose (#2695) — a room earns its keep

The lot already lets you raise two rooms (#2689) and dress them (#2272); the
rooms themselves were still scenery with a door. Purpose closes that clause
the way the original teaches it — The Sims (Maxis PC 2000) never paid you
for floor area, it paid you through what rooms let people *do*: sleep well,
eat well. Homebody pays through the room, its own two laws:

- **The garden ripens in the sun.** While a Garden Room stands and it is not
  night, its `tend` accrues sim-hours; at `TEND_HOURS` 2 the bed is ripe:
  `herbs++`, `tend` resets, the **hungriest** resident eats what was picked
  (`hunger +HARVEST_FOOD`, `fun +HARVEST_FUN`; ties settle by roster order —
  fixed, pure, no rng), and the house takes one contentment (the meal-table
  pattern, #2244). Night silences the garden; a ripening bed waits for
  morning. The payoff rides the garden's own wing record, so a lot without a
  garden gains zero new mixes — the #2689 empty-loop hash hygiene.
- **The Spare Room lodges.** A bed standing *inside* the east wing's floor
  that carries a resident through the night (the existing sleep law's
  `p.use.night`) pays at waking: `fun +LODGE_FUN`, and the room keeps its
  tally — `lodgeDay` stamps the night, so each night is one lodging whoever
  wakes in it, while every waker still feels the morning. Deliberately not
  the canopy's law: #2272 owns the energy curve of deep sleep; this owns the
  room. The question asked is the GEOMETRY (`wingSets(wingGeom(w)).floor`),
  never an item id — canopy, plain bed, whichever stands in the room.
- **Names & view:** each room's ledger (`herbs` / `sleptWell`) rides the
  contract `view.purpose` and the DEV probe; the shell voices a ripening
  ("THE GARDEN RIPENS — HERBS n") with green glints at the south door and a
  quiet two-note sunrise for a good night (`lodged` event). #2713 tail 4:
  the tallies also READ on the pause sheet — `pauseLedger` (art.js, pure)
  derives `{title, rows: [{text, n, color}]}` from the wing records, the
  shell snaps it at the '?' toggle (a paused world ticks nothing, so the
  snap is the live truth), and PauseOverlay draws it through a generic
  per-game `ledger` slot — pip rows capped at eight; the overlay knows no
  room names, and a bare lot answers null so every other help screen is
  byte-for-byte unchanged. Tail 6 (#2705: an attract ripening beat) is
  deliberately NOT built: the demo's honest economy wins before the second
  §300 exists — the kit-two economy window is #2714's own question, and no
  bot change may launder it with attract-only money. (#2721 answered that
  question from the economy side, not the bot side — see §Kit-two economy
  window; the ripening beat rides the attract for free now.)
- **Determinism:** no purpose law draws rng; harvest timing is pure clock.
  Purpose fields join `stateHash` INSIDE the existing `s.wings` loop, so a
  no-wings lot hashes byte-identical (queuecheck's seed-exact pin
  3836882361 re-passed untouched). Attract runs were re-measured with the
  law in — the bot may lodge in its canopy on later nights, but no hash pin
  lives on a winged lot, and wins, drive legs and every seed-exact pin held
  (927 + 99 + 117 green before shipping).
Gates: `peoplecheck` §PURPOSE (21: exact ripeness with the dh re-derived per
tick, night silence, hungriest-eats + roster tie, pride content, lodging joy
+ once-per-night stamp, house-bed refusal, geometry-not-item, twin purpose
determinism, empty-lot hygiene, six source pins). Mutants proven: neuter the
night clause (`if (false && isNight(st))`) — exactly the night-silence gate +
its pin go red; restore.

## Rooms with a personality (#2736) — a room reads its own furniture

The purpose tail's next floor after #2695. A standing wing now reads what is
placed ON ITS OWN FLOORBOARDS and becomes the kind of room it is furnished as
(The Sims, PC 2000, graded rec rooms and libraries by contents and use):

- **The study reads.** A Bookshelf on a wing's floor makes that room a study.
  Every read that ENDS there turns a page (`w.pages++`); at `PAGES_INSIGHT` 3
  the room pays an insight: reader `fun +READ_INSIGHT_FUN` (0.15), house
  contentment +1, `studied` event (thoughtful two-note pluck, lamp-amber
  burst at the book). The question is the shelf's standing cell
  (`onWingFloor` — geometry, like the lodging law), never the item alone: a
  living-room shelf turns no pages.
- **The playroom plays.** A TV or radio on the wing floor makes it a
  playroom, and the child gravitates: `funTarget` scores a 1000-point pull on
  in-room toys, so Pip crosses the lot for the room's TV while a nearer
  house radio waits (the cone-before-toys doctrine #2503 at room scale; toy
  ids only — a far book in a study never lures the child). Every fun session
  finishing at the in-room toy pays a play (`w.plays++`); at `PLAYS_DELIGHT`
  3 the room cashes a delight: Pip `fun +KID_ROOM_FUN` (0.2), `rel.kid
  +KID_ROOM_BOND` (0.5), house +1, `kid-laugh` (giggle arpeggio, star gold).
  A toy sold mid-walk pays the kid but never the room — honest walk cost
  (`s.items.includes(toy)` guard; the errand keeps the shipped fun pay).
- **Names & view:** `archetypeOf(s, w)` (pure, sim.js) names a room from its
  contents — bedroom > study > playroom (the bed law already owns the
  sleeping room; priority is view-only, every ledger runs independently).
  The pause sheet (#2713) grows `STUDY — insights n` / `PLAYROOM — giggles
  n` rows ONLY once paid — an unearned room keeps the shipped row shape;
  `roomBadges`/`drawRoomBadges` (art.js) set an open book / giggle star at
  the room's own door cell while it is named (over the furniture, since a
  placed TV sits on the planks too). The bedroom earns no badge — the
  lodged pane burns amber for it already (#2705).
- **Determinism & hygiene:** no new line draws rng for its timing; the four
  tallies join `stateHash` INSIDE the existing `s.wings` loop — a lot with
  no rooms gains no new mixes, and the no-tap seed-exact pin 3998885235
  re-passed untouched (that frozen run buys nothing — no wings stand). The
  attract bot furnishes wings ONLY through #2752's surplus clause below; its
  generic placement scan still meets house floor before wing planks, so every
  other demo buy behaves byte-unchanged and the five WINNABLE seeds win as
  shipped. Named rooms are the player's move, and the demo now shows one
  honestly — paid by the fund, not by the till.

- **The naming beat (#2743).** `place` asks the wing who it was before the
  piece lands and who it is after (`archetypeOf` twice, no rng); a wing that
  newly reads study/playroom pushes `room-named` at its own doorstep. The
  shell answers with a bright discovery pair (523→784 sine) and a `THIS ROOM
  IS A STUDY/PLAYROOM` callout in the badge's colour. The bedroom stays mute
  (the lodged pane speaks for it) and a rename into bedroom (bed over a study)
  is silent too — the beat only sounds when a badge goes ON.
- **The payoff banners name their room (#2743).** `studied` and `kid-laugh`
  carry `room: archetypeOf(s, w) || kind`, and the banners read `THE STUDY
  PAYS — INSIGHTS n` / `THE BEDROOM GIGGLES — DELIGHTS n` when a bed shares
  the lot with the law's toy — which room paid is no longer invisible.
- **The badge shows the pay coming (#2743).** `roomBadges` rides `p` (the
  room's pages/plays over its own target) and `n` (banked insights/delights);
  `drawRoomBadges` paints a dark ramp track under the glyph, filled in lamp
  amber / star gold per finished page or play — the ripeness-ramp pattern
  (#2705) at the door. Pure view: asking the badge writes no tally.
- **Phone-scale probe (#2743).** `bondsPix` now returns `badges` — the door
  glyph, ramp track and ramp-fill pixel counts, aimed at `roomBadges(gs)` so
  the probe can't chase a stale seat (the #2729 jar-row method).

- **THE JAR'S SURPLUS CLAUSE (#2752).** Once both kits stand, Pip's round
  keeps pouring into a jar that has no kit left to fund — dead surplus, since
  `JAR_CAP` is exactly one cottage. That surplus now buys the wing ONE radio:
  `buyWingToy(s)` (sim.js) fires from the attract bot, high in the order
  because no walk rides it — the busy-resident guard would miss the window
  (measured: the morning commute eats it on 2 of the 3 surplus seeds). It
  lands on the floorboards of the first standing wing that has earned no name
  yet, so `place`'s #2743 beat sounds at the doorstep, the playroom badge
  hangs there through the win, and the funnel-fun law starts earning plays.
  Economy law: the pay comes from the JAR (`jar -= 90`), never the till — the
  till's measured peak after kit two is §10 on every WINNABLE seed, so a toy
  was never the till's to buy, and byte-still till money keeps every stored
  tour economy alive (#2721's invariant). Once-per-run derives from what
  STANDS (`wingToyOn` scans wing floors for radio/tv/book) — no new state,
  no new hash mixes; a lot that never completes two kits never hears of the
  clause, and seed 42's d2h19.8 win outruns the dawn refill, so that demo
  stays honest-empty (#2240's quiet-night pattern). The clause skips wings
  that already have a name (a canopy bedroom sells itself).
  Drive hook `wingToy` rigs the phone-scale proof: stand east on a bare lot,
  then lay a Bookshelf on the first unnamed wing's floorboards through the
  real `place` law (the issue's own suggestion) — the clause's surplus path
  is peoplecheck-proven in node; the drive's 390-px badges leg needs a named
  wing, whatever money named it.

Gates: `peoplecheck` §PERSONALITY (36: naming by contents incl. priority,
both kits, bare-floor and no-wing nulls; three-read pay with exact fun
(+0.4/+0.4/+0.55) and content (+2/+2/+3) deltas and once-only `studied`;
house-shelf silence with landing control; pull beats a nearer house toy
(distance stated), bare-lot nearest-law unchanged, books don't pull; delight
pays once per third play with bond ≥ 0.5 and pride, seed-exact twins;
sold-mid-walk unpaid; unearned sheet keeps shape, paid rows amber/gold,
badge law on all four cases; hash-loop/source pins). §#2752 (5: surplus seeds
7/1234/20261023 fire once before the win with doorstep beat + badge + still-win;
seeds 42/99 silent by economy; till never moves on a buy tick; once derives
from the standing radio; no-kit-two refusal keeps the jar's money). Mutants proven:
`onWingFloor` in the study law → `s.wings[0]` — exactly the house-shelf gate
goes red (1077/1); pull forced to 0 — the gravitate gate + the delight
trio (5) go red; drop the jar deduction in `buyWingToy` — exactly the
till/jar-invariant gate (#2752) goes red (1100/1); restore all.

## Verify
```bash
npm run peoplecheck          # 1101 gates: jar surplus clause — fires once-before-win on seeds 7/1234/20261023, silent on 42/99, till byte-still, once-from-what-stands, no-kit-two refusal (#2752), personality — rooms named by contents, study insights + playroom pull/delight, badges & ledger rows (#2736), settle beat — arrival face-and-breath cadence, errand names itself, shut-way line (#2697), feel pass — promise ring tightens + marching trail + ear hue-wink + grey death ring + garden night lamp (#2688), boot, rules, spare-room wing (#1806) + deeper multi-room — anchor law derived from MAP, garden room after any anchor, keepsWing refusals, two-per-lot, canopy fits both rooms, hash carries which-where, links in source (#2689), bonds ladder (#1817), move-in reactions + night glow (#1814), walk-surface footfalls + refusal flash (#1823), spats/cold-war/make-up (#2070), sprite tell + loud fade (#2076), court commands — coo/affection/insult + cooldown economy (#2131), second neighbour Ivy — schedule/gift/ladder/court/hash (#2143), visitor choreography — nearest ring, contested pays closer, three-way tell (#2154), neighbours who meet — third-party rel.neigh: chat/glance/meet/cross-warmth/ladder/hash (#2588), neighbours SPAT — one-ear souring timer, cold-war silence, absence-thaw, reunion pay, CD mirror, hash, seed-exact quarrel (#2604), mediators — reach-both ring, soft pay, mending lane, once-per-spat ledger, cat-before-kid, hash, seed-exact mediation (#2672), neighbours stroll — mobile-chat bank, fixed 3-spot circuit with lead/trail, walk-freeze, claim-carry, spat/absence zeroing, cold-war refusal, hash, seed-exact lap (#2611), stroll view pass — pair stride bob + facing turn, arrival settle, route trail, attract lap beat, panel walk pips (#2618), neighbour view pass — pair-hue bubbles, teal leaf reunion, guest sulks, warmth sparkle, meet-up wave beat, cold-war murmur, attract pair-ring hook (#2599), thumb court — tap coos, held A insults (#2171), cat — counter law, cat day, coos, hash (#2197), pet polish — mood law, visible kibble, greeting law (#2200), kids — counter law, kid day, tumbles/cries, court, hash (#2203), catalog shelves — partition/flip/memory/digits/hash (#2222), speed dial (#2227), court polish — spoken chat crossing, cooling beats, ring tell (#2135), court pick — crowded ring tap chooses the ear, expiry, hash (#2235), paper route — hourly news, day stamp, rot (#2238), meal bells — three bells, one helping each, cold window, shared table, die-under-the-walk refusal (#2244), meal polish — three timbres, rotating chords, night steam, eater-cluster hearts, cold tell (#2264), first pass — morning grace, amber prompts, order ping, ✓ on glass (#2253), attract family tour — the demo sells Pip, cat then child (#2209), Ivy polish II — gift set-down, visit timbres, stranded rescue, per-guest hello, BONDS rows data (#2240), garbage day — roster, eve set-out, dawn collection, honest skip, hash (#2303), ice-cream truck — arithmetic stop, paid buy, broke refusals, one serving, kid chase, rot, hash (#2503), truck arrival + drive-off view — rolls in 2 s, out 4 s, draw-only, truckView (#2508), cone in hand — the eat beat, world-clock hold, two arithmetic drips, view-only, hash-still, drive-verified (#2508 item 3), go-say — far tap walks over, arrival coo once, pick promotion, cooldown wait, leaving/asleep folds, bounded chase, queue re-issue, speaks-as-itself, hash, seed-exact, attract invariant (#2683), rooms with purpose — exact ripeness arithmetic, night silence, hungriest-eats with roster ties, lodging joy with the one-night stamp, geometry-not-item, empty-lot hash hygiene (#2695), polish pass — walking chip glyph+timbre, worked-garden bake, kit hover-preview, geometry byte-untouched (#2704), purpose view pass — ripeness ramp on the bed, harvest hamper, lodged panes, moonlit wait, hash byte-identical (#2705), ledger sheet — pause pips read both room tallies, bare-lot null keeps every other help sheet byte-identical, overlay game-blind, pip cap, purity pin (#2713 tail 4), winnable seeds, determinism
# mutation proof: comment out the `s.content += n` line in sim.js finishUse —
# the WINNABLE section goes red; restore. Or strip `relAdd(s, 'fern', ...)` in
# the visitor chat block — exactly the BONDS leaf-meter gates go red; restore.
# Or zero `s.roomReact = s.people.length` in buildRoom — exactly the MOVE-IN
# gates go red; restore. Or comment the two `footstep(...)` calls — exactly the
# FEEL walking gates go red; restore. Or neuter the spat trigger in
# updateHouseBond (`if (false)`) — exactly the SPATS gates go red (14); restore.
# Or revert applyHourAt's fade to direct decrements — the two absence-crossing
# gates + the relSub pin go red; restore. Or zero the `s.spatFx = 2.4` arm —
# the sprite-tell arm gate + its pin go red (and the live drive loses the
# storm puff); restore. Or zero COURT_REACH — exactly the 13 COURT gates go red
# (172/13) and nothing else; restore. Or comment the `relAdd(s, 'ivy', ...)`
# feed in Ivy's chat block — exactly the two chat-law gates (grow + crossing) go
# red; restore. (All proven on this branch: 157/5 → 162/0, 185 → 211 with the
# SECOND VISITOR section, and the COURT section's reach mutant 172/13 → 185/0;
# the ivy-chat mutant 211 → 209/2 → 211; and the #2171 thumb-court mutant —
# delete the `s.holdT = -1` disarm in courtTick — exactly the two double-spend
# THUMB COURT gates go red, 228 → 226/2; restore. Or zero `KID_CRY_STING` —
# exactly the wail-sting gate goes red, 283 → 282/1; restore. Or make setSel
# stop following the shelf (`if (false && t !== undefined)`) — exactly the four
# shelf-follow gates go red, 308 → 304/4; restore.) Mutant #2135: reinstate the
# fern `0.06·dt` threshold — exactly the two fern gates + the crossings pin go
# red (346 → 343/3); restore. Or drop the `grudge-cool` event push — the
# two-beat gate and its pin go red (346 → 344/2); restore. Mutant #2200: put
# `if (true) return` atop `meetCat` — exactly the two greeting gates go red
# (402 → 400/2); restore. Or zero the `p.feedT = PET_FEED_T` arm — the bowl-arm
# gate and its sim pin go red; restore. Mutant #2244: raise
# the shared-table trigger to `mealEaten.length >= 99` — exactly the two SHARED
# gates + the shared-law pin go red (434 → 431/3); restore. Or drop the
# `p.mealTaken === s.mealSerial` refusal in finishUse — exactly the second-line
# gate + the stamp pin go red (434 → 432/2); restore. Mutant #2235: neuter the
# pick priority in courtTarget (`if (false && p)`) — exactly the seven COURT PICK
# behavioural gates go red (480 → 473/7; the stale-fallthrough and expiry gates
# correctly stay green — they assert the old law); restore. Mutant #2240: zero
# the `s.giftFx = GIFT_LAND_T` arm — exactly the two set-down staging gates go
# red (497 → 495/2); restore. Or swap Ivy's call motif onto Fern's two-bell in
# VISIT_TIMBRE — exactly the lilt gate goes red (497 → 496/1); restore. Mutant
# #2588: comment out the Fern cross-warmth relAdd — exactly the Fern warmth gate
# and the both-blocks pin go red (712 → 710/2; Ivy's warmth rides its own line);
# restore. Or zero NEIGH_CHAT — the glance (windowed), meet and first-rung
# crossing gates go red (712 → 709/3); restore.
npm run dev   # another terminal
npm run contractcheck        # includes homebody (CONTRACT_ONLY=homebody for just this)
DEV_PORT=5174 npm run homebodydrive   # real Chrome: start, order, build, die, restart + live storm-puff/heart pixels + real C/X court keys with pink affection pixels and the far-apart Space doctrine + #2222 shelf flips on real [ ] keys, a tapped tab and gold-painted open-tab pixels + #2244 bells live: ring, steaming-plate pixels, parallel tap-orders, shared-table hearts + #2240 live: FAMILY basket lands with weave/greens/tomato/honey pixels on the depth line and a 5 s stage, BONDS reads at 390-px phone scale (ink, four rows since #2588, FAMILY gold — sampled across the pulse's phases), and the attract run shows Ivy on the lot and rings her once + #2689 live: kit two ghosts the garden (green door-tick pixel over the back lawn), garden planks and east glass appear where lawn was, a third kit refuses with the purse untouched, pointing high moves the whole ghost and the hammer lands the wing at the top row (east@0, windows where lawn was), and the garden still fits after the chosen row + #2752 live: the wingToy rig lays a Bookshelf on the standing wing (the room names itself study at the doorstep), and the phone-scale loop keeps the #2743 badges probe — the book glyph and the dark ramp-track ink both survive the 390-px blur (27px + 8px at k≈0.6; the 55%/2px track this shipped with read 0 and that's why the art is 72%/3px now)
```
Drive it: tap objects to order the active resident; G switches residents; B
opens buy mode (time stops); `[` `]` flip the catalog shelves and 1-9 pick a
card on the open shelf (every card reachable); stick/arrows walk, A uses.

## WATCH seat (#1637 batch 17)

Y / ▶ WATCH seats the attract autopilot: while watching, `autoStep(gs, dt)`
replaces `drivePad`+`advance` in the play tick — the same call the attract demo
runs and peoplecheck's WINNABLE section grants the lifetime wish with. The bot
re-decides from LIVE state every tick: buys, clocks in, walks, eats, chats.
It never touches the player pad, and releasing hands the pad back untouched.

Autonomy honesty: `autonomous()` gates work and self-care on `s.demo`; the seat
raises that flag each tick and every release path (Y, driving key, canvas tap,
pause-resume edge, end of run) clears it, so autonomy is the seat's, never the
house's. Prover-only here is NARROWER than it looks — Fern's chat, co-presence
bonds and ambience hours all bank social/content for an idle street — so the
watchcheck homebody pilot proves advance only with demo-gated commands (a buy,
a clock-in, the payday after work) and asserts the idle street buys nothing and
works nowhere. Y seats with the shared blips (KeyY is free — no vi-keys in this
game); any driving key or a tap on the lot hands back; the seat releases
silently when the street ends (racer rule). Attract carries the shared hint and
the one-tap ▶ WATCH (start AND seat).

Verify: `DEV_PORT=5173 node scripts/watchcheck.mjs --only=homebody` — pilot,
source pins, and the witness pin (peoplecheck still grants the wish driving the
SAME autoStep). Mutant: swap `autoStep(gs, SIM_MS / 1000)` for `advance(gs,
SIM_MS / 1000)` in the play tick — the demo, wake, resume gates and the seat's
source pin go red (~7); restore.

## Cat (#2197) — Miso, the adoptable pet
The open kids/pets tail of the bond line, pet half first. Catalog card 15 /
`KeyP`, §150, one cat per lot — like the room kit it is consumed at the
counter, never placed. `adoptPet` refuses honestly (no money, already home,
or the gate can't reach the house) and a refusal speaks at the gate cell.
`updatePet` lives by the lot's laws: every wander pick asks `walkable()` AND
pathfinds before committing; hunger under 0.3 walks her to the fridge's use
spots for kibble (+0.55, `pet-eat`); night finds the nearest free floor tile
and pours her into a loaf (energy back at night pace), dawn unspools her. The
bond law reaches pet scale — a resident standing within arm's reach (Manhattan
≤1, not fainted, not working) coos: cat fun +0.25, resident social +0.08,
house bond +0.5, content +1, one per `PET_COOS` (6 s) — love, on a cooldown.
The cat can never faint and never blocks anyone (non-solid; `keepsOpen`
ignores her). State: `s.pet` (needs/position/asleep/cd) rides `stateHash`;
no rng outside the shared `s.rng` stream, seeds stay exact. Sprite: tabby with
tail-sway walk, sleep Zzz, pink purr sparks (`drawPet`); sounds: twin-chirp
adoption, purr-chime coo, kibble crunches. The attract bot adopts right after
the room kit so the demo sells her. Open tail unchanged: kids; the panel pet
row landed in #2200 (see Pet polish). Gates: `peoplecheck` section 8 (27 pins).

## Kids (#2203) — Pip, the adoptable child
The open tail of the bond line, closed. Catalog card 16 / `KeyK`, §150, one
child per lot — consumed at the counter like the cat card; a refusal speaks at
the gate. `adoptKid` also refuses when the gate can't path into the house.
`updateKid` lives by the lot's laws: every wander pick asks `walkable()` AND
pathfinds; hunger under 0.3 walks Pip to the fridge (or stove) for a snack
(+0.5, `kid-eat`); fun under 0.3 sends her to the nearest FUN item the living
room offers — radio, TV, toys, whatever carries `need:'fun'` (+0.45,
`kid-play`); night finds a free floor tile and folds her small (energy back at
night pace, Zzz), dawn stretches her awake. Two laws make the child change the
household, not just decorate it: the **tumble law** — an idle resident within
arm's reach (≤1, not fainted, not working) drops into play on a `KID_PLAY`
(6 s) cooldown: kid fun +0.3, resident social +0.12, `rel.kid` +0.5, content
+1 (`kid-tumble`); and the **cry law** — a child with fun at or below
`RED_AT` wails every `KID_CRY_CD` (4 s), and the wail costs every resident
within 3 tiles 0.10 social (`kid-cry`). Neglect is loud; a lapful of play
silences it. A child never faints and never blocks (non-solid; `keepsOpen`
ignores her). The court reaches children: coo pays COO_BOND + 0.15 fun, an
insult cuts INSULT_DROP + 0.2 fun and makes no household grudge (Ivy's rule).
`rel.kid` fades 0.015/sim-hour through `relSub` and rides `stateHash` with the
whole `s.kid` record; seeds stay exact. Look & sound: small scamper with a
daypack, giggle stars, tear drops, wail sweeps (`drawKid`); bright triad at
move-in, giggle arpeggio at tumbles, music-box twinkle at play, apple crunch,
banner lines. The BONDS panel rows a gold star PIP under the hearts and leaves.
The attract bot buys the kid card inside the §300 wall right after the cat; the
win economy is unchanged with a child on the lot (peoplecheck: the wish still
lands). Two autonomy fixes the cry law forced: urgency order serves the lowest
need that HAS a target (a lonely resident still eats), and a demo resident on
an idle chat walk abandons the chat when a physical need hits red. Honest gap
CLOSED by #2209: the attract bot now tours the till cat → child → roof, so the
demo shows Pip moving in inside the first demo minute on every WINNABLE seed
(the old order let roomkit eat the daybreak register and the §300 wall starved
kidkit out of 9/9 runs). Gates: `peoplecheck` section 9 (31 pins) + the tour
pins in WINNABLE.

## Pet polish (#2200) — the cat is seen and greeted
- **MISO joins the BONDS panel.** Her row is a MOOD, not a ladder —
  `petMood(s)` averages hunger/fun/energy (pure in sim.js, 0..1), the paw
  glyph rows `round(mood·4)` pips, and the row red-blinks at `RED_AT` like
  the need bars. The row never rides `stateHash` — it's a read of needs that
  already ride it.
- **Kibble paints.** The `pet-eat` moment arms `pet.feedT = 2.2` (world
  seconds, view-only like `purrT`): a shallow bowl at the eat spot with three
  crumbs that get eaten down as the seconds run; the shell adds a tan crumb
  burst on the crunches.
- **The greeting law.** A hanging visitor within `CAT_MEET_DIST` (2) of Miso
  greets her ONCE per visit: `cat-meet` event, `CAT_MEET_BOND` (+0.5) on
  that neighbour's ladder, a thought line that warms with the level (small
  talk → slow blink → ankle-weave). Fern and Ivy share the law; the flag
  rides the visit record, so every new visit re-arms. No rng — seeds stay
  exact. Still open from #2200: cat commands (order play via a pet-tier toy),
  richer cat sprite states (stretch/sit/window-sill), kibble at a placed bowl.

## Catalog shelves (#2222) — the buy catalog sorts into stores

The original people-sim never showed a flat wall of goods: buy mode is a
catalog with category tabs — flip a shelf, see few big cards. The 16-card
strip was 35px wide per card; shelves made each card ~82px and made every
card reachable by digit.

- **Law (pure in sim.js):** `CAT_TABS` = HOME (bed, fridge, stove, toilet,
  shower, phone) / FUN (tv, radio, book, sofa) / DECOR (plant, rug, lamp) /
  SPECIAL (Spare Room, cat, child); their union covers `CATALOG` exactly, no
  duplicates — STORES pins it, so adding a card without a shelf goes red.
  `setSel(s, i)` follows the shelf and remembers per shelf (`s.tabSel`);
  `flipTab(s, ±1)` cycles and lands on that shelf's remembered card;
  `digitCard(s, n)` picks within the open shelf. `s.tab` rides `stateHash`
  (`tabSel` is memory-only — flipping round-trips to the same hash).
- **Shell:** `[` `]` queue a flip onto the same one-driver loop as every other
  key (drivePad), digits are shelf-local, and the counter keys R/P/K ride
  `setSel` so the SPECIAL shelf follows them. Pointer: `tabHit` (a 13px row
  above the cards) selects a tab; `catalogHit(px, py, s)` now resolves within
  the open shelf. The attract autopilot's counter purchases also go through
  `setSel` — the demo never desyncs shelf from selection.
- **Look:** tab row across the tray, open tab gold (#ffd24a) with gold label;
  cards keep the panel-blue + gold-selection law and gain per-shelf digit
  badges 1-9 on every card (the old strip only badge-digits 1-9, leaving
  cards 10-16 keyboard-orphaned — #2209's card-16 concern, closed).
- **Gotcha learned:** the pointer handler mutates `gs` synchronously, so a
  probe can read the new tab a loop-frame before the canvas paints it —
  `homebodydrive` polls logic but must settle ~150 ms before pixel asserts.

## Speed dial (#2227) — the clock is yours

The original's UI bar carried pause / normal / fast / fastest. Homebody ran at
one speed; now the dial turns. `SPEED_MULT = [0, 1, 2, 4]` gears live in
sim.js (`setSpeed` clamps + reports change, `cycleSpeed` wraps, `attractSpeed`
is the marquee's teaching law); `s.speed` rides `stateHash`, so a replay pins
the speed timeline; `newRun` moves in at NORMAL and a new street resets it.

- **One driver, one dt:** the fixed timestep never changes — the shell's loop
  buys `SPEED_MULT[s.speed]` world steps per frame tick. Decay, schedules,
  visits, cries and purrs all ride plain `advance`, so gear changes need no
  per-law cooperation. Gear 0 buys nothing: the world stands still.
- **Keys:** digits `1`-`4` set the gears **outside buy mode**; inside buy
  they keep the #2222 card law (the dial is tap-only there). `,` / `.` walk
  the dial down/up in every mode, wrapping PAUSED↔FASTEST. The dial consumptions
  sit ABOVE the step multiplier in the loop — put them below and pause would
  eat the very keys meant to release it.
- **Phone:** the panel paints a four-pip dial above the wish meter
  (`DIAL` geometry shared by draw + `speedHit`; the chosen pip is gold, the
  pause pip pulses while the world stands still). VirtualControls is untouched
  — the pips are the pad route, the #2222 tab-row law again.
- **The paused tell (#2209):** the pip alone hid "why is nobody moving?" — gear
  || now veils the lot and breathes a `||` ghost over the scene (hidden behind
  the counter, where time stands still by #1806 law anyway). It rides
  `performance.now`, not `g.sec`: the world clock it announces is frozen, and
  the frozen clock also stills the pip's own pulse in play — the ghost is the
  one paused indicator that provably keeps breathing.
- **Court law:** the thumb-court release (`onUp`) answers only while the gear
  is running — a paused world takes no orders. The card/act queues still fill
  while paused and land the moment the world walks (driven and pinned).
- **Attract teaches it:** the demo hurries the 08:00–10:00 chores stretch and
  eases back (the panel pip rides along); no cue tone there — attract runs
  before the audio unlock. The marquee got a line ("THE CLOCK IS YOURS…").
- **Known interaction:** buy mode keeps its own time-out (#1806: `advance`
  stands still behind the counter — the original's build/buy pause). The dial
  still turns there; state survives the visit and the clock resumes on exit.
- **Harness note:** the contract `tick()` deliberately ignores the dial — a
  harness tick is one world step whatever the gear, so harness budgets stay
  world-seconds. The dial belongs to the rAF loop and the player.

## Paper route (#2238) — the lot keeps hours

The original's neighbourhood is a clock: mornings bring the paper without
anyone ordering it. That clause ("day/night is cosmetic + decay only") gets
its first true citizen here.

- **One owner-free object.** `PAPER` joins `DEF` but never `CATALOG` — nobody
  buys the news. Because it carries `need:'fun'` and `solid:false`, every
  existing law takes it whole: `tryUse`/tap/Space-A target it like an
  appliance, BFS walks to it, `keepsOpen` ignores it, `finishUse` pays FUN
  (+0.24) and the quality-scaled contentment, and `sellAt` refuses it (the
  mailbox belongs to the lot, the news to the route).
- **Schedule law.** `schedulePaper` sets `paperAfter = 6.5 + rng·1.5` at
  move-in and every new day; `updatePaper` rides the same `advance` clock as
  visits and cries. **One paper a day — the day stamp is the law**: reading
  at 07:30 must not re-arm the route inside the window (a presence-only check
  did exactly that in the first smoke; `paperDay === day` is the gate).
- **Fresh news.** `newDay` clears yesterday's sheet before the new window —
  unread papers never stack. Furniture landing on the step tucks the sheet
  away (the `s.paper` ref must never dangle under a bookshelf).
- **Landing.** The step cell (10,5) — the gravel run the mail and the
  neighbours already walk — or its nearest free edge; if even that is blocked
  the delivery retries inside the window (until 10:00) rather than walling
  the law into a silent skip.
- **Attract teaches it:** the bot walks down and reads the paper the moment
  one lies on the step; the marquee got a line, and the arrival pays a
  newsprint flutter + `THE PAPER BOY SWEEPS PAST`.

## Meal bells (#2244) — the lot sits down to its hours

The original's day turns on meals (The Sims, PC 2000: breakfast, lunch,
supper). The day/night clause gets its second and third hour-scheduled
citizens after the paper route: three bells a day set a warm plate beside
the kitchen, with nobody home or not.

- **One owner-free object.** `MEAL` joins `DEF` but never `CATALOG` —
  nobody buys dinner. Because it carries `need:'hunger'` and `solid:false`,
  every existing law takes it whole: `tryUse`/tap/Space-A target it, BFS
  walks to it, `keepsOpen` ignores it, and `finishUse` pays HUNGER (+0.55)
  and the quality-scaled contentment. `sellAt` refuses it — the kitchen
  serves, nobody sells dinner.
- **Schedule law.** `scheduleMeals` seeds `mealAfter = [breakfast, lunch,
  supper]` inside windows 07:00–07:45 / 12:30–13:15 / 18:30–19:15 at
  move-in and every `newDay`; `updateMeals` rides the same `advance` clock
  as visits and the route. **One plate per bell** — the slot advances when
  the plate lands; a bell whose late bound passed is skipped honestly
  (never banked, never re-rung), and with no kitchen (stove or fridge) the
  whole day of bells skips the same way.
- **Warm window.** The plate waits `MEAL_WINDOW` (2.5 sim-hours); after
  that it goes cold (`meal-cold` event, sad low tone) and the counter
  clears. Midnight rots whatever remains — the news law, at the table.
- **One helping per bell.** `finishUse` stamps `mealTaken = mealSerial` —
  a resident who already ate the current plate gets nothing (the wasted
  walk is the cost; the stamp resets per plate, so a breakfast diner is
  welcome at lunch). A walk whose plate vanished (cold, shared, rotted,
  tucked under furniture) is refused the same way.
- **The shared-table law.** A plate belongs to the household, not one
  stomach: when EVERY resident has eaten the same plate they sat down
  together — social +0.15 all round, house bond +2 (`relAdd`), one
  contentment, hearts over the kitchen, `meal-shared` event. Once per
  plate (the eaten list is the law).
- **Hook hygiene (#2244 drive).** `ringMeal` retires whatever plate sits before
  forcing the next bell — two plates answering `cellItem` out of order starves
  every honest tap; `park`/`foul` re-arm `spats`/`spatCd` so a long drive's
  organic barbs upstream can't break the gates that assert their rigged spat is
  the run's first. The drive serves breakfast at hour ~7 for the same reason
  the sim needs the window generous: a commute on a hunger-mulled mood
  (moodMul slows the walk) outruns 2.5 hours of clock from across the lot.
- **Cooked beats snacking.** While a plate is warm, autonomy (attract/
  WATCH/harness) routes hungry residents (`hunger < 0.75`) to the table
  before the generic need scan — the demo and the bots visibly keep
  hours, and both neighbours of the household actually share the plate.
- **Landing.** Beside the stove, else the fridge, else the nearest free
  edge; every approach blocked retries inside the window rather than wall
  the law into a silent skip. Furniture landing on the plate tucks it.
- **Attract teaches it:** the marquee got a line, the arrival rings a
  brass bell + `BREAKFAST BELL — FOOD ON THE COUNTER`, and the F1 cheat
  `DROP MEAL` rings any bell on demand.

## Yarn ball (#2256) — the cat gets ordered play, and new states
- **Card 17, FUN shelf, §60.** `yarn` joins CATALOG as decor (`solid:false`)
  with a `catOnly: true` flag. Generic fun-seeking never parks on it:
  `tryUse` skips it unless the order stands, `needTarget` (autonomy) and
  `funTarget` (Pip's bored hunt) skip `catOnly` outright — Pip does not play
  with the cat's ball.
- **The order law.** Tap the ball (or pad-A beside it) while Miso is home,
  awake, day, and the `YARN_CD` (8 s world) cooldown has closed — the resident
  walks and dangles: cat fun +`YARN_CAT_FUN` (0.45), resident social +0.1,
  house bond +`YARN_BOND` (1), content +1, `pet-play` event, ball spin +
  cat bat staging (`playT`, view-only). Without a cat the order refuses AT the
  ball with a thought line; a cat asleep, night-bound, out of reach at the
  finish (Manhattan > `YARN_REACH` 3), or beaten to the cooldown slot by the
  other resident refuses honestly — the wasted walk is the cost.
- **The cat's own game.** A bored awake cat (fun < `PET_BORED` 0.3) hunts the
  nearest ball and bats it unasked: fun +`PET_SELF_FUN` (0.5), `pet-play`
  (`self:true`). The toy earns its §60 even from the player's pocket alone.
- **Sprite states owed and paid.** Dawn stretch (`stretchT`, forelegs down rump
  high), the sit (settled > 1.2 s without a path — chest tall, tail over toes),
  the bat pose mid-session (head low, forepaw swiping), plus the ball's own
  spin + gold twinkles on `playT`. All view-only timers — none rides
  `stateHash`; `yarnCd` and the cat's `play` flag do.
- Gates: `peoplecheck` section YARN BALL (24 pins: card/shelf, three honest
  refusals, the paid session, cooldown economy, the far-cat refusal, pad-A
  doctrine, self-play, Pip exclusion, sale, determinism, hash, wish-still-
  lands, source pins). Mutant: zero `s.yarnCd = YARN_CD` — exactly the two
  cooldown gates go red (521 → 519/2); restore.

## Canopy bed (#2272) — the wing gets a bedroom

The Spare Room finally sells furniture that reads bedroom. **Canopy Bed** is
catalog card 18 (`DEF.canopy`): `§260`, solid, and `wingOnly` — `canPlace`
accepts it only on `EXT_ROOM.floor` once `ext` stands, so before the hammer
it fits no cell and after it the house floor still refuses. It shares the
bed's sleep law via `def.sleep` (night rides to dawn, the sleeper ignores
need decay, `applyHourAt` pays `+0.13` energy per hour, Zzz and the slow
wake ring draw for every sleeper — the old `id === 'bed'` checks are gone),
and it is premium: `cozy 0.055` vs the bed's `0.03` per second, so a midday
nap tops the tank where a bed nap can't. The sprite is walnut posts, gold
finials, a wine canopy with a scalloped hem and a rose quilt. The shelf
chrome grew with it: card widths are `shelfCW(n)` per open shelf, so HOME
carries seven. The attract bot buys it behind `roomkit`. Gates: `npm run
peoplecheck` §CANOPY (fit law, economy incl. half-back sell, premium nap
arithmetic, night clause, hash, pins).

## Meal polish (#2264) — the bells get voices, the cold gets seen, hearts sit at the table

Four feel laws on the #2244 bells, no rule change:
- **Three timbres.** MEAL_TIMBRE (sim.js, pure data, #2240's VISIT_TIMBRE
  pattern): breakfast keeps the historic bright rising strike (1046→1318 —
  the shipped 07:00 dinger, pinned); lunch is a quick bright ascending
  triplet (880/1174/1568); dinner is an evening swell-and-fall — four notes,
  lowest start, longest toll. Distinct in note count, pitch set AND spacing,
  which the gates prove. The shared-table arpeggio rotates by plate too:
  SHARED_TABLE_CHORDS + `sharedChord(mealSerial % 3)` — repeat days ring
  three shapes, not one loop. The `meal-shared` event carries `serial` so the
  shell picks the chord verbatim.
- **Night-scaled steam.** The tint curve is hoisted to `nightLevel(hour)`
  (sim.js, pure; art.js `nightTint` paints from it — one source, no drift).
  The plate sprite takes the night level: steam dims and its rise slows
  (`k = 1 − night/0.42·0.72`), and a warm plate on a dark lot breathes a
  faint gold halo so supper at dusk still reads WARM.
- **Hearts at the table.** The shared-table burst anchors over the EATER
  CLUSTER — the mean of where the residents actually stood when the last fork
  landed — not a fixed kitchen point (the #2076 pair-tell doctrine: the law
  seen, not just felt). The gate rigs diners at the front step and asserts
  the event x/y is their midpoint, far from the step.
- **The cold tell.** A missed meal now leaves a grey puff + crumbs on the
  spot (storm-puff doctrine) instead of silently vanishing.
Gates: `peoplecheck` §MEAL POLISH (16 pins). Mutants proven: hardcode the
plate-cell anchor → the cluster gate goes red (552 → 551/1); constant
`sharedChord` → the rotation gate red; the shell pin refuses a lit lot that
passes night `0` to the sprite.

## Garbage day (#2303) — the truck keeps the street

The clause's third hour-scheduled citizen after the paper and the bells
(The Sims, PC 2000: collection day). **BIN** joins `DEF` but never `CATALOG`
(nobody buys a bin): `solid:false, binOnly:true, need:'fun', amt:0` — walkable
and tappable like the other owner-free pieces, generic self-service skips it
(the same `continue` lines that carry `catOnly`), the sale refuses, and
`finishUse` answers it with its own branch before the generic pay, so the
chore never feeds the win economy by accident.

- **The roster.** `collectionDay` starts at 3 and steps by `GARBAGE_EVERY` (3).
  The **eve** (`day + 1 === collectionDay`) opens at `SET_OUT_EARLY` 18:00 and
  shuts at `SET_OUT_LATE` 20:30: it announces once (`bin-eve` event, banner
  "GARBAGE TOMORROW — WHEEL OUT THE BIN") and fixes the dawn hour. The hour
  and the wording are arithmetic off `collectionDay`, **never `s.rng`** — an
  extra draw per cycle re-phases the seeded autopilot and tipped all three
  WINNABLE seeds; this is #2240's lesson paid for again in full.
- **The set-out.** Tap the bin inside the eve (pad-A doctrine: `tryUse` takes
  the order only while it stands, out-of-season taps answer in words) or let
  autonomy route it: a resident with every need ≥ the scan floor and **no
  neighbour on the lot** wheels it to the curb cell (12,5) after the need
  scan, replacing what an idle stroll would have spent. The bot never borrows
  for the chore — every placement that outranked the scan or the till broke
  seeds 7/1234/20261023 (built, tested, cut; the marquee and eve banner
  teach the player to order it instead). Arriving pays the wheeler
  `BIN_SET_SOCIAL`, stamps `binSetDay`, moves the item's cell (which rides
  `stateHash` through the items loop) and fires `bin-out` (thumps + gravel).
  A second order at the curb refuses honestly — the wasted walk is the cost.
- **The collection.** At dawn (`truckHour` 05:00–07:00) the truck passes: bin
  at the curb → `garbage-collected`, the bin rolls home, fun +`BIN_FUN` all
  round, house bond +`BIN_BOND`, one contentment — never more (the WINNABLE
  gates are the guard).
- **The skip.** Bin never made the curb → `garbage-skipped`: grey puff at the
  empty curb, a thought line naming the forgotten chore, and the lot waits a
  whole cycle — a missed day collects nothing late, the roster has moved on.
  `collections`/`skips` ride the hash, the view tells (which cell the bin
  stands on, which banner lands) derives from state the hash already covers.

Gates: `peoplecheck` §GARBAGE DAY (32 pins: lot-owned object, roster law, eve
announce-once, windowed order + honest refusals, the paid collection at dawn,
skip honesty and the un-flaggable truck, quiet-eve autonomy, hash carries for
position/roster/stamp/ledger, determinism, wish-still-lands, source pins).
Mutants proven: `s.binAuto = true → false` at the eve — exactly the seven
eve/collection/autonomy gates go red (585 → 578/7); `s.skips++ → s.skips = 0`
— exactly the two skip-honesty gates go red (585 → 583/2); restore both.
`watchcheck`'s idle-street proxy now ignores owner-free arrivals (post, plates,
the bin) — the law it owns is BUYING, and the paper/bells/bin eras made the
raw item count a stale proxy (the gate flaked red on main for exactly that).

## Ice cream truck (#2503) — the lot buys its afternoons

The clause's fourth hour-scheduled citizen after the paper, the bells and the
garbage truck (The Sims, PC 1990/2000: the ice-cream man rolls down the street
on warm afternoons and the young ones run out with money in hand). **CONE**
joins `DEF` but never `CATALOG` (nobody stocks a soft-serve stand):
`solid:false, truckOnly:true, need:'fun', amt:0` — walkable and tappable like
the other street pieces, generic self-service skips it (the same `continue`
lines that carry `catOnly`/`binOnly` — a paid treat is not a free need-stop),
the sale refuses, and `finishUse` answers it with its own branch before the
generic pay, so the luxury never feeds the win economy by accident.

- **Schedule law, arithmetic never rng** (#2303's lesson re-paid): the pass
  hour is `ICE_DUE[0] + day-hash % 2·h` — inside 14:00–16:00, landing by
  `due + ICE_WINDOW` (2 sim-hours — sized so the walk from the far rooms
  still lands inside it, the #2244 lesson). **One truck a day** — the day
  stamp is the gate; a window that ran out is gone honestly, never banked,
  and midnight rots whatever a rigged late stop left standing.
- **The buy.** While the truck idles, the cone stands at the curb cell
  (gate-side) and `coneOrderOk` stands: tap / pad-A issues the order, and
  the finish pays `CONE_PRICE` (§2) from the till, fun +`ICE_FUN`, treats
  ledger +1, and the cone leaves the street with the sale — **one serving
  per cone**, whoever reaches first eats it, the late hand is refused at the
  curb (the meal-serial doctrine at ice-cream scale). Broke refuses at the
  tap in words, and a till drained mid-walk refuses at the curb: the wasted
  steps are the cost. The money leaves the till, the fun lands, content pays
  nothing — the win economy is untouched (the bin doctrine, honest size).
- **Children first.** While a cone stands, the till can pay and joy has not
  overflowed (`fun < KID_ICE_FLOOR`), Pip routes to the curb BEFORE the toy
  box — the kid's own law in `updateKid`, the cook-beats-snacking precedent;
  the attract demo visibly chases the truck. Adult cones are ordered by hand
  (autonomy never spends the till — the bot-borrows-for-the-bin lesson kept).
- **The jingle.** Five rising music-box notes (`ICE_TIMBRE`, played verbatim
  by the shell — the VISIT/MEAL_TIMBRE pattern), pastel glints at the curb;
  a bought cone pops an octave higher for a child; the gone tail falls
  880→523 with a pastel puff where the cone stood (the cold-plate doctrine).
  The marquee teaches the whole law in one line; F1 `RING TRUCK` (and the
  `ringTruck` harness hook) calls the man on demand for scenario setup.
- **Determinism.** The clock's own paths draw no rng — landing, wording
  (`iceDay`/`iceSerial` arithmetic) and the child's refusal lines alike.
  `iceDay`/`iceSerial`/`treats` ride `stateHash`; the cone's cell rides the
  items loop; the WINNABLE seeds still win with the truck running.
- **The truck has wheels (#2508 item 1).** The jingle used to summon a glyph
  out of thin air; now a pastel soft-serve wagon (art.js `drawIceTruck` — mint
  body, striped awning, roof cone-sign, spinning spokes, parked engine-bob)
  ROLLS in along the street ~2 s, parks window-by-the-gate at the cone, and
  drives off east ~4 s when the stop is spent — sale, kid catch, window close,
  all three drive it off, and the paint tick polls cone presence so a restore
  or any missed event still ends in a drive-off, never a vanish. View-only:
  `sim.js` is untouched (pin-guarded), the truck is draw-only so it is
  non-solid by construction — nobody can be fenced in — and it paints after
  the people as the nearest thing to the camera. The slide reads live at
  `__homebodyTest.probe().truckView` (`{phase, x}`).
- **The cone is held, not deleted (#2508 item 3).** In the original the buyer
  strolls home licking the cone; ours used to erase the glyph at the tap. Both
  sales arm `coneHold = ICE_HOLD_T` (12 s) on the buyer — resident or kid —
  and the shell paints a pastel mini-cone in the hand (art.js
  `drawHeldCone`: waffle + scoop + cherry, wrist-turn, the last lick shrinking
  the scoop, one falling drop per drip tick). The timer rides the WORLD clock
  (speed-dial gears scale it, pause freezes it — like `feedT`/`giftFx`), and
  the two drip ticks are arithmetic thirds of the countdown (`coneDripCount`,
  no rng), voiced as soft `ice-drip` blips. View-only: fun/money/treats move
  only at the sale, the hash never sees `coneHold`, and QA reads
  `probe().heldTreats` (`[{name, hold, drips}]`).

Gates: `peoplecheck` §ICE CREAM TRUCK (35 pins: lot-owned object, arithmetic
schedule law, one-truck-a-day stamp across two days, land + nearest-free
fallback, honest refusals (no truck / broke at tap / broke at the curb), the
paid buy, one serving, midnight rot, kid-first chase, hash carries for
serial/stamp/ledger/cone, wish-still-lands, source pins incl. the no-rng-on-
the-clock pin and the marquee price bound to `CONE_PRICE`, and the #2508 view
pins: sprite ships wheels/awning/roof-cone, the 2 s-in/4 s-out constants, all
four roll-off paths wired, draw-only + `truckView` readable). Mutant proven:
`!coneOrderOk(s) → false` at the order gate — exactly the two order-refusal
gates go red (620 → 618/2); restore. Mutant #2508 item 3: zero the adult arm
(`p.coneHold = 0` in finishUse) — exactly the arm, empty-on-clock and drive-
determinism gates go red (701 → 698/3); restore. Or drop the resident-loop
tick (`holdConeTick(s, p, simDt)`) — exactly the empty, determinism and both-
loops pin gates go red (701 → 698/3); restore.

## Queue polish (#2474) — the NOW is seen, the append is named

Two fidelity laws on the #2470 action queue, no rule change:
- **The NOW cell.** The original drew a depleting timer on the running action's
  icon; #2470 goldened the head chip but the errand IN FLIGHT had no chip at
  all. Now, while a resident works a PLAYER errand (and holds a pending list),
  a gold-rimmed cell leads the row: the running order's glyph with a thin bar
  that drains as the interaction spends its `t/dur` or the walk spends its
  steps (length stamped at issue, `p.walkN0`). An AI wander shows none — the
  chips are the player's list, free will never takes the panel — and neither
  does a faint. The cell is a tell, not a button: taps there are inert and
  `queueHit` shifts the pending chips right by one cell, so cancel-by-chip
  keeps its exact hit law (painter and hit-test still read `residentRows`).
  All view-only: `stateHash` never sees `walkN0` or the cell (#2076 doctrine).
- **Per-glyph append timbres.** #2470 rang one 660 Hz blip for every append.
  `QUEUE_TIMBRE` (sim.js, pure data — the #2240/#2264 pattern) keys each chip
  glyph apart — a warm two-note fork for hunger, a soft low hum for the bed,
  a bright triple bounce for fun, a chirpy pair for social, a droplet, a
  briefcase thunk that falls, one soft step for walks — distinct in first
  frequency, note count and spacing (the gates prove uniqueness). The shell
  plays the tables verbatim through `queueGlyphFor(id)`, the same glyph the
  chip paints — one source for what you see and what you hear.

Gates: `homebodyqueuecheck` POLISH #2474 section (21 pins: table shape and
distinctness, glyph derivation, wipe rise over a real walk, t/dur clamp, AI and
faint inertness, fresh-run row geometry and shifted cancel taps, hash-safety of
probing, source pins). Mutant proven: `chipProgress` → `return null` kills
exactly the seven NOW-cell pins; restore.

## Queue polish 2 (#2474) — the chips name themselves, the line moves with a beat

The next two fidelity laws on the #2470 action queue — again view-only, the
sim still owns the law and the hash:
- **The name reveal.** The original taught its action icons by naming them.
  `chipHover` (art.js, the #2240 shared-geometry pattern) reads the cell under a
  pointer — the pending chips AND the inert NOW cell — and paints the errand's
  name (`chipName(id)`: catalog objects ride `DEF`, mail/work say WORK, a walk
  says WALK) in the panel's own blue under the row. A mouse hover answers at
  once; a thumb holds ~420 ms on the NOW cell (the one free surface — pending
  chips answer the press with cancel, #2470) to read the running errand's name.
  Hover never rides the tap route: `chipHover` sits beside `queueHit`, so
  reading a chip can never cancel it (`pointerPx` contains no `chipHover`).
- **The collapse beat.** When the last chip cancels/drops/issues, the row used to
  vanish with a silent resize. Now the row keeps its reserved 18 px while the
  departed chips shrink away as ghosts (`residentRows(s, collapse)` reserves the
  slot; `drawPanel` shrinks `row.fade.glyphs`), then reflows. `chipCollapseArm`
  fires whenever a frame's pending list is shorter than the last frame's — a
  pointer cancel lands BETWEEN frames, so the shell compares per-frame snapshots
  (`qPrevSnap`), not per world step. The beat decays on the world clock (12
  steps), so the fast gears hurry it honestly. Ghosts and names live outside `s`;
  `stateHash` never sees them (the queue itself still rides the hash — that law
  is #2470's), and a new street clears the register.
- **Item 3 — drag-to-front (#2495 answered B).** The original pulls a queued
  action to the head. The chip's tap verb stayed cancel, but cancel moved from
  press to release (the mobile idiom; a tap is down+up, the exposed `tap()`
  rides both). Press-and-pull a chip #2+ left until it reaches the head slot
  (distance derives from `QCELL`'s pitch, sloped half a pitch) and it jumps to
  the front of the list — `queuePromote` (sim.js) splices order only; the
  promoted errand still re-validates at issue time, so a sold one drops
  honestly. The head chip has no front to pull to, so its press keeps the
  instant cancel. The pad route publishes thumb moves, so phone drags ride the
  same law; `__game.drag(fx,fy,tx,ty)` drives the whole gesture for QA.

Gates: `homebodyqueuecheck` POLISH 2 section (+22 pins: `chipName` mapping,
hover names the pending chip / the NOW cell / nothing off-row, hover never cancels
and never moves the hash, row-reserved + hold-open + reflow over the collapse,
arm-nothing, probing hash-safety, source pins incl. hover-not-in-pointerPx and
cancel-still-owns-the-press). `homebodydrive` (+5 live: a busy tap joins the
list, hover reads the chip its name, the blue label paints under the row, the
name clears on leave, cancelling a chip arms the beat — `collapse=[12,0]`).
Mutants proven: `chipHover` → `return null` kills exactly the two reveal pins;
dropping the reserved-space line kills exactly the two hold-open pins; restore.
`peoplecheck` 585/0, seed-exact hash pins green (the layer is view-only).

## Sneak in the night (#2520) — odd nights the lot keeps watch

The day/night clause gets its first **night** citizen: the original's clock
brings not only deliveries but a burglar. The lot now has something to lose
after dark — and an answer on the shelf.

- **The loot is ornament, never cash.** `SNEAK_LOOT = ['plant','rug','lamp']`
  — one loose decor item, lifted at the door-step. The economy stays provably
  untouched: the sneak section contains no `s.money` at all (source-pinned),
  so the attract-win margin (~§10 on tight seeds) can never be robbed into a
  loss. A bare lot gets an honest `sneak-empty` — he came, found nothing loose,
  left. `s.lost` counts ornaments and rides the hash.
- **Parity is arithmetic, not dice.** Odd days (`day % 2 === 1`) are his
  nights; he lands at 23:00 (`SNEAK_DUE`), window to 23:59, one visit per
  night stamped by `sneakNight === s.day` (the paper-route doctrine). Because
  the rule reads the day, the twelve-night determinism twin passes untouched —
  the section draws no rng (`updateSneak` is source-pinned rng-free).
- **Visitor-shaped, not resident-shaped.** He rides the `g.sneak` slot like
  the cat and the kid: gate cell (12,5) → door-step (10,5) via BFS, `enter →
  grab → leaving`, on the depth line, retired at midnight by `newDay`
  (`sneak-gone`) — nothing prowls into tomorrow. `drawPerson` gives him the
  fedora (`p.sneak`); the alarm sprite is a DOMED SIREN with a night halo.
- **The answer is purchasable.** *Burglar Alarm*, §90, walkable decor on the
  SPECIAL shelf (card 19). `hasAlarm(s)` is the one honest voice; a placed
  alarm turns him AT the gate post (`sneak-scared`, `scareDay` stamped) — the
  foot never lands, nothing is taken. Parity still applies: an alarm doesn't
  make safe nights safer, it makes his nights harmless.
- **Voices.** `sneak-in` = three falling low triangle steps (near-silent);
  `sneak-scared` = two-tone siren + red burst at the gate; `sneak-take` =
  low thunk + shake, banner names the ornament (`THE SNEAK TOOK THE POTTED
  FERN`). Events are `{ t: ... }` per house convention; the marquee teaches
  the law (`THE SNEAK WALKS ODD NIGHTS AT ELEVEN…`).
- **Rig + telemetry.** `ringSneak(s)` (F1 cheat `RING SNEAK`, dev hook
  `__homebodyTest.ringSneak`) bypasses parity (retires tonight's stamp) but
  never the alarm — QA can demand a prowler on any seed.
  `__homebodyTest.sneak` / `.sneakLedger` read the visit and the losses.
- **peoplecheck** (§SNEAK IN THE NIGHT): shelf, ledger, parity forever,
  organic gate→verdict→gone, one-a-night with even nights clean, decor take
  + bare-lot empty, alarm-at-the-post (rig obeys it), midnight retire, four
  hash carriers, rng-free source, determinism twin, win economy intact,
  marquee/case/art/rig source pins. 650 checks, 0 fail.

## Even-night prowl (#2532) — the sneak's mirror: Miso keeps the dark halves

The day/night tail's second night citizen. The sneak took the odd nights
(#2520); **even nights belong to the cat** (The Sims, PC 2000 — the household
cat is a night creature, out working the lot after the house is asleep).

- **Parity, not rng**: `prowlNightDue(day) = day % 2 === 0`. The two
  complementary parities can never overlap — odd nights boots on the gravel,
  even nights cat paws, and Miso never shares a dark with the sneak.
- **The wake-and-slip**: night normally beds Miso (updatePet's loaf branch);
  on a due night at 23:00 she wakes (stretch), and `updateProwl` walks her to
  the far corner of the lot (deterministic scan: farthest walkable cell from
  the gate), then home to the nearest warm floor cell — visitor-shaped BFS,
  non-solid, cat pace. Midnight calls her in however far she got (`newDay`,
  the sneak's own rule mirrored); one prowl a night, stamped by day.
- **Cat-scale pay, economy-safe**: the prowl pays `PET_PROWL_FUN` (0.30 fun)
  and nothing else — never `s.money`, never `s.lost` (the #2520 win-margin
  law: night features must not touch the attract's thin wish margin).
- **Look**: night-eyes — two small amber glints ride the sprite while she
  prowls (view-only); soft rising pads out, a two-note lift home; banners
  `MISO IS OUT ON THE LOT` / `MISO IS HOME FOR THE NIGHT`; the attract
  marquee teaches `MISO PROWLS EVEN NIGHTS AT ELEVEN…`.
- **Honest refusals**: odd nights she sleeps exactly as before; a lot without
  Miso never hears a prowl. `ringProwl` (F1/harness) opens the flap any night
  — with no cat on the lot it refuses in words.
- Verify: `npm run peoplecheck` §PROWL pins + the sim twin
  (parity due/stamp/retire across seeds; no-cat quiet). `sneak-gone`/`prowl-home`
  cross-check: neither a sneak nor a prowl ever lands on the same night.

## Neighbours SPAT (#2604) — the web's dark half

The #2070 cold war was household only — Fern and Ivy could be ignored patiently
forever. `updateNeighbours` now carries the pair's own weather, mirrored from the
household law with neighbour-appropriate signals, no rng in any trigger:

- **Souring.** While both neighbours hang and **exactly one has an ear**
  (`claim`, settled by the #2154 arbitration) with the other still inside gossip
  reach (`≤ NEIGH_GLANCE_REACH`), the watched-but-unheard minutes count:
  `neiIgnore` accrues. Any peace breaks it — both hang unclaimed (they have each
  other), both claimed (nobody waits), either out of gossip reach, either off the
  lot.
- **The crack.** `NEIGH_IGNORE_T` 30 continuous seconds: the pair SPAT —
  `relSub(neigh, NEIGH_SPAT_DROP = 4)`, `neiGrudge = 1`, `neiSpats++`,
  `neiSpatCd = NEIGH_SPAT_CD` (40 s, the SPAT_CD mirror; no re-crack inside it).
  The `spat` event carries `who: 'neigh'` — the shell names the pair
  (`FERN AND IVY SPAT!`) over the #2070 crack: sour dissonance, red sparks, jolt.
- **Cold war.** While `neiGrudge` holds, `updateNeighbours` returns before any
  pay — no chat, no glance, no meet-up walk: *proximity builds nothing, only
  absence cools*, the household doctrine verbatim. Chats with residents are
  untouched — the grudge is the pair's own. The panel NEIGH row runs ash-teal
  while cold (the HOUSE row's grudge-ash pattern).
- **The exit is absence, then reunion.** One of the pair leaves the lot →
  `neiGrudge = 0`, `neiMending = 1` (a thaw line; no timer, the visits keep
  their own hours). The first time both hang unclaimed inside `NEIGH_REACH`
  again the pair makes up: `relAdd(neigh, NEIGH_MAKEUP = 2)`, a `makeup` event
  (`who: 'neigh'` → `THE NEIGHBOURS MADE UP ♥`, hearts, warm chord), once per
  thaw — and no content: the win economy stays the household's.
- **State.** `neiSpats`/`neiGrudge`/`neiMending` ride `stateHash`;
  `neiIgnore`/`neiSpatCd` are clocks like `spatCd` and stay off it. The marquee
  teaches the law in one line.

Proof: `peoplecheck` NEIGH SPAT block — timer boundary exactness (29 s silent,
30 s cracks), drop-and-only-the-pair accounting, the crack event's `who` and
spot, three reset cases (free-together / both-claimed / out-of-reach, each
proving 32 borrowed seconds cannot fire), cold-war silence on all three pays
while resident chat survives, absence-thaw, reunion pay-once, the CD mirror
(a re-soured pair waits; when the cooldown expires it cracks again), hash
carries, and a scripted crack→absence→reunion run is seed-exact. Mutant
(proved by hand): neuter the cold-war return → the three silence gates and the
source pin go red.

## Neighbours stroll (#2611) — the pair walks the lot

The gap said the pair ring was *proximity* — Fern and Ivy chatted where the lot
parked them. The original's conversations wander: Sims repath while they talk, and
keeping an ear on them means following. `updateNeighbours` now banks the walk:

- **The bank.** While both neighbours hang unclaimed **inside the ring** and
  **both are mobile** (neither carries a path), `neiStroll` accrues world-seconds.
  At `NEIGH_STROLL_T` 12 s the pair sets off together. The chat law itself is
  untouched (#2588's proximity pays mid-walk too) — only a fresh stroll never
  queues mid-stride.
- **The circuit.** `NEIGH_SPOTS` is a fixed list of the lot's honest hang spots —
  front path `(10,6)`, east lawn `(5,13)`, back lawn `(0,8)` — walked in order by
  the counter `neiWalk` (`(neiWalk + 1) % 3`). No rng: every seed walks the same
  lap. A blocked spot falls back to `nearestFreeTo`; if even the destination is
  unreachable the lap is skipped and the bank retries at the next fill.
- **Lead and trail.** Fern leads — this is HER street — and Ivy follows the host
  to a free cell beside the spot (`freeCellNear`, the #2588 etiquette with Ivy's
  legs doing the crossing). If Ivy's follow path fails the meet-up law picks her
  up the moment the pair drifts out of ring: the pair never splits past
  `NEIGH_GLANCE_REACH`, and a full-lap gate watches max distance, not endpoints.
- **Carry and zero.** Claims and meet distance FREEZE the bank (a paused
  conversation resumes where it stopped — the peace needs only the remainder);
  a SPAT kills it, and absence resets it — a new visit starts its walks at the
  gate. The cold war never strolls (`neiGrudge` returns before the bank exists).
- **Tells.** The `neigh-stroll` event (with `i`) paints teal pips at the pair's
  mid-point over a soft two-note, the banner `FERN AND IVY TAKE A WALK` names
  them, one rotating line per spot (`NEIGH_STROLL_LINES`), and the marquee
  teaches the law: `WHILE THEY TALK THE PAIR WANDERS THE LOT`.
- **View pass (#2618).** The lap sells itself: while both guests are mid-path
  `pairStride` (art, pure) turns their faces toward each other and deepens the
  bob past the solo walk (`STRIDE_BOB` 2.2); the fire tick lights the lead's
  first three cells as fading teal route dots (`strollTrail`); when the LAST
  walker stops the pair settles facing one another for half a second with one
  soft note; the BONDS NEIGH row walks two pips while a lap is in flight
  (`bondRows.strolling`); and the attract rings Ivy into the demo on the
  STROLL marquee beat so the demo window contains a full lap. All view-only —
  sim.js never learns a word of it (pinned), and the drives' rigs
  (`hangPair`/`holdResidents`/`strollView`) keep the household out of the
  pair's claim halo.

## Mediators (#2672) — the kid broke it up

The bond line's last open tail: *"Miso and Pip don't mediate the pair."* The
original's households never let a grown-up grudge sit untouched when children
and pets are in the room — someone breaks the tension. While the Fern–Ivy cold
war holds (`neiGrudge`, #2604), the law now has a third door out:

- **The ring.** A mediator — `s.pet` or `s.kid` — that is awake and stands
  within `NEIGH_MEDIATE_REACH` 3 tiles of BOTH quarrellers cracks the war on
  the spot (`mediatorNear`, Manhattan like every other reach on the lot). The
  cat is asked before the kid: Miso arrived first (#2197 precedes #2203), so
  the order is the shelf's own, not a coin. An asleep mediator is inert
  (source-pinned; the day-wake law rightly owns waking).
- **The pay.** `NEIGH_MEDIATE_PAY` 1 — half the reunion's grace — lands at
  once, and the pair enters #2604's mending lane, so the next shared moment
  pays `NEIGH_MAKEUP` too: mediation thaws faster, it does not forgive. The
  offence stands — the spat's `NEIGH_SPAT_DROP` is never clawed back.
- **Once per spat.** `neiMediated` rides the hash beside the quarrel ledger
  (`neiSpats`/`neiGrudge`/`neiMending`); a fresh spat re-arms it. A cold war
  that arrives without a new spat (or thaws by absence, #2604's lane untouched)
  cannot be mediated twice, and a mediator standing around after the peace is
  inert.
- **The beat.** The `mediate` event (`who:'neigh'`, `med:'pet'|'kid'`) plays
  two soft notes, sparkles the pair-hue leaf, banners `MISO/PIP BROKE IT UP ♥`
  and speaks one line from `NEIGH_MEDIATE_LINES` in the pair's own bubble
  colours — per-mediator voices, counter rotation, no rng; seeded timelines
  hold (a mediated day is seed-exact).
- **State.** `neiWalk` is discrete and rides `stateHash`; `neiStroll` is a clock
  and stays off, the `spatCd` rule.

Proof: `peoplecheck` NEIGH STROLL block (25 gates) — bank boundary exactness
(11 s silent, 12 s off), lead/trail arrival, bank-frozen mid-stride and resumed
on arrival, every lap's path aimed at its fixed spot (captured at fire ticks),
rotation mod three with the wrap, max pair distance across the circuit, household
isolation (residents parked outside every route's claim halo), claim-carry,
spat-zero and absence-reset (the fresh pair needs the FULL timer), cold-war
refusal and post-thaw resume, hash carries the beat not the bank, and a 60 s lap
is seed-exact. Mutant (proved by hand): `neiStroll += 0` → 13 gates die by name
and the pin goes red.

## Go-say (#2683) — choose WHICH two share the ring

The #2235 court pick let the hand choose the ear inside a crowded ring; the
pair itself was still chosen by proximity — the word only reached whoever
already shared the speaker's `COURT_REACH` 2. Go-say closes the tail: a tap
on Fern, Ivy or Pip beyond arm's reach issues a walk-to-them errand, and the
tick the two actually share the ring, `court(s, 'coo', walker)` lands the
compliment through the existing law — bond pay, sparkle midpoint, `cmdCd`,
thought lines, all unchanged. The original's idiom, finally: The Sims
(PC 2000) let you click the person you wanted to talk to and your Sim walked
over and did it.

- **Arrival is the law** (`goSayArrive`, sim.js, run from `advance`'s goal
  chain): in reach → the promise converts to the #2235 pick (`s.courtPick`,
  so even a crowd pays the chosen ear) and fires; `cmdCd` still up → the goal
  waits where it stands and fires the tick the cooldown clears; the ear left,
  fainted or fell asleep → `go-say` `stage:'lost'` and the errand folds
  unpaid (fainted-folks-are-not-company, and the kids' own night law); the
  target slipped away → fresh BFS path, capped at `GO_SAY_CHASE` 3 re-paths,
  then lost. The coo lands exactly ONCE either way.
- **The errand speaks as itself.** `court`/`courtReach`/`courtTarget` take an
  optional `speakerIdx` (default `s.active` — every older call byte-identical),
  so a promise issued to Mira delivers Mira's compliment even after the hand
  moves to Otto. The partner is deliberately NOT a go-say target: tapping a
  resident is the switch idiom.
- **Queue parity (#2470):** a busy hand lists it — `{ kind:'gosay', k }` joins
  `cmdQueue`, re-validates at issue (an ear gone home drops honest), rides the
  hash, and gets its OWN chip: a bubble-on-legs glyph and a chat-pair-plus-step
  timbre (#2704 tail 3 — the errand that walks over no longer hides behind the
  seated chat glyph; the seated `phone` chat keeps its old chip untouched).
- **Seen before it lands:** the order ping rings the target at the tap
  ("GO SAY IT — FERN"), and while the errand is in flight the painter trails
  a dotted gold ring under the promised ear across the lot — the #2135 tell
  stretched to the full distance. Marquee and registry controls teach it.
- **Determinism:** nothing at issue draws rng; the attract bot never go-says,
  so old demos are byte-identical; listed promises ride `stateHash`.
Gates: `peoplecheck` §GO-SAY (26: same-ring refusal and the switch guard,
issue + path + ping, walk-and-land fires once, bond+cooldown parity, pick
promotion, crowd pays the chosen ear, cooldown WAIT then fire, leaving/asleep
folds, bounded chase, queue re-issue + honest drop, speaks-as-itself,
seed-exact, hash, attract invariant, source pins). Mutants proven: stub the
in-ring fire — exactly the eight arrival gates go red (876 → 868/8); hardcode
the speaker to `s.active` — exactly the speaks-as-itself gate goes red
(876 → 875/1); restore.

## Settle beat (#2697 QA pass) — the errand breathes

Two of #2697's seven tails, both mid-game feel, both pure cadence and text —
no rng, no economy change, the attract bot still never go-says.

- **The face-and-breath.** Reaching the ring is not the meeting: the walker
  now holds `GO_SAY_SETTLE` (18 world ticks ≈ 0.3 s) beside the ear before the
  coo lands (the Sims social-pause idiom, mirroring #2618's neighbour settle).
  A cooldown hold FREEZES the breath (`cmdCd > 0` returns before the tick
  counter); a repath discards it; the errand dying mid-hold clears it —
  `p.settleT` never outlives its goal.
- **The errand narrates itself.** At issue, one fixed thought: "You cross the
  lot to say the thing you mean." The blocked-repath loss, previously silent,
  now says "The way over is shut — the kind word waits for another day."
  Fixed text at both new sites — the rng stream is untouched, so every stored
  hash on this page stands, twin determinism included.

Gates: `peoplecheck` §GOSAY +5 pins (breath cadence exact, silent hold with
the bond-drift band, breath spent with the word, issue line, shut-way line at
the moment of loss). Mutants: `GO_SAY_SETTLE = 0` → the cadence gate goes red;
decrement before the `cmdCd` return → the frozen-breath wording and cadence
break; restore.

Honest residual (#2697 tails 3–7): **CLOSED by #2704, three of five** (§ Polish
pass below) — the chip now wears a bubble-on-legs, the garden arrives with a
crate and watering can, and hovering the kit card previews the wing. The
far-tap keyboard idiom shipped in #2708 (§ Far-tap key below). Still open:
the attract never buys kit two — and #2708's probe says why a beat cannot fix
it: the demo economy nets §520 start + §100/day and spends phone+pet+kid+kit
one before the wish lands (~day 3, 12:30h), so a second §300 never arrives
honestly inside a winning run. Selling kit two in the demo needs an economy
call, not a staging beat — a money grant launders the economy the win
proves, and re-cutting the #2209 family-first tour starves Pip out of the
demo again (that gate is exact: `pet,kid`). **CLOSED by #2721** — the economy
call landed (§ Kit-two economy window below): kit two now has a purse of its own
and the attract buys it.

## Kit-two economy window (#2721) — THE LOT GROWS TWICE

The wall was measured, not assumed (#2714): the honest winning tour earns §520
start + two §100 paydays = §720 and spends phone+pet+kid+kit one = §710, winning
with §8–10 in the till. A second §300 could not arrive before the wish on any
seed. A money grant would launder the economy the win proves, and re-cutting the
#2209 family-first tour starves Pip — so kit two got its **own purse** instead of
a richer till:

- **Pip's morning round** (`updateRoute`, `ROUTE = { cash: 90, hour: 7 }`): while a
  child lives on the lot, one beat per morning (the day stamp is the law — #2238's
  idiom) carries the subs money into `s.jar`, never into `s.money`. Fixed thought
  text, no rng: every shipped tour, twin seed and thin margin survives exactly as
  measured until the hammer falls. `jar` joins `stateHash` (a saved fund is a room
  standing); `routeDay` is a clock like `lastToast` and stays off it.
- **The jar is earmarked** (`JAR_CAP = GARDEN.price`): it caps at the kit price — a
  full jar reads full, no over-saving theatre — and buys exactly one thing.
  `buildRoom`/`buildRoomOk` ask `fund = geom.id === 'garden' ? s.jar : 0` and drain
  the jar *before* the till, so the east wing, every furniture piece and every
  refusal behave as shipped; §90 in the jar cannot buy a fern, a roof or a favour.
- **The cottage prices itself**: §90, not the placeholder §300 — 8 planks against
  the wing's 12, a door punched through a wall that already stands, no brick band.
  The catalog card reads the honest purse for the kit it will raise (`§90 JAR
  90/90`), the marquee teaches the whole law in one line ("THE LOT GROWS TWICE —
  … Pip's morning paper round fills the garden jar, and a full jar raises the
  cottage out back"), the registry controls say it, and the F1 eye reads and fills
  the jar (`FILL JAR`, `SEND ROUND`).
- **What the demo shows now:** seed 7 raises east at d2 ~17:30 (the till) and the
  garden moments later (the jar), pulls 4 harvests before the wish at d3 11.2h, and
  ends `ext = 2`. Four of the five WINNABLE seeds end ext=2; seed 99 grants its wish
  seconds after its hammer, before the sun finishes the first bed — the honest
  residual on the *fastest* wins is ripening time, not money. The tour gate stays
  exactly `pet,kid` and every seed still wins.

Gates: `peoplecheck` §GARDEN JAR (23 — no-child silence, one-beat-per-day
arithmetic, the cap, purity ×2 (decor, the east wing), jar-first payment and the
shortfall maths, hash join + clock hygiene, determinism twin, the source pins
(no till, no rng, one arithmetic), and the copy pins (marquee, card, dev eye,
registry)); the #2714 pin flipped to its opposite (the demo grows TWICE and ripens
before the wish, copy and economy pinned together); #2689's refusal gate now reads
"the lot grows twice, and a third kit refuses". Mutant proven: `fund = 0` (the jar
stops paying at the counter) kills exactly the four economy gates — 1033 → 1029/4;
restore green.

## Polish pass (#2704 QA) — the walk shows its legs, the garden shows its work

Three view-only beats from #2697's residual list. `sim.js` changes ONE line's
worth of timbre-table data (`QUEUE_TIMBRE` gains `gosay` — a constant table the
hash never reads); no rule, no economy, no rng, the attract bot still never
go-says, and the garden's GARDEN geometry is byte-untouched (pinned).

- **The chip walks.** `queueGlyphFor('gosay')` returns its own `'gosay'` glyph:
  a chat bubble on two striding legs (one lifted mid-step), and the append
  timbre is the chat pair plus one soft step — *I will walk over and say it*
  reads (and sounds) distinct from the seated chat of `phone`.
- **The garden arrives worked.** The cottage bake gets a produce crate (greens
  peeking the rim) and a watering can at the bench's south end — same bake,
  same cache key, draw-only like the bench: it blocks nothing.
- **The kit previews itself.** A mouse resting on the Spare Room card paints
  the wing ghost at the site `place` would default to (east anchor, or the
  garden after wing one) with the real `buildRoomOk` legality — the choose-a-row
  beat sells before R/tap picks. Mouse-only (behind the touch early-return),
  never while a kit is selected, and a pointer leaving the lot puts it out.

Gates: `peoplecheck` §POLISH 3 (8 — glyph derivation, leg strokes in order,
timbre pair+step with the seated chat untouched, props painted, garden-branch
only, geometry byte-untouched, hover→ghost wiring, the two outrank guards).

## Purpose view pass (#2705 QA) — the rooms show what they're earning

Four mid-game tells on the #2695 laws, all pure view: the painters read only
ledgers the sim already keeps (`tend`, `herbs`, night sleepers) — no rule, no
rng, no new clock, and the hash never hears of any of it (the #2076 view-only
doctrine; `homebodyqueuecheck`'s seed-exact pin `3836882361` re-passed
untouched).

- **The garden shows its ripening.** `ripenessOf(wing)` = `tend/TEND_HOURS`
  (0..1) painted on the bed cells (10,2)–(10,3): turned soil, a slow gold
  creep east across the board, and sprouts that thicken (1→5, gold-tipped
  past ¾) — the harvest is seen COMING (the catch-ring pattern, #2686).
- **The harvest has a home.** A wicker hamper at the garden door (9,2)
  carries one sprig per herb, capped at `HAMPER_CAP` 4 — the sprite caps, the
  ledger keeps counting. Draw-only, at the doorstep's side; nobody is fenced
  in (the keepons stay, hash unchanged).
- **The lodged room burns deeper.** A wing whose OWN floor (the same
  `wingSets` question the lodging law asks — `wingLodged`) carries a
  through-the-night sleeper (`use.night`, the law's own flag — day naps stay
  honest) paints its panes deep amber with a halo; every other lit wing keeps
  the shipped colour. It cools at waking for free: the sleeper's `use`
  clears with the dawn law.
- **Waiting reads as waiting.** A half-ripened bed under the night tint
  breathes three cool silver glints (`moonlitWait`: dusk + 0<tend<TEND_HOURS)
  — growing gold dimmed under the tint vs silver twinkling names the pause
  the sun-law imposes (the ring-vs-die pattern, #2688).

Gates: `peoplecheck` §POLISH PASS (22: ramp exactness/garden-only/clamps,
hamper empty/carried/capped/east-only, sleepers-night-only/nap-excluded,
per-wing lodging + house-bed refusal, moonlit dusk/day/empty/full/no-garden,
probe-hash byte-identity, sim-learns-nothing + no-clock-in-block source pins,
shell wiring order, pane/ramp/glint paint pins, `wingSets` export pin).
Mutants proven (combined hand-mutant): zero the creep width, drop the hamper
cap, drop the `use.night` filter, open the wait to full beds — exactly the
four named view gates go red (988 → 984/4); restore.

Still open from #2705 (re-filed): the pause-sheet lodging pips (tail 4). Tail 6,
the attract ripening beat, is **CLOSED by #2721** (the jar funds kit two, so the
garden stands in demo time and ripens on screen; the autopilot pin re-sampled to
`3998885235`).

## Honest gaps (filed to QA #…)

- **CLOSED by #1806:** multiple rooms — one expansion ships: the Spare Room kit
  grows a wing on the east lawn (floor/walls/door/windows, connectivity-guarded,
  one per lot).
- **CLOSED by #2689:** deeper multi-room building — two of its three clauses.
  Choose placement: hold the Spare Room kit and the whole wing ghosts under
  the cursor; a site is legal exactly where its punched door meets house floor
  (the east rows 0,1,2,4,5 — the anchor list is that law, and peoplecheck
  derives it from MAP independently). Second wing: kit two raises the Garden
  Room on the back lawn — 2×4 planks at rows 9–10, door punched through the
  house's south wall at (8,2), east windows, potting bench. Two rooms per lot;
  a third kit refuses; every hammer passes `keepsWing` (no resident, the mail
  or the kerb gets sealed), and a garden under a standing wing's row overlap
  refuses too.
- **CLOSED by #2695:** rooms with purpose — rooms that carry a name and a
  mechanic of their own beyond the canopy bed's bedroom law (§ Rooms with
  purpose below): the Garden Room ripens through its sunlit hours and feeds
  the house, the Spare Room lodges whoever sleeps the night in it. Purpose
  rides the wing records — an unbuilt lot does not even notice.
- **CLOSED by #2736:** rooms with a personality — the study and the playroom
  (§Rooms with a personality above): contents name a room, three reads make an
  insight, three in-room plays a delight, the child crosses the lot for the
  room's toy. **CLOSED by #2752:** the demo now shows a named room — the jar's
  surplus clause (§ above) buys the wing one radio inside the winning attract
  run, and the drive's 390-px leg proves the badge ink survives the blur.
  Honest tails left open: a room whose furniture is sold keeps its paid
  ledgers but loses its badge — whether earnings should ever cool is
  un-decided (#2751 asks Jon); and the third archetype
  (a gym that strengthens? a kitchen annexe?) waits its own floor.
- **CLOSED by #1814 (QA pass, partial):** the wing glows at night and the
  residents react to the build. #2076 taught the bond law on the attract
  marquee (the bonds line of that list). #2135's pass closed chat speech
  bubbles, the cooling log lines and the C/X marquee + reach-ring tell.
  **CLOSED by #2272:** wing-themed furniture — the Canopy Bed (§ above).
  **CLOSED by #2683:** choosing WHICH two share the ring — go-say (§ Go-say
  above): a far tap walks your resident over and the coo lands in-ring.
- **CLOSED by #1823 (QA pass):** walk-surface step timbre (plank/gravel/lawn)
  and the red ghost-cell flash on refused placements.
- **PARTIAL by #1817 + #2070 + #2131:** bonds climb the chat loop, unlock a topic/
  linger/return/toast ladder, and can now break and mend — spats, cold war
  and make-ups shipped. Player-ordered romance landed too (#2131): `C` says the
  kind thing to whoever is within arm's reach (and Space/A rides the compliment
  where no object is near), a FAMILY-tier household compliment deepens into
  affection (double, hearts), and `X` hurls an insult — the bond falls and the
  grudge sets, with the #2070 human exit still the only way back. The second
  point of the triangle landed in #2143 (Ivy, the market neighbour — own
  schedule, own meter, gift economy). The pad got its own handle on the line
  (#2171 shipped): one button, two orders — release inside ⅔ s is
  the coo, held past it the insult flies mid-hold, on the same laws and the same
  cooldown as C/X. **The pet half of that tail landed in #2197 — Miso the
  adoptable cat (see Cat (#2197))**; the kids half landed in #2203 — Pip, the
  adoptable child (see Kids (#2203)). **Third-party relationships landed in #2588
  — Fern and Ivy form their own bond (see §Neighbours who meet); the third-party
  grudge landed in #2604 — the pair SPAT too (see §Neighbours SPAT); pair pathing
  choreography landed in #2611 — a long chat strolls the lot on a fixed circuit (see
  §Neighbours stroll).** **CLOSED by #2672:** Miso and Pip mediate the pair — see
  §Mediators below; the pair's cold war now has a third door out (see §Neighbours
  SPAT).
- Visitors are Fern and Ivy (#2143); pets landed (#2197, Miso — and #2200 gave
  her a mood row on the panel and neighbours who greet her); kids landed
  (#2203, Pip); **CLOSED by #2222:** the buy catalog got its category shelves
  (HOME / FUN / DECOR / SPECIAL) — see §Catalog shelves below.
- **CLOSED by #2227:** no skippable-speed control — the clock dial ships (pause /
  normal / fast / fastest: digits `1`-`4` outside buy mode, `,`/`.` cycle, the
  panel pips are tappable — see §Speed dial).
- Day/night is cosmetic + decay only — the paper route (#2238, §Paper route
  below) is its first hour-scheduled citizen, the meal bells (#2244,
  §Meal bells below) its next two, **CLOSED by #2303** the garbage truck
  (§Garbage day below) keeps the street, and **CLOSED by #2503** the
  ice-cream man (§Ice cream truck below) sells the hot afternoon, and
  **CLOSED by #2520** the sneak (§Sneak in the night below) walks the odd
  night — the clause now keeps hours at both ends of the day. Nothing
  else on the lot keeps hours beyond work, Ivy's rounds and the morning news.
- Needs panel shows both residents; no per-object queue display like the
  original. — **CLOSED by #2470** (per-resident action queue: a tap on an
  object/mail/floor while the resident is busy with one of THEIR OWN errands
  appends it (`cmdQueue`, cap `QUEUE_MAX` 3) instead of losing the errand in
  flight; the tick an order ends, the head of the list re-issues from wherever
  they stand (`issueOrder`, re-validated — sold object / expired season /
  off-hours mail drop honestly with `queue-drop` and the next item gets its
  turn); collapse and leaving for work clear the list; the panel paints pending
  orders as 19×14 chips under each resident's bars using the panel's own icon
  set (`residentRows`/`QCELL` shared between painter and `queueHit` — the
  #2240 pattern), a chip tap cancels that order; pad-A rides the same law via
  `tryUseOrQueue`; queue contents join `stateHash`. Free will never outranks
  the hand: orders the resident's OWN autonomy placed (`p.owner !== 'human'` —
  autonomy and the move-in reaction stamp `'ai'`, every `cmd*` stamps `'human'`)
  are preempted by a tap exactly as before the queue existed, and the attract
  bot never queues, so old play is byte-identical (seed-exact pin + the whole
  `homebodydrive` leg). Gates: `npm run homebodyqueuecheck` 40 pins; mutate:
  stub the pump guard → exactly the drain pins red.)

## Feels pass (#2688) — the promise tells its own story

Four view-only beats on the #2683 go-say errand and the #2689 garden, no rule
change (sim.js never hears of these words — pinned):

- **The ring tightens.** `promiseTell(s)` (art.js, pure) returns the Manhattan
  gap and a `tight` factor 0→1 across `PROMISE_TIGHTEN` (8) tiles; the dashed
  gold ring shrinks and thickens as the walker nears — the promise reads
  near/far at a glance.
- **The trail marches.** The errand's remaining path gets one lit dot per
  three cells, `Math.floor(sec*6)` advancing the lit set toward the door —
  motion, not just an alpha pulse.
- **The ear knows.** `earReact(s)` answers with the target's hue once the
  walker is inside `EAR_REACT` (4) tiles — Fern green, Ivy plum, Pip gold. A
  walking promise and a waiting ear, half the charm.
- **The grey death ring.** When an errand folds (`go-say stage:lost`) the gold
  ring collapses into a grey flicker on the spot (`lostRing`, `LOST_RING_T` =
  1.3 s, real-clock, never crosses streets).
- **The garden's lamp.** `gardenLamp(s)` lights a warm pool under the potting
  bench after dusk (night > 0.2), only while the garden wing stands — the room
  reads lived-in at night, matching the panes' glow law.

Gates: `peoplecheck` §FEEL PASS (25 pins — tight monotone, ear range, trail
shape, leaving-ear silence, hue table, lamp law, source pins). Mutants proven:
zero `tight` → the monotone gate red; drop the garden test from `gardenLamp` →
the east-alone gate red; restore.

## The jar reads on its own (#2729 — QA polish on #2721)

The round pays the fund at the gate, but until the catalog opened the fill was
invisible. `jarRow(s)` (art.js) is the panel's own view of the fund — pure
data like `bondRows`: an amber jar glyph at the honey-jar palette, four pips at
the quartiles of `JAR_CAP`, the honest `n/90` count in money-amber, and the
FAMILY gold ring on pip 4 when the jar is full (the kit is buyable NOW). It
rides directly under Pip's BONDS row (the round is hers); Miso's seat moves one
row down to make room. The row appears with Pip and retires when the cottage
stands — a spent fund has nothing left to teach. The phone-scale probe
(`bondsPix.jar`) counts glyph ink, pips, label and the amber count through the
compositor's blur, aiming at the same `jarRow` so painter and probe cannot drift.

Gates: `peoplecheck` §GARDEN JAR grew 9 view checks (no-child silence, row
under PIP, quartile tracking, full-pulse, retire-on-hammer, three source pins).
Mutant proven: drop the retire clause from `jarRow` → the retire gate red
(1041/1); restore → 1042/0.
