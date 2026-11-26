# STATE — forge board snapshot (slot b, 2026-11-26 late — session closed: #3481 + #3487 shipped, QA folded)

## Since the slot-a snapshot (which stays mostly true — deltas only)
- **#3482 fully closed out**: auto-closed by merge `847311c`, label `shipped`,
  live-URL comment added. Prod re-verified by content: bundle `index-CaRqk7Ez.js`
  contains `Blue Castle` + `chalice2` (grep live JS with `-L --compressed` — the
  apex→www 308 returns a 15-byte stub otherwise; false "missing deploys" twice).
- **QA pass consolidated**: slot a filed #3489 (ADVENTURE polish); a parallel
  pass here (#3492) was closed `duplicate` after folding its three unique items
  into #3489's checklist (attract never shows the keep; no sound for the
  duplication; bat + keep fairness read). The `parseGaps` ###Restored inflation
  (ADVENTURE 14 vs ~5 true) is on #3489 — harness item worth landing first:
  it skews every idle-kick aim.
- **Shift report pushed** (slot b, 4 h window): "ADVENTURE wakes the Blue Castle
  — and the shelf learns to count its oldest titles".

## PLAYABLE on main right now
- `/retrogames/adventure` — 19 rooms incl. the Blue Castle; duplicate chalice;
  either cup home to the Gold Castle wins. `npm run advedrive` proves it in real
  Chrome (10/10). `/retrogames/defender` — stage-3 hunters.
- Plus prior shelf: grind-city waiting line, pinball chain-pin + flanks + smith,
  skyward rooms, tidal-rush, ssx, comet-drift pair, marble pair, galaga bee,
  mario-kart, ice-climber, pacman, mario, minesweeper/garden-guard/homebody,
  TIDY BOT, STARRY NIGHT, TOP SOLDIERS, DOUBLE DRAGON, RACCOON HEIST,
  spy-hunter, iron keep, missile, pucks, mines, zork, ultima, king's quest,
  Joust, Q*bert, forge board.

## BOARD facts at close
- game-queue = #3456 (DEFENDER stage 4: watchRoute vs a MORTAL pilot — slot a's
  arc, stages 1–3 shipped). building = 0; building-qa = 2; feedback = 6 (#3489
  is the ADVENTURE polish owner).
- idle-kick scores the FULL 93-title shelf since #3481 — expect kicks at old
  statically-imported titles (that fix's whole point).
- Rule-4: slot b SHIPPED game code this session (#3487) + a harness fix (#3481).
  No STALLED.

## Open questions (links only — #605)
- #3335 — QA: music-bus low-pass in AudioController (AWAITING, deadline Nov 27;
  gates PINBALL tilt-muffle — do NOT implement until answered/defaulted).
- #3054 — native TestFlight ports have no recorder/upload (AWAITING).
- #2971 — qa(contra): trainable-adapter polish pass (waiting-jon).
- #1712 — PLAICRAFT S2 — versioned dataset from human recordings (big-build).
- No new jonq questions this session.

## Slot state at handoff
- Main checkout: detached, clean (was at `563f9ae` this pass; re-fetch before
  use — QA #3485 and later merges keep landing).
- Slot-b worktrees (`forge-idle-shelf`, `forge-adventure-blue`): both already
  pruned by cleanup; confirmed gone in `git worktree list`. Dev server :5178
  stopped via `scripts/devstop.sh`. Nothing dirty anywhere in slot b.

## Next claims (for whoever is free)
1. #3456 DEFENDER stage 4 (slot a's arc — last-hunter endgame + survival copy).
2. #3489 item 5 (`parseGaps` ###Restored markers + mutant in neverbudrycheck)
   — small harness fix, makes idle scoring honest before the next kick.
3. Idle-kick against the full shelf now that #3481 is in — the board's aim
   changed; run `node scripts/idle-kick.mjs` fresh before choosing.
