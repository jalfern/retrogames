# STATE — session 122, slot a (2026-11-04)

## Shipped this session
**SEEDPIN b18 — ADVENTURE** (Atari 2600, 1993). PR #1543 squash-merged to main
(`1f8560f`), live at https://jalfern.com/retrogames/adventure. Issue #1473 stays
open (multi-stage rollout). Pin floor now **53** (`feedbackcheck` 223/223 green).

- Whole engine extracted to `src/games/Adventure/sim.js` on ONE injected mulberry32
  stream (entropy-free, Rogue/Defender precedent); shell pins
  `seedFromQuery() ?? random`, reports `{tick,score,done,seed,room,carrying}`,
  `exposeGame` id `adventure`, tap-to-start, attract on fixed stream 1979.
- **Fidelity restoration (the big one):** pre-port castles had a full-width solid
  TOP wall + gate rect as extra collision → foyers unreachable, chalice home run
  provably impossible (room-level BFS, ~2.5M states). Gate rooms now use top-gap
  walls; the gate rect blocks only while closed. Post-fix BFS wins; scripted harness
  win 10/10 seeds at identical tick 1721, score 4.
- `adventurecheck`: 39 gates + 7 mutants, all green. README written (score honesty,
  honest gaps). QA polish pass filed: **#1545** (two bridges, magnet attract, dragon
  respawn, secret-room egg, first-human difficulty curve).

## Playable now
Arcade + 53 seeded/pinned games incl. `/retrogames/adventure`
(`?seed=4242` pins; every seed winnable — the run must collect bridge→black key→
white key→chalice home to Gold Castle).

## Next: SEEDPIN b19 (take #1473 again via warden TARGET)
Remaining on the rollout map: **SuperMario** and **RaccoonHeist** — the big two,
each likely a full session (big sims; keep existing checks green by REWIRING them
to the pinned stream, not rewriting). Order suggestion: SuperMario first (bigger
harness already exists: mario check suite). Pattern per title (b17/b18 template):
sim.js extraction with injected stream → shell pin+report+contract+tap → own check
green → feedbackcheck floor 53→54 (→55) → README honest-gaps.

## Lessons earned this session
- **An unreachable level is a testable property.** The gate bug shipped because no
  check asked "is the goal reachable?" — BFS the room graph BEFORE porting mechanics
  onto a broken layout. Unfalsifiable layouts are the clue, not noise (rule-8).
- **Own forge branches may need rebase+force-with-lease** when main moves under them
  (remote had the pre-rebase checkpoint; local rebased onto `5a3d0eb`). Verify
  game-file content is unchanged before forcing; `--force-with-lease` only.
- **gh-shim merge needs the PR number explicitly** when HEAD is detached:
  `gh pr checks 1543` / `gh pr merge 1543 ...` inside the rule-5 loop.
- **PR-exists trap:** re-runs of `gh pr create` 422; find the open PR via
  `gh api pulls?head=` and `gh pr edit --body-file` instead. Never leave
  `Closes #<rollout>` in a multi-stage PR body — use "Part of #1473".
- **Prod verify without hashes:** Vercel env hashes differ from local builds; compare
  *marker profiles* (string occurrence counts of b18-only literals: Sword/slay/steal/
  gate/pickup) between prod chunk and local build of the merge sha. Also: rescue
  proxy answers curl `-o /dev/null` with 405 — use webfetch for prod checks.
- feedbackcheck counts only reports with explicit `seed:` key — shorthand `seed,`
  is invisible to its regex.

## Open questions for Jon
None (none filed via jonq this session).

## Board
#1473 open (b19 next: SuperMario, RaccoonHeist). #1545 open (QA ADVENTURE polish,
lane:qa — QA lane's work, not builder's). No halt/steer issues seen. main nightly:
not yet run on `1f8560f` (main-ok treats as OK).
