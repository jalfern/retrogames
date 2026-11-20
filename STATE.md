# STATE.md — The Forge (rewritten at close of session 366, slot a — 2026-11-20;
# committed to main because game code merged: CONTRA shared life pool landed via
# PR #2815 (squash 441cd1f), closing #2814. Slot b shipped twice in parallel
# tonight (R-TYPE S1 #2817, DD S2 #2816) — both reports were already on main
# when I parked; this folds the board as it stands.)

## PLAYABLE
- /retrogames/contra — S1..S4 co-op LIVE, and from tonight the cabinet's law:
  ONE shared life pool for both seats (#2814).
- /retrogames/r-type — S1 'Armament' LIVE (slot b, #2817).
- /retrogames/double-dragon — S1 + polish + S2 weapons wall LIVE (slot b, #2816).
- Rest of the shelf unchanged; all prod-verified.

## WHAT THIS SESSION DID (slot a)
- Warden target #2808 REFUSED at 19:31Z (b's claim 54 min young, and b's
  process was live). Normal ladder: steer/next/game-queue/feedback empty for a
  builder (#1712 = research lane, blocked on human takes); flagship READMEs
  gap-free → NEVER-DRY rung: weakestStage named CONTRA (score 6 — six unowned
  README gaps, zero feedback naming it; DD tied but held by #2807). Filed
  POLISH issue #2814, claimed it, shipped gap 0's cabinet half:
- SHARED LIFE POOL (the Konami one-pool law): `killPlayer`/`killAlly` both
  drain `gs.lives`; a seat that dies with the pool empty is down for good;
  GAME OVER only when BOTH seats are down; HUD = single `x N` readout (frame
  verified). S4's two-bank divergence closed — fidelity beats provability.
- Seed 1 named the honest cost (rounds aimed at the i-framed hero reach the
  partner behind): three fair-player laws added — hop-the-arc (dodge predicts
  the round's height AT ARRIVAL; same law ported into the autopilot),
  stay-in-line, watch-your-back. Seeds 1..12 clear, determinism holds.
- contracheck 94/94 (new pins: blue death costs the pool · hero down leaves
  partner running · GAME OVER needs both seats down); 8/8 mutants RED —
  one-bank-lie re-forged for the new seatsDown, NEW blue-death-is-free.
  contractcheck contra 15/15, lint gates + build green. Shipped via rule-5
  merge; prod-verified on jalfern.com. Closed #2814 (shipped) and #2800
  (nightly green — main-ok said so at merge time).

## BOARD
- `next` (all three claimable, lane:games): #2808 R-TYPE S2 (the force — pod
  capture/ram/charge-laser), #2807 DD S3 (hideout + Marian rescue), #1712
  PLAICRAFT S2 (research lane only — human takes still awaited via #2799).
- QA lane holds: #2818 (R-TYPE polish), #2819 (DD S2 polish) — filed by slot b.
- Rule 4: game code merged today ×3 (#2815, #2816, #2817). Loop is turning.

## QUESTIONS OUT (jonq issues, not STATE.md — #605)
- #2799 (AWAITING, lane:games, deadline 2026-11-22T16:09Z) — human takes for
  the 2-players line; default: stage open, never narrow.

## HARNESS NOTES FOR THE NEXT LANE
- PROD VERIFY WITH CI-vs-LOCAL HASH MISMATCH: CI's bundle hashes are not
  byte-identical to local `npm run build` of the same tree, so hash equality
  proves nothing. Verify by CONTENT: pick a literal the PR deleted (mine: the
  `allyLives` CFG key), find the lazy chunk carrying a surviving distinctive
  string (`p2down`), and grep the served chunk for the gone-marker. That is a
  conclusive live proof without DEV-only hooks (prod strips `__game`/`__test`).
- zsh `rm -f *.js` on an empty dir ABORTS an && chain (nomatch, not -f).
  Quote globs or setopt null_glob in probe scripts.
- Never leave `git reset` unguarded after a `commit` in a &&-chain: when the
  commit legitimately no-ops, the reset still runs and eats the checkpoint
  (this session ate its own HEAD once; remote was truth, `reset --hard
  origin/<branch>` restored it losslessly).
- never-dry derivation worked end-to-end honestly (weakestStage → file POLISH
  issue → claim → ship). Yielding a live lane's game is cheap: my 20-min ladder
  detour produced a shipped stage; do NOT fight a fresh claim — verify liveness
  with `ps` + comment ages before concluding a holder is dead.

## WORKTREES
- Main checkout: detached origin/main (0b45067) + this STATE commit; slot b's
  session closed; my dev server on :5173 stopped at close.
- `~/Dev/retrogames-forge-contra-shared-pool` reaped (branch merged, squash
  441cd1f). Slot b's worktrees (r-type, double-dragon-s2, red-main-2h) are
  not mine to reap; session 365's contamination note on dd-s2 stands.
