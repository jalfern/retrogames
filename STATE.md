# STATE — session 201 (2026-11-10, slot a)

## What shipped
**WATCH batch 19 — the seated brains get stronger** — squash `9abc51c`
(PR #1918, Part of #1637). Both targets were batch 18's own honest witnesses.
SI: seed-1462 stall root-caused (law 3's lead point sits ~17 px into the
march, often above a fort — shots spent on bricks, measured 511-tick one-kill
window before the fleet landed 9-left). Fix: lowest-invader choice prefers a
shield-free LEAD point; fire gate never shoots into a fort unless the target
hides behind one. Witness 19/20 → 20/20, slowest 1987 → 1857, stall-gap pin
≤450 kills both halves of the fix (mutants 477/731), 3/3 mutants die.
Defender: the patrol defends the humans — hauler priority (×0.25), divers
×0.7, friendly-fire suppression near walkers, falling-human catch (+250) and
elevator delivery (+500). 20-seed patrol: catches 8→46, deliveries 8→46,
score floor 4000→7000, waves 57→82, survived unchanged. Two law unit tests,
4 new mutants, 16/16 die. README honest gaps rewritten to measured truth.
Live: https://jalfern.com/retrogames/invaders + /retrogames/defender
(prod CONTENT probe: `carry!==null?x*=.25` minified signature — see #1637).
QA context added to #1906 (SI watch-pause tell) and #1907 (DF carry visuals
now load-bearing in attract/WATCH).

## The session's real lesson: a rate-limited claim is not a collision
GitHub core REST was exhausted (5000/5000 — qa-mini/supervise loops spend it
by design). `forge-claim.sh` misread its own failed queries as "YIELDED:
claimed at the same time". Read the output: two API 403s + jq errors = the
script never read a checkpoint. Waited for the reset (~30 min, `gh api
rate_limit` is exempt), retried, claimed cleanly. Use the GraphQL headroom
(`gh pr view --json`, issue views) during REST droughts. Full-suite 1-off
failures on UNTOUCHED titles (comet-drift-hd hook) → re-run alone once,
green = Chrome flake, move on (rule 3).

## Session bookkeeping
- #1637 claimed(a)→batch 19 shipped; stays `building` (rollout continues,
  batch 20 needs a fresh claim; no pushed branch exists now — merge deleted
  forge/watch-b19).
- #1906/#1907 got b19-context comments (QA lane's items unchanged).
- No jonq (nothing taste/priority/hard-to-undo).
- :5173 dev server runs from this lane's watch-b19 worktree (detached
  9abc51c, node_modules symlinked) — free to reuse or kill next session.

## Next queued (slot a)
1. Fresh ladder: warden TARGET, else halt/steer/next/queue, game-first.
   #1637 batch 20 is a fine ladder candidate but has no corpse — claim fresh;
   remaining honest-watch ideas: SI endgame re-aim pacing, DF far-side haul
   interception (README honest gaps name both).
2. If dry: builders-the-reverse — check `pgrep -f "QA MASTER"` before
   borrowing ONE feedback item; else flagshipStage/weakestStage via
   scripts/lib/idle.mjs (convert gh labels to names before heldDirs).
3. QA owns #1915/#1900/#1888/#1871 (TMD), #1906/#1907 (SI/DF polish) —
   builders don't pick them up unless steered.

## Notes for the next slot-a session
- Rate-limit etiquette: `gh api rate_limit` is free; core resets hourly;
  the mini+warden loops burn REST most hours — batch your gh reads.
- SI gates: invaderscheck (+--mutant, 3), watchcheck --only=invaders;
  DF: defendercheck (+--mutant, 16), watchcheck --only=defender. Both
  witness loops are deterministic Node — tighten pins to measured values.
- Prod-verify without a registry-string change: grep the live chunk for a
  minified STRUCTURE signature (esbuild keeps property names:
  `carry!==null\?[a-z]*\*=[.]25` — escape the ternary `?`, an unescaped one
  is an ERE quantifier that silently never matches; prove the sig against
  your local dist BEFORE blaming prod). Enumerate chunks from the live entry
  HTML (follow the www redirect — bare jalfern.com answers 308).

## Open questions
- None. (No taste/priority call needed from Jon.)
