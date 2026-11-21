# STATE.md — The Forge (rewritten at close of slot a's verification session,
# 2026-11-21; committed to main because game code merged while this session was
# live: DOUBLE DRAGON S4 co-op squash-landed as 1b28783 — stage 4/4 of #2807,
# Jon's #2795 commission COMPLETE. This session resumed the interrupted lineage
# and completed its close-out: local verify, prod verify, board, cleanup.)

## PLAYABLE
- /retrogames/double-dragon — **THE WHOLE COMMISSION LIVE**: S1 Walnuts Street,
  S2 weapons wall, S3 hideout + Marian rescue, S4 co-op (CPU Jimmy Lee default
  in the blue seat; keyboard 2P drop-in WASD·F/G/V any time; dual life banks —
  a drained seat returns with one life at the next stage; crowd cap 3; either
  seat cuts Marian loose; `?solo=1` opts out). QA polish waves #2819/#2829/#2832
  all live. Verified this session: ddragoncheck 97/97 on merged main.
- /retrogames/r-type — S1–S3 live (bits, orbit shield, phase-2 twin cores #2828).
  S4 co-op BUILDING on slot b (#2808, live). Contra S1–S4 + shared pool live.

## WHAT THIS SESSION DID (slot a — resume + close-out)
- Step 1b caught the corpse: PR #2830 pushed, rebased, 97/97 — the build was
  done; the interrupted lineage then completed its OWN merge via its detached
  rule-5 loop (green `static`, 01:05:54Z) and pushed a STATE commit, but died
  before step 8's board work and left its dev server orphaned on 5173.
- Verified independently on top of the merge: `ddragoncheck` **97/97** on
  `1b28783` (incl. the 16 S4 pins + seat-as-fighter laws), zero page errors.
- Prod verified by CONTENT: served entry `index-CKqeCi8s.js` (post-#2832 deploy)
  carries the S4 registry text (`plays DOUBLE`, `2P drop-in (keyboard)…`).
- Board: SHIPPED line + prod URL posted on #2807; `shipped` label added
  (`next` removed); filed a co-op polish pass (#2834) — discovered #2833 already
  filed at 01:09Z and claimed by QA (`building-qa`) — closed mine as duplicate.
- Killed the orphaned slot-a vite on 5173 (never touched 5178/5176). Rule 4:
  game code merged this session — loop turning.

## BOARD
- `building`: #2808 R-TYPE S4 (slot b, LIVE — claimed 00:59Z).
- `next` (claimable): #1712 PLAICRAFT S2 — research lane only; do not narrow.
- QA lane's, never builder: #2833 (DD co-op polish, building-qa), #2831
  (R-TYPE S3 polish).
- game-queue empty; no open jonq questions (#2799 answered+closed).
- Nightly green at the merge (main-ok passed; re-passed this session).

## HARNESS NOTES FOR THE NEXT LANE
- **A detached rule-5 merge loop outlives its session and posts NOTHING.**
  Resume lanes: check PR state FIRST (`gh pr view <n> --json state,mergeCommit`).
  If already MERGED, do not re-merge — complete step 8 yourself: content-verify
  prod, comment the live URL, fix labels. The prod hash will have moved again if
  another PR landed meanwhile (here D28nRhsa → CKqeCi8s via #2832) — grep for
  registry DESCRIPTION fragments, they survive minification, hashes don't.
- **Liveness is keyword-based; phantoms outlive yields.** Slot b's claim of
  #2807 (00:56Z) landed because the S4 checkpoint lines dropped the literal
  `checkpoint` keyword; b yielded at 00:59 but its `claimed` comment still
  answers `holder()` — forge-claim.sh will REFUSE #2807-style phantoms to the
  true owner for 90 min. Step 1b needs no claim: resume the pushed branch
  directly. Keep the keyword in every handoff comment.
- Rename vs QA polish collision rule (from the S4 lineage, still current):
  after any rebase over a polish PR, lint first (no-undef stragglers), then read
  every polish hunk for single-seat assumptions (`gs.billy`) and generalize —
  green lint can still hide a blue seat that never gets the mechanic.
- jalfern.com answers 308 without the trailing slash — prod content polls must
  use `curl -L`.
- Mutant anchors are line-pattern based: re-run `--mutant` after every rebase,
  never trust the pre-rebase green (blade-blind moved to the dual-seat line).
- Co-op determinism: contract replay includes the CPU ally — keep brains
  pure-sim (no Math.random in brains) or the contract's hash checks break.
- Sim default is SOLO (`makeGame`); the SHELL defaults co-op via `coopOn()`.
  Co-op tests must NOT pass `?solo=1`; S1–S3 fixtures depend on the solo default.

## WORKTREES
- Main checkout: detached origin/main (aa3acf9) + this STATE commit.
- `~/Dev/retrogames-forge-double-dragon-s4` — re-detached at origin/main after
  the merge (gh did the switch); branch deleted. Not this session's to reap,
  harmless as-is.
- Active other lanes (do not touch): slot b `retrogames-forge-r-type-s4`
  (dev 5178), QA studio `retrogames-qa-2825` (dev 5176).
- Slot a dev server (5173) stopped at this close.
