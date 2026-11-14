# STATE — session 275 (2026-11-14, slot b)

## Playable now / what shipped
- **Homebody #2240 — Ivy polish pass part 2** (merge `b7f7f07`, PR #2282,
  closes #2240): four laws + a real bug. (1) The SET-DOWN — a basket-carrying
  Ivy physically places it at her kitchen spot (fridge→stove→front step→cell)
  with a 150/95 Hz triangle thunk + filtered noise, distinct from her gate
  bell; view-only staging (`giftFx/giftAt/giftHoney`, off stateHash), basket
  paints on the depth line, fades on GIFT_LAND_T=5 s. (2) `VISIT_TIMBRE`
  data table — Fern keeps the 660→880 two-bell, Ivy a three-note lilt that
  lands DOWN (587→988→740) + lower slower steps; shell plays it verbatim.
  (3) The STRANDED-IVY rescue (real bug found): `scheduleIvy` can roll
  ivyAfter=19 at lv 0 and `hour ≥ ivyAfter+gap && hour < 19` never passes
  again — nothing re-rolls till a visit ends → those seeds never show Ivy
  (seed 5). Attract bot rings once ONLY when her schedule can no longer
  land. Built-and-CUT: unconditional noon pull + forced stroll-to-ring —
  each tipped WINNABLE seed 7 (wins by exactly §10) out of the win.
  (4) BONDS at phone scale — rows via exported `bondRows(s)`, drive samples
  across the gold-pulse phases at k≈0.60: ink, 3 rows, FAMILY gold all
  survive. Bonus fix: Ivy's ring never got a chat bubble (lifetime chatT
  always spent by Fern) — `arbitrateVisitors` re-arms chatT on claim
  switch (`p.chatWith`), honest dt crossing (#2135) intact.
  peoplecheck **497/0** (was 480; +17 gates; seed 7 byte-identical win
  content 80 day 3 §10), homebodydrive **72/0** (new live legs), mutants
  kill exactly the promised gates (495/2, 496/1). Rebased on #2276.
  Prod-verified: the served Homebody chunk carries `gift-land` (found via
  chunk-enumeration — the prod build is code-split, grepping index misses).

## Ladder (this session's path)
- Warden target #2240 claimed on slot b (feedback→building); design comment
  posted first (#issuecomment-6884826402); one ship, time-box respected.

## BOARD at exit
- #2240 closed (+prod comment with live URL). Open QA feedback: #2272/
  #2270/#2264/#2258/#2256 — don't duplicate. game-queue: EMPTY. No
  `building`, no steer/halt.
- jonq: nothing open from lane:games. Nightly green; main-ok clean at exit.

## Next (slot a or b, in order)
1. Queue empty → ladder: steer/none → #1711 skip (Jon-side) → QA-borrow only
   if no `QA MASTER` live → flagship stages (SSX, Emberwood, COMET DRIFT HD,
   Myst) via `idle.mjs`, skipping QA-held gaps → weakestStage.
2. Homebody's Ivy now has a daily-presence guarantee in attract; if QA wants
   more (a dedicated Ivy quest), that's a Jon taste call, not ours.

## The session's catches
- **`hour < 19` vs absolute schedules strands a visitor forever.** hour
  resets at midnight but a schedule rolled to 19+gap never re-enters the
  window, and re-rolls happen only at visit END — an END that never comes.
  Rescue at the attract layer was the ship; a sim-layer re-schedule is the
  deeper fix (kept out of this polish pass deliberately).
- **Lifetime conversation counters starve the second speaker.** chatT's one
  2.4 s crossing per resident meant Fern got every bubble. Re-arm on visitor
  switch — but keep the dt-crossing form or the #2135 pin dies (it did).
- **rel scale is 0–100 (REL_EDGES [12,30,60])** — a dev hook setting 0.65
  silently means lv 0. Bug in the scenario hook, not the game.
- **Pixel gates on pulsing gold must sample across phases** (max of N
  samples) — one frame is a lottery. The gold pulse taught this twice.
- **A long attract wait starves later morning windows** — the meal-bell and
  dial legs broke when my attract-observation leg burned 60 s of sim time
  before them. Observe at the end, after a reload, instead.
- **Branch age == regression** — my base predated #2276 and re-broke the
  dial-gold it fixed. Baseline the same drive on origin/main before hunting
  ghosts (baseline passed 67/0; the rebase settled it).
- **Prod is code-split** — game markers hide in lazy chunks; enumerate the
  `__vite__mapDeps` asset list and grep every chunk, not just index.js.

## Hygiene at exit
- Dev server :5178 stopped (killed in the restart); 5179 baseline server
  killed; no other lane's port touched.
- Worktree `~/Dev/retrogames-forge-ivy-gifts` re-detached at origin/main
  (`b7f7f07`+); branch deleted upstream by squash.
- STATE.md committed to main legitimately (game merged this session) +
  parked at slot-b path and shared path; shift report published.
