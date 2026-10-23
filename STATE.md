# STATE — 2026-10-23 forge session 4 (EMBERWOOD Wyrm tail billboards shipped)

## Shipped this session
- **#880 → main (squash dcd34fb, PR #882, static SUCCESS)** — flagship idle
  stage (#841): board had no queue/next/steer, QA lane live (holds #863 BLOB),
  idle-kick said `KICK SSX 0` but SSX gap 0's delta was the analogue stick —
  and #873 was AWAITING then (default = keep taps, nothing to build). Took
  EMBERWOOD gap 0: the Wyrm tail left the drop-pool quads.
- Tail now rides a **dedicated 20-plate billboard pool**: per-segment yaw along
  the spine tangent (screen-space, FX-mirrored), z-shingle head→tip (7.8→4.2)
  with speed-based dive lift, width taper + drive compression, two alternating
  ridge-plate sprites (`wyrm/seg`/`wyrm/segB`), probe-light tint + hit-white /
  stagger-amber flash. Drops get their whole pool back (old code stamped tail
  plates onto `dropPool` and hid drops while the Wyrm lived).
- Sim byte-identical — hash-neutral; proof route still wins (determinism gates
  green). `__emberwoodTest.tailStats()` added.
- `emberwoodcheck` **151/151** (116 node + 30 Chrome): +4 node spine gates
  (trail 60/60, one-frame-dense ≤0.85px jumps, tracks motion) +5 Chrome gates
  (20 plates live, **zero drop-quad theft**, ≥3 distinct headings, strictly
  decreasing z, taper 1.05→0.28). **Mutant:** freeze `lastYaw=0` → orientation
  gate FAILS (1 heading); restored → green. eslint/mario/fps/ai + build green.
  Prod verified: chunk `index-ChbqFJ-2.js` contains `segB`.

## Next goal
- **#873 is ANSWERED: "A — use analogue."** Jon's steer — next session takes
  SSX gap 0's real delta first: analogue steer depth on touch (stick tilt for
  carve depth + flip direction), replacing the discrete FLIP/FRNT-only touch
  path. File as POLISH-SSX (or fold into the claim) and execute Jon's reply.
- Oldest `game-queue` after that: **#889 GAME: SSX — more and longer courses**
  (3 new original courses, every course ~2x longer, route choices; online
  tournament rotation). Other Emberwood gaps: save system/second shop/elder
  gift; portrait full-bleed; tempo lift/attract music.
- QA holds #863 (BLOB, live session at start of this one). Never touch a game
  QA is inside (`heldGames`).

## Board / harness status
- main green at 0e74a2d (+ this STATE commit); no freeze; no `halt`.
- `jonq`: #873, #843, #825 all ANSWERED today (2026-10-23). Nothing AWAITING
  in lane:games. No new question filed this session.
- **Deploy dependency (unchanged):** real internet play needs the relay worker
  redeployed on Cloudflare (#825 now ANSWERED — execute per its reply text when
  the QA/platform lane picks it up).
- QA lane owns: #863 BLOB (building-qa).

## Open questions
- none open (all lanes clear at time of writing).

## Housekeeping owed
- **Fixed this session:** `main` was checked out in worktree
  `~/Dev/retrogames-qa-863-cputiers` (wedged local merge bookkeeping two runs
  in a row). It was clean, so it is now detached at origin/main — pushes and
  rule-5 merges work again from any lane.
- Worktree `~/Dev/retrogames-forge-emberwood-wyrm-tail` re-detached at
  origin/main (node_modules symlinked) — safe to prune, as are
  `~/Dev/retrogames-forge-emberwood-sprites`, `…-emberwood-grace` and older
  SSX/QA trees.
- No 8b polish-pass issue filed: #880 WAS a polish stage on an existing title;
  its remaining gaps already live in the Emberwood README (`flagshipStage`
  source) — a duplicate QA issue would be noise.
- Prod-verify gotcha for the next lane: `jalfern.com` 308-redirects to
  `www.jalfern.com` — curl **must** use `-L`; grepping the redirect stub looks
  like "not deployed forever". Emberwood ships in a lazy chunk (~49 of them):
  scan the chunk list from the index bundle, not just `index-*.js`.
