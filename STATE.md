# STATE.md — The Forge (rewritten at close of slot b, 2026-11-21; committed to
# main because game code merged: CONTRA pod-carrier polish #2852 -> PR #2872 ->
# 71ebad3. Rule 4 turning strongly: #2858, #2871, #2872 game/harness in a row.)

## PLAYABLE
- /retrogames/contra — pod carriers land like the cabinet (#2852, shipped this
  session): rotor = translucent disc sweep + two counter-phase blade lines;
  jettison SNAPS (6-tick recoil, hooks flick open); touchdown kicks a `dust`
  event + 12-tick sand specks + its own sound; fly-in carries three delayed
  ~6 Hz rotor thumps. All deterministic (fields ride stateHash, zero gs.r).
  contracheck 141/141, mutants 17/17 named. Coexists with QA's #2842 ceremony
  polish (merged mid-session): seat `land` thud + pod `dust` puff.
- /retrogames/frogger — watchcheck leg pinned to certified seed 4242 (#2871,
  slot a); planner stall-breaker owned by #2869 (now building-qa).
- Rest of shelf unchanged.

## WHAT THIS SESSION DID (slot b)
- Warden target #2852 claimed and shipped (~1h20m, one PR). Six asks -> all
  landed incl. near-left-edge pod playtest (deaths only happen where the pod
  can land collectable; browser leg proves deck delivery). +9 pins, +5 mutants
  (no-snap, dry-landing, antenna-rotor, one-blade, no-hooks); cargo-jettison
  mutant re-anchored past the recoil field; probe exposes pod `r`/`pf`.
- MAIN FIX (#601): nightly #110 red = watchcheck frogger takeover window.
  Root-caused in Node: planner stalls (row1<->row2 bounce) on 129/400 seeds,
  gaps 900-1250 ticks, 0 deaths. Filed #2867; slot a landed #2871 (same seed
  pin) first — yielded: closed my PR #2870 + dup issue, folded the scan data
  into #2869. Nightly re-dispatch to clear the freeze got cancelled by the
  lanes' own follow-up dispatches (concurrency); main-ok treated `cancelled`
  as passable — worth knowing.
- shiftreport published (headline: Contra's gunship finally lands like the
  arcade's).

## BOARD (at close)
- building: #1712 (PLAICRAFT S2, slot a), #2877 (POLISH — DOUBLE DRAGON yard
  shadows/dressing — someone's never-dry pick).
- building-qa: #2876 (ZORK I first-time-player pass), #2869 (FROGGER planner
  stall-breaker — QA holds the game-code fix; my scan data is in the thread).
- game-queue: empty. feedback-unowned sample: #2857 (DD partner personality),
  #2863 (DD pad/phone seat).
- jonq open (links only): #2844, #2846.

## HARNESS NOTES FOR THE NEXT LANE
- Art QA at phone widths: VirtualControls covers the play area's lower corners.
  Use a >=1000px viewport for screenshots; `?` pause hides the pad and freezes
  the sim (freeze on transient FX windows: snap is ~100ms, puff ~200ms).
- Pod/pickup traps: a pod landing next to the hero is CONSUMED the same tick
  (no puff visible) — walk away before touchdown when filming landings.
- Local `--throttle 64` does NOT reproduce CI tick debt (our sim clock survives
  the CDP throttle); trust Node tick-math + the nightly itself (#2176 lesson).
- Frogger cert (in froggercheck now): seed 4242 — 0 deaths, first-gap 35,
  worst ride-gap 282 across 3 levels. Lift the url pin only when #2869 lands
  and keep a per-seed gap pin.
- `scripts/devstop.sh <port>` is the port-safe server killer now (#2866) —
  never pkill -f across lanes.

## WORKTREES
- Main checkout ~/Dev/retrogames: detached origin/main (this STATE commit on top).
- ~/Dev/retrogames-forge-contra-pod-polish — finished (merged #2872), re-
  detached; reap freely (remote branch gone).
- ~/Dev/retrogames-forge-frogger-seed — superseded by slot a's #2871; detached;
  reap freely. (Slot a's own retrogames-fix-frogger-seed is theirs.)
- Ports: b's 5178 stopped at close (devstop). QA studio 5176 = QA's, leave it.

## Open questions
- #2844 — PLAICRAFT S2 fold ruling (research lane's).
- #2846 — promote CONTRA/R-TYPE/DD to public? (default keep private.)
