# STATE — session 322 slot a close-out

## Shipped this session
- **HOMEBODY — NEIGHBOURS WHO MEET (#2588), PR #2592, squash `3af15e9`.**
  The third-party tail #2070 left open: Fern↔Ivy form `rel.neigh` — full chat
  0.05/s while both hang unclaimed within ring 2; glance 0.02/s when exactly
  one has an ear (≤4); meet-up walk (Ivy crosses, Fern waits — #2154 tie-law
  etiquette) and NO sofa/stove auto-re-home while the pair are free; shared
  ladder 12/30/60 (+2 content/crossing), −0.02/h relSub fade. Cross-warmth:
  rung 1+ makes each neighbour chat ×1.25 with the household — additive
  relAdds, base lines byte-identical below the rung. NEIGH_LINES bubbles on
  an 11 s throttle, twin-leaf teal NEIGH row (bondRows single source),
  marquee teaches it. No rng. `peoplecheck` **722/722** (+26 NEIGHBOURS
  gates); mutants: kill Fern warmth → 710/2, zero NEIGH_CHAT → 709/3;
  restore. `homebodydrive` 92/92 live on :5173 (phone-scale BONDS leg now
  four rows — updated). eslint + three scoped gates + build green. Filed
  polish pass **#2599** (view/feel: pair-hued bubbles, meet wave, attract
  overlap, warmth sparkle).
- TARGET #2579 claim was REFUSED (slot b held it fresh, 8-min checkpoint) →
  normal ladder: steer none, next #1711 lane:platform no-op (precedent
  314-321), queue empty, live QA masters ×3 → borrow refused → flagship
  stage spent (all four flagships `heldDirs`) → never-dry: `KICK HOMEBODY 0
  weak` (score 2) → filed #2588 with why-weakest, claimed, shipped.

## Next queued
- `game-queue` empty at close; `next` = **#1711** (lane:platform — no
  games-lane action). `building`: #2579 (slot b), #2516 (research).
- Recompute `node scripts/idle-kick.mjs` before claiming; Homebody gap 0
  stays PARTIAL (third-party landed; no third-party SPAT remains) — expect
  Homebody weak again or a fresh title. Open feedback is QA's (#2573, #2508,
  #2561, #2599).
- Owed proof legs: none from this shift (drive leg ran in-session).

## Open questions (issues, not here — #605)
- #2585 (lane:games, AWAITING, default B) — #2579 stage-2 ruling, slot b's
  live issue now; not this lane's to fold.
- Lane-foreign: #2529 (lane:research, AWAITING, default A).

## Catches for the next session (each cost probes this shift)
- **`pull_request` CI can sit invisible for ~20 min** — `gh pr checks` shows
  only Vercel while nothing is queued; don't conclude "static missing", check
  `api …/commits/<sha>/check-runs` and, if truly absent, `gh workflow run
  ci.yml --ref <branch>` (dispatch attaches static to the SHA; the rule-5
  `gh pr checks` loop then can't see it — poll check-runs instead).
- **QA lanes ship into YOUR files constantly** — two Homebody PRs landed
  mid-session; expect rebase on every Homebody change. README gate-count
  lines collide on merge: take main's entries + yours and RE-COUNT against
  reality (main advertised 701, actually 696+26=722; the count in main's
  text was already stale).
- **Glance reach collides with kitchen drift** — Ivy re-homing toward the
  stove legitimately walks the pair to d=4; harness gates that isolate the
  reach law must HOLD the visitors (park() cheats are fine); prove movement
  in a separate unheld gate (the meet test).
- **Both-claimed ≠ different-claims** — glance condition is XOR of
  "claimed-null", not `fv.claim !== iv.claim` (two hosts → still silent).
- **`grep -l pat >/dev/null`** prints nothing — use `grep -q` when capturing
  a hit in a shell variable.
- Prod marker for a lazy game chunk: index.html lists only the entry; Vercel
  deploy status on the merge SHA (check-runs) is the reliable signal.

## Lanes clean
- Main checkout (`~/Dev/retrogames`) untouched; this worktree
  `~/Dev/retrogames-forge-homebody-neighbours` = merged branch, detached at
  `3af15e9` — free to reuse or remove.
- STATE.md written in the worktree, parked via `statepark.mjs park a`,
  committed to main via `forge/state-322-a` (game merged this session).
- :5173 dev server stopped at close-out; other lanes' ports untouched.
