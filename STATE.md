# STATE — 2026-10-15 late-3 (forge session, MYST shipped)

## Shipped this session
**MYST** (#292) — PR #303, squash-merged at `87495f3`, live:
https://jalfern.com/retrogames/myst (prod bundle `index-CEpa-tq_.js` +
engine chunk `index-MaFbyBNg.js` verified to carry MYST).
- First-person node graph, 14 views: dock→cliffs→landing→stairway→library;
  clock tower behind the palm illusion; cavern star dome + waterfall door;
  cabin with the iron safe; four Ages (Selenitic, Stoneship, Mechanical,
  Channelwood), each hiding a red and a blue page.
- Full spine: pages restore brothers' corrupted lines; matchbook→fireplace→
  Selenitic; stars 4-1-3-2→Channelwood; safe 8-5-2→Stoneship; switch chain;
  sphere tones 3-1-4-2. Eight pages→white page→Atrus; freeing a brother
  (needs white page first) traps you. Three endings.
- All art/audio synthesized: fbm palette textures, animated surf/fire/gears/
  illusion/starlight, ambient layers scheduled off the fixed-timestep loop.
- Gates: `lint:myst` + `mystcheck` (85 checks) added to CI `static`; proven to
  fail (deleting the tower-door lock check → red, restored green). Advisory
  `mystplay` 10/10 zero page errors (real arrow keys climb the island; live
  solver wins 8/8→atrus; Space restarts).
- Polish pass filed as **#304**.

## GOAL — next session
Claim the oldest `game-queue` issue: **#293 THE BARD'S TALE** (then #294 SSX,
#295 Civ V — scope question below still open; PoP #296 IS a cabinet title if
the board order can skip the non-cabinet two). BARD'S TALE is 1985 DOS — either
the js-dos spine (AGENTS gotchas) or a first-person dungeon-crawl rebuild in
three.js (MYST now proves the three.js spine: nodes + textures + sound +
harness patterns are fresh). QA items (#304 MYST, #302, #298 …) are valid
fallbacks.

## Board
- Queue: #293 Bard's Tale, #294 SSX, #295 Civ V, #296 PoP.
- Open QA: #304 (MYST new), #302 (Gauntlet/FourHalls), #298 (Tempest), #287
  (LunarLander), #283 (OutRun), #280 (SmashTV), #275 (Gauntlet), #270
  (SimCity), #269/#220 (Kart), #265 (Marble), #263/#258 (Bubble Bobble).
- QA lane lives on `retrogames-qa-258` (dev 5173 theirs); forge dev falls
  through (used 5175 this session; killed on exit). `*play` scripts take
  URL via env (`MYST_URL=…`).

## Housekeeping done
Worktree `retrogames-forge-myst` pruned (branch deleted on merge). Main
checkout parked detached at `origin/main`; STATE.md committed per rule-9.
Carry-over: `forge-bobubble` worktree still refuses removal (dead-session
dirt) — same note as last session; Jon may want to look before force-remove.

## How MYST works (pointer, not a tutorial)
`src/games/Myst/`: `nodes.js` (14 camera poses + hotspots; convention: a
node's camera faces world +z at yaw 0, spot bearings are relative degrees);
`state.js` (pure `dispatch(state,action)`, gates + endings + `solveScript()`
shared by attract and harness); `scene.js` (sibling groups spaced GAP=4000 on
X, camera teleports; page/match meshes auto-placed from spot yaws);
`textures.js` (fbm palettes + sky gradients); `sound.js` (sfx + ambience via
audioController). READMEs carry the honest gaps (single-view Ages, fixed
codes, no rocket ride, no starfield travel animation).

## Three questions for Jon
1. Queue shapes (third ask, unanswered): #294 SSX and #295 Civ V dwarf the
   one-game-per-session loop and are not arcade cabinets. Descope/backlog
   them before the forge reaches them? (#296 PoP 1989 IS a cabinet.)
2. MYST codes are fixed (safe 8-5-2, dome stars 4-1-3-2, sphere tones
   3-1-4-2). Keep fixed for harness provability, or randomize per save like
   some originals did (solver would read the state instead of constants)?
3. Attract house rule (third ask): deathless showcase + drama only on death
   screens — a one-line ruling would unblock #302/#298/#304 assumptions.
