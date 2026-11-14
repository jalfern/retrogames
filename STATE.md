# STATE — Forge (last: session 265, slot a, 2026-11-14)

## SHIPPED THIS SESSION
- **PICK RUSH — hand-authored belt waves (#2210)** — merged **3e83fe0** (PR **#2211**).
  Resumed as a corpse: the prior slot-a session claimed 08:38Z, built, pushed and
  opened the PR, then died at the red-main wait. One flat seeded hum is now a
  breathing line: `WAVES` in `sim.js` — 3 named waves per shift fixing the kind
  ORDER (seed-independent) + intra-wave gap + longer `rest`; ±5 ticks seeded jitter
  on top; era ladder honoured (bottles shift 2, barrels 3, scrap 4); each incoming
  wave announces itself (ice-blue caption + two-note cue) during its breather.
  Quota promise untouched (feed 48/55/56/65 vs 18/19/20/21).
  Evidence (re-verified independently before merge): `pickcheck` 30/30 node
  (5 new WAVES gates: authored-order-across-seeds, era ladder, breathing, supply,
  wave cue) + 12/12 browser zero page errors; mutants `wave` (ERA LADDER red) and
  `judge` (2 gates) caught; `contractcheck` 16/16; eslint + lint:mario/fps/ai +
  build green; PR `static` SUCCESS. Issue closed `shipped`; QA polish pass filed
  **#2214**.

## MAIN
- **#601 freeze LIFTED this session.** Red nightly 43568372143 = `dvhcheck` only;
  fix #2208 (`fa1faa3`, horse demos dvh form) verified locally 7/7; confirming
  nightly on `fa1faa3` went GREEN (≈65 min) → merge proceeded. Quarantine untouched
  (empty).

## BOARD
- **#1711 stays open** — PLAICRAFT S1 tail: Jon's 3 phone takes (+ #2156 live numbers)
  + **#2157** (lane:platform, unclaimed; buildable — #2188 is in). Deploy ORDER in
  relay/README: SESSION_WRITE_KEY secret AFTER the #2093 relabel one-off, BEFORE
  distributing JON_KEY.
- Slot b shipped VIPER #2212 (`a6e1d42`) mid-session; slot b's STATE (session 263
  park) folded in — nothing evaporated.
- No quarantine entries, no steer/halt on any board, no open jonq questions.

## NEXT (next slot)
1. **#2157** (lane:platform, unclaimed): JON_KEY from gitignored `.env.local`,
   evidence download retry+backoff, verdict posted on #1711 per new take; jonq ask
   for the one-time key step (exact command in the issue body).
2. When Jon's phone takes appear: `plaicraft:evidence`/`plaicraft:clap --key=`
   numbers onto #1711 (then #2156 can close).
3. Ladder for builders is otherwise empty — `weakestStage` at the next kick;
   **#2214** is QA's pick-rush polish (builders keep off); flagship gaps all shipped.

## LESSONS (the cheap kind we kept)
- **A corpse that died AT the merge wait is the cheapest resume there is** —
  the whole build existed; this session added verification + a green-main wait,
  zero new code. Step 1b + BUILD FLOOR comments made that decodable in minutes.
- **Red main has a 2-hour clock (#2176), not a veto**: read the failing job, check
  whether the fix is already merged, and gate the merge on the confirming nightly
  instead of idling (background watcher; no polling loop).
- Mutant mode exits 0 on a CAUGHT mutant — verify the verdict line, not just the
  exit code, when grepping mutant output.

## Open questions
- none (jonq list games empty; #1711's blockers are Jon-side takes, tracked there).

## HOUSEKEEPING
- Worktree `~/Dev/retrogames-forge-pickrush-waves` kept, re-detached to `origin/main`
  tip after merge (branch deleted by squash-merge). Slot-a vite (:5173) reclaimed from
  the dead session, still serving; leave or reclaim, own port only.
- STATE committed to main legitimately (this session's #2210 merged) + parked to the
  slot-a path.
