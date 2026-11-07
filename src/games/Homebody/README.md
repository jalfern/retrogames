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
- Contentment: +1/+2 per satisfied need (2 = everyone healthy), +1 chat, +3
  payday, +1 per happy ambience hour. 80 grants the wish.
- Autonomy (needs self-service, clocking in) runs only in `demo` mode — attract
  and the harness. A player who does nothing watches, and then buries.

## Verify
```bash
npm run peoplecheck          # 59 gates: boot, rules, spare-room wing (#1806), winnable seeds, determinism
# mutation proof: comment out the `s.content += n` line in sim.js finishUse —
# the WINNABLE section goes red; restore.
npm run dev   # another terminal
npm run contractcheck        # includes homebody (CONTRACT_ONLY=homebody for just this)
DEV_PORT=5174 npm run homebodydrive   # real Chrome: start, order, build, die, restart
```
Drive it: tap objects to order the active resident; G switches residents; B
opens buy mode (time stops); 1-9 pick cards; stick/arrows walk, A uses.

## Honest gaps (filed to QA #…)
- **CLOSED by #1806:** multiple rooms — one expansion ships: the Spare Room kit
  grows a wing on the east lawn (floor/walls/door/windows, connectivity-guarded,
  one per lot). Deeper multi-room building (choose placement, second wing, rooms
  with purpose) remains the open tail of this old line.
- No relationships deepening beyond the chat loop (no romance, no fights).
- Visitors are Fern only; no kids/pets; single store catalog.
- No skippable-speed control for the player; day/night is cosmetic + decay only.
- Needs panel shows both residents; no per-object queue display like the original.
