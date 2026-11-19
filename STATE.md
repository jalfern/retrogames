# STATE — session 347 slot b close-out

## Shipped this session
- **PICK RUSH: LABELLED GRASP-AND-PLACE EPISODES (#2734) — PR #2737 merged
  `954de29`** (rule-5 loop on `static`; prod-marked `index-Br-2CV4v.js`).
  Never-dry stage (#1571): the ladder ran #2724 REFUSED (slot a live), #1711
  WAIT-STATE (`grade --dry-run`: nothing new; jonq #2652 AWAITING), queue
  empty, feedback QA-held (#2729 building-qa, QA MASTER live — no borrow) →
  `weakestStage` PickRush score 1 → filed #2734, claimed, shipped.
  Live takes bank through the #1141 kit (seed, pads per seat per tick,
  hashes, sources resolved at stop, contract drives never bank); kit grew an
  additive `episode.labels` track (validated, old files untouched);
  sim events `slip/miss/shatter/wrong/drop` carry kind+seat (hashes
  unaffected); `npm run pickrush-export` → 20 seeds (0..11 practice,
  100..107 held-out), 20/20 contracts completed, replay-verified ALL,
  4461 labelled drops (4010 hit/451 miss; corpus misses are barrel slips
  only — humans supply wrong/shatter). REC beacon + `TAKE BANKED — HITS n ·
  MISSES m · EPISODES STORED k` on the card. Gates: pickcheck 93/93 node +
  34/34 browser, `PICK_MUT=rec` reddens 9 named gates (replay stays green);
  robokitcheck OK; contractcheck 16/16; build green. QA polish pass filed
  as #2739 (feedback).

## Next queued (slot b)
- Re-derive at main (`node scripts/idle-kick.mjs`); do NOT trust this line.
  Expect: #1711 (`next`) still WAIT-STATE until a take lands — check
  `plaicraft:grade --dry-run` before claiming; jonq #2652 deadline
  Nov 20 01:36Z, default keeps waiting. #2732 (FloorBoss `bot.dir` vs
  facing) is open `lane:games` feedback — QA-live still means no borrow;
  slot a merged #2731, so #2724 is gone and #2732 is now the oldest real
  builder-side feedback if the ladder's feedback rung ever frees. Flagship
  gaps remain spent; PickRush's gap list is now CLOSED+DISCLAIMER only, so
  weakestStage re-derives from scratch — let idle-kick name it.

## Catches learned (durable)
- **A pad stream carries pads, not RNG draws.** The autopilot's retarget
  draws advance the seeded stream that paces the spawns — capture with the
  autopilot and replay respawns the line (first lie seed 0 tick 210). Any
  export/replay corpus brain must be RNG-free; `EXPORT-RNG-FREE` now counts
  draws (planner 48 vs autopilot 92 @2000) to hold the law.
- **`gs.correct` resets at every whistle** (it's the per-shift quota
  counter); the lifetime land ledger is Σ`binFill`. An invariant written
  against `correct` over a whole contract is wrong in the naming, not the
  data — EXPORT-HITS-CORRECT now says so in the gate text.
- **Prod verification on jalfern.com needs `curl -L`** (bare URLs answer
  15-byte "Redirecting…") and lazy game chunks are named `index-<hash>.js`
  — extract chunk refs from the index bundle and scan them for the marker.
- **Relative storage assertions beat absolute ones** for browser gates after
  other suites have played (REC-BANKED counts `base+1`; an earlier
  Space-started take legitimately banks).

## Lane state
- Worktree `~/Dev/retrogames-forge-pickrush-episodes` + branch removed
  post-merge; main checkout `~/Dev/retrogames` to be re-detached at
  `origin/main` including the STATE commit below. Port 5178 freed.
- Rule 4: game code merged (`src/games/**`) — streak reset, shelf healthy.
- No halt on the board; nothing taste-shaped came up (the #2734 stage was
  README-prescribed), so no jonq filed by this lane.
- Open questions for Jon: none owned by slot b. #2652 (AWAITING, platform)
  remains the only gate on #1711 line 3's human half.
