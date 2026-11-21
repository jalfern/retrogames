# STATE.md — The Forge (rewritten at close of slot b, 2026-11-21; committed to
# main because game code merged: src/games/Contra/sim.js shipped in PR #2856 ->
# 8f5f534. Rule 4 keeps turning: #2850, #2853, #2855, #2856 — four game-code
# PRs in a row across the two slots.)

## PLAYABLE
- /retrogames/contra — S1–S4 + seat ceremony + pod carriers + **gate pierce
  law**: fire/laser spark through the cannon housings and keep flying (one
  take per housing per beam, the bodies law verbatim); ordinary rounds still
  die at the mount; the shuttered core remains the ONE weak point — a laser
  bought from the depot now rewrites the gate fight like it rewrites the
  jungle. Zero gs.r draws; winnable seeds unmoved. contracheck 126/126,
  mutants 11/11 named (#2854 -> PR #2856).
- /retrogames/double-dragon — partner personality live (slot a, #2855):
  guardian law, release law, 13-beat technician cadence. ddragoncheck 112/112.
- /retrogames/r-type — S1–S4 + S4 wing polish (#2841 -> #2853).
- Rest of shelf unchanged.

## WHAT THIS SESSION DID (slot b)
- Warden target #2851 REFUSED at claim (slot a's checkpoint 18 min fresh —
  correct; slot a shipped it as #2855 mid-my-session). Ladder: no steer/halt;
  `next` #1712 REFUSED (slot a's completion comment 46 min fresh); game-queue
  empty; QA borrow closed (QA MASTER alive at 5176); flagship stage spent;
  NEVER-DRY rung: `weakestStage` scored CONTRA weakest at 6 (fb #2852 + #2842
  + 4 unowned README gaps; DD/R-TYPE held at the time). Filed POLISH #2854,
  claimed slot b, shipped ~1 h in one PR.

## BOARD (at close)
- building: none. building-qa: #2842 (CONTRA ceremony — QA's, per slot a).
- game-queue: empty. idle-kick at close: `KICK DOUBLE DRAGON 0 weak` — DD is
  again the weakest unheld title; next free slot takes DD gaps #1..#7 (#3,
  chain scoring, is the meatiest; slot a's note).
- feedback (nobody-owned): **#2852** (CONTRA pod-carrier polish — rotor read,
  pod-hook moment, land juice), **#2857** (DD polish pass, new from slot a),
  **#2839** harness bug (claim-status.mjs ignores the `FORGE (<slot>):`
  checkpoint format → liveness locks read dead; small, any lane).
- #1712 stays `next` (wait-state: friends' takes via /retrogames/join).
- QA MASTER alive at close (5176).
- Open jonq (link only): **#2844** (S2 fold ruling; default keep fold),
  **#2846** (flagship public promotion; default keep private).

## HARNESS NOTES FOR THE NEXT LANE
- **Prod chunk-crawl fix (big one this session):** Vite references lazy chunks
  inside chunks as `./name.js` — an extraction regex anchored on `assets/`
  misses EVERY lazy chunk and reports a false negative (my first crawl found
  63 chunks and no marker; the corrected closure found 160 and the marker
  `push("g"+` in `index-CUHSqAVS.js`, alongside #2847's `carrierNext`).
  Extract bare `[A-Za-z0-9._-]*\.js` and resolve against /retrogames/assets/.
  Also: jalfern.com 301s to **www.** — crawl without -L sees "Redirecting…".
- Pin "a round dies at X" with a **single tracked round**, not screen
  occupancy: `pad.right` makes the hero run to the wall clamp, so held-fire
  sweeps lines that legitimately fly over the housings between mount and core.
- Diagonal-from-x=100 crosses gun-0 (x+y≈234) and never enters the core band
  ([256,336]) — the housing pins test mounts with zero core interference.
  `coreT = coreOpen + 10` budgets ~60 ticks of shut shutter: finish the pin
  inside the window (the armour-law pin uses 55).
- Zero-rng law still stands (no gs.r draws in the pierce change); determinism
  and winnable-seeds pins green unchanged.

## WORKTREES
- Main checkout: detached origin/main (4798045 lineage) + this STATE commit.
- `~/Dev/retrogames-forge-contra-gate-pierce` — finished; reap freely
  (branch gone on remote).
- Ports: b's 5178 stopped at close. QA studio 5176 = QA's, leave it.

## Open questions
- #2844 — PLAICRAFT S2 fold ruling (research lane's).
- #2846 — promote CONTRA/R-TYPE/DD to public? (default keep private.)
