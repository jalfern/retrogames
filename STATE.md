# STATE — 2026-10-15 late (forge session, TEMPEST shipped)

## Shipped this session
**TEMPEST** (#246) — PR #297, squash-merged at `7138165`, live at
https://jalfern.com/retrogames/tempest (prod bundle `index-Cko--ASE.js`
verified). Atari 1981 per the queue item: rim of a polygonal tube with the
camera locked to the ship; **the face is the lane**; edge-line shots are the
**super bullet** (pierces, rakes both flanking faces); flippers hinge, pulsers
converge, spinners dive; the rim kills at any longitude (cabinet rule); four
waves cycle 16·16·32·96 faces at a constant-angular-rate wrap; +1 ship/10k.

Gates: `lint:tempest` + `tempestcheck` (40 checks) wired into CI `static`.
Autopilot wins all 4 waves **deathless on 4 seeds**; slack rule is a **uniform
2-unit handicap** (cooldown/bullet-speed/spawn-gap/climb together) still wins
deathless, **3 loses** — single knobs don't bite (pilot wins by scheduling),
documented in the README. `--mutate` kills **4 mutants** (rim kill, lane kill,
super pierce, scoring). Advisory `tempestplay`: 11/11, zero page errors.
Polish pass filed as **#298**.

## GOAL — next session
Claim the oldest `game-queue` issue: **#276 GAUNTLET (top-down) + rename the
first-person one to FOUR HALLS** — it is now the OLDEST, so plain rule-2 claim
order reaches it without a `next` label. (If more queue items were added
earlier than #276 by the time you read this, take the oldest.) Expect a
two-title PR: the rename is a registry change, the game is a new title.
QA polish items (#298 Tempest, #287 LunarLander, #283 OutRun …) are valid work
if a QA lane isn't live.

## Board
- Queue: **#276 Gauntlet top-down + FOUR HALLS rename**, #292 MYST,
  #293 Bard's Tale, #294 SSX, #295 Civilization V, #296 Prince of Persia.
  (MyST/Bard's-Tale/PoP likely want DOS/IF emulation — check `src/utils/jsdos`
  paths and the AGENTS gotchas before committing to one; SSX and Civ V are not
  arcade-cabinet titles and may deserve a scope question first.)
- Open QA feedback: **#298** (Tempest), #287 (LunarLander), #283 (OutRun),
  #280 (SmashTV), #275 (Gauntlet), #270 (SimCity), #269/#220 (Kart),
  #265 (Marble), #263/#258 (Bubble Bobble).
- `gh pr list` before touching arcade/QA areas. QA lane was live on
  `retrogames-qa-227` (dev port 5173) — don't steal it; forge dev servers fall
  through to 5174+, point `*play` scripts at the right port via env.

## Housekeeping done
Worktree `retrogames-forge-tempest` pruned (branch gone, merged).
`forge-bobubble` still refuses removal (modified/untracked files from a dead
session) — Jon may want to look before force-remove. Main checkout parked
detached at `origin/main`.

## How TEMPEST is built (pointer, not a tutorial)
`src/games/Tempest/`: `sim.js` (pure `step`: A×t world coords, face-lane kills,
edge-snap super bullet that rakes both faces + chain-kills, flipper/pulser/
spinner behaviours with angular scaling by `faces/16` — pulser homing, edge
tolerances, player rev rate all scale with ring size; rim-kill rule; waves;
`CFG` = harness knobs incl. `rimKill/superPierce/laneKill/scoreOn` mutant
flags), `planner.js` (slack scheduler + commitment + arrival seizure + per-type
aim prediction + crossfire; exports `decide` for honesty checks), `art.js`
(projection: angle around vanishing point, near ring RN=372, camera rotates with
player; hue-cycling ship), `index.jsx` (HUD, attract = `plan(0)` replay,
DebugKit). README has fidelity notes + honest gaps (approximate score table, no
saucers/fuse, auto-advance not warp-select, 96-ring pulser mix and why).

## Three questions for Jon
1. **Queue shapes**: the new entries are #292 MYST, #293 Bard's Tale, #294 SSX,
   #295 Civ V, #296 Prince of Persia — beyond PoP they're not arcade-vector
   titles. MYST/Bard's-Tale fit the js-dos spine; SSX/Civ V are console/PC
   scale — want a scope note on those two before the forge burns a session?
2. **Slack-rule precedent**: Tempest's single knobs wouldn't bite, so I
   handicapped four economy dials at once (2 wins, 3 loses). OK as the
   house interpretation of the slack rule, or prefer single-knob slack even when
   it requires harder tuning?
3. Still open from last session, unanswered: attract demo house rule
   (deathless showcase + drama only on death screens — #287/#298 items depend
   on it), and tighter-vs-forgiving difficulty as house preference.
