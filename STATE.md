# STATE.md — The Forge (rewritten at close of slot a's DOUBLE DRAGON S4 session,
# 2026-11-21; committed to main because game code merged: co-op shipped via
# PR #2830 (squash 1b28783), stage 4 of 4 — #2807 CLOSED, Jon's #2795 commission done.)

## PLAYABLE
- /retrogames/double-dragon — **S4 co-op LIVE**: blue seat default (CPU Jimmy
  Lee fights beside you), keyboard 2P drop-in WASD·F/G/V any time (Contra law),
  dual life banks (second wind: drained seat returns with 1 life next stage),
  crowd cap 3 (2 solo), either seat can cut Marian loose, no friendly fire.
  S1–S3 + QA #2819/#2829 polish all live. `?solo=1` opts out.
- /retrogames/r-type — S1–S3 live (bits, phase-2 twin cores; #2828). Contra
  S1–S4 + shared pool live. Rest of shelf unchanged.

## WHAT THIS SESSION DID (slot a, target #2807 S4)
- Design comment on #2807 first (co-op deviation notes: original had no CPU
  partner), then sim → shell → harness, checkpoint per pushed commit.
- Seat-as-fighter refactor: `updateBilly` → `updateFighter(gs, p, pad)`;
  `targetOf` nearest-dragon w/ hysteresis; `jimmyBrain` = dragonBrain re-seated
  (honest autopilot wins co-op 6/6 seeds); dev hooks `allyHuman/killAlly/…`.
- Crate-corner deadlock fixed (co-op seed 2 stalled 57k ticks): k-slip prefers
  wanted dy; brain closes both axes (`adx>16 || |dy|>10`).
- Mid-flight collisions ×2 handled: slot b merged R-TYPE under me (no touch);
  QA #2829 (DD polish: lash/clatter/stick/spin-faces) merged under me → rebase
  with real conflicts — union resolution GENERALIZED their polish to both seats
  (lash decays and crack-bites for P2 too; pickup stick/clatter survive the
  q-rename). Lint caught the QA lines still saying `b` inside p-renamed bodies.
- Verify: ddragoncheck **97/97** (16 S4 pins; QA's +6 ride green), mutants 7/7
  red-named — new `ally-blind` (crowd ignores blue seat = co-op is scenery) and
  `seat-blind` (one bank empty ≠ game over). contractcheck 15/15 (co-op default
  is deterministic under the contract), lint gates + build green.
- Rule-5 merge; prod verified by CONTENT marker (entry index-D28nRhsa.js carries
  BLUE DRAGON/WASD). #2807 closed + shipped. QA co-op polish filed #2833.

## BOARD
- `next` (claimable): #2808 R-TYPE S4 (co-op wingman — same shape as DD S4:
  seat-as-entity, dual banks, drop-in law; its S3 just taught the ring/aim laws).
  #1712 PLAICRAFT S2 (research lane only; #2799 AWAITING, default = stage open).
- QA lane's, never builder: #2833 (DD co-op polish — NEW), #2831 (R-TYPE S3
  polish), #2819 (DD S2 polish — mostly absorbed; check before pickup).
- Nightly green at this merge (main-ok passed).

## HARNESS NOTES FOR THE NEXT LANE
- **Rename vs QA polish is the collision shape.** Branch renames a param
  (billy→seat); QA adds lines using the OLD name in the same functions. Git
  merges silently, eslint catches the stragglers (`no-undef` on 4 lines). After
  any rebase over a polish PR: lint first, then read every polish hunk for
  single-seat assumptions (`gs.billy`) and generalize — a green lint can still
  hide a blue seat that never gets the mechanic.
- `git checkout --ours <file>` mid-rebase = the ONTO version, not your WIP. If
  your change is structural, rebuild from main + re-apply deltas mechanically
  instead of guessing conflict regions.
- jalfern.com answers 308 without trailing slash — prod content polls must use
  `curl -L` (both here and slot b hit this; consider a shared helper).
- Mutant anchors are line-pattern based: a rebase can move them (blade-blind
  re-anchored to the dual-seat inv/z line). Re-run `--mutant` after rebase,
  never trust the pre-rebase green.
- Co-op determinism: contract seed replay INCLUDES the CPU ally — fine while the
  brain is pure-sim (no Math.random in brains); keep it that way or the
  contract's identical-hash checks break.
- Liveness law: holder = newest `^(QA|FORGE) \(slot\): claimed|checkpoint`
  <90 min; every pushed commit gets its issue line.

## WORKTREES
- Main checkout: detached origin/main (1b28783) + this STATE commit.
- `~/Dev/retrogames-forge-double-dragon-s4` — re-detached at origin/main at
  close; branch `forge/double-dragon-s4` deleted at merge. Dev server (5173)
  stopped at close.
- `~/Dev/retrogames-forge-r-type-s3` — slot b lineage; not this lane's to reap.
