# STATE — forge board snapshot (slot a, 2026-11-24 — MARIO KART LEANS IN)

## This session — one ship, landed
- Warden target **#3131 claimed clean** (QA-tail feedback; claim script won the
  liveness namespace — QA MASTER sessions on mini/studio were live but held no
  claim on it). Tilt rollout tail: the ladder's blocker #3107 had already
  landed (MARBLE RUSH tilt via #3129), so the buildable remainder was
  "tilt on the ladder's second title + shouldUseStick consistency".
- **#3131 DONE: MARIO KART gets TILT** (`7543bfa`, PR #3260).
  - Supports-only grant `['stick','tilt','full']` — derived stick default
    untouched (#3118 law). Honest by construction: the kart's
    `currentPad('stick')` → `steerPedals` path is exactly what the tilt rail
    writes — roll steers, lean forward = gas, lean back = brake (same sign law
    as COMET DRIFT/SSX); DRIFT + ITEM stay chips.
  - `__kartTest.resetSim/stepTicks` DEV hooks: deterministic sim steps through
    the game's own tickWorld, hashed by `stateHash` (sim has zero RNG).
  - padtypecheck **126/126** (+16 pins incl. registry-wide tilt⇄stick
    consistency sweep — every tilt title stick-based + analog: the
    shouldUseStick ask). Mutants 2/2 caught (grant revert; tilt-on-pacman).
  - padtypeplay **62/62** on :5173 — hash divergence, forward-lean throttles
    (v 0→2.93), steer sign law ±0.1705 (= steerResponse(8°) at G=0.6 — my
    first 0.2 threshold was wrong, not the rail), RE-CENTER replays the
    neutral hash byte-for-byte.
  - Prod verified: `index-DQVrfE7g.js` carries the lean-controls marker.
    Play: `/retrogames/mario-kart`. #3131 shipped + closed (PR `Closes`).
- Real-iPhone `ENABLE TILT` tap stays owed — folded into #3054 (TestFlight
  hardware question) with the tilt-shelf list; Chrome proves synthetic only.

## Harness lessons (worth one line each)
- **BSD sed silently no-matched a plant inside the games.js worktree** (mixed
  UTF-8 registry lines, exit 0, file unchanged) — a mutant that never lands
  proves nothing; verify plants with the edit tool + a grep before trusting a
  green run.
- padtypecheck's `blockOf` text-scan idiom extends well: a one-level brace
  regex over games.js pins whole-shelf invariants (tilt⇒stick+analog) in <1s.

## PLAYABLE on main right now
- `/retrogames/mario-kart` **TILT** (#3260), `/retrogames/grind-city` roof
  line + gems + secret bowl (#3251), `/retrogames/pinball` cabinets row +
  EMBER RIDER (#3239) + kickback (#3255) + user-selectable art kits
  (?style, #3262 slot b), `/retrogames/tidal-rush` online
  rooms + podium/rematch (#3227/#3253), pinball ball-to-ball, skyward
  thunderpass, r-type, ice-climber, marble-rush (tilt, trick hop),
  comet-drift pair (tilt), ssx (tilt), marble-madness, pacman, mario,
  minesweeper/garden-guard/homebody, TIDY BOT, STARRY NIGHT, TOP SOLDIERS,
  DOUBLE DRAGON, RACCOON HEIST, spy-hunter, iron keep, galaga, missile,
  pucks, mines, zork, ultima, king's quest, Joust, Q*bert, forge board.

## Board watch (facts, not questions)
- `game-queue` EMPTY; only `next` item #1712 is `waiting-jon` — skip.
- Open `feedback` (QA lane's board): #3244 tidal-rush online polish,
  #3237 pinball tail, #3233 grind-city tail 2, #2971 contra (waiting-jon).
- Never-dry derivation at handoff answered `NONE` for slot a (may be the
  30-min throttle) — next builder run `idle-kick` live, don't trust this line.
- Nightly: main-ok green at merge; today's merges incl. #3251 #3253 #3254
  #3255 #3260 #3262 #3263.

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload (lane:qa,
  AWAITING; now also owns the real-iPhone ENABLE TILT tap for the tilt shelf).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions filed this session.

## Slot state at handoff
- Slot a: dev server stopped via `scripts/devstop.sh` (:5173 free). Worktree
  `~/Dev/retrogames-forge-tilt-rollout` removed clean after merge.
- Main checkout detached at origin/main (`7543bfa`); this STATE.md ships via
  its own docs/state PR — game code merged this session, so the commit path
  is earned.
- Time-box: ~90 min of 3 h.
