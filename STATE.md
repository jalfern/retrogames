# STATE — forge board snapshot (slot b, 2026-11-26 — ADVENTURE roam SHIPPED: #3489 closed)

## This session — resumed corpse #3489, closed it
- TARGET #3517 (Invaders 55-opening) REFUSED at claim — slot a holds it fresh
  (claimed 12:48Z). Normal ladder: steer 0 · `next` #1712 is waiting-jon
  (skipped) · game-queue empty · step-1b: slot's own corpse #3489
  (draft PR #3505, `forge/adventure-polish` at 50716f1) — resumed.
- Implemented the PR-body resume plan and then some. **PR #3505 MERGED as
  41f657f; #3489 closed** (labels building→shipped, live URL commented).
- What landed (route.js guide v4 + sim roam law from prior session):
  - **decoy-post bat trade** — the swap law is room-bound, so the guide
    marches to the bat's room (or calm doorstep), plants filtered currency
    (keys spend only after their gate opened), and dwell-time does the swap.
    Replaced the pixel-chase (20k burns) AND the far-camping (40k burns).
  - **shared wait-credit** — one 30k pool per drive (WeakMap beside the sim,
    inputs-only law intact); stacked per-attempt waits can no longer burn the
    60k budget. Starved-credit mutant → 4 gates red (load-bearing proven).
  - **either-cup fetchGrail** — #3482's duplicate law was unlearned; seeds
    dropped a winning cup to re-fetch its twin.
  - driveTo vortex cap 5000→1800; README roam-gap line corrected, #3489
    engine section + honest gaps written.
- **adventurecheck 212/0**: V1/V2/V3 route wins 10/10 each (was 8/10+10/10+
  9/10), zero deaths, seed-6 late recovery + determinism untouched.
- Out-of-contract probe (seeds 11–30): ~10% losses why `bridge`/`red floor`
  (bat camps haul behind den doors) + 1 death — filed to QA lane as **#3524**.

## BOARD facts at close
- game-queue = 0 · building = #3517 (slot a) · building-qa = #3497 ·
  feedback = #3524 (new), #3506 (closed by #3519), #3244, #2971.
- Rule-4 satisfied: game code merged this session (#3505).
- main moved fast while I merged: #3519 (pong quit-card) and #3522
  (spy-hunter art) landed between claim and close.

## PLAYABLE on main right now
- ADVENTURE: 19 rooms, roaming dragons, guide v4 watch seat —
  https://jalfern.com/retrogames/adventure (prod verified: Vercel deploy
  41f657f @14:02:58Z, last-modified matches).
- pong tiers + honest quit card, defender stage-4, rogue staves & flee.

## Open questions (links only — #605)
- #3335 — QA music-bus low-pass (AWAITING, deadline Nov 27; PINBALL gate).
- #3516 — Arkanoid art rung (AWAITING, Nov 28).
- #3054 — TestFlight recorder; #2971 — contra polish; #1712 — PLAICRAFT S2.
- No new jonq questions this session (resume work; no taste calls).

## Slot state at handoff
- Slot-b dev server never started this session (sim-level work only) — nothing
  to devstop on :5178.
- Worktree ~/Dev/retrogames-forge-adventure-polish is DONE with (PR merged;
  branch deleted remote+local by mergeclean; worktree left detached at
  origin/main — safe to `git worktree remove` next session).
- Main checkout detached at origin/main; STATE.md committed per rule 9
  (game merged) and parked to /tmp/forge/STATE.b.parked.md.

## Next claims (for whoever is free)
1. Ladder is thin: steer 0, next = #1712 (waiting-jon — skip until answered),
   game-queue empty → never-dry path: `node scripts/idle-kick.mjs` fresh;
   flagship README gaps vs open issues before filing (phantom-check class
   still live — #3517's own pick history).
2. If #3517 merges slot-a's invaders stage first, its QA polish issue will
   arrive; QA #3524 (ADVENTURE hoard-camp seeds) is builder-adjacent — the
   patience-currency fix there is game code and never-dry-eligible.
