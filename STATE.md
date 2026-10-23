# STATE — 2026-10-23 forge session 5 (SSX analogue touch stick shipped)

## Shipped this session
- **#894 → main (squash 104a067, PR #895, static SUCCESS)** — executed Jon's
  #873 answer ("A — use analogue"): SSX phones got a physical analogue stick.
- Always-visible base + knob on the trick pad (`data-ssx-stick`, index.jsx):
  x = carve depth through the #791 press ramp (priority tilt → drag → padState
  → keys, saturates at ±1 / 38 px); y tilt = body verbs — forward tucks +
  commits a FRONT flip (sim ledger −), back scrubs / back flips. The discrete
  FRNT touch button retired (keyboard Z/C, gamepad L1/R1 unchanged).
- Pure law in `sim.js` (`STICK_TILT`/`flipDirFromTilt`/`bodyFromTilt`) —
  input shaping only; physics, scoring, `stateHash` byte-identical. New DEV
  probes `__ssxTest.stick()` / `.center()`.
- `ssxcheck` **229/229** (+9 node gates: tilt law signs/thresholds/symmetry,
  committed direction reaches the flip ledger front−/back+, source gates) and
  `ssxmodelcheck` **70/70** (depth 0.53→1.0 saturate, release clears,
  right-carve +x with press ramp, fwd/back tilt verbs, FLIP+tilt mid-air −87
  vs FLIP-alone +69, zero page errors). **Mutant:** swap the two signs in
  `flipDirFromTilt` → 3 node gates red; restore → green.
  eslint/mario/fps/ai/vpadcheck + build green. Prod verified: chunk
  `index-Bb65SY38.js` contains `data-ssx-stick`.
- One CI fix mid-flight: my registry controls rewrite broke the vpadcheck
  #828 phrase gate ("Pad: left stick steer") — restored the phrase + tilt
  verbs (df8b057); vpadcheck 611/611.

## Next goal
- Oldest `game-queue`: **#889 GAME: SSX — more and longer courses** (3 new
  original courses, every course ~2x longer, route choices; online tournament
  rotation). Read SSX README first (planner pacing per course length will
  need re-proof: ssxcheck win gates + slack economy on longer runs).
- Other Emberwood gaps (README flagshipStage): save system/second shop/elder
  gift; portrait full-bleed; tempo lift/attract music.
- QA holds #863 (BLOB). Never touch a game QA is inside (`heldGames`).

## Board / harness status
- main green at 104a067 (+ this STATE commit); no freeze; no `halt`.
- `jonq`: nothing AWAITING in lane:games (#873/#843/#825 all answered). No new
  question filed this session.
- **Deploy dependency (unchanged):** real internet play needs the relay worker
  redeployed on Cloudflare (#825 answered — execute per its reply when the
  QA/platform lane picks it up).
- QA lane owns: #863 BLOB (building-qa).

## Open questions
- none open (all lanes clear at time of writing).

## Housekeeping owed
- No 8b polish-pass issue filed: #894 WAS a polish stage on SSX; remaining
  gaps live in the SSX README honest-gaps list (arm IK for named grabs;
  `ssxplay` browser-drive script still missing) — a duplicate QA issue would
  be noise.
- Worktrees safe to prune: `~/Dev/retrogames-forge-ssx-analogue-stick` (now
  detached at origin/main), plus older forge/QA trees (`…-emberwood-*`,
  `…-qa-863-cputiers`, ssx/*). Main checkout is detached at origin/main.
- Prod-verify gotchas (unchanged): `jalfern.com` 308s to `www.` — curl must use
  `-L`; SSX ships in a lazy chunk — scan the chunk list from the index bundle,
  and `gh pr checks` exits non-zero while checks are queued — wrap the rule-5
  poll in `|| true` or the && chain dies silently before the merge.
