# STATE — session 190 (2026-11-09, slot a)

## What shipped
**BRITANNIA: moon-phase routing — the moon decides the destination** — squash
`0d13332` (PR #1863, closes #1862). Never-dry stage (#1571): `weakestStage`
scored BRITANNIA 5 (weakest unheld; FloorBoss/TalkMeDown tied but held then).
Ultima IV's rule that the picker faked is now real: `ROUTE_OFFSET`
[1,3,5,7,4,7,5,3] + `routeDest(gate,phase,n)` in moons.js — each phase
rotates the gate circle (shifts held 1..n-1 = derangement; waxing widens,
full rides diameters, waning mirrors). Gate menu marks tonight's road (silver
disc + moon-ink + caption); other rows are refused with a toast that names the
true route — keyboard/digits/tap all obey (one pad.a seat). Warp untouched.
Evidence: britanniacheck 233 gates (+13, incl. honest rewrite of the vacuous
"network" winnable gate: 7 moonlit rides visit all 8 once; full-moon alone =
the four diametric pairs). Mutants: bad wheel (offset[4] 4→2) = 3 RED, cut
refusal = rule pin RED, restored. britannidrive 20/20 real keys (refusal
teaches, ride I→II byte-exact, full moon flips II: III→VI, lands VI@235,211,
zero page errors). lint:mario/fps/ai + eslint + build green.
Live: https://jalfern.com/retrogames/britannia — prod proof: served chunk
`index-D37fNuJW.js` carries `routeth hence`.

## Session bookkeeping
- **The claim ladder refused #1857** (warden's TARGET): b's hold was LIVE, not
  stale — b resumed and SHIPPED it (PR #1860, `d040733`). Yielding was right;
  retrying a refused claim would have collided. A refusal means "another lane
  is really in there", not "wait 25 min".
- Filed #1862 (POLISH — BRITANNIA, why-weakest line included), claimed,
  shipped, #1829 (open BRITANNIA QA pass) gained two moon-route items (6,7)
  + a stickiness look — that's the QA lane's job now, not ours.
- No jonq filed (nothing taste/priority; the rule came from README + original).

## Next queued (slot a)
1. The ladder is empty (game-queue 0; feedback owned/held; flagship gaps all
   owned) -> **never-dry rung**. Fresh `weakestStage` run: MAGIC CARPET 5
   (tie w/ TalkMeDown/FloorBoss/Britannia 5, registry order picks it).
   CAUTION first: QA merged #1861 into MagicCarpet ~this session and #1764's
   items are moving — re-run `heldDirs`; if any open `building-qa` names
   MagicCarpet, skip it (that's the tie-break's blind spot between runs).
   CometDrift GP may reappear as the wheel recomputes post-#1857.
2. #1637 (WATCH roll) — if it's `next`/`steer` at claim time it outranks;
   b shipped #1857 and its slot may take the roll again.

## Notes for the next slot-a session
- Worktree `~/Dev/retrogames-forge-britannia-moonroute` = detached at
  `0d13332` (post-merge), node_modules symlinked. Reuse:
  `git checkout -B forge/<newslug> origin/main`.
- **page.evaluate scope trap:** node-scope consts (DAY_TICKS) do NOT exist in
  the page function — pass as the second arg. First britanniadrive run died on
  it late in the suite; everything else passed, so grep evaluate callbacks for
  free variables before the first browser run.
- Menu box geometry: `GM.foot` is now the single source (the two pointer-handler
  copies of `+ 44` were folded into `gmBox()`); britanniacheck pins it.
- Gate menus open on ADJACENCY (within 1 tile after a move) — the drive opens
  them with one Arrow press beside a gate; all 8 gates are land-locked 4 ways
  (checked), so ship-walk accidents can't strand the drive.
- Dev server 5173 stopped at session end.

## Open questions
- None. (Queue guidance above is mechanical; nothing for Jon.)
