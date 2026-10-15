# STATE — 2026-10-15 (forge session, PoP Stage 3: all twelve levels shipped)

## Shipped this session
**PoP deep pass — Stage 3: the twelve levels** (#316, branch `forge/pop-stage3`,
PR squash-landed): https://jalfern.com/retrogames/prince-of-persia
- Twelve named levels (L1 DUNGEON … L12 LAIR) on an 11-row grid: ground row
  `GROUND=8`, two pit rows below (`_` opens a shaft; row 10 auto-solid except
  authored cells). 4–5 rooms each.
- **Mirror** (L4): step to the glass → teleport past the barred corridor, once
  per entry (`mirror` event).
- **Shadow** (L5+): silhouette re-enacts your inputs `shadowDelay=210` ticks
  late; never jumps (shafts kill it); drinks phantom flasks (L5's poison is its
  death, `shadowDrink`/`shadowDown`); freezes while your sword is drawn; touch
  kills — except the lair. Spawn gap 18T ≈ delay×speed keeps replay-lag honest.
- **Mouse** (L8): runs to a raise button and holds the gate open (`mouseHold`).
- **Feather** (L7): ≥2.5-floor drop costs 1 blood while `lev>0` instead of death.
- **Invisible bridge** (L12, `i`): solid from above, paints only after the
  first step finds it (`bridgeSeen`).
- **Merge** (L12): at the exit threshold the shadow homes (6px/t) and folds
  into the sheathed prince (`merge`, `g.merged`) — the story ends without
  killing yourself. Jaffar (boss, hp6) + princess in the doorway.
- Interlude cards between all 12 levels; aspect now 10/11; `die_shadow` pose +
  death-reason line; synth sfx for mirror/mouse/bridge/shadow/merge.
- Gates: `popcheck` **166/166** (67 Stage-3 clauses incl. champion run pinned:
  autopilot clears all twelve at 0 deaths in ~8.5k ticks of 216k, and mirror/
  mouse/poisoned-shadow/bridge/merge all fire in that run; + slack + determinism
  + no-Math.random). lint:pop + build green.

## GOAL — next session
**#316 Stage 4 — sound & feel** (claim it back to `next` if needed): per-event
1989-flavoured music bed (runtime synth only, AudioController), gate/chain and
torch ambience, footstep gait audio, Jaffar theme, and a `popplay` pass over
the twelve levels. Also candidates on #316's box list: guards escorting through
doors, 2-row-floor true proportions (big sim re-cut — park unless Jon asks).
If #316 is gone, oldest `game-queue` is #295 Civ V — STILL do NOT build
without Jon (6 sessions).

## Board (last read)
- `building`: none claimed at end of session (#316 → `next`, Stage 4 remains).
- Queue: #295 Civ V only.
- Open QA: #312 (absorbed by #316 — close as done-by-#316?), #310 SSX, #304
  MYST, #302 Gauntlet/FourHalls, #298 Tempest, #287 LunarLander, #283 OutRun,
  #280 SmashTV, #275 Gauntlet, #270 SimCity, #269/#220 Kart, #265 Marble,
  #263/#258 Bubble Bobble.

## Notes for whoever picks this up
- PoP spine now: `sim.js` (pure step + shadow/mouse/mirror/bridge/feather/
  merge; `moveXShadow` seeps col≤0 walls but obeys every other wall; `land()`
  carries the feather rule; `buttonsPressed` uses the GROUND row so airborne
  presses count), `levels.js` (chars `m M i h _ R F J s x c p w B` + flasks;
  `LEVEL_NAMES` export used by interludes), `planner.js` (gate-hold-until-0.99
  then race; speed-gated spike/gap jumps — jump at sd≤2 running or sd≤1;
  merge-wait at the lair exit; pit-escape at row ≥ H−1), `art.js`
  (`drawMirror`/`drawMouse`/shadow silhouette with glow + eyes; POSES gained
  `die_shadow`; keep exports stable — popcheck imports them).
- Autopilot tuning is data-sensitive: moving a guard/spike ±1 column can flip
  a clean run into a death loop. Always re-run `node scripts/popcheck.mjs`
  (champion clause) after ANY levels.js edit.
- Worktree: `~/Dev/retrogames-forge-pop-stage3` (this stage). Prior stage
  worktrees (pop-deep, pop-stage2) can be pruned once this PR is merged.
- Rule-4 watch: last three merged PRs all touched `src/games/**` — not stalled.

## Three questions for Jon
1. #295 Civ V has sat alone in `game-queue` six sessions. Retire it, or name
   a cabinet-scope 4X you'd accept?
2. Stage 3 invented the shadow-clone rules (replay lag, duel-freeze,
   18T spawn gap, merge-at-exit). Happy with how the threat reads — or should
   the touch-kill bite harder (e.g. duels no longer freeze it)?
3. OK to close #312 as done-by-#316 so the QA board stops counting it?
