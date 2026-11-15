# STATE — session 282 (2026-11-15, slot b)

## Playable now / what shipped
- **ARENA ARCHERY climbs on purpose (#2307 → PR #2312, merge `ca1f66d`, LIVE
  at /retrogames/arena-archery).** The autopilot owns the vertical game:
  every 12 ticks `reachableStep` scans the slab ahead; `hopGrants` replays
  the exact plan (run-up at speed, take-off 2–5 cells out, land 1–2 past the
  near edge) through the REAL `moveBody` before committing. Commitment lives
  on the player; failed landings ban the cell + 20-tick cooldown; the climb
  owns the feet while committed; from a perch only solved arcs fire
  (`hopelessHigh`, rain shot added to the solver). Climbing is tempo, not
  survival: it releases when the quiver thins to 2 (the slack rule caught
  the perched-and-dry loss before this gate existed).
  - **The arenas were physically unclimbable**: two-row slabs presented 58 px
    of rise vs the integrator's MEASURED 51 px apex — the closed-form contract
    (jump²/2g = 48) passed while the claim was fiction. Re-carved to one-row
    steps sized to the apex; THE NEST restored (dropped mid-rewrite) as
    CROSSGLOVE's proven geometry + a roof-blocked sniper cupola.
  - archerycheck: **146/146, eight mutants die** (new: `climbSeek:false`;
    lob-bot now also patches `climbSeek:false`). New CLIMBS receipts are
    grounded-row → grounded-row: CROSSGLOVE 3-2@996 +10 rows, KNOCKBACK
    3-0@685 +18 (row-3 balconies), THE NEST 3-2@996 +10. Slack, determinism
    ×3, per-tick arrow ledger, worstGap<150 all unchanged. lint mario/fps/ai
    + eslint + build green. archeryplay 16/18 — the two SPACE-charge fails
    reproduce identically on untouched main (pre-existing advisory issue).
    Prod verified: `index-DNBuSHHs.js` carries `THE NEST`.
- Rule 4: game code shipped. QA polish pass filed: **#2314**.

## Ladder (this session's path)
- Warden target **#2306 → REFUSED** (another lane's claim newer). #1711
  PLAICRAFT: re-grade returned "nothing new to grade" (Jon-side only — clap
  test store unchanged, jonq #2305 still awaiting). QA borrow skipped
  (`QA MASTER` live). Flagship stage spent → **never-dry rung**:
  `weakestStage` → ARENA ARCHERY score 3 (gap "the bot never climbs ledge
  chains deliberately"; held-titles excluded). Filed #2307, claimed, shipped.

## BOARD at exit
- game-queue EMPTY. building: none open. building-qa: none open.
- feedback: **#2313** (QA — WWI DOGFIGHT polish, slot a), **#2314**
  (QA — ARENA ARCHERY polish, mine) — the QA lane's queue.
- jonq open: **#2305** (lane:platform, AWAITING — not ours to wait on).
- #1711 `next` — Jon-side remainder unchanged. No halt, no steer.

## Next (slot a or b, in order)
1. Ladder as before; expect never-dry again. Weakest candidates (score 3,
   oldest registry first, minus whatever lanes claim meanwhile): TEN-DEEP,
   PRINCE OF PERSIA, GARDEN GUARD, VIPER PIT, BRITANNIA, FLOOR BOSS,
   SHORT ORDER SHOUT, GRAVEL YARD, TALK ME DOWN, BOMB DEFUSE.
2. If a jonq answer lands for #2305 (write key), execute the #2093 relabel
   one-off; a clap-test take on the store means grade it + post to
   #1711/#2156 (closes #2156 evidence).

## The session's catches
- **Closed-form contracts don't prove physics.** jump²/2g said 48 and passed;
  the integrator actually rises 51 and the slabs asked 58. Measure apexes by
  replaying `moveBody`, then carve levels to the measurement (levels.js now
  says so, and CLIMBS receipts keep it true).
- **A rewrite can silently shrink the roster.** levels.js lost THE NEST mid-
  rewrite (ARENAS_COUNT 2 vs 3) and the audit stayed green because the loop
  just iterated fewer arenas. Assert COUNT + names after wholesale rewrites.
- **Opts are not CFG.** `makeGame(arena, {climbSeek:false})` left the flag
  set — the first mutant run was silently a no-op. Mutate CFG directly (that
  is what `tryMut` does; scratch probes must too).
- **Receipts must be un-fakeable.** A mid-air min-row brush-past counts a
  climb a grounded-row → grounded-row metric doesn't; the first receipts
  over-counted until the metric matched the doctrine.

## Hygiene at exit
- Dev servers :5178 and the temp :5175 stopped (never touched other lanes').
- Slot-b worktree removed after merge (gh delete-branch); main checkout
  re-detached at origin/main `ca1f66d`.
- STATE.md committed to main (game code merged — rule 9) + statepark slot b.
