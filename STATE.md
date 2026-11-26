# STATE — forge board snapshot (slot a, 2026-11-26 — ROGUE gets the 1980 mobility laws)

## This session — TARGET refused, never-dry walked, shipped
- TARGET #3489 (ADVENTURE polish) REFUSED at claim — slot b holds it fresh
  (32 min; their session restarted after the 11:25Z park). Normal ladder:
  steer 0 · `next` #1712 waiting-jon (skipped) · game-queue empty ·
  feedback borrow BLOCKED (QA studio 48272 + QA mini 69954 live) → never-dry.
- `idle-kick` fresh: `KICK ROGUE 0 weak` — matched STATE's prediction;
  index 0 verified against the README (5 unowned gaps; zero open issues name
  ROGUE). Filed **#3509** with the why-weakest line, claimed, built.
- **SHIPPED (#3509 → PR #3513 → `b0be218`): ROGUE monster flee + per-monster
  energy.** Every creature accrues race speed per hero turn (MONSTER_ENERGY=4
  quarters); full threshold buys an action, remainder carries — kestrel/bat/
  centaur/leprechaun/jabberwock ×1.5 double-step, troll/medusa ×0.75 skip a
  turn in four; bumped monster spends its step on the counterbite. Wounded
  (hp ≤ ¼ max, sees hero) flees the farthest DIRS8 step, flees for good,
  cornered fights. Snake law: bites you → flees forever (`bitten`). Zero new
  generation RNG — seed-12345 fixture + all replay laws stand untouched.
- Proof: roguecheck **116/116** (+14 §8 mobility gates; measured clock
  arithmetic 4/6/3 steps per 4 hero turns, flee/boundary/cornered/snake/
  bump-skip/hash coverage) + mutant (flee threshold neutered → 2 red,
  restored) · roguedrive **18/18** real Chrome real keys (node scans seeds,
  replays seed-120 route to BYTE-IDENTICAL hash, snake bite-then-flee runs in
  the browser) · watchcheck(rogue) **318/318** · eslint + lint:rogue/mario/
  fps/ai + build green.
- Gotcha learned: **utils/watch.js KeyY owns lowercase `y` in the browser**
  (code-based, shift-proof) — games' `case 'y'` MOVE arms are dead there;
  NW drives on numpad 7 (README already said so; the drive route must too).

## BOARD facts at close
- game-queue = 0 · building = #3489 (slot b, resumed session — draft PR #3505
  on `forge/adventure-polish`; their WIP blocker: adaptive whiteKey fetch
  stalls ~6/10 seeds in the Red Maze) · building-qa = #3497 · feedback =
  NEW #3514 (ROGUE polish pass) + #3506 (PONG) + #3497 + #3244 + #2971.
- Rule-4: slot a SHIPPED game code this session (#3513). No STALLED.
- #3509 closed + `shipped` + live-URL comment. #3514 filed for QA.
- Idle-kick phantom class still live (README narrative bullets as gaps):
  ADVENTURE #3489 owns its parseGaps fix; DEFENDER shows the #3456 shape.

## PLAYABLE on main right now
- `/retrogames/rogue` — NEW: wounded monsters run, fast races double-step,
  trolls hesitate, a snake that bit you won't stand and fight.
- `/retrogames/pong` — pick your table: EASY/HARD/2P; NORMAL bit-for-bit
  (#3504). `/retrogames/defender` — stage-4 patrol + fanfare (#3498).
- Plus prior shelf: adventure (19 rooms), grind-city waiting line, pinball
  chain-pin + flanks + smith, skyward rooms, tidal-rush, ssx, comet-drift
  pair, marble pair, galaga bee, mario-kart, ice-climber, pacman, mario,
  minesweeper/garden-guard/homebody, TIDY BOT, STARRY NIGHT, TOP SOLDIERS,
  DOUBLE DRAGON, RACCOON HEIST, spy-hunter, iron keep, missile, pucks,
  mines, zork, ultima, king's quest, Joust, Q*bert, forge board.

## Open questions (links only — #605)
- #3335 — QA: music-bus low-pass in AudioController (AWAITING, qa lane,
  deadline Nov 27; gates PINBALL tilt-muffle — do NOT implement until answer).
- #3054 — native TestFlight ports have no recorder/upload (AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions this session (never-dry pick; no taste calls).

## Slot state at handoff
- Slot-a dev server :5173 stopped with scripts/devstop.sh at close.
- Worktree ~/Dev/retrogames-forge-rogue-flee pruned after this docs PR
  merges; main checkout stays detached at origin/main, never main-checked-out.
- Slot b resumed #3489 during this session (claim refused at 32 min fresh).

## Next claims (for whoever is free)
1. **Resume #3489 via its live session** (slot b is inside it — hands off).
2. Never-dry after this session: ROGUE's remaining README gaps are now
   open-unowned (traps, Amulet win, class rolls, lamp) — expect
   `KICK ROGUE 1 weak` next (traps) or an untouched title; run idle-kick
   fresh and sanity-check the named index against the README before filing
   (phantom class: quote by-design text verbatim so ownership matches).
