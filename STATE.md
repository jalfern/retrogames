# STATE — session 156 (2026-11-06, slot a)

## What shipped
**COMET DRIFT GP — deliberate drift-economy for the field (#1687) — PR #1689
squash-merged `c996fcd`, LIVE.** Never-dry rung (#1571): weakestStage scored
CometDrift 8 (top unheld; MagicCarpet 9 held by QA's #1681), oldest ACTIONABLE
gap ("CPU karts never chain multi-tier drifts" — gaps 0-3/5-7 exhausted,
#431/#419-decided, or accepted). Target #1637 correctly REFUSED (b live, 30
min checkpoint) → normal ladder → flagship stage spent (all flagship README
gaps owned/CLOSED) → never-dry.
`DRIFT_PLAN` (sim.js): skill-scaled tier target (>=0.84 gold, >=0.81 violet,
else blue), hungry drifts hold across corner-chains (aheadK x2.4 window),
bank-onto-exit release when the target is met, on-road+wall-free start/hold,
hard cap 170 ticks. `decide()` branch untouched (static-gated). Measured
(4 courses x 12 seeds): rival tier-points +12-61%/course, violets up
everywhere, front-vs-back gold 313/209 = 1.50x (was flat 1.14x), rival spins
unchanged (seeded mistakes are spec), player 12/12 every course. 15 new
cometcheck gates (per-course pts/violet/spin floors on seeds 0/7/9/42, pack
gradient, design-lock, decide-pin); corner-luck mutant dies red on every
floor. cometplay 29/29; prod chunk selector-Di-AX2No.js verified serving
`kBend`. Residual gaps opened in README (no boost-link combo; static targets).

## Lessons (worth keeping)
- **weakestStage's top gap can be an EXHAUSTED one**: CometDrift gap 0 read
  "what is left is real" — the never-dry pick must still ship ONE player-
  noticeable fix, so take the oldest gap that is actionable and say so in the
  issue. Flagship parseGaps said 0 for all four flagships — that stage is
  genuinely spent; expect never-dry every session until a new flagship lands.
- **Mutant polarity in this repo**: the died/SURVIVED reporters key on
  R.fail INCREASING while planted — write mutant-probe checks at the REAL
  floor (they fail red under the mutant), not inverted "mutant falls under"
  checks (they pass green and the reporter cries BLIND).
- **Slot b merged #1688 mid-session: #1679 FIXED** (mutateguard accepts URLs)
  — cometcheck --mutate should now run end-to-end on main; old STATE
  workarounds for it are obsolete.
- pgrep cannot see processes in this environment ("sysmond service not found")
  — QA-liveness must be judged from labels/comments (a `building-qa` issue =
  QA lane live), not pgrep.
- gh-shim notes held true: checks `state` vocab still unusable (polled
  `conclusion` per STATE 155); `gh issue edit --add-label` avoided via
  `gh api -X PATCH -f labels[]=...`; `gh pr view --json comments` returns a
  NUMBER, not a list.
- **#1430 revert bit me live**: my session-156 STATE.md write to the main
  checkout was silently reverted before I could commit it (a parallel lane's
  step-1 `git checkout -- STATE.md`); the slot-scoped park never saw my
  content. Write STATE.md, then verify+park+commit+push in ONE shell trip.
- #1637 held cleanly all session (b progressed batch 5 checkpoints);
  forge-claim REFUSED as designed at 11:25Z.

## Next (priority order)
1. Normal ladder next slot-a session: no halt/steer/next open; game-queue
   empty (mine shipped); check #1637's claim comments before targeting it.
   Expect never-dry again — flagship stage spent. Recompute weakestStage
   live; ties break to older registry title. Fresh feedback #1685 (Arena
   Archery stalemate, by jalfern) is QA's unless QA liveness says otherwise
   (pgrep is blind here — use labels/comments). #1681 building-qa: check if
   still held.
2. #1676 (harness, lane:platform) and #1679 (now fixed by #1688 — verify and
   close belongs to QA/reporter): not slot-a builder work.
3. If MagicCarpet's `building-qa` clears, it becomes the weakest again
   (~7 unowned gaps).

## Notes for the next slot-a session
- Worktree `~/Dev/retrogames-forge-comet-driftchain` detached at origin/main,
  node_modules symlinked — reusable; branch deleted both ends.
- Dev server 5173: STARTED and KILLED this session; port free.
- Throwaway measurement probes at /tmp/forge/comet-{baseline,perrival,
  gatenums}.mjs — re-usable for rival-behavior work (ROOT var selects tree).
- cometcheck grew ~16 races from the economy gates; still well under a minute.
  Gate floors are seed-deterministic — move them for TRACK changes, not for
  brain changes (brain changes shift the measurements and SHOULD go red).
- If touching rival drift: re-run the 12-seed sweep; sandbank gold count is
  the most target-sensitive number.

## Open questions
None (`jonq list games`: none open).
