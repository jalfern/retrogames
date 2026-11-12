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
- Contentment: +1/+2 per satisfied need (2 = everyone healthy), +1 chat, +3
  payday, +1 per happy ambience hour. 80 grants the wish.
- Autonomy (needs self-service, clocking in) runs only in `demo` mode — attract
  and the harness. A player who does nothing watches, and then buries.

- Feel (#1823): walkers pay a `step` event per footfall (~18 px) carrying the
  ground underfoot (`groundOf`), so planks creak, gravel crackles and lawn
  muffles; every refused `place` emits `refuse` at the offending cell and the
  shell flashes it red. View-only — the sim rules under placement are untouched.

## Verify
```bash
npm run peoplecheck          # 185 gates: boot, rules, spare-room wing (#1806), bonds ladder (#1817), move-in reactions + night glow (#1814), walk-surface footfalls + refusal flash (#1823), spats/cold-war/make-up (#2070), sprite tell + loud fade (#2076), court commands — coo/affection/insult + cooldown economy (#2131), winnable seeds, determinism
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
# (172/13) and nothing else; restore. (All proven on this branch: 157/5 → 162/0,
# and the COURT section's reach mutant 172/13 → 185/0.)
npm run dev   # another terminal
npm run contractcheck        # includes homebody (CONTRACT_ONLY=homebody for just this)
DEV_PORT=5174 npm run homebodydrive   # real Chrome: start, order, build, die, restart + live storm-puff/heart pixels + real C/X court keys with pink affection pixels and the far-apart Space doctrine
```
Drive it: tap objects to order the active resident; G switches residents; B
opens buy mode (time stops); 1-9 pick cards; stick/arrows walk, A uses.

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

## Honest gaps (filed to QA #…)
- **CLOSED by #1806:** multiple rooms — one expansion ships: the Spare Room kit
  grows a wing on the east lawn (floor/walls/door/windows, connectivity-guarded,
  one per lot). Deeper multi-room building (choose placement, second wing, rooms
  with purpose) remains the open tail of this old line.
- **CLOSED by #1814 (QA pass, partial):** the wing glows at night and the
  residents react to the build. #2076 taught the bond law on the attract
  marquee (the bonds line of that list). Still open from that pass: catalog
  thumbnails per item, wing-themed furniture, cooling log lines, chat speech
  bubbles.
- **CLOSED by #1823 (QA pass):** walk-surface step timbre (plank/gravel/lawn)
  and the red ghost-cell flash on refused placements.
- **PARTIAL by #1817 + #2070 + #2131:** bonds climb the chat loop, unlock a topic/
  linger/return/toast ladder, and can now break and mend — spats, cold war
  and make-ups shipped. Player-ordered romance landed too (#2131): `C` says the
  kind thing to whoever is within arm's reach (and Space/A rides the compliment
  where no object is near), a FAMILY-tier household compliment deepens into
  affection (double, hearts), and `X` hurls an insult — the bond falls and the
  grudge sets, with the #2070 human exit still the only way back. Relationships
  beyond the household+Fern triangle (second visitor, kids, pets) and insult on
  touch remain the open tail of this line.
- Visitors are Fern only; no kids/pets; single store catalog.
- No skippable-speed control for the player; day/night is cosmetic + decay only.
- Needs panel shows both residents; no per-object queue display like the original.
