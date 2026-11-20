# STATE.md — The Forge (rewritten at close of session 358, slot a — 2026-11-20;
# committed: the forge game MERGED this session (bb56470), so per FORGE step 9 the
# report rides main, not just the park.)

## PLAYABLE
- **/retrogames/contra — S3.5 live (merged `bb56470`, PR #2791, closes #2790):** the arms
  depot — 10-hit shootable slab (crack stages, ember glow), aimed slit gun (deadlier than a
  rifleman, 16 px/s), roof sniper suppressed while the depot lives and blown off with it,
  grenadier hatch (one at a time, view + spawn-shield law), M/F/L capsule-volley payout
  (+1000, three altitudes); walls absorb pierce. `contracheck` 79/79, `--mutant` 67/67
  (5 named harms incl. new `depot-impervious`), seeds 1..12 still win (depot = third
  emplacement), contractcheck 15/15.
- /retrogames/contra S1+S2+S3, /retrogames/floor-boss — unchanged.
- **PROD VERIFIED live** (~00:2xZ): shell `index-CgbG8ska.js`, Contra chunk
  `index-DQr6N20e.js` carries `depotHp:10`, the `volley` event + lane-aim law verbatim.
  (Deploy lagged merge ~55 min — Vercel queue congestion across lanes, not a build problem.)

## BOARD
- **#2779 CONTRA — S4 remains (last stage):** co-op — CPU ally seat default (Jon's
  multiplayer rule), 2-player keyboard option, no second touchpad. Budget a FULL session;
  sim takes one hero today (p[0]); ally needs its own spawn/rez/death lane. Read the two
  collision notes on the issue before claiming — and comment your claim liveness.
- **#2790 CLOSED shipped** (was: slot a's un-shipped S3 delta ported onto b's S3 = S3.5).
- **#2789 (feedback, QA lane live):** bitmap capsule glyphs PR #2793 is open against it —
  do NOT double it; QA owns polish for contra this cycle.
- **#1711 PLAICRAFT S1 — wait-state.** #2652's deadline (2026-11-20T01:36Z) passes within
  the hour; the sweep default = keep waiting. Skip unless Jon answered.

## QUEUE (re-derive at main — never plan from a remembered snapshot)
1. `git fetch && git checkout --detach origin/main` + the #1045 ladder. `next` = **#2779
   (S4)**, then #1711 (only if #2652 answered). `game-queue` holds #2787 (FloorBoss
   turn-hold plan-time reservation — full session, design note on the issue).
2. Before any Contra merge: check open Contra PRs/branches (`gh pr list --search contra`,
   `git branch -r | grep forge`) — this title has collided twice in 24h because
   `forge-claim.sh` resume paths post nothing and `holder()` ignores `yielding`.

## QUESTIONS OUT (jonq issues, not STATE.md — #605)
- #2652 (AWAITING, lane:platform, deadline 2026-11-20T01:36Z) — default = keep waiting.
- #2751 (AWAITING, lane:qa, deadline 2026-11-21T03:40Z) — QA focus.
- Nothing filed from slot a this session (ship decisions were mechanical, not taste).

## HARNESS NOTES FOR THE NEXT LANE
- **Collision mechanics (unchanged, still biting):** claim = `claimed|checkpoint` comment
  within 90 min; `yielding` does NOT clear a lock; the "already yours" resume path prints
  nothing and posts nothing. Full post-mortem on #2779. Harness owner should fix
  `holder()` + resume-liveness; until then, treat a resumed claim as INVISIBLE and say so
  on the issue yourself.
- **If you collide anyway:** compare your build vs main's by CONTENT (`git diff --stat
  origin/main -- src/games/...`), not by issue label. If main already ships your stage,
  salvage only your delta into a feedback issue or a follow-up stage — that path worked
  cleanly for S3.5 (#2790).
- **Lane-aim law (inherited):** enemies aim `p.lane`; snipers fire only at grounded targets;
  the hop must always answer an aimed round. Depot gun obeys it too.
- **Mutant/harness counting trap (inherited):** when proving kills, count only pushed test
  subjects; seed-5's roster is pre-dead in those probes.
- **Depot laws (new):** spawn-shield and out-of-view laws gate depot gun AND hatch (dual
  check in both branches); view-gate uses `cX + VIEW_X + 30` (barrel overhang); core clear
  auto-destroys the depot. `stateHash` now covers depot {x,hp,dead,fire,hatch,grens} and
  `capsule.volley`. Extend the hash with any new gs state — the determinism leg is
  self-consistency only.
- **zsh locale trap:** grep bundled JS via file + `LC_ALL=C`; `grep -c` on a missing file
  exits 1 — treat "0" and "missing" alike in poll loops.

## WORKTREES
- `../retrogames-forge-contra-arms-depot` — shipped S3.5 worktree (detached at bb56470,
  clean). Superseded duplicate: `../retrogames-forge-contra-weapon-wall` (`29fa62b` pushed
  unmerged; its salvageable content went to #2789/#2790 — safe to prune after S4 ships).
