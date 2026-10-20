# STATE — forge session 2026-10-20 (SSX hero rider)

## Shipped today
- **SSX real rider #548** — PR #610 merged `00f5eee`: CC0 KayKit
  "Rogue_Hooded" hero (`public/models/ssx/rogue.glb`, 326 KB trimmed;
  license+provenance in `public/models/ssx/LICENSE.txt`). Six sim-driven
  poses (stand/tuck/crouch/air/grab/tumble) = baked clip frames
  (Idle/Jump_Start/Jump_Idle) + per-bone offsets on a per-frame bone-lerp;
  sculpted sidecut/rocker deck (no CC0 snowboard exists — hand-built,
  documented); foot-bone boots; air-fading contact shadow. CPU field stays
  box rigs (issue scope: one rider first).
- **ssxmodelcheck** (new browser gate, in lint:ssx scope): 20/20 — GLB loads
  (48 bones), pose overrides land, silhouette-histogram pair diffs ≥54 vs
  noise 2, real ArrowUp/Space drive hero poses, prognose WINNABLE, zero page
  errors. Mutant (blendHero→stand) = 12 red, restored. ssxcheck 70/70.
- QA polish pass filed as **#615** (CPU field models, grab depth, board
  liveries, idle life, boot fit, dusk/night readability).
- **Prod router bug found during verify**: `vercel.json` whitelists asset
  prefixes one-by-one and had none for `models` — prod answered
  HTML@200 for the GLB, so production SSX silently ran the box-rider
  fallback. Fix = PR #617 (one rewrite `/retrogames/models/:path*`),
  diagnostic posted on #548 per rule 8.

## Playable now
`https://jalfern.com/retrogames/ssx` — player rides the hooded rogue; per-pose
screenshots on #548. (At report time prod was still on the pre-merge bundle —
Vercel deploys lag merges a few minutes; the SPA rewrite answers HTML@200 for
missing assets, so verify with content-length 326172 on
`/retrogames/models/ssx/rogue.glb`, not status 200.) jalfern.com 308s to www.

## In flight (other lanes)
- COMET DRIFT #542 + several comet-* worktrees belong to the other lanes;
  their dev server holds :5173 (this lane used :5175, now stopped).

## Next queued
- `gh issue list --label game-queue`: only **#601** "FORGE — CI: test only
  what changed, mutate to nightly, freeze merges on red main" — harness work,
  not a title (rule 4 pressure — next session wants a game label from Jon).

## Lessons worth keeping
- **three r180 removed `KeyframeTrack.evaluate`** — sample baked clips with
  `track.createInterpolant(new Float32Array(track.getValueSize())).evaluate(t)`.
- **GLTFLoader.parse is callback-style** — `parseAsync(buf, '')` or you
  dereference undefined and silently fall back to the old look.
- **Chase-cam RGB never sits still**: `camPos.lerp(goal)` converges
  geometrically but is never static → sub-pixel AA shimmer (~5/255 even when
  paused). Pose gates must use silhouette histograms (per-row/col dark-pixel
  counts): noise floor 2 vs pair diffs 54+.
- **New `public/*` top-level prefix ≠ published**: `vercel.json` whitelists
  prefixes (`js-dos`, `games`, `demos`, `replays`, icons…) — add the rewrite
  in the SAME PR that ships the files, and verify prod with expected
  content-length, never 200 alone (HTML@200 for missing assets).
- **playwright `press` ignores extra modifiers** — `press('Slash',
  {shiftKey:true})` does NOT deliver Shift; down/up the modifier.
- **Sim freezes on pause, rendering doesn't** — DEV pose overrides keep
  blending while paused: ideal for stable capture (assert tick frozen).
- KayKit character GLBs ship WITH animation clips — mine them for pose bases.
- **Whole-file package.json conflicts**: main reformats at 2-space indent;
  rewrite JSON with `null,2` to stay diff-clean.
- Don't `git checkout` in a worktree while a merge-loop runs there — it
  breaks the loop's branch context; re-arm instead of trusting silence.

## Three questions for Jon
1. #601 is CI/harness; game-queue has no title. Label the next GAME
   (`next`) or should the builder lane take #601?
2. SSX grab reaches toward the nose but the hand doesn't touch the deck edge
   yet — OK as #615 item 2, or want forge to keep tuning now?
3. CPU-field models (#615 item 1) add ~4×300 KB GLBs to the repo — fine, or
   prefer one shared multi-character GLB fetched once?

## Housekeeping
- Main checkout detached at `origin/main` (00f5eee); nothing dirty.
- This lane's worktree `retrogames-forge-ssx-rider-548` removed post-merge;
  dev server :5175 stopped.
