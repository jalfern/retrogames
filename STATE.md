# STATE — forge board snapshot (slot a, 2026-11-25 — THE PLAZA REMEMBERS)

## This session — one ship, landed
- Warden TARGET **#3331** (skyward wheels-down tail) was REFUSED at claim:
  slot b held it live (newest liveness 53 min, commits 10 min prior — b is
  mid-build, correct refusal). Normal ladder: no steer, `next` #1712 is
  waiting-jon, `game-queue` empty, feedback either waiting-jon or lane:qa,
  and QA MASTER was live (no borrow). Flagship stage spent → NEVER-DRY.
- Idle-kick answered `KICK TIDAL RUSH 0 weak`, but tidal's only candidate gap
  ("Score HUD sits under the shared chrome pill at ?lite=1") is #3365 item 2
  by another wording (both carved from #3348 item 3) — owned per the doubt
  rule. Full-shelf recompute → **GRIND CITY, score 3** (three unowned README
  gaps, zero QA issues naming it, unheld). Filed #3374, claimed, shipped
  **`f699a24` (PR #3377)**; issue `shipped`+closed. #3376 (#3365 item 2)
  landed from the other lane meanwhile — the doubt call read right.
- Replay tail, all player-visible: **near-miss replays** — pure law
  `replayWorthy(ticks, lettersGot)` (sim.js now owns REPLAY_MIN/MAX): ≥120
  ticks OR ≥1 banked letter earns the replay, so a letters-in, dead-at-1 s
  run watches its line, badged `NEAR MISS — LETTERS COUNT`; letterless short
  runs unchanged. **Attract remembers** — `betterLine` (score → letters →
  newer) folds every run into a session best; a full-window best banks its
  seed+pad-log and attract re-rides it behind the title, wrapping at the log's
  own end; `BEST LINE {pts} · {n}/5` chip, gold `★ GOALS`. No history keeps
  the bot line. Saved/shared runs remains an honest gap (README rewritten).

## Proof
- grindcheck ALL GREEN (+10 pins: window edge, letters-either-side, garbage,
  tie/newer cases, a REAL lettered-under-window sim situation, wiring) —
  **13/13 mutants die** (new `nearmiss`, `bestline`, `bankline`).
- gcdrive GREEN :5173 — near replay n=88 near=true, badge DOM opacity 1,
  bot fallback on short-only history, attract re-rides seed 7 + says BEST
  LINE, loop wraps without stalling, zero page errors. eslint + 3 scoped
  gates + build green; main-ok green at claim and merge.
- Prod verified: chunk `GrindCity-B_BLT9gs.js` carries `NEAR MISS`.

## Harness lessons (worth one line each)
- **A re-sim loop must wrap on its own terms**: how a run ENDED (bail, clock,
  a QA-shortened clock) is not in the pad log, so attract rode seed 7 to tick
  778 before the first live loop exposed it — the wrap keys off log length,
  re-making from the banked seed.
- A replay shorter than a few frames finishes before any drive can observe it:
  near-miss legs need real-time coasting (~90 ticks), not a 2-tick synthetic.
- `skipTo` a screen must check-before-press — an auto-finishing replay had
  already left `replay` when the next Space would have overshoot to attract.
- ownsGap's 40-char opened-word test misses same-defect-different-wording
  (tidal HUD gap vs #3365 item 2) — the doubt rule is the backstop; recompute
  the whole shelf before filing, and label the why-weakest line.
- One full gcdrive run went red once (leg unisolated, cause never reproduced;
  saved log clean on the immediate re-run). Rule-3: rerun once, move on — but
  capture full drive output to a file, not just a tail, or the flake is
  undebuggable after the fact.

## PLAYABLE on main right now
- `/retrogames/grind-city` — near-miss replays badged, attract loops your best
  line with the BEST LINE chip; plus roof line + secret bowl, rail grabs and
  coping stalls, three cams + free orbit cam, the A-minor bed.
- `/retrogames/skyward` — attract vista, painted zones, windsock, rich motor +
  exhaust tell, glider wind-rush (bed tail #3353/#3361, strip tail #3369);
  `/retrogames/tidal-rush` centre HUD flexes at phone widths (#3376), rider
  jump/land moments, rain gameplay + rooms; `/retrogames/pinball` SOLO bed +
  TABLE SMITH; galaga bee; mario-kart, ice-climber, marble-rush, comet-drift
  pair, ssx, marble-madness, pacman, mario, minesweeper/garden-guard/homebody,
  TIDY BOT, STARRY NIGHT, TOP SOLDIERS, DOUBLE DRAGON, RACCOON HEIST,
  spy-hunter, iron keep, missile, pucks, mines, zork, ultima, king's quest,
  Joust, Q*bert, forge board.

## Board watch (facts, not questions)
- `building` at close: **#3331 held by slot b (live)**. `building-qa`: #3359
  (pinball garage). `game-queue` EMPTY. `next` #1712 waiting-jon (not work).
- QA tails open: #3379 (new: grind-city replay-tail pass — badge widths, chip
  legibility, wrap feel, loop sound), #3344/#3362/#3370 (skyward rounds),
  #3336/#3365/#3368 (pinball/tidal), #3329, #3290 items 5–7, #3244/#2971
  (waiting-jon).
- Merges today incl. #3349–#3351, #3353/#3355/#3356/#3361/#3363, #3365→#3376,
  #3367/#3369/#3371/#3373, **#3377 (mine)**. Never saw red main.
- Next builder claim: ladder starts empty again — idle-kick LIVE and apply the
  doubt rule before filing; grind-city's next unowned gap is "The bot's line
  is fixed" (#1571 rung, bigger build) unless the queue refills first.

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload (AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions filed this session.

## Slot state at handoff
- Slot a: dev :5173 stopped via scripts/devstop.sh; worktree
  `~/Dev/retrogames-forge-grind-replay-tail` detached clean at origin/main by
  mergeclean — remove when convenient.
- Game merged this session ⇒ this STATE.md ships via its own docs/state PR;
  parked at /tmp/forge/STATE.a.parked.md via statepark.
- Time-box: ~1 h 30 m of 3 h at ship.
