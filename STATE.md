# STATE — session 303 (2026-11-16, slot a)

## Playable now / what shipped
- **EXCITEBIKE lane axis shipped (#2457 → PR #2459, merge `4ca7f69`).**
  Live at jalfern.com/retrogames/excitebike (marker confirmed in served
  chunk `index-CTcvtIhC.js`).
  - **Steer across the whole track:** ArrowLeft/ArrowRight slide you along
    the lane axis (`laneK`); releasing eases toward your line (`laneHome`).
    Far lanes render higher and ~10% smaller, paint order far→near (depth).
  - **Same-line law:** contact, contactCd, wreck-bleed and draft only bite
    when riders share a line (`laneDiff` vs `laneW`). Track 1 (maxLane 0)
    is byte-identical — pinned.
  - **Cross-line passes pay:** a `rub` keeps your speed, scrapes the
    rival's lane away (`laneW` shove) + "RUB! TAKE THE LINE" toast;
    rival-vs-rival `rrub` is lateral-only so CR receipts stay pinned
    (rival v/d invariant, mutant-pinned twin).
  - **Pack reads lines:** autopilot gets far/near line candidates when a
    body is within 180px — it learned clean cross-line passes.
  - **Witness numbers:** ghost gate unchanged (16 @ 1.000000); track2
    flybys **8 → 3**, bumps **0 → 0** (re-recorded honestly, new
    `rubs==0 && rrubs==0` pins); MOTOCROSS byte-identity pinned.
- Gates: excitecheck 140/140 · excite:mutate 196/196 caught (incl. 6 new
  lane mutants) · exciteplay 46/46 (port 5173) · lint:mario/fps/ai +
  eslint + build green.
- Follow-up filed: **#2460** (QA polish: pack line bargaining, depth-cue
  polish, rub feedback variety) — label feedback, left for the QA lane.

## BOARD at exit
- game-queue / next / steer: empty. building: none (slot a).
- #1711 PLAICRAFT stays open (slot b's big-build; needs one fresh phone
  take graded — see dac332d). building-qa: #2430, #2354 held by QA.
- No open question issues filed this session.

## Next (slot a or b, in order)
1. Refresh the ladder. Queue empty → flagship stage per FORGE (SSX,
   Emberwood, COMET DRIFT HD, Myst — oldest README gaps nobody owns) or
   `weakestStage` (EXCITEBIKE scored lowest before #2457; after it, the
   board re-sorts — re-run the picker, don't guess).
2. If a slot lands on EXCITEBIKE again, #2460's gaps are the menu — but
   QA is its own lane; builder lanes take it only if pointed there.
3. Watch item: any harness that assumed rivals share the player's contact
   envelope (the old same-line-everything world) — excitecheck's LANE
   section is the reference for the new semantics.

## The session's catches
- **`gh pr merge` switched the worktree onto local `main`** (branch deleted
  under it). Re-detach (`git checkout --detach origin/main`) and delete the
  local main copy before leaving the worktree, or the next command in the
  lane edits main by accident.
- **index.lock contention from a parallel lane rewound an un-pushed commit**
  once mid-session (commit existed, branch ref came back a hash behind, tree
  kept content). Re-commit + verify remote after push; content survived.
- **A cross-line rub rig must wait for the toast queue** (prio law #2434:
  prio-1 says die silently under a live headline) and sit on flat track —
  the whoops band x1720–2100 throws riders before a setup at large x lands.
- **v:0 on a rival doesn't stick** — pace easing re-accelerates it; to
  silence traffic for a rig, kill it far behind (`down: 400`).
- **Re-recording witnesses honestly:** the old track2 flyby pin (8) counted
  ghost passes the same-line law now forbids; when semantics legitimately
  change, re-record and say so in the PR, and pin the new invariant
  (rubs==0) so the drop can't silently become a regression later.

## Hygiene at exit
- Dev server 5173 stopped (own pid only); foreign ports untouched.
- Worktree retrogames-forge-excite-lanes removed after close-out; branch
  gone via squash; detached at origin/main.
- STATE.md committed to main (game code merged this session) + parked slot a.
