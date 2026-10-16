# CIVILIZATION V — Stage 3 "The Tech Tree"

Firaxis's 2010 4X. Stage 1 shipped the founding loop, Stage 2 the war; Stage 3
adds the arrow of progress: science is now *spent* on a researchable tech tree
with real Civ V prerequisites, and techs unlock the units and upgrades that make
an era feel like an era.

`https://jalfern.com/retrogames/civilization-v`

## What is in the box

```
src/games/CivilizationV/sim.js      pure deterministic sim (no three, no DOM, no Math.random)
src/games/CivilizationV/planner.js  the autopilot — the attract demo AND the harness witness
src/games/CivilizationV/art.js      tilted 3D hex world (three.js): relief, fog, borders, camps, HP bars, arrows, siege, FX
src/games/CivilizationV/index.jsx   the shell: renderer, camera, input, HUD, research panel, fixed-timestep loop
scripts/civcheck.mjs                Node harness (npm run civcheck) — 132 checks
scripts/civplay.mjs                 Chrome drive with real keys (npm run civplay) — 24 checks
```

## Engine notes

**The tech tree (Stage 3).** Twelve real Civ V techs across three eras with the
original's prerequisite edges: Pottery, Agriculture, Archery, The Wheel, Bronze
Working, Masonry → Writing, Currency, Horseback Riding, Philosophy, Engineering →
Mathematics. Every city's beakers pour into the chosen tech; on completion the
overflow carries into the next. Costs ascend by era (Ancient 24–34, Classical
70–100, Medieval 150) so a single capital tastes Ancient techs by ~turn 10.

**What techs unlock (the mechanic, not a tooltip).**
- `Archery` → the ARCHER is buildable; `Engineering` → the CATAPULT (range 2,
  ×2 strength vs city walls). Queueing a gated unit is *refused* with a
  "requires Archery" deny — the unit cannot exist before its era.
- `Bronze Working` +2 strength for living *and* future warriors; `Horseback
  Riding` +1 movement for military (settlers stay oxcart-slow).
- `Pottery` −2 food per new citizen (granary-lite); `Agriculture` +1 food on
  worked grassland; `Masonry` +100 city walls (walls scale defence, bombardment
  and capture); `Currency`/`Writing`/`Philosophy` +2g/+1 sci/+1 culture per city.
- `Mathematics` +4 city bombardment.

**Gating lives in the sim** (`canQueue`, the `queue` branch of `step`, the AI's
production block), so the browser, the harness and the autopilot all obey the
same rule. Tech state — per-civ known-mask, current research, progress — is in
`stateHash`; replays stay hash-for-hash.

**AI research.** Each rival follows a stable priority path rotated by civ id
(`AI_TECH_ORDER`), so Egypt, China and the Aztecs diverge and the frontier
hardens era by era; barbarians stay timeless. The witness commits the player to
arms first (Archery → Bronze → Masonry…).

**Carried from Stage 2** unchanged: 100-HP deterministic-strength combat with
terrain/fortification/city/river modifiers, march-in, barbarian camps, city
bombardment + capture + domination, banked production, healing at rest.

**Camera & FX.** Orbit/pan/zoom + raycast pick as before. New: the Catapult
model (timber frame, iron-rimmed wheels, throwing arm with a stone), discovery
fanfare + toast, a dark-parchment RESEARCH panel with era columns, prereq
labels, a live progress bar and tap-to-research rows.

## Controls

Click/tap a tile to move; a hostile hex to strike. Keys: Space/Enter end turn ·
E settle · 1/2/3 warrior/archer/settler · C catapult (needs Engineering) ·
**T** opens/closes the RESEARCH panel · **R** commits to the next available tech
· arrows orbit/tilt · wheel/pinch zoom · `?` help. `VirtualControls`: A = END
TURN, B = settle; the research panel is tappable on phones.

## Verify

```bash
npm run civcheck          # 132 Node checks: boot, determinism, founding, economy, combat, barbarians, cities, production, tech data (§16), science+gating+AI research (§17), era effects (§18), win/loss/slack
npm run civplay           # Chrome, real keys: founding + panel (T/Escape/R), gated archer refuse→unlock, live tech completion, rival research, win, 0 errors
npm run lint:civ          # eslint gate for the game + its scripts
```

`civplay` needs `npm run dev`; against headless IPv4 use
`CIV_URL=http://127.0.0.1:<port>/retrogames/civilization-v npm run civplay`.

**Mutant proofs.**
1. In `sim.js` `step`, break the queue gate `if (need && !hasTech(...))` →
   `if (false && ...)` and §17 goes red (130/132); restore returns 132/132.
2. In `doAttack`, flip march-in `if (!ranged && u.alive)` → `if (ranged && ...)`
   and §11 goes red (stage-2 proof still holds).

## Honest gaps (stage boundaries — later stages close these)

- **12 techs, not 70+.** The shipped tree is the spine of three eras; the full
  Civ V grid (and the units/buildings hanging off it) grows in later stages.
- **No buildings/city screen yet.** Production is units-only; Granary/Walls etc.
  exist as tech *effects*, not as built wonders.
- **One and a bit of the victories.** Domination + the founding milestone ship;
  science/culture/diplomatic victories are later stages.
- Combat stays deterministic-strength (Civ V's stacked-odds dice can't replay
  hash-for-hash); its *feel* — HP, terrain, fortification, retaliation,
  march-in, siege — is reproduced.
- No promotions/experience, ZOC, raze/annex choice, peace treaties, spies,
  great people, road improvements.

These are intentional stage cuts, not omissions of promised Stage-3 behaviour.
