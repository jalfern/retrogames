# STATE — forge board snapshot (slot b, 2026-11-22 — shipped)

## This session shipped
- **FloorBoss joins PLAICRAFT S2** (#1712 → PR #2954 → main `d7ff731`,
  prod-verified: Vercel deployment on the merge ref, `/retrogames/floor-boss`
  200). The adapter existed since #2811 but the game had no consent gate /
  auto-capture, and canvas taps mutated the sim OFF the pad stream — a
  friend's floor-boss take could not land, and if it had, could not replay.
  Now: consent gate before seed-birth; every play tick banks what `step`
  consumed; taps apply at click time (feel unchanged) and bank on the pad's
  `pointer{x,y,down}` channel (0..1 canvas units); replay re-applies via new
  shared `src/games/FloorBoss/taps.js` (ONE geometry, shell + Node). Seat
  stamps honest: any WATCH use → whole take `model` (#2058 law); duel seat
  M `model`; `rules.duel`; `humanSeats:false` (Rally precedent). Contract
  `reset(seed, players)` rebuilds duel floors. 7th trainable game.
  Suites: datasetcheck 66/66 (3 new tap pins) + mutant 9 RED-BY-DESIGN
  (tap-skip) 66/75 · floorbosscheck green · floorbossplay 96/96 (NO THANKS
  defuse #2091) · plaicraftcheck · lint gates · build — all green.

## PLAYABLE on main right now (prod-verified; private until Jon promotes #2846)
- `/retrogames/floor-boss` — now consent-records human takes (this session).
- `/retrogames/r-type` — #2938 QA pass merged this morning (#2950 `594eb88`).
- `/retrogames/double-dragon` — carrier rotations + duel steel (unchanged).

## Board at close
- `building` = **#1712 stays open ON PURPOSE** (big-build rule 4: S2 closes
  only when the store lines close). Store truth: 18 takes, gamesCovered 1/2
  (gauntlet only), holdout `need-2-players`. The two open acceptance lines
  are HUMAN DATA, not code — ask filed as **#2953** (friend-takes; default
  "keep widening trainable adapters (Contra next)").
- `game-queue` = empty. QA holds nothing lane-relevant (check QA board for
  #2938 aftermath before borrowing feedback).

## Open questions for Jon (links only, #605)
- #2953 (this session) — invite flow vs Jon collects friend takes; default
  widen adapters.
- #2846 — promote CONTRA / R-TYPE / DOUBLE DRAGON to public? (default keep
  private, due 11-23).
- #2908, #2930 (QA lane) — DD seat laws (due 11-24).

## Harness notes (carry-overs)
- **rec/v1 pointer channel is 0..1 CANVAS-NORMALIZED** (onePad #420) — bank
  `px/W, py/H`; pixels through `normalizePad` clamp to 1 and silently destroy
  coordinates. Floor-boss taps: apply-at-click, bank-on-next-tick; replay
  applies before that step — state matches at every checkpoint. Two taps in
  one frame bank on consecutive ticks → such takes refuse honestly (humans
  can't, bots can; documented in the README).
- `stateHash(gs)` does NOT include `tool`/`cursor`/`sel` — only world state.
  Synthetic floor-boss takes must hash-visible-tap (AUTO chip or hire/cell
  effects) or tamper-units pass vacuously.
- Consent gate + scripted harnesses: seed DECLINED consent pre-script
  (watchcheck's #2115 `DECLINED_CONSENT`) or poll-click NO THANKS
  (ddragoncheck pattern, copied into floorbossplay). New human-start wiring
  in a game = audit every script that presses real keys on its attract.
- Vite first-load re-optimize still drops ~3 floorbossplay legs once after a
  fresh node_modules clone — retry once before believing them (reconfirmed).
- Worktrees' node_modules may be emptied by cleanup; dd-weapons' lockfile
  matched today → `cp -cR` APFS-clone in seconds (verify lockfile sha first).

## Slots / ops
- Slot b port 5178: dev server STOPPED with `scripts/devstop.sh` at close;
  other lanes' ports untouched.
- Worktree left: `~/Dev/retrogames-forge-plaicraft-s2-export` (branch merged;
  re-detached to origin/main; removable).
- Main checkout: detached `origin/main`; STATE.md committed this session
  (game merged) and parked via `statepark.mjs park b`.

## Next lane starting here
- Ladder first. If #1712 is re-kicked: the ONLY honest progress is store
  data (friend takes) — check `plaicraft:outbox`/admin list for new takes
  before writing code; if #2953 is answered "widen adapters", Contra is the
  next trainable game (co-op, phone-pad native; needs featurizer + adapter +
  consent wiring — floor-boss's #2954 shape is the template).
- If ladder, feedback and flagship stages all dry AND live `idle-kick.mjs`
  dry: STOP is legal; the shelf gap today is human takes, not adapters.
