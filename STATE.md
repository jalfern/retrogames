# STATE — forge board snapshot (slot b, 2026-11-25 — THE PLANE ANSWERS THE RUNWAY)

## This session — one ship, landed
- Warden TARGET **#3290** REFUSED at claim (slot a held it live, newest comment
  9 min old — Pinball smith polish, unmerged branch `forge/pinball-smith`).
  Normal ladder: no steer, `next` #1712 waiting-jon, `game-queue` empty, QA
  MASTER live → no feedback borrow → flagship stage spent → NEVER-DRY
  `KICK SKYWARD 0 weak` (re-run LIVE at claim). Gap 0's actionable half:
  "the plane/belt still can't be landed" — #3310 item 1 explicitly keeps it
  for the builder. Belt stays in the gap; the AIRPLANE is the Pilotwings
  landing-test craft.
- Filed + claimed **#3319**, shipped **`a854fd3`** (PR #3327): the plane
  catches the runway. Pure law `planeTouch`: free flight, on-strip,
  `vy>−2.2 && vy<0.5 && speed<34.5` → wheels-down; zone table + crab-scuff
  shared with the glider (SHORT 150 → FULL STRIP 700). Ceiling deliberately
  below pump cruise (38): scrub-with-the-stick IS the skill. Rollout rides
  deck, friction, heading locked; **wheels-abort** ≥16 m/s with 1.5 s
  departure grace (found: old crash law splatted its own go-around — any
  climbing hull in the floor+1.4 window died); coast <12 → ground crew, no
  crash counted. ✈ WHEELS badge banks best landing — licence math core-three
  untouched (STORM WINGS precedent), hash inputs unchanged.
- Proof: skywardcheck **118/118** (+14 pins) + mutants **36/36** (6 new);
  skywardplay **PASSED** live on :5178 (deck catch ✈300, `RUNWAY MIDDLE +300`
  banner, touch-and-go climbs clear keeping the badge, zero console errors);
  contractcheck 857/857; eslint + 3 scoped gates + build green.
- Prod verified: served `Skyward-DsZq1QKb.js` carries WHEELS UP / GROUND CREW
  / SCRUB SPEED. #3319 shipped+closed. **QA tail filed: #3331** (go-around
  law, rollout look, phone widths incl. 5-chip line, crab tell, farm taste).

## Harness lessons (worth one line each)
- **A teleport into a low window during respawnT falls to the old crash law** —
  the catch guard skips while respawnT>0 but crash doesn't; live legs must
  wait out the apron hand-off (~0.7 s) after `recycle()` before teleports.
- Preset `vy` on a hull is a lie past one tick: physics recomputes
  `vy = speed·sin(pitch)` — probe descents with pitch (`asin(vy/speed)`),
  not vy assignment (my first steep-crash probe was invalid until fixed).
- A climb needs a landing-law ceiling too: without `vy < 0.5` the release
  tick of a touch-and-go re-caught itself → land/wheels/land loop.
- `replace()` mutant anchors must stay unique when a new law reuses an idiom:
  the strip-align anchor still hits stripScore first because planeTouch lives
  below it — order matters for mutant anchors.

## PLAYABLE on main right now
- `/retrogames/skyward` **WHEELS** plane runway landings (#3327) + second
  strip (#3306) + engine bed (#3299) + living storm; `/retrogames/pinball`
  SOLO bed (#3308) + TABLE SMITH + tilt-nudge; `/retrogames/grind-city`
  rail grabs + coping stalls + live manual (#3312); `/retrogames/tidal-rush`
  charged-trick economy (#3318) + tricks + rooms; mario-kart (tilt),
  ice-climber, marble-rush (tilt), comet-drift pair (tilt), ssx (tilt),
  marble-madness, pacman, mario, minesweeper/garden-guard/homebody, TIDY BOT,
  STARRY NIGHT, TOP SOLDIERS, DOUBLE DRAGON, RACCOON HEIST, spy-hunter,
  iron keep, galaga, missile, pucks, mines, zork, ultima, king's quest,
  Joust, Q*bert, forge board.

## Board watch (facts, not questions)
- `game-queue` EMPTY; `next` #1712 waiting-jon (not a work item). Slot a's
  #3290 (pinball smith items 1–4, branch `forge/pinball-smith`) was live and
  unmerged at my handoff — resume/check it before kicking Pinball again.
- Next builder claim: run `idle-kick` LIVE — at my session end it answered
  `KICK SKYWARD 0 weak`; gap 0's remainder is now **belt landing** (the
  plane's half shipped; the belt settles on terrain but scores nothing).
- QA holds at handoff: #3233 grind-city tail 2; new #3331 skyward wheels tail
  (feedback); #3310, #3300, #3297 tails open; #3281 shipped via #3318.
- Merges today incl. #3318 (tidal) and my #3327; main-ok green at claim and
  merge; nightly success at merge time.

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload (lane:qa, AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions filed this session.

## Slot state at handoff
- Slot b: dev :5178 stopped via scripts/devstop.sh; worktree
  `~/Dev/retrogames-forge-skyward-wheels` detached clean at origin/main by
  mergeclean — remove when convenient.
- Game merged ⇒ this STATE.md ships via its own docs/state PR; parked at
  /tmp/forge/STATE.b.parked.md via statepark.
- Time-box: ~1 h 40 m of 3 h.
