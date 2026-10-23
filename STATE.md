# STATE — 2026-10-23 forge session 3 (EMBERWOOD tuskroot/pod art + juice shipped)

## Shipped this session
- **#877 → main (squash 290d37f, static SUCCESS)** — flagship idle stage
  (#841): board empty, QA lane live (holds #863 BLOB), idle-kick answered
  `KICK SSX 0`, but SSX gap 0's remaining delta is the analogue stick —
  gated on AWAITING #873 (default = keep arcade taps, so no stick work) —
  and SSX gap 1 is harness. Took the game-code stage STATE flagged:
  EMBERWOOD gap 0, tuskroot/pod sprites + charge-dust/split-pop FX.
- Repaint: tuskroot now a 16x16 log-boar at final aspect (bark grain, knot,
  mossy mane, root-feet gait, curved two-tone tusk, eyes amber→white→red,
  head lowers with the rage; render key mapping unchanged); pod is a husked
  seed with a pulsing ember vein (2 frames).
- Charge-dust: sim emits `dust` every 6th moving charge frame behind the
  heels (`pos − ĉ·7`, `dir = −ĉ`); telegraph paws one puff (`st===34`);
  soft rumble sound. Deterministic beat, hash-neutral — proof route still
  wins at tick 11233.
- Split-pop: the pod-death `split` event now paints bark shards + ember
  motes + shake.
- **Bug found + fixed:** `render.js` exported `onFx` but index.jsx never
  called it — the ENTIRE particle/shake juice layer was dead on the live
  page since #738. Shell now drains fx through `rend.onFx(fx)`; dev hook
  `__emberwoodTest.fxStats()` added.
- `emberwoodcheck` 142/142 (112 node + 25 Chrome): +6 node gates (dust only
  during charge, sign-checked opposite the locked line, telegraph puff, zero
  stray dust, one pop per pod, dust not ambient) +1 Chrome gate (dust
  counted through the real drain). **Mutant:** disable the charge-dust emit
  → both dust gates FAIL; restored → green. eslint/mario/fps/ai + build
  green. Prod: chunk `index-Docu-sak.js` contains `dirx`/`seedOff`.

## Next goal
- Re-run `flagshipStage`/idle-kick. SSX 0 stays gated while #873 AWAITING
  (default keep taps) and SSX 1 is harness — so the natural next game-code
  stage is EMBERWOOD gap 0: **Wyrm tail segments ride the drop-pool quads**
  (proper tail-segment billboards). Other Emberwood gaps: save system/second
  shop/elder gift; portrait full-bleed; tempo lift/attract music.
  If #873 is ANSWERED "add analogue stick", that outranks as Jon's steer.
- QA holds #863 (BLOB). Never touch a game QA is inside (`heldGames`).

## Board / harness status
- main green at 290d37f (STATE commit follows); no freeze; no `halt`;
  queue/next/steer empty at claim; rule 4 satisfied (Emberwood game code).
- `jonq` lane:games — **#873 AWAITING** (analogue stick vs arcade taps,
  default keep taps, deadline 2026-10-25). No other open games-lane question.
- **Deploy dependency (unchanged):** real internet play needs the relay
  worker redeployed on Cloudflare (#825, AWAITING, lane:qa).
- QA lane owns: #863 BLOB (building-qa); #843/#825 AWAITING (lane:qa).

## Open questions
- #873 (lane:games, AWAITING) — SSX touch steer: analogue stick or arcade taps?

## Housekeeping owed
- `gh pr merge --squash --delete-branch` succeeded again but its local
  bookkeeping failed: **`main` is checked out in worktree
  `~/Dev/retrogames-qa-863-cputiers`** (live QA session; second run in a
  row). Whoever tends that lane (or Jon): `git -C ~/Dev/retrogames-qa-863-
  cputiers checkout --detach origin/main`. Pushes to main still work; only
  local checkout/merge is wedged.
- Worktree `~/Dev/retrogames-forge-emberwood-sprites` re-detached at
  origin/main, node_modules symlinked — safe to prune, as is
  `~/Dev/retrogames-forge-emberwood-grace` and older SSX/QA trees.
- No 8b polish-pass issue filed: #877 WAS a polish stage on an existing
  title; its remaining gaps already live in the Emberwood README (the
  `flagshipStage` source) — a duplicate QA issue would be noise.
