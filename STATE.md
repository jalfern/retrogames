# STATE.md — The Forge (rewritten at close of session 366, slot b — 2026-11-20;
# committed to main because game code merged: R-TYPE S1 landed via PR #2817
# (squash c329a97), releasing #2808 to `next`. Session 365/slot a's report was
# HEAD's STATE; its open threads are folded below.)

## PLAYABLE
- /retrogames/r-type — **R-TYPE S1 "Armament" LIVE** (private tag only; routes
  render — #379 split not wired yet): right-only camera + grinding left wall,
  one-hit death + mercy + death-reverts-the-arm, capsule cycle
  (Vulcan/Laser/Wave/Options+Double, wave charge 1–4), pod-3 rescue, Phase-1
  dreadnought at the locked camera (core armoured until the maw gapes, 20 s
  cycle), pod force, STAGE CLEAR. 320×224 hand-laid pixel art + synth audio.
  Prod-verified: index-DtqK5-1V.js → chunk index-uGcTddCI.js.
- /retrogames/contra S1..S4 co-op; /retrogames/double-dragon S1 + polish pass
  (#2813) — unchanged this session, both prod-verified earlier today.
- Studio-side: plaicraft dataset (2 games, per-seat voice) on main (#2811).

## WHAT THIS SESSION DID (slot b, warden target #2808)
- Claimed #2808 (slot a had queued it; its ladder went to #2807 instead). Built
  and shipped **R-TYPE S1** end-to-end: `src/games/RType/{sim.js,art.js,index.jsx}`
  — sim.js DOM-free seeded engine + art.js pixel tables + thin shell with
  `__rTest` hook and `exposeGame('r-type')`; registry entry (private, tapStart,
  dpad/FIRE); own 5×7 pixel font for the HUD.
- **`scripts/rtypecheck.mjs`** (npm alias `rtypecheck`, parked in
  MANUAL_CHECKS): 31 checks — camera law, crush death, one-hit/mercy/arm-revert,
  capsule cycle + charge, hunter home-phases/straighten, missile budget, pod
  rescue, maw law, stage-clear loop, browser leg, and the winnability proof
  (honest attract autopilot 5/12 seeds, gate ≥4). Mutant
  **`armour-blind p1 core`** proven red ("killed through the SEALED maw").
- Wiring in the same commit: contractGames GAMES+PATTERNS, nightlybot soak
  roster, package.json alias, checks.mjs park. contractcheck r-type 15/15;
  eslint/lint:mario|fps|ai/build green. Release comment + `next` on #2808;
  QA polish pass **#2818** filed.

## BOARD
- #2808 R-TYPE — `next` (S1 shipped). S2 backlog on the issue: Dobkeratops
  (the walking tank, own gate), Speed-Up/Half capsules, core speed-up past
  1000, laser trade-off, co-op option.
- #2807 DOUBLE DRAGON S2 (weapons wall) — in flight on the *other* slot-b twin
  session; validated sim core at `origin/forge/double-dragon-s2` @ 2d3288f;
  open stall = seeds 7/14 barrel-corner stalemate (see #2807, 20:2xZ handoff).
- #2800 — needs one SUCCESS nightly (re-proof dispatched 18:22Z yesterday).
- #2818 QA R-TYPE polish / #2810 QA DD polish / #2798 Contra — QA lane only.
- #1712..#1715 PLAICRAFT — research lane.
- Rule 4: game code merged today — contra S4 (#2812), DD polish (#2813),
  FloorBoss (#2811), R-TYPE S1 (#2817). Loop turning.

## QUESTIONS OUT (jonq issues, not STATE.md — #605)
- #2799 (AWAITING, lane:games, deadline 2026-11-22T16:09Z) — human takes for
  the 2-players line; default: stage open, never narrow. (No new questions this
  session — nothing taste/priority-shaped came up.)

## HARNESS NOTES FOR THE NEXT LANE
- **Ports on this box are a minefield**: 5173, 5177, 5178 are all held by
  foreign/orphaned vite processes (5178 = an orphan serving the DD-s2 worktree;
  it answers HTTP but serves ANOTHER lane's code — rtypecheck happily "passed"
  requireDevServer against it and then failed "hook missing"). Rule: at lane
  start, `lsof -nP -iTCP:<port>` AND prove the server is YOURS by fetching
  `src/games/<YourGame>/index.jsx` from it before trusting any browser leg.
  Vite dev also binds IPv6-only sometimes — test 127.0.0.1 explicitly. I used
  5187 + `RTYPE_URL=http://127.0.0.1:5187/retrogames`; never killed a foreign
  listener.
- Mutant scenarios in a side-scrolling shooter must **force the threat into
  range** before firing (p1.x to fighting distance): shots despawn at the
  screen edge, so a naive "fire for N ticks" mutant survives and the proof
  lies. Same for gates: a dreadnought's hull takes ~333 ticks to close — poll
  for state, don't wait blindly.
- `Date.now() >> 2` overflows ToInt32 (sign bit set → `% 2` gives −1 → sprite
  array miss → drawImage throws ~25% of frames). Sprite anim counters must be
  `Math.floor(t/n)%k` or ride sim ticks.
- Liveness floor comments must match `^(FORGE|QA) (<slot>): claimed|checkpoint`
  (word matters — #1258 parser); killShip-style helpers that return whether
  damage landed must still tick i-frames when they return false (crush bug).

## WORKTREES
- Main checkout: detached origin/main — leave it (rule: nobody edits it).
- `~/Dev/retrogames-forge-r-type` — my lane, merged; now sits detached at
  c329a97. Free to reuse for the next title.
- `~/Dev/retrogames-forge-double-dragon-s2` — DD-s2 lane, dirty-on-purpose per
  session 365's note; re-clone from the branch, don't trust its tree state.
- My dev server (5187) stopped at close; foreign listeners left alone.
