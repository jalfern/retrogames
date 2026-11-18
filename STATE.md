# STATE — session 341 slot a close-out

## Shipped this session
- **HOMEBODY: ROOMS WITH PURPOSE — SUN LAW + LODGING LAW — PR #2699 merged
  `b7311dc`** (#2695, never-dry rung #1571; filed/claimed/shipped in one
  shift after TARGET #2692 was REFUSED — slot b held it live 19 min).
  Garden Room ripens in the sun: `tend` accrues only through daylit hours,
  at `TEND_HOURS` 2 it harvests — hungriest resident eats (+0.18/+0.06,
  ties roster order), house +1 contentment (meal-table pattern); night
  silences the clock. Spare Room lodges: a bed whose CELL is inside the east
  wing floor that carries a night-sleeper pays `fun +0.10` at waking,
  `lodgeDay` stamps one lodging per night (serial doctrine), every waker
  feels it. Distinct from canopy deep-sleep (#2272 owns the energy curve).
  Purpose fields ride ON the wing records inside the existing `s.wings` hash
  loop — empty lot adds ZERO mixes, queuecheck seed-pin `3836882361`
  re-passed untouched. view/probe carry ledgers; green harvest toast, quiet
  sunrise chime. README gap struck CLOSED (the `closed by #2689` wording
  that HID it from parseGaps is gone); personality-archetype residual filed
  honestly. Gates: peoplecheck §PURPOSE +21 (952/952), homebodydrive +2 live
  legs (119/119 — clean ledgers, on-screen ripen), queuecheck 99, contract
  724, lint+build green; hand-mutant (night clause `if (false && …)`) killed
  by exactly the two named gates (925/2). Prod-verified: marker `THE GARDEN
  RIPENS` in live chunk `index-DVF0sEHr.js`; live URL commented, closed
  shipped. QA polish pass filed #2705 (6 tails: ripeness tell, hamper,
  occupied-window, tally pips, moonlit wait, attract beat).

## Claims / board
- TARGET #2692 REFUSED (b live, shipped it himself: #2698 DUCK & PASS +
  steered #2702). Ladder after: steer/next empty (#1711 wait-state stands —
  nightly ran 15:59Z clean, store dry, evidence posted on #1711, NOT claimed);
  game-queue empty; feedback = QA's (#2688 live lane, #2690 shipped by QA
  #2693 mid-shift); flagship stage spent (4 flagships × 0 open gaps);
  never-dry weakestStage said NONE — HONEST re-derivation disagreed:
  Homebody's unowned gap was hidden by README wording, PickRush skip
  (QA inside #2694). Filed #2695 + why-weakest, claimed, shipped.
- Warden comment on #2692 said "builder a idle, kicked a session" — true:
  slot a's launchd job had fired late; this shift answered it.

## Next queued
- Re-derive at main: `node scripts/idle-kick.mjs` (NEVER trust this line).
  Homebody's surviving game-code gap: **rooms with a personality** (own
  README bullet). #1711 unchanged wait-state (jonq #2652, deadline Nov 20).
- Rescue worktree `retrogames-forge-homebody-rooms-b` (`rescue/homebody-2699`)
  is redundant — original shipped; noted on #2695 for the warden to prune.

## Open questions (issues, not here — #605)
- #2652 (jonq, platform, AWAITING by Jon, deadline Nov 20 01:36Z) — phone
  clap take vs waiver for #1711 line 3; default keeps waiting.

## Catches for the next session (each cost probes this shift)
- **idle-kick NONE can be a lie** — it only scans `s.wings`-held dirs AND
  README wording: an incidental `closed by #NNNN` INSIDE a live gap bullet
  strips the whole bullet (parseGaps filter is case-insensitive `CLOSED by
  #\d+`). Check honest weakest by hand when the whole shelf claims dryness.
- **Vercel HTML can serve a stale entry-hash ~30+ min** — poll assets, but
  when the marker is missing, PROBE ONCE whether the dep-array (61 chunks,
  `__vite__mapDeps`, NOT plain `assets/` regex-visible… it is, but the HTML
  itself can cache the ENTRY name) is the stale part; scanning the CURRENT
  entry's deps is the truth. My first 25 min of polling was the entry name
  still cached; deps were already shipped (marker found first try in deps).
- **README Verify-line gate counts merge-conflict between lanes** — every
  Homebody PR edits the same `npm run peoplecheck # NNN gates:` line. Expect
  one conflict per ship; resolve arithmetically and re-count.
- **Drive legs that fast-forward the clock must rewind** (`__homebodyTest.hour(h0)`,
  #2672 idiom) — my purpose leg's +2h jump froze the later bond leg until the
  rewind went in.
- **State on wing records + mixes inside the wings loop** = zero-hash-drift
  for unbuilt lots, the cheapest determinism insurance there is.

## RULE 4
Game code merged this session (#2699, src/games/Homebody/), rule 4 intact;
STATE.md committed to main per rule-step-9 exception.

## Lanes clean
- Main checkout detached at origin/main; :5173 dev server stopped at close;
  other lanes' ports untouched.
- Worktree `retrogames-forge-homebody-rooms` removed after merge + prune
  (orphan `node_modules` dir cleared bottom-up before remove).
