# STATE — session 205 (2026-11-10, slot b)

## What shipped
**WATCH batch 20 — SPACE INVADERS re-aim + edge-bounce fold** merged as
`a67e699` (PR #1928, Part of #1637; TARGET #1637 claimed cleanly 162 min
after slot a's last checkpoint). The Y brain takes an aligned shot the tick
it appears (was: marching to the lowest invader's column while another sat
lined up — ~500 green fire-gate ticks/seed wasted) and leads the march
THROUGH the wall bounce (straight leads died on edge reversals). Measured,
20 seeds: slowest clean clear **1857→1265**, worst inter-kill stall **172**
(pins 2100/450 → 1400/220, both proven red on deletion: fold-off 236,
re-aim-off 264), new fort-preservation pin **6215/6560** (kills the b19
tiebreak mutant that b20 otherwise let live). 20/20 clean, 0 deaths,
5/5 mutants die. Prod content-verified: live chunk `index-CBnLQpVr.js`
carries `<=2.5&&(!` (the aligned-pass brace; old build answered `<=2.5&&!`).

## Ladder trail
- TARGET #1637 claimed b (slot a idle inside it since batch-19 ship).
- No halt/steer; `next` #1711 PLAICRAFT S1 hardware-stalled (unchanged);
  game-queue empty; jonq empty. TARGET stood.

## Defender: NOT shipped, on purpose (measured dead ends)
Far-side haul interception attempted three ways on b19's brain:
1. strict reachability (concede unreachable hauls, pivot to dives) — floor
   7800→5850, catches down; 2. weight pivot (lose VIP only when all hauls
   lost) — floor →3750, waves 19→18/20; 3. reachable-diver VIP ×0.5 —
   totals +18% score/+15 waves but floor →3150, deaths +3. At 4000 px the
   far side is outside the ~210-tick rescue window (haul crest y<70 at
   0.72 px/t; crossing ≥250 t at cruise 6). b19's engage-everything law is
   the honest optimum; README gap now records the three dead ends. LESSON:
   DF witness variance is huge — judge a DF brain change on SEED FLOOR +
   waves ≥1 count + deaths, never on total score.

## Lessons
- **Name-collision in Node probes**: importing `watchRoute` from two sims
  into one file silently shadows; SI's brain returned empty input on the DF
  world and the probe measured a do-nothing patrol (all-zero score = tell).
  Alias cross-game imports (`watchRoute as siWatch`).
- **A tightened pin can orphan an old mutant**: b20's fold made b19's
  aimBlocked-tiebreak mutant survive; fixed by adding a metric the tiebreak
  owns (bricks standing at clear), not by deleting the mutant.
- Probe-and-revert on law questions: three DF configs measured against the
  untouched b19 module in one process (git show HEAD > /tmp/ forge/olddef).
  Fast, honest, decisive.

## Session bookkeeping
- #1637 stays `building` (rollout; batch 21 claims fresh — no pushed branch
  left). Shipped comment with live URL + content sig posted.
- #1906 (SI watch-pause tell, QA): b20 context NOT yet added — the pause is
  now ≤3 s; QA should re-verify the tell against the faster route.
- No jonq (nothing taste/priority/hard-to-undo; open questions stayed none).

## Next queued (slot b)
1. Fresh ladder: warden TARGET, else halt/steer/next/queue games-first.
   #1637 batch 21: SI wave-2+ pacing (fireChance cap 0.05 chokes late
   waves; README honest), DF rescue-window re-check is NOT a candidate
   (measured dead ends this session).
2. If dry: never-dry weakestStage (idle.mjs); TMD gaps owned by QA
   (#1915/#1900/#1888/#1871) — do not take feedback while QA is live.
3. Do NOT own the bombdrive seed-7 pair — #1871 until QA ships the fix.

## Notes for the next slot-b session
- :5178 vite from `~/Dev/retrogames-forge-watch-b20` may still run —
  verify cwd, reuse or kill before strictPort.
- `pkill -f watchcheck` before a scoped watchcheck (orphan budget hold).
- New SI pins are tight (1400/220/6200): any future SI brain change runs
  `npm run invaderscheck -- --mutant` FIRST; a green run without mutants
  proves nothing here.
- Prod sig recipe: pick a brace-level diff from local `dist/assets` after
  build, verify old-vs-new byte diff is minification-stable, then sweep.

## Open questions
- None. (No taste/priority call needed from Jon.)
