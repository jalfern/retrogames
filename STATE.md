# STATE — forge session 2026-10-20 pm #2 (SSX CPU pack #620 shipped)

## Shipped today (this session)
- **SSX real CPU pack (`d975ed8`, PR #626, closes #620)** — all five rivals
  ride real rigged KayKit Adventurers bodies (knight/barbarian/mage/
  rogue_plain + hooded rogue for rider 5; the pack ships exactly five).
  `RIDER_MODELS` in art.js; same skeleton pack-wide so hero pose pipeline
  (STANCE/OFFS/bases/bone-lerp) drives everyone; six `makeBoard(color,style)`
  graphics; ~330 KB GLBs trimmed with @gltf-transform (weapons dropped,
  hats kept) — provenance in public/models/ssx/LICENSE.txt.
- **fps (issue asked):** software-GL headless box 900×640 lite — 1-hero
  baseline 8–10 fps → six skinned riders 11–15 fps: no regression, floor is
  the software renderer.
- **ssxmodelcheck pack checks** (24/24): 6/6 rigs loaded, ≥48 bones each,
  pose override reaches all six, fps floor ≥8. Mutant (one GLB missing) =
  4 checks red, restored. ssxcheck 70/70, lint:ssx + build green.
  Screenshots in docs/shots/issue-620/.
- Earlier today the same lane shipped **#601 CI scoping** (`3c24735`, PR #623):
  scope job gates every static/smoke step by changed paths; `--mutate` moved
  to nightly.yml; red-main merge freeze via scripts/main-ok.sh in rule 5.
  Today's own PRs proved it: docs-only follow-ups on #626 ran static in ~16 s.

## Playable now
`https://jalfern.com/retrogames/ssx` — hero + five distinct rigged rivals
(verified prod: knight.glb serves 359148 bytes model/gltf-binary). Nightly
yml runs green (main-ok reports "nightly success").

## In flight (other lanes)
- Demo #616 (shore WebGPU upgrade, `lane:demos`) still queued — left for the
  demos lane (oldest game-queue item, but builder took `lane:games` #620).
- QA MASTER sessions (mini/studio) running. `/Users/jon/Dev/retrogames-qa-534`
  still holds a `main` checkout (law: main checked out nowhere) — it makes gh
  post-merge cleanup error locally; someone should re-detach it.

## Next queued
- game-queue: #616 (demos), #614 + #605 (FORGE platform). No unclaimed
  `lane:games` title — next forge session wants one, or the loop takes
  platform work (#614) — see question 1.

## Lessons worth keeping
- KayKit Adventurers pack shares ONE skeleton across all 5 characters — pose
  code transfers 1:1; keep models pack-mates when you can.
- gltf-transform recipe that shrinks 3.6 MB → 330 KB: keep 3 clips, drop
  weapon nodes by name, `resample --tolerance 0.001`, `dedup`, `prune`.
  (@gltf-transform/core: use `.dispose()` on nodes/anims, not root.removeChild.)
- Node has no createImageBitmap — three.js GLTFLoader can't decode PNGs in
  Node; do asset surgery with @gltf-transform, not three.
- Silent-guard lesson: this lane's harness gates flaked from fixed settle
  times; software GL converges per RENDER frame — wait-until-still beats
  any constant (pair diffs got stronger: 98–240 vs 64–140).
- gh `--body-file` does NOT upload local images; screenshots go in
  `docs/shots/issue-<n>/` (repo convention) and link raw.githubusercontent.
  And copy chains with `&&` half-fail — verify each file after multi-cp.

## Three questions for Jon
1. Only `lane:demos` (#616) and platform (#614/#605) titles left — next
   builder session: take #614, or label a new GAME? (Rule 4 is not tripped:
   #626 changed game code.)
2. Rider 5 shares the hero's hooded body (pack has only five bodies) — OK,
   or fetch a body from another CC0 source for true six?
3. Nightly is green; freeze currently keys off it. Want the heist-nightly to
   also block (currently warns only), or keep advisory per rule 3?

## Housekeeping
- Main checkout detached at `origin/main` (d975ed8); STATE.md committed per
  rule 9 (game merged this session).
- This lane's worktree `retrogames-forge-ssx-cpu-620` removed; branch
  deleted by merge; dev server :5178 stopped; :5173 untouched (other lanes).
