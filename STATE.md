# STATE — session 292 (2026-11-15, slot b)

## Playable now / what shipped
- **BOULDER DASH: the firefly escapes its pit (#2364 → PR #2373, merge
  `0d0da05`).** `CFG.flyTravel`: the fly holds its heading and bounces
  (steel-only turns) instead of rotating every tick, so an open corridor is
  an exit. FLY PIT gets a dust-seam door in the east wall + a roof flight
  corridor; digging the shaft under the pit drains the boulder plugs and the
  fly comes out and ignites the dust chain. Containment pin: the planner's
  normal route never releases it. (Design correction from the corpse's
  14:30 comment: gravity-plug floor was impossible — dig-under-rock is
  lethal same-tick; the shipped seam respects both laws.)
- Gates at ship (by the resumed corpse, re-verified on CI): dashcheck 54/54
  plain, 61/61 with all 7 mutants caught incl. `flyTravel`; real-browser
  drive 5/5 scenarios zero page errors; `static` SUCCESS on CI.
- Prod verified: marker `flyTravel` live in `assets/index-D04W9-wQ.js` at
  www.jalfern.com/retrogames. Live: https://www.jalfern.com/retrogames/boulder-dash
- QA polish pass for the feature: **#2374** (open, feedback).

## Ladder (this session's path)
- Warden target **#2364**: claim succeeded (slot b held it since 13:53Z).
  Step 1b hit before the ladder: the issue was `building` with pushed
  `forge/fly-release` (2 commits ahead, PR #2373 filed, all gates green) —
  a slot-b corpse one merge away. Merge had been blocked by the #2370
  red-main freeze; `main-ok` was clear, `static` SUCCESS → rule-5 merge ran.
- One game per session → no second claim.

## BOARD at exit
- building: **#2375** (Missile Battle smart-bomb dodge — other lane).
- building-qa: #2343 (TidyBot). QA MASTER live.
- game-queue: empty. `next`: #1711 (Jon-side only; jonq #2305 AWAITING
  until 11-17, default hold).
- feedback (unclaimed candidates): #2374 (BoulderDash fly polish — fresh),
  #2367 (Sonar), #2363 (BombDefuse), #2353/#2354/#2355/#2356 (owned audit
  notes), #2359 (QA calibration).

## Next (slot a or b, in order)
1. Ladder as usual. If never-dry: run `weakestStage` fresh — don't copy.
   QA lanes are live, so the feedback borrow stays blocked; flagshipStage was
   null last checks but re-derive before trusting that.
2. If jonq #2305 answers → execute (lane:platform relabel chain, #2093).
3. #2374 is the natural first feedback item once QA frees up — small,
   well-scoped (fly trail/telegraph polish on the new escape).

## The session's catches
- **Prod markers must be introduced *by* the PR.** "FLY PIT" passed the grep
  for ten minutes before noticing the pit predated the change; `flyTravel`
  (the new CFG property, property names survive minify) was the discriminator.
- **jalfern.com 308-redirects to www.jalfern.com.** Bare `curl` on the
  prod-verify URL returns a "Redirecting..." stub with no asset refs — every
  poll false-reds. Use `curl -L` (or the www host) in verify scripts.
- A dead lane leaves its dev server behind: found a slot-b vite still holding
  5178 after the session died; SIGTERM'd it at exit.

## Hygiene at exit
- Dev server 5178 stopped (the corpse's zombie, pid 28198; own slot only);
  foreign ports untouched.
- Slot-b forge worktree (fly-release) removed; branch deleted by squash
  merge; main checkout detached at origin/main. STATE committed to main
  (game merged) + statepark slot b.
