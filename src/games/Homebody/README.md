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
- Spare Room (#1806): card 14 / `R` in buy mode, §300, one per lot. The lot
  overlay `s.ext` replaces the lawn east of the house with a 3×4 wing — plank
  floor, brick walls, a punched doorway at (4,11), two east windows. Ground is
  asked through `groundOf(s, r, c)` everywhere the sim walks or guards, so
  `keepsOpen`, BFS, the attract bot and manual movement all treat the wing as
  built the tick the hammer falls; the door's room-side cell (4,12) may never
  be blocked once the room holds furniture. `ext` rides `stateHash`.
- Move-in (#1814): buying the kit arms `s.roomReact = 2`; the moment each
  resident is otherwise idle they path once through the doorway to a glance
  cell in the wing (preferred cells `ROOM_REACT`, any free room cell as
  fallback). Arrival pays a thought line, +0.15 fun, a `room-see` event and a
  banner — once per resident, ever; a player interrupting the walk re-offers
  it later. The wing's east windows (`EXT_ROOM.windows` — one source for the
  bake and the glow) light warm after dusk like the house's own. The attract
  bot buys the kit second so the demo sells the reflow.
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
  button — romance and third-party relationships stay open (see Honest gaps).
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

## Verify
```bash
npm run peoplecheck          # 480 gates: boot, rules, spare-room wing (#1806), bonds ladder (#1817), move-in reactions + night glow (#1814), walk-surface footfalls + refusal flash (#1823), spats/cold-war/make-up (#2070), sprite tell + loud fade (#2076), court commands — coo/affection/insult + cooldown economy (#2131), second neighbour Ivy — schedule/gift/ladder/court/hash (#2143), visitor choreography — nearest ring, contested pays closer, three-way tell (#2154), thumb court — tap coos, held A insults (#2171), cat — counter law, cat day, coos, hash (#2197), pet polish — mood law, visible kibble, greeting law (#2200), kids — counter law, kid day, tumbles/cries, court, hash (#2203), catalog shelves — partition/flip/memory/digits/hash (#2222), speed dial (#2227), court polish — spoken chat crossing, cooling beats, ring tell (#2135), court pick — crowded ring tap chooses the ear, expiry, hash (#2235), paper route — hourly news, day stamp, rot (#2238), meal bells — three bells, one helping each, cold window, shared table, die-under-the-walk refusal (#2244), first pass — morning grace, amber prompts, order ping, ✓ on glass (#2253), attract family tour — the demo sells Pip, cat then child (#2209), winnable seeds, determinism
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
# correctly stay green — they assert the old law); restore.
npm run dev   # another terminal
npm run contractcheck        # includes homebody (CONTRACT_ONLY=homebody for just this)
DEV_PORT=5174 npm run homebodydrive   # real Chrome: start, order, build, die, restart + live storm-puff/heart pixels + real C/X court keys with pink affection pixels and the far-apart Space doctrine + #2222 shelf flips on real [ ] keys, a tapped tab and gold-painted open-tab pixels + #2244 bells live: ring, steaming-plate pixels, parallel tap-orders, shared-table hearts
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

## Honest gaps (filed to QA #…)
- **CLOSED by #1806:** multiple rooms — one expansion ships: the Spare Room kit
  grows a wing on the east lawn (floor/walls/door/windows, connectivity-guarded,
  one per lot). Deeper multi-room building (choose placement, second wing, rooms
  with purpose) remains the open tail of this old line.
- **CLOSED by #1814 (QA pass, partial):** the wing glows at night and the
  residents react to the build. #2076 taught the bond law on the attract
  marquee (the bonds line of that list). #2135's pass closed chat speech
  bubbles, the cooling log lines and the C/X marquee + reach-ring tell.
  Still open: wing-themed furniture, and choosing WHICH two share the ring.
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
adoptable child (see Kids (#2203)).
- Visitors are Fern and Ivy (#2143); pets landed (#2197, Miso — and #2200 gave
  her a mood row on the panel and neighbours who greet her); kids landed
  (#2203, Pip); **CLOSED by #2222:** the buy catalog got its category shelves
  (HOME / FUN / DECOR / SPECIAL) — see §Catalog shelves below.
- **CLOSED by #2227:** no skippable-speed control — the clock dial ships (pause /
  normal / fast / fastest: digits `1`-`4` outside buy mode, `,`/`.` cycle, the
  panel pips are tappable — see §Speed dial).
- Day/night is cosmetic + decay only — the paper route (#2238, §Paper route
  below) is its first hour-scheduled citizen and the meal bells (#2244,
  §Meal bells below) its next; nothing else on the lot keeps hours beyond
  work, Ivy's rounds and the morning news (garbage day… stays open).
- Needs panel shows both residents; no per-object queue display like the original.
