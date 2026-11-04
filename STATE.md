# STATE — session 123 (2026-11-04, slot a)

## What shipped
**SEEDPIN b19 MERGED** — `fba3401` via PR #1546. SuperMario seedpin wiring:
- All 10 `Math.random` sites (coin anim phase, brick-debris scatter, explosion
  particles, evolutionary AI weights/crossover/mutation/tournament) replaced with
  `seedRng(seed)` regenerated at every human start (resetGame).
- `exposeGame` id `supermario` (first-ever harness hook for the flagship).
- `exposeFeedbackState` report `{tick, score, done, seed, lives, coins, level}`.
- Canvas `pointerdown` tap-to-start (phone parity — the game had keyboard-only start).
- feedbackcheck floor 53→54.

**SEEDPIN b20 MERGED** — `259cdd3` via PR #1548. RaccoonHeist seedpin wiring:
- `createEngine` now accepts optional `seed` parameter (xorshift guard timing).
- `seedFromQuery()` generated at every human start (start + next functions).
- `exposeGame` id `raccoonheist`; report `{tick, score=deliveredValue, done, seed, job}`.
- Canvas pointerdown already existed (camera drag doubles as tap-to-start).
- feedbackcheck floor 54→55.

## b18 recovery (context)
Resumed slot-b's corpse (`forge/seedpin-rollout-b18` — Adventure sim extraction
pushed but PR #1543 was already merged by slot-b before it died). Verified 39 gates
+ 7 mutants green. No further action needed for b18.

## Next lane (fresh claim)
Normal `forge-claim.sh` ladder. Target: **#1473** (building, lane:platform).
**b21 branch pushed** (`forge/seedpin-rollout-b21`): DosShell seedless report
`{tick, score:0, done:false}` — covers all 5 Ultima games in one file. PR needed.
Then KingsQuest + Zork (seedless wiring, more complex: custom emulator APIs, not DosShell).
After those, remaining non-emulator titles to classify: audit for DECO eligibility
(any game with Math.random in non-index files fails the current DECO law and needs
either sim.js extraction or seedRng seeding).

## Board (end of session)
- #1473 open (building): floor 55, seedless 21+ (b21 pushes DosShell for Ultima1–5).
- No halt labels, no steer, no jonq AWAITING.
- Slot-a port 5173 freed. b21 branch pushed, unmerged.
- main-ok true at exit.

## ENV (carry-forward)
- `. /tmp/forge/env.sh` for gh (shim `/tmp/forge/gh`).
- Push via `-c http.proxy=http://127.0.0.1:18080`.
- Prod verify: use webfetch (different egress), not curl through proxy — rescue proxy
  caches jalfern.com HTML (STATE session 121 lesson).
- Worktree: `~/Dev/retrogames-forge-seedpin-rollout-b18` (node_modules symlink),
  currently detached at `259cdd3`. b21 branch on it.
- pgrep broken (use `ps -ax`).
- `gh pr checks <N>` needs explicit PR number (worktree on non-default branch).

## Open questions
- (none open — no jonq filed)
