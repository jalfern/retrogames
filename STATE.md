# STATE — forge board snapshot (slot a, 2026-11-26 — SPACE INVADERS gets the cabinet's wave laws)

## This session — TARGET refused, never-dry walked, shipped
- TARGET #3489 (ADVENTURE polish) REFUSED at claim — slot b held it fresh
  (38 min). Normal ladder: steer 0 · `next` #1712 waiting-jon (skipped) ·
  game-queue empty · feedback borrow BLOCKED (QA mini + studio live) → never-dry.
- `idle-kick` answered `KICK DEFENDER 0 weak` — DECLINED after sanity check:
  its gap-0 open clause (mid-horizon ridges) shipped via #3497 while I claimed
  (closed 12:40Z, PR #3511 in main); phantom class per prior STATE. Named the
  next-honest pick: SPACE INVADERS (score 4 = 4 unowned README gaps, first of
  the score-4 ties in registry order). Filed + claimed **#3517**.
- **SHIPPED (#3517 → PR #3521 → `9f9f8ee`): arcade wave laws.** 11x5 = 55
  opening at pitch 16 on native 224x256; five-band score 30/20/20/10/10
  (squid/crab/crab/octopus/octopus); growth table 55 → 44 → 33 (wave 2 loses
  the bottom octopus row); **thinning speed law** `marchSpeed = waveSpeed x
  clamp(0.3·sqrt(n0/n), 0.3, 3)` — full fleet crawls, last rows sprint ~2.3x;
  player missile 5 → 8 px/t (cabinet ~3:1 over the 2.5 bombs). Zero new
  entropy; seed determinism untouched.
- Root-cause found en route (rule-8 wins): a 55-wide wall sweeps only ~42px
  between the walls — at the port's flat speed it LANDS ~tick 777, before 55
  one-shot kills fit (≥2000 ticks). The cabinet breaks the same geometry with
  crawl-at-full + fast-missile; so did we (calibration sweep picked the law:
  sqrt-thinning beat harmonic 10/10 vs 0/10; cap 3 kept for feel).
- Proof: invaderscheck **74/74** (+growth +speed-law gates; WITNESS 20/20
  clean wave-1 clears, slowest 1506 pin 1600, worst gap 196 pin 220, bricks
  5854/6560 recalibrated honestly) + **13 mutants red** (incl. flat-march and
  frozen-growth, restored) · NEW `npm run invadersdrive` **8/8** real Chrome
  real keys (start/arrows/fire/landing-death/restart/0 errors) ·
  watchcheck(invaders) **322/322** · eslint + lint:mario/fps/ai + build green.

## BOARD facts at close (14:11Z)
- game-queue = 0 · building = 0 (slot b SHIPPED #3489 during this session —
  roam law landed; follow-up feedback #3524 filed) · building-qa = 0 (QA's
  OUTRUN art pass #3523 shipped as #3526 right at handoff) · feedback =
  #3525 (my SPACE INVADERS polish pass) + #3524 + #3244 + #2971.
- Rule-4: slot a SHIPPED game code this session (#3521). No STALLED.
- #3517 closed + `shipped` + live-URL comment. Live verified by content
  marker (hashes differ between local/Vercel builds — poll the bundle for
  `#9be7ff`, the new octopus band color).

## PLAYABLE on main right now
- `/retrogames/invaders` — NEW: the 55-wall crawls in, four-rows on wave 2,
  three-row sprint from wave 3; banded squid/crab/octopus kills.
- `/retrogames/adventure` — roam dragons (#3489 landed while I shipped).
  `/retrogames/rogue` — wounded monsters flee, races double-step (#3513).
- `/retrogames/pong` — EASY/HARD/2P. `/retrogames/defender` — ridge race
  (#3497) + stage-4 column-dash. Plus prior shelf (grind-city, pinball,
  skyward, tidal-rush, ssx, comet-drift pair, marble pair, galaga bee,
  mario-kart, ice-climber, pacman, mario, minesweeper/garden-guard/homebody,
  TIDY BOT, STARRY NIGHT, TOP SOLDIERS, DOUBLE DRAGON, RACCOON HEIST,
  spy-hunter, iron keep, missile, pucks, mines, zork, ultima, king's quest,
  Joust, Q*bert, forge board).

## Open questions (links only — #605)
- #3335 — QA: music-bus low-pass in AudioController (AWAITING, qa lane,
  deadline Nov 27; gates PINBALL tilt-muffle — do NOT implement until answer).
- #3516 — Arkanoid art pass: one more texture rung, or done? (AWAITING).
- #3054 — native TestFlight ports have no recorder/upload (AWAITING).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions this session (never-dry pick; no taste calls).

## Slot state at handoff
- Slot-a dev server :5173 stopped with scripts/devstop.sh at close.
- Worktree ~/Dev/retrogames-forge-invaders-55 pruned after this docs PR
  merges; main checkout stays detached at origin/main, never main-checked-out.
- GitHub threw a 503 mid-merge-cleanup; forge-merge.sh's mergeclean rode it
  out correctly (server-truth merge, branch deleted, lane re-detached).

## Next claims (for whoever is free)
1. Never-dry expected again: ROGUE (#3514) and PONG (#3506) QA passes CLOSED,
   so ROGUE's traps/Amulet/class-roll/lamp gaps may be open-unowned → likely
   `KICK ROGUE …` or the next score-4 title (ASTEROIDS, DONKEY KONG,
   CENTIPEDE, MISSILE COMMAND tie the pre-#3517 INVADERS score). Run
   idle-kick fresh and sanity-check the named index against the README +
   closed-since issues (phantom class: #3489/#3497 both went stale mid-flight
   today — check `gh issue list` state, not last session's snapshot).
2. `invadersdrive` is now the browser-proof template for one-sim games
   (contract clock `__game.step({},50)` makes landing deaths take seconds).
