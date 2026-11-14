# STATE — session 272 (2026-11-14, slot b)

## Playable now / what shipped
- **HOMEBODY: meal bells** (merge `e7f5402`, PR #2260, closes #2244 — the
  warden's target, resumed from slot a's corpse). Live: /retrogames/homebody.
  Three bells a day (07:00 / 12:30 / 18:30 windows, seeded) set a steaming
  plate beside the kitchen nobody commands; warm 2.5 h or `meal-cold`; one
  helping per bell via `mealTaken === mealSerial`; the shared-table law —
  whole household on one plate pays social +0.15 each, house bond +2,
  content +1, hearts. DEF-only object (never merchandised).
- **What this session actually did** (slot a had sim+art+shell+harness done
  but its PR CONFLICTING when the lane hung past its timebox): merged
  `origin/main` in, resolved the README keep-both (main's #2252 had dropped
  the paper-route verify line — restored), re-verified everything, shipped.
  - peoplecheck **434/434** after merge (418 branch + 16 pet-polish #2200);
    shared-table mutant re-proven ON THE MERGED TREE: exactly 431/3, restore
    434/0 (README pins bumped 418→434 honestly).
    `homebodydrive` **67/67** zero page errors; contractcheck 14/14;
    eslint + 3 lint gates + build green.
  - Prod verified: chunk `index-CB_Xq2bY.js` carries `meal-shared` + paper
    banner; route 200.
  - QA polish pass filed as **#2264** (bell timbre variety, night-scale
    steam, hearts-anchor, cold-plate tell, garbage-day tail may spin out).

## Ladder (this session's path)
- Warden target #2244 claimed CLEAN (slot a's last VALID checkpoint 170 min
  old — its 18:37/18:38 comments were non-namespace formats; the lane was
  hung: 3h06m elapsed, 0% CPU, no children). Step-1b resume, no new claim.

## BOARD at exit
- #2244 shipped+closed (+prod comment). #2264 `feedback lane:qa` (meal polish).
- Other lanes landed while I worked: #2254 FLOOR BOSS via #2259, #2255
  ADVENTURE via #2263 — both merged to main before my exit.
- game-queue: **#2261 DEMO: running fox (model battle: Qwen vs Gemini)**.
- No `building`. #1711 `next`, Jon-side (#2218 AWAITING is lane:platform).
- jonq: nothing open from lane:games. Nightly green; main-ok clean at exit.

## Next (slot a or b, in order)
1. game-queue #2261 (DEMO running fox) is the only queued item — claim it
   normally (demos are self-contained in public/demos/, no registry — #1258
   decision 2026-10-19; check the issue body for the battle rules).
2. Else ladder: steer/none → #1711 skip (Jon-side) → QA-borrow only if no
   `QA MASTER` live → flagship stages → never-dry `weakestStage` (Homebody
   unowned tails left: needs-panel per-object queue display; garbage day
   now owned by #2264; Myst-era titles carry 3–4 band gaps).
   Don't duplicate QA #2258/#2264/#2256.

## The session's catches
- **An orphan mutant run can hijack your FRESH worktree.** Someone's
  `froggercheck.mjs --mutate` (PPID 1) had cwd = the worktree I had just
  added — it planted Frogger mutants under me and stamped `.mutant-running`
  for ~8 min. Rule: `ls .mutant-running` before staging; pushing ALREADY
  committed work is safe during a freeze (the stamp blocks staging, not
  transport), which is how I shipped the conflict-resolve through it.
- **Cold Vite races your first drive.** `Re-optimizing dependencies because
  lockfile has changed` fires on the first game page load and one-off'd a
  page-exception crash in drive run #1. Warm the server (a contractcheck
  pass) and only trust drives after; one transient + two greens = measured,
  not assumed (rule 8).
- **Detached worktrees + `gh pr merge`**: no-arg merge dies on branch
  inference — pass the PR number explicitly.
- **`mergeable=UNKNOWN` can persist after `static` SUCCESS** (main kept
  moving). Authoritative sequence: main-ok + static SUCCESS + let the
  server-side merge adjudicate; "already merged" = verify state, don't retry
  blind (another lane's loop fired first — my pushed tip was the squash).
- **PR bodies need the `Closes #n` keyword** — #2260 said "(#2244)" only, so
  the issue survived the merge; closed by hand.

## Hygiene at exit
- Dev server :5178 (mine) STOPPED; no other lane's port touched.
- Worktree `~/Dev/retrogames-forge-meal-bells-b` re-detached at origin/main
  (`bcccce1`). Tidy-candidate (branch deleted upstream by squash).
- STATE.md committed to main legitimately (game merged this session — rule 9)
  + parked at slot-b path and shared path.
