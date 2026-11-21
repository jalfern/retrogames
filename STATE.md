# STATE.md — The Forge (rewritten at close of slot a, 2026-11-21; committed to
# main because game code merged: CONTRA seat ceremony shipped as PR #2840 ->
# 06e6806, a NEVER-DRY stage (#1571) after the flagship rungs came up spent.
# Slot b's lineage also completed during this session: R-TYPE S4 (#2838), so
# Jon's #2795 twin-commission is fully live on both titles.)

## PLAYABLE
- /retrogames/contra — S1 jungle + S2 waterfall + S3 weapon wall + depot +
  S4 two-seat co-op, and now the **seat ceremony**: P2 arrives on a rappel at
  the hero's side (mercy inv, clean rifle, beats the death tumble), and a seat
  nobody drives for 10 s returns to the wingman brain (cost-free, 60-tick
  mercy, p2gone chirp, any touch resets patience). contracheck 105/105,
  mutants 92/92 (new `never-release`).
- /retrogames/r-type — **S1–S4 live**: bits, orbit shield, Phase-2 twin cores,
  S4 co-op (slot b, #2838). QA polish #2820/#2826/#2836 live.
- /retrogames/double-dragon — S1–S4 co-op live (commission #2795 complete).
- Rest of shelf unchanged.

## WHAT THIS SESSION DID (slot a)
- Warden target #2808 REFUSED at claim (slot b's lock mechanically fresh — b
  was alive and shipped it as #2838 during this session). Normal ladder: no
  steer; `next` = #1712 (lane:research, not builder); game-queue empty; QA
  borrow blocked (live QA session) -> flagship stage spent (all four flagship
  READMEs gap-free) -> NEVER-DRY rung: `weakestStage` scored CONTRA 6 (six
  unowned README gaps; DoubleDragon/R-Type held). Filed POLISH #2837, claimed,
  shipped in ~1.5 h: sim ceremony, rappel paint, 8 new pins, 1 mutant, docs.
- Rule 4: game code merged — loop turning.

## BOARD
- building: empty (both commissions done; queue drained).
- `next` (claimable): #1712 PLAICRAFT S2 — lane:research/big-build; STATE has
  marked it research-only since November — builder lanes skip.
- QA lane's, never builder: #2835 (R-TYPE S3 polish II), #2833 (DD co-op
  polish). Fresh builder-ignorable: #2842 (CONTRA ceremony polish, feedback —
  presentation only, for QA's next round).
- Slot b filed #2839 (forge-claim lock bug) + #2841 (R-TYPE wing polish).
- game-queue: empty. No open jonq questions.

## HARNESS NOTES FOR THE NEXT LANE
- **jalfern.com proxies Next-cached HTML**: after a merge the proxied
  index.html keeps naming the PREVIOUS entry for ~10+ min (x-vercel-cache HIT)
  while the ORIGIN (retrogames-psi.vercel.app) already serves the new build.
  Verify prod by fetching a NEWLY HASHED chunk by name through jalfern (asset
  paths proxy live) — the HTML's own marker poll lies until the edge ages.
- Game chunks are referenced from deeper chunks with RELATIVE `./index-*.js`
  names — a `grep assets/` sweep of the entry misses half the graph. Expand
  `./` refs recursively when content-verifying prod.
- The 62-chunk `assets/` sweep finding no marker may just mean you searched
  the wrong graph level — prove against your own `dist/` first (this session
  burned 20 min before checking local dist had the string).
- Seat ceremony (Contra): `padClaim` distinguishes keyboard claims from
  harness-pinned `human=true` seats — auto-release only watches padClaim, so
  every pre-S5 pin stands. Touchdown zeroes `enterT`; patience counts lives
  ticks only (hero-death freeze pauses it, by design).
- Liveness keywords (`claimed`/`checkpoint`) in every issue line; warden
  replay prompts don't change board state.

## WORKTREES
- Main checkout: detached origin/main (53d0899) + this STATE commit.
- `~/Dev/retrogames-forge-contra-seat-ceremony` — re-detached at origin/main
  after the merge; branch deleted on remote. Reap freely.
- Slot b dev server 5178 was stopped by its own lane; QA studio 5176
  untouched. Slot a dev server (5173) stopped at this close.
