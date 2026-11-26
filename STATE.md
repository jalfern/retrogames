# STATE — forge board snapshot (slot a, 2026-11-26 — PONG's terminal reaches the phone)

## This session — TARGET refused, ladder thin, shipped anyway
- TARGET #3528 (DEFENDER terrain look-ahead) REFUSED at claim — slot b held it
  fresh (3 min). Normal ladder: steer 0 · `next` #1712 waiting-jon (skipped) ·
  game-queue empty · feedback all building-qa/waiting-jon + live QA MASTER →
  flagship stage spent → never-dry.
- `idle-kick` answered `KICK PONG 0 weak`. Phantom-check held the line: gap 0
  (seed-25 forced loss) names its own fix (drop paddle scatter) but the README
  declined it twice — regenerating the #1473 seedpins + #3502 NORMAL bit-trace.
  jonq ask REFUSED (#2176: calibration-class is taken, not asked) → decided on
  the ladder: shipped the oldest ACTIONABLE gap, filed the scatter re-baseline
  as **game-queue #3532** (slot b claimed it within the hour — the ladder works).
- **SHIPPED (#3529 → PR #3534 → `238ff7b`): PONG touch quit.** QUIT chip on
  the #2324 thirdAction rail (Excitebike's EXIT chip precedent), rendered ONLY
  during play; tap fires the existing Escape terminal verbatim → honest MATCH
  OVER card → tap restarts at zeroes. Phones could not reach the terminal at all
  before (quit-only-keyboard, reload was the only escape). `sim.js` untouched —
  every seedpin verbatim.
- Found + fixed a pre-existing flake en route: pongdrive leg 1 opened UNPINNED
  — the first-hit wait faced a random serve + paddle scatter and starved (two
  luck reds). Pinned per the #1473 drive law; 3x green.

## Proof
- pongdrive **26/26** (was 19; leg 6 = 7 real-touch gates: attract-no-chip /
  tap-start / chip-present / tap-quit-honest(done+seed) / chip-retires /
  tap-restart-zeroed / chip-returns) + NEW `pongdrive --mutant` **3/3 die**
  (never-rendered, attract-flip, dead-key; tree clean before/after).
- pongcheck **68/68** verbatim · eslint + lint:mario/fps/ai + build green ·
  prod verified by content marker (bundle `index-Cr-cc-4M.js` carries
  "QUIT chip on the pad").

## BOARD facts at close (~15:5xZ)
- game-queue = 0 (#3532 claimed `building` by slot b after its DEFENDER ship —
  #3531/#3533 arrived mid-session). building-qa = #3535 (DIG DUG art, mini).
- feedback = #3536 (my PONG polish pass) + #3533 + #3524 + #3244 + #2971.
- Rule-4: slot a SHIPPED game code (#3534). No STALLED. No new jonq questions
  (the one candidate was refused as #2176-class — noted here, not re-asked).

## PLAYABLE on main right now
- `/retrogames/pong` — NEW: QUIT chip on the pad; phones can end a match.
  Plus EASY/NORMAL/HARD/2P, WATCH driver, honest quit card.
- `/retrogames/defender` — slot b's terrain wall-veto (#3531): holdout terrain
  deaths closed without widening the horizon.
- `/retrogames/invaders` — the 55-wall wave laws (earlier today).
- Plus prior shelf (adventure roam, rogue flee, grind-city, pinball, skyward,
  tidal-rush, ssx, comet-drift pair, marble pair, galaga bee, mario-kart,
  ice-climber, pacman, mario, minesweeper/garden-guard/homebody, TIDY BOT,
  STARRY NIGHT, TOP SOLDIERS, DOUBLE DRAGON, RACCOON HEIST, spy-hunter, iron
  keep, missile, pucks, mines, zork, ultima, king's quest, Joust, Q*bert,
  forge board).

## Open questions (links only — #605)
- #3335 — QA: music-bus low-pass in AudioController (AWAITING, deadline Nov 27;
  gates PINBALL tilt-muffle — do NOT implement until answer).
- #3516 — Arkanoid art pass: one more texture rung, or done? (AWAITING).
- #3054 — native TestFlight ports have no recorder/upload (AWAITING).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).

## Slot state at handoff
- Slot-a dev server :5173 stopped with scripts/devstop.sh at close.
- Worktree ~/Dev/retrogames-forge-pong-touch-quit detached at origin/main after
  merge — next session may `git worktree remove` it. Main checkout stays
  detached at origin/main, never main-checked-out.
- `#3532` carries the full scatter re-baseline scope (physics + pin-regen +
  mutant anchors move with the code) — its claimer needs no re-derivation.

## Next claims (for whoever is free)
1. Ladder likely thin again: never-dry expected — run `idle-kick` FRESH and
   phantom-check the named index against READMEs + issues closed SINCE the last
   snapshot (today's class: #3528 held-fresh refusal, PONG gap 0 self-declining,
   jonq refusing its own question — trust live `gh issue list`, never a prior
   STATE).
2. `pongdrive --mutant` is now the template for browser-only gates: plant →
   child drive must die → pull (tree clean at start, mutateguard-checked).
