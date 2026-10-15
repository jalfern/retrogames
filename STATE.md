# STATE — 2026-10-15 (forge session, PoP deep pass #316 — Stage 1 WIP)

## In progress (NOT shipped)
**#316 Prince of Persia: the deep pass** — Stage 1, branch `forge/pop-deep`
(worktree `~/Dev/retrogames-forge-pop-deep`, node_modules symlinked). Draft PR
filed, marked WIP. Keep the `building` label; do NOT reset to `next` until a
stage actually merges.

## Done this session (engine spine — provably wins, lint-clean)
Rewrote the 1989 rules from scratch in `sim.js` + `levels.js` + `planner.js`
(three heights/auto-grab/single-screen model deleted):
- **Multi-room levels**: 10-wide × 3-floor rooms, hard screen flip on doorway
  (`roomOf(c)`, camera offset = `room*RW`). 3 levels × 4 rooms each, all clear.
- **No lives**: death → level restart (checkpoint on L3), clock keeps running;
  `sword`/`clock`/`bonusMax` persist across levels + restarts.
- **Unarmed start**: sword pickup in L1 room0; sheath outside a duel.
- **Timing duel**: Strike `X` / Block `Up`, parry→counter, recoil; no heights.
- **Falls by floors**: 1 safe, 2 = −1 hp, 3+ death (in `land()`).
- **Grab only while Shift held** (no auto-grab); Shift = run on ground.
- **Machinery**: raise-button → gate that closes slowly (`gateFall`),
  chompers (scheduled jaws), loose floor→rubble, exit plate→door→stairs.
- **Potions 1989**: small red +1, large red +1 max, blue −1, slow-fall,
  upside-down; NO strength.
- Autopilot clears all 3 levels: **win, 0 deaths, clockLeft 3573s**. eslint
  clean on all three spine files. Ground-fill + ceiling-to-floor gate-extent +
  room-clamped patrols are the level post-passes.

## Blocked — the React layer is RED (next session starts here)
`art.js` + `index.jsx` still target the deleted API, so `npm run build` fails:
- `art.js` imports `W, SPIKE_PORTED, PLATE` from levels (now `RW,H,T` + new
  codes) and `portOpen` from sim (gone).
- `index.jsx` uses `g.lives`, `g.p.strength`, old `SPIKE_PORTED` art path.
Todo, in order:
1. `art.js`: room-camera (`room*RW*T` offset, `imageSmoothingEnabled=false`),
   sheath/draw sword, health-as-flasks bottom-left + guard hp bottom-right,
   slow-open gate bars, chomper jaws, spikes, torches, upside-down flip (scaleY
   −1). Draw at `RW*T`×`H*T`, floor rows `[8,5,2]`.
2. `index.jsx`: controls Arrow move / `Down` crouch-hang / `Up` block / `X`
   strike / `Shift` run+grab; remove lives+strength HUD; no-lives death→level
   restart UI; container aspect ~10/9. Update `src/config/games.js` PoP entry
   (aspect/description/controls).
3. Rewrite `scripts/popcheck.mjs` to the Stage-1 gate (no-lives restart, no
   fight before sword, block-parries, falls-by-floors, held-grab, room flip,
   machinery, potions, autopilot wins, slack, determinism, no-Math.random).
   Delete the old 57-assertion file (it tests the removed model).
4. `npm run build` + `npm run lint:pop` + `node scripts/popcheck.mjs` green,
   then `npm run dev` + `popplay` headless drive. Merge as `Part of #316`, then
   reset #316 to `next` and comment which Stage-1 boxes are proven.

## Do NOT regress
- Ground row is forced continuous solid → no pit falls on the ground floor;
  falls come only from elevated ledges/chompers/loose. Loose floors live on
  middle/top rows, never ground (ground loose = death pit that contradicts fill).
- Spikes are single-width with clear landing (2-wide is un-hoppable by autopilot).
- Floor buttons trigger on horizontal overlap (ground row), not `onGround` — a
  running/tapping player crosses a plate mid-jump; requiring `onGround` missed
  the exit plate and deadlocked the run.
- Exit fires on position (far room + door column), not `onGround`.
- `gateFall` must be slow enough to cross the gate column after the button.

## Board (last read)
- #316 `building` (this work). #295 Civ V `stalled` — do NOT build, escalate.
- QA MASTER live all session → no QA borrow.

## Three questions for Jon
1. Stage 1 is engine-only so far (art/index/popcheck unwired) — OK to ship the
   full 1989 rework as ONE PR once the React layer lands, or split engine
   (now) + art (next) into two `Part of #316` PRs?
2. 3 levels for Stage 1 vs the issue's 12 for Stage 3 — happy with incremental
   (3→6→12 across stages), or do you want the full 12 in one shot?
3. Original auto-grabbed; the issue mandates held-Shift grab. I followed the
   issue (held-grab) — confirm that's the intent, since it's less forgiving on
   touch than the original?
