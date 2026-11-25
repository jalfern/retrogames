# STATE — forge board snapshot (slot b, 2026-11-25 — PINBALL GETS A TABLE SMITH)

## This session — one ship, landed
- Warden TARGET **#3284 PINBALL editor** REFUSED at first claim (slot a held
  tidal #3280 live at 08:10Z) — normal ladder: no steer, no actionable `next`
  (#1712 waiting-jon), `game-queue` empty, QA MASTER live → no feedback
  borrow → flagship stage spent → **NEVER-DRY `KICK PINBALL 0 weak`**.
  Gap index 0 was "No table editor (#3103: not yet)" — honest (only open
  pinball issue #3237 doesn't mention an editor). Filed + claimed my own
  POLISH issue **#3284**, shipped it.
- **TABLE SMITH #3284 DONE** (`ad1809b`, PR #3291): Pinball Construction Set
  (Evolution Systems, 1983) build mode on the shared engine — the #3103
  contract playable: `compileTable(def)` compiles a layout onto existing
  primitives (bumpers/slings/bank/magnet on a fixed chassis); `makeGame`
  takes a table object; magnet-`null`/empty-bank became legal table DATA.
  Third attract card: ghost→bench (arrows/A/B pad-first, 8-tool palette, live
  ghost-validity through the SAME law as the compiler), TEST drops one ball
  and homes back to the bench, SAVE persists `{name,def}`
  (`retrogames.pinball.mytable.v1`) and the named cabinet rides the row,
  self-playing in the driven demo, B = redesign, survives reload.
  BALL SEARCH = inherited no-wedge guarantee.
- Proof: pinballcheck **206/206** (+28 smith pins) + mutants **9/9**
  (`smithzone`, `smithload` new); new `pinballsmith` live drive **22/22**
  real-key legs on :5178; `pinballplay` **54/54** after re-cutting the card
  tap coord for the 3-card row; contractcheck 14/14; eslint + 3 scoped gates
  + build green. Prod verified: `Pinball-D9b00c-m.js` markers. #3284 shipped+closed.
- **QA tail filed: #3290** — discoverability badges, ghost-demo placeholder
  lies (demos CABINET ONE until first save), dome-boundary outline, phone
  widths (8×38px strip, 8px card gaps), kits-on-custom, drag idiom, garage
  of cabinets (README honest edge too).

## Harness lessons (worth one line each)
- **3-card row ripple**: `pinballplay`'s hardcoded EMBER tap coord (267,335)
  started landing on the new third card → the whole suite cascaded off one
  coord. Grown UI geometry = grep the suites for pixel constants of the old
  layout the same PR that grows it.
- **Refusal ordering is UX law**: candidate-level caps fired before compile
  zones (MAX 3 masked OUT OF ZONE); zone-check the cursor's own spot FIRST,
  single-sourced (`bumperZoneOk`) so ghost-green == accepted.
- **Owner-wording pin**: #3237 owned README gaps semantically but not by the
  40-char handle match → phantom-scored (kick said score 6, real 3). Fixed by
  aligning #3237's item wording to the README's opening words; `idle-kick`
  now `KICK PINBALL 2 weak` = the honest oldest unowned gap (music bed).
- Warden TARGET claiming a live other-slot issue = REFUSED per liveness; the
  TARGET note says take-the-ladder then — slot a shipped #3280 mid-session.

## PLAYABLE on main right now
- `/retrogames/pinball` **TABLE SMITH** — build/save/play your own cabinet
  (#3291) + driven attract + kits + kickback, tidal-rush grabs (#3285) +
  flips/handstands (#3278) + rooms, skyward drift ring (#3288/#3292),
  grind-city curvature shading (#3286) + roof callout (#3279), pinball EMBER
  RIDER, mario-kart (tilt), ice-climber, marble-rush (tilt, trick hop),
  comet-drift pair (tilt), ssx (tilt), marble-madness, pacman, mario,
  minesweeper/garden-guard/homebody, TIDY BOT, STARRY NIGHT, TOP SOLDIERS,
  DOUBLE DRAGON, RACCOON HEIST, spy-hunter, iron keep, galaga, missile,
  pucks, mines, zork, ultima, king's quest, Joust, Q*bert, forge board.

## Board watch (facts, not questions)
- `game-queue` EMPTY; `next` #1712 waiting-jon (not a work item).
- **Next builder claim: run `idle-kick` LIVE** — expect `KICK PINBALL 2 weak`
  = "The music bed covers MULTIBALL only; single-ball play stays dry" (real,
  unowned). Do NOT redo the smith tail (#3290) or #3237 items 2–5.
- QA holds: #3237 PINBALL tail (feedback+lane:qa — owns phone-HUD/contrast/
  tilt/extras wording), #3290 smith tail, #3281 tidal tricks tail, #3244
  tidal rooms, #3233 grind-city tail. #2971 contra waiting-jon.
- Nightly: main-ok green at session start, at merge, and at handoff.

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload (lane:qa, AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions filed this session.

## Slot state at handoff
- Slot b: dev :5178 stopped via scripts/devstop.sh. Worktree
  `~/Dev/retrogames-forge-pinball-editor` detached clean at origin/main by
  mergeclean; remove it when next convenient.
- Game merged this session ⇒ this STATE.md ships via its own docs/state PR;
  parked at /tmp/forge/STATE.b.parked.md via statepark.
- Time-box: ~1 h 05 min of 3 h.
