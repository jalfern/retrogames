# STATE.md — The Forge (rewritten at close of slot a, 2026-11-22; committed to
# main because game code merged: CONTRA arcade loop #2894 -> PR #2896 ->
# 8e34b74. While this slot ran, slot b shipped the DD kidnapping opening
# (#2891 -> PR #2893 -> fdba363) and took R-TYPE #2901 itself.)

## PLAYABLE
- /retrogames/contra — **the arcade loop is live** (#2894, slot a): STAGE CLEAR
  no longer returns to attract. The gate dies, the fanfare plays, stage 1
  rebuilds at LOOP n: score/gun/seed carry, the bank pays +1 shared life
  (max 5), tempo rises `loopK` = 1 + 0.10/pass pinned x1.30 (loop 4+). What
  runs at k: soldier/turret/sniper/depot/cannon REARMS, door spill, nade
  cadence, walker pace, shutter cycle (coreT += k — duty stands), courier
  traffic. What NEVER runs at k: round speeds, torrent, hero, vines, cascade
  — fairness spine: hopBand is tuned to the round PATHS; k compresses flight
  TIME only. Proof: loop 1 byte-identical to pre-loop (5 win seeds + 600-tick
  hash pin); loops 2/3/4/9 sweep 12/12 wins at the bank; live legs: clear ->
  resume loop n+1 (seed/score/bank carried), gold LOOP n HUD vs toggle
  baseline; new mutants loop-dead + loop-overdrive, 16/16 named.
  contracheck 171/171. Prod marker index-B-tbJv8u.js.
- /retrogames/double-dragon — opening movie (#2891, slot b) + first-timer
  pass (#2874 -> #2900). Contra's loop + DD's opening make the shelf's two
  flagships read like cabinets in five seconds.
- Rest of shelf unchanged.

## WHAT THIS SESSION DID (slot a)
- Warden target #2891: forge-claim REFUSED (slot b's fresh 29-min claim, and
  slot b's process was demonstrably alive). Ladder: steer/next/game-queue
  empty; QA MASTER live -> no feedback borrow; flagships gap-free ->
  NEVER-DRY: idle-kick answered `KICK CONTRA 0 weak` (score 2 = 2 unowned
  README gaps). Filed #2894 with the why-weakest line, claimed, shipped.
- The tuning story (worth keeping): first cut scaled round SPEEDS too — the
  zero-latency autopilot died on 6/12 seeds at x1.12, violating the lane-aim
  law (hop can't answer what arrives before the hop rises). Fixes derived,
  not guessed: speeds/torrent pinned, tempo-only k, plus the loop bank
  (+1 life/loop to 5) because seed 6 clears loop 1 at 0 lives left. Seed 6
  died at identical ticks across k values — the honest tell it was bank
  starvation, not the new law.
- Harness lessons: setup() early-returns unless screen==='play'; canvas
  pixel-toggles need >=1 frame settle between mutate and getImageData or the
  read races the paint (gold HUD leg flaked exactly once before the fix);
  Space-jump leg hardened from single-shot to poll after one stalled-frame
  miss. Prod-verify: join BASE+entry with care — a leading "/" in the entry
  match makes `BASE/entry` a double-slash 404 stub (12 wasted polls);
  Contra is a LAZY chunk — crawl the dynamic-import graph, and use node, not
  shell sed/tr, to walk it.

## OPEN
- #2901 R-TYPE speed-up — building (slot b).
- #2902 filed — QA CONTRA loop-presentation pass (banner, heat palette, sound
  escalation, attract demo loop, phone legibility of the LOOP tag).
- building-qa: #2899 (app chrome PAUSE covers top-right canvas ink — the
  region where CONTRA's LOOP n tag lives; whoever fixes chrome checks it),
  #2889 (DD guardian-read). Feedback unowned: #2897, #2863.
- CONTRA README honest gaps now 1: sniper-perch drift / grenadier rifle —
  idle-kick will answer `CONTRA 0` again (score 1) or rank by competition.
- Open question issues: #2846 (flagship public promotion; default keep
  private, AWAITING — not mine to wait on).

## NOTES for the next lane
- #2894 harness surface (reuse, don't re-invent): makeGame(seed, loop),
  setup({ loop: n }), probe {loop, lk, seed}, DebugKit LOOP +1, exports
  loopK/LOOP_STEP/LOOP_CAP/LOOP_LIFE_BONUS/LOOP_LIVES_MAX. Cascade stays
  pinned — mutants cascade-random/vine-* keep their anchors; nothing moved.
- loopK float law: k = min(1.30, 1 + 0.10*(n-1)); intervals scale
  Math.round(x / gs.lk); shutter advances coreT += gs.lk (makeBoss starts
  coreT at 30 — measure deltas, not face values).
- The vine/pixel legs remain the flake-prone ones (with-bare margin ~12 vs
  observed swings 9..27): rerun once per the rule before believing them.

## WORKTREES
- Main checkout ~/Dev/retrogames: detached origin/main (this STATE commit on
  top of 9a80e99).
- ~/Dev/retrogames-forge-contra-loop — reaped (remote branch gone on merge).
- Ports: a's 5173 stopped at close (devstop.sh, verified free). Slot b's and
  QA nodes untouched.

## Open questions
- #2846 — promote CONTRA/R-TYPE/DD to public? (default keep private.)
