# STATE.md — The Forge (rewritten at close of session — slot b, 2026-11-20;
# committed: the forge game MERGED this session (207d056), so per FORGE step 9 the
# report rides main, not just the park.)

## PLAYABLE
- **/retrogames/contra — S4 CO-OP live (merged `207d056`, PR #2796, closes #2779):**
  the blue soldier fights beside you — CPU ally by default (shadow the hero, own rifle
  cadence, hops the same rounds, climbs the hero's shelf line in the falls, honest
  perception: visible state only, never `gs.r`); a human claims the seat any time with
  WASD + F/G (Jon's rule — no second touchpad). Both seats run the SAME `seatStep()`
  (identical physics = same function). Two banks: GAME OVER only when both are empty;
  blue death never freezes the world; respawn at the hero's side; enemies lead the
  NEARER hero's lane; capsules per seat. `hopBand` 46→40 (46 stalled 3/36 sweep seeds
  under the falls guns; 40 wins all 36). `contracheck` 89/89 + `--mutant` 6/6 named
  (new `one-bank-lie`), contractcheck 15/15, lint gates + build green.
- **#1530's stage plan is COMPLETE:** jungle (S1) → falls+gate (S2) → weapon wheel
  (S3) → depot (S3.5) → co-op (S4).
- **PROD VERIFIED live** (~01:3xZ): registry `index-BUblBW1l.js` carries the co-op
  description; Contra chunk `index-BLaIYGSN.js` carries `#2b6fd4` (blue palette), the
  `2UP` HUD tag and `p2join` (drop-in law).

## BOARD
- **No open builder stage for Contra.** #2779 closed shipped. QA owns polish now:
  #2798 (S4 feel/drop-in/HUD/palette — filed at close), #2789 + PR #2793 (capsule
  bitmap salvage, static green — QA lane's, do not touch).
- **#2795 AWAITING (deadline 2026-11-22T00:54Z):** next flagship commission — default
  R-TYPE. Do NOT start a new title before the deadline; builder lanes take the
  default at the sweep if Jon hasn't answered.
- **#838 MYST** remains the big existing-title depth item on the board.

## QUEUE (re-derive at main — never plan from a remembered snapshot)
1. `git fetch && git checkout --detach origin/main` + the #1045 ladder. Likely `next`
   for the next builder session: nothing Contra remains; check whether #2795 passed its
   deadline (then R-TYPE S1 per default) or Jon answered; else the ladder's pick
   (#2787 FloorBoss turn-hold was a full-session reservation — verify still open).
2. If you touch Contra anyway (QA fixes from #2798): branch from main, run
   `DEV_PORT=<own> npm run contracheck` (89 legs) before pushing; pre-S4 legs pin the
   ally down (`p2.out`) or filter by owner (`b.o`/`e.o`) — keep that discipline so the
   solo laws stay provable.

## QUESTIONS OUT (jonq issues, not STATE.md — #605)
- #2795 (lane:games, deadline 2026-11-22) — default: commission R-TYPE.
- #2751 (lane:qa, deadline 2026-11-21) — QA focus; default keep forever.
- Nothing filed from slot b this session (all ship calls were mechanical).

## HARNESS NOTES FOR THE NEXT LANE
- **Co-op laws (new, S4):** `gs.p2` mirrors `gs.p` field-for-field; both seats run
  `seatStep(gs, seat, pad, ledges, floorY, owner)`; `step(gs, pad, pad2)` reads pad2
  only once `p2.human`. `seatsDown()` is the ONLY game-over bank check — never set
  `out` manually in ways that bypass `killPlayer`/`killAlly` (test hooks do it to
  stand a seat down on purpose; legs that assert game-over must kill for real).
  `stateHash` covers the p2 fields + every bullet's `o` — extend it with new state.
- **Owner tags are load-bearing for the harness:** bullets/boots/kill events carry
  `o` (0 hero, 1 ally). When proving kills or cadence in probes, filter by `o` — or
  pin `p2.out = true`. The `no-pierce` mutant initially survived because the CPU
  ally's own rifle killed both lineup bodies; every harm that counts kills must pin
  or filter.
- **Never clear `gs.pb` mid-loop when you want rounds to CONNECT** (clearing each
  tick deletes them before hit detection; only clear to bound memory when counting
  events instead).
- **Lane-aim law (inherited, now two-seat):** enemies aim `aimTarget(gs,x)` = nearer
  live hero's `lane`; snipers fire only at grounded targets; hop always answers an
  aimed round. Depot gun + turrets obey it too.
- **Depot laws (inherited):** view + spawn-shield gate gun AND hatch; hash covers
  depot + capsule volley. See README + git log bb56470.
- **zsh locale trap:** grep bundled JS via file + `LC_ALL=C`; `grep -c` on a missing
  file exits 1 — treat "0" and "missing" alike in poll loops. jalfern.com 308s to
  www.jalfern.com — `curl -sL` or you verify 15 bytes of "Redirecting...".

## WORKTREES
- `../retrogames-forge-contra-coop` (slot b) — shipped S4 worktree; detached at
  207d056, clean. Safe to prune.
- `../retrogames-forge-contra-arms-depot` — shipped S3.5 worktree (detached). Prune.
- `../retrogames-forge-contra-weapon-wall` — superseded duplicate (`29fa62b` pushed
  unmerged; content salvaged into #2789/#2790). Now that S4 shipped, safe to prune.
