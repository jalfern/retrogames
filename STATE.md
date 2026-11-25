# STATE — forge board snapshot (slot b, 2026-11-25 — TIDAL RUSH ONLINE IS LIVE)

## This session — one ship, landed
- **#3220 TIDAL RUSH online rooms SHIPPED.** Resumed as a step-1b corpse (prior
  slot-b session built it complete but PR-context CI never attached). Warden target
  #3232 (PINBALL cabinet two) was already held by slot a — never double-claimed;
  the corpse outranks the ladder anyway.
- Resume path: rebased `forge/tidal-rooms` onto tip (past QA #3229 gull/caustics
  merge) — conflicts were unions only (art.js gull exports + net.js import;
  tidalcheck mutant anchors + gate block: gulls AND online kept). STATE.md in the
  branch took main's version. Re-proved on the merged tree: tidalcheck **122/122**
  (106 main + 16 online), `--mutate=wirefeed` red on demand. Fresh push broke the
  CI starvation at once: PR run 45542406472 → `static` pass, PR #3227 merged as
  `53e8e6c` via scripts/forge-merge.sh, worktree swept clean by mergeclean.
- Prod verified: `index-DW94NsW1.js` carries the `net=join` marker; live at
  `/retrogames/tidal-rush`. #3220 closed shipped. Polish pass filed: **#3244**
  (real 3-phone relay run, mid-race spectate, survivable rejoin vs one-way
  takeover, room podium/rematch, desync hash-evidence dump).

## Harness lessons (worth one line each)
- **The "CI starvation" stall cleared with a rebased push** — a stale branch in a
  clogged queue may need a new head SHA, not waiting. Cancel your own useless old
  dispatch runs to free capacity.
- **Prod-poll grep needs `LC_ALL=C`** — bundles carry high-bit UTF-8; zsh grep
  died "character not in range" and reported marker=0 for ~15 min while prod was
  actually live. A probe that cannot fail loudly looks like a stalled deploy
  (rule 8: impossible results are the clue). Consider `-a`/C-locale in the
  shift-verify probes.
- mutateguard did its job: refused a mutant run on a 1-file-dirty tree.

## PLAYABLE on main right now
- `/retrogames/tidal-rush` **ONLINE** (`?net=host` / `?net=join&room=CODE`, 3 seats,
  autopilot fills), pinball ball-to-ball (#3219) + rung 3, skyward thunderpass,
  r-type, ice-climber, marble-rush (ten shelves + tilt), comet-drift pair (tilt),
  grind-city, stomptown, short-order-shout, ssx, marble-madness, pacman, mario,
  minesweeper/garden-guard/homebody, TIDY BOT, STARRY NIGHT, TOP SOLDIERS,
  DOUBLE DRAGON, RACCOON HEIST, spy-hunter, iron keep, galaga, missile, pucks,
  mines, zork, ultima, king's quest, Joust, Q*bert, forge board.

## Board watch (facts, not questions)
- `game-queue` EMPTY; only `next` item #1712 is `waiting-jon` (skip). Next builder
  claim = flagship/never-dry derivation via `scripts/lib/idle.mjs` (live — don't
  trust memory).
- Slot a is inside #3232 (PINBALL table-select + EMBER RIDER) — its branch
  `forge/pinball-select` had a dispatch run in progress earlier; same starvation
  pattern, expect a rebase-push to clear it.
- Nightly: main-ok green at session start; today's merges include #3219 #3229
  #3238 #3240 #3242 #3227(this session).

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload (lane:qa, AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).

## Slot / board state at handoff
- Slot b: NO worktree left standing (mergeclean swept `retrogames-forge-tidal-rooms`;
  nothing half-built). Dev :5178 never started this session (pure resume — no
  browser stage needed; tidalcheck's Node proof + CI covered it).
- Main checkout detached at origin/main (`53e8e6c`); STATE.md committed via docs PR
  (game merged this session → #9 satisfied).
- Time-box: ~65 min — corpse resume was cheap; the fleet rule "resume before
  claim" paid for itself in one session.
