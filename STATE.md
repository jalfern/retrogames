# STATE — session 279 (2026-11-14, slot a)

## Playable now / what shipped
- **PLAICRAFT v2 — the intent leak is fixed (#2299 → PR #2301, merge
  `4a44472`, LIVE).** Executed Jon's answer A to #2285 (found via jonq:
  #2285 was answered 02:09Z but nobody had run it). Audit #2277: the
  swing-intent label `a` was bit-identical to feature `monReach` on all
  221k rows — intentAcc 1.000 was copying, and /research published the
  100%. Now: 31 senses (featurize index shift, N_FEAT 31), arch
  31-24-24-5, stamp `plaicraft-bc/v2`, full regen (221,418 rows, all
  replay-verified), held-out scored once = **8/8 wins, avg score 155,487
  (v1: 121,306)**, intent tf **0.9876/0.986 — learned, not copied**.
  pad_acc cost 0.93→0.90 (honest price of inferring distance). New gates:
  NO-LABEL-LEAK in plaicraftcheck (no column bit-identical to `a` on live
  rows; injected-copy mutant + hand mutation at row-assembly → `FAIL …
  label copies: col31`, restored, 15/15). Train refuses stale-width
  datasets. Attract ticker's held-out claim now reads POLICY.meta.heldout
  (train writes it post-rollout) — a retrain can't strand a stale 8/8;
  netdemocheck recomputes the same string. Train also writes
  public/research/results.json now (Research.jsx's comment is finally
  true; the file had drifted since #1635). Gates: plaicraftcheck 15/15,
  netdemocheck 55/55, gauntletcheck 306, gauntletplay 28/28 on :5173,
  lint mario/fps/ai + eslint + build. Prod: research json serves v2,
  gauntlet attract renders; only `monReach` left in prod bundle is the
  Research prose naming the leak. Rule 4 streak (2 platform sessions)
  broken — game code shipped.

## Ladder (this session's path)
- Warden target #2286: claim SUCCEEDED at 03:13Z but only through the
  checkpoint-keyword gap — b's 02:10Z update said "pushed", and holder()
  counts only `claimed|checkpoint`, so b's lock looked dead. I found b's
  PR #2296 complete (all of Jon's asks, watchlayoutcheck green) and
  YIELDED — duplicating watch.sh against a live b is what #878 forbids.
  Right call: b landed #2286 (913e6be + #2300 mojibake fix) while I built.
- Jonq #2285 ANSWERED (A) with no execution → that became the work item:
  filed #2299 (game-queue + lane:games), claimed, shipped. `next` #1711
  remains Jon-side (cp2: secret put + relabel + phone takes) — b has since
  claimed it (04:03Z) for the pads/voice stage.

## BOARD at exit
- game-queue EMPTY; building = #1711 (b, 04:03Z); building-qa = #2264
  (Homebody polish). No halt, no steer, jonq open: none. No dry run this
  session — real fix shipped.
- #2285 stays closed (answered; my execution comment added). #2299 shipped.
- Mini holds nothing new spotted; mini2 session from session 278 ran its
  cap. Watch items carried from 278: qa·mini·2 pane, n=6 warden strip.

## Next (slot a or b, in order)
1. game-queue empty → new items land on `feedback` (builders-the-reverse);
   QA sessions are live (mini/mini2/studio) so a borrow is blocked while
   they run — flagship stage (SSX/Emberwood/COMET DRIFT HD/Myst, oldest
   unowned README gap) is the fallback per FORGE.md.
2. PLAICRAFT honest follow-ups (only if QA/files arrive): v2 partner
   died 2x held-out (v1: 0 after #2244-era, was 1) — a survival doctrine
   polish is legit QA territory, already implied by honest notes; do NOT
   invent it as forge work.
3. Jon-side: #1711 awaits secret put + relabels (b is on the pads/voice
   stage it can run headless).

## The session's catches
- **Checkpoint keywords are load-bearing.** `FORGE (b): … pushed …` does
  NOT extend the 90-min lock (holder() matches `claimed|checkpoint`
  only) — a working lane can be ruled dead while shipping. Lanes: prefix
  handoffs `FORGE (<slot>): checkpoint —`. (Consider a claim-side fix:
  count any `FORGE (<slot>):` line as liveness — small, cheap; needs
  issue of its own, not a side edit.)
- **jalfern.com redirects** — prod polls need `curl -L`; without it the
  body is "Redirecting..." and every grep reads 0. Nearly filed a
  false deploy failure.
- Answered jonq questions close WITHOUT executing — the answer text is
  the spec; a session must pick it up (this was the whole session's task,
  found only by reading a closed issue's comments).

## Hygiene at exit
- Dev server :5173 stopped (mine only; other lanes' ports untouched).
- Worktree retrogames-forge-plaicraft-monreach re-detached at origin/main
  (ancestry-landed → self-purges on a later tick).
- STATE.md committed to main (game code merged this session — rule 9
  allows it) + statepark slot a.
