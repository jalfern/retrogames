# STATE — session 263 (2026-11-14, slot b)

## Playable now / what shipped
- **HOMEBODY got MISO** (`291988a`, PR #2198, closes #2197): the adoptable cat —
  catalog card 15 / `KeyP` / §150, one per lot, honest refusal at the gate; cat-day
  rules (kibble at the fridge, night loaf with energy payback, legal wander — every
  pick asks `walkable()` + BFS); coo economy (resident in reach: cat fun, resident
  social, +0.5 house bond, +1 content, 6 s cooldown); rides `stateHash`; attract
  bot adopts after the room kit. `peoplecheck` **252/252** (225 old pins intact +
  27 cat gates), mutant killed (cut the coo bond feed → behavior + pin red),
  `homebodydrive` 42/42, live sprite probe green (200 tabby px at her position).
  QA polish pass filed: **#2200**.
- **#2194 fixed** (`57ebc0e`, PR #2196): `firecrewplay` gate (c) recalibrated per
  its spec — seed 1 seated now must WIN (the #2178 canary), the ember tell proven
  honestly on an all-human idle route (new DEV hook `unmanned()` mirrors Node
  `setSources`); `--throttle 8` wired. GREEN unthrottled + throttled 36/36; old
  expectation pinned back = red, restored.
- **The parked stack landed:** #2175 (`041208b`, dvh shells) and #2188 (`8a4ed67`,
  PLAICRAFT S1 audit fix) squash-merged rule-5 after rebases. #2155 auto-closed.
  **#1711 STAYS open** — S1 acceptance still wants Jon's 3 phone takes + #2156 +
  #2157 (lanes grade takes; buildable now that #2188 is in — deploy ORDER note in
  relay/README: wrangler SESSION_WRITE_KEY after the #2093 relabel one-off).
- **FURLONG #2182 shipped by slot a** (`43f367f`, PR #2191) while this session ran
  the queue — slot a's STATE commit `e380035` followed.
- Nightly **43568372143** dispatched on `291988a` (cat tip: exercises the #2194
  calibration + peoplecheck with the pet). Pending at exit — next lane, check it.

## Prod
Vercel production deploys for `291988a` and `e380035` both report success and
`demos/furlong.html` already serves 200 — but the jalfern.com wrapper kept
serving a cached SPA index (age ~27 min) whose entry predates the merges; MISO
not yet in the served chunk at exit. Honest status posted on #2197. It will age
out; hard-refresh `https://jalfern.com/retrogames/homebody` to verify.

## Next (slot a or b, in order)
1. Check nightly 43568372143. Green = main is properly green again (first full
   suite since #2194). Red = rule 5a: fix or quarantine naming #2194-adjacent issue.
2. #2200 is QA's (Homebody polish). Builders keep off it.
3. Ladder is empty again — `weakestStage` again at the next kick; kids (Homebody)
   and the panel-pet-row stage are the known candidates; flagship gaps all shipped.
4. #1711 tail: #2157 (lanes grade takes) is safe to build; JON_KEY local-file ask
   per its body.

## The session's catches
- **Zombie lane (#2182):** slot a posted "session end / WIP parked" then kept
  editing and pushing for 25+ min. Its claim was 93 min stale so `forge-claim` let
  b take #2182 — b yielded (comment on #2182) on mtime + live 5173 evidence rather
  than double-drive one file. Slot a then shipped it — the yield was correct.
  Liveness by comments can't see a lane that doesn't checkpoint; port + file mtimes
  are the ground truth. (#1258 fodder.)
- `start(seed, players)` seats **cpu partners** — a browser "unmanned" route needs
  ALL sources human; hence the `unmanned()` dev hook (Node parity was the tell).
- Fixed step-count sampling walked PAST the tell threshold (calmEdge caught the lit
  frame) — walk tick-conditionally around a threshold.
- jalfern.com wrapper caches the SPA HTML long after a *successful* Vercel deploy:
  static public/ files go live first. Verify BOTH; don't trust the served index hash.
- `gh workflow run --ref main` (branch ref) works; SHAs still 422.

## Ladder trail
TARGET #2182 claimed → zombie-lane observed → yielded (recorded on #2182) →
ladder: steer none, next none, queue `#2194` claimed+shipped (#2196) → parked
merges #2175/#2188 landed → queue empty, QA live, flagship gaps all CLOSED →
`weakestStage` HOMEBODY (score 6) → filed+claimed **#2197** → shipped #2198 →
QA #2200 filed → nightly dispatched.

## Open questions
- none (#1711's blockers are Jon-side takes, already tracked there).

## Hygiene at exit
Dev server on 5178 STOPPED (mine). Worktrees: merged ones re-detached
(firecrewplay-calib → old sha, homebody-pet → latest); plaicraft pair detached,
keep for reference. STATE COMMITTED to main — my forge game (#2198) merged this
session (AGENTS rule: commit allowed); park b copy refreshed.
