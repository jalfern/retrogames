# STATE — 2026-10-15 (forge session, PoP deep pass STAGE 1 shipped)

## Shipped this session
**PoP deep pass — Stage 1: the rules of 1989** (#316, PR #320 squash-landed
at `9c5e32d`, live): https://jalfern.com/retrogames/prince-of-persia
- Resumed a corpse: the previous session died mid-Stage-1 (engine spine pushed
  to draft PR #320, `art.js`/`index.jsx` still on the old API → build red).
  This session wired React+art to the new sim, rewrote `popcheck`, and merged.
- Stage 1 = no lives (death restarts the level, hour keeps running; L3
  checkpoint), unarmed start + sheathed sword, timing duel (Strike X / Block
  Up, parry→counter; heights removed), falls by floors (1/2/3), held-Shift
  grab only, 10-wide multi-room flip, raise/drop buttons + slow gates,
  chompers, loose→rubble, plate→door→stairs, the five 1989 flasks,
  sunrise=lost. 3 levels × 4 rooms.
- Gates: `popcheck` **75/75** (rules pinned · autopilot wins all levels 0
  deaths · slack 0.75x clock + guard hp−1 still wins · determinism ·
  no-Math.random · planner/CFG mirror). Parry-rule mutant proven red then
  restored. `popplay` 13/13 real keys, zero page errors. lint:pop +
  mario/fps/ai + aicheck + build green. #316 → `next` (not `shipped`;
  Stages 2–4 remain).
- Bugs found this session (all fixed): open gate swallowed the prince into the
  void (ground row under a gate is now solid); `u` legend collision
  (L1's drop button was being collected as the upside-down potion → `D`);
  sunrise soft-lock (`kill('time')` reloaded onto a zeroed clock forever →
  clock 0 sets `lost`).

## GOAL — next session
**#316 Stage 2 — the look and the animation** (labeled `next`, claim first).
Proportions (prince most of a floor tall, 3 floors/room, lit-top ledges),
≥8-frame run + separate start/skid/turn/crouch/land/hang/climb/careful/drink/
sheathe/draw poses, deaths with weight (impaled/sliced/crumpled/cut), torch
light tinting, distinct guard turbans + fat guard + skeleton + robed Jaffar.
Extend `popcheck` stage clauses as each Stage-3 box lands. If #316 is gone by
then, oldest `game-queue` is #295 Civ V — STILL do NOT build without Jon
(flagged 4 sessions running).

## Board (last read)
- `next`: #316 (PoP deep pass, Stage 1 done — box list on the issue).
- Queue: #295 Civ V only (standing scope question, Q1 below).
- Open QA: #312 (superseded by #316 — could close as done by #316), #310 SSX,
  #304 MYST, #302 Gauntlet/FourHalls, #298 Tempest, #287 LunarLander, #283
  OutRun, #280 SmashTV, #275 Gauntlet, #270 SimCity, #269/#220 Kart, #265
  Marble, #263/#258 Bubble Bobble.
- Two QA MASTER sessions were live all session (mini + mbp); forge did not
  borrow a QA item.

## Notes for whoever picks this up
- PoP architecture post-Stage-1: `sim.js` pure `step(state,input)` — room =
  `p.x/T/RW`, per-room `gateOpen[]`, `fallen{}` rubble map, `exitOpen`,
  `cpReached`, `status: play|dying|clear|win|lost`; `levels.js` ASCII rooms
  (legend header; ground row under gates forced solid; 'D' drop button, 'B'
  raise, 'p' plate, '<' door, 'x' chomper, 'c' checkpoint); `planner.js`
  reactive autopilot (mirror constants pinned); `art.js` room-camera painter
  (VW=320,VH=288); index.jsx shell. Copy for any platform/duel title.
- Viewport is 10×9 tiles (320×288) — container aspect-[10/9], NOT the old
  19×12. Attract text is painted inside the playfield, sized for 320px.
- L1's chomper phase = (col%3)*22 with CFG 150/96/30/8; popplay derives
  `tick` from `216000-clock` to time a real-key hop onto the jaws.
- The forge worktree `~/Dev/retrogames-forge-pop-deep` holds the merged
  branch `forge/pop-deep`; re-create fresh per stage:
  `git worktree add ~/Dev/retrogames-forge-pop-stage2 -b forge/pop-stage2 origin/main`
  and symlink node_modules from the main checkout.
- Rule-4 watch: last three merged PRs = #318 (game code), #319 (board),
  #320 (game code) — not stalled.

## Three questions for Jon
1. #295 Civ V has sat alone in `game-queue` now for FOUR sessions. Retire it,
   or name the cabinet-scope 4X you'd accept? Meanwhile #316 Stages 2–4 are
   labeled `next` and keep the forge fed — confirm that's the right filler.
2. #312 (PoP polish pass) is now fully absorbed by #316's boxes. OK to close
   #312 as done-by-#316 so the QA board stops counting it?
3. Stage 3 wants twelve levels with mirror room, shadow-drinks-potion,
   invisible bridge etc. — new systems (shadow clone, mirror teleport) in one
   issue. OK to split Stage 3 into its own child issue when we get there, or
   keep it all in #316 as written?
