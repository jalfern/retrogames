# STATE — 2026-10-17 (forge session — CIV V polish #1 SHIPPED: transports + amphibious assault)

## This session (#375 item 1, PR #399, merged aba7f39)
- Resumed the corpse branch `forge/civv-polish` per step 1b + Jon's unpark
  comment (engine+§34 was already pushed at bd878a5: Galleon hold 2,
  embark/land/assault/drown laws, cargo folds into stateHash).
- Finished the handoff: civplay Stage-8 block de-vacuums (issue item 6) —
  seed 4 rises on the COAST (Node-proven) so L's keel is real, the inland
  escape clause (`|| coastal === false`) is gone; live deny paths drive real
  keys (J → `SELECT A GALLEON WITH CARGO`, E far from a hull →
  `NO FRIENDLY GALLEON ALONGSIDE`); laden-hull probe shape checked live.
- README rewritten for transports (laws, controls E/J + tap-beach, gaps).
- Proof: civplay 60/60, civcheck 469/469; mutants red & restored —
  capacity-drop reds §34, `start(4)→start(1)` reds exactly the two
  de-vacuum checks. eslint + lint:mario/fps/ai + build green.
- CI all green FIRST try (smoke included — the flake did not repeat).
- #375 requeued `game-queue` (items 2–5 left; title now points at item 2:
  capital capture ≠ extinction).

## Still open / held
- **#398** (contract batch 2): static green, smoke red 3× (Missile Battle
  timing flake, not this branch's code). 3-strikes rule holds the merge —
  Jon decides attempt 4. Branch `forge/contract-rollout-b2` intact in its
  worktree (b2afe8a).
- **#391** (keep `building`): 14/40 sim.js titles wired; batch 3 ready
  (Lemmings, Sonar, Outpost, Polarity, Dogfight, SmashTV are candidates —
  check each for function-bearing state, omit snapshot/restore there).
  Batch 3 must base on main AFTER #398 merges (contractcheck conflict
  otherwise).
- No new `next`-labeled issues; queue: #375 only.

## GOAL — next session
1. If Jon answers the #398 question: merge from the branch (rerun failed
   smoke first if he says accept) + verify prod + relabel #391 list.
   Otherwise leave #398 held — do NOT attempt #4 yourself.
2. Else work #375 **item 2: capital capture ≠ extinction** — vassalize/
   defeat instead of unit-extinction for domination; HUD pill already tracks
   captured capitals; new civcheck section + mutant, own PR.

## Notes for whoever picks this up
- Main checkout detached at aba7f39, clean. Worktree
  `~/Dev/retrogames-forge-civv-polish` re-detached at aba7f39 (keep for
  item 2 context; node_modules symlinked to main).
- **Prod-verify gotcha hit:** ~20 min of 20s-interval polling of
  www.jalfern.com/retrogames tripped Vercel attack-mode → 403 on all
  requests. Site is fine for browsers; slow the poll (60s+), verify by chunk
  name from `dist/` of the merge commit, and stop after ~5 tries.
- CivV ships in the main index chunk (`dist/assets/index-*.js`) — marker
  grep on the index bundle is the right prod probe for this game.
- Never `git stash pop` in a lane worktree — stash@{0} belongs to whichever
  lane parked it (nearly wiped an in-flight civplay edit this session).
  CivV seeds: seed 1/2/3/5 start inland, seed 4 coastal; seed 4's capital
  wins at t12 (size 4), so live-turn loops accept `ended`.
- Dev server may linger on :5173 from this lane — kill before reusing.

## Three questions for Jon
1. #398 attempt 4: your call stands from yesterday — accept the Missile
   Battle smoke flake (rerun + merge), or want `smoke` marked
   continue-on-error so advisory flakes can't wedge rule-5 merges?
2. #375 convention: shipping 1 of 6 polish items, I requeued the umbrella
   issue to `game-queue` with the title bumped to item 2 rather than adding
   `shipped`. OK, or do you want one issue per polish item?
3. Prod-verify etiquette: is there a lighter-weight check you prefer than
   bundle-hash polling (it tripped Vercel attack mode on the shared edge —
   403s will confuse the next session's verification)?
