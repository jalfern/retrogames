# STATE — 2026-10-24 forge session 9 (Momentum Runner #900 curves rework shipped)

## Shipped this session
- **#900 → main (PR #933 squash f60b420)** — MOMENTUM RUNNER courses
  reworked curves-first: 3 new beats (`beatCascade` six chained arcs,
  `beatHalfPipe` deep U w/ floor boost, `beatSpringHigh` spring over a 420px
  pit onto a ringed hill-top deck — speed earned, slow springers die on the
  pit wall). Flat expanse halved (56-63% -> 38-43% of sector ground as
  >=400px slabs); S-curve flat tails removed, spikes moved into a dip,
  valley/hill tails packed; programs 20->24 beats, sectors 62/63/66s.
  New gates: FLATNESS (<45%/sector), SPRING-HIGH (fast lands deck / slow
  dies / autopilot banks deck rings), arc-steps 8->24. runnercheck 191/191,
  all 16 mutants + 2 manual (weak spring, re-flattened valley) proven red.
- **#873 closed** — Jon's answer (analogue steer) was already shipped via
  #894; the question issue just never got closed.
- **Filed #934** `QA — MOMENTUM RUNNER: polish pass (curves-first round)`
  (feedback label) — half-pipe volume shading, deck-landing juice + route
  telegraph, cascade look variety, spring-high audio cue, runnerplay budget
  flake note.

## Next goal
- Oldest `game-queue` then: #901 shared 3D model library (PLATFORM) /
  #902 + #903 demos (coral reef, black hole — self-contained, /demos only).
- QA holds #925 (link pads layout) and now #934. Never touch heldGames.

## Board / harness status
- main = f60b420 (this ship); nightly was green at claim and at merge
  (`main-ok` ok, `static` pass, Vercel pass).
- **runnerplay is flaky on this box**: main itself scores 17/22 here today
  (attract-window checks assume pre-#550 short sectors + a hero-pixel probe
  that misses on slopes). This session's branch scored 19/22 — better than
  the baseline, zero page errors, every input-path check green. Left as
  advisory per rule 3; budgets named in #934 for the QA lane.
- `jonq`: nothing AWAITING in lane:games; nothing new filed.

## Open questions
- none open.

## New harness lessons (this session)
- **A spring's airtime is the real gate, not the pit.** A vy=-820 pad gives
  ~0.86s of hang: any pit narrower than vx·0.86 is crossed at ANY speed.
  The first spring-high (240px pit) let a 200px/s body onto the deck; the
  SPRING-HIGH gate caught it red. Speed-gated crossings must size the gap to
  the *slowest survivable* launch.
- **FLATNESS gates need a width floor.** Counting every |dy|<2 segment scores
  jump run-ups as "flat expanse"; >=400px separates verb architecture from
  the vast dead ground the issue named. Pin the threshold ~5pp under measured
  and the error message quotes the old (bad) baseline so a future session
  sees the debt.
- **Baseline runnerplay before blaming your branch** — main fails 5/22 on
  this hardware; 19/22 with shared failure modes is a pass-with-note, not a
  regression (rule 3, one PR never).

## Housekeeping owed
- Prune worktrees: `retrogames-forge-momentum-courses` (detach done, remove
  when idle) + old list unchanged (iphone-controller, ssx-courses,
  ssx-analogue-stick, emberwood-*, qa-863*, people-sim).
- STATE.md ships via its own PR (#920 convention) — this session merged, so
  commit + PR + merge this file.
