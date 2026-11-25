# STATE — forge board snapshot (slot a, 2026-11-24/25 — PINBALL PLAYS ITSELF)

## This session — one ship, landed
- Warden TARGET **#3237** taken clean (no liveness claim; QA-tail item —
  builder ships its stage 1 under the warden-kick, #1258). PR **#3275**
  merged `1045808`; prod `Pinball-C9lazER3.js` marker-verified.
- **PINBALL ATTRACT SHOW-OFF + KIT TAIL** (issue item 1 + the #3259 addendum):
  - Attract is a DRIVEN run: `demoPad`/`demoOver` (pure sim exports) run a
    real `makeGame` through the pinned human line — Node pins MULTIBALL from
    seed 1337 on BOTH cabinets, lock-jackpots first, never empty;
    deterministic re-deal (`0xa11ce + runs*7919`), lamp chase ticks 0..84,
    `ATTRACT_DMD` ad lines per cabinet, demo silent (no audio at the row).
  - `drawTable(gs, L)` = renderer bundle (ctx/flash/trail/parts/rings/shake);
    MAIN wraps live refs via getters → play pixels byte-identical. Attract bg
    + the SELECTED mini-card draw the live demo offscreen canvas.
  - Kits: localStorage memory (`KIT_STORE`; `?style` outranks; stale ids →
    house dress via `kitIndex`), own `dressflip` sound, attract-DMD kit
    announce, results `◆ KIT` line, `NO SUCH KIT` DMD+badge (`styleWarn`),
    third dresses **NOIR**/**GLACIER** (palette-only, parity-pinned).
- Proof: pinballcheck **178/178** (+18 pins) + **ALL MUTANTS CAUGHT 7/7**
  (new `demo`); pinballplay **54/54** (+9 live legs); contractcheck 14/14;
  eslint + 3 scoped gates + build green.
- **#3237 stays OPEN** (`Part of #3275`): left items 2 phone-width HUD audit,
  3 ball-vs-lane-bed contrast, 4 tilt-to-nudge, 5 extras (lock-gate slam,
  plunger power ticks, tilt wobble). Live URL + remaining list on the issue.

## Harness lessons (worth one line each)
- Mutants on a dirty worktree refuse to plant — every rule then reports
  SURVIVES. `commit` before `--mutate`; the 0/7 was a guard-lie, 7/7 the truth.
- The kickback play-leg passed vacuously: kbUsed was already latched upstream,
  so the poll broke on sample zero. Rigs gate on device state (one save per
  ball IS the rule), never wall-clock budget. Fixed in #3275.
- Registry growth ripples through test maths: a third kit changed the B-cycle
  wrap expectation (n%3 ≠ n%2) — grep the suite for kit-count assumptions
  whenever the shelf grows.

## PLAYABLE on main right now
- `/retrogames/pinball` driven attract + kit memory/NOIR/GLACIER (#3275),
  KICKBACK both cabinets (#3255), ball-ball, orbit/magnet/DMD;
  `/retrogames/skyward` living storm cell (#3271) + thunderpass,
  mario-kart TILT (#3260), tidal-rush spectate (#3265) + online rooms/
  podium/rematch (#3227/#3253) + rung-3 chrome (#3254), grind-city roof
  line + gems (#3251) + gem sparkle (#3270), marble-rush tilt + trick-hop
  (#3243), comet-drift pair (tilt), ssx (tilt), marble-madness, pacman,
  mario, minesweeper/garden-guard/homebody, TIDY BOT, STARRY NIGHT,
  TOP SOLDIERS, DOUBLE DRAGON, RACCOON HEIST, spy-hunter, iron keep,
  galaga, missile, pucks, mines, zork, ultima, king's quest, Joust,
  Q*bert, forge board.

## Board watch (facts, not questions)
- `game-queue` empty (my claim cleared it); only `next` item #1712 is
  `waiting-jon` — skip. Next builder claim = idle-kick derivation LIVE at
  claim time (don't trust memory or this line).
- Open `feedback` (QA lane's board): #3237 pinball tail items 2–5 (this
  lane's next stage if re-kicked), #3244 tidal-rush online polish, #3233
  grind-city tail 2, #2971 contra (waiting-jon).
- Merges today incl. #3255 #3262 #3263 #3264 #3265 #3270 #3271 #3273 #3274
  #3275; nightly main-ok green at my merge.

## Open questions (links only — #605)
- #3054 — QA: native TestFlight ports have no recorder/upload (lane:qa,
  AWAITING; also owns the real-iPhone ENABLE TILT tap for the tilt shelf).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions filed this session.

## Slot state at handoff
- Slot a: dev server stopped via `scripts/devstop.sh` (:5173 free). Worktree
  `~/Dev/retrogames-forge-pinball-attract` removed clean after merge.
- Main checkout detached at origin/main; this STATE.md ships via its own
  docs/state PR (#3277) — game code merged this session, commit path earned.
  Slot b's fresher facts (kickback/#3270/spectate chrome) are folded in here,
  nothing evaporated (#1430).
- Time-box: ~2h30m of 3 h.
