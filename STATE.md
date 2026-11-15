# STATE — session 292 (2026-11-15, slot a)

## Playable now / what shipped
- **MISSILE BATTLE: the smart bomb makes you earn the kill (#2375 → PR #2378,
  merge `56fcaf5`).** JINK rule (`CFG.dodge` + `dodgeOn` mutant switch, sim.js):
  a short-fused blast (≤26 ticks out) within 30px provokes a committed lateral
  escape (14 ticks @1.1) AWAY from the detonation point, budget ONE per bomb +
  cooldown. First interceptor = feint that learns where it runs; next round is
  aimed at the escape. Planner untouched — it re-aims from live px, so slack
  provably survives: 9/battery wins all three waves, proven run 49→54 (cap 84).
  Whoosh sfx + escape streak + `JINK PROOF` dev button. Live:
  jalfern.com/retrogames/missile-battle (Vercel commit-status success on
  `56fcaf5`; `JINK PROOF` is DEV-only, not a prod marker — see catches).
- Gates: `missilecheck` 366→376 (JINK section: quiet-sky silence, far-missile
  silence, away-direction, survive-outside-blast, spent-budget follow-up kill,
  5/5 smart bombs join the fight) + 3 named mutants die (`dodgeOn:false`,
  `budget:0`, `ticks:0`) — mutated 394/394. `missileplay` 26/26 real keys,
  zero page errors. lint mario/fps/ai + eslint + build green.
- **Main was RED at session start** (nightly 43721219725): `worktreepurgecheck`
  sandbox `git merge` died exit 128 — the fixture's only commit without pinned
  identity, stderr `ignore`d. Repro exact: hostile global config reproduced CI's
  "16 passed, 1 failed" line-for-line. A parallel lane shipped the same fix
  (#2370, `2d93a67`); my twin PR #2372 closed as redundant, no hard feelings —
  the liveness namespace kept our diffs off each other's files only by luck of
  timing. Nightly dispatched on main (`gh workflow run`); queue congested,
  main-ok green by contract (latest completed = cancelled ≠ failure).
- Rule 4: game code shipped.

## Ladder (this session's path)
- Warden target **#2364** REFUSED at claim (slot b live — and it shipped as
  #2373 while I fixed main). Clean skip.
- #1711 (`next`) Jon-side only (jonq **#2305** AWAITING, deadline 11-17,
  default hold). Not builder work; skipped, unchanged since 291.
- game-queue empty; QA MASTER live → feedback borrow blocked. Flagships: all
  four READMEs gap-free (0/0/0/0) → flagshipStage null.
- never-dry: `weakestStage` said BRITANNIA score 5, but open audit **#2353**
  adjudicates its two gaps stage-2/check-only ("not stage-1 polish
  candidates"); its README-reword suggestion is still unapplied — whoever next
  touches Britannia owes that edit. BoulderDash owned by fresh #2374; Sonar's
  gap quoted near-verbatim in #2367 (ownsGap missed only the leading "The";
  the law's unsure→owned clause says skip). Score-2 tier, registry order →
  MISSILE BATTLE gap 1. Filed #2375 with the why-weakest chain, claimed, shipped.

## BOARD at exit
- building: NONE. building-qa: NONE (TidyBot #2343 shipped as #2376 by studio
  during this shift).
- game-queue: empty. `next`: #1711 (Jon-side only).
- feedback (unclaimed): #2379 (MissileBattle polish — mine), #2374 (BoulderDash),
  #2367 (Sonar), #2363 (BombDefuse), #2359 (Britannia calibration — QA's),
  #2353/#2354/#2355/#2356 (audit notes — #2353 still owes the README reword).
- jonq open: **#2305** (lane:platform, AWAITING — not ours to wait on).

## Next (slot a or b, in order)
1. Ladder as usual. If never-dry again: run `weakestStage` fresh — don't copy.
   Before scoring Britannia again, apply #2353's reword when touching that dir
   (or the phantom score-5 keeps outranking real work). #2379 item 1 (smart
   bomb splits — the full arcade menagerie) is a fine small stage.
2. If jonq #2305 answers → execute; writeKey at /status → #2093 relabel one-off.
3. A QA lane that grabs #2379 must keep the budget law provable (JINK pins
   exist; escalation must stay pinned, or pin first).

## The session's catches
- **A fixture that passes locally but dies on CI = machine-config dependence.**
  `git merge` takes identity from the runner when no `-c`/env pins it; commit
  helpers pin, the merge didn't. `GIT_CONFIG_GLOBAL=<empty identity>` is a
  one-liner repro of "works on my box" nightly reds — try it before blaming
  flakes. And never `stdio:'ignore'` a fixture's stderr: the freeze lasted
  hours longer than the fix because the error line carried no reason.
- **Nightly queue congestion**: dispatches sat pending 40 min+ behind
  concurrency group `nightly`; `main-ok` says green on `cancelled` — treat
  cancelled-latest as "unproven", dispatch a fresh one after landing a fix.
- Slot b's #2364 comments were `FORGE:` without the slot prefix; the claim
  script still honoured liveness. My claims used the proper `FORGE (a):` shape.
- **Prod-verify for jalfern.com: `curl -L` is mandatory** (apex 308→www; every
  bare curl silently fetched 15 bytes of "Redirecting..."). And DEV-only strings
  (`JINK PROOF`, DebugKit labels) never ship — the authoritative prod signal is
  `gh api .../commits/<sha>/status` = `success Vercel` plus a 200 on the game
  route (property-name greps through the SPA proxy proved unreliable here).

## Hygiene at exit
- Dev server 5173 stopped (own pid only); foreign ports untouched.
- forge/smart-dodge worktree removed; branch gone via squash. Main checkout
  detached at origin/main (`56fcaf5`). STATE committed to main (game merged —
  rule 9) + statepark slot a.
