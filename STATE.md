# STATE — 2026-10-15 (forge session, PRINCE OF PERSIA shipped)

## Shipped this session
**PRINCE OF PERSIA** (#296) — PR #311, squash-merged at `817c1bc`, live:
https://jalfern.com/retrogames/prince-of-persia
- Mechner 1989 rebuilt whole in code: weighted run/skid, careful step,
  speed-scaled jumps, auto-grab hang + pull-up/shimmy/hang-jump; loose tiles,
  plate-latched spike ports, seam-free guillotine; three-height sword duel
  (telegraphed windup, match-height parry); 60-min clock, hearts/lives,
  life/strength/levitation/poison flasks; five screens ending in Jaffar's
  throne (boss gates the princess door).
- Gates added to CI `static` (follow-up PR #313 at `6992e00`): `lint:pop` +
  `popcheck` → **57/57 PASS**
  (rule pins · autopilot wins all 5 screens zero deaths · slack rule
  0.75x clock + every guard hp−1 still wins · determinism · no-Math.random ·
  planner/CFG agreement). Parry-rule mutant proven red (6 fails) then
  restored. `popplay` headless drive: 11/11 real keys, zero page errors.
  `npm run build` clean, all four scoped lint gates clean.
- QA polish pass filed: **#312** (animation density, lighting tint, Jaffar
  teleport, mirror-shadow idea, 12-screen expansion — content-only).

## GOAL — next session
Oldest open `game-queue` item: **#295 Civ V** — standing scope question, now
the THIRD time retired-without-answer (see Q1). Do NOT build it without Jon.
If Jon hasn't answered by then, borrow the QA lane if no `QA MASTER` process
is live: #312 item 3 (Jaffar teleport + guard palettes) or #310 (SSX polish)
are the highest-value fallbacks.

## Board (last read)
- Queue: #295 Civ V only.
- Open QA: **#312 (PoP polish — fresh)**, #310 (SSX), #304 (MYST),
  #302 (Gauntlet/FourHalls), #298 (Tempest), #287 (LunarLander), #283
  (OutRun), #280 (SmashTV), #275 (Gauntlet), #270 (SimCity), #269/#220
  (Kart), #265 (Marble), #263/#258 (Bubble Bobble).
- Two QA MASTER sessions were live all of this session (mini + mbp); forge
  did NOT borrow a QA item.

## Notes for whoever picks this up
- PoP architecture: `sim.js` pure step(state,input) (feet-position px, grid
  tiles 32px, one 19x12 screen per level — no camera), `levels.js` ASCII
  rooms (plate presses LATCH the port open forever — sticky, do not make it
  momentary or the route is impossible), `planner.js` reactive autopilot
  (mirror-constants pinned by popcheck), `art.js` paint-only, index.jsx
  shell. Copy for any future platform/duel title.
- Two bugs this session worth remembering: guards spawn `r` must be carried
  in `makeLevel` (missing y made duels dead code), and the guillotine phase
  cycle must SUM exactly to its period or the blade parks mid-slot.
- Holding AWAY from a hang now releases it (learned from popplay's blind
  sprint: a hanging player holding right was stuck forever).
- Main checkout stayed detached (Jon's rule); build ran in worktree
  `~/Dev/retrogames-forge-prince-of-persia` (left in place, HEAD re-detached
  at 817c1bc, node_modules symlinked).
- Prod verification: index HTML only lists the hashed entry bundle; poll the
  entry `assets/index-*.js` for the slug, not the HTML (`prince-of-persia`
  matched inside the JS).

## Three questions for Jon
1. #295 Civ V is now the only thing left in `game-queue` and this STATE file
   has flagged it three sessions running. Retire it, or name the cabinet-scope
   4X you'd accept? (Until then forge has no queue item and leans on QA.)
2. PoP ships 5 screens; the original's final third (levels 6-12, mirror room,
   Jaffar's teleport) is content-only per QA #312 item 11 — OK to spend the
   next gameless forge slot expanding PoP to 12, or hold for a new title?
3. `popplay` drives real keys but its blind sprint *escapes* L1 without the
   duel (jumping clears the pits). Should the play script force a duel
   (walk into the guard, survive) as a merge-blocking proof, or stay advisory
   as it is now?
