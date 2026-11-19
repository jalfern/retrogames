# STATE.md — The Forge (rewritten at close of session 355, slot b — 2026-11-19;
# folds session 354's report: its shipped lines are on main and in git history.)

## SHIPPED THIS SESSION — #2783 CLOSED (FORGE: shipped)
**FLOOR BOSS swing-aware courtesy.** PR #2785 (branch `forge/floorboss-body-sweep`);
`static` SUCCESS, squash merged; #2783 closed `shipped`. Never-dry ladder pick:
`idle-kick` answered `KICK FLOOR BOSS 0 weak` — the only unowned honest gap on the
shelf (flagship stage spent; all flagship README gaps CLOSED).

**Measured first, then legislated (numbers live on #2783):**
- 10 autopilot careers: loaded pivots ghost-swing THROUGH rivals 47 knee + 40 tail
  times; **12 of 64 courtesy ducks parked on a sweep cell of the blocking plan** —
  courtesy became the jam it ducked for.
- Shipped: `pullOff` skips knee/tail cells of the blocking rival's plan (`swingOf`,
  pure, fixed order, zero footprint). Post-law: 0 ducks in any sweep, courtesy alive,
  10/10 audited seeds still win shift 1, jams 0, twins byte-identical.
- `floorbosscheck` §COURTESY +8 gates; `--mutate-courtesy` **killed** (mutant RED).
- New exports for the next slice: `pivotSweep`/`swingOf`/`liveRights` + `swingBodies`
  DEV eye (index.jsx).

**Refused as measured, not assumed (spec carried on #2783 + README):**
- Deep-rack placement at radius 2: kneeNet 142,653 reachable cells / 500 boards,
  radius-2 net strands **2,230** — netdiff ≠ 0 (#2760's netdiff=0 stops at radius √2).
  Needs blueprint re-placement, not a traffic tweak.
- Turn-hold (right of way at pivots): built + measured + HELD BACK — congested floors
  cascade (seed 107: 97 holds, missed quota; jam-escalation ×56 over-call;
  repath-on-timeout oscillated to scores 44/21). Next slice's spec: body-reservation
  (reserve sweep against rivals' next cells) + hold cooldown; `swingBodies` is the
  live audit. Straight tip-space (49/10 careers) unenforced — collides with jam law.
- Honesty note posted on #2783: an early checkpoint quoted a netdiff measurement
  before the run finished; corrected with measured numbers in ck2. Rule-8 lesson:
  the output before the number.

## PLAYABLE
`/retrogames/floor-boss` — unchanged surface; courtesy bays now dodge the rival's
sweep. `/retrogames/contra` joined the shelf this afternoon (slot a, #2781/#2784).

## BOARD
- **#1711 (open, `next`)** — S1 waits ONLY on Jon's ≥3-pair phone clap take
  (jonq **#2652** AWAITING, deadline 2026-11-20 01:36Z; default = keep waiting).
  Lines 1/2/4 hold; line 3 machine half re-proven (witness schedule run
  44567204499 green on main). Swept at claim and release; no lane-side work left.
- **#2779 CONTRA** — slot a's building issue; S1+S1-polish merged, stage may stay
  open (multi-stage commission #1530) — check its PR body `Part of` lines next sweep.
- **#2783 — CLOSED shipped this session.**

## QUEUE (re-derive at main — never plan from a remembered snapshot)
1. `git fetch && git checkout --detach origin/main`, then `node scripts/idle-kick.mjs`,
   then the #1045 ladder. Expect a FLOOR BOSS weak-kick again if the lane wants the
   next body slice — its spec is the turn-hold churn data on #2783 (body-reservation
   + cooldown; budget a full session, it changes cadence economics and needs the
   career/attract marks re-measured, like #2724/#2760).
2. #1711 — sweep the store for Jon's clap take; if #2652 defaulted by then, follow
   its recorded default.

## QUESTIONS OUT (jonq issues, not STATE.md — #605)
- #2652 (AWAITING, lane:platform, deadline 2026-11-20 01:36Z) — Jon's clap take or
  waive the phone shape.
- #2751 (AWAITING, lane:qa, deadline 2026-11-21 03:40Z) — QA focus.
- Nothing filed from slot b this session — the slice followed spec; refusals were
  measurement calls with numbers, not taste questions.

## HARNESS NOTES FOR THE NEXT LANE
- `pullOff` now consults `swingOf(rival)` — a parked rival with an empty path owns
  no swing (the filter is plan-driven); expect fewer, safer ducks (~9 vs ~64 per ten
  careers at the audited seeds). #2700's attract-window gate still passes as-is;
  if a future cadence law changes duck timing, re-sweep ATTRACT_SEEDS honestly.
- Body-in-swing audits must use **commit-time (pre-tick) occupancy** — post-tick
  positions fabricate same-cadence cross-clips (this session burned a cycle on it).
- mutateguard refused `--mutate-*` on a dirty tree (#2047 law) — commit first, then
  mutate; the refusal exit (1) is NOT a mutant kill.

## SLOT B LOG
Claimed #1711 by warden target → swept clean → released to `next` with evidence.
Filed POLISH #2783 from the never-dry kick, claimed, built in
`retrogames-forge-floorboss-body` (dir vanished mid-session — branch safe on origin;
worktree recreated by the merge lane, prune stale registrations with
`git worktree prune` if it complains). Gates: floorbosscheck all green ×2 + mutant
kill + lint(mario/fps/ai) + eslint + build green. Merged via rule-5 command.
