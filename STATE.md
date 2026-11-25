# STATE — forge board snapshot (slot b, 2026-11-25 — PINBALL ROW OF CABINETS LIVE)

## This session — one ship, landed
- **#3232 PINBALL table-select + CABINET TWO "EMBER RIDER" SHIPPED** (PR #3239,
  merged `d078d60`). Warden target: the claim script awarded it to b though slot
  a was minutes from pushing its next checkpoint — latest claim wins (#878), so
  this session **resumed slot a's branch instead of rebuilding**: rebased the 6
  commits onto main tip (tidal/marble/rogue merges), zero conflicts.
- Row-of-cabinets attract (arrows/tap pick, SPACE starts, quick-retry persists
  cabinet); EMBER RIDER = x-mirror build, left launch, hotter economy
  (spinner 15, MULTIBALL 1200, 4 s save, faster tilt), oxblood/gold/teal.
- **The prior checkpoint's "wirefeed mutant caught" claim was unproven** —
  pinballcheck had zero plant code. Fixed honestly: 4 anchored mutants
  (seed/economy/mirror/search) — ALL CAUGHT 4/4 — plus new ball-search
  threshold pins and seed-is-load-bearing pins (stateHash embeds gs.seed, so
  hash divergence alone was toothless; now raw physics lines under scripted
  nudges). pinballcheck **139/139** on the merged tree.
- pinballplay **26/26** live Chrome :5178 (both cabinets, zero page errors; two
  load-timing flakes on retry-prone pixel rigs passed unchanged on rerun —
  advisory per rule 3). eslint + 3 lint gates + build green.
- Prod verified: `Pinball-4NfhZihb.js` carries the `ember-rider` marker.
  #3232 closed shipped. Polish observations handed onto existing QA tail
  **#3237** (no duplicate issue filed).

## Harness lessons (worth one line each)
- **jalfern.com 308-redirects to www.** — a prod probe without `curl -L` sees a
  "Redirecting..." body and hashes nothing for 10 min. Pair with `LC_ALL=C`.
- **Game chunks are code-split** — per-game markers live in `Pinball-<hash>.js`
  (named inside `index-<hash>.js`), never in the index bundle itself.
- **A check that cannot plant cannot fail**: checkpoint claims of mutant proofs
  must be backed by real plant code; pinballcheck now has the loop.
- **stateHash embedding gs.seed makes "different seeds diverge" vacuous** —
  prove RNG ownership on raw state, not the hash.

## PLAYABLE on main right now
- `/retrogames/pinball` **row of cabinets** (CABINET ONE + EMBER RIDER),
  `/retrogames/tidal-rush` **ONLINE** (`?net=host` / `?net=join&room=CODE`,
  3 seats, autopilot fills), pinball ball-to-ball (#3219) + rung 3, skyward
  thunderpass, r-type, ice-climber, marble-rush (ten shelves + tilt + trick
  hop), comet-drift pair (tilt), grind-city (fisheye cam + run replay),
  stomptown, short-order-shout, ssx, marble-madness, pacman, mario,
  minesweeper/garden-guard/homebody, TIDY BOT, STARRY NIGHT, TOP SOLDIERS,
  DOUBLE DRAGON, RACCOON HEIST, spy-hunter, iron keep, galaga, missile, pucks,
  mines, zork, ultima, king's quest, Joust, Q*bert, forge board.

## Board watch (facts, not questions)
- `game-queue` EMPTY; only `next` item #1712 is `waiting-jon`+`lane:research`
  (not a work item, #605). Next builder claim = flagship/never-dry derivation
  via `scripts/lib/idle.mjs` (live — don't trust memory).
- Slot a held #3232 when b's claim won liveness — its branch shipped as this
  PR, so nothing of slot a's work was lost. If a slot-a session wakes inside
  #3232, the claim flip comment on the issue explains it.
- Nightly: main-ok green at session start and at merge.

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload (lane:qa, AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).

## Slot / board state at handoff
- Slot b: no worktree left standing (mergeclean swept `retrogames-forge-pinball-select`).
  Dev :5178 stopped via scripts/devstop.sh.
- Main checkout detached at origin/main (`d078d60`); STATE.md committed via docs
  PR (game merged this session → rule #9 satisfied).
- Time-box: ~95 min of 3 h — resume + one honest harness fix was cheap.
