# STATE — session 196 (2026-11-10, slot b)

## What shipped
**POLISH #1889 — PAPERS, PLEASE-MIN gets a real calendar** — squash `856649e`
(PR #1890, closes #1889). The week ROLLS: `START_DATE` Oct 11 → **Oct 27**, so
seven days are OCT 27…31, NOV 01–02 — day 6's EXPIRED test paper is judged
across a real month boundary (wall `1982.11.01` vs passport
`EXPIRES 1982.10.31` side by side at the window), the date arithmetic the
original (Papers, Please, 2013) makes its daily bread. `dnum` is now exact
days-since-epoch (`y*365 + MPREFIX[m-1] + d`) — the serial every rule compares
and the calendar the wall prints are ONE clock:
`dnum(dadd(x,n)) − dnum(x) === n`, both directions, every constructible date.
CURFEW's grace counts real days: over a 30-day November, 6 left is void,
exactly 7 walks (uniform-31 read 6 as 7 past the seam).

**Real bug found by rolling:** `dadd` had no backward carry — day 6's
"yesterday" shipped `NOV 00`. The fairness prover structurally cannot see it
(serial ordering stayed sane; only the printed date lied, and the display is
the contract). Carry added.

Evidence: paperscheck **6551/6551** — new CALENDAR section (~60 gates:
identity law 365 dates × 10 spans, backward-day sanity, per-seed OCT→NOV roll,
day-6 cross-month witness, synthetic short-month seams incl. year seam and
expires-TODAY at the seam) + mutants **m9** (uniform-31 re-freeze) and **m10**
(carry strip), all 10 caught; hand-mutant proof: carry stripped ⇒ exactly 25
red, all new gates. papersplay 19/19 real keys, seed 2 survives the rolled
week, zero page errors. eslint + lint:mario/fps/ai + build green. Prod
verified: live chunk `index-DSRrkHj3.js` carries `y:1982,m:10,d:27`.
Live: https://jalfern.com/retrogames/papers-please

## Session bookkeeping
- TARGET #1637 REFUSED at claim (slot a live, 37-min hold). Ladder: steer
  empty; `next` = #1711 — all four acceptance lines need Jon's phone + the
  bound R2 bucket; #1730 CLOSED defaulted-Hold. Slot b's own checkpoint on
  #1711 keeps it `next` for the post-deploy session; never idle (#841).
  game-queue empty; feedback belongs to QA (Jon 2026-10-19). Flagship stage
  SPENT: SSX/Emberwood/CometDriftHD/Myst READMEs hold only CLOSED gap bullets
  (parseGaps → []). NEVER-DRY (#1571): weakestStage → PAPERS, PLEASE-MIN
  score 4 (4 README gaps, zero QA feedback naming it; ties → older title).
  Filed #1889 (game-queue, lane:games, why-weakest line), claimed, shipped.
- QA polish pass filed as #1891 (feedback): quote the evidence sentence at the
  stamp strip (`gs.last.why` keeps only the rule name today), month-name dates,
  new-month bulletin on day 6, paper weight/motion.
- Shift report pushed. No jonq (nothing taste/priority/hard-to-undo).
- Game code merged this session (AGENTS rule 4 healthy). Slot a shipped
  WATCH b17 (HOMEBODY, `96eee3e`) + its STATE in parallel; merge window was
  clean (rule-5 loop handled main moving).

## Next queued (slot b)
1. Normal ladder: warden TARGET, else halt/steer/next/queue rungs.
   #1637: check claim liveness first (slot a may re-roll batch 18). #1711
   stays `next` until Jon deploys #1730 — do NOT self-serve the bucket.
2. If the ladder runs dry: flagship still spent — fresh `weakestStage`.
   At this session's end it scored **LODE RUNNER-LITE 4** with oldest gap
   "trap is a single-cell pit; deep shafts…" — audit that gap against the
   original Lode Runner AND Jon's 2026-10-11 fidelity ruling ("LODE RUNNER
   shipped permanent holes and a jump") before building it.

## Notes for the next slot-b session
- Worktree `~/Dev/retrogames-forge-ppm-calendar` is detached at `a3cb961`
  (origin/main); node_modules symlink intact. For a new build:
  `git checkout -B forge/<newslug> origin/main`. Dev server 5178 was left
  RUNNING (vite from this session) — reuse after verifying its cwd, or kill.
- PPM calendar law: keep `dnum(dadd(x,n)) − dnum(x) === n` (CALENDAR section
  pins it; backward carry included). No leap days exist in this sim's calendar
  — dadd never emits Feb 29; keep it that way or change both clocks together.
- Prod-verify lazy games by CONTENT fingerprint in the HTML-reachable chunk
  graph (entry chunks carry no game strings; Vercel builds don't reproduce
  local hashes). The papers chunk is found via LAST-names literals ("ZEMEK").
- Never claim `#1711` work that needs hardware; its four acceptance lines are
  posted on the issue and die only on Jon's thumb + bound bucket.

## Open questions
- None.
