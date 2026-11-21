# STATE.md — The Forge (rewritten at close of slot a, 2026-11-21; committed to
# main because game code merged: src/games/DoubleDragon/sim.js shipped in PR
# #2855 -> 9f7ca93. Rule 4 counter: three game-code PRs in a row — #2850,
# #2853, #2855. Loop is turning.)

## PLAYABLE
- /retrogames/double-dragon — **partner personality live** (slot a, #2855): the
  CPU seat stops mirroring — guardian law (Jimmy sprints whoever grips his
  brother), release law (hit the grabber, he lets go — symmetric both seats),
  and a 13-beat jab-jab-cross vs Billy's 9-beat hammer (the dragons no longer
  swing in lockstep). ddragoncheck 112/112, mutants 11/11 named.
- /retrogames/contra — pod carriers live (#2847, slot b).
- /retrogames/r-type — S1–S4 + S4 wing polish (#2841 -> #2853).
- Rest of shelf unchanged.

## WHAT THIS SESSION DID (slot a)
- Warden target #2847 REFUSED at claim (slot b's checkpoint 28 min fresh — b
  shipped it as #2850, correct). Ladder: no steer/halt; `next` = #1712
  (lane:research wait-state, warden gave it to b — builder skip); game-queue
  empty; QA borrow closed (QA MASTER alive); flagship stage spent; never-dry
  rung: `weakestStage` scored DOUBLE DRAGON weakest (8: 8 unowned README gaps,
  0 feedback naming it; CONTRA/R-TYPE held). Filed #2851, claimed, shipped.
- **PR #2855 (squash 9f7ca93)**: guardian + release + cadence laws in
  `DoubleDragon/sim.js`; 3 new pins; mutants `guardian-deaf`,
  `grip-permanent`, `cadence-mirror` RED+named. Solo hashes untouched (ally
  seat only — attract/WINNABLE streams stand). README: laws block + gap #0
  re-marked **DISCLAIMER** (arcade had no CPU partner; deeper seat craft is
  open craft, not a scoring gap — stops the #961 re-kick loop).
- One existing S4 pin's camera-edge proxy re-aimed at Jimmy's tail distance:
  jabs stagger the thug off the spawn edge; the law ("works Jimmy") unchanged.
- Prod verified content-first: www chunk `index-Cq8X9QE9.js` contains the
  minified `tick%13` cadence + grip lookup. Live URL on #2851; shipped label.
- Filed QA polish pass **#2857** (guardian telegraph, grip-break juice, cadence
  readability, KO flair).

## BOARD
- building: none. building-qa: **#2842** (CONTRA ceremony — QA's).
- #1712 stays `next` (wait-state: friends' takes via /retrogames/join close
  both data lines in adapted games with zero new code).
- game-queue: empty at close — next free slot runs the never-dry derivation
  again (DD gaps #1..#7 remain: 7 honest gaps, none owned by open feedback).
- Open jonq (link only): **#2844** (S2 fold ruling; default keep fold),
  **#2846** (flagship public promotion — default keep private).
- Unowned harness bug: **#2839** (claim-status.mjs ignores `FORGE (<slot>):`
  comments → liveness reads dead). Small; any lane can fix.

## HARNESS NOTES FOR THE NEXT LANE
- `ddragoncheck.mjs`'s `mk()` helper spreads only `over.rest` — an enemy's
  `tgt` set via `mk(...,{tgt:'x'})` is SILENTLY DROPPED. Set `e.tgt = '...'`
  explicitly after `mk` (bit me once; pin passed solo-comparison anyway).
- Fixture enemies made with `mk(kind, x, y)` share ids (`900+floor(x)`) —
  sim laws must key off `state`+`tgt`, not ids (the release law does).
- Browser-leg Z-key pins can flake right after Vite HMR churns mid-run; rerun
  once before believing them (passed twice on either side this session).
- Cadence constants live in `dragonBrain` (13-beat ally, 9-beat hammer): any
  retune moves the cadence pin's expected strings AND the S4 crowd pin's
  knockback proxy — re-run the full ddragoncheck, not just the new pins.
- Next DD adapters/gaps: README honest gaps #1..#7 in order; #3 (no chain
  scoring) is the meatiest player-visible rule gap left on DD.
- Prod-verify recipe that worked again: fetch www HTML → entry → crawl all 66
  chunks → marker-grep (`%13`); content-hash names changed deploys vs local
  dist (shared chunks shift) — grep markers, don't diff names.

## WORKTREES
- Main checkout: detached origin/main (9f7ca93) with this STATE commit.
- `~/Dev/retrogames-forge-dd-partner-personality` — merged; re-detached at
  origin/main; reap freely (remote branch gone). Slot a dev server (5173)
  stopped at close; port left free.

## Open questions
- #2844 (PLAICRAFT S2 fold ruling; default: keep fold).
- #2846 (flagship public promotion; default: keep private).
