# STATE — forge board snapshot (slot a, 2026-11-25 — THE PLAZA REMEMBERS, AND SPEAKS)

## This session — one ship, landed
- Warden TARGET **#3331** REFUSED at claim (slot b live; they merged its first
  batch via #3372 mid-session and closed #3331 shipped — TARGET resolved clean
  without me). Normal ladder: no steer, `next` #1712 waiting-jon, `game-queue`
  empty, feedback existed but **QA MASTER live** → no borrow; flagship stage
  spent (all six READMEs gap-free) → NEVER-DRY: `weakestStage` = **GRIND CITY,
  score 4** (3 unowned README gaps + 1 QA naming; heldDirs skipped
  Skyward/TidalRush/Galaga; Pinball 3, Contra 2). Oldest unowned gap =
  "Saved/shared runs" — the stage #3374's own sim comment pre-announced.
  Filed #3381, claimed, shipped **`e891cb6` (PR #3386)**; shipped+closed.
- **The record outlives the page** — a bankable strict beat
  (`beatsLine`: more score, or equal score with more letters; recency alone
  never fakes a record) writes seed+pad-log+numbers to
  `localStorage['grindcity.best.v1']` and earns `NEW ALL-TIME LINE` on the
  over card. A fresh load hydrates through `validBank` (total validator — junk,
  version drift, hand-edited numbers → cold plaza), re-rides the stored line
  in attract before any key, chip reads `ALL-TIME BEST LINE`. Ties rewrite
  nothing.
- **The link IS the line** (no network, no leaderboard) — pure sim.js codec
  `encodeLine`/`decodeLine`: one URL-safe char per 6-bit pad word + canonical
  base36 `seed.score.ticks.body`; total both ends; caps 7500 ticks / 8192
  chars. `S` or the replay chip copies `…grind-city?line=<code>` with an
  honest flash (`LINE COPIED — SEND IT` / `CLIPBOARD BLOCKED` / `LINE TOO
  LONG`). `?line=` rides the guest once behind `SHARED LINE · {pts} PTS`,
  hands back to the host's bank/bot at the first touch; garbage boots quiet.

## Proof
- grindcheck ALL GREEN (+10 pins: codec round-trip both ways incl. top seed,
  full-clock headroom, total-junk decode, a decoded bot line re-simming
  byte-identical, beatsLine equal-line law, validBank shapes, wiring) —
  **17/17 mutants die** (new `codec`, `beats`, `store`, `sharewire`).
- gcdrive GREEN :5173, **54 legs (+13)** — store write, reload re-rides seed 7
  all-time-marked, chip copy, tie→quiet, strict beat→badge+rewrite, clipboard
  actually copied (real `LINE COPIED`), `?line=` rides at the honest score and
  ends at first touch, junk link clean, zero page errors. Full output kept at
  /tmp/forge/gcdrive-a.log.
- eslint + 3 scoped gates + build green; main-ok green at claim and merge.
- Prod verified: served chunk `GrindCity-DlktUpLE.js` carries `ALL-TIME BEST
  LINE`, `SHARED LINE`, `grindcity.best.v1`.

## Harness lessons (worth one line each)
- **Anchor String.replace mutants uniquely**: `> (prev…` hit betterLine before
  beatsLine — the planted mutant broke the wrong law and a real one survived;
  pin mutants with a closing-brace context and confirm which line it broke.
- jalfern.com answers **308** without `-L`, and chunks live under `/assets/` —
  a poll loop greping empty stderr looks like a slow deploy for 10 minutes.
  Read the loop's silence as a bug in the loop first (rule 8).
- Hydrating a seed+pads bank must re-seed the load-time attract **sim** too —
  populating only the bank vars drives logged pads against a fresh seed and
  quietly loses byte-identity (found while writing the reload leg).
- Backticks in inline `gh --body` execute in the shell (AGENTS' warning,
  re-earned): always `--body-file`; a mangled comment is repairable via
  `gh api -X PATCH issues/comments/<id> -F body=@file`.

## PLAYABLE on main right now
- `/retrogames/grind-city` — near-miss replays, attract loops your best line,
  and now: the record persists across visits (ALL-TIME chip + NEW ALL-TIME
  badge) and `S` copies a `?line=` link that replays it for a friend; plus roof
  line + secret bowl, rail grabs, three cams + free orbit, the A-minor bed.
- `/retrogames/skyward` — wheels-down go-around bounce, clean-roll credit,
  scuff tell (#3331 landed from slot b: PR #3372); `/retrogames/tidal-rush`
  phone HUD + rain rooms; `/retrogames/pinball` SOLO bed + TABLE SMITH;
  galaga bee, mario-kart, ice-climber, marble-rush, comet-drift pair, ssx,
  marble-madness, pacman, mario, minesweeper/garden-guard/homebody, TIDY BOT,
  STARRY NIGHT, TOP SOLDIERS, DOUBLE DRAGON, RACCOON HEIST, spy-hunter, iron
  keep, missile, pucks, mines, zork, ultima, king's quest, Joust, Q*bert,
  forge board.

## Board watch (facts, not questions)
- `building`: #3336 (pinball bed tail 2 — slot b). `building-qa`: #3375
  (skyward wheels-down tail 2). `game-queue` EMPTY; `next` #1712 waiting-jon.
- QA tails open: #3379 (grind replay tail — now carries an addendum with the
  #3381 surfaces: chip tap target, flash vs NEAR MISS badge, badge width 390px,
  ALL-TIME prefix at 320px, phone ?line= feel), #3344/#3362/#3370, #3368,
  #3329, #3290 items 5–7, #3244/#2971 (waiting-jon).
- Merges today incl. #3372/#3376/#3377, **#3386 (mine)**. Never saw red main.
- Next builder claim: ladder starts empty again — doubt rule before filing;
  grind-city's next unowned gap is "The bot's line is fixed" (#1571 rung,
  bigger build) unless the queue refills first.

## Open questions (links only — #605)
- #3335 — QA: music-bus low-pass in AudioController (AWAITING, qa lane).
- #3054 — QA: native TestFlight ports have no recorder/upload (AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions filed this session.

## Slot state at handoff
- Slot a: dev :5173 stopped via scripts/devstop.sh; worktree
  `~/Dev/retrogames-forge-grind-save-share` detached clean at origin/main by
  mergeclean — remove when convenient.
- Game merged this session ⇒ this STATE.md ships via its own docs/state PR;
  parked at /tmp/forge/STATE.a.parked.md via statepark.
- Time-box: ~2 h 15 m of 3 h at ship.
