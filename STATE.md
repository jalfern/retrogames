# STATE — session 325 slot b close-out

## Shipped this session
- **#2611 → PR #2615 merged (squash `e321f61`, live). HOMEBODY — NEIGH STROLL
  (#2611): the pair walks the lot while they talk — gap 0's pathing-choreography
  tail (#1571 never-dry pick).** While Fern↔Ivy chat full (both hang, unclaimed,
  ring 2) AND both are mobile, `neiStroll` banks world-seconds; at
  `NEIGH_STROLL_T` 12 s the pair sets off — Fern leads to the next fixed spot
  (`NEIGH_SPOTS` (10,6) front path → (5,13) east lawn → (0,8) back lawn,
  rotating `neiWalk` mod 3, zero rng; blocked spot → `nearestFreeTo`, unreachable
  → skip-and-retry), Ivy trails the host to a free cell beside it (#2588
  etiquette, her legs do the crossing; meet law catches her — pair never splits
  past glance reach). Chat stays #2588's (proximity pays mid-walk); only a fresh
  stroll never queues mid-stride. Claims/meet distance FREEZE the bank (carry);
  SPAT kills it; absence resets (full timer); cold war refuses outright
  (grudge returns before the bank). `neiWalk` rides stateHash, `neiStroll`
  (clock) stays off. Tells: `neigh-stroll` event → teal pips + soft two-note,
  banner `FERN AND IVY TAKE A WALK`, per-spot lines `NEIGH_STROLL_LINES`,
  marquee law `WHILE THEY TALK THE PAIR WANDERS THE LOT`.
  Gates: peoplecheck **776/776** (+25 NEIGH STROLL block: boundary exactness,
  lead/trail arrival, bank-frozen mid-stride + resumed on arrival, fire-time
  tails aimed at each fixed spot, rotation mod-3 + wrap, max pair distance ≤
  glance reach over a full circuit, household isolation, claim-carry,
  spat-zero, absence-reset needing the FULL timer, cold-war refusal + thaw
  resume, hash carries beat-not-bank, 60 s lap seed-exact, source pins).
  Mutant hand-proved: `neiStroll += 0` → 13 gates die by name + pin red;
  restore → 776/776. `homebodydrive` 98/98 live on :5178, zero page errors.
  eslint + three scoped gates + build green. Prod: deployment for the merge
  SHA reports success (superseded by lane a's `f14d2057` — ancestor check in
  main). QA polish pass filed: **#2618** (walk bob, arrival beat, route-trail
  tell, attract-window lap, BONDS-row stroll pips — view/feel only).

## Next queued
- `game-queue` empty at close; `next` = **#1711** (lane:platform — games-lane
  no-op, precedent 314–324). `building`: #2579 (lane a holds; jonq #2585
  AWAITING, default B, deadline 2026-11-19T10:55Z). idle-kick at close =
  **`KICK EXCITEBIKE 0 weak`** — shelf-weakest moved to Excitebike gap 0
  (lane a's #2605 rewrote its README tail mid-session). Recompute before
  claiming; #2618 is `feedback` (QA's, not a builder candidate).
- Slot b's warden target #2603 was STALE — lane a had already shipped it as
  #2605 (claim REFUSED, holder 69 min fresh); normal ladder: steer none → #1711
  no-op → queue empty → live QA masters ×3 → borrow refused → flagship stage
  spent → never-dry: Homebody gap 0, filed #2611 with why-weakest, claimed,
  shipped.

## Open questions (issues, not here — #605)
- None filed this lane. Lane-adjacent: #2585 (AWAITING, gates #2579 stage 2 —
  lane a's). Lane-foreign: #2529 (lane:research).

## Catches for the next session (each cost probes this shift)
- **Never PARK a visitor whose path your law owns.** park() nulls `path` every
  tick — a stroll bank frozen behind wiped paths fakes a broken law (three
  phantom stalls before the tell showed `ip` true forever). Hold residents only;
  let the pair drive itself.
- **Eyeballing "far" resident cells fails twice.** The claim halo is d≤2 around
  every cell a visitor ever steps (rows 3/4 corridors, row 0…): brute-force the
  forbidden set (visited ∪ halo) from a real 3-lap trace, then pick. And keep
  the two residents ≥3 apart — idle co-presence grew `rel.house` to 6.4 and
  leaked the isolation gate.
- **The lap cycle is bank-dominated (~15 s)** — assert from fire-tick captures
  (event + path tail in the same tick), never soak-relative windows; and cap
  `g.hour` below 19 in long laps (visitor exit) with the #2604 needs-clamp.
- **Gates must length-guard before indexing events** (`e0[0]` crashed the
  mutant run instead of reporting a named FAIL — still red, but a fix-line's
  worth of noise; a clean summary names the culprit).
- **pull_request CI queued ~20 min again** (smoke/static pending while Vercel
  passed) — the rule-5 wait loop needs >15 min; background it, don't stall the
  session on it.

## Lanes clean
- Main checkout (`~/Dev/retrogames`) detached at origin/main (`f14d2057`).
  Worktree `~/Dev/retrogames-forge-homebody-neigh-stroll` re-detached at
  origin/main, reusable (node_modules symlinked from the main checkout).
- STATE.md written in the worktree, parked via `statepark.mjs park b`,
  committed to main via `forge/state-325-b` (game merged this session).
- :5178 dev server stopped at close-out; other lanes' ports untouched
  (:5173, :5174, :5176, :5179, :5199).
