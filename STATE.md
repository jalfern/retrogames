# STATE — forge board snapshot (slot a, 2026-11-25 — GRIND CITY GETS A SECOND LINE)

## This session — one ship, landed
- Warden target **#3232 claim REFUSED** (slot b live on it, checkpoint 2 min
  old) — ladder honored. Queue empty, QA MASTER live (no feedback borrow),
  `idle-kick` → `KICK GRIND CITY 0 weak` (weakestStage score 6 = 5 unowned
  README gaps + #3233 naming it). Gap 0 (replay options) re-owned to #3233
  under the when-unsure rule (its body repeats the gap modulo punctuation) —
  stage took gap 1: **"One park, one line."** Filed + claimed **#3246**.
- **#3246 DONE: GRIND CITY second line** (`eb7a605`, PR #3251).
  - **Roof deck**: trench landing → south quarterpipe at speed → crest onto a
    2.5 m deck along the wall top, coping rail on the edge, long east ramp
    back to plaza. Wall fades into deck with complementary curves — crest
    height constant, physics and mesh still share `parkHeight`. Honest gate:
    ~8 m/s crests pumping, 6 m/s stalls.
  - **14 gems +100** (4 roof / 6 secret hoard / 4 far corners), GEM RUN
    +1500 once; **secret bowl** east of the plaza, OFF THE MAP +250 once.
    Win law untouched — autopilot still wins at 18910/seed, replay hashes
    bit-identical to pre-change main.
  - Proof: grindcheck **71 green + 5/5 mutants** (new `gems`); honest physics
    legs incl. "optional-by-design" (bot takes zero gems all seeds).
    gcdrive **14/14 DRIVE GREEN** on :5173. Screenshots eyeballed (roof run,
    secret bowl, HUD gem line). Lint x3 + build green.
  - Prod verified: `GrindCity-7W7d4NNv.js` carries `GEM RUN`.
    Play: `/retrogames/grind-city`. #3246 shipped + closed.
- Step 8b: polish tail **#3233** already existed — commented (not duplicated)
  with what shipped and the concrete remaining asks (wall chevron selling the
  climb, gem sparkle/burst, ROOF GRIND callout, attract roof line).

## Harness lessons (worth one line each)
- **prod-poll needs `curl -L`** — jalfern.com answers 308 and the previous
  session's LC_ALL=C lesson still left the loop silent for a round; an empty
  probe is still a broken probe (rule 8): echo something every poll.
- `ownsGap`'s 40-char handle misses punctuation variants (`auto-only.` vs
  `auto-only:`) — verify the kick's gap index against issue bodies by hand
  before building; when unsure the gap is QA's, take the next one.

## PLAYABLE on main right now
- `/retrogames/grind-city` **roof line + gems + secret bowl** (#3251).
- `/retrogames/pinball` **row of cabinets + CABINET TWO EMBER RIDER** (#3239,
  slot b) + kickback (#3255); `/retrogames/tidal-rush` online rooms + room
  podium/rematch (#3227/#3253), pinball ball-to-ball, skyward thunderpass,
  r-type, ice-climber, marble-rush (trick hop #3243), comet-drift pair,
  grind-city cams, stomptown, short-order-shout, ssx, marble-madness, pacman,
  mario, minesweeper/garden-guard/homebody, TIDY BOT, STARRY NIGHT, TOP
  SOLDIERS, DOUBLE DRAGON, RACCOON HEIST, spy-hunter, iron keep, galaga,
  missile, pucks, mines, zork, ultima, king's quest, Joust, Q*bert, forge
  board.

## Board watch (facts, not questions)
- `game-queue` EMPTY; #1712 (`next`) is `waiting-jon` — skip. Next builder
  claim: live `idle-kick` now answers `KICK PINBALL 0 weak` — that's the
  never-dry stage for whoever takes it.
- Nightly: main-ok green at handoff. Today's merges incl. #3227 #3239 #3251
  #3253 #3254 #3255.

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload (lane:qa, AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions filed this session.

## Slot state at handoff
- Slot a: dev server stopped (`scripts/devstop.sh`, :5173 free). Worktree
  `~/Dev/retrogames-forge-grindcity-line2` removed clean after merge.
- Main checkout detached at origin/main; this STATE.md ships via its own
  docs/state PR — game code merged this session, so the commit-to-main path
  is earned.
- Time-box: ~75 min of 3 h.
