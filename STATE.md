# STATE — session 283 (2026-11-15, slot b)

## Playable now / what shipped
- **TEN-DEEP shows roaming monsters before they fight (#2315 → PR #2319, merge
  `dfd8e97`, LIVE at /retrogames/ten-deep).** A pack now stands in the torchlight
  ahead — size it, engage or back off — like Wizardry (Apple II 1981), which always
  drew groups in the first-person view. Before, every ambush hid in "honest darkness";
  the shared WebGL renderer even shipped a monster atlas TEN-DEEP never fed.
  - **One honest source of truth**: `view.js · sightedMobs(st)` (+ `forwardMonster`)
    — pure, deterministic, no RNG, no browser — reused by the GL billboards, the
    wireframe painter, the harness probe and the Node gate. Sighted = within torch
    (`SIGHT=6`), in FRONT of the facing, and clear LOS (`losClear` mirrors
    `dungeon.core.js viewCells`; nothing through a wall). GL feeds the built-in atlas
    (8 rat / 9 skeleton / 10 goblin) sized by pack count, swaying on a presentation-only
    clock; wireframe paints a tinted two-red-eye glyph on the forward column. Automap
    stays clean (Wizardry never drew monsters on paper).
  - **Fidelity without weakening the proof**: the SIM is untouched — ambushes stay
    hidden trigger-tiles, the solver still never dodges, so every campaign proof, the
    slack rule and determinism ride UNCHANGED. Only presentation changed.
  - Gates: tendeepcheck **9603/9603** (+2: synthetic sight law — ahead sighted,
    behind/beyond-range/behind-wall/sprung refused, nearest-first, forwardMonster vs
    off-axis; + independent no-wall-hacks cross-check on all 10 seeded deeps);
    **4 view.js mutants die** → 9671/9671 under `--mutate`. tendeeppplay **90/90**
    (+1 GL gate: monster lights the centre before spring — range 1 = 71.8 vs empty
    hall 16.8; wireframe branch too). lint tendeep/mario/fps/ai + eslint + build green.
    Prod verified: `index-DrwfbVlW.js` carries the bestiary tints.
- Rule 4: game code shipped. QA polish pass filed: **#2321**.

## Ladder (this session's path)
- No halt/steer; `next` #1711 PLAICRAFT = Jon-side only; game-queue EMPTY; feedback
  #2313/#2314 are QA-held (`building-qa`); QA MASTER live → no borrow. Flagship stage
  spent (SSX/Emberwood/COMET/Myst gaps all owned). **Never-dry rung**: `weakestStage`
  → TEN-DEEP score 3 (oldest registry title with unowned gaps; ArenaArchery excluded —
  #2314 just named it → ambiguity owned). Took README gap 0, filed #2315, claimed, shipped.

## BOARD at exit
- game-queue: EMPTY.
- building (other lanes): **#2318** — POLISH TEN-DEEP corridor monsters — slot a's
  parallel never-dry pick of the SAME gap, mid-build (`building`, `mobview.js`). Left
  UNTOUCHED (their claim); posted a factual cross-ref on #2318: main already carries the
  feature via #2319 (only `view.js` on main — no duplicate module yet) — rebase & reconcile.
- building-qa: **#2321** (mine — QA lane grabbed it straight away), **#2314** (ArenaArchery).
  feedback: none left claimable by builders.
- jonq open: **#2305** (lane:platform, AWAITING — not ours to wait on).
- #1711 `next` — Jon-side remainder unchanged. #2313 (Dogfight QA) closed via #2317;
  Dogfight polish + ASI dials shipped on main (#2317/#2320) by another lane. No halt/steer.

## Next (slot a or b, in order)
1. If #2318 (slot a) is still open, do NOT re-file the corridor-monster gap — it is
   on main (#2319). Any TEN-DEEP work should build on view.js, not fork it.
2. Else ladder as before; expect never-dry again. Weakest candidates (score 3, oldest
   registry first, minus held): PRINCE OF PERSIA, GARDEN GUARD, VIPER PIT, BRITANNIA,
   FLOOR BOSS, SHORT ORDER SHOUT, GRAVEL YARD, TALK ME DOWN, BOMB DEFUSE, …
3. If a jonq answer lands for #2305 (write key), execute the #2093 relabel one-off
   (slot-b lane); a clap-test take on the store means grade it + post to #1711/#2156.

## The session's catches
- **Closed-form contracts don't prove what a renderer can't show.** The GL sprite
  pipeline culls by RANGE + a forward-plane dot, NOT walls — so honesty is the CALLER's
  job. sightedMobs must LOS-gate itself or billboards float through stone.
- **One source of truth pays off across four consumers.** A pure `sightedMobs` used by
  GL + wireframe + probe + Node check meant the tendeeppplay pixel gate, the Node
  cross-check and the shipping behaviour could never disagree.
- **Two lanes, one gap.** Slot a and slot b both hit TEN-DEEP corridor-monsters on the
  same never-dry tick (the claim is per-issue, so nothing stopped the second file).
  Faster lane ships; slower lane must reconcile. Cross-link early (comment, not claim).
- **A crooked test corridor fails an honest LOS check.** My first off-axis case used an
  L-shaped stub whose diagonal genuinely crosses a wall — the gate was right, my
  expectation was wrong. Make synthetic-LOS fixtures straight.

## Hygiene at exit
- Dev server :5178 stopped (mine only; never touched other lanes' ports).
- Slot-b worktree removed after merge (branch gone via squash); main checkout at
  origin/main. STATE committed to main (game merged — rule 9) + statepark slot b.
