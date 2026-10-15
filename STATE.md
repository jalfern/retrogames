# STATE — 2026-10-15 (forge session, PoP Stage 2 look+animation shipped)

## Shipped this session
**PoP deep pass — Stage 2: the look and the animation** (#316, PR #321
squash-landed at `ceffc24`, live): https://jalfern.com/retrogames/prince-of-persia
- Pose-table animation (`art.js` `POSES`/`poseOf`): 8-frame run on
  two-segment legs + separate start/skid/turn/jump-crouch/land/hang/climb
  (~1s, 4 frames)/careful/crouch/drink/draw/sheathe/block/attack poses.
  Sim carries visual-only timers (drinkT/drawT/sheatheT/startT/skidT/turnT/
  landT) — physics untouched, all 75 Stage-1 rules still pass.
- Weighted deaths per cause (`DEATH_ANIMS`): impale (stays on spikes, drips),
  slice (two parting halves), crumple, cut-down, poison.
- Taller prince `PH=44→60` (~2/3 floor). Fixed latent bug this exposed:
  one-way `=` ledges walled him from the side → new `blocksH` (ledges land,
  never wall). Climb 34→56 ticks.
- Guard skill tiers: `GUARD_STYLE` (speed/windT/coolT) + turban palettes
  green/red + fat(wide)/skeleton(bone)/jaffar(robe+hat). Red guard placed L2.
- L3 theme `palace`: pale walls, pillars, moonlit arched windows, tapestries
  (`palaceWall`, per-room `deco` seeds in levels.js).
- Gates: `popcheck` **99/99** (75 rules + 24 Stage-2 clauses: proportions/
  climb-time, pose-set, ≥8 distinct run frames, distinct death anim per cause
  reachable in sim, palettes/styles, themes/deco, careful/drink/draw/sheathe).
  Run-cycle mutant (flat RUN_T/RUN_K) proven red then restored. `popplay`
  13/13 real keys zero page errors. lint:pop/mario/fps/ai + aicheck + build
  green. #316 back to `next` (NOT shipped — Stages 3–4 remain).

## GOAL — next session
**#316 Stage 3 — all twelve levels** (labeled `next`; claim first). L1 sword ·
L2 guards+gates · L3 skeleton+cp · L4 mirror(→shadow) · L5 shadow drinks ·
L6 fat guard · L7 slow-fall before the long drop · L8 princess's mouse opens
gate · L9 upside-down · L10/L11 hardest guards · L12 sheathe-to-merge with
shadow, invisible bridge, Jaffar + princess; interludes between levels. New
systems: shadow clone, mirror teleport, mouse, invisible bridge, sheathe-merge.
Gate grows: popcheck must demand 12 levels × ≥4 rooms, autopilot wins all 12
+ Jaffar inside the hour. Keep slack + determinism clauses. Interludes are
cheap DOM/canvas cards between levels. If #316 is gone by then, oldest
`game-queue` is #295 Civ V — STILL do NOT build without Jon (5 sessions).

## Board (last read)
- `next`: #316 (Stage 1+2 done; box list in my issue comments).
- Queue: #295 Civ V only (standing scope question, Q1).
- Open QA: #312 (fully absorbed by #316 — close as done-by-#316?), #310 SSX,
  #304 MYST, #302 Gauntlet/FourHalls, #298 Tempest, #287 LunarLander, #283
  OutRun, #280 SmashTV, #275 Gauntlet, #270 SimCity, #269/#220 Kart, #265
  Marble, #263/#258 Bubble Bobble.

## Notes for whoever picks this up
- PoP architecture now: `sim.js` pure `step(state,input)` + `GUARD_STYLE` +
  `DEATH_ANIM` maps + `blocksH` (one-way floors never wall horizontally —
  keep! the taller prince dies on the button room without it);
  `levels.js` per-level `theme` + `deco` seeds, legend adds `R` red guard
  (`F` fat parsed but unused until L6); `art.js` `POSES`+`poseOf`+
  `DEATH_ANIMS`+`PALETTES`+`RUN_FRAMES` — popcheck imports these as the
  look contract, keep the exports stable.
- Worktree per stage: `git worktree add ~/Dev/retrogames-forge-pop-stage3
  -b forge/pop-stage3 origin/main`, symlink node_modules from main checkout.
  Prior stage worktrees still exist (pop-deep, pop-stage2) — prune when sure.
- Watch: my edit-tool path discipline slipped twice this session (edited the
  MAIN checkout by mistake, one clobber recovered via git checkout). Edits
  belong in the WORKTREE path only; main checkout is plumbing.
- Rule-4 watch: last three merged PRs = #319 (board), #320 (game), #321
  (game) — not stalled.
- 8b not filed: #316 IS the polish/depth pass for PoP (#312 superseded);
  Stage-2 shortfalls (2-row-floor proportions, fat-guard level, sound) are
  boxes on #316, not a new issue.

## Three questions for Jon
1. #295 Civ V has sat alone in `game-queue` five sessions. Retire it, or
   name a cabinet-scope 4X you'd accept? Meanwhile #316 keeps the forge fed —
   confirm Stage 3 is the right next build.
2. Stage 3 packs four new systems (shadow clone, mirror teleport, invisible
   bridge, sheathe-merge) into one issue. Split it into child issues per
   system, or keep as written and let it ship across multiple PRs anyway?
3. OK to close #312 (PoP polish pass) as done-by-#316 so the QA board stops
   counting it? Its items are all merged or absorbed.
